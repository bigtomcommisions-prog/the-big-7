import { randomBytes, randomInt } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type WebSocket } from 'ws';
import { z } from 'zod';
import type { FastifyBaseLogger } from 'fastify';
import { GAME_IDS, createGame, type Game, type Seat } from '@bigtomdev/cards';
import type { Config } from '../config.ts';
import { KeyedLimiter, TokenBucket } from '../realtime/rateLimit.ts';

// Cardhouse tables: play money only. Tables live in memory, so a restart ends them.
const START_CHIPS = 1000;
const TURN_MS = 30_000;
const NEXT_HAND_MS = 4_000;
const DROP_SEAT_MS = 2 * 60_000;
const MAX_TABLES = 500;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I or O

const Name = z.string().trim().min(1).max(16).regex(/^[\p{L}\p{N} _.'-]+$/u, 'Use letters, numbers and spaces.');
const ActionSchema = z.union([
  z.object({ type: z.enum(['fold', 'check', 'call', 'hit', 'stand', 'double', 'split', 'play']) }),
  z.object({ type: z.literal('raise'), to: z.number().int().positive() }),
  z.object({ type: z.literal('bet'), amount: z.number().int().positive() }),
  z.object({ type: z.literal('draw'), discard: z.array(z.number().int().min(0).max(8)).max(5) }),
]);
const MessageSchema = z.discriminatedUnion('t', [
  z.object({ t: z.literal('create'), game: z.enum(GAME_IDS), name: Name }),
  z.object({ t: z.literal('join'), code: z.string().regex(/^[A-Z]{5}$/), name: Name.optional(), token: z.string().max(64).optional() }),
  z.object({ t: z.literal('act'), action: ActionSchema }),
  z.object({ t: z.enum(['back', 'topup', 'leave']) }),
]);

interface TableSeat extends Seat {
  token: string;
  ws: WebSocket | null;
  away: boolean;
  leaving: boolean;
  lastSeen: number;
}

function send(ws: WebSocket | null, msg: object) {
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

class Table {
  seats: TableSeat[] = [];
  hand = 0;
  private dealt = new Set<string>();
  private deadline = 0;
  private pendingKey = '';
  private turnTimer?: NodeJS.Timeout;
  private nextTimer?: NodeJS.Timeout;

  constructor(readonly code: string, readonly game: Game) {}

  inHand(s: TableSeat) {
    return this.game.inHand && this.dealt.has(s.id);
  }

  /** Call after every change: restarts timers, deals the next hand, tells everyone. */
  sync() {
    const { game } = this;
    if (game.inHand) {
      const key = `${this.hand}|${game.pending().join()}`;
      if (key !== this.pendingKey) {
        this.pendingKey = key;
        clearTimeout(this.turnTimer);
        this.deadline = Date.now() + TURN_MS;
        this.turnTimer = setTimeout(() => this.timeout(), TURN_MS);
      }
    } else {
      clearTimeout(this.turnTimer);
      this.deadline = 0;
      this.pendingKey = '';
      this.seats = this.seats.filter((s) => !s.leaving);
      if (!this.nextTimer && this.eligible().length >= game.minPlayers) {
        this.nextTimer = setTimeout(() => {
          this.nextTimer = undefined;
          this.startHand();
        }, this.hand ? NEXT_HAND_MS : 300);
      }
    }
    for (const s of this.seats) send(s.ws, this.state(s));
  }

  private eligible() {
    return this.seats.filter((s) => s.ws && !s.away && !s.leaving && s.chips >= this.game.minChips).slice(0, this.game.maxPlayers);
  }

  private startHand() {
    const players = this.eligible();
    if (this.game.inHand || players.length < this.game.minPlayers) return this.sync();
    this.hand++;
    this.dealt = new Set(players.map((s) => s.id));
    this.game.start(players);
    this.sync();
  }

  /** Whoever the table is waiting on sits out from the next hand and gets the safe move. */
  private timeout() {
    for (const id of this.game.pending()) {
      if (!this.game.pending().includes(id)) continue;
      const s = this.seats.find((x) => x.id === id);
      if (s) s.away = true;
      this.game.auto(id);
    }
    this.sync();
  }

  leave(s: TableSeat) {
    s.leaving = s.away = true;
    s.ws = null;
    if (this.game.pending().includes(s.id)) this.game.auto(s.id);
    if (!this.inHand(s)) this.seats = this.seats.filter((x) => x !== s);
    this.sync();
  }

  /** Drops long-disconnected seats between hands. Returns false once the table is empty. */
  sweep(now: number) {
    this.seats = this.seats.filter((s) => s.ws || now - s.lastSeen < DROP_SEAT_MS || this.inHand(s));
    if (this.seats.length) return true;
    clearTimeout(this.turnTimer);
    clearTimeout(this.nextTimer);
    return false;
  }

  private state(s: TableSeat) {
    const v = this.game.view(s.id);
    const shown = new Set(v.players.map((p) => p.id));
    const byId = new Map(this.seats.map((x) => [x.id, x]));
    const players = [
      ...v.players.map((p) => ({ ...p, status: p.status || (byId.get(p.id)?.ws ? '' : 'Offline') })),
      ...this.seats
        .filter((x) => !shown.has(x.id))
        .map((x) => ({ id: x.id, name: x.name, chips: x.chips, bet: 0, cards: [], turn: false, status: !x.ws ? 'Offline' : x.away ? 'Sitting out' : 'Next hand' })),
    ];
    return {
      t: 'state',
      code: this.code,
      game: this.game.id,
      you: s.id,
      hand: this.hand,
      remainingMs: this.deadline ? Math.max(0, this.deadline - Date.now()) : 0,
      away: s.away,
      canTopUp: !this.inHand(s) && s.chips < START_CHIPS,
      view: { ...v, players },
    };
  }
}

interface Session {
  table?: Table;
  seat?: TableSeat;
  bucket: TokenBucket;
}

/** WebSocket endpoint at /cards. No login: a random seat token lets a player rejoin. */
export class CardServer {
  private wss = new WebSocketServer({ noServer: true, maxPayload: 2 * 1024 });
  private tables = new Map<string, Table>();
  private creates = new KeyedLimiter(10, 10 * 60_000);
  private sweeper: NodeJS.Timeout;

  constructor(private d: { config: Config; log: FastifyBaseLogger }) {
    this.sweeper = setInterval(() => {
      const now = Date.now();
      for (const [code, t] of this.tables) if (!t.sweep(now)) this.tables.delete(code);
    }, 30_000);
    this.sweeper.unref();
  }

  handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer) {
    const origin = req.headers.origin ?? '';
    const ok = origin === new URL(this.d.config.APP_ORIGIN).origin || (!this.d.config.isProd && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin));
    if (!ok) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      return socket.destroy();
    }
    const ip = String(req.headers['cf-connecting-ip'] ?? req.socket.remoteAddress ?? '');
    this.wss.handleUpgrade(req, socket, head, (ws) => this.onConnection(ws, ip));
  }

  private onConnection(ws: WebSocket, ip: string) {
    const session: Session = { bucket: new TokenBucket(20, 10_000) };
    ws.on('message', (data) => {
      if (!session.bucket.take()) return send(ws, { t: 'error', message: 'Slow down a little.' });
      let parsed;
      try {
        parsed = MessageSchema.safeParse(JSON.parse(data.toString()));
      } catch {
        return ws.close(1003, 'bad message');
      }
      if (!parsed.success) return send(ws, { t: 'error', message: parsed.error.issues[0]?.message ?? 'Invalid message.' });
      try {
        this.onMessage(ws, session, parsed.data, ip);
      } catch (err) {
        this.d.log.error({ err }, 'Cardhouse message failed');
        send(ws, { t: 'error', message: 'Something went wrong.' });
      }
    });
    ws.on('close', () => {
      const { table, seat } = session;
      if (!table || !seat || seat.ws !== ws) return;
      seat.ws = null;
      seat.lastSeen = Date.now();
      table.sync();
    });
  }

  private onMessage(ws: WebSocket, session: Session, m: z.infer<typeof MessageSchema>, ip: string) {
    const { table, seat } = session;
    const err = (message: string) => send(ws, { t: 'error', message });

    if (m.t === 'create' || m.t === 'join') {
      const same = m.t === 'join' && table?.code === m.code && seat?.token === m.token;
      if (table && seat && !same) table.leave(seat);
      let t: Table | undefined;
      if (m.t === 'create') {
        if (this.tables.size >= MAX_TABLES || !this.creates.take(ip)) return err('Too many tables right now. Try again soon.');
        let code;
        do code = Array.from({ length: 5 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join('');
        while (this.tables.has(code));
        t = new Table(code, createGame(m.game));
        this.tables.set(code, t);
      } else {
        t = this.tables.get(m.code);
        if (!t) return err('No table with that code. It may have closed.');
      }
      let s = m.t === 'join' && m.token ? t.seats.find((x) => x.token === m.token) : undefined;
      if (s) {
        if (s.ws && s.ws !== ws) s.ws.close(4000, 'Opened somewhere else');
        s.ws = ws;
        s.leaving = false;
      } else {
        if (!m.name) return err('Pick a nickname first.');
        if (t.seats.length >= t.game.maxPlayers) return err('That table is full.');
        s = { id: randomBytes(6).toString('base64url'), token: randomBytes(18).toString('base64url'), name: m.name, chips: START_CHIPS, ws, away: false, leaving: false, lastSeen: Date.now() };
        t.seats.push(s);
      }
      session.table = t;
      session.seat = s;
      send(ws, { t: 'joined', code: t.code, token: s.token });
      return t.sync();
    }

    if (!table || !seat) return err('Join a table first.');
    seat.lastSeen = Date.now();
    switch (m.t) {
      case 'act': {
        const e = table.game.act(seat.id, m.action);
        if (e) return err(e);
        seat.away = false;
        break;
      }
      case 'back':
        seat.away = false;
        break;
      case 'topup':
        if (table.inHand(seat)) return err('Top up between hands.');
        seat.chips = Math.max(seat.chips, START_CHIPS);
        break;
      case 'leave':
        session.table = session.seat = undefined;
        return table.leave(seat);
    }
    table.sync();
  }

  close() {
    clearInterval(this.sweeper);
    for (const ws of this.wss.clients) ws.close(1001, 'Server restarting');
  }
}

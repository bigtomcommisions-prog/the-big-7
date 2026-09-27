import type { WebSocket } from 'ws';
import {
  ANIM_INDEX, NET, WORLD, isInsideHouse,
  type Appearance, type HouseLayout, type ChatMessage, type NpcMap, type PlayerInfo, type PlayerUpdate, type ServerMessage, type VoiceFlags,
} from '@hearthvale/shared';

export interface Connection {
  ws: WebSocket;
  info: PlayerInfo;
  /** Channels this player may view (for delivering messages). */
  viewable: Set<string>;
  /** Other players this client currently knows about. */
  known: Set<string>;
  lastMoveAt: number;
  moved: boolean;
  /** Voice channel whose gazebo this player is standing in, if any. */
  plaza: string | null;
  /** Text channel whose house this player is inside, if any. */
  house: string | null;
}

function send(ws: WebSocket, msg: ServerMessage) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * All connected players in one guild's world.
 *
 * Interest management: a uniform spatial hash; each tick every client receives only players
 * within NET.VIEW_RADIUS (adds / removes / compact position updates), so bandwidth scales with
 * local density rather than server size.
 */
export class GuildRoom {
  readonly players = new Map<string, Connection>();
  private timer: NodeJS.Timeout;
  worldRadius = 200;
  plazas: { channelId: string; x: number; z: number; radius: number }[] = [];
  houses: HouseLayout[] = [];
  onPlazaChange: (c: Connection, prev: string | null, next: string | null) => void = () => {};
  /** The player entered or left a house or gazebo. */
  onZoneChange: (c: Connection) => void = () => {};

  constructor(readonly guildId: string, private onEmpty: (room: GuildRoom) => void) {
    this.timer = setInterval(() => this.tick(), 1000 / NET.SERVER_TICK_HZ);
  }

  get size() {
    return this.players.size;
  }

  add(conn: Connection) {
    const prev = this.players.get(conn.info.id);
    if (prev) {
      // Same user opened a second tab: the newest connection wins.
      send(prev.ws, { t: 'error', code: 'replaced', message: 'You joined this world from another tab.' });
      prev.ws.close(4001, 'replaced');
      // Delete directly (not via remove) so the room isn't disposed as momentarily empty.
      this.players.delete(conn.info.id);
    }
    this.players.set(conn.info.id, conn);
  }

  remove(id: string, ws?: WebSocket) {
    const conn = this.players.get(id);
    if (!conn || (ws && conn.ws !== ws)) return;
    this.players.delete(id);
    // Clients that knew about this player get a remove on the next tick via their `known` diff.
    if (this.players.size === 0) {
      clearInterval(this.timer);
      this.onEmpty(this);
    }
  }

  /**
   * Accept a client's position with a plausibility check. Movement is client-predicted; the
   * server clamps anything faster than running speed (plus slack for jitter) and corrects.
   */
  move(id: string, x: number, y: number, z: number, ry: number, a: PlayerInfo['a']) {
    const c = this.players.get(id);
    if (!c) return;
    const now = Date.now();
    const dt = Math.min(1, (now - c.lastMoveAt) / 1000);
    c.lastMoveAt = now;
    const maxStep = WORLD.RUN_SPEED * dt * 1.6 + 1.2;
    let dx = x - c.info.x;
    let dz = z - c.info.z;
    const dist = Math.hypot(dx, dz);
    let corrected = false;
    if (dist > maxStep) {
      dx = (dx / dist) * maxStep;
      dz = (dz / dist) * maxStep;
      corrected = true;
    }
    let nx = c.info.x + dx;
    let nz = c.info.z + dz;
    const r = Math.hypot(nx, nz);
    if (r > this.worldRadius) {
      nx = (nx / r) * this.worldRadius;
      nz = (nz / r) * this.worldRadius;
      corrected = true;
    }
    c.info.x = nx;
    c.info.z = nz;
    c.info.y = Math.max(-1, Math.min(40, y));
    c.info.ry = ry;
    c.info.a = a;
    c.moved = true;
    const prevPlaza = c.plaza;
    const plaza = this.plazas.find((p) => Math.hypot(nx - p.x, nz - p.z) < p.radius)?.channelId ?? null;
    if (plaza !== c.plaza) {
      const prev = c.plaza;
      c.plaza = plaza;
      this.onPlazaChange(c, prev, plaza);
    }
    const house = this.houses.find((h) => Math.hypot(nx - h.x, nz - h.z) < Math.max(h.w, h.d) && isInsideHouse(h, nx, nz, 0.2))?.channelId ?? null;
    if (house !== c.house || plaza !== prevPlaza) {
      c.house = house;
      this.onZoneChange(c);
    }
    if (corrected) send(c.ws, { t: 'correct', x: nx, y: c.info.y, z: nz });
  }

  setAppearance(id: string, appearance: Appearance) {
    const c = this.players.get(id);
    if (!c) return;
    c.info.appearance = appearance;
    this.broadcastMeta(c, { t: 'playerMeta', id, appearance });
  }

  setVoice(id: string, voice: VoiceFlags) {
    const c = this.players.get(id);
    if (!c) return;
    c.info.voice = voice;
    this.broadcastMeta(c, { t: 'playerMeta', id, voice });
  }

  /** Send to the player and everyone who can currently see them. */
  private broadcastMeta(c: Connection, msg: ServerMessage) {
    send(c.ws, msg);
    for (const other of this.players.values()) {
      if (other !== c && other.known.has(c.info.id)) send(other.ws, msg);
    }
  }

  /** Deliver a Discord message to everyone in this world allowed to see its channel. */
  deliverMessage(message: ChatMessage) {
    for (const c of this.players.values()) {
      if (c.viewable.has(message.channelId)) send(c.ws, { t: 'message', message });
    }
  }

  deliverDelete(channelId: string, id: string) {
    for (const c of this.players.values()) {
      if (c.viewable.has(channelId)) send(c.ws, { t: 'messageDelete', channelId, id });
    }
  }

  broadcast(build: (c: Connection) => ServerMessage | null) {
    for (const c of this.players.values()) {
      const msg = build(c);
      if (msg) send(c.ws, msg);
    }
  }

  sendTo(id: string, msg: ServerMessage) {
    const c = this.players.get(id);
    if (c) send(c.ws, msg);
  }

  /** Filter NPC map to channels the player may view, excluding people who are actually online. */
  npcsFor(c: Connection, all: NpcMap): NpcMap {
    const out: NpcMap = {};
    for (const [channelId, users] of Object.entries(all)) {
      if (!c.viewable.has(channelId)) continue;
      const idle = users.filter((u) => !this.players.has(u.id));
      if (idle.length) out[channelId] = idle;
    }
    return out;
  }

  private tick() {
    if (this.players.size === 0) return;
    const cell = NET.CELL_SIZE;
    const grid = new Map<string, Connection[]>();
    for (const c of this.players.values()) {
      const k = `${Math.floor(c.info.x / cell)},${Math.floor(c.info.z / cell)}`;
      let list = grid.get(k);
      if (!list) grid.set(k, (list = []));
      list.push(c);
    }
    const reach = Math.ceil(NET.VIEW_RADIUS / cell);
    const r2 = NET.VIEW_RADIUS * NET.VIEW_RADIUS;

    for (const me of this.players.values()) {
      const cx = Math.floor(me.info.x / cell);
      const cz = Math.floor(me.info.z / cell);
      const visible = new Set<string>();
      const add: PlayerInfo[] = [];
      const upd: PlayerUpdate[] = [];
      for (let gx = cx - reach; gx <= cx + reach; gx++) {
        for (let gz = cz - reach; gz <= cz + reach; gz++) {
          const list = grid.get(`${gx},${gz}`);
          if (!list) continue;
          for (const other of list) {
            if (other === me) continue;
            const dx = other.info.x - me.info.x;
            const dz = other.info.z - me.info.z;
            if (dx * dx + dz * dz > r2) continue;
            visible.add(other.info.id);
            if (!me.known.has(other.info.id)) add.push(other.info);
            else if (other.moved) {
              const i = other.info;
              upd.push([i.id, round(i.x), round(i.y), round(i.z), round(i.ry), ANIM_INDEX[i.a]]);
            }
          }
        }
      }
      const remove: string[] = [];
      for (const id of me.known) if (!visible.has(id)) remove.push(id);
      me.known = visible;
      if (add.length || remove.length || upd.length) send(me.ws, { t: 'snapshot', add, remove, upd });
    }
    for (const c of this.players.values()) c.moved = false;
  }

  dispose() {
    clearInterval(this.timer);
  }
}

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import type { FastifyBaseLogger } from 'fastify';
import type { Config } from '../config.ts';
import { CardServer } from './cardServer.ts';

const ORIGIN = 'http://localhost:5176';

type Msg = { t: string; [k: string]: any };

/** A test client that queues every message so tests can wait for the next matching one. */
function client(url: string, origin = ORIGIN) {
  const ws = new WebSocket(url, { headers: { origin } });
  const inbox: Msg[] = [];
  let wake = () => {};
  ws.on('message', (d) => {
    inbox.push(JSON.parse(d.toString()));
    wake();
  });
  const opened = new Promise<void>((res, rej) => {
    ws.once('open', () => res());
    ws.once('error', rej);
  });
  return {
    ws,
    opened,
    send: (m: object) => ws.send(JSON.stringify(m)),
    async next(pred: (m: Msg) => boolean, ms = 3000): Promise<Msg> {
      const end = Date.now() + ms;
      for (;;) {
        const i = inbox.findIndex(pred);
        if (i >= 0) return inbox.splice(0, i + 1).pop()!;
        if (Date.now() > end) throw new Error('timed out waiting for message');
        await new Promise<void>((r) => {
          wake = r;
          setTimeout(r, 50);
        });
      }
    },
  };
}

test('two players, a hold’em hand, and a rejoin mid-hand', async () => {
  const cards = new CardServer({ config: { APP_ORIGIN: ORIGIN, isProd: true } as Config, log: console as unknown as FastifyBaseLogger });
  const http = createServer();
  http.on('upgrade', (req, socket, head) => cards.handleUpgrade(req, socket, head));
  await new Promise<void>((r) => http.listen(0, '127.0.0.1', r));
  const url = `ws://127.0.0.1:${(http.address() as AddressInfo).port}/cards`;

  try {
    const evil = client(url, 'https://evil.example');
    await assert.rejects(evil.opened, 'other origins are refused');

    const a = client(url);
    await a.opened;
    a.send({ t: 'create', game: 'holdem', name: 'Ana' });
    const { code, token: tokenA } = await a.next((m) => m.t === 'joined');
    assert.match(code, /^[A-Z]{5}$/);

    const b = client(url);
    await b.opened;
    b.send({ t: 'join', code, name: 'Bob' });
    await b.next((m) => m.t === 'joined');

    const s = await a.next((m) => m.t === 'state' && m.hand === 1);
    const me = s.view.players.find((p: any) => p.id === s.you);
    const them = s.view.players.find((p: any) => p.id !== s.you);
    assert.equal(me.cards.length, 2);
    assert.deepEqual(them.cards, ['??', '??'], 'opponent cards never reach the client');
    assert.ok(s.remainingMs > 25_000);

    // Ana drops and comes back with her seat token: same seat, same cards.
    a.ws.close();
    const a2 = client(url);
    await a2.opened;
    a2.send({ t: 'join', code, token: tokenA });
    const s2 = await a2.next((m) => m.t === 'state' && m.hand === 1);
    assert.equal(s2.you, s.you);
    assert.deepEqual(s2.view.mine, s.view.mine);

    // Heads-up: the button (first seat) acts first and folds.
    const actor = s2.view.options.fold ? a2 : b;
    actor.send({ t: 'act', action: { type: 'fold' } });
    const done = await a2.next((m) => m.t === 'state' && m.view.phase === 'Hand over');
    assert.equal(done.view.players.reduce((n: number, p: any) => n + p.chips, 0), 2000);

    a2.send({ t: 'act', action: { type: 'raise', to: 'lots' } });
    assert.equal((await a2.next((m) => m.t === 'error')).t, 'error');
    b.ws.close();
    a2.ws.close();
  } finally {
    cards.close();
    http.close();
  }
});

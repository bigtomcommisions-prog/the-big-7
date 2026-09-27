import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { WebSocket } from 'ws';
import { DEFAULT_APPEARANCE, NET, type ServerMessage } from '@hearthvale/shared';
import { GuildRoom, type Connection } from './guildRoom.ts';
import { TokenBucket } from './rateLimit.ts';
import { createTokenCipher } from '../auth/crypto.ts';

function fakeWs() {
  const sent: ServerMessage[] = [];
  const ws = {
    OPEN: 1,
    readyState: 1,
    send: (s: string) => sent.push(JSON.parse(s) as ServerMessage),
    close: () => undefined,
  } as unknown as WebSocket;
  return { ws, sent };
}

function conn(id: string, x: number, z: number, viewable: string[] = []) {
  const { ws, sent } = fakeWs();
  const c: Connection = {
    ws,
    info: { id, name: id, avatar: null, appearance: DEFAULT_APPEARANCE, voice: { muted: true, deafened: false, connected: false }, x, y: 0, z, ry: 0, a: 'idle' },
    viewable: new Set(viewable),
    known: new Set(),
    lastMoveAt: Date.now(),
    moved: true,
    plaza: null,
    house: null,
  };
  return { c, sent };
}

const tick = (room: GuildRoom) => (room as unknown as { tick(): void }).tick();

test('players only receive nearby players (interest management)', () => {
  const room = new GuildRoom('g', () => undefined);
  const a = conn('a', 0, 0);
  const b = conn('b', 10, 0);
  const far = conn('far', NET.VIEW_RADIUS + 50, 0);
  room.add(a.c);
  room.add(b.c);
  room.add(far.c);
  tick(room);
  const snapA = a.sent.find((m) => m.t === 'snapshot');
  assert.ok(snapA && snapA.t === 'snapshot');
  assert.deepEqual(snapA.add.map((p) => p.id).sort(), ['b']);
  const snapFar = far.sent.find((m) => m.t === 'snapshot');
  assert.equal(snapFar, undefined, 'far player should get nothing');
  room.dispose();
});

test('movement produces compact updates and teleports are clamped', () => {
  const room = new GuildRoom('g', () => undefined);
  const a = conn('a', 0, 0);
  const b = conn('b', 5, 0);
  room.add(a.c);
  room.add(b.c);
  tick(room);
  a.sent.length = 0;
  // Small legitimate step → update
  b.c.lastMoveAt = Date.now() - 500;
  room.move('b', 7, 0, 0, 1, 'walk');
  tick(room);
  const upd = a.sent.find((m) => m.t === 'snapshot');
  assert.ok(upd && upd.t === 'snapshot' && upd.upd.length === 1 && upd.upd[0]![0] === 'b');
  // Teleport far away → server clamps speed and corrects the client instead
  a.sent.length = 0;
  b.sent.length = 0;
  b.c.lastMoveAt = Date.now() - 100;
  room.move('b', 500, 0, 0, 1, 'run');
  assert.ok(b.c.info.x < 20, `server should clamp teleport, got x=${b.c.info.x}`);
  assert.ok(b.sent.some((m) => m.t === 'correct'), 'client should be told to correct its position');
  room.dispose();
});

test('messages only go to players who can view the channel', () => {
  const room = new GuildRoom('g', () => undefined);
  const a = conn('a', 0, 0, ['111111']);
  const b = conn('b', 0, 0, []);
  room.add(a.c);
  room.add(b.c);
  room.deliverMessage({
    id: 'm1', channelId: '111111', author: { id: 'x', name: 'x', avatar: null }, content: 'hi', createdAt: 0,
    fromWorld: false, attachments: 0, mentions: { users: {}, channels: {}, roles: {} },
  });
  assert.ok(a.sent.some((m) => m.t === 'message'));
  assert.ok(!b.sent.some((m) => m.t === 'message'));
  room.dispose();
});

test('a second tab replaces the first without disposing the room', () => {
  let emptied = false;
  const room = new GuildRoom('g', () => (emptied = true));
  room.add(conn('a', 0, 0).c);
  room.add(conn('a', 0, 0).c);
  assert.equal(room.size, 1);
  assert.equal(emptied, false);
  room.dispose();
});

test('token bucket limits bursts', () => {
  const b = new TokenBucket(3, 10_000);
  assert.deepEqual([b.take(), b.take(), b.take(), b.take()], [true, true, true, false]);
});

test('token cipher round-trips and detects tampering', () => {
  const c = createTokenCipher('x'.repeat(40));
  const enc = c.encrypt('secret-token');
  assert.equal(c.decrypt(enc), 'secret-token');
  const parts = enc.split('.');
  parts[2] = Buffer.from('tampered').toString('base64url');
  assert.throws(() => c.decrypt(parts.join('.')));
});

test('entering and leaving a house or gazebo is detected (for voice permissions)', (t) => {
  const room = new GuildRoom('g', () => undefined);
  t.after(() => room.dispose());
  room.houses = [{ channelId: 'text1', townKey: 't', name: 'general', kind: 'text', active: true, topic: null, x: 20, z: 0, ry: 0, w: 8, d: 6 } as GuildRoom['houses'][number]];
  room.plazas = [{ channelId: 'vc1', x: -20, z: 0, radius: 5 }];
  const a = conn('a', 12, 0);
  room.add(a.c);
  const zones: (string | null)[] = [];
  // Pretend each step happens a second apart so the anti-teleport clamp doesn't shorten it.
  const step = (x: number) => {
    a.c.lastMoveAt = Date.now() - 1000;
    room.move('a', x, 0, 0, 0, 'walk');
  };
  room.onZoneChange = (c) => zones.push(c.house ?? c.plaza);
  step(14); // still outside
  step(16);
  step(19); // inside the house
  step(20); // still inside: no event
  step(25); // out the side
  assert.deepEqual(zones, ['text1', null]);
  step(8);
  step(0);
  step(-7);
  step(-12);
  step(-17); // into the gazebo
  step(-10); // out again
  assert.deepEqual(zones, ['text1', null, 'vc1', null]);
});

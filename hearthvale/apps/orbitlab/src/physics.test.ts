import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS, body, centreOfMass, merge, step } from './physics.ts';

const momentum = (bs: ReturnType<typeof body>[]) => bs.reduce((p, b) => [p[0]! + b.m * b.vx, p[1]! + b.m * b.vy], [0, 0]);

test('merging keeps mass and momentum', () => {
  const bs = merge([body(0, 0, 1, 0, 10, 'a'), body(1, 0, -2, 3, 5, 'b')]);
  assert.equal(bs.length, 1);
  assert.equal(bs[0]!.m, 15);
  assert.equal(bs[0]!.color, 'a', 'the heavier body keeps its colour');
  assert.ok(Math.abs(bs[0]!.vx * 15 - 0) < 1e-9 && Math.abs(bs[0]!.vy * 15 - 15) < 1e-9);
});

test('a circular orbit stays circular', () => {
  let bs = PRESETS[4]!.make();
  bs.push(body(100, 0, 0, Math.sqrt(2000 / 100), 0.01, 'p'));
  for (let i = 0; i < 4000; i++) bs = step(bs, 0.05);
  const p = bs[1]!;
  const d = Math.hypot(p.x - bs[0]!.x, p.y - bs[0]!.y);
  assert.ok(Math.abs(d - 100) < 3, `radius drifted to ${d.toFixed(1)}`);
});

test('every preset conserves momentum and the figure eight stays bound', () => {
  for (const preset of PRESETS) {
    let bs = preset.make();
    const before = momentum(bs);
    for (let i = 0; i < 800; i++) bs = step(bs, 0.05);
    const after = momentum(bs);
    assert.ok(Math.hypot(after[0]! - before[0]!, after[1]! - before[1]!) < 1e-6 * (1 + Math.hypot(...before)), preset.name);
  }
  let galaxy = PRESETS[3]!.make();
  for (let i = 0; i < 300; i++) galaxy = step(galaxy, 0.05);
  assert.ok(galaxy.length > 150, `galaxy dust clumped: ${galaxy.length} left`);
  let eight = PRESETS[2]!.make();
  for (let i = 0; i < 6000; i++) eight = step(eight, 0.05);
  const c = centreOfMass(eight);
  assert.equal(eight.length, 3);
  assert.ok(eight.every((b) => Math.hypot(b.x - c.x, b.y - c.y) < 200));
});

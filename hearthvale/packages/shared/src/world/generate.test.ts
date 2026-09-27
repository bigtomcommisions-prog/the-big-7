import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld, townCapacity } from './generate.ts';
import type { BuildingInput, TownInput } from './layout.ts';

function town(key: string, slot: number, n: number): TownInput {
  const buildings: BuildingInput[] = Array.from({ length: n }, (_, i) => ({
    channelId: `${key}${1000 + i}`,
    name: `chan-${i}`,
    kind: i === n - 1 ? 'voice' : 'text',
    slot: i,
    active: true,
  }));
  return { key, name: key, slot, buildings, capacity: townCapacity(n - 1, n) };
}

const input = (extra = 0) => ({
  guildId: '123456789012345678',
  guildName: 'Test',
  towns: [town('100', 0, 5), town('200', 1, 14 + extra), town('300', 2, 3), town('uncategorized', 3, 2)],
});

test('generation is deterministic', () => {
  assert.deepEqual(generateWorld(input()), generateWorld(input()));
});

test('houses never overlap each other', () => {
  const w = generateWorld(input());
  for (let i = 0; i < w.houses.length; i++) {
    for (let j = i + 1; j < w.houses.length; j++) {
      const a = w.houses[i]!;
      const b = w.houses[j]!;
      const minGap = (Math.hypot(a.w, a.d) + Math.hypot(b.w, b.d)) / 2 - 3;
      assert.ok(Math.hypot(a.x - b.x, a.z - b.z) > minGap, `${a.name} overlaps ${b.name}`);
    }
  }
});

test('towns do not overlap', () => {
  const w = generateWorld(input());
  for (let i = 0; i < w.towns.length; i++) {
    for (let j = i + 1; j < w.towns.length; j++) {
      const a = w.towns[i]!;
      const b = w.towns[j]!;
      assert.ok(Math.hypot(a.x - b.x, a.z - b.z) > a.radius + b.radius);
    }
  }
});

test('adding a channel does not move existing houses', () => {
  const before = generateWorld(input());
  const after = generateWorld(input(1));
  for (const h of before.houses) {
    const same = after.houses.find((x) => x.channelId === h.channelId)!;
    assert.equal(same.x, h.x);
    assert.equal(same.z, h.z);
  }
});

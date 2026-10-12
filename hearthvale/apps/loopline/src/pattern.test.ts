import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS, decode, encode } from './pattern.ts';

test('every preset survives a share link round trip', () => {
  for (const p of PRESETS) {
    const pat = p.make();
    assert.deepEqual(decode(encode(pat)), pat, p.name);
  }
});

test('malformed or out-of-range links are rejected', () => {
  const good = encode(PRESETS[0]!.make());
  assert.ok(decode(good));
  for (const bad of ['', 'v2' + good.slice(2), good.replace('.124.', '.999.'), good + 'x', good.slice(0, -1), '<script>']) assert.equal(decode(bad), null, bad);
});

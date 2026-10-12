import { test } from 'node:test';
import assert from 'node:assert/strict';
import { colorToHex, fill, hexToColor, line, newDoc, rect, validDoc } from './doc.ts';

test('lines include both ends and every cell between', () => {
  assert.deepEqual(line(0, 0, 3, 0), [[0, 0], [1, 0], [2, 0], [3, 0]]);
  assert.deepEqual(line(2, 2, 0, 0), [[2, 2], [1, 1], [0, 0]]);
  assert.equal(line(0, 0, 7, 3).length, 8);
  assert.equal(new Set(rect(0, 0, 3, 2).map(String)).size, 10, 'a 4×3 outline has 10 cells');
});

test('fill stays inside a closed outline', () => {
  const w = 5;
  const px = Array(25).fill(0);
  for (const [x, y] of rect(0, 0, 4, 4)) px[y * w + x] = 1;
  fill(px, w, 5, 2, 2, 7);
  assert.equal(px.filter((c) => c === 7).length, 9);
  assert.equal(px.filter((c) => c === 1).length, 16);
  fill(px, w, 5, 2, 2, 7); // same colour: no-op
  assert.equal(px.filter((c) => c === 7).length, 9);
});

test('colours and stored documents', () => {
  assert.equal(colorToHex(hexToColor('#ff77a8')), '#ff77a8');
  assert.equal(hexToColor('#000000'), 0xff, 'black is opaque, not transparent');
  assert.ok(validDoc(newDoc(16)));
  assert.equal(validDoc({ w: 16, h: 16, frames: [[1, 2]], fps: 8 }), null);
  assert.equal(validDoc({ w: 17, h: 16, frames: [Array(272).fill(0)], fps: 8 }), null);
  assert.equal(validDoc('nope'), null);
});

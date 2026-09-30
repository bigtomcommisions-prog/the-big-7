import { test } from 'node:test';
import assert from 'node:assert/strict';
import { best, handName, handName3, newDeck, score3, score5, shuffle } from './cards.ts';

const h = (s: string) => s.split(' ');

test('deck and shuffle', () => {
  const d = shuffle(newDeck(6));
  assert.equal(d.length, 312);
  assert.equal(new Set(newDeck()).size, 52);
});

test('every five-card category, in order', () => {
  const hands = [
    '2c 5d 9h Js Kc', // high card
    '2c 2d 9h Js Kc', // pair
    '2c 2d 9h 9s Kc', // two pair
    '2c 2d 2h 9s Kc', // trips
    'Ac 2d 3h 4s 5c', // wheel
    '9c Td Jh Qs Kc', // straight
    '2c 5c 9c Jc Kc', // flush
    '2c 2d 2h 9s 9c', // full house
    '2c 2d 2h 2s 9c', // quads
    '9c Tc Jc Qc Kc', // straight flush
  ].map((x) => score5(h(x)));
  for (let i = 1; i < hands.length; i++) assert.ok(hands[i]! > hands[i - 1]!, `hand ${i}`);
  assert.equal(handName(hands[4]!), 'Straight');
  assert.equal(handName(hands[9]!), 'Straight flush');
});

test('kickers and ties', () => {
  assert.ok(score5(h('Ac Ad Kh 7s 2c')) > score5(h('As Ah Qh Js Tc')));
  assert.ok(score5(h('9c 9d 4h 4s Ac')) > score5(h('9h 9s 4c 4d Kc')));
  assert.equal(score5(h('2c 5d 9h Js Kc')), score5(h('2d 5h 9s Jc Kd')));
  assert.ok(score5(h('Ac 2d 3h 4s 5c')) < score5(h('2c 3d 4h 5s 6c')), 'the wheel is the lowest straight');
});

test('best five of seven and nine', () => {
  assert.equal(handName(best(h('Ah Kh 2c 3d Qh Jh Th'))), 'Straight flush');
  assert.equal(handName(best(h('2c 2d 2h 9s 9c 4d 7h'))), 'Full house');
  assert.equal(handName(best(h('2c 3c 4c 5c 7d 8h 9s Jd Ac'))), 'Straight flush');
});

test('three-card ranking: straight beats flush, A-2-3 is low', () => {
  const s = ['2c 5d 9h', '2c 2d 9h', '2c 5c 9c', '2c 3d 4h', '2c 2d 2h', '2c 3c 4c'].map((x) => score3(h(x)));
  for (let i = 1; i < s.length; i++) assert.ok(s[i]! > s[i - 1]!, `hand ${i}`);
  assert.ok(score3(h('Ac 2d 3h')) < score3(h('2c 3d 4h')));
  assert.ok(score3(h('Qc Kd Ah')) > score3(h('Jc Qd Kh')));
  assert.equal(handName3(score3(h('Ac 2d 3h'))), 'Straight');
});

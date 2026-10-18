// The salary the person typed against a form's brackets. A bracket is picked only when it holds
// the whole figure (or the whole range) and no other bracket does.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { amountRange, pickSalary } from '../src/schema/salary.js';

const pick = (options, stored) => {
  const i = pickSalary(options, stored);
  return i === -1 ? null : options[i];
};

const TALEEZ = [
  '30 000 à 35 000 € brut annuel',
  '35 000 à 40 000 € brut annuel',
  '40 000 à 45 000 € brut annuel',
  '45 000 à 50 000 € brut annuel',
  '50 000 à 55 000 € brut annuel',
];
const K = ['Choisir…', 'Moins de 30k€', '30-40k€', '40-50k€', '50-60k€', 'Plus de 60k€'];

test('amounts and ranges are read the way people write them', () => {
  assert.deepEqual(amountRange('45 000 €'), [45000, 45000]);
  assert.deepEqual(amountRange('45k€'), [45000, 45000]);
  assert.deepEqual(amountRange('45 K€ brut annuel'), [45000, 45000]);
  assert.deepEqual(amountRange('42-44k'), [42000, 44000]);
  assert.deepEqual(amountRange('42 000 à 44 000 €'), [42000, 44000]);
  assert.deepEqual(amountRange('40 000 à 45 000 € brut annuel'), [40000, 45000]);
  assert.equal(amountRange('Selon profil'), null);
  const below = amountRange('Moins de 30k€');
  assert.ok(below[0] === 0 && below[1] < 30000);
  assert.equal(amountRange('Plus de 60k€')[1], Infinity);
});

test('the one bracket that holds the figure', () => {
  assert.equal(pick(TALEEZ, '42 000 €'), '40 000 à 45 000 € brut annuel');
  assert.equal(pick(TALEEZ, '42-44k'), '40 000 à 45 000 € brut annuel');
  assert.equal(pick(K, '55k'), '50-60k€');
  assert.equal(pick(K, '70 000 €'), 'Plus de 60k€');
});

test('an edge, a range across brackets, a monthly figure or words: nothing', () => {
  assert.equal(pick(TALEEZ, '45 000 €'), null, 'in "40 à 45" and "45 à 50"');
  assert.equal(pick(TALEEZ, '43-47k'), null, 'spans two brackets');
  assert.equal(pick(TALEEZ, '3 500 € par mois'), null, 'monthly against annual brackets');
  assert.equal(pick(TALEEZ, 'Selon profil'), null);
  assert.equal(pick(['Oui', 'Non'], '45k'), null);
});

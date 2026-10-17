// Years of experience against a form's own brackets: "1 à 3 ans", "Plus de 10 ans", "8 ans
// d'expérience". Picked only when exactly one bracket holds the CV's total. Options go in raw:
// the "+" and "-" of a bracket are what normalisation would drop.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickYears, yearsRange } from '../src/schema/years.js';

const pick = (options, years) => {
  const i = pickYears(options, years);
  return i === -1 ? null : options[i];
};

const FR = ['Choisir…', "Moins d'1 an", '1 à 3 ans', '3 à 5 ans', '5 à 10 ans', 'Plus de 10 ans'];
const TALEEZ = [
  'Aucune expérience',
  "1 an d'expérience",
  "2 ans d'expérience",
  "8 ans d'expérience",
  "+ de 10 ans d'expérience",
];
const EN = ['Select', 'Less than 1 year', '1-2 years', '3-5 years', '6-10 years', '10+ years'];

test('brackets are read as ranges of years', () => {
  assert.deepEqual(yearsRange('1 à 3 ans'), [1, 3]);
  assert.deepEqual(yearsRange('Entre 2 et 5 ans'), [2, 5]);
  assert.deepEqual(yearsRange("8 ans d'expérience"), [8, 8]);
  assert.deepEqual(yearsRange('Aucune expérience'), [0, 0]);
  assert.equal(yearsRange('Choisir…'), null);
  assert.equal(yearsRange('Bac +5'), null);
  const below = yearsRange("Moins d'1 an");
  assert.ok(below[0] === 0 && below[1] < 1);
  const above = yearsRange('Plus de 10 ans');
  assert.ok(above[0] > 10 && above[1] === Infinity);
  assert.deepEqual(yearsRange('10+ years'), [10, Infinity]);
});

test('the one bracket that holds the total', () => {
  assert.equal(pick(FR, '8'), '5 à 10 ans');
  assert.equal(pick(FR, '0'), "Moins d'1 an");
  assert.equal(pick(FR, '12'), 'Plus de 10 ans');
  assert.equal(pick(TALEEZ, '8'), "8 ans d'expérience");
  assert.equal(pick(TALEEZ, '11'), "+ de 10 ans d'expérience");
  assert.equal(pick(EN, '4'), '3-5 years');
  assert.equal(pick(EN, '12'), '10+ years');
});

test('a total on a shared edge, a gap, or a list that is not brackets: nothing, with one edge case', () => {
  assert.equal(pick(FR, '3'), null, '3 is in "1 à 3" and "3 à 5"');
  assert.equal(pick(FR, '10'), '5 à 10 ans', '"plus de 10" means more than ten');
  assert.equal(pick(TALEEZ, '5'), null, 'no bracket for 5');
  assert.equal(pick(['Oui', 'Non'], '8'), null);
  assert.equal(pick(['Bac', 'Bac +2', 'Bac +5'], '5'), null);
  assert.equal(pick(FR, ''), null);
  assert.equal(pick(FR, 'huit'), null);
});

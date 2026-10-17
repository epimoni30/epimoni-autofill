// The highest degree on the CV against a form's education levels, written as French "bac +N"
// levels or as degree names in any of the five languages. Picked only when one option matches.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { degreeLevel, highestDegree, pickDegree } from '../src/schema/degrees.js';

const pick = (options, degree) => {
  const i = pickDegree(options, degree);
  return i === -1 ? null : options[i];
};

const TALEEZ = [
  'Aucun diplôme',
  'BEP, CAP ou équivalent',
  'Baccalauréat (bac +0)',
  "DUT, BTS, Diplôme d'état ou équivalent (bac +2)",
  'Licence, Bachelor ou équivalent (bac +3)',
  'Master 1 ou équivalent (bac +4)',
  "Master, Diplôme d'ingénieur ou équivalent (bac +5)",
  'Doctorat et équivalent (> bac +5)',
];
const SHORT = ['Choisir…', 'Bac', 'Bac+2', 'Bac+3', 'Bac+5', 'Bac+8'];
const EN = ['Select', 'High school', "Associate's degree", "Bachelor's degree", "Master's degree", 'PhD'];

test('levels are read from bac +N or from the degree name', () => {
  assert.equal(degreeLevel('Master Marketing digital'), 5);
  assert.equal(degreeLevel('Master 1 ou équivalent (bac +4)'), 4, 'the stated level wins over the name');
  assert.equal(degreeLevel('DUT Information-communication'), 2);
  assert.equal(degreeLevel('Licence professionnelle'), 3);
  assert.equal(degreeLevel("Diplôme d'ingénieur"), 5);
  assert.equal(degreeLevel('PhD in Physics'), 8);
  assert.equal(degreeLevel('Doctorat et équivalent (> bac +5)'), 8);
  assert.equal(degreeLevel('Bac+2'), 2);
  assert.equal(degreeLevel('Marketing digital'), null);
});

test('the highest degree of the CV is the one that counts', () => {
  assert.equal(
    highestDegree(['DUT Information-communication', 'Master Marketing digital']),
    'Master Marketing digital',
  );
  assert.equal(highestDegree(['Marketing', '']), null);
});

test('the one option at that level', () => {
  assert.equal(
    pick(TALEEZ, 'Master Marketing digital'),
    "Master, Diplôme d'ingénieur ou équivalent (bac +5)",
  );
  assert.equal(pick(TALEEZ, 'BTS Commerce'), "DUT, BTS, Diplôme d'état ou équivalent (bac +2)");
  assert.equal(pick(SHORT, 'Licence Droit'), 'Bac+3');
  assert.equal(pick(EN, 'Master Marketing digital'), "Master's degree");
  assert.equal(pick(EN, 'Licence'), "Bachelor's degree");
});

test('no level, no scale, or no option at that level: nothing', () => {
  assert.equal(pick(TALEEZ, 'Marketing digital'), null);
  assert.equal(pick(SHORT, 'Master 1'), null, 'no bac+4 in that list');
  assert.equal(pick(['Oui', 'Non'], 'Master'), null);
  assert.equal(pick(['Junior', 'Senior', 'Master'], 'Master'), null, 'one level name is not a scale');
});

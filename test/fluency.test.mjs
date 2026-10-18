// The language-level scale: a CV's level against a form's own words for it.
//
// The cases that matter most are the refusals. A language level is a claim an interview
// checks, so a list the level fits twice is left for the person.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize } from '../src/content/dom.js';
import { fluencyLevel, pickByLevel } from '../src/schema/fluency.js';

const pick = (options, wanted) => {
  const i = pickByLevel(options.map(normalize), normalize(wanted));
  return i === -1 ? null : options[i];
};

const FR = ['Sélectionnez', 'Débutant', 'Intermédiaire', 'Courant', 'Langue maternelle'];
const CEFR = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const LINKEDIN = [
  'Elementary proficiency',
  'Limited working proficiency',
  'Professional working proficiency',
  'Full professional proficiency',
  'Native or bilingual proficiency',
];

test('codes and words land on one scale', () => {
  assert.deepEqual(fluencyLevel(normalize('C1')), [5, 5]);
  assert.deepEqual(fluencyLevel(normalize('Courant (C1)')), [5, 5]);
  assert.deepEqual(fluencyLevel(normalize('B2/C1')), [4, 5]);
  assert.deepEqual(fluencyLevel(normalize('Langue maternelle')), [7, 7]);
  assert.deepEqual(fluencyLevel(normalize('Pre-intermediate')), [2, 2]);
  assert.deepEqual(fluencyLevel(normalize('Średniozaawansowany')), [3, 4]);
  assert.equal(fluencyLevel(normalize('Sélectionnez')), null);
  assert.equal(fluencyLevel(normalize('Bon niveau')), null);
});

test('a CEFR code answers a French list in words, and words answer a list of codes', () => {
  assert.equal(pick(FR, 'C1'), 'Courant');
  assert.equal(pick(FR, 'B1'), 'Intermédiaire');
  assert.equal(pick(FR, 'A2'), 'Débutant');
  assert.equal(pick(FR, 'Natif'), 'Langue maternelle');
  assert.equal(pick(['', 'Básico', 'Intermedio', 'Avanzado', 'Nativo'], 'C1'), 'Avanzado');
  assert.equal(pick(LINKEDIN, 'Natif'), 'Native or bilingual proficiency');
  assert.equal(pick(LINKEDIN, 'Débutant'), 'Elementary proficiency');
});

test('a level that fits two options is left for the person', () => {
  // C1 is inside both Avancé (B2-C1) and Courant (C1-C2).
  assert.equal(pick(['Notions', 'Intermédiaire', 'Avancé', 'Courant', 'Bilingue'], 'C1'), null);
  // "Courant" is C1-C2, which is two codes.
  assert.equal(pick(CEFR, 'Courant'), null);
  // Bilingual straddles Courant and a first language without sitting in either.
  assert.equal(pick(FR, 'Bilingue'), null);
  // But a level that sits whole inside one of the options it touches takes that one.
  assert.equal(pick(['Avancé', 'Courant', 'Bilingue'], 'Courant'), 'Courant');
});

test('a list that is not a level scale is never read as one', () => {
  assert.equal(pick(['Oui', 'Non'], 'C1'), null);
  assert.equal(pick(['Paris', 'Nantes', 'Natif'], 'Natif'), null);
  assert.equal(pick(FR, ''), null);
  assert.equal(pick(FR, 'Très bon niveau'), null);
});

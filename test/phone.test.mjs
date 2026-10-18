// A phone field that shows its own country code ("+33 ▾" beside the input) wants the national
// number: the code is already there, and "+33 6 12 34 56 78" typed beside it can reach the
// employer as "+33 +33 6…". What the person stored is kept whole everywhere else.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dialOf, forDialCode, isDialList, pickDial } from '../src/schema/phone.js';

test('the national number, in the shape the field shows', () => {
  assert.deepEqual(forDialCode('+33 6 12 34 56 78', '33', '06 12 34 56 78'), { value: '06 12 34 56 78' });
  assert.deepEqual(forDialCode('+33612345678', '33', '06 12 34 56 78'), { value: '0612345678' });
  assert.deepEqual(forDialCode('+33 6 12 34 56 78', '33', ''), { value: '6 12 34 56 78' });
  assert.deepEqual(forDialCode('0033 6 12 34 56 78', '33', '06 12 34 56 78'), { value: '06 12 34 56 78' });
  assert.deepEqual(forDialCode('+34 612 345 678', '34', '612 34 56 78'), { value: '612 345 678' });
});

test('a number already national goes in as it is', () => {
  assert.deepEqual(forDialCode('06 12 34 56 78', '33', '06 12 34 56 78'), { value: '06 12 34 56 78' });
});

test("another country's number is offered, never written beside the wrong code", () => {
  assert.deepEqual(forDialCode('+44 7700 900123', '33', '06 12 34 56 78'), { suggest: '+44 7700 900123' });
  assert.deepEqual(forDialCode('+1 415 555 0100', '33', ''), { suggest: '+1 415 555 0100' });
});

const CODES = [
  'Sélectionnez une option',
  'Belgique (+32)',
  'Canada (+1)',
  'États-Unis (+1)',
  'France (+33)',
  'Polynésie française (+689)',
];

test('a list of country codes is read as one', () => {
  assert.equal(dialOf('France (+33)'), '33');
  assert.equal(dialOf('+44 Royaume-Uni'), '44');
  assert.equal(dialOf('France'), null);
  assert.ok(isDialList(CODES));
  assert.ok(!isDialList(['France', 'Belgique', 'Suisse', 'Canada', 'Espagne']));
});

test("the stored number's own code picks the option", () => {
  assert.equal(pickDial(CODES, '+33 6 12 34 56 78'), 4);
  assert.equal(pickDial(CODES, '0033612345678'), 4);
  assert.equal(pickDial(CODES, '+689 87 12 34 56'), 5);
  // A national number says nothing: the country decides.
  assert.equal(pickDial(CODES, '06 12 34 56 78'), null);
  assert.equal(pickDial(CODES, '+44 7700 900123'), -1);
});

test('"+1" is picked only when the country says which', () => {
  assert.equal(pickDial(CODES, '+1 415 555 0100'), -1);
  assert.equal(
    pickDial(CODES, '+1 415 555 0100', (texts) => texts.findIndex((t) => t.startsWith('Canada'))),
    2,
  );
});

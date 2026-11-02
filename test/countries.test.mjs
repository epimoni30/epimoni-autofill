// SPDX-License-Identifier: Apache-2.0
// A work authorisation answer goes only into a question about a country it covers.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalize } from '../src/content/dom.js';
import { countriesIn, workRightCovers } from '../src/schema/countries.js';

const covers = (question, answer, residence) => workRightCovers(normalize(question), answer, residence);

test('an EU answer holds across the EU and EEA, and nowhere else', () => {
  const eu = 'Oui, ressortissant UE';
  assert.ok(covers('Êtes-vous autorisé(e) à travailler en France ?', eu));
  assert.ok(covers('Are you legally authorised to work in Germany?', eu));
  assert.ok(covers('Do you have the right to work in Switzerland?', eu));
  assert.ok(covers('Are you authorized to work in the European Union?', eu));
  assert.ok(!covers('Are you legally authorized to work in the United States?', eu));
  assert.ok(!covers('Are you authorised to work in the UK?', eu));
  assert.ok(!covers('¿Tiene permiso de trabajo en México?', eu));
});

test('a nationality covers its own country, and the EU when it is an EU one', () => {
  assert.ok(covers('Autorizado a trabalhar no Brasil?', 'Sim, cidadão brasileiro'));
  assert.ok(!covers('Autorizado a trabalhar em Portugal?', 'Sim, eu sou cidadão brasileiro'));
  assert.ok(covers('Are you authorized to work in Spain?', 'Yes, French citizen'));
  assert.ok(covers('Are you authorized to work in the US?', 'Yes, US citizen'));
  assert.ok(!covers('Are you authorized to work in the European Union?', 'Yes, US citizen'));
});

test('an answer that names no place means where the person lives', () => {
  assert.ok(covers('Are you authorized to work in France?', 'Oui', 'France'));
  assert.ok(covers('Are you authorized to work in Italy?', 'Yes', 'France'));
  assert.ok(!covers('Are you authorized to work in Canada?', 'Yes', 'France'));
  // Nowhere to go on: no answer rather than a guess.
  assert.ok(!covers('Are you authorized to work in France?', 'Oui', ''));
});

test('a question that names no country takes the answer; one about an unnamed place does not', () => {
  assert.ok(covers('Avez-vous une autorisation de travail ?', 'Oui, ressortissant UE'));
  assert.ok(!covers('Are you authorized to work in the country listed?', 'Oui, ressortissant UE'));
  assert.ok(!covers('Êtes-vous autorisé à travailler dans le pays du poste ?', 'Oui, ressortissant UE'));
});

test('ordinary words are not countries', () => {
  assert.deepEqual(countriesIn(normalize('Can you tell us if you are authorised to work?')), []);
  assert.deepEqual(countriesIn(normalize('Eu sou desenvolvedor')), []);
});

// Found 2026-10-17: a place the table doesn't list made the question read as naming none, so
// it was answered through the country the person lives in. "Do you have the right to work in
// Hong Kong?" got "Oui" from a French citizen. A question that says where, and names nothing
// we know, is now left alone; one that says nowhere is still answered.
test('a place the table does not know is still a place', () => {
  const eu = 'Oui, ressortissant UE';
  for (const q of [
    'Do you have the right to work in Hong Kong?',
    'Are you legally authorized to work in Kazakhstan?',
    'Are you legally authorized to work in the country where this job is located?',
    'Êtes-vous autorisé(e) à travailler au Kazakhstan ?',
    '¿Tiene permiso para trabajar en Hong Kong?',
    'Você tem autorização para trabalhar em Hong Kong?',
    'Czy masz prawo do pracy w Hongkongu?',
  ])
    assert.ok(!covers(q, eu, 'France'), q);
  for (const q of [
    'Are you legally authorized to work?',
    'Do you have a valid work permit?',
    'Êtes-vous autorisé(e) à travailler ?',
    'Avez-vous un permis de travail valide ?',
  ])
    assert.ok(covers(q, eu, 'France'), q);
});

test('Italian: a country named in Italian is checked, and an unknown one is not answered', () => {
  const q = (text) => normalize(text);
  assert.equal(workRightCovers(q('Sei autorizzato a lavorare in Italia?'), 'Sì, cittadino UE'), true);
  assert.equal(workRightCovers(q('Sei autorizzato a lavorare in Germania?'), 'Sì, cittadino italiano'), true);
  assert.equal(
    workRightCovers(q('Sei autorizzato a lavorare negli Stati Uniti?'), 'Sì, cittadino italiano'),
    false,
  );
  assert.equal(workRightCovers(q('Sei autorizzato a lavorare in Svizzera?'), 'Sì, Unione europea'), true);
  // Hong Kong is not in the table: the question says where, so it is not answered.
  assert.equal(workRightCovers(q('Sei autorizzato a lavorare a Hong Kong?'), 'Sì', 'Italia'), false);
  assert.equal(workRightCovers(q('Sei autorizzato a lavorare in questo paese?'), 'Sì', 'Italia'), false);
  assert.deepEqual(
    countriesIn(q('Regno Unito, Giappone, Brasile')).map((c) => c.code),
    ['GB', 'BR', 'JP'],
  );
});

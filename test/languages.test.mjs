// "Do you speak fluent French?": a yes/no question the CV can answer, and the ways it must
// refuse to. It only ever says yes; a "no" is left for the person, because a missed field costs
// a click and a wrong "no" can cost the application.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize } from '../src/content/dom.js';
import { createResolver } from '../src/content/resolve.js';
import { AUTOCOMPLETE, PACKS } from '../src/lexicon/index.js';
import { languagesNamed, speaksAnswer, yesIndex, yesWord } from '../src/schema/languages.js';

const resolver = createResolver({ lexicons: PACKS, autocomplete: AUTOCOMPLETE });
const keyOf = (label, tag = 'radiogroup') => {
  const d = resolver.resolve({
    autocomplete: '',
    type: tag === 'radiogroup' ? 'radio' : 'text',
    tag,
    maxLength: null,
    sources: [{ kind: 'label', text: normalize(label), weight: 0.95 }],
  });
  return d.action === 'fill' ? d.key : `${d.action}:${d.reason}`;
};

const CV = [
  { language: 'Français', fluency: 'Langue maternelle' },
  { language: 'Anglais', fluency: 'C1' },
  { language: 'Espagnol', fluency: 'A2' },
  { language: 'Allemand', fluency: '' },
].map((r) => ({ language: normalize(r.language), fluency: normalize(r.fluency) }));
const ask = (q) => speaksAnswer(normalize(q), CV);

test('the question is recognised, in every interface language', () => {
  for (const q of [
    'Do you speak fluent French?',
    'Are you fluent in English?',
    'Parlez-vous couramment anglais ?',
    '¿Habla usted francés?',
    'Você fala inglês fluentemente?',
    'Czy mówisz płynnie po angielsku?',
  ])
    assert.equal(keyOf(q), 'speaks_language', q);
  // "Which languages do you speak?" asks for a list, which the languages key answers.
  assert.equal(keyOf('What languages do you speak? Please list them', 'textarea'), 'languages');
  assert.equal(keyOf('Quelles langues parlez-vous ?', 'textarea'), 'languages');
});

test('languages are named in any of the five interface languages', () => {
  assert.deepEqual(languagesNamed(normalize('Do you speak fluent French and English?')), ['fr', 'en']);
  assert.deepEqual(languagesNamed(normalize('Parlez-vous anglais ?')), ['en']);
  assert.deepEqual(languagesNamed(normalize('Czy mówisz po angielsku?')), ['en']);
  assert.deepEqual(languagesNamed(normalize('Do you speak the language of the country?')), []);
});

test('yes, when the CV holds the language at the level asked', () => {
  assert.equal(ask('Do you speak fluent French?'), true);
  assert.equal(ask('Are you fluent in English?'), true);
  assert.equal(ask('Parlez-vous couramment anglais ?'), true);
  assert.equal(ask('Do you speak French and English?'), true);
  assert.equal(ask('Do you speak Spanish?'), null, 'A2 is not speaking it');
});

test('never a no, and nothing on what the CV cannot back', () => {
  assert.equal(ask('Do you speak fluent Spanish?'), null);
  assert.equal(ask('Do you speak German?'), null, 'a language with no level states nothing');
  assert.equal(ask('Do you speak Italian?'), null, 'absent from the CV is not a no');
  assert.equal(ask('Do you speak fluent French and Spanish?'), null, 'every language named must hold');
  assert.equal(ask('Do you speak the local language?'), null);
  assert.equal(speaksAnswer(normalize('Do you speak French?'), []), null);
});

test('the yes option, and only an unambiguous one', () => {
  assert.equal(yesIndex(['', 'Yes', 'No'].map(normalize)), 1);
  assert.equal(yesIndex(['Oui', 'Non'].map(normalize)), 0);
  assert.equal(yesIndex(['Sí', 'No'].map(normalize)), 0);
  assert.equal(yesIndex(['Yes, fluently', 'Yes, basic', 'No'].map(normalize)), -1);
  assert.equal(yesIndex(['Courant', 'Débutant'].map(normalize)), -1);
  assert.equal(yesWord(normalize('Do you speak French?')), 'yes');
  assert.equal(yesWord(normalize('Parlez-vous anglais ?')), 'oui');
  assert.equal(yesWord(normalize('Czy mówisz po angielsku?')), 'tak');
});

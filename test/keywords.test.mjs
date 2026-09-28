// The free skills line: what counts as a mention. Whole words only, short acronyms with their
// case, accents and case otherwise ignored only as far as the regex engine's `i` goes.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mentions, skillTerms, termPattern } from '../src/content/keywords.js';

test('the CV gives its skills, their keywords, languages and certificates, once each', () => {
  const terms = skillTerms({
    skills: [{ name: 'SEO', keywords: 'Google Ads, SEA; seo' }, { name: 'Figma' }],
    languages: [{ language: 'Anglais' }],
    certificates: [{ name: 'PMP' }],
  });
  assert.deepEqual(terms, ['SEO', 'Google Ads', 'SEA', 'Figma', 'Anglais', 'PMP']);
  assert.deepEqual(skillTerms({ skills: [{ name: 'C' }, { name: '' }] }), []);
});

test('a term is a whole word: "Java" is not in "JavaScript", "SEO" is not in "seoul"', () => {
  const text = 'Stack JavaScript, bureau à Seoul, anglais courant, gestion de projet agile.';
  const { found, missing } = mentions(['Java', 'JavaScript', 'SEO', 'Anglais', 'Gestion de projet'], text);
  assert.deepEqual(found, ['JavaScript', 'Anglais', 'Gestion de projet']);
  assert.deepEqual(missing, ['Java', 'SEO']);
});

test('a short term keeps its case, so an acronym does not match an ordinary word', () => {
  assert.equal(termPattern('Go').test('Let us go to the office'), false);
  assert.equal(termPattern('Go').test('Backend en Go et Rust'), true);
  assert.equal(termPattern('SQL').test('Maîtrise de SQL'), true);
  assert.equal(termPattern('Figma').test('maquettes sous figma'), true);
});

test('punctuation in a skill is literal, and spacing is flexible', () => {
  assert.equal(termPattern('C++').test('Développeur C++ senior'), true);
  assert.equal(termPattern('Node.js').test('API en Node.js'), true);
  assert.equal(termPattern('Node.js').test('API en Nodexjs'), false);
  assert.equal(termPattern('Gestion de projet').test('gestion  de\nprojet'), true);
});

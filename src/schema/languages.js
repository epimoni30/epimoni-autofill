// SPDX-License-Identifier: Apache-2.0
// "Do you speak fluent French?": which languages a question names, and whether the CV backs
// a yes.
//
// The answer is only ever yes. A CV that lists French at C1 backs "yes" to "Do you speak
// fluent French?"; a CV that doesn't list Italian says nothing about Italian, and a level the
// person never wrote down says nothing either. So the result is `true` or `null`, never
// `false`: a missed question costs one click, a wrong "no" can end an application.
//
// Texts arrive normalised (lowercase, no accents, no punctuation), the form the language
// packs use. Each language lists its names in the six interface languages, plus the Polish
// "po angielsku" forms, separated by `|`. Adding a language is one line.

import { fluencyLevel } from './fluency.js';

const LANGUAGES = [
  ['fr', 'francais|french|frances|francesa|franca|francuski|francusku|francuskim|francese'],
  ['en', 'anglais|english|ingles|inglesa|angielski|angielsku|angielskim|inglese'],
  ['es', 'espagnol|spanish|espanol|castellano|espanhol|hiszpanski|hiszpansku|hiszpanskim|spagnolo'],
  ['de', 'allemand|german|aleman|alemao|deutsch|niemiecki|niemiecku|niemieckim|tedesco'],
  ['it', 'italien|italian|italiano|wloski|wlosku|wloskim'],
  ['pt', 'portugais|portuguese|portugues|portugalski|portugalsku|portugalskim|portoghese'],
  ['nl', 'neerlandais|dutch|neerlandes|holandes|nederlands|niderlandzki|niderlandzku|olandese'],
  ['pl', 'polonais|polish|polaco|polones|polski|polsku|polskim|polacco'],
  ['ar', 'arabe|arabic|arabski|arabsku|arabo'],
  ['zh', 'chinois|chinese|mandarin|chino|chines|chinski|chinsku|cinese'],
  ['ja', 'japonais|japanese|japones|japonski|japonsku|giapponese'],
  ['ru', 'russe|russian|ruso|russo|rosyjski|rosyjsku'],
].map(([code, names]) => [code, names.split('|')]);

// A question that asks for fluency needs C1 (5 on the scale in fluency.js); one that asks
// whether someone speaks the language at all, B1 (3), the level at which a person holds an
// ordinary conversation.
const FLUENT = [
  'fluent',
  'fluently',
  'fluency',
  'courant',
  'couramment',
  'bilingue',
  'bilingual',
  'native',
  'natif',
  'fluide',
  'fluido',
  'fluida',
  'fluidez',
  'fluente',
  'fluentemente',
  'biegle',
  'biegly',
  'plynnie',
  'madrelingua',
];
const NEED_FLUENT = 5;
const NEED_SPOKEN = 3;

const has = (text, word) => ` ${text} `.includes(` ${word} `);

/** The languages a normalised text names, as codes, in the order they appear. */
export function languagesNamed(text) {
  const t = String(text || '');
  const found = [];
  for (const [code, names] of LANGUAGES) {
    let at = -1;
    for (const n of names) {
      const i = ` ${t} `.indexOf(` ${n} `);
      if (i !== -1 && (at === -1 || i < at)) at = i;
    }
    if (at !== -1) found.push([at, code]);
  }
  return found.sort((a, b) => a[0] - b[0]).map(([, code]) => code);
}

/**
 * `true` when the CV backs a yes to this question, `null` otherwise. `rows` are the CV's
 * language entries, `{language, fluency}` (`toEntries(cv).languages`), normalised like the
 * question.
 */
export function speaksAnswer(question, rows, { fluentOnly = false } = {}) {
  const asked = languagesNamed(question);
  if (!asked.length) return null;
  // `fluentOnly` is for a list we can't read before answering: at a fluent level every "yes"
  // it might hold ("Yes", "Yes, fluently") is true.
  const need = fluentOnly || FLUENT.some((w) => has(question, w)) ? NEED_FLUENT : NEED_SPOKEN;
  const held = new Map();
  for (const row of rows || []) {
    const [code] = languagesNamed(row?.language);
    const level = fluencyLevel(row?.fluency);
    if (code && level) held.set(code, Math.max(held.get(code) || 0, level[0]));
  }
  return asked.every((code) => (held.get(code) || 0) >= need) ? true : null;
}

const YES = ['yes', 'oui', 'si', 'sim', 'tak'];

/** The one option that is a plain yes, as an index into normalised `texts`, or -1. */
export function yesIndex(texts) {
  const hits = texts
    .map((t, i) => (YES.some((y) => t === y || t.startsWith(`${y} `)) ? i : -1))
    .filter((i) => i !== -1);
  return hits.length === 1 ? hits[0] : -1;
}

// For a dropdown whose options only exist once it is opened: the yes word in the language the
// question is written in, or null when that can't be told.
const ASKED_IN = [
  ['yes', ['do you', 'are you', 'can you', 'you speak']],
  ['oui', ['vous', 'parles tu', 'es tu']],
  ['si', ['habla', 'hablas', 'usted', 'parli', 'conosci']],
  ['sim', ['voce', 'fala']],
  ['tak', ['czy', 'mowisz', 'mowi']],
];

/** The yes word for a normalised question, or null. */
export function yesWord(question) {
  const hit = ASKED_IN.find(([, marks]) => marks.some((m) => has(question, m)));
  return hit ? hit[0] : null;
}

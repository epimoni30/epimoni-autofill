// SPDX-License-Identifier: Apache-2.0
// Language levels on one scale, so a CV that says "C1" can answer a form that offers
// "Débutant / Intermédiaire / Courant / Bilingue", and one that says "Courant" can answer a
// list of CEFR codes.
//
// The scale is the CEFR (Common European Framework of Reference for Languages), with a
// seventh step for a first language: A1 1, A2 2, B1 3, B2 4, C1 5, C2 6, native 7. A level
// written in words is a range on it, because the words are looser than the codes: "Courant"
// is C1 or C2, "Intermédiaire" B1 or B2.
//
// The rule that keeps this safe: an option is picked only when it is the *only* one the
// person's level fits. "C1" against a list holding both "Avancé" and "Courant" fits both, and
// a stated language level is the kind of answer an interview checks, so that list is left
// for the person to choose. Texts arrive normalised (lowercase, no accents, no punctuation).

const WORDS = [
  // LinkedIn's scale, longest first so "native or bilingual proficiency" is not read as
  // "bilingual" alone, and "limited working proficiency" not as "working".
  ['native or bilingual proficiency', 6, 7],
  ['full professional proficiency', 5, 6],
  ['professional working proficiency', 4, 5],
  ['limited working proficiency', 2, 3],
  ['elementary proficiency', 1, 2],
  // A first language.
  ['langue maternelle', 7, 7],
  ['mother tongue', 7, 7],
  ['native speaker', 7, 7],
  ['lengua materna', 7, 7],
  ['lingua materna', 7, 7],
  ['lingua nativa', 7, 7],
  ['jezyk ojczysty', 7, 7],
  ['maternelle', 7, 7],
  ['natif', 7, 7],
  ['native', 7, 7],
  ['nativo', 7, 7],
  ['nativa', 7, 7],
  ['ojczysty', 7, 7],
  ['bilingue', 6, 7],
  ['bilingual', 6, 7],
  ['dwujezyczny', 6, 7],
  // Fluent.
  ['courant', 5, 6],
  ['couramment', 5, 6],
  ['fluent', 5, 6],
  ['fluide', 5, 6],
  ['fluido', 5, 6],
  ['fluida', 5, 6],
  ['fluente', 5, 6],
  ['biegly', 5, 6],
  // Advanced, or good enough to work in.
  ['avance', 4, 5],
  ['advanced', 4, 5],
  ['avanzado', 4, 5],
  ['avancado', 4, 5],
  ['zaawansowany', 4, 5],
  ['professionnel', 4, 5],
  ['professional', 4, 5],
  ['profesional', 4, 5],
  ['profissional', 4, 5],
  // Intermediate. "Pre-intermediate" is A2, and the longer phrase wins.
  ['pre intermediate', 2, 2],
  ['upper intermediate', 4, 4],
  ['intermediaire', 3, 4],
  ['intermediate', 3, 4],
  ['intermedio', 3, 4],
  ['intermediario', 3, 4],
  ['sredniozaawansowany', 3, 4],
  ['conversationnel', 3, 4],
  ['conversational', 3, 4],
  // Beginner.
  ['debutant', 1, 2],
  ['beginner', 1, 2],
  ['notions', 1, 2],
  ['elementaire', 1, 2],
  ['elementary', 1, 2],
  ['basique', 1, 2],
  ['basic', 1, 2],
  ['basico', 1, 2],
  ['scolaire', 1, 2],
  ['principiante', 1, 2],
  ['iniciante', 1, 2],
  ['podstawowy', 1, 2],
  ['poczatkujacy', 1, 2],
];

const CEFR = /(?:^| )([abc]) ?([12])(?= |$)/g;
const STEP = { a: 0, b: 2, c: 4 };

/** A normalised level text → `[lo, hi]` on the 1-7 scale, or null when it names no level. */
export function fluencyLevel(text) {
  const t = String(text || '').trim();
  if (!t) return null;
  // A code is exact, so it wins over any word beside it: "Courant (C1)" is C1.
  const codes = [...t.matchAll(CEFR)].map((m) => STEP[m[1]] + Number(m[2]));
  if (codes.length) return [Math.min(...codes), Math.max(...codes)];
  const padded = ` ${t} `;
  const hit = WORDS.find(([w]) => padded.includes(` ${w} `));
  return hit ? [hit[1], hit[2]] : null;
}

/**
 * The one option a level fits, as an index into `texts`, or -1.
 *
 * `texts` are the options' normalised labels. A list where fewer than two options name a
 * level is not a level scale, and is not ours to read this way. When the level fits several
 * options, the ones that hold it whole are preferred: "Courant" (C1-C2) touches "Avancé"
 * (B2-C1) and "Bilingue" (C2-native) but only sits inside "Courant". If that still leaves
 * more than one, nothing is picked.
 */
export function pickByLevel(texts, wanted) {
  const want = fluencyLevel(wanted);
  if (!want) return -1;
  const levels = texts.map(fluencyLevel);
  if (levels.filter(Boolean).length < 2) return -1;
  const fits = levels.map((l, i) => (l && l[0] <= want[1] && want[0] <= l[1] ? i : -1)).filter((i) => i >= 0);
  if (fits.length === 1) return fits[0];
  const holds = fits.filter((i) => levels[i][0] <= want[0] && want[1] <= levels[i][1]);
  return holds.length === 1 ? holds[0] : -1;
}

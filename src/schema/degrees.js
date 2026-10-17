// SPDX-License-Identifier: Apache-2.0
// Education levels on one scale, so a CV that says "Master Marketing digital" can answer a form
// asking "Votre niveau d'étude" with "Licence (bac +3) / Master (bac +5) / Doctorat".
//
// The scale is the French one most forms use, years after the baccalauréat: CAP/BEP -1, bac 0,
// BTS/DUT 2, licence/bachelor 3, master 1 4, master/engineer 5, doctorate 8. A level the
// option states ("(bac +4)") wins over the degree name beside it ("Master 1 ou équivalent").
// One option is picked only when it is the only one at the CV's level.
//
// Texts arrive raw: "bac+2" loses its "+" to the usual normalisation, so this module folds
// case and accents itself and keeps it.

const fold = (text) =>
  String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ł/gi, 'l')
    .toLowerCase()
    .replace(/[^a-z0-9+>]+/g, ' ')
    .trim();

// Longest first, so "master 1" is read before "master".
const NAMES = [
  ['aucun diplome', -2],
  ['sans diplome', -2],
  ['no degree', -2],
  ['doctorat', 8],
  ['doctorate', 8],
  ['phd', 8],
  ['ph d', 8],
  ['doctorado', 8],
  ['doutorado', 8],
  ['doktorat', 8],
  ['master 1', 4],
  ['maitrise', 4],
  ['master', 5],
  ['masters', 5],
  ['mba', 5],
  ['msc', 5],
  ['diplome d ingenieur', 5],
  ['ingenieur', 5],
  ['engineering degree', 5],
  ['grande ecole', 5],
  ['maestria', 5],
  ['mestrado', 5],
  ['magister', 5],
  ['licence', 3],
  ['bachelor', 3],
  ['bachelors', 3],
  ['bsc', 3],
  ['licenciatura', 3],
  ['grado', 3],
  ['licencjat', 3],
  ['bts', 2],
  ['dut', 2],
  ['deug', 2],
  ['associate', 2],
  ['tecnico superior', 2],
  ['baccalaureat', 0],
  ['high school', 0],
  ['bachillerato', 0],
  ['ensino medio', 0],
  ['matura', 0],
  ['cap', -1],
  ['bep', -1],
].sort((a, b) => b[0].length - a[0].length);

/** A raw degree or option text → its level on the bac+N scale, or null. */
export function degreeLevel(text) {
  const t = ` ${fold(text)} `;
  const stated = t.match(/(>)?\s*bac\s*\+\s*(\d)/);
  if (stated) return stated[1] ? 8 : Number(stated[2]);
  const named = NAMES.find(([n]) => t.includes(` ${n} `));
  if (named) return named[1];
  return / bac /.test(t) ? 0 : null;
}

/** The highest degree among the CV's own, as written, or null when none has a level. */
export function highestDegree(degrees) {
  let best = null;
  let level = -Infinity;
  for (const d of degrees || []) {
    const l = degreeLevel(d);
    if (l !== null && l > level) {
      best = d;
      level = l;
    }
  }
  return best;
}

/** The one option at the degree's level, as an index into raw `texts`, or -1. */
export function pickDegree(texts, degree) {
  const want = degreeLevel(degree);
  if (want === null) return -1;
  const levels = texts.map(degreeLevel);
  if (levels.filter((l) => l !== null).length < 3) return -1;
  const fits = levels.map((l, i) => (l === want ? i : -1)).filter((i) => i !== -1);
  return fits.length === 1 ? fits[0] : -1;
}

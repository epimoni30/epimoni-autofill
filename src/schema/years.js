// SPDX-License-Identifier: Apache-2.0
// Years of experience against a form's own brackets.
//
// The CV gives a total ("8"), forms ask in brackets: "Moins d'1 an / 1 à 3 ans / 3 à 5 ans /
// Plus de 10 ans", "8 ans d'expérience", "10+ years". Each option is read as a range of years,
// and one is picked only when it is the only range holding the total. Brackets often share an
// edge ("1 à 3", "3 à 5"), and a total on that edge fits two: left for the person.
//
// A number is read as years only beside a word for years, so "Bac +5" is never five years.
// Texts arrive raw: the usual normalisation drops the "+" and "-" that brackets are made of
// ("10+ years", "1-2 ans"), so this module folds case and accents itself and keeps them.

const UNIT = '(?:ans?|annees?|years?|yrs?|anos?|lat|lata|rok|roku)';
const NONE =
  /\b(aucune experience|pas d experience|no experience|sin experiencia|sem experiencia|brak doswiadczenia|debutant accepte)\b/;
const BELOW = /(?:\bmoins d(?:e)?|\bless than|\bunder|\bmenos de|\bponizej|\bmniej niz|<)\s*(\d+)/;
const ABOVE = /(?:\bplus d(?:e)?|\bmore than|\bover|\bmas de|\bmais de|\bpowyzej|\bponad|\+\s*de|>)\s*(\d+)/;
const AT_LEAST = new RegExp(
  `\\b(\\d+)\\s*(?:\\+|${UNIT}\\s*(?:et plus|and more|and above|or more|o mas|ou mais|i wiecej|\\+))`,
);
const BETWEEN = /\b(\d+)\s*(?:-|a|to|y|e|et|do|and)\s*(\d+)\b/;
const SINGLE = /\b(\d+)\b/;
const YEARWORD = new RegExp(`\\b${UNIT}\\b`);

const fold = (text) =>
  String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ł/gi, 'l')
    .toLowerCase()
    .replace(/[^a-z0-9+<>-]+/g, ' ')
    .trim();

/** A raw option → `[lo, hi]` in years (hi may be Infinity), or null. */
export function yearsRange(text) {
  const t = ` ${fold(text)} `;
  if (NONE.test(t)) return [0, 0];
  if (!YEARWORD.test(t)) return null;
  let m = t.match(BELOW);
  if (m) return [0, Number(m[1]) - 0.5];
  m = t.match(ABOVE);
  if (m) return [Number(m[1]) + 0.5, Infinity];
  m = t.match(AT_LEAST);
  if (m) return [Number(m[1]), Infinity];
  m = t.match(BETWEEN);
  if (m && Number(m[1]) <= Number(m[2])) return [Number(m[1]), Number(m[2])];
  m = t.match(SINGLE);
  return m ? [Number(m[1]), Number(m[1])] : null;
}

/** The one option whose bracket holds `years` (a whole number as text), as an index, or -1. */
export function pickYears(texts, years) {
  if (!/^\d+$/.test(String(years || '').trim())) return -1;
  const n = Number(years);
  const ranges = texts.map(yearsRange);
  if (ranges.filter(Boolean).length < 2) return -1;
  const fits = ranges.map((r, i) => (r && r[0] <= n && n <= r[1] ? i : -1)).filter((i) => i !== -1);
  return fits.length === 1 ? fits[0] : -1;
}

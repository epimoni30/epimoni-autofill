// SPDX-License-Identifier: Apache-2.0
// The salary the person typed against a form's brackets.
//
// Stored as typed ("45 000 €", "45k", "42-44 K€ brut"), asked as brackets ("40 000 à 45 000 €
// brut annuel", "40-50k€", "Plus de 60k€"). Both are read as ranges of amounts, and a bracket is
// picked only when it holds the whole figure and no other bracket does: a figure on an edge, a
// range across two brackets, or a monthly figure against yearly brackets is left for the
// person. Texts arrive raw; this module folds them itself and keeps "+", "-", "<" and ">".

const fold = (text) =>
  String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    // "45 000" and "45.000" are one number.
    .replace(/(\d)[\s.  ](?=\d{3}\b)/g, '$1')
    .replace(/[^a-z0-9+<>-]+/g, ' ')
    .trim();

const MONTHLY =
  /\b(mois|mensuel|mensuelle|month|monthly|mes|mensual|mensal|miesiecznie|miesiac|mese|mensile|mensili)\b/;

const num = (digits, k) => Number(digits) * (k ? 1000 : 1);

/** A raw amount or bracket → `[lo, hi]` (hi may be Infinity), or null. */
export function amountRange(text) {
  const t = ` ${fold(text)} `;
  if (!/\d/.test(t)) return null;
  let m = t.match(/(?:\bmoins de|\bless than|\bunder|\bmenos de|\bponizej|\bmeno di|<)\s*(\d+)\s*(k)?/);
  if (m) return [0, num(m[1], m[2]) - 0.5];
  m = t.match(
    /(?:\bplus de|\bmore than|\bover|\bmas de|\bmais de|\bpowyzej|\bpiu di|\boltre|>)\s*(\d+)\s*(k)?/,
  );
  if (m) return [num(m[1], m[2]) + 0.5, Infinity];
  m = t.match(/\b(\d+)\s*(k)?\s*(?:-|a|to|y|e|et|do)\s*(\d+)\s*(k)?\b/);
  if (m) {
    // "42-44k": the k after the second number counts for both.
    const k = m[2] || m[4];
    const lo = num(m[1], m[2] || k);
    const hi = num(m[3], m[4] || k);
    return lo <= hi ? [lo, hi] : null;
  }
  m = t.match(/\b(\d+)\s*(k)?\s*\+/);
  if (m) return [num(m[1], m[2]), Infinity];
  m = t.match(/\b(\d+)\s*(k)?\b/);
  return m ? [num(m[1], m[2]), num(m[1], m[2])] : null;
}

/** The one bracket in raw `texts` that holds the stored figure whole, as an index, or -1. */
export function pickSalary(texts, stored) {
  const want = amountRange(stored);
  if (!want) return -1;
  const monthly = MONTHLY.test(` ${fold(stored)} `);
  // A monthly figure is compared only with brackets that say they are monthly too.
  if (monthly !== texts.some((t) => MONTHLY.test(` ${fold(t)} `))) return -1;
  const ranges = texts.map(amountRange);
  if (ranges.filter(Boolean).length < 3) return -1;
  const fits = ranges
    .map((r, i) => (r && r[0] <= want[0] && want[1] <= r[1] ? i : -1))
    .filter((i) => i !== -1);
  return fits.length === 1 ? fits[0] : -1;
}

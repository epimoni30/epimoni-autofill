// SPDX-License-Identifier: Apache-2.0
// A phone number for a field that shows its own country code.
//
// Phone widgets (intl-tel-input, most ATS design systems) put the dialling code in a picker
// beside the input, "+33 ▾", and expect only the national number in the input. Typing the
// international number there can reach the employer as "+33 +33 6…", or fail the widget's own
// check. So when the field shows a code: the same country's number goes in without it, in the
// shape the placeholder shows (with the trunk "0" when the placeholder starts with one), and a
// number from another country is offered, never written beside a code that contradicts it.

/**
 * `{value}` to write or `{suggest}` to offer. `stored` is the number as the person typed it,
 * `dial` the code the field shows (digits only), `placeholder` the input's own example.
 */
export function forDialCode(stored, dial, placeholder = '') {
  const raw = String(stored || '').trim();
  const intl = raw.match(/^(?:\+|00)\s*(\d[\d\s().-]*)$/);
  // Already national ("06 12 34 56 78"): the code beside it is the person's to check.
  if (!intl) return { value: raw };
  const rest = intl[1];
  const digits = rest.replace(/\D/g, '');
  if (!digits.startsWith(dial)) return { suggest: raw };
  // Drop the code from the typed text, keeping the person's own spacing after it.
  let i = 0;
  let seen = 0;
  while (i < rest.length && seen < dial.length) {
    if (/\d/.test(rest[i])) seen += 1;
    i += 1;
  }
  const national = rest
    .slice(i)
    .replace(/^[\s().-]+/, '')
    .trim();
  const trunk = /^\s*0/.test(placeholder) && !national.startsWith('0') ? '0' : '';
  return { value: trunk + national };
}

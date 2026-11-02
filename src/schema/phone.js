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

// A country-code list kept apart from the number: LinkedIn's "Code pays" is a <select> of
// "France (+33)" options, in its own field, so nothing beside the input shows the code.

/** The dialling code an option names, "France (+33)" or "+33 France", as digits, or null. */
export function dialOf(text) {
  const m = String(text || '').match(/\(\s*\+\s?(\d{1,4})\s*\)|^\s*\+\s?(\d{1,4})\b/);
  return m ? m[1] || m[2] : null;
}

/** Whether raw option texts are a list of country codes rather than of countries. */
export function isDialList(texts) {
  return texts.filter((t) => dialOf(t)).length >= 5;
}

/**
 * The option for the stored number's own code, as an index into raw `texts`, or -1 when no
 * single option holds it; null when the number carries no code, so the country can decide.
 * "+1" is a dozen countries: `pickCountry` chooses among those, and without it none is picked.
 */
export function pickDial(texts, stored, pickCountry) {
  const intl = String(stored || '')
    .trim()
    .match(/^(?:\+|00)\s*(\d[\d\s().-]*)$/);
  if (!intl) return null;
  const digits = intl[1].replace(/\D/g, '');
  // The longest code the number starts with: "+1 268" is Antigua before it is "+1".
  let best = -1;
  let fits = [];
  texts.forEach((t, i) => {
    const d = dialOf(t);
    if (!d || !digits.startsWith(d)) return;
    if (d.length > best) {
      best = d.length;
      fits = [i];
    } else if (d.length === best) fits.push(i);
  });
  if (fits.length === 1) return fits[0];
  if (!fits.length) return -1;
  const i = pickCountry ? pickCountry(fits.map((f) => texts[f])) : -1;
  return i === -1 ? -1 : fits[i];
}

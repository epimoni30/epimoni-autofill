// SPDX-License-Identifier: Apache-2.0
// The language packs, and the vocabulary merged across them.
//
// Adding a language is one file (`<lang>.js`, from `_template.js`) and one line below. The
// build refuses a pack file that is not listed here, and a key that `src/schema/fields.js`
// does not define.
//
// Packs are merged, not selected by the page's language: a French form on an English-language
// ATS is ordinary, and so is a résumé written in one language and applied with in another.
// That makes cross-language collisions real (`nombre` is a name in Spanish and a count in
// French) which is what the `not` lists are for.

import autocomplete from './autocomplete.js';
import en from './en.js';
import es from './es.js';
import fr from './fr.js';
import pt from './pt.js';

export const PACKS = [fr, en, es, pt];

export const AUTOCOMPLETE = autocomplete;

/**
 * Month names → month number, from every pack. Keys are prefixes: `fev` matches "février",
 * "févr." and "fev". Two packs may give the same prefix only if they agree on the month.
 */
export const MONTHS = Object.assign({}, ...PACKS.map((p) => p.dates?.months || {}));

/** Words that make a date mean "ongoing": "en cours", "present", "actualidad". */
export const ONGOING = [...new Set(PACKS.flatMap((p) => p.dates?.ongoing || []))];

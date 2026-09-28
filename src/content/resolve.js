// The resolver: a described control in, a canonical profile key out.
//
// Pure functions over plain objects. It takes the bundle `dom.labelBundle()` produces,
// never an element, so the whole scorer is unit-testable without a browser, and the
// browser is only needed to test the DOM layer.
//
// The design constraint that shapes everything here: a *wrong* value in a submitted
// application is unrecoverable, while a missed field costs the user one keystroke. So
// every rule below is biased toward refusing to answer. Three mechanisms do that work:
// per-key disqualifiers (`not`), a minimum score, and a minimum margin over the
// runner-up. The last one matters most in French, where `nom` alone is genuinely
// ambiguous between a surname, a company name and a file name.

import { fieldOf } from '../schema/fields.js';

export const FILL_THRESHOLD = 0.7;
export const SUGGEST_THRESHOLD = 0.55;
export const MARGIN = 0.08;

// What a field may go into, a dropdown, a one-line input, a textarea, and whether it
// describes the user is defined once, in `src/schema/fields.js`. A key the registry does not
// know is never filled: the build rejects such a key in a language pack, and this is the
// runtime half of the same rule.
const allowsSelect = (key) => Boolean(fieldOf(key)?.select);
const isLongOnly = (key) => fieldOf(key)?.shape === 'long';
const isShortOnly = (key) => fieldOf(key)?.shape === 'short';
const isPersonal = (key) => fieldOf(key)?.personal !== false;

const pad = (s) => ` ${s} `;

/** A scoped key is `<section>.<field>`; an unscoped one has no section. */
export const scopeOf = (key) => (key.includes('.') ? key.slice(0, key.indexOf('.')) : null);

function compileSections(lexicons) {
  const phrases = new Map(); // normalised caption → section
  const attrs = new Map(); // name/id token → section
  for (const lex of lexicons) {
    for (const [section, spec] of Object.entries(lex.sections || {})) {
      for (const p of spec.any || []) phrases.set(p, section);
      for (const a of spec.attr || []) attrs.set(a, section);
    }
  }
  return { phrases, attrs };
}

function compile(lexicons) {
  const keys = new Map();
  for (const lex of lexicons) {
    for (const [key, spec] of Object.entries(lex.keys || {})) {
      if (!fieldOf(key)) continue; // not a field; the build names it
      const entry = keys.get(key) || { any: new Set(), not: new Set() };
      for (const p of spec.any || []) entry.any.add(p);
      for (const p of spec.not || []) entry.not.add(p);
      keys.set(key, entry);
    }
  }
  // Longest phrase first: a match on "poste actuel" must win over one on "poste", and
  // scoring stops at the first hit per source.
  return new Map(
    [...keys].map(([key, e]) => [
      key,
      {
        any: [...e.any].sort((a, b) => b.length - a.length),
        not: [...e.not],
        scope: scopeOf(key),
      },
    ]),
  );
}

/**
 * `lexicons` are the language packs (`src/lexicon/index.js`), merged. Besides phrases per key
 * they carry two lists that apply across keys:
 *
 * - `thirdParty`: words that say the question is about somebody else: an emergency contact,
 *   the recruiter, a referrer, a family member. They disqualify every personal key at once,
 *   because the alternative is maintaining the same list inside twenty of them and missing
 *   one. This is what stops "téléphone du contact d'urgence" from being filled with the
 *   user's own number, which is both wrong and the kind of wrong a user does not notice
 *   before pressing Submit.
 * - `captionFiller`: words that decorate a section heading without changing what it is:
 *   "Vos expériences", "Formation (facultatif)", "Expérience n° 2".
 */
export function createResolver({ lexicons, autocomplete = {} }) {
  const keys = compile(lexicons);
  const sections = compileSections(lexicons);
  const thirdParty = [...new Set(lexicons.flatMap((l) => l.thirdParty || []))];
  const captionFiller = new Set(lexicons.flatMap((l) => l.captionFiller || []));

  /**
   * Which CV section does a heading name, if any?
   *
   * An *exact* match on the heading, once decoration and numbering are stripped, never a
   * substring. A section decides which keys a whole block of controls may take, so a false
   * one is far more expensive than a false field match: the page heading "Chef de projet – Expérience client"
   * must not turn the contact form under it into a work history.
   * `normalized` is text already passed through `dom.normalize`.
   */
  function sectionOf(normalized) {
    const core = String(normalized || '')
      .split(' ')
      .filter((w) => w && !/^\d+$/.test(w) && !captionFiller.has(w))
      .join(' ');
    return (core && sections.phrases.get(core)) || null;
  }

  /** The section a `name`/`id` token belongs to: `experiences` in `experiences[1][company]`. */
  const attrSection = (token) => sections.attrs.get(token) || null;

  /**
   * Is this key disqualified for this control, whatever it scores?
   *
   * Checked against every source at once, not per source: a `name="nom"` sitting under a
   * label that says "Nom de l'entreprise" must lose the key entirely. Over-blocking is
   * the safe direction: a miss costs a keystroke.
   */
  function disqualified(key, allText) {
    const spec = keys.get(key);
    if (spec?.not.some((n) => allText.includes(pad(n)))) return true;
    // A references block is *about* a third party by definition, which is why its fields are
    // declared non-personal in the registry: the veto would otherwise refuse every one.
    if (isPersonal(key) && thirdParty.some((n) => allText.includes(pad(n)))) return true;
    return false;
  }

  function shapeAllows(key, bundle) {
    // A file input and a file field only ever meet each other: no text lands in a file
    // picker, and no file is typed into a text box.
    if (bundle.type === 'file' || fieldOf(key)?.shape === 'file')
      return bundle.type === 'file' && fieldOf(key)?.shape === 'file';
    // A radio group is a closed option list, exactly like a select, and is gated by the same
    // key list: free text has nowhere to go in either.
    const isSelect = bundle.tag === 'select' || bundle.tag === 'radiogroup';
    const isLong = bundle.tag === 'textarea' || (bundle.maxLength !== null && bundle.maxLength >= 400);
    if (isSelect) return allowsSelect(key);
    if (isLong && isShortOnly(key)) return false;
    if (!isLong && isLongOnly(key)) {
      // A one-line input can still be a letter field if the form says so with a large
      // maxlength; below that, treat it as a different question.
      return bundle.maxLength === null ? Boolean(fieldOf(key)?.oneLine) : bundle.maxLength >= 200;
    }
    return true;
  }

  /**
   * Score every candidate key for one control.
   *
   * Returns `{ranked, refused}`: `refused` holds keys that matched the label but were ruled
   * out by the control's shape, which `resolve` needs to tell "we recognised this
   * question and will not answer it" from "nothing matched at all". Previously this was
   * stashed as a property on the returned array, which worked and read like a mistake.
   */
  function score(bundle) {
    // Matching and vetoing read different texts, and the distinction is load-bearing.
    //
    // Matching reads every source we scraped, one at a time (the loop below): vague
    // surrounding text is a usable hint when nothing better exists.
    //
    // `guard` is only the sources that actually describe this control, used to
    // *disqualify*. Imprecise surrounding text sweeps in neighbouring rows, and a veto
    // list read against it rejects almost everything: in a French contact fieldset the
    // word "Prénom" three rows up would disqualify `family_name` on the field labelled
    // "Nom", and the "Sélectionnez un CV" row would disqualify the cover letter beside
    // it. A hint may suggest; only evidence about this field may forbid.
    const guard = pad(
      bundle.sources
        .filter((s) => s.weight >= 0.65)
        .map((s) => s.text)
        .join(' '),
    );
    const results = [];
    const refused = [];
    // Inside a block of a repeated section only that section's keys exist, and outside one
    // no scoped key does. That is the whole safety argument for scoped keys: "Entreprise" or
    // "Date de début" can be in the lexicon without ever matching a stray field elsewhere,
    // and a "Ville" inside a job is that job's city, never the user's home, which is what
    // the unscoped `city` key filled it with before blocks existed.
    const block = bundle.block || null;

    // An `autocomplete` token is specified behaviour, not a guess, so it decides alone:
    // outside a block. The tokens describe the user, and inside a block the question is
    // about one entry of the CV.
    const acKey = block ? null : autocomplete[bundle.autocomplete];
    if (acKey && shapeAllows(acKey, bundle) && !disqualified(acKey, guard)) {
      return { ranked: [{ key: acKey, score: 1, via: 'autocomplete' }], refused: [] };
    }

    // Match first, then check shape, so a key that matched and was refused on shape can
    // be told apart from a key that never matched at all. The difference decides what
    // happens to the field: a recognised question in an unexpected shape is one to leave
    // alone, while a field nothing recognised may still be a free-text question for the
    // AI tier to answer.
    for (const [key, spec] of keys) {
      // A block whose section is contested (`section: null`) takes no key at all.
      if (block ? !block.section || spec.scope !== block.section : spec.scope) continue;
      if (disqualified(key, guard)) continue;
      let best = 0,
        via = null,
        hit = null;
      for (const src of bundle.sources) {
        const text = pad(src.text);
        const phrase = spec.any.find((p) => text.includes(pad(p)));
        if (!phrase) continue;
        // A longer phrase is a more specific read of the same label, worth a little over
        // a short one that happens to sit inside it.
        const specificity = Math.min(0.06, 0.02 * (phrase.split(' ').length - 1));
        const s = Math.min(1, src.weight + specificity);
        if (s > best) {
          best = s;
          via = src.kind;
          hit = phrase;
        }
      }
      if (best === 0) continue;
      if (!shapeAllows(key, bundle)) {
        refused.push(key);
        continue;
      }
      results.push({ key, score: Number(best.toFixed(4)), via, phrase: hit });
    }

    // Input types are a weaker signal than a label but stronger than nothing, and they
    // are the only thing some forms give us.
    if (!results.length && !block) {
      // A type is a weaker signal than a label, but it is the only thing some forms give
      // us. It still goes through the disqualifiers: `type="email"` on a field labelled
      // "adresse e-mail de votre recruteur" is not the user's address.
      const byType = bundle.type === 'email' ? 'email' : bundle.type === 'tel' ? 'phone' : null;
      if (byType && !disqualified(byType, guard)) results.push({ key: byType, score: 0.85, via: 'type' });
    }
    results.sort((a, b) => b.score - a.score);
    return { ranked: results, refused };
  }

  /**
   * Decide what to do with one control: fill it, offer it, or leave it.
   *
   * `ambiguous` is not a failure mode to be tuned away: it is the resolver saying the
   * form did not tell it enough, which is exactly when a human should look.
   */
  function resolve(bundle) {
    const { ranked, refused } = score(bundle);
    // A prose field the lexicon cannot name is not noise: it is a free-text question
    // ("pourquoi cette entreprise ?", a screening question), which is precisely what the
    // phase-4 AI tier answers. Naming it here keeps the seam explicit instead of letting
    // the deterministic engine quietly drop the hardest fields on the form.
    const prose = bundle.tag === 'textarea' || (bundle.maxLength !== null && bundle.maxLength >= 400);
    if (!ranked.length) {
      if (refused.length) return { action: 'skip', reason: 'shape-refused', key: refused[0] };
      return prose
        ? { action: 'ai-candidate', reason: 'unnamed-prose' }
        : { action: 'skip', reason: 'no-match' };
    }
    const [top, next] = ranked;
    const block = bundle.block || null;
    // A scoped key names a field of *some* entry; without an index there is no telling which
    // entry, and guessing is how the second job's dates land in the first job's block.
    if (block && block.index == null) return { action: 'skip', reason: 'no-index', key: top.key };
    const at = block ? { index: block.index, part: bundle.part || null } : {};
    const gap = next ? top.score - next.score : 1;
    if (next && gap < MARGIN) {
      return {
        action: 'suggest',
        key: top.key,
        score: top.score,
        reason: 'ambiguous',
        rivals: [top.key, next.key],
        via: top.via,
        ...at,
      };
    }
    // The field is recognised but the block's position is not certain: two sources gave it
    // different indexes, or its sibling blocks are not the same shape. A human can see
    // which entry the block is; we can only offer.
    if (block?.weak && top.score >= SUGGEST_THRESHOLD)
      return {
        action: 'suggest',
        key: top.key,
        score: top.score,
        reason: 'block-uncertain',
        via: top.via,
        ...at,
      };
    if (top.score >= FILL_THRESHOLD)
      return { action: 'fill', key: top.key, score: top.score, via: top.via, phrase: top.phrase, ...at };
    if (top.score >= SUGGEST_THRESHOLD)
      return {
        action: 'suggest',
        key: top.key,
        score: top.score,
        reason: 'low-confidence',
        via: top.via,
        ...at,
      };
    return { action: 'skip', reason: 'below-threshold', key: top.key, score: top.score };
  }

  /**
   * Resolve a whole form, then settle collisions.
   *
   * Two controls claiming the same key is normal (a form asking twice, a hidden
   * duplicate, an "email" beside a "confirm email" the resolver read as plain email).
   * The stronger claim keeps the fill; the weaker one drops to a suggestion rather than
   * filling the same value into a field that may be asking something else.
   *
   * In a repeated section the claim is the key *and* the entry *and* the date part: the
   * start date of job 1 and of job 2 are different questions, and so are the month and the
   * year dropdowns of one start date.
   */
  function resolveAll(bundles) {
    const decisions = bundles.map((b) => resolve(b));
    const taken = new Map();
    decisions.forEach((d, i) => {
      if (d.action !== 'fill') return;
      const claim = d.index == null ? d.key : `${d.key}#${d.index}#${d.part || ''}`;
      const prev = taken.get(claim);
      if (prev === undefined) {
        taken.set(claim, i);
        return;
      }
      const loser = decisions[prev].score >= d.score ? i : prev;
      const winner = loser === i ? prev : i;
      taken.set(claim, winner);
      decisions[loser] = { ...decisions[loser], action: 'suggest', reason: 'duplicate-key' };
    });
    return decisions;
  }

  return { score, resolve, resolveAll, sectionOf, attrSection };
}

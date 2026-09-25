// Unit tests for the resolver. Pure (no browser) because the scorer is where the
// accuracy lives and it should be cheap to run on every change. The DOM layer is measured
// separately by test/measure.mjs, which needs a real page.
//
// Every case below is a bug that was actually shipped and caught by the fixtures once.
// They are here so it stays caught.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createResolver } from '../src/content/resolve.js';
import { AUTOCOMPLETE, PACKS } from '../src/lexicon/index.js';

const resolver = createResolver({ lexicons: PACKS, autocomplete: AUTOCOMPLETE });

/** A control described the way dom.labelBundle() would describe it. */
const el = (
  label,
  {
    tag = 'input',
    type = 'text',
    maxLength = null,
    autocomplete = '',
    name = '',
    nearby = null,
    precise = true,
  } = {},
) => ({
  autocomplete,
  type,
  tag,
  maxLength,
  sources: [
    ...(label ? [{ kind: 'label', text: label, weight: 0.95 }] : []),
    ...(name ? [{ kind: 'name', text: name, weight: 0.75 }] : []),
    ...(nearby ? [{ kind: 'nearby', text: nearby, weight: precise ? 0.9 : 0.6 }] : []),
  ],
});

// "fill" is reported as the key it would write; anything else as the reason it would not,
// since that is the part under test.
const key = (...args) => {
  const d = resolver.resolve(el(...args));
  return d.action === 'fill' ? d.key : `${d.action}:${d.reason}`;
};

test('French identity fields', () => {
  assert.equal(key('prenom'), 'given_name');
  assert.equal(key('nom'), 'family_name');
  assert.equal(key('nom complet'), 'full_name');
  assert.equal(key('adresse e mail'), 'email');
  assert.equal(key('code postal'), 'postal_code');
  assert.equal(key('ville'), 'city');
});

test('a hint may suggest, only evidence may forbid', () => {
  // The bug: disqualifiers were read against imprecise surrounding text, so a sibling
  // label elsewhere in the fieldset vetoed the right key. "Prénom" three rows above the
  // field labelled "Nom" disqualified family_name, and nothing filled.
  assert.equal(
    key('nom', { nearby: 'vos coordonnees prenom nom adresse electronique telephone ville', precise: false }),
    'family_name',
  );
  assert.equal(
    key('lettre de motivation 1500 caracteres maximum', {
      tag: 'textarea',
      nearby: 'votre candidature selectionnez un cv lettre de motivation',
      precise: false,
    }),
    'cover_letter',
  );
  assert.equal(
    key('complement d adresse', { nearby: 'prenom nom e mail country', precise: false }),
    'street',
  );
  // But a disqualifier in the field's own label still forbids.
  assert.equal(
    key('joindre votre cv lettre de motivation', { tag: 'textarea' }),
    'ai-candidate:unnamed-prose',
  );
});

test('questions about somebody else are never answered', () => {
  // These were filled with the user's own details before THIRD_PARTY existed, and a
  // wrong phone number in a submitted application cannot be taken back.
  assert.equal(key('telephone du contact d urgence', { type: 'tel' }), 'skip:no-match');
  assert.equal(key('adresse e mail de votre recruteur', { type: 'email' }), 'skip:no-match');
  assert.equal(key('nom de l ecole de votre enfant'), 'skip:no-match');
  assert.equal(key('emergency contact name'), 'skip:no-match');
});

test('the input-type fallback obeys the disqualifiers', () => {
  // A bare type="email" with no usable label is still the user's address...
  assert.equal(key('', { type: 'email' }), 'email');
  assert.equal(key('', { type: 'tel' }), 'phone');
  // ...but the fallback must not resurrect a key the lexicon just refused.
  assert.equal(key('e mail de votre parrain', { type: 'email' }), 'skip:no-match');
});

test('French/Spanish collisions', () => {
  // "nombre" is a name in Spanish and a count in French.
  assert.equal(key('nombre d annees d experience'), 'years_experience');
  assert.equal(key('nombre completo'), 'full_name');
  assert.equal(key('apellidos'), 'family_name');
  // "profil" is a summary prompt alone, a URL field next to "LinkedIn".
  assert.equal(key('profil linkedin'), 'linkedin_url');
  assert.equal(key('profil', { tag: 'textarea' }), 'summary');
  // "carta de presentación" is a letter; "presentación" alone is an about-you field.
  assert.equal(key('carta de presentacion', { tag: 'textarea' }), 'cover_letter');
});

test('a company or a job is not a person', () => {
  assert.equal(key('nom de l entreprise'), 'skip:no-match');
  assert.equal(key('company name'), 'skip:no-match');
  assert.equal(key('file name'), 'skip:no-match');
  assert.equal(key('poste recherche'), 'skip:no-match');
  assert.equal(key('salaire actuel'), 'skip:no-match');
  assert.equal(key('ville de naissance'), 'skip:no-match');
});

test('shape gates the key', () => {
  // A surname resolved onto a long textarea is a mis-read of the form, and it is left
  // alone rather than handed to the AI tier, because the question *was* recognised.
  assert.equal(key('nom', { tag: 'textarea' }), 'skip:shape-refused');
  // A select is only offered keys that can plausibly be an option.
  assert.equal(key('pays', { tag: 'select' }), 'country');
  assert.equal(key('lettre de motivation', { tag: 'select' }), 'skip:shape-refused');
});

test('unnamed prose is routed to the AI tier, not dropped', () => {
  assert.equal(
    key('pourquoi souhaitez vous rejoindre notre entreprise', { tag: 'textarea' }),
    'ai-candidate:unnamed-prose',
  );
  assert.equal(key('decrivez une situation difficile', { tag: 'textarea' }), 'ai-candidate:unnamed-prose');
  // A short unnamed input is a skip, not an AI candidate: we do not know what it wants.
  assert.equal(key('numero de securite sociale'), 'skip:no-match');
});

test('autocomplete decides alone, when it is allowed to', () => {
  assert.equal(key('anything', { autocomplete: 'given-name' }), 'given_name');
  assert.equal(key('anything', { autocomplete: 'postal-code' }), 'postal_code');
  // ...but not onto a third-party question, and not for payment fields.
  assert.equal(key('nom du contact d urgence', { autocomplete: 'family-name' }), 'skip:no-match');
});

test('duplicate keys: the stronger claim keeps the fill', () => {
  const decisions = resolver.resolveAll([el('adresse e mail'), el('', { type: 'email', name: 'email2' })]);
  assert.equal(decisions[0].action, 'fill');
  assert.equal(decisions[1].action, 'suggest');
  assert.equal(decisions[1].reason, 'duplicate-key');
});

test('score() reports keys refused on shape separately from no match', () => {
  // The distinction decides what happens to the field, so it is part of the contract rather
  // than an implementation detail: a recognised question in the wrong shape is left alone,
  // while an unrecognised prose field goes to the AI tier.
  const long = el('nom', { tag: 'textarea' });
  const { ranked, refused } = resolver.score(long);
  assert.equal(ranked.length, 0);
  assert.ok(refused.includes('family_name'));

  const unknown = el('decrivez votre plus grand echec', { tag: 'textarea' });
  assert.equal(resolver.score(unknown).refused.length, 0);
  assert.equal(resolver.resolve(unknown).action, 'ai-candidate');
});

test('a radio group is a closed question, gated like a select', () => {
  const group = (label) => ({
    autocomplete: '',
    type: 'radio',
    tag: 'radiogroup',
    maxLength: null,
    sources: [{ kind: 'legend', text: label, weight: 0.95 }],
  });
  const k = (label) => {
    const d = resolver.resolve(group(label));
    return d.action === 'fill' ? d.key : `${d.action}:${d.reason}`;
  };

  assert.equal(k('avez vous l autorisation de travailler en france'), 'work_authorization');
  assert.equal(k('pays de residence'), 'country');
  // Free-text keys have nowhere to go in a closed list, so the group is left alone rather
  // than answered with the nearest thing.
  assert.equal(k('adresse e mail'), 'skip:shape-refused');
  assert.equal(k('comment avez vous connu cette offre'), 'skip:no-match');
});

// ── Repeated sections ────────────────────────────────────────────────────────────────────
//
// A block is what `dom.assignBlocks` would attach: which entry of which CV section the
// control belongs to. The resolver's half of the contract is below; the DOM half is measured
// against `parcours.html` and `indexed.html`.

const inBlock = (label, block, opts = {}) => ({ ...el(label, opts), block, part: opts.part ?? null });
const work0 = { section: 'work', index: 0, weak: false };
const blockKey = (...args) => {
  const d = resolver.resolve(inBlock(...args));
  return d.action === 'fill' ? `${d.key}@${d.index}` : `${d.action}:${d.reason}`;
};

test('a scoped key never fires outside a block', () => {
  // "Entreprise" and "Date de début" are in the lexicon now. Outside a block they must
  // still mean nothing, or every stray company field on a page becomes a work history.
  assert.equal(key('entreprise'), 'skip:no-match');
  assert.equal(key('date de debut'), 'skip:no-match');
  assert.equal(key('etablissement'), 'education_institution', 'the flat key is unchanged');
});

test('inside a block, only that section answers', () => {
  assert.equal(blockKey('entreprise', work0), 'work.company@0');
  assert.equal(blockKey('poste', work0), 'work.position@0');
  assert.equal(blockKey('date de fin', { ...work0, index: 1 }), 'work.end@1');
  // The home-city bug: a "Ville" inside a job is that job's city.
  assert.equal(blockKey('ville', work0), 'work.location@0');
  assert.equal(blockKey('ville', { section: 'education', index: 0 }), 'skip:no-match');
});

test('personal keys and type fallbacks do not reach into a block', () => {
  // The manager's e-mail inside a job block is not the user's address, whatever its type.
  assert.equal(blockKey('e mail du responsable', work0, { type: 'email' }), 'skip:no-match');
  assert.equal(blockKey('', work0, { type: 'tel', name: 'tel' }), 'skip:no-match');
  assert.equal(blockKey('prenom', work0), 'skip:no-match');
  // An autocomplete token describes the user, so it is not decisive inside a block either.
  assert.equal(blockKey('', work0, { autocomplete: 'organization' }), 'skip:no-match');
});

test('a references block names the referee and nothing else', () => {
  const refs = { section: 'references', index: 0 };
  assert.equal(blockKey('nom du referent', refs), 'references.name@0');
  // A bare "Nom" beside a "Prénom" is a surname; the CV holds a full name. Left alone.
  assert.equal(blockKey('nom', refs), 'skip:no-match');
  assert.equal(blockKey('telephone', refs, { type: 'tel' }), 'skip:no-match');
});

test('an uncertain block only suggests, a contested one answers nothing', () => {
  const weak = resolver.resolve(inBlock('entreprise', { ...work0, weak: true }));
  assert.equal(weak.action, 'suggest');
  assert.equal(weak.reason, 'block-uncertain');
  assert.equal(weak.index, 0);
  assert.equal(blockKey('entreprise', { section: null, index: null, weak: true }), 'skip:no-match');
});

test('two entries, or two halves of one date, are separate claims', () => {
  const ds = resolver.resolveAll([
    inBlock('mois de debut', work0, { tag: 'select', part: 'month' }),
    inBlock('annee de debut', work0, { tag: 'select', part: 'year' }),
    inBlock('mois de debut', { ...work0, index: 1 }, { tag: 'select', part: 'month' }),
    inBlock('entreprise', work0),
    inBlock('entreprise', { ...work0, index: 1 }),
  ]);
  assert.deepEqual(
    ds.map((d) => d.action),
    ['fill', 'fill', 'fill', 'fill', 'fill'],
  );
});

test('a section heading is matched exactly, never inside other text', () => {
  const s = (t) => resolver.sectionOf(t);
  assert.equal(s('experiences professionnelles'), 'work');
  assert.equal(s('experience 2'), 'work');
  assert.equal(s('vos formations'), 'education');
  assert.equal(s('work experience'), 'work');
  assert.equal(s('formacion academica'), 'education');
  assert.equal(s('langues'), 'languages');
  // A job title that happens to contain a section word is not a section.
  assert.equal(s('candidature chef de projet experience client'), null);
  assert.equal(s('informations personnelles'), null);
  assert.equal(s('poste souhaite'), null);
});

test('a free-text key keeps its shape rule inside a block', () => {
  // A description is prose; a one-line input labelled "Description" is some other question.
  assert.equal(blockKey('description', work0), 'skip:shape-refused');
  assert.equal(blockKey('description', work0, { tag: 'textarea' }), 'work.description@0');
  // Dates may be dropdowns; a company name may not.
  assert.equal(blockKey('entreprise', work0, { tag: 'select' }), 'skip:shape-refused');
  assert.equal(blockKey('date de debut', work0, { tag: 'select', part: 'year' }), 'work.start@0');
});

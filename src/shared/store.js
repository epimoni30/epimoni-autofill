// Everything the extension remembers.
//
// `chrome.storage.local` only, never `storage.sync`: sync would push CV PII across devices
// through Google's infrastructure for no benefit, and its 100 KB quota would not hold a
// profile anyway. Local storage is also what the CWS limited-use disclosure describes, so
// keeping it local keeps the listing honest.
//
// ── The library ────────────────────────────────────────────────────────────────────────
//
// There used to be one CV slot. That was wrong in a way that only showed up in use: a
// hand-off from the site overwrote a CV somebody had typed here, with no warning and no way
// back, and one document cannot answer "the short CV for agencies or the long one for
// direct applications?", which is the question an application form actually asks.
//
// So storage holds `cvs`, a list, and `active_cv_id`. Everything downstream still reads
// `state.cv`, because `read()` spreads the active entry over the bag on the way out. That
// keeps the fill path, the analysis and both surfaces untouched, and it keeps one writer:
// the active document is *derived*, never stored twice, so the list and the copy cannot
// drift apart the way a denormalised mirror would.

const KEY = 'epimoni';

/** Most people keep two or three. The cap is here so a loop cannot fill the quota. */
export const MAX_CVS = 20;

/**
 * Spread from the active library entry on every read, and stripped before every write.
 * Persisting these would be the second copy this design exists to avoid.
 *
 * `profile` is deliberately **not** in this list. A pairing can carry the account's flat
 * profile with no document attached, and that profile still fills forms, so it stays
 * writable at bag level and acts as the fallback when the library is empty. The active
 * entry's profile wins whenever there is one.
 */
const DERIVED = ['cv', 'cv_label', 'cv_source', 'builder_id', 'taken_at'];

/**
 * What lives under that key:
 *
 *   cvs         [{id, label, cv, source, profile, builder_id, taken_at, updated_at}]
 *               `source` is 'account' | 'site' | 'local': where this document came from
 *   active_cv_id which of them fills forms and gets compared against an advert
 *   extras      what a CV does not hold (address, notice period…), typed by the user; shared
 *               across the library, because they describe the person and not the document
 *   anon        `{jwt, user_id, at}`: the extension's own anonymous session, minted on the
 *               first metered call and never on install (see epimoni/identity.js)
 *   stale       the paired account token expired; filling still works, the analysis falls
 *               through to the anonymous tier
 *
 * The invariant worth stating: **the active `cv`, `profile` and `extras` are enough to fill
 * a form.** None of the identity fields are on that path, which is why filling works with no
 * account, no session and no network.
 */

/**
 * Fields a pairing message may carry. Anything else the site sends is dropped.
 *
 * `cv` is the CvDoc itself, not just the flattened `profile`. Filling a form only ever needed
 * the flat keys, but comparing the CV against an advert is `POST /ml/analyse/cvVSoffer-doc`,
 * which takes `content: <CvDoc>`, so the document has to be here or the extension cannot
 * offer the analysis at all. `builder_id` rides along because it is what makes the result
 * land on the user's own document when they open it on the site.
 */
export const PAIR_FIELDS = [
  'jwt',
  'user_id',
  'user_type',
  'given_name',
  'family_name',
  'profile',
  'cv',
  'builder_id',
  'cv_label',
  'taken_at',
];

const arr = (v) => (Array.isArray(v) ? v : []);
const newId = () => `cv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const DEFAULTS = { paired: false, extras: {}, rejected: {}, cvs: [], active_cv_id: null };

/**
 * The one-slot shape → the library shape.
 *
 * Returns null when there is nothing to do, and `persist: false` for a fresh install, so
 * merely reading storage on a browser that has never held a CV does not create a record.
 */
function migrate(bag) {
  if (Array.isArray(bag.cvs)) return null;
  const legacy = bag.cv && typeof bag.cv === 'object' ? bag.cv : null;
  const next = { ...bag };
  for (const k of DERIVED) delete next[k];
  next.cvs = legacy
    ? [
        {
          id: newId(),
          label: bag.cv_label || null,
          cv: legacy,
          source: bag.cv_source || 'local',
          profile: bag.profile || null,
          builder_id: bag.builder_id || null,
          taken_at: bag.taken_at || null,
          updated_at: Date.now(),
        },
      ]
    : [];
  next.active_cv_id = next.cvs[0]?.id || null;
  return { next, persist: Boolean(legacy) };
}

function entry(bag, id) {
  return arr(bag.cvs).find((c) => c && c.id === id) || null;
}

/** The active entry, falling back to the first so a dangling id is never a lost CV. */
function activeEntry(bag) {
  return entry(bag, bag.active_cv_id) || arr(bag.cvs)[0] || null;
}

/** The bag as every caller sees it: the library, with the active document spread on top. */
function withActive(bag) {
  const a = activeEntry(bag);
  return {
    ...bag,
    cvs: arr(bag.cvs),
    active_cv_id: a?.id || null,
    cv: a?.cv || null,
    cv_label: a?.label || null,
    cv_source: a?.source || null,
    profile: a?.profile || bag.profile || null,
    builder_id: a?.builder_id || null,
    taken_at: a?.taken_at || null,
  };
}

const put = (bag) => chrome.storage.local.set({ [KEY]: bag });

/** The persisted bag, migrated if it predates the library. */
async function rawRead() {
  const got = await chrome.storage.local.get(KEY);
  const bag = got[KEY] || { ...DEFAULTS };
  const m = migrate(bag);
  if (!m) return bag;
  if (m.persist) await put(m.next);
  return m.next;
}

export async function read() {
  return withActive(await rawRead());
}

/**
 * The bag as it would read with `id` active, without making it so. A page can fill from, and
 * analyse against, another CV of the library without changing which one the others use.
 * An unknown id reads as the active one.
 */
export async function readAs(id) {
  const bag = await rawRead();
  return withActive(entry(bag, id) ? { ...bag, active_cv_id: id } : bag);
}

/**
 * Merge a patch into the bag. CV fields are refused here on purpose: they belong to a
 * library entry, and `saveCv` is the only way in. Silently accepting `{cv}` would write a
 * copy that the next read would shadow: a bug that looks like storage losing writes.
 */
export async function write(patch) {
  const bag = await rawRead();
  const next = { ...bag, ...patch };
  for (const k of DERIVED) delete next[k];
  await put(next);
  return withActive(next);
}

export async function clear() {
  await chrome.storage.local.remove(KEY);
}

/**
 * Keep the CVs, drop the account.
 *
 * "Se déconnecter" and "effacer mes données" are different requests and used to be the same
 * button. Somebody who disconnects a paired account still wants their CVs to fill forms with:
 * the extension works without an account, so losing them is not a consequence of signing
 * out, it is a separate destruction the user did not ask for.
 *
 * Documents that came from that account stay, marked `local`: the account is gone, the
 * document is still theirs.
 */
export async function unpairOnly() {
  const bag = await rawRead();
  const kept = {
    ...DEFAULTS,
    cvs: arr(bag.cvs).map((c) => ({ ...c, source: c.source === 'account' ? 'local' : c.source })),
    active_cv_id: bag.active_cv_id || null,
    extras: bag.extras || {},
    paired: false,
  };
  await put(kept);
  return withActive(kept);
}

// ── The library ────────────────────────────────────────────────────────────────────────

/** Rows for a surface that lists CVs: everything but the document itself. */
export async function listCvs() {
  const bag = await rawRead();
  const activeId = activeEntry(bag)?.id || null;
  return arr(bag.cvs).map((c) => ({
    id: c.id,
    label: c.label || null,
    source: c.source || 'local',
    updated_at: c.updated_at || null,
    active: c.id === activeId,
  }));
}

/**
 * Add or update a document, and make it the active one.
 *
 * `cv` must already be normalised: the worker is the only writer and normalises on the way
 * in, so that three senders cannot disagree about shape (see shared/cvdoc.js).
 *
 * Matching on `builder_id` is what stops the library filling up with copies. Pairing the
 * same site document twice is the common case (a user re-pairs after editing their CV)
 * and that is an update, not a second CV.
 *
 * Returns null when the library is full, so the caller can say so rather than silently
 * dropping the document.
 */
export async function saveCv({
  id = null,
  cv,
  label = null,
  source = null,
  profile = null,
  builder_id = null,
  taken_at = null,
}) {
  const bag = await rawRead();
  const list = [...arr(bag.cvs)];
  const at = Date.now();

  let i = id ? list.findIndex((c) => c?.id === id) : -1;
  if (i < 0 && builder_id) i = list.findIndex((c) => c?.builder_id && c.builder_id === builder_id);
  if (i < 0 && list.length >= MAX_CVS) return null;

  const was = i >= 0 ? list[i] : null;
  const next = {
    id: was?.id || id || newId(),
    label: label ?? was?.label ?? null,
    cv,
    // Editing a document handed over by the account does not make it a different document:
    // an absent `source` means "unchanged", so the badge and the link back to the site
    // survive somebody fixing a typo here.
    source: source ?? was?.source ?? 'local',
    profile,
    builder_id: builder_id ?? was?.builder_id ?? null,
    taken_at: taken_at ?? was?.taken_at ?? at,
    updated_at: at,
  };
  if (i >= 0) list[i] = next;
  else list.push(next);

  const bagNext = { ...bag, cvs: list, active_cv_id: next.id };
  await put(bagNext);
  return withActive(bagNext);
}

export async function activateCv(id) {
  const bag = await rawRead();
  if (!entry(bag, id)) return null;
  const bagNext = { ...bag, active_cv_id: id };
  await put(bagNext);
  return withActive(bagNext);
}

export async function renameCv(id, label) {
  const bag = await rawRead();
  if (!entry(bag, id)) return null;
  const list = arr(bag.cvs).map((c) =>
    c.id === id ? { ...c, label: label || null, updated_at: Date.now() } : c,
  );
  const bagNext = { ...bag, cvs: list };
  await put(bagNext);
  return withActive(bagNext);
}

/** Remove one document. If it was the active one, the most recently touched takes over. */
export async function deleteCv(id) {
  const bag = await rawRead();
  if (!entry(bag, id)) return null;
  const list = arr(bag.cvs).filter((c) => c.id !== id);
  const fallback = [...list].sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0))[0] || null;
  const bagNext = {
    ...bag,
    cvs: list,
    active_cv_id: bag.active_cv_id === id ? fallback?.id || null : bag.active_cv_id,
  };
  await put(bagNext);
  return withActive(bagNext);
}

/**
 * The profile the resolver fills from: the active CV, then the extras the user typed here
 * (address, work authorization, salary expectation: none of which the backend stores), then
 * the name from the Google identity if we were given one.
 *
 * Extras win over the CV because they are the more recent human statement. The name is
 * applied last and only when present: for a Google login it is authoritative, where
 * splitting a display string is always a guess.
 */
export function effectiveProfile(state) {
  const out = { ...(state.profile || {}) };
  for (const [k, v] of Object.entries(state.extras || {})) {
    if (v !== undefined && v !== null && String(v).trim() !== '') out[k] = String(v).trim();
  }
  if (state.given_name && !state.extras?.given_name) out.given_name = state.given_name;
  if (state.family_name && !state.extras?.family_name) out.family_name = state.family_name;
  if (out.given_name && out.family_name && !state.extras?.full_name)
    out.full_name = `${out.given_name} ${out.family_name}`;
  return out;
}

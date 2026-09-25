// The CV library: migration, the hazard it was built to fix, and the rule that keeps one copy.
//
// `store.js` is the only module that touches `chrome.storage`, so it is stubbed here with a
// plain object that remembers what was written, because what was written is the thing worth
// asserting. The derived fields (`cv`, `cv_source`, `builder_id`…) must appear on the way out
// and must never appear in that object.

import test from 'node:test';
import assert from 'node:assert/strict';

const KEY = 'epimoni';
let local = {};

globalThis.chrome = {
  storage: {
    local: {
      get: async (k) => (local[k] === undefined ? {} : { [k]: local[k] }),
      set: async (bag) => Object.assign(local, structuredClone(bag)),
      remove: async (k) => {
        delete local[k];
      },
    },
  },
};

const store = await import('../src/shared/store.js');

const seed = (bag) => {
  local = bag === undefined ? {} : { [KEY]: structuredClone(bag) };
};
const stored = () => local[KEY];
const doc = (name) => ({
  basics: { name },
  work: [],
  education: [],
  skills: [],
  languages: [],
  certificates: [],
});

test('a fresh install is not a stored record', async () => {
  // Reading state happens on every popup open. Creating a row for somebody who has installed
  // the extension and done nothing would be collecting data for no purpose, which is exactly
  // what the CWS limited-use policy forbids.
  seed(undefined);
  const state = await store.read();
  assert.equal(state.cv, null);
  assert.deepEqual(state.cvs, []);
  assert.equal(stored(), undefined, 'nothing was written');
});

test('the one-slot shape migrates into the library, keeping the CV', async () => {
  // Installs in the wild hold the old shape. Losing their CV on upgrade would be the worst
  // possible way to ship this change.
  seed({
    paired: true,
    jwt: 'j',
    cv: doc('Camille Dupont'),
    cv_source: 'site',
    cv_label: 'Mon CV',
    builder_id: 'b-1',
    profile: { email: 'c@example.org' },
    extras: { city: 'Lyon' },
  });
  const state = await store.read();
  assert.equal(state.cv.basics.name, 'Camille Dupont');
  assert.equal(state.cv_source, 'site');
  assert.equal(state.cv_label, 'Mon CV');
  assert.equal(state.builder_id, 'b-1');
  assert.equal(state.extras.city, 'Lyon', 'extras describe the person and survive');
  assert.equal(state.jwt, 'j', 'and the identity is untouched');
  assert.equal(stored().cvs.length, 1, 'persisted as a library');
  assert.equal(stored().cv, undefined, 'and the old slot is gone, so it cannot shadow');
});

test('migration runs once and is idempotent', async () => {
  seed({ cv: doc('A'), cv_source: 'local' });
  const first = await store.read();
  const id = first.active_cv_id;
  const second = await store.read();
  assert.equal(second.active_cv_id, id, 'the same document, not a second copy');
  assert.equal(stored().cvs.length, 1);
});

test('a site hand-off no longer destroys a locally typed CV', async () => {
  // The hazard the library exists to fix. One slot meant the site overwrote whatever somebody
  // had typed here, with no warning and no way back.
  seed(undefined);
  await store.saveCv({ cv: doc('Typed Here'), source: 'local' });
  await store.saveCv({ cv: doc('From The Site'), source: 'site', builder_id: 'b-9' });

  const state = await store.read();
  assert.equal(stored().cvs.length, 2, 'both survive');
  assert.equal(state.cv.basics.name, 'From The Site', 'the newcomer becomes active');
  assert.ok(
    stored().cvs.some((c) => c.cv.basics.name === 'Typed Here'),
    'and the typed one is still there',
  );
});

test('re-pairing the same site document updates it instead of piling up copies', async () => {
  // A user edits their CV on the site and pairs again. That is an update, not a second CV,
  // and matching on builder_id is what says so.
  seed(undefined);
  await store.saveCv({ cv: doc('V1'), source: 'site', builder_id: 'b-42' });
  await store.saveCv({ cv: doc('V2'), source: 'site', builder_id: 'b-42' });
  assert.equal(stored().cvs.length, 1);
  assert.equal((await store.read()).cv.basics.name, 'V2');
});

test('write refuses CV fields, so no stale copy can shadow the library', async () => {
  // The bug this prevents looks like storage losing writes: a `cv` written onto the bag would
  // be returned by the next read from the library instead, and the two would disagree forever.
  seed(undefined);
  await store.saveCv({ cv: doc('Real'), source: 'local' });
  await store.write({ cv: doc('Impostor'), cv_source: 'account', stale: true });

  assert.equal(stored().cv, undefined, 'never persisted');
  const state = await store.read();
  assert.equal(state.cv.basics.name, 'Real');
  assert.equal(state.cv_source, 'local');
  assert.equal(state.stale, true, 'non-CV fields still write normally');
});

test('a profile with no document still fills forms', async () => {
  // A paired account can send its flat profile with no CV attached. That profile is what fills
  // a form, so it stays usable at bag level as the fallback when the library is empty.
  seed(undefined);
  await store.write({ paired: true, profile: { email: 'a@example.org' } });
  assert.equal((await store.read()).profile.email, 'a@example.org');

  // …and the document's own profile wins once there is a document.
  await store.saveCv({ cv: doc('X'), source: 'local', profile: { email: 'doc@example.org' } });
  assert.equal((await store.read()).profile.email, 'doc@example.org');
});

test('activate, rename and delete', async () => {
  seed(undefined);
  const a = (await store.saveCv({ cv: doc('A'), source: 'local' })).active_cv_id;
  const b = (await store.saveCv({ cv: doc('B'), source: 'local' })).active_cv_id;

  assert.equal((await store.read()).cv.basics.name, 'B');
  await store.activateCv(a);
  assert.equal((await store.read()).cv.basics.name, 'A');

  await store.renameCv(a, 'CV court');
  assert.equal((await store.read()).cv_label, 'CV court');

  // Deleting the active one hands over rather than leaving the extension with no CV.
  await store.deleteCv(a);
  const after = await store.read();
  assert.equal(after.active_cv_id, b);
  assert.equal(after.cv.basics.name, 'B');

  assert.equal(await store.activateCv('no-such-id'), null, 'an unknown id is refused, not guessed');
});

test('a dangling active id falls back rather than losing the library', async () => {
  seed(undefined);
  await store.saveCv({ cv: doc('Only'), source: 'local' });
  local[KEY].active_cv_id = 'gone';
  assert.equal((await store.read()).cv.basics.name, 'Only');
});

test('the library is capped, and says so rather than dropping the document', async () => {
  seed(undefined);
  for (let i = 0; i < store.MAX_CVS; i += 1) await store.saveCv({ cv: doc(`CV ${i}`), source: 'local' });
  assert.equal(stored().cvs.length, store.MAX_CVS);
  assert.equal(await store.saveCv({ cv: doc('one too many'), source: 'local' }), null);
  // An update to an existing document is not a new one, so the cap does not block it.
  const first = stored().cvs[0].id;
  assert.ok(await store.saveCv({ id: first, cv: doc('edited'), source: 'local' }));
});

test('disconnecting an account keeps every CV', async () => {
  // "Se déconnecter" and "effacer mes données" are different requests. The documents are the
  // user's either way; the account is what they asked to drop.
  seed(undefined);
  await store.saveCv({ cv: doc('From account'), source: 'account', builder_id: 'b-1' });
  await store.saveCv({ cv: doc('Typed here'), source: 'local' });
  await store.write({ jwt: 'j', user_id: 'u', paired: true, extras: { city: 'Lyon' } });

  const after = await store.unpairOnly();
  assert.equal(after.jwt, undefined);
  assert.equal(after.paired, false);
  assert.equal(after.cvs.length, 2, 'both CVs survive signing out');
  assert.equal(after.extras.city, 'Lyon');
  assert.ok(
    after.cvs.every((c) => c.source !== 'account'),
    'the account is gone, the documents are still theirs',
  );
});

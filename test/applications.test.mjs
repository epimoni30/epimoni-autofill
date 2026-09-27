// The application tracker's storage rules: one entry per job page however often it is filled,
// an advert's title beats a page title and never the reverse, a status never moves back on
// its own, and the list stays bounded.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const mem = {};
globalThis.chrome = {
  storage: {
    local: {
      get: async (k) => (k in mem ? { [k]: structuredClone(mem[k]) } : {}),
      set: async (o) => Object.assign(mem, structuredClone(o)),
      remove: async (k) => delete mem[k],
    },
  },
};
const apps = await import('../src/shared/applications.js');

beforeEach(() => {
  for (const k of Object.keys(mem)) delete mem[k];
});

test('a job page is keyed without what varies between visits', () => {
  const k = apps.applicationKey;
  assert.equal(
    k('https://fr.indeed.com/viewjob?jk=abc123&from=serp&utm_source=x'),
    'fr.indeed.com/viewjob?jk=abc123',
  );
  assert.equal(
    k('https://candidat.francetravail.fr/offres/recherche/detail/186XYZ/#postuler'),
    'candidat.francetravail.fr/offres/recherche/detail/186XYZ',
  );
  assert.equal(k('https://www.linkedin.com/jobs/view/4012/?trk=abc'), 'www.linkedin.com/jobs/view/4012');
  assert.equal(k('chrome://extensions'), null);
  assert.equal(k('not a url'), null);
});

test('filling the same page twice updates one entry', async () => {
  const url = 'https://jobs.example.org/apply/42?utm_campaign=x';
  const a = await apps.recordApplication({ url, title: 'Page', fields: 3 });
  const b = await apps.recordApplication({
    url: 'https://jobs.example.org/apply/42',
    title: 'Page',
    fields: 5,
  });
  assert.equal(a.id, b.id);
  assert.equal((await apps.listApplications()).length, 1);
  assert.equal(b.fields, 5);
});

test("an advert's title replaces a page title, and a later page title does not erase it", async () => {
  const url = 'https://jobs.example.org/apply/7';
  await apps.recordApplication({ url, title: 'Postuler - Example', fields: 2 });
  await apps.recordApplication({
    url,
    title: 'Cheffe de projet',
    company: 'Example SA',
    fromAdvert: true,
    fields: 2,
  });
  const after = await apps.recordApplication({ url, title: 'Étape 2', company: '', fields: 4 });
  assert.equal(after.title, 'Cheffe de projet');
  assert.equal(after.company, 'Example SA');
});

test('a new fill never moves a status back', async () => {
  const url = 'https://jobs.example.org/apply/9';
  const a = await apps.recordApplication({ url, title: 'X', fields: 1 });
  await apps.updateApplication(a.id, { status: 'interview' });
  const again = await apps.recordApplication({ url, title: 'X', fields: 1 });
  assert.equal(again.status, 'interview');
  assert.equal(await apps.updateApplication(a.id, { status: 'hired-by-magic' }), null);
});

test('the list keeps the most recent activity when it is full', async () => {
  for (let i = 0; i < apps.MAX_APPLICATIONS + 5; i += 1)
    await apps.recordApplication({ url: `https://jobs.example.org/a/${i}`, title: `Job ${i}`, fields: 1 });
  const list = await apps.listApplications();
  assert.equal(list.length, apps.MAX_APPLICATIONS);
  assert.ok(list.some((a) => a.title === `Job ${apps.MAX_APPLICATIONS + 4}`));
});

test('the CSV quotes what needs quoting and opens in Excel as UTF-8', async () => {
  await apps.recordApplication({
    url: 'https://jobs.example.org/a/1',
    title: 'Chargée "digital", Nantes',
    company: 'Ouest',
    fromAdvert: true,
    fields: 1,
  });
  const csv = apps.applicationsCsv(await apps.listApplications(), {
    columns: ['Poste', 'Entreprise', 'Site', 'Lien', 'Statut', 'Remplie', 'Maj', 'CV', 'Note'],
    status: { filled: 'Remplie' },
  });
  assert.ok(csv.startsWith('﻿"Poste"'));
  assert.match(csv, /"Chargée ""digital"", Nantes","Ouest","jobs.example.org"/);
  assert.match(csv, /"Remplie"/);
});

// The extension against a **real** backend, with nothing stubbed.
//
// `e2e.mjs` replaces `fetch` inside the service worker, which is the only way to assert a
// call count or force a 429, but it means the worker has never actually spoken to the API.
// This run closes that gap: the built extension, a real Chromium, and a FastAPI app on
// localhost. It is not part of `npm run check` because it needs a backend and spends real
// model calls; run it deliberately.
//
//   cd back && uvicorn app.main:app --port 8000
//   cd extension && EPIMONI_API=http://127.0.0.1:8000 node build.mjs --dev && node test/live.mjs
//
// What it proves that a stub cannot: that `host_permissions` reach the API at all, that the
// worker's `Access-Token` header is the one `VerifyToken` accepts, that a session opened by
// the extension can spend a metered route, and that the response shape the panel reads is the
// shape the server sends.

import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { loadChromium } from '../tools/chromium.mjs';

const chromium = await loadChromium();

const HERE = fileURLToPath(new URL('.', import.meta.url));
const DIST = join(HERE, '..', 'dist');
const API = process.env.EPIMONI_API || 'http://127.0.0.1:8000';

const built = JSON.parse(
  await readFile(join(DIST, 'src/epimoni/api.js'), 'utf8').then((s) =>
    JSON.stringify(s.match(/export const API = '([^']*)'/)[1]),
  ),
);
if (built !== API) {
  console.log(`FAILED: dist/ points at ${built}, not ${API}.\nRun: EPIMONI_API=${API} node build.mjs --dev`);
  process.exit(1);
}
const reachable = await fetch(`${API}/docs`)
  .then((r) => r.ok)
  .catch(() => false);
if (!reachable) {
  console.log(`FAILED: no backend answering at ${API}`);
  process.exit(1);
}

const extensionIdFor = (p) =>
  [...createHash('sha256').update(p).digest('hex').slice(0, 32)]
    .map((c) => 'abcdefghijklmnop'[parseInt(c, 16)])
    .join('');

const watchdog = setTimeout(() => {
  console.log('\nFAILED: timed out after 180s');
  process.exit(1);
}, 180000);
watchdog.unref?.();

const ctx = await chromium.launchPersistentContext(await mkdtemp(join(tmpdir(), 'epimoni-live-')), {
  channel: 'chromium',
  args: [
    `--disable-extensions-except=${DIST}`,
    `--load-extension=${DIST}`,
    '--no-first-run',
    '--no-default-browser-check',
  ],
  timeout: 30000,
});
const extId = extensionIdFor(DIST);
const page = await ctx.newPage();
await page.goto(`chrome-extension://${extId}/popup.html`).catch(() => {});
let sw = null;
for (let i = 0; i < 40 && !sw; i += 1) {
  sw = ctx.serviceWorkers().find((w) => w.url().includes(extId)) || null;
  if (!sw) await page.waitForTimeout(250);
}
if (!sw) {
  console.log('FAILED: service worker never started');
  await ctx.close();
  process.exit(1);
}

const fails = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${detail ? `: ${detail}` : ''}`);
  if (!ok) fails.push(name);
};
console.log(`extension ${extId} against ${API}\n`);

// A CV typed into the extension by somebody with no account: the whole point of the run.
const CV = {
  basics: {
    name: 'Camille Dupont',
    label: { text: 'Développeuse back-end Python' },
    email: 'camille.dupont@example.org',
    phone: '+33 6 12 34 56 78',
    location: { city: 'Nantes' },
    profiles: [],
    summary: { text: "Huit ans d'expérience sur des API Python à fort trafic." },
  },
  work: [
    {
      name: 'Acme',
      position: { text: 'Développeuse back-end' },
      startDate: '2019',
      endDate: 'en cours',
      highlights: [{ text: "Conception d'une API de paiement traitant 2M de requêtes par jour" }],
    },
  ],
  education: [{ institution: 'INSA Lyon', area: 'Informatique', startDate: '2013', endDate: '2016' }],
  skills: [{ name: 'Python' }, { name: 'PostgreSQL' }, { name: 'FastAPI' }],
  languages: [{ language: 'Français', fluency: 'Natif' }],
};
const ADVERT =
  'Nous recherchons un Ingénieur Back-End Python (H/F) en CDI à Nantes. Vous rejoindrez une équipe de huit ' +
  'personnes pour concevoir et maintenir nos API de paiement. Missions : concevoir des services en Python et FastAPI, ' +
  'garantir la fiabilité de nos bases PostgreSQL, participer aux revues de code et au déploiement continu sur Kubernetes. ' +
  "Profil recherché : au moins cinq ans d'expérience en développement back-end, maîtrise de Python, bonne connaissance des " +
  'bases relationnelles, une première expérience de Kubernetes et de Terraform est un plus. Anglais professionnel requis. ' +
  'Rémunération : 50 000 à 60 000 euros selon expérience, télétravail deux jours par semaine.';

const ask = (msg) => page.evaluate((m) => new Promise((r) => chrome.runtime.sendMessage(m, r)), msg);

await sw.evaluate(async () => {
  await chrome.storage.local.clear();
  await chrome.storage.session.clear();
});
const saved = await ask({ type: 'cv:save', cv: CV, source: 'local' });
check(
  'a CV written in the extension is stored and analysable',
  saved?.ok === true && saved?.analysable === true,
  JSON.stringify(saved?.summary),
);

const state = await ask({ type: 'state' });
check(
  'and the install is usable with no account',
  state?.has_cv === true && state?.paired === false && state?.mode === 'anonymous',
  JSON.stringify({ mode: state?.mode, fields: state?.fields }),
);

// The first thing that touches the network: `/users/anonymous-login`, then `/users/me`.
const tier = await ask({ type: 'tier' });
check(
  'the worker opens its own session and reads the tier back',
  tier?.tier === 'gratuit' && tier?.mode === 'anonymous',
  JSON.stringify(tier),
);
const stored = await sw.evaluate(async () => (await chrome.storage.local.get('epimoni')).epimoni);
check(
  'the session is kept locally so it is not re-minted on every wake',
  !!stored?.anon?.jwt && !!stored.anon.user_id,
);
check(
  'and it is kept apart from the paired-account fields',
  stored?.jwt === undefined && stored?.paired === false,
);

// The metered call, for real. This runs a model and takes several seconds.
// Up to a handful of attempts, because this route genuinely refuses some of the time and is
// non-deterministic on identical inputs: the comparison gates every criterion on a quote from
// the advert, and when it can evidence none of them the backend answers 502 `scoring_empty`
// rather than serving the `global_score: 0` that an empty result computes to. A refusal is a
// correct outcome; what this test is here to prove is that a *scored* run reaches the panel
// intact, so it retries rather than treating the first refusal as a failure.
console.log('  ..    running the real analysis (a model call, ~3-20s)');
let res = null;
let refusals = 0;
let secs = 0;
for (let attempt = 1; attempt <= 4; attempt += 1) {
  const t0 = Date.now();
  res = await ask({
    type: 'analyse',
    posting: { ok: true, text: ADVERT, via: 'heuristic', words: 120 },
    host: 'candidat.francetravail.fr',
    lang: 'fr',
  });
  secs = Math.round((Date.now() - t0) / 100) / 10;
  if (process.env.EPIMONI_RAW) console.log('  RAW', JSON.stringify(res));
  if (res?.ok) break;
  if (res?.kind !== 'empty') break;
  refusals += 1;
  // Each refusal must leave the advert un-cached, or the retry below would be answered from
  // a stored failure and prove nothing.
  console.log(`  ..    attempt ${attempt} assessed nothing (502 scoring_empty); retrying`);
}
check(
  'an anonymous session can spend a metered route',
  res?.ok === true,
  res?.ok ? `${secs}s after ${refusals} refusal(s)` : JSON.stringify(res),
);
check(
  'a refusal is never cached, so a retry is a real second attempt',
  refusals === 0 || res?.cached !== true,
  `${refusals} refusal(s)`,
);
check(
  'the score is a number the panel can show',
  typeof res?.teaser?.score === 'number',
  String(res?.teaser?.score),
);
check(
  'the weakest sections come back named',
  Array.isArray(res?.teaser?.weakest) && res.teaser.weakest.length > 0,
  JSON.stringify(res?.teaser?.weakest),
);
check('an ml id is returned', !!res?.ml_id, res?.ml_id || '');
check('no link to the site is offered for a run the site cannot open', res?.linkable === false);

// Every section name the teaser can show must have a label, or the panel renders a bare
// internal key on a French form. The server decides these names, so only a live run can check.
const labels = await page.evaluate(
  (names) => names.map((n) => chrome.i18n.getMessage(`section_${n}`) || ''),
  (res?.teaser?.weakest || []).map((w) => w.name),
);
check('every section the server named has a label', labels.every(Boolean), JSON.stringify(labels));

const again = await ask({
  type: 'analyse',
  posting: { ok: true, text: ADVERT, via: 'heuristic', words: 120 },
  host: 'candidat.francetravail.fr',
  lang: 'fr',
});
check('the same advert is served from cache rather than charged twice', again?.cached === true);

await ctx.close();
clearTimeout(watchdog);
console.log(`\n${fails.length ? `FAILED: ${fails.join(', ')}` : 'all live checks passed'}`);
process.exit(fails.length ? 1 : 0);

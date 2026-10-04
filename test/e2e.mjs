// End-to-end against the *built* extension in a real Chromium: service worker, message
// passing, the bundled content script, chrome.storage, and the review panel.
//
// It drives the same path `chrome.action.onClicked` does, executeScript into the tab, then
// a `fill` message, rather than injecting the script from the page, because a content
// script needs the isolated world to have `chrome.runtime` at all.
//
// The `externally_connectable` handshake is covered by test/pair.test.mjs, not here. The site
// *bridge* is exercised here, on a page Playwright serves as https://www.epimoni30.com.

import { createServer } from 'node:http';
import { readFile, mkdtemp } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { loadChromium } from '../tools/chromium.mjs';
import { toProfile } from '../src/shared/cvdoc.js';

const chromium = await loadChromium();

/**
 * An unpacked extension's id is derived from the SHA-256 of its absolute path, with each hex
 * digit mapped onto a: p. Computing it beats waiting for a `serviceworker` event: an MV3
 * worker is not guaranteed to have started when the context opens, so waiting for it hangs:
 * and knowing the id lets us open an extension page, which wakes the worker on purpose.
 */
const extensionIdFor = (absPath) =>
  [...createHash('sha256').update(absPath).digest('hex').slice(0, 32)]
    .map((c) => 'abcdefghijklmnop'[parseInt(c, 16)])
    .join('');

// A stuck browser should fail the run, not hold the terminal.
const watchdog = setTimeout(() => {
  console.log('\nFAILED: timed out after 90s');
  process.exit(1);
}, 90000);
watchdog.unref?.();

const HERE = fileURLToPath(new URL('.', import.meta.url));
const DIST = join(HERE, '..', 'dist');

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
const server = createServer(async (req, res) => {
  try {
    const body = await readFile(join(HERE, 'fixtures', req.url.split('?')[0].replace(/^\//, '')));
    res.writeHead(200, { 'content-type': MIME[extname(req.url)] || 'text/plain' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

const profile = toProfile(JSON.parse(readFileSync(join(HERE, 'cv.fixture.json'), 'utf8')), {
  postal_code: '44000',
  street: '12 rue du Calvaire',
  country: 'France',
  work_authorization: 'Oui, ressortissant UE',
});

// `channel: 'chromium'` rather than `headless: false`.
//
// Since Playwright 1.49 the default headless browser is `chromium_headless_shell`, which
// cannot load extensions at all; the documented path for extension testing is the full
// Chromium build, which this selects and which runs in new-headless mode. It also happens to
// fix the hang this test had with `headless: false` on macOS: it opens no window, starts the
// service worker in under two seconds, and so is usable in CI.
const ctx = await chromium.launchPersistentContext(await mkdtemp(join(tmpdir(), 'epimoni-ext-')), {
  channel: 'chromium',
  args: [
    `--disable-extensions-except=${DIST}`,
    `--load-extension=${DIST}`,
    '--no-first-run',
    '--no-default-browser-check',
  ],
  timeout: 30000,
});

{
  const built = JSON.parse(readFileSync(join(DIST, 'manifest.json'), 'utf8'));
  const local = (built.host_permissions || []).some((h) => h.includes('127.0.0.1'));
  if (!local) {
    console.log(
      'FAILED: dist/ is not a dev build: run `node build.mjs --dev`.\n' +
        'Without localhost host permissions Chrome redacts tab.url and refuses executeScript,\n' +
        'so the test cannot reach its own fixture tab.',
    );
    await new Promise((r) => server.close(r));
    process.exit(1);
  }
}

const extId = extensionIdFor(DIST);
// Opening a page from the extension starts its service worker deterministically.
const waker = await ctx.newPage();
await waker.goto(`chrome-extension://${extId}/popup.html`).catch(() => {});
let sw = null;
for (let i = 0; i < 40 && !sw; i += 1) {
  sw = ctx.serviceWorkers().find((w) => w.url().includes(extId)) || null;
  if (!sw) await waker.waitForTimeout(250);
}
if (!sw) {
  console.log(`FAILED: service worker never started for ${extId}`);
  await ctx.close();
  server.close();
  process.exit(1);
}
await waker.close();

const fails = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${detail ? `: ${detail}` : ''}`);
  if (!ok) fails.push(name);
};
console.log(`extension loaded: ${extId}\n`);

// Pairing state as the service worker would have stored it after a hand-off from the site.
await sw.evaluate(async (payload) => {
  await chrome.storage.local.set({
    epimoni: {
      paired: true,
      paired_at: Date.now(),
      taken_at: Date.now(),
      jwt: '',
      user_id: 'test-user',
      user_type: 'google',
      given_name: 'Camille',
      family_name: 'Dupont-Mercier',
      cv_label: 'CV principal',
      profile: payload,
      extras: {},
    },
  });
}, profile);

const page = await ctx.newPage();
await page.goto(`${base}/france-travail.html`, { waitUntil: 'load' });
// A careers site's own button styles, as most of them have. The panel lives in the page's
// DOM, so any property it leaves unset is the page's to decide: white-on-white "undo" was
// what a real-looking form made of it.
await page.addStyleTag({ content: 'button { color: #fff; background: #0f766e; }' });

const tabId = await sw.evaluate(async (url) => {
  const tabs = await chrome.tabs.query({});
  const byUrl = tabs.find((t) => t.url?.includes(url));
  if (byUrl) return byUrl.id;
  const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return active?.id ?? null;
}, 'france-travail.html');
check('the tab is visible to the service worker', tabId !== null, `tabId=${tabId}`);

const injected = await sw.evaluate(async (id) => {
  await chrome.scripting.executeScript({ target: { tabId: id, allFrames: true }, files: ['content.js'] });
  const res = await chrome.tabs.sendMessage(id, { type: 'fill' });
  return res?.ok === true;
}, tabId);
check('content script injected and answered the fill message', injected);

await page
  .waitForFunction(() => document.getElementById('epimoni-panel') !== null, { timeout: 5000 })
  .catch(() => {});

const result = await page.evaluate(() => {
  const val = (id) => document.getElementById(id).value;
  const panel = document.getElementById('epimoni-panel')?.shadowRoot?.firstElementChild;
  return {
    prenom: val('p'),
    nom: val('n'),
    email: val('e'),
    tel: val('t'),
    cp: val('cp'),
    ville: val('v'),
    letter: val('lm'),
    cvSelect: val('cv'),
    // The component state, not the DOM: this is what a React form would actually submit.
    state: window.__state,
    panelText: panel ? panel.textContent : null,
    undoColor: panel ? getComputedStyle([...panel.querySelectorAll('button')].at(-2) || panel).color : null,
    outlined: document.querySelectorAll('[data-epimoni-filled]').length,
    submitted: window.__submitted === true,
  };
});

check('given name filled', result.prenom === 'Camille', result.prenom);
check(
  "the panel's buttons keep their own colour on a page that styles every button",
  result.undoColor && result.undoColor !== 'rgb(255, 255, 255)',
  result.undoColor,
);
check('family name filled', result.nom === 'Dupont-Mercier', result.nom);
check('email filled', result.email === profile.email, result.email);
check('phone filled', result.tel === profile.phone, result.tel);
check('postal code filled from the local extras', result.cp === '44000', result.cp);
check('city filled', result.ville === 'Nantes', result.ville);
check(
  'React state received the values, not just the DOM',
  result.state.prenom === 'Camille' && result.state.courriel === profile.email,
  JSON.stringify(result.state),
);
check('the cover letter is left empty for the AI tier', result.letter === '', JSON.stringify(result.letter));
check('the CV dropdown is untouched', result.cvSelect === '', result.cvSelect);
// The panel is written in whatever language Chrome resolves, so matching French text here
// passes on a machine running in French and fails anywhere else: the trap the popup checks
// below are careful about. Ask the extension for the strings it would render: the service
// worker's `chrome.i18n` is the one the content script's `t()` calls.
const say = await sw.evaluate(() => ({
  filled: chrome.i18n.getMessage('panel_filled_many', ['6']),
  undo: chrome.i18n.getMessage('panel_undo'),
}));
check(
  'the review panel is shown',
  !!result.panelText && result.panelText.includes(say.filled),
  (result.panelText || '').slice(0, 60),
);
check('the panel offers an undo', !!result.panelText && result.panelText.includes(say.undo), say.undo);
check('nothing was submitted', result.submitted === false);
check('filled fields are marked', result.outlined === 6, String(result.outlined));

// Radio groups: one question answered, the neighbouring ones and both checkboxes left alone.
const radioPage = await ctx.newPage();
await radioPage.goto(`${base}/radios.html`, { waitUntil: 'load' });
const radioTabId = await sw.evaluate(async () => {
  const tabs = await chrome.tabs.query({});
  const byUrl = tabs.find((t) => t.url?.includes('radios.html'));
  if (byUrl) return byUrl.id;
  const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return active?.id ?? null;
});
await sw.evaluate(async (id) => {
  await chrome.scripting.executeScript({ target: { tabId: id, allFrames: true }, files: ['content.js'] });
  await chrome.tabs.sendMessage(id, { type: 'fill' });
}, radioTabId);
await radioPage
  .waitForFunction(() => document.getElementById('epimoni-panel') !== null, { timeout: 5000 })
  .catch(() => {});
const radioResult = await radioPage.evaluate(() => ({
  authYes: document.getElementById('a1').checked,
  authNo: document.getElementById('a2').checked,
  sourceAny: document.getElementById('s1').checked || document.getElementById('s2').checked,
  remoteUntouched: document.getElementById('r1').checked && !document.getElementById('r2').checked,
  consent: document.getElementById('cgu').checked,
  newsletter: document.getElementById('news').checked,
  state: window.__state,
}));
check(
  'the work-authorisation radio is answered',
  radioResult.authYes === true && radioResult.authNo === false,
  JSON.stringify({ yes: radioResult.authYes, no: radioResult.authNo }),
);
check(
  'controlled radio state received the option value',
  radioResult.state?.autorisation === 'oui',
  JSON.stringify(radioResult.state),
);
check('a question we have no answer for is left empty', radioResult.sourceAny === false);
check('a group the user already answered is not changed', radioResult.remoteUntouched === true);
check('the consent checkbox is never ticked', radioResult.consent === false);
check('the newsletter checkbox is never ticked', radioResult.newsletter === false);

// The trap page: every control must survive untouched, including the login form's email.
const traps = await ctx.newPage();
await traps.goto(`${base}/traps.html`, { waitUntil: 'load' });
const trapTabId = await sw.evaluate(async () => {
  const tabs = await chrome.tabs.query({});
  const byUrl = tabs.find((t) => t.url?.includes('traps.html'));
  if (byUrl) return byUrl.id;
  const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return active?.id ?? null;
});
await sw.evaluate(async (id) => {
  await chrome.scripting.executeScript({ target: { tabId: id, allFrames: true }, files: ['content.js'] });
  await chrome.tabs.sendMessage(id, { type: 'fill' });
}, trapTabId);
await traps.waitForTimeout(600);
const touched = await traps.evaluate(() =>
  Array.from(document.querySelectorAll('input'))
    .filter((i) => i.value && i.value !== 'REF-2026-118')
    .map((i) => i.id),
);
check('no trap field was filled', touched.length === 0, touched.join(', '));

// ── Repeated sections: the career block by block ──────────────────────────────────────────
//
// The seed above stores a profile and no document, which is the shape an old bag migrates
// from. Blocks are filled from the document itself, so this seeds a library entry holding
// the whole CV, the way every current install stores one.
const cvDoc = JSON.parse(readFileSync(join(HERE, 'cv.fixture.json'), 'utf8'));
await sw.evaluate(
  async ({ cv, payload }) => {
    const bag = await chrome.storage.local.get('epimoni');
    await chrome.storage.local.set({
      epimoni: {
        ...bag.epimoni,
        cvs: [
          {
            id: 'cv-parcours',
            label: 'CV principal',
            source: 'local',
            cv,
            profile: payload,
            taken_at: Date.now(),
            updated_at: Date.now(),
          },
        ],
        active_cv_id: 'cv-parcours',
      },
    });
  },
  { cv: cvDoc, payload: profile },
);

const fillPage = async (file) => {
  const p = await ctx.newPage();
  await p.goto(`${base}/${file}`, { waitUntil: 'load' });
  const id = await sw.evaluate(async (f) => {
    const tabs = await chrome.tabs.query({});
    return tabs.find((t) => t.url?.includes(f))?.id ?? null;
  }, file);
  await sw.evaluate(async (tab) => {
    await chrome.scripting.executeScript({ target: { tabId: tab, allFrames: true }, files: ['content.js'] });
    await chrome.tabs.sendMessage(tab, { type: 'fill' });
  }, id);
  await p
    .waitForFunction(() => document.getElementById('epimoni-panel') !== null, { timeout: 5000 })
    .catch(() => {});
  return p;
};

const parcours = await fillPage('parcours.html');
const blockResult = await parcours.evaluate(() => ({
  state: window.__state,
  refs: ['ref_nom', 'ref_entreprise', 'ref_tel', 'ref_mail'].map(
    (n) => document.querySelector(`[name="${n}"]`).value,
  ),
  wanted: document.querySelector('[name="souhait"]').value,
  current: document.querySelector('[name="exp_a_actuel"]').checked,
  endMonth: document.querySelector('[name="exp_a_fin_m"]').value,
  panelText: document.getElementById('epimoni-panel')?.shadowRoot?.textContent || '',
  submitted: window.__submitted === true,
}));
const st = blockResult.state || {};
check(
  'each experience block got its own entry, in React state',
  st.exp_a_entreprise === 'Groupe Ouest Média' && st.exp_b_entreprise === 'Studio Kerlan',
  `${st.exp_a_entreprise} / ${st.exp_b_entreprise}`,
);
check(
  "a job's city is that job's, not the user's home",
  st.exp_a_ville === 'Rennes' && st.ville === 'Nantes',
  `${st.exp_a_ville} / ${st.ville}`,
);
check(
  'a split start date fills the month and the year dropdowns',
  st.exp_a_debut_m === '3' && st.exp_a_debut_y === '2021' && st.exp_b_debut_m === '9',
  `${st.exp_a_debut_m}/${st.exp_a_debut_y}, ${st.exp_b_debut_m}`,
);
check(
  'a bare year fills a year field and nothing more precise',
  st.edu_annee === '2018' && st.cert_date === '2022-05',
  `${st.edu_annee}, ${st.cert_date}`,
);
check(
  'a role still in progress leaves its end date empty and the box unticked',
  blockResult.endMonth === '' && blockResult.current === false,
);
check(
  'the references block is left alone',
  blockResult.refs.every((v) => v === ''),
  blockResult.refs.join('|'),
);
check('a field outside every block takes no entry', blockResult.wanted === '', blockResult.wanted);
check('nothing was submitted on the block form', blockResult.submitted === false);
const blockSay = await sw.evaluate(() => ({
  current: chrome.i18n.getMessage('panel_tick_current'),
  eduLeft: chrome.i18n.getMessage('panel_leftover', ['1', chrome.i18n.getMessage('cvsection_education')]),
  workLeft: chrome.i18n.getMessage('panel_leftover', ['1', chrome.i18n.getMessage('cvsection_work')]),
}));
check('the panel says to tick "poste actuel" by hand', blockResult.panelText.includes(blockSay.current));
check(
  'the panel names the degree the page has no block for',
  blockResult.panelText.includes(blockSay.eduLeft),
  blockResult.panelText.slice(0, 120),
);

const indexed = await fillPage('fillers/workday/my-experience.html');
const indexedResult = await indexed.evaluate(() => ({
  state: window.__state,
  panelText: document.getElementById('epimoni-panel')?.shadowRoot?.textContent || '',
}));
check(
  'ids numbered from 1 fill the first entry',
  indexedResult.state?.['workExperience-1--companyName'] === 'Groupe Ouest Média' &&
    indexedResult.state?.['workExperience-1--startDate'] === '2021-03',
  JSON.stringify(indexedResult.state).slice(0, 120),
);
check(
  'one job block against two jobs: the panel says one is left, and clicks nothing',
  indexedResult.panelText.includes(blockSay.workLeft) &&
    (await indexed.evaluate(
      () => document.querySelectorAll('[data-automation-id^="workExperience-"]').length,
    )) === 1,
);

// A filler end to end: the aria-combobox widget filler operating custom dropdowns in the real
// extension, through the guarded API, and undone by the panel, the filler's way.
const combo = await fillPage('fillers/aria-combobox/combobox.html');
const comboResult = await combo.evaluate(() => ({
  state: { ...window.__state },
  submitted: window.__submitted,
}));
check(
  'a custom dropdown is filled through the widget filler, in component state',
  comboResult.state.country === 'France' &&
    comboResult.state.city === 'Nantes' &&
    comboResult.state.lang_a === 'Français',
  JSON.stringify(comboResult.state),
);
check('the birth-country dropdown is left alone', !comboResult.state.birth, String(comboResult.state.birth));
check('the submit button inside a dropdown was never pressed', comboResult.submitted === false);
const undoLabel = await sw.evaluate(() => chrome.i18n.getMessage('panel_undo'));
await combo.getByRole('button', { name: undoLabel }).click();
await combo.waitForFunction(() => window.__state.country === '', { timeout: 3000 }).catch(() => {});
const afterUndo = await combo.evaluate(() => ({ ...window.__state }));
check(
  'undo reverts a widget the filler filled',
  afterUndo.country === '' && afterUndo.lang_a === '',
  JSON.stringify(afterUndo),
);
await combo.close();
await parcours.close();
await indexed.close();

// ── The CV's PDF, dropped into the form's CV upload ─────────────────────────────────────
//
// Kept against the active library entry in IndexedDB, sent to a page only once it turns out to
// have a CV upload, and put into that upload and no other.
const pdfText = '%PDF-1.4 e2e';
const opener = await ctx.newPage();
await opener.goto(`chrome-extension://${extId}/popup.html`);
const askWorker = (msg) => opener.evaluate((m) => new Promise((r) => chrome.runtime.sendMessage(m, r)), msg);
const pdfData = Buffer.from(pdfText).toString('base64');
const notPdf = await askWorker({
  type: 'cv:file:set',
  id: 'cv-parcours',
  name: 'photo.png',
  mime: 'image/png',
  data: pdfData,
});
check('a file that is not a PDF is refused by the worker', notPdf.error === 'type', JSON.stringify(notPdf));
const kept = await askWorker({
  type: 'cv:file:set',
  id: 'cv-parcours',
  name: 'Manon-Leroy-CV.pdf',
  mime: 'application/pdf',
  data: pdfData,
});
check('a PDF is kept against the active CV', kept.ok === true && kept.file?.name === 'Manon-Leroy-CV.pdf');
const listed = await askWorker({ type: 'cv:list' });
check(
  'the library says which CV has a PDF',
  listed.cvs?.find((c) => c.id === 'cv-parcours')?.file?.name === 'Manon-Leroy-CV.pdf',
);

const uploads = await fillPage('uploads.html');
await uploads
  .waitForFunction(() => document.getElementById('cv-picked').textContent !== '', { timeout: 3000 })
  .catch(() => {});
const upResult = await uploads.evaluate(async () => {
  const zone = document.querySelector('#cv-zone input');
  return {
    picked: document.getElementById('cv-picked').textContent,
    bytes: zone.files[0] ? await zone.files[0].text() : null,
    type: zone.files[0]?.type || null,
    others: [...document.querySelectorAll('input[type="file"]')]
      .filter((i) => i !== zone && i.files.length)
      .map((i) => i.name),
    submitted: window.__submitted === true,
  };
});
check(
  'the PDF lands in the CV upload, read by the page on change',
  upResult.picked === 'Manon-Leroy-CV.pdf',
  upResult.picked,
);
check(
  'its bytes arrive intact, as a PDF',
  upResult.bytes === pdfText && upResult.type === 'application/pdf',
  String(upResult.bytes),
);
check('no other upload gets a file', upResult.others.length === 0, upResult.others.join(', '));
await uploads.getByRole('button', { name: undoLabel }).click();
const upUndone = await uploads.evaluate(() => document.querySelector('#cv-zone input').files.length);
check('undo empties the CV upload', upUndone === 0, String(upUndone));
// A second click, the way an ATS that uploads on change and then empties its input looks.
const clickFill = async (file) =>
  sw.evaluate(async (f) => {
    const tabs = await chrome.tabs.query({});
    const tab = tabs.find((t) => t.url?.includes(f))?.id;
    await chrome.tabs.sendMessage(tab, { type: 'fill' });
  }, file);
await clickFill('uploads.html');
await uploads.waitForTimeout(400);
const reattached = await uploads.evaluate(() => document.querySelector('#cv-zone input').files.length);
check('after undo, a click attaches the PDF again', reattached === 1, String(reattached));
await uploads.evaluate(() => {
  document.querySelector('#cv-zone input').value = '';
});
await clickFill('uploads.html');
await uploads.waitForTimeout(400);
const twice = await uploads.evaluate(() => document.querySelector('#cv-zone input').files.length);
check('an upload the page emptied after taking the PDF is not given it twice', twice === 0, String(twice));
await uploads.close();

// Without a PDF of the user's own, one is made from the CV: the same document, as a file.
await askWorker({ type: 'cv:file:remove', id: 'cv-parcours' });
const madeMeta = (await askWorker({ type: 'cv:list' })).cvs?.find((c) => c.id === 'cv-parcours')?.file;
check(
  'with no PDF of their own, the library offers one made from the CV',
  madeMeta?.origin === 'generated' && madeMeta?.name === 'CV-Camille-Dupont-Mercier.pdf',
  JSON.stringify(madeMeta),
);
const made = await fillPage('uploads.html');
await made
  .waitForFunction(() => document.getElementById('cv-picked').textContent !== '', { timeout: 3000 })
  .catch(() => {});
const madeResult = await made.evaluate(async () => {
  const f = document.querySelector('#cv-zone input').files[0];
  const src = f ? await f.text() : '';
  return {
    name: f?.name || null,
    head: src.slice(0, 9),
    tail: src.slice(-6),
    hasName: src.includes('(Camille Dupont-Mercier)'),
  };
});
check(
  'the made PDF lands in the CV upload, a complete file carrying the CV',
  madeResult.name === 'CV-Camille-Dupont-Mercier.pdf' &&
    madeResult.head === '%PDF-1.4\n' &&
    madeResult.tail === '%%EOF\n' &&
    madeResult.hasName,
  JSON.stringify(madeResult),
);

// ── Several CVs: the panel's picker ─────────────────────────────────────────────────────
//
// A second, thin CV: a name and nothing else, so nothing is made from it. Choosing it in the
// panel refills this page from it, leaves the CV upload empty, and changes nothing for the
// rest of the extension.
await sw.evaluate(async () => {
  const bag = await chrome.storage.local.get('epimoni');
  const thin = {
    id: 'cv-thin',
    label: 'CV court',
    source: 'local',
    cv: { basics: { name: 'Inès Garnier', email: 'ines@example.org' } },
    profile: {
      full_name: 'Inès Garnier',
      given_name: 'Inès',
      family_name: 'Garnier',
      email: 'ines@example.org',
    },
    updated_at: Date.now(),
  };
  await chrome.storage.local.set({ epimoni: { ...bag.epimoni, cvs: [...bag.epimoni.cvs, thin] } });
});
const pickerOptions = await made.evaluate(() =>
  [...(document.getElementById('epimoni-panel')?.shadowRoot?.querySelectorAll('select option') || [])].map(
    (o) => o.textContent,
  ),
);
check('with one CV, the panel shows no picker', pickerOptions.length === 0, pickerOptions.join(', '));
await made.close();

const picked = await fillPage('uploads.html');
const shadowSelect = picked.locator('#epimoni-panel select');
const listed2 = await shadowSelect.locator('option').allTextContents();
check(
  'with two CVs, the panel lists both',
  listed2.length === 2 && listed2.includes('CV court'),
  listed2.join(', '),
);
// By keyboard, as a person would: \`selectOption\` dispatches synthetic events, and the panel
// acts only on trusted ones, which is exactly what keeps a page's script from driving it.
await shadowSelect.selectOption('cv-thin');
const scripted = await picked.evaluate(() => document.querySelector('#cv-zone input').files.length);
check('a scripted change of CV does nothing', scripted === 1, String(scripted));
await shadowSelect.selectOption('cv-parcours');
await shadowSelect.focus();
// Type-ahead: on a closed select, typing an option's first letters selects it on every
// platform, where the arrow keys open a native menu on macOS.
await picked.keyboard.type('CV c');
await picked.waitForTimeout(600);
const afterPick = await picked.evaluate(() => ({
  file: document.querySelector('#cv-zone input').files.length,
  selected: document.getElementById('epimoni-panel')?.shadowRoot?.querySelector('select')?.value,
}));
check(
  'choosing the thin CV refills the page from it: no PDF for a CV with nothing to print',
  afterPick.file === 0 && afterPick.selected === 'cv-thin',
  JSON.stringify(afterPick),
);
const stillActive = (await askWorker({ type: 'cv:list' })).cvs?.find((c) => c.active)?.id;
check(
  'the choice is for this page only: the active CV is unchanged',
  stillActive === 'cv-parcours',
  stillActive,
);
await picked.close();
// The popup sets the CV the extension uses everywhere, which is the other half of the choice.
const pop = await ctx.newPage();
await pop.goto(`chrome-extension://${extId}/popup.html`);
await pop.waitForSelector('#cv-pick', { timeout: 3000 }).catch(() => {});
const popOptions = await pop.locator('#cv-pick option').count();
await pop.selectOption('#cv-pick', 'cv-thin');
await pop.waitForTimeout(300);
const nowActive = (await askWorker({ type: 'cv:list' })).cvs?.find((c) => c.active)?.id;
check(
  'the popup lists both CVs and switches the active one',
  popOptions === 2 && nowActive === 'cv-thin',
  `${popOptions} / ${nowActive}`,
);
await pop.selectOption('#cv-pick', 'cv-parcours');
await pop.waitForTimeout(300);
await pop.close();
await sw.evaluate(async () => {
  const bag = await chrome.storage.local.get('epimoni');
  await chrome.storage.local.set({
    epimoni: { ...bag.epimoni, cvs: bag.epimoni.cvs.filter((c) => c.id !== 'cv-thin') },
  });
});

// ── A form that grows after the fill ──────────────────────────────────────────────────────
//
// The next step of a wizard is filled as it appears, without another click; a field the user
// emptied after the fill stays empty; and once they undo, the page is no longer watched.
const steps = await fillPage('steps.html');
const firstStep = await steps.evaluate(() => document.getElementById('e').value);
check('the first step is filled on the click', firstStep === profile.email, firstStep);
await steps.fill('#e', '');
await steps.click('#next');
await steps.waitForFunction(() => document.getElementById('t')?.value, { timeout: 3000 }).catch(() => {});
const grown = await steps.evaluate(() => ({
  tel: document.getElementById('t')?.value ?? null,
  ville: document.getElementById('v')?.value ?? null,
  email: document.getElementById('e').value,
  panel: document.getElementById('epimoni-panel')?.shadowRoot?.textContent || '',
  submitted: window.__submitted === true,
}));
check(
  'the next step is filled as it appears, with no second click',
  grown.tel === profile.phone && grown.ville === 'Nantes',
  `${grown.tel} / ${grown.ville}`,
);
check('a field the user emptied is not filled again', grown.email === '', grown.email);
const fiveFilled = await sw.evaluate(() => chrome.i18n.getMessage('panel_filled_many', ['5']));
check('the panel counts the new fields', grown.panel.includes(fiveFilled), fiveFilled);
check('nothing was submitted on the growing form', grown.submitted === false);

// ── The application tracker ──────────────────────────────────────────────────────────────
//
// The fill recorded this page, once, and the re-fill brought its field count up to date. The
// user says when they sent it: the extension never submits, so it cannot know.
await steps.waitForTimeout(300);
const stepApps = ((await askWorker({ type: 'app:list' })).apps || []).filter((a) =>
  a.url.includes('steps.html'),
);
check(
  'a fill adds the page to the tracker, once, and the re-fill updates it',
  stepApps.length === 1 && stepApps[0].fields === 5 && stepApps[0].status === 'filled',
  JSON.stringify(stepApps.map((a) => [a.fields, a.status, a.title])),
);
const sentLabel = await sw.evaluate(() => chrome.i18n.getMessage('panel_mark_applied'));
await steps.locator('#epimoni-panel').getByRole('button', { name: sentLabel }).click();
await steps.waitForTimeout(300);
const afterSent = ((await askWorker({ type: 'app:list' })).apps || []).find((a) =>
  a.url.includes('steps.html'),
);
check('"J\'ai envoyé ma candidature" marks it as sent', afterSent?.status === 'applied', afterSent?.status);
const tracker = await ctx.newPage();
await tracker.goto(`chrome-extension://${extId}/dashboard.html#candidatures`);
await tracker.waitForSelector('.app', { timeout: 3000 }).catch(() => {});
const trackerView = await tracker.evaluate(() => ({
  cards: document.querySelectorAll('.app').length,
  steps: [...document.querySelectorAll('.app')]
    .find((c) => c.querySelector('a')?.href.includes('steps.html'))
    ?.querySelector('select')?.value,
  raw: [...document.body.innerText.matchAll(/\b(trk|panel|opt)_[a-z_]+/g)].map((m) => m[0]),
}));
check(
  'the dashboard opens on the applications, listed with their status',
  trackerView.cards >= 1 && trackerView.steps === 'applied' && trackerView.raw.length === 0,
  JSON.stringify(trackerView),
);
// The board: a column per status, a card moved by dragging it, and one added by hand.
const board = await tracker.evaluate(() => ({
  cols: [...document.querySelectorAll('.col')].map((c) => c.dataset.status),
  inApplied: [...document.querySelectorAll('.col[data-status="applied"] .app a')].some((a) =>
    a.href.includes('steps.html'),
  ),
}));
check(
  'the applications are a board, one column per status, the sent one under "Envoyée"',
  board.cols.join() === 'filled,applied,interview,offer,rejected' && board.inApplied,
  JSON.stringify(board),
);
await tracker
  .locator('.col[data-status="applied"] .app', { has: tracker.locator('a[href*="steps.html"]') })
  .dragTo(tracker.locator('.col[data-status="interview"]'));
await tracker.waitForTimeout(300);
const dragged = ((await askWorker({ type: 'app:list' })).apps || []).find((a) =>
  a.url.includes('steps.html'),
);
const draggedShown = await tracker.evaluate(() =>
  [...document.querySelectorAll('.col[data-status="interview"] .app a')].some((a) =>
    a.href.includes('steps.html'),
  ),
);
check(
  'dragging a card to another column moves the application, saved',
  dragged?.status === 'interview' && draggedShown,
  JSON.stringify([dragged?.status, draggedShown]),
);
await tracker.click('#trk-add');
await tracker.click('#trk-add-form button[type="submit"]');
const needTitle = await tracker.textContent('#trk-add-msg');
await tracker.fill('#trk-add-title', 'Analyste données');
await tracker.fill('#trk-add-company', 'Acme');
await tracker.fill('#trk-add-url', 'jobs.example.org/offre/12');
await tracker.click('#trk-add-form button[type="submit"]');
await tracker.waitForTimeout(300);
const added = ((await askWorker({ type: 'app:list' })).apps || []).find(
  (a) => a.title === 'Analyste données',
);
const addedView = await tracker.evaluate(() => ({
  formHidden: document.getElementById('trk-add-form').hidden,
  inApplied: [...document.querySelectorAll('.col[data-status="applied"] .app-title')].some(
    (a) => a.textContent === 'Analyste données',
  ),
}));
check(
  'an application added by hand needs a title, then lands under "Envoyée" with its link',
  Boolean(needTitle) &&
    added?.manual === true &&
    added.url === 'https://jobs.example.org/offre/12' &&
    added.status === 'applied' &&
    addedView.formHidden &&
    addedView.inApplied,
  JSON.stringify({ needTitle, added, addedView }),
);
// One page, two views: the menu switches between them, and the CV's save bar belongs to the
// CV view only.
const views = async () =>
  tracker.evaluate(() => ({
    cv: !document.querySelector('[data-view="cv"]').hidden,
    apps: !document.querySelector('[data-view="candidatures"]').hidden,
    bar: !document.querySelector('.bar').hidden,
    current: document.querySelector('[aria-current="page"]')?.dataset.nav,
    count: document.getElementById('nav-count').textContent,
  }));
const onApps = await views();
check(
  'the applications view shows alone, without the save bar, and the menu counts them',
  onApps.apps && !onApps.cv && !onApps.bar && onApps.current === 'candidatures' && Number(onApps.count) >= 1,
  JSON.stringify(onApps),
);
await tracker.click('[data-nav="cv"]');
await tracker.waitForTimeout(200);
const onCv = await views();
check(
  'the menu switches to the CV, with its save bar',
  onCv.cv && !onCv.apps && onCv.bar && onCv.current === 'cv',
  JSON.stringify(onCv),
);
await tracker.close();
await steps.getByRole('button', { name: undoLabel }).click();
await steps.click('#more');
await steps.waitForTimeout(800);
const afterStop = await steps.evaluate(() => document.getElementById('li')?.value ?? null);
check('after undo, a new question is left alone', afterStop === '', String(afterStop));
await steps.close();

// ── The "Remplir avec Epimoni" button ────────────────────────────────────────────────────
//
// Offered on a page once it holds an application form, here only after "Postuler" renders it;
// the page is filled on the button's click and not before. After that fill, the panel offers to
// make the site fill on its own, which on a declared site takes one click.
const offerPage = await ctx.newPage();
await offerPage.goto(`${base}/late.html`, { waitUntil: 'load' });
await offerPage.waitForTimeout(1200);
const pillBefore = await offerPage.evaluate(() => Boolean(document.getElementById('epimoni-offer')));
await offerPage.click('#apply');
await offerPage.waitForSelector('#epimoni-offer', { timeout: 4000 }).catch(() => {});
const pillShown = await offerPage.evaluate(() => ({
  pill: document.getElementById('epimoni-offer')?.shadowRoot?.textContent || '',
  prenom: document.querySelector('[name="prenom"]')?.value,
}));
const offerLabel = await sw.evaluate(() => chrome.i18n.getMessage('offer_fill'));
check(
  'the button appears once an application form does, and fills nothing on its own',
  !pillBefore && pillShown.pill.includes(offerLabel) && pillShown.prenom === '',
  JSON.stringify({ pillBefore, ...pillShown }),
);
// A framework that re-renders the whole document drops nodes it did not make (seen on a real
// Greenhouse board after a failed React hydration): the button must come back.
await offerPage.evaluate(() => document.getElementById('epimoni-offer').remove());
await offerPage.waitForSelector('#epimoni-offer', { timeout: 4000 }).catch(() => {});
check(
  'a button the page removed is put back',
  await offerPage.evaluate(() => Boolean(document.getElementById('epimoni-offer'))),
);
await offerPage.locator('#epimoni-offer').getByRole('button', { name: offerLabel }).click();
await offerPage
  .waitForFunction(() => document.getElementById('epimoni-panel'), null, { timeout: 5000 })
  .catch(() => {});
const afterPill = await offerPage.evaluate(() => ({
  values: ['prenom', 'nom', 'email', 'tel'].map((n) => document.querySelector(`[name="${n}"]`).value),
  pill: Boolean(document.getElementById('epimoni-offer')),
  submitted: Boolean(window.__submitted),
}));
check(
  'one click on the button fills the form, the button gives way to the panel, nothing is sent',
  afterPill.values.every(Boolean) && !afterPill.pill && !afterPill.submitted,
  JSON.stringify(afterPill),
);
const alwaysLabel = await sw.evaluate(() => chrome.i18n.getMessage('panel_always_on'));
await offerPage.locator('#epimoni-panel').getByRole('button', { name: alwaysLabel }).click();
await offerPage.waitForTimeout(300);
const alwaysOn = await askWorker({ type: 'site:status', url: `${base}/late.html` });
check(
  '"Toujours remplir ici" turns automatic filling on for the site in one click',
  alwaysOn.auto === true,
  JSON.stringify(alwaysOn),
);
await askWorker({ type: 'site:disable', host: '127.0.0.1' });
await offerPage.close();

// ── Automatic filling, on a site the user turned it on for ──────────────────────────────
//
// Off everywhere by default: the page is filled when the user clicks. Turned on for a site, an
// application form is filled as it appears, here only after "Postuler" renders it at a new
// address, and the panel says why and how to stop. 127.0.0.1 is declared by the dev build, so
// this needs no permission; the registration path for other sites is test/sites.test.mjs.
const autoOn = await askWorker({ type: 'site:enable', host: '127.0.0.1', scheme: 'http' });
const autoStatus = await askWorker({ type: 'site:status', url: `${base}/late.html` });
check(
  'automatic filling turns on for a declared site without asking the browser',
  autoOn.ok && autoOn.declared && autoStatus.auto && autoStatus.granted,
  JSON.stringify({ autoOn, autoStatus }),
);
const late = await ctx.newPage();
await late.goto(`${base}/late.html`, { waitUntil: 'load' });
await late.waitForTimeout(1200);
const beforeApply = await late.evaluate(() => document.getElementById('epimoni-panel') !== null);
await late.click('#apply');
await late
  .waitForFunction(() => document.getElementById('epimoni-panel') !== null, { timeout: 5000 })
  .catch(() => {});
await late.waitForTimeout(300);
const autoFilled = await late.evaluate(() => ({
  values: ['prenom', 'nom', 'email', 'tel'].map((n) => document.querySelector(`[name="${n}"]`).value),
  panel: document.getElementById('epimoni-panel')?.shadowRoot?.textContent || '',
  submitted: Boolean(window.__submitted),
}));
const autoLine = await sw.evaluate(() => chrome.i18n.getMessage('panel_auto_filled'));
check(
  'nothing happens before the form exists, then the form is filled as it appears, unclicked',
  !beforeApply &&
    autoFilled.values.every(Boolean) &&
    autoFilled.panel.includes(autoLine) &&
    !autoFilled.submitted,
  JSON.stringify({ beforeApply, ...autoFilled, panel: autoFilled.panel.slice(0, 120) }),
);
const offLabel = await sw.evaluate(() => chrome.i18n.getMessage('panel_auto_off'));
await late.locator('#epimoni-panel').getByRole('button', { name: offLabel }).click();
await late.waitForTimeout(300);
const afterOff = await askWorker({ type: 'sites:list' });
const late2 = await ctx.newPage();
await late2.goto(`${base}/late.html`, { waitUntil: 'load' });
await late2.waitForTimeout(600);
await late2.click('#apply');
await late2.waitForTimeout(1500);
const offFilled = await late2.evaluate(() => ({
  panel: document.getElementById('epimoni-panel') !== null,
  prenom: document.querySelector('[name="prenom"]')?.value,
}));
check(
  '"Désactiver" in the panel turns it off for the site, and the next visit waits for a click',
  (afterOff.sites || []).length === 0 && !offFilled.panel && offFilled.prenom === '',
  JSON.stringify({ afterOff, offFilled }),
);
await late.close();
await late2.close();
await opener.close();

// ── The offer analysis, and the rule the whole design exists to keep ──────────────────────
//
// `/ml/analyse/cvVSoffer-doc` is metered: one free call an hour, then the paid passes. The
// teaser and the "voir l'analyse complète" link must therefore cost **one** call between
// them, not two: the trap recorded in project_quota_follow_ups, where a memo hit is still
// charged. `fetch` is stubbed inside the service worker rather than intercepted at the
// network layer, so the count is of calls the worker actually decided to make.
//
// The message is sent from an extension page, not from the worker: `chrome.runtime.sendMessage`
// does not deliver to a listener in the *same* context, so a worker messaging itself silently
// resolves to undefined. An extension page is also the honest shape: in production the sender
// is the content script, and either way the worker is on the receiving end.
const extPage = await ctx.newPage();
await extPage.goto(`chrome-extension://${extId}/popup.html`);

const stubWorker = async (reply) =>
  sw.evaluate(async (r) => {
    globalThis.__calls = [];
    await chrome.storage.session.remove('analysis_cache');
    const bag = await chrome.storage.local.get('epimoni');
    // Written as a library entry, because that is where a CV lives. A `cv` at top level is
    // stripped on the way in and shadowed on the way out, which is the invariant that stops a
    // stale copy disagreeing with the list, and it applies to a test seed like anything else.
    // Enough of a CV to clear the analysable floor: a name alone is refused before anything is
    // spent, which is a rule the unit tests own and this stub must not trip over.
    await chrome.storage.local.set({
      epimoni: {
        ...bag.epimoni,
        stale: false,
        jwt: 'test-jwt',
        cvs: [
          {
            id: 'cv-test',
            label: 'CV principal',
            source: 'account',
            builder_id: 'b-77',
            cv: {
              basics: { name: 'Camille Dupont' },
              work: [{ name: 'Acme' }],
              skills: [{ name: 'Python' }],
            },
            profile: null,
            taken_at: Date.now(),
            updated_at: Date.now(),
          },
        ],
        active_cv_id: 'cv-test',
      },
    });
    globalThis.fetch = async (url) => {
      globalThis.__calls.push(String(url));
      if (r.status !== 200) return { ok: false, status: r.status, json: async () => r.body };
      return { ok: true, status: 200, json: async () => r.body };
    };
  }, reply);

const sendAnalyse = (text) =>
  extPage.evaluate(
    (t) =>
      new Promise((r) =>
        chrome.runtime.sendMessage(
          {
            type: 'analyse',
            posting: { text: t, ok: true, via: 'heuristic', words: 200 },
            host: 'candidat.francetravail.fr',
          },
          (res) => r(res),
        ),
      ),
    text,
  );

const meteredCalls = () =>
  sw.evaluate(() => (globalThis.__calls || []).filter((u) => u.includes('cvVSoffer-doc')).length);

const OK_BODY = {
  ml: {
    ml_id: 'ml-1',
    content: {
      global_score: 72,
      section_scores: { profil: 90, experience: 55, competences: 40 },
    },
  },
};

const analyse = async ({ text, reset }) => {
  if (reset) await stubWorker({ status: 200, body: OK_BODY });
  const res = await sendAnalyse(text);
  return { res, calls: await meteredCalls() };
};

const advert = 'Developpeur .NET H/F. '.repeat(30);
const first = await analyse({ text: advert, reset: true });
check(
  'the offer analysis returns a score and an ml id',
  first.res?.ok === true && first.res?.ml_id === 'ml-1',
  JSON.stringify(first.res?.teaser || first.res),
);
check(
  'the teaser names the weakest sections',
  first.res?.teaser?.weakest?.[0]?.name === 'competences',
  JSON.stringify(first.res?.teaser?.weakest),
);
check(
  'the teaser carries the builder id, so the link lands on the right document',
  first.res?.builder_id === 'b-77',
);
check(
  'a paired account gets the link back to the site',
  first.res?.linkable === true && first.res?.mode === 'account',
);

const second = await analyse({ text: advert });
check('a second look at the same advert is served from cache', second.res?.cached === true);
check('ONE metered call for one advert, not two', second.calls === 1, `calls=${second.calls}`);

const other = await analyse({ text: `Autre offre. ${advert}` });
check('a different advert is a new analysis', other.calls === 2, `calls=${other.calls}`);

// The paywall path: a 429 must reach the user as a wait, not as a silent failure.
await stubWorker({ status: 429, body: { detail: '1842' } });
const quota = await sendAnalyse('x '.repeat(80));
check(
  'a spent quota surfaces as the paywall with a wait',
  quota?.kind === 'quota' && quota?.seconds === 1842,
  JSON.stringify(quota),
);

// Once the hour is spent, both surfaces say where the plans are *before* another click is
// refused: the popup, and the panel's analysis section.
await sw.evaluate(() => {
  globalThis.fetch = async (url) => ({
    ok: true,
    status: 200,
    json: async () =>
      String(url).includes('/users/me')
        ? {
            user: { preference: { account_type: 'gratuit' } },
            rate_limit: { rate_limited: true, reset_time_seconds: 1200 },
          }
        : {},
  });
});
await extPage.reload();
const popupPlans = await extPage
  .waitForSelector('#ai-note a[href*="#pricing"]', { timeout: 5000 })
  .then((a) => a.getAttribute('href'))
  .catch(() => null);
check('a spent hour shows the plans link in the popup', !!popupPlans, popupPlans || 'no link');
const spentPanel = await fillPage('parcours.html');
const panelPlans = await spentPanel
  .waitForSelector('#epimoni-panel a[href*="#pricing"]', { timeout: 5000 })
  .then((a) => a.getAttribute('href'))
  .catch(() => null);
check('and in the panel, beside the analyse button', !!panelPlans, panelPlans || 'no link');
await spentPanel.close();

// An expired 31-day token: flagged for the popup, and filling must keep working. The profile
// is local, so losing the token costs the analysis and nothing else.
await stubWorker({ status: 401, body: {} });
const expiredRes = await sendAnalyse('y '.repeat(80));
const after = await extPage.evaluate(async () => ({
  state: await new Promise((r) => chrome.runtime.sendMessage({ type: 'state' }, r)),
  profile: await new Promise((r) => chrome.runtime.sendMessage({ type: 'profile' }, r)),
}));
check('an expired token is reported as expired', expiredRes?.kind === 'expired');
check('an expired token marks the pairing stale', after.state?.stale === true);
check(
  'filling still works with an expired token',
  Object.keys(after.profile?.profile || {}).length > 0,
  `${Object.keys(after.profile?.profile || {}).length} fields`,
);

// `ext_session_end`: declared on both sides for months and emitted by neither. It reports
// what became of one application page, and the field that justifies it is `unanswered`: how
// many suggestions the user left without answering, which no per-run event can know.
//
// Driven by actually leaving the page, not by a synthetic event: the content script runs in
// the isolated world, so a `visibilityState` overridden from the page's main world is not the
// one it reads. Navigating away fires the real `pagehide`, which is also the case worth
// proving: an event sent during teardown is exactly the kind that quietly never arrives.
await sw.evaluate(async () => {
  globalThis.__events = [];
  await chrome.storage.session.remove('telemetry_budget');
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('/api/v1/events')) {
      try {
        globalThis.__events.push(JSON.parse(init.body));
      } catch {
        /* ignore */
      }
    }
    return { ok: true, status: 200, json: async () => ({}) };
  };
});
await page.goto('about:blank');
await extPage.waitForTimeout(600);
const ended = await sw.evaluate(() =>
  (globalThis.__events || []).filter((e) => e.name === 'ext_session_end'),
);

check(
  'leaving the page reports how the application ended',
  ended.length >= 1,
  JSON.stringify(ended[0]?.meta || null),
);
check(
  'the page outcome is reported once, not once per teardown event',
  ended.length === 1,
  `${ended.length} sent`,
);
check(
  'the outcome carries counts and no field values',
  !!ended[0] && !JSON.stringify(ended[0].meta).includes('Camille'),
  JSON.stringify(ended[0]?.meta || {}),
);

// ── The cover letter, from the AI tier ──────────────────────────────────────────────────
//
// One metered call, held to the form's limit, never written into the form on its own.
const LETTER = ['Madame, Monsieur,', 'Votre annonce a retenu toute mon attention.', 'Cordialement.'];
await stubWorker({
  status: 200,
  body: {
    ml: {
      ml_id: 'ml-letter',
      content: { paragraphs: LETTER, objet: 'Candidature au poste de data analyst' },
    },
  },
});
const letterCalls = () =>
  sw.evaluate(() => (globalThis.__calls || []).filter((u) => u.includes('motivation/generate-doc')).length);
const askLetter = () =>
  extPage.evaluate(
    () =>
      new Promise((r) =>
        chrome.runtime.sendMessage(
          { type: 'letter', posting: { text: 'Annonce '.repeat(60), ok: true }, max_chars: 1500 },
          r,
        ),
      ),
  );
const letterRes = await askLetter();
check(
  'a letter comes back as text, counted against the limit',
  letterRes.ok === true &&
    letterRes.text === LETTER.join('\n\n') &&
    letterRes.limit === 1500 &&
    letterRes.within,
  JSON.stringify(letterRes).slice(0, 120),
);
await askLetter();
check(
  'asking again for the same letter makes no second call',
  (await letterCalls()) === 1,
  String(await letterCalls()),
);

const letterPage = await fillPage('letter.html');
const letterCta = await sw.evaluate(() => chrome.i18n.getMessage('panel_letter_cta'));
const insertLabel = await sw.evaluate(() => chrome.i18n.getMessage('panel_letter_insert'));
// The free skills line, on the same page: the stub CV lists Python, and the advert names it.
const skillsFound = await sw.evaluate(() => chrome.i18n.getMessage('panel_skills_found', ['1', '1']));
const markLabel = await sw.evaluate(() => chrome.i18n.getMessage('panel_skills_mark'));
const advertBefore = await letterPage.evaluate(() => document.getElementById('contents').innerHTML);
const panelSkills = await letterPage.evaluate(
  () => document.getElementById('epimoni-panel')?.shadowRoot?.textContent || '',
);
check(
  "the panel says which of the CV's skills the advert names",
  panelSkills.includes(skillsFound),
  skillsFound,
);
await letterPage.locator('#epimoni-panel').getByRole('button', { name: markLabel }).click();
const marked = await letterPage.evaluate(() => ({
  ranges: CSS.highlights.get('epimoni-skill')?.size || 0,
  text: [...(CSS.highlights.get('epimoni-skill') || [])].map((r) => r.toString()),
  html: document.getElementById('contents').innerHTML,
}));
check(
  "highlighting marks the skill in the advert without touching the page's markup",
  marked.ranges === 1 && marked.text[0] === 'Python' && marked.html === advertBefore,
  JSON.stringify({ ranges: marked.ranges, text: marked.text }),
);
const beforeInsert = await letterPage.evaluate(() => document.getElementById('lm').value);
check('the fill leaves the letter box empty', beforeInsert === '', beforeInsert);
await letterPage.locator('#epimoni-panel').getByRole('button', { name: letterCta }).click();
await letterPage
  .locator('#epimoni-panel')
  .getByRole('button', { name: insertLabel })
  .waitFor({ timeout: 3000 })
  .catch(() => {});
const shown = await letterPage.evaluate(() => ({
  box: document.getElementById('lm').value,
  panel: document.getElementById('epimoni-panel')?.shadowRoot?.textContent || '',
}));
check(
  'the letter is shown with its count, and the box is still empty until the user inserts it',
  shown.box === '' && shown.panel.includes('Votre annonce a retenu') && shown.panel.includes('/ 1500'),
  shown.panel.slice(0, 160),
);
await letterPage.locator('#epimoni-panel').getByRole('button', { name: insertLabel }).click();
const inserted = await letterPage.evaluate(() => ({
  box: document.getElementById('lm').value,
  submitted: window.__submitted === true,
}));
check(
  '"Insérer" puts the letter in the box, and nothing is sent',
  inserted.box === LETTER.join('\n\n') && !inserted.submitted,
);
// The same letter as a file, made here from the text and the CV's name and contact.
const pdfLabel = await sw.evaluate(() => chrome.i18n.getMessage('panel_letter_pdf'));
const [letterDl] = await Promise.all([
  letterPage.waitForEvent('download', { timeout: 5000 }),
  letterPage.locator('#epimoni-panel').getByRole('button', { name: pdfLabel }).click(),
]);
const letterPdf = readFileSync(await letterDl.path()).toString('latin1');
check(
  '"Télécharger en PDF" saves the letter as a PDF, with its subject line and every paragraph',
  letterDl.suggestedFilename().startsWith('Lettre-') &&
    letterPdf.startsWith('%PDF-1.4') &&
    letterPdf.includes('(Candidature au poste de data analyst)') &&
    letterPdf.includes('(Votre annonce a retenu toute mon attention.)'),
  letterDl.suggestedFilename(),
);
await letterPage.getByRole('button', { name: undoLabel }).click();
const letterUndone = await letterPage.evaluate(() => document.getElementById('lm').value);
check('"Tout annuler" takes the letter back out', letterUndone === '', letterUndone.slice(0, 40));
await letterPage.close();

// The popup's "Rédiger la lettre de motivation": one click there, and the page is filled and the
// letter written, with nothing more to press but "Insérer".
await stubWorker({ status: 200, body: { ml: { ml_id: 'ml-letter-2', content: { paragraphs: LETTER } } } });
const viaPopup = await ctx.newPage();
await viaPopup.goto(`${base}/letter.html`, { waitUntil: 'load' });
await sw.evaluate(async () => {
  const tabs = await chrome.tabs.query({});
  const tab = tabs.find((x) => x.url?.includes('letter.html'))?.id;
  await chrome.scripting.executeScript({ target: { tabId: tab, allFrames: true }, files: ['content.js'] });
  await chrome.tabs.sendMessage(tab, { type: 'fill', after: 'letter' });
});
await viaPopup
  .locator('#epimoni-panel')
  .getByRole('button', { name: insertLabel })
  .waitFor({ timeout: 4000 })
  .catch(() => {});
const popupLetter = await viaPopup.evaluate(() => ({
  shown: (document.getElementById('epimoni-panel')?.shadowRoot?.textContent || '').includes(
    'Votre annonce a retenu',
  ),
  box: document.getElementById('lm').value,
}));
check(
  "the popup's letter action fills the page and writes the letter, still waiting for Insérer",
  popupLetter.shown && popupLetter.box === '',
  JSON.stringify(popupLetter),
);
await viaPopup.close();

// ── A CV tailored to the advert ─────────────────────────────────────────────────────────
//
// One paid call for proposals, which the user reviews: a rewrite is ticked, an addition (a
// bullet the CV never had) is not. The CV is made from the ticked ones only, as a new CV beside
// the original, which stays the active one. The page can then be filled from it (its PDF is
// what a CV upload gets) and the PDF downloaded.
await stubWorker({
  status: 200,
  body: {
    ml: {
      content: {
        changes: [
          {
            key: 'title',
            improved: 'Chargée de communication digitale',
            reason: 'Le titre reprend le poste visé.',
          },
          { key: 'experience.0.bullets', improved: 'Animé les réseaux sociaux Instagram' },
          { key: 'experience.4.title', improved: 'Inventé' },
        ],
      },
    },
  },
});
// A headline to rewrite: the stub CV has none, and a title where there was none is an addition.
await sw.evaluate(async () => {
  const { epimoni } = await chrome.storage.local.get('epimoni');
  epimoni.cvs[0].cv.basics.label = 'Chargée de communication';
  await chrome.storage.local.set({ epimoni });
});
const tailorPage = await fillPage('letter.html');
const tailorCta = await sw.evaluate(() => chrome.i18n.getMessage('panel_tailor_cta'));
const makeLabel = await sw.evaluate(() => chrome.i18n.getMessage('panel_tailor_make'));
const useLabel = await sw.evaluate(() => chrome.i18n.getMessage('panel_tailor_use'));
const listCvs = async () =>
  (await extPage.evaluate(() => new Promise((r) => chrome.runtime.sendMessage({ type: 'cv:list' }, r))))
    .cvs || [];
await tailorPage.locator('#epimoni-panel').getByRole('button', { name: tailorCta }).click();
await tailorPage
  .locator('#epimoni-panel')
  .getByRole('button', { name: makeLabel })
  .waitFor({ timeout: 4000 })
  .catch(() => {});
const reviewView = await tailorPage.evaluate(() => {
  const root = document.getElementById('epimoni-panel')?.shadowRoot;
  return {
    boxes: [...(root?.querySelectorAll('input[type="checkbox"]') || [])].map((b) => b.checked),
    text: root?.textContent || '',
  };
});
const addsLine = await sw.evaluate(() => chrome.i18n.getMessage('panel_tailor_adds'));
check(
  'tailoring shows the proposals first: the rewrite ticked, the addition unticked and flagged, nothing saved',
  JSON.stringify(reviewView.boxes) === '[true,false]' &&
    reviewView.text.includes(addsLine) &&
    reviewView.text.includes('Le titre reprend le poste visé.') &&
    !reviewView.text.includes('Inventé') &&
    (await listCvs()).length === 1,
  JSON.stringify(reviewView.boxes),
);
await tailorPage.locator('#epimoni-panel').getByRole('button', { name: makeLabel }).click();
await tailorPage
  .locator('#epimoni-panel')
  .getByRole('button', { name: useLabel })
  .waitFor({ timeout: 4000 })
  .catch(() => {});
const library = await listCvs();
const madeCv = library.find((c) => c.tailored);
check(
  'the ticked changes make a new CV beside the original, which stays in use, for one paid call',
  Boolean(madeCv) &&
    library.find((c) => c.active)?.id === 'cv-test' &&
    (await sw.evaluate(() => globalThis.__calls.filter((u) => u.includes('write-cv-doc')).length)) === 1,
  JSON.stringify(library.map((c) => [c.label, c.active, c.tailored])),
);
await tailorPage.locator('#epimoni-panel').getByRole('button', { name: useLabel }).click();
const inUseLine = await sw.evaluate(
  (l) => chrome.i18n.getMessage('panel_tailor_in_use', [l]),
  madeCv?.label || '',
);
await tailorPage.waitForTimeout(500);
const afterUse = await tailorPage.evaluate(
  () => document.getElementById('epimoni-panel')?.shadowRoot?.textContent || '',
);
check(
  '"Remplir avec ce CV" refills the page from it, and the panel does not offer to tailor it again',
  afterUse.includes(inUseLine) && !afterUse.includes(tailorCta),
  afterUse.slice(0, 200),
);
const tailorPdfLabel = await sw.evaluate(() => chrome.i18n.getMessage('panel_tailor_pdf'));
const [tailorDl] = await Promise.all([
  tailorPage.waitForEvent('download', { timeout: 5000 }),
  tailorPage.locator('#epimoni-panel').getByRole('button', { name: tailorPdfLabel }).click(),
]);
const tailorPdf = readFileSync(await tailorDl.path()).toString('latin1');
check(
  'the tailored CV downloads as a PDF with the ticked rewrite and without the unticked addition',
  tailorPdf.startsWith('%PDF-1.4') &&
    tailorPdf.includes('communication digitale') &&
    !tailorPdf.includes('Instagram'),
  tailorDl.suggestedFilename(),
);
await tailorPage.close();

// ── Importing the CV the person already has ─────────────────────────────────────────────
//
// The PDF is read in the dashboard, here an AES-256 "protected" one with an empty password, as
// CV builders make them; its text is shown to edit; the AI sorts it (stubbed); the new CV is
// the active one and carries the original PDF as its file.
await stubWorker({
  status: 200,
  body: {
    structured: {
      contact: { name: 'Camille Dupont-Mercier', email: 'camille.dupont@example.org' },
      title: 'Cheffe de projet digital',
      experiences: [
        {
          title: 'Cheffe de projet digital',
          company: 'Maison Lemoine',
          period: "2019 – aujourd'hui",
          bullets: ["Refonte du tunnel d'achat, +18 % de conversion."],
        },
      ],
      skills: ['Gestion de projet', 'SEO', 'Figma'],
    },
  },
});
const importer = await ctx.newPage();
await importer.goto(`chrome-extension://${extId}/dashboard.html#cv`);
await importer.waitForSelector('#pdf-import-choose');
await importer.setInputFiles(
  '#pdf-import-input',
  fileURLToPath(new URL('./fixtures/pdf/aes-256.pdf', import.meta.url)),
);
await importer
  .waitForFunction(() => document.getElementById('pdf-import-text').value.length > 100, null, {
    timeout: 5000,
  })
  .catch(() => {});
const readBack = await importer.evaluate(() => ({
  text: document.getElementById('pdf-import-text').value,
  shown: !document.getElementById('pdf-import-review').hidden,
}));
check(
  'the dashboard reads an encrypted CV PDF locally and shows its text to check first',
  readBack.shown &&
    readBack.text.includes("Refonte du tunnel d'achat, +18 % de conversion.") &&
    (await sw.evaluate(() => globalThis.__calls.filter((u) => u.includes('cv-extract-text')).length)) === 0,
  readBack.text.slice(0, 80),
);
await importer.click('#pdf-import-go');
const doneMsg = await sw.evaluate(() => chrome.i18n.getMessage('opt_pdf_import_done'));
await importer
  .waitForFunction((m) => document.getElementById('pdf-import-msg').textContent === m, doneMsg, {
    timeout: 5000,
  })
  .catch(() => {});
const imported = await importer.evaluate(
  () => new Promise((r) => chrome.runtime.sendMessage({ type: 'cv:list' }, r)),
);
const newCv = (imported.cvs || []).find((c) => c.label === 'aes-256');
check(
  'the sorted CV is created, made active, opened in the editor, and keeps the PDF as its file',
  Boolean(newCv?.active) &&
    newCv.file?.origin === 'upload' &&
    (await importer.inputValue('#b_name')) === 'Camille Dupont-Mercier' &&
    (await sw.evaluate(() => globalThis.__calls.filter((u) => u.includes('cv-extract-text')).length)) === 1,
  JSON.stringify(newCv),
);
await importer.close();

// ── No account at all ────────────────────────────────────────────────────────────────────
//
// The extension has to work for somebody who has never signed in: the CV lives here, the
// worker opens its own anonymous session, and the backend meters it at one call an hour on
// the same window as the website. This is that path end to end, in a real browser, with the
// pairing removed rather than simulated.
await sw.evaluate(async () => {
  globalThis.__calls = [];
  await chrome.storage.session.clear();
  // Deliberately the *old* one-slot shape: reading it here exercises the migration in a real
  // browser, which is the path every existing install takes on upgrade.
  await chrome.storage.local.set({
    epimoni: {
      paired: false,
      cv_source: 'local',
      cv: {
        basics: { name: 'Alex Martin', email: 'alex@example.org' },
        work: [{ name: 'Beta' }],
        skills: [{ name: 'Go' }],
      },
      profile: { full_name: 'Alex Martin', email: 'alex@example.org' },
      extras: {},
    },
  });
  globalThis.fetch = async (url) => {
    globalThis.__calls.push(String(url));
    if (String(url).includes('anonymous-login')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ jwt: 'anon-jwt', user_id: 'anon-1', user_type: 'anonymous' }),
      };
    }
    if (String(url).includes('/users/me')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          user: { preference: { account_type: 'gratuit' } },
          rate_limit: { rate_limited: false },
        }),
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        ml: {
          ml_id: 'ml-anon',
          content: { global_score: 58, section_scores: { experience: 30, profil: 80 } },
        },
      }),
    };
  };
});

const anonState = await extPage.evaluate(
  () => new Promise((r) => chrome.runtime.sendMessage({ type: 'state' }, r)),
);
check(
  'an unpaired install still reports a usable CV, and no AI',
  anonState?.has_cv === true && anonState?.ai === false,
  JSON.stringify({ has_cv: anonState?.has_cv, ai: anonState?.ai }),
);

// The AI is an Epimoni account's: refused here before any identity is resolved, so a visitor
// without one opens no session and sends nothing.
const anonRes = await sendAnalyse('Recherche developpeur Go. '.repeat(30));
const anonTier = await extPage.evaluate(
  () => new Promise((r) => chrome.runtime.sendMessage({ type: 'tier' }, r)),
);
const anonCalls = await sw.evaluate(() => globalThis.__calls || []);
check(
  'without an account the analysis is refused as such',
  anonRes?.kind === 'not-paired',
  JSON.stringify(anonRes),
);
// Usage events are left out: the previous page reports as it closes, which can land after the
// reset above. What must not happen here is a session or a model call.
const anonAi = anonCalls.filter((u) => !u.includes('/api/v1/events'));
check('and no session is opened, no model call made', anonAi.length === 0, anonAi.join(' '));
check(
  'the tier says there is no AI, without asking the server',
  anonTier?.ai === false && anonTier?.mode === 'none',
);

// The popup is a menu: fill, the AI actions, the dashboard. Without an account the AI actions
// stay visible and disabled, with the link that turns them on.
await extPage.reload();
await extPage.waitForSelector('#ai-note a', { timeout: 3000 }).catch(() => {});
const anonPopup = await extPage.evaluate(() => ({
  fill: document.getElementById('fill').disabled,
  analyse: document.getElementById('analyse').disabled,
  letter: document.getElementById('letter').disabled,
  tailor: document.getElementById('tailor').disabled,
  connect: document.querySelector('#ai-note a')?.href || null,
}));
check(
  'the popup offers the fill and shows the AI actions disabled, with the way to connect',
  !anonPopup.fill &&
    anonPopup.analyse &&
    anonPopup.letter &&
    anonPopup.tailor &&
    (() => {
      if (!anonPopup.connect) return false;
      try {
        const { hostname } = new URL(anonPopup.connect);
        return hostname === 'epimoni30.com' || hostname.endsWith('.epimoni30.com');
      } catch {
        return false;
      }
    })(),
  JSON.stringify(anonPopup),
);

// And the same in the panel: the analysis button is there, disabled, with the same link.
const anonPage = await fillPage('letter.html');
const anonPanel = await anonPage.evaluate(() => {
  const root = document.getElementById('epimoni-panel')?.shadowRoot;
  const buttons = [...(root?.querySelectorAll('button') || [])];
  return {
    disabled: buttons.filter((b) => b.disabled).length,
    links: [...(root?.querySelectorAll('a') || [])].filter((a) => a.href.includes('extension-chrome')).length,
  };
});
check(
  'the panel shows the analysis, the letter and the tailored CV disabled, each with the way to connect',
  anonPanel.disabled === 3 && anonPanel.links >= 3,
  JSON.stringify(anonPanel),
);
await anonPage.close();

// ── The CV editor ────────────────────────────────────────────────────────────────────────
//
// The surface that makes the extension usable with no Epimoni account. It is the only place a
// CV can be created, so a key that fails to resolve or a save that does not round-trip breaks
// the whole standalone path, and neither throws.
const options = await ctx.newPage();
await options.goto(`chrome-extension://${extId}/dashboard.html`);
await options.waitForTimeout(500);

const opt = await options.evaluate(() => {
  const tagged = [...document.querySelectorAll('[data-i18n]')];
  return {
    tagged: tagged.length,
    unresolved: tagged
      .filter((n) => !n.textContent.trim() || n.textContent === n.dataset.i18n)
      .map((n) => n.dataset.i18n),
    raw: (document.body.innerText.match(/__MSG_\w+__|\bopt_\w+|\bfield_\w+/g) || []).slice(0, 5),
    lang: document.documentElement.lang,
    name: document.getElementById('b_name').value,
    email: document.getElementById('b_email').value,
    entries: document.querySelectorAll('.entry').length,
  };
});
check(
  'the CV editor resolves every i18n key',
  opt.tagged > 0 && opt.unresolved.length === 0,
  opt.unresolved.join(', ') || `${opt.tagged} keys`,
);
check('the CV editor leaks no raw message keys', opt.raw.length === 0, opt.raw.join(', '));
check(
  'the CV editor loads the stored document',
  opt.name === 'Alex Martin' && opt.email === 'alex@example.org',
  `${opt.name} / ${opt.email}`,
);
check(
  'the CV editor draws a row per section, so a blank CV is still a form',
  opt.entries >= 3,
  String(opt.entries),
);

// Typed in, saved, and read back through the worker, which is the only writer, and which
// derives the flat profile that fills forms from the document rather than being handed one.
await options.fill('#b_name', 'Manon Leroy');
await options.fill('#b_phone', '0612345678');
await options.fill('#skills', 'Rust, Kubernetes');
const workPosition = await options.$('.entry input');
await workPosition.fill('Ingénieure SRE');
await options.click('#save');
await options.waitForTimeout(400);

const saved = await options.evaluate(async () => ({
  state: await new Promise((r) => chrome.runtime.sendMessage({ type: 'state' }, r)),
  profile: await new Promise((r) => chrome.runtime.sendMessage({ type: 'profile' }, r)),
  cv: await new Promise((r) => chrome.runtime.sendMessage({ type: 'cv:get' }, r)),
}));
check(
  'a CV typed into the editor is stored',
  saved.cv?.cv?.basics?.name === 'Manon Leroy',
  saved.cv?.cv?.basics?.name,
);
check(
  'the open CV structure is what is stored',
  Array.isArray(saved.cv?.cv?.work) && Array.isArray(saved.cv?.cv?.skills) && !!saved.cv?.cv?.basics,
  Object.keys(saved.cv?.cv || {}).join(','),
);
check(
  'the form profile is derived from it, so filling works immediately',
  saved.profile?.profile?.full_name === 'Manon Leroy' &&
    saved.profile?.profile?.phone === '0612345678' &&
    saved.profile?.profile?.skills === 'Rust, Kubernetes',
  JSON.stringify(saved.profile?.profile || {}),
);
check(
  'the editor reports the CV as analysable once it holds a role and skills',
  saved.state?.cv_analysable === true,
);

// ── The CV library ───────────────────────────────────────────────────────────────────────
//
// Several documents, one active. The assertions below are the three ways the old one-slot
// design lost somebody's work: saving twice, adding a CV, and switching between them.
const listOf = () =>
  options.evaluate(() => new Promise((r) => chrome.runtime.sendMessage({ type: 'cv:list' }, r)));

await options.click('#save');
await options.waitForTimeout(300);
const afterTwoSaves = await listOf();
check(
  'saving twice edits the same document rather than adding one',
  afterTwoSaves.cvs?.length === 1,
  `${afterTwoSaves.cvs?.length} in the library`,
);

await options.click('#new-cv');
await options.waitForTimeout(400);
const afterNew = await listOf();
const blankName = await options.inputValue('#b_name');
check(
  'a new CV is added and opened blank, and the first one is untouched',
  afterNew.cvs?.length === 2 && blankName === '',
  `${afterNew.cvs?.length} CVs, name "${blankName}"`,
);

await options.fill('#b_name', 'Second Document');
await options.click('#save');
await options.waitForTimeout(400);

// The row that is not active carries the "use" button; clicking it switches back.
await options.click('.cv-row:not(.active) button.link');
await options.waitForTimeout(500);
const backName = await options.inputValue('#b_name');
const finalList = await listOf();
check(
  'switching back restores the other document, with both still stored',
  backName === 'Manon Leroy' && finalList.cvs?.length === 2,
  `${backName}, ${finalList.cvs?.length} CVs`,
);
check('exactly one document is active at a time', finalList.cvs?.filter((c) => c.active).length === 1);

// The export path, run against the module the build actually shipped rather than the source.
const exported = await options.evaluate(async () => {
  const m = await import('./src/shared/cvdoc.js');
  const cv = await new Promise((r) => chrome.runtime.sendMessage({ type: 'cv:get' }, r));
  const resume = m.toJsonResume(cv.cv);
  return {
    problems: m.jsonResumeProblems(resume),
    label: resume.basics?.label,
    position: resume.work?.[0]?.position,
  };
});
check(
  'an exported CV is valid JSON Résumé, with our wrappers unwrapped',
  exported.problems?.length === 0 && typeof exported.position === 'string',
  exported.problems?.join('; ') || `position=${JSON.stringify(exported.position)}`,
);

await options.close();

// ── Filling with nothing stored ──────────────────────────────────────────────────────────
//
// The one state where the extension cannot do its job. It used to say "connect your Epimoni
// account", which is now advice about one of three ways out of it.
await sw.evaluate(async () => {
  await chrome.storage.local.remove('epimoni');
});
const bare = await ctx.newPage();
await bare.goto(`${base}/france-travail.html`, { waitUntil: 'load' });
const bareTabId = await sw.evaluate(async () => {
  const tabs = await chrome.tabs.query({});
  return tabs.find((t) => t.url?.includes('france-travail.html'))?.id ?? null;
});
await sw.evaluate(async (id) => {
  await chrome.scripting.executeScript({ target: { tabId: id, allFrames: true }, files: ['content.js'] });
  await chrome.tabs.sendMessage(id, { type: 'fill' });
}, bareTabId);
await bare
  .waitForFunction(() => document.getElementById('epimoni-panel') !== null, { timeout: 5000 })
  .catch(() => {});
const barePanel = await bare.evaluate(() => {
  const panel = document.getElementById('epimoni-panel')?.shadowRoot?.firstElementChild;
  return {
    text: panel ? panel.textContent : null,
    hasButton: !!panel?.querySelector('button'),
    filled: [...document.querySelectorAll('input')].filter((i) => i.value).length,
  };
});
check(
  'with no CV the panel explains rather than filling',
  barePanel.filled === 0 && !!barePanel.text,
  (barePanel.text || '').slice(0, 70),
);
check('and offers the CV editor as the way out', barePanel.hasButton === true);
await bare.close();

// The popup: every key must resolve, in **both** of the states it can open in. A missing one
// renders as an empty element or as the raw key, and only for whichever language is missing
// it: exactly the kind of thing that ships unnoticed from a machine running in French.
//
// Most of this popup is built at runtime rather than tagged in the markup, so a `data-i18n`
// sweep alone would now check one element. The text of the rendered panel is what is read.
const readPopup = () =>
  extPage.evaluate(() => {
    const tagged = [...document.querySelectorAll('[data-i18n]')];
    const text = document.body.innerText;
    return {
      unresolved: tagged
        .filter((n) => !n.textContent.trim() || n.textContent === n.dataset.i18n)
        .map((n) => n.dataset.i18n),
      raw: (text.match(/__MSG_\w+__|\bpopup_\w+|\bfield_\w+/g) || []).slice(0, 5),
      words: text.trim().split(/\s+/).length,
      buttons: [...document.querySelectorAll('button')].map((b) => b.textContent).join('|'),
      fillDisabled: document.getElementById('fill')?.disabled === true,
      lang: document.documentElement.lang,
    };
  });

// Storage is empty at this point: the state somebody meets on the day they install.
await extPage.reload();
await extPage.waitForTimeout(400);
const empty = await readPopup();
check(
  'the popup with no CV says so in real words',
  empty.unresolved.length === 0 && empty.words >= 4,
  `${empty.words} words, ${empty.unresolved.join(', ')}`,
);
check(
  'and offers the dashboard, with nothing to fill yet',
  empty.fillDisabled && /tableau de bord|dashboard|panel/i.test(empty.buttons),
  empty.buttons,
);
check('the popup leaks no raw message keys when empty', empty.raw.length === 0, empty.raw.join(', '));

await sw.evaluate(async () => {
  await chrome.storage.local.set({
    epimoni: {
      paired: false,
      cv_source: 'local',
      taken_at: Date.now(),
      cv: { basics: { name: 'Manon Leroy' }, work: [{ name: 'Beta' }], skills: [{ name: 'Go' }] },
      profile: { full_name: 'Manon Leroy' },
      extras: {},
    },
  });
});
await extPage.reload();
await extPage.waitForTimeout(500);
const ready = await readPopup();
check(
  'the popup with a CV resolves every key',
  ready.unresolved.length === 0 && ready.raw.length === 0,
  [...ready.unresolved, ...ready.raw].join(', ') || `${ready.words} words`,
);
check('the popup sets a document language', !!ready.lang, ready.lang);

// The pairing confirmation page, in a real browser. The listener that parks a request is
// covered by pair.test.mjs (the site's origin cannot be faked here); what only a browser can
// show is that the page renders the request, ignores a scripted click, and applies the request
// on a real one, and that nothing reaches storage before that click.
const pairId = await sw.evaluate(async () => {
  await chrome.storage.local.remove('epimoni');
  const id = crypto.randomUUID();
  await chrome.storage.session.set({
    pair_pending: {
      id,
      at: Date.now(),
      kind: 'cv-only',
      picked: { cv: { basics: { name: 'Inès Garnier', email: 'ines@example.org' } }, cv_label: 'CV du site' },
      shown: { email: null, cv_name: 'Inès Garnier', cv_label: 'CV du site' },
    },
  });
  return id;
});
const pairPage = await ctx.newPage();
await pairPage.goto(`chrome-extension://${extId}/src/epimoni/pair.html#${pairId}`);
await pairPage
  .waitForFunction(() => !document.getElementById('actions').hidden, { timeout: 5000 })
  .catch(() => {});
const shownPair = await pairPage.evaluate(() => ({
  text: document.body.innerText,
  acceptDisabled: document.getElementById('accept').disabled,
}));
check(
  'the pairing page names the CV it is asked to add',
  /Inès Garnier/.test(shownPair.text),
  shownPair.text.slice(0, 80),
);
check('and Accept is not live the instant the page appears', shownPair.acceptDisabled === true);
await pairPage.waitForTimeout(1000);
await pairPage.evaluate(() => document.getElementById('accept').click());
await pairPage.waitForTimeout(300);
const afterScripted = await sw.evaluate(
  async () => (await chrome.storage.local.get('epimoni')).epimoni || null,
);
check('a scripted click on Accept does nothing', afterScripted === null);
await pairPage.click('#accept');
await pairPage.waitForTimeout(500);
const afterAccept = await sw.evaluate(async () => {
  const bag = (await chrome.storage.local.get('epimoni')).epimoni || {};
  return (bag.cvs || []).map((c) => ({ name: c.cv?.basics?.name, source: c.source }));
});
check(
  'a real click adds the CV, marked as coming from the site',
  afterAccept.length === 1 && afterAccept[0].name === 'Inès Garnier' && afterAccept[0].source === 'site',
  JSON.stringify(afterAccept),
);
await pairPage.close();

// The site bridge, the whole way: a page served as https://www.epimoni30.com (Playwright
// answers the request, so no certificate is needed and the origin is the real one), the
// declared content script, the worker's `fromBridge`, the confirmation page and the answer
// posted back. This is the path Firefox pairs through, and the one that needs no extension id.
{
  await sw.evaluate(async () => {
    await chrome.storage.local.remove('epimoni');
    await chrome.storage.session.remove(['pair_pending', 'pair_cooldown_until']);
  });
  const site = await ctx.newPage();
  await site.route('https://www.epimoni30.com/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!doctype html><title>site</title><p>site</p>',
    }),
  );
  await site.goto('https://www.epimoni30.com/fr/extension-chrome');
  const ask = (msg) =>
    site.evaluate(
      (m) =>
        new Promise((resolve) => {
          const id = crypto.randomUUID();
          const timer = setTimeout(() => resolve({ timeout: true }), 3000);
          addEventListener('message', (e) => {
            if (e.data?.epimoni === 'response' && e.data.id === id) {
              clearTimeout(timer);
              resolve(e.data.res);
            }
          });
          postMessage({ epimoni: 'request', id, msg: m }, location.origin);
        }),
      msg,
    );
  check(
    'bridge: the site can see it is there before asking',
    await site.evaluate(() => document.documentElement.hasAttribute('data-epimoni-bridge')),
  );
  const pong = await ask({ type: 'epimoni:ping' });
  check(
    'bridge: a ping from the site is answered',
    pong?.ok === true && !!pong.version,
    JSON.stringify(pong),
  );

  const opened = ctx.waitForEvent('page', { timeout: 5000 }).catch(() => null);
  const req = await ask({
    type: 'epimoni:pair',
    cv: { basics: { name: 'Léa Bridge', email: 'lea@example.org' } },
    cv_label: 'CV du pont',
  });
  check(
    'bridge: a pairing is a request to confirm',
    req?.ok === true && req.mode === 'confirm',
    JSON.stringify(req),
  );
  const stored = await sw.evaluate(async () => (await chrome.storage.local.get('epimoni')).epimoni || null);
  check('bridge: nothing is stored before the user accepts', stored === null);
  const confirm = await opened;
  check('bridge: the confirmation page opens', !!confirm && confirm.url().includes(`pair.html#${req?.id}`));
  if (confirm) {
    await confirm.waitForFunction(() => !document.getElementById('accept').disabled, { timeout: 5000 });
    await confirm.click('#accept');
    await confirm.waitForTimeout(500);
  }
  const status = await ask({ type: 'epimoni:pair-status', id: req?.id });
  check('bridge: the site reads the outcome back', status?.status === 'accepted', JSON.stringify(status));
  const names = await sw.evaluate(async () =>
    ((await chrome.storage.local.get('epimoni')).epimoni?.cvs || []).map((c) => c.cv?.basics?.name),
  );
  check('bridge: the accepted CV is in the library', names.includes('Léa Bridge'), JSON.stringify(names));
  const refused = await ask({ type: 'epimoni:devfill', urlIncludes: '' });
  check('bridge: the dev-only hook does not cross', refused?.timeout === true, JSON.stringify(refused));
  await confirm?.close();
  await site.close();
}

// The consent page, in a Chrome build: nothing is declared optional there, so it asks
// nothing and says so. What it asks on Firefox is test/consent.test.mjs's.
{
  const allow = await ctx.newPage();
  const errors = [];
  allow.on('pageerror', (e) => errors.push(String(e)));
  await allow.goto(`chrome-extension://${extId}/src/epimoni/allow.html`);
  await allow
    .waitForFunction(() => !document.getElementById('result').hidden, { timeout: 5000 })
    .catch(() => {});
  const shown = await allow.evaluate(() => ({
    result: document.getElementById('result').textContent,
    title: document.querySelector('h1').textContent,
  }));
  const done = await sw.evaluate(() => chrome.i18n.getMessage('consent_done'));
  check(
    'consent page: on Chrome it has nothing to ask',
    shown.result === done && !!shown.title,
    JSON.stringify(shown),
  );
  check('consent page: no script errors', errors.length === 0, errors.join(' | '));
  await allow.close();
}

await ctx.close();
server.close();
clearTimeout(watchdog);
console.log(`\n${fails.length ? `FAILED: ${fails.join(', ')}` : 'all end-to-end checks passed'}`);
process.exit(fails.length ? 1 : 0);

// SPDX-License-Identifier: Apache-2.0
// The playground page. The CV is a JSON Résumé document held in this browser; filling runs the
// extension's engine (engine.js, the shipped content-script bundle) inside the fixture's frame,
// and scoring is `test/scoring.js`, the same verdicts `npm run measure` gates CI on.

import { fromJsonResume, normalizeCvDoc, toEntries, toJsonResume, toProfile } from './src/shared/cvdoc.js';
import { FIELDS } from './src/schema/fields.js';
import { SAMPLE_EXTRAS, tally, verdictOf } from './scoring.js';

const STORE = 'epimoni-playground';
const $ = (id) => document.getElementById(id);

const VERDICT = {
  hit: ['filled correctly', 'The right value in the right field.'],
  wrong: ['wrong', 'A value went where it does not belong. This must never happen.'],
  miss: ['missed', 'The engine did not recognise a field it should have.'],
  soft: ['suggested', 'Recognised, but not sure enough to fill.'],
  nodata: ['not in your CV', 'The field was named correctly; your CV has nothing to put there.'],
  ok: ['left alone', 'A trap: the field must not be filled, and was not.'],
  ai: ['left for AI', 'Open prose, routed to the optional AI tier instead of guessed.'],
  aiMiss: ['prose not routed', 'Open prose the engine should have handed to the AI tier.'],
};

// ── State ────────────────────────────────────────────────────────────────────────────────
// Browser storage is a convenience here, never a requirement: a private window, blocked site
// data or a thumbnail capture all get a working page with nothing remembered.

let state = { resume: { basics: {} }, extras: {} };

function save() {
  try {
    localStorage.setItem(STORE, JSON.stringify(state));
  } catch {
    /* nothing remembered, nothing broken */
  }
}

function restore() {
  try {
    const raw = localStorage.getItem(STORE);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.resume === 'object') return parsed;
    }
  } catch {
    /* fall through to the sample */
  }
  return null;
}

async function sample() {
  const doc = await (await fetch('sample-cv.json')).json();
  // The sample is stored in the extension's own shape; the playground edits the open format.
  return { resume: toJsonResume(normalizeCvDoc(doc)), extras: { ...SAMPLE_EXTRAS } };
}

// ── The CV form ──────────────────────────────────────────────────────────────────────────

const getPath = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
function setPath(obj, path, value) {
  const keys = path.split('.');
  let o = obj;
  for (const k of keys.slice(0, -1)) {
    if (typeof o[k] !== 'object' || o[k] === null) o[k] = {};
    o = o[k];
  }
  if (value === '') delete o[keys.at(-1)];
  else o[keys.at(-1)] = value;
}

function renderBasics() {
  for (const input of document.querySelectorAll('[data-path]')) {
    const path = input.dataset.path;
    if (path === 'skills') {
      input.value = (state.resume.skills || []).map((s) => (typeof s === 'string' ? s : s?.name || '')).join(', ');
    } else {
      const v = getPath(state.resume, path);
      input.value = typeof v === 'string' ? v : '';
    }
  }
}

function renderBlocks(section) {
  const host = $(section);
  host.replaceChildren();
  for (const [i, entry] of (state.resume[section] || []).entries()) {
    const node = $(`${section}-tpl`).content.firstElementChild.cloneNode(true);
    for (const input of node.querySelectorAll('[data-k]')) {
      const v = entry?.[input.dataset.k];
      input.value = typeof v === 'string' ? v : '';
      input.addEventListener('input', () => {
        const target = state.resume[section][i];
        if (input.value.trim()) target[input.dataset.k] = input.value;
        else delete target[input.dataset.k];
        changed();
      });
    }
    node.querySelector('.remove').addEventListener('click', () => {
      state.resume[section].splice(i, 1);
      renderBlocks(section);
      changed();
    });
    host.append(node);
  }
}

// The extras are generated from the field registry: whatever `source: 'extras'` lists there is
// what the extension asks for, so the playground cannot drift from it.
const EXTRA_LABELS = {
  street: 'Street address',
  postal_code: 'Postal code',
  country: 'Country',
  salary_expectation: 'Salary expectation',
  notice_period: 'Notice period',
  availability_date: 'Available from',
  work_authorization: 'Work authorisation',
};
function renderExtras() {
  const host = $('extras');
  host.replaceChildren();
  for (const f of FIELDS.filter((x) => x.source === 'extras')) {
    const label = document.createElement('label');
    label.textContent = EXTRA_LABELS[f.key] || f.key.replace(/_/g, ' ');
    const input = document.createElement('input');
    input.value = state.extras[f.key] || '';
    input.addEventListener('input', () => {
      if (input.value.trim()) state.extras[f.key] = input.value;
      else delete state.extras[f.key];
      changed();
    });
    label.append(input);
    host.append(label);
  }
}

function renderAll() {
  renderBasics();
  renderBlocks('work');
  renderBlocks('education');
  renderExtras();
  syncJson();
}

function syncJson() {
  if (document.activeElement !== $('json')) $('json').value = JSON.stringify(state.resume, null, 2);
}

function changed() {
  save();
  syncJson();
}

function wireForm() {
  for (const input of document.querySelectorAll('[data-path]')) {
    input.addEventListener('input', () => {
      if (input.dataset.path === 'skills') {
        const names = input.value
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        if (names.length) state.resume.skills = names.map((name) => ({ name }));
        else delete state.resume.skills;
      } else {
        setPath(state.resume, input.dataset.path, input.value.trim() ? input.value : '');
      }
      changed();
    });
  }
  for (const btn of document.querySelectorAll('[data-add]')) {
    btn.addEventListener('click', () => {
      const section = btn.dataset.add;
      state.resume[section] = [...(state.resume[section] || []), {}];
      renderBlocks(section);
      changed();
      $(section).lastElementChild?.querySelector('input')?.focus();
    });
  }
  $('sample').addEventListener('click', async () => {
    state = await sample();
    renderAll();
    save();
  });
  $('clear').addEventListener('click', () => {
    state = { resume: { basics: {} }, extras: {} };
    renderAll();
    save();
  });
  $('json-apply').addEventListener('click', () => applyJson($('json').value));
  $('json-import').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (file) applyJson(await file.text());
    e.target.value = '';
  });
  $('json-export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state.resume, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'resume.json';
    a.click();
    URL.revokeObjectURL(a.href);
  });
}

function applyJson(text) {
  $('json-error').textContent = '';
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('expected an object');
    // Through the extension's own import door, then back out as clean JSON Résumé: whatever
    // the importer accepts, the playground shows it the way the extension would store it.
    state.resume = toJsonResume(fromJsonResume(parsed));
    $('json').blur();
    renderAll();
    save();
  } catch (e) {
    $('json-error').textContent = `Not a JSON Résumé document: ${e.message}`;
  }
}

// ── The fixture and the fill ───────────────────────────────────────────────────────────────

let fixtures = [];
const frame = $('frame');

function current() {
  return fixtures.find((f) => f.path === $('fixture').value) || fixtures[0];
}

function loadFrame() {
  const f = current();
  const url = `fixtures/${f.path}`;
  $('open').href = url;
  $('fixture-meta').textContent =
    `${f.fillable} fields the form asks for · ${f.traps} traps that must stay empty` +
    (f.ai ? ` · ${f.ai} open question${f.ai > 1 ? 's' : ''} for the AI tier` : '');
  return new Promise((resolve) => {
    frame.addEventListener('load', () => resolve(), { once: true });
    frame.src = `${url}?t=${Date.now()}`;
  });
}

/** Every same-origin window in the fixture, the frame itself first, embedded ATS forms included. */
function windowsOf(win) {
  const out = [win];
  for (let i = 0; i < win.frames.length; i += 1) {
    try {
      if (win.frames[i].document) out.push(...windowsOf(win.frames[i]));
    } catch {
      /* cross-origin: the extension would reach it through all_frames, the page cannot */
    }
  }
  return out;
}

function inject(win) {
  if (win.__epimoniRun) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = win.document.createElement('script');
    s.src = new URL('engine.js', location.href).href;
    s.onload = resolve;
    s.onerror = () => reject(new Error('engine.js did not load'));
    win.document.head.append(s);
  });
}

const OUTLINE = { hit: '--hit', wrong: '--wrong', miss: '--miss', aiMiss: '--miss', soft: '--soft', nodata: '--soft', ok: '--ok', ai: '--ai' };

async function fill() {
  $('fill').disabled = true;
  document.body.dataset.state = 'filling';
  try {
    // Always on a fresh page: a second fill on an already-filled form would score a different
    // question ("does it leave filled fields alone?") than the one on screen.
    await loadFrame();
    const cv = fromJsonResume(state.resume);
    const profile = toProfile(cv, state.extras);
    const entries = toEntries(cv);
    const rows = [];
    const css = getComputedStyle(document.documentElement);
    for (const win of windowsOf(frame.contentWindow)) {
      await inject(win);
      const got = await win.__epimoniRun(profile, entries);
      const targets = win.__epimoniTargets();
      for (const r of got) {
        const verdict = verdictOf(r);
        rows.push({ ...r, verdict });
        const el = targets[r.i];
        if (el) {
          el.style.outline = `2px solid ${css.getPropertyValue(OUTLINE[verdict]).trim()}`;
          el.style.outlineOffset = '1px';
          el.title = VERDICT[verdict][0];
        }
      }
    }
    render(rows);
    window.__lastResult = { fixture: current().path, rows, tally: tally(rows) };
  } finally {
    $('fill').disabled = false;
    document.body.dataset.state = 'done';
  }
}

function stat(value, label, tone = '') {
  const d = document.createElement('div');
  d.className = `stat ${tone}`;
  const b = document.createElement('b');
  b.textContent = value;
  const s = document.createElement('span');
  s.textContent = label;
  d.append(b, s);
  return d;
}

function render(rows) {
  const t = tally(rows);
  $('totals').replaceChildren(
    stat(`${t.pct}%`, `filled (${t.hit} of ${t.fillable})`, t.pct === 100 ? 'good' : ''),
    stat(t.wrong, 'wrong fills', t.wrong ? 'bad' : 'good'),
    stat(t.ok, 'traps left alone'),
    stat(t.nodata, 'not in your CV'),
    stat(t.soft + t.miss, 'missed or unsure'),
    stat(t.ai, 'left for AI'),
  );
  const present = new Set(rows.map((r) => r.verdict));
  $('legend').replaceChildren(
    ...Object.entries(VERDICT)
      .filter(([v]) => present.has(v))
      .map(([v, [name, why]]) => {
        const s = document.createElement('span');
        s.className = `v v-${v}`;
        s.textContent = name;
        s.title = why;
        return s;
      }),
  );
  const body = $('rows').tBodies[0];
  body.replaceChildren(
    ...rows.map((r) => {
      const tr = document.createElement('tr');
      // The field: its label, and underneath the key the fixture says it asks for.
      const label = document.createElement('td');
      const expect = document.createElement('small');
      if (r.expect === 'none') expect.textContent = 'must stay empty';
      else if (r.expect === 'ai-candidate') expect.textContent = 'open question';
      else expect.append(code(r.expect));
      label.append(r.label || '(no label)', expect);
      const wrote = document.createElement('td');
      wrote.className = 'value';
      wrote.textContent = r.wroteKey ? String(r.wroteValue ?? '') : '(nothing)';
      // Only a wrong fill needs the key it was taken for: everywhere else it is the expected one.
      if (r.wroteKey && r.wroteKey !== r.expect) {
        const as = document.createElement('small');
        as.append('as ', code(r.wroteKey));
        wrote.append(as);
      }
      const verdict = document.createElement('td');
      const v = document.createElement('span');
      v.className = `v v-${r.verdict}`;
      v.textContent = VERDICT[r.verdict][0];
      v.title = VERDICT[r.verdict][1];
      verdict.append(v);
      tr.append(label, wrote, verdict);
      return tr;
    }),
  );
  $('rows').hidden = false;
}

function code(text) {
  const c = document.createElement('code');
  c.textContent = text;
  return c;
}

// ── Start ──────────────────────────────────────────────────────────────────────────────────

async function start() {
  state = restore() || (await sample());
  state.extras ||= {};
  wireForm();
  renderAll();

  fixtures = await (await fetch('fixtures.json')).json();
  const select = $('fixture');
  for (const f of fixtures) {
    const o = document.createElement('option');
    o.value = f.path;
    o.textContent = `${f.title} (${f.path})`;
    select.append(o);
  }
  const wanted = decodeURIComponent(location.hash.slice(1));
  if (fixtures.some((f) => f.path === wanted)) select.value = wanted;
  select.addEventListener('change', () => {
    history.replaceState(null, '', `#${select.value}`);
    $('totals').replaceChildren(Object.assign(document.createElement('p'), { className: 'note', textContent: 'Press Fill to score this form.' }));
    $('legend').replaceChildren();
    $('rows').hidden = true;
    loadFrame();
  });
  $('fill').addEventListener('click', fill);
  $('reset').addEventListener('click', loadFrame);
  await loadFrame();
  document.body.dataset.state = 'ready';
}

start();

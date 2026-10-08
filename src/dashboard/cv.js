// The dashboard's CV view: the CV the extension fills from, written here when nobody
// handed one over.
//
// This is the page that makes the extension usable without an Epimoni account. It reads and
// writes one document in the open CV structure the rest of the product uses (`basics`,
// `work`, `education`, `skills`, `languages`), which is why an import of a JSON Résumé
// export or of the site's own draft needs no translation layer: `normalizeCvDoc` accepts all
// three and emits the one shape.
//
// It holds no token and makes no network call. Everything goes through the worker, which is
// the only writer of extension state: two writers would be two chances for the flat profile
// that fills forms to drift from the document it is derived from.

import {
  createEmptyCv,
  emptyEducation,
  emptyLanguage,
  emptyWork,
  fieldCurrent,
  fromJsonResume,
  normalizeCvDoc,
  toJsonResume,
} from '../shared/cvdoc.js';
import { initImporter } from './importer.js';

const send = (msg) => new Promise((r) => chrome.runtime.sendMessage(msg, (x) => r(x || {})));
const el = (id) => document.getElementById(id);
const t = (key, subs) => chrome.i18n.getMessage(key, subs) || key;
const EXTRAS = [
  'street',
  'postal_code',
  'country',
  'work_authorization',
  'salary_expectation',
  'notice_period',
  'availability_date',
];

let cv = createEmptyCv();
let dirty = false;
// Which library entry is open. `null` means "not saved yet", and saving then creates one
// rather than overwriting whichever document happened to be active.
let activeId = null;
let activeLabel = null;
// The PDF a form receives for the open CV, as the library listing reports it:
// `{name, size, origin}` where origin is 'upload' (the user's own) or 'generated', or null.
let activeFile = null;

const SOURCE_BADGE = {
  account: 'opt_source_account_badge',
  site: 'opt_source_site_badge',
  local: 'opt_source_local_badge',
  tailored: 'opt_source_tailored_badge',
};
const slug = (v) =>
  String(v || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/ł/g, 'l')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);

/** Text, never innerHTML: every value on this page is the user's own data. */
function line(parent, text, className) {
  const div = document.createElement('div');
  if (className) div.className = className;
  div.textContent = text;
  parent.appendChild(div);
  return div;
}

const markDirty = () => {
  dirty = true;
  el('saved').textContent = t('opt_unsaved');
};

function field(labelKey, value, onInput, { area = false } = {}) {
  const wrap = document.createElement('div');
  const label = document.createElement('label');
  label.textContent = t(labelKey);
  const input = document.createElement(area ? 'textarea' : 'input');
  input.value = value || '';
  input.addEventListener('input', () => {
    onInput(input.value);
    markDirty();
  });
  wrap.append(label, input);
  return wrap;
}

/**
 * One repeated entry: a job, a diploma, a language.
 *
 * Rendered from a spec rather than written out three times: the three sections differ only
 * in which fields they carry, and hand-writing each one is how a "supprimer" button ends up
 * on two of them.
 */
function entryList(host, rows, spec, onChange) {
  host.textContent = '';
  rows.forEach((row, i) => {
    const box = document.createElement('div');
    box.className = 'entry';
    const head = document.createElement('div');
    head.className = 'entry-head';
    const title = document.createElement('b');
    title.textContent = t(spec.heading, [String(i + 1)]);
    const remove = document.createElement('button');
    remove.className = 'link';
    remove.textContent = t('opt_remove');
    remove.addEventListener('click', () => {
      rows.splice(i, 1);
      markDirty();
      onChange();
    });
    head.append(title, remove);
    box.appendChild(head);

    const grid = document.createElement('div');
    grid.className = `row${spec.columns === 1 ? ' one' : spec.columns === 3 ? ' three' : ''}`;
    for (const f of spec.fields) {
      grid.appendChild(field(f.label, f.get(row), (v) => f.set(row, v), { area: f.area }));
    }
    box.appendChild(grid);
    host.appendChild(box);
  });
  if (!rows.length) line(host, t(spec.empty), 'muted');
}

// `position` and the highlights are `{text}` wrappers in the builder's documents, so they are
// read through `fieldCurrent` and written back in the same shape: writing a bare string
// would work here and break the round-trip through the site.
const WORK = {
  heading: 'opt_work_n',
  empty: 'opt_work_empty',
  fields: [
    // `opt_position`, not `field_current_title`: the `field_*` keys name what a form was
    // filled with ("Poste actuel"), which is the wrong heading for a role that ended in 2019.
    {
      label: 'opt_position',
      get: (w) => fieldCurrent(w.position),
      set: (w, v) => {
        w.position = { text: v };
      },
    },
    {
      label: 'opt_employer',
      get: (w) => w.name || '',
      set: (w, v) => {
        w.name = v;
      },
    },
    {
      label: 'opt_start',
      get: (w) => w.startDate || '',
      set: (w, v) => {
        w.startDate = v;
      },
    },
    {
      label: 'opt_end',
      get: (w) => w.endDate || '',
      set: (w, v) => {
        w.endDate = v;
      },
    },
    {
      label: 'opt_highlights',
      area: true,
      get: (w) => (w.highlights || []).map((h) => fieldCurrent(h)).join('\n'),
      // One bullet per line is the only format a plain textarea can promise to round-trip.
      set: (w, v) => {
        w.highlights = v
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean)
          .map((text) => ({ text }));
      },
    },
  ],
};

const EDUCATION = {
  heading: 'opt_education_n',
  empty: 'opt_education_empty',
  fields: [
    {
      label: 'field_education_degree',
      get: (e) => e.area || '',
      set: (e, v) => {
        e.area = v;
      },
    },
    {
      label: 'field_education_institution',
      get: (e) => e.institution || '',
      set: (e, v) => {
        e.institution = v;
      },
    },
    {
      label: 'opt_start',
      get: (e) => e.startDate || '',
      set: (e, v) => {
        e.startDate = v;
      },
    },
    {
      label: 'opt_end',
      get: (e) => e.endDate || '',
      set: (e, v) => {
        e.endDate = v;
      },
    },
    {
      label: 'opt_details',
      get: (e) => e.details || '',
      set: (e, v) => {
        e.details = v;
      },
    },
  ],
};

const LANGUAGES = {
  heading: 'opt_language_n',
  empty: 'opt_languages_empty',
  fields: [
    {
      label: 'opt_language',
      get: (l) => l.language || '',
      set: (l, v) => {
        l.language = v;
      },
    },
    {
      label: 'opt_fluency',
      get: (l) => l.fluency || '',
      set: (l, v) => {
        l.fluency = v;
      },
    },
  ],
};

function renderLists() {
  entryList(el('work'), cv.work, WORK, renderLists);
  entryList(el('education'), cv.education, EDUCATION, renderLists);
  entryList(el('languages'), cv.languages, LANGUAGES, renderLists);
}

const profileUrl = (net) => {
  const hit = (cv.basics.profiles || []).find((p) =>
    String(p.network || '')
      .toLowerCase()
      .includes(net),
  );
  return hit ? hit.url : '';
};

function renderBasics() {
  const b = cv.basics;
  el('b_name').value = fieldCurrent(b.name);
  el('b_label').value = fieldCurrent(b.label);
  el('b_email').value = fieldCurrent(b.email);
  el('b_phone').value = fieldCurrent(b.phone);
  el('b_city').value = fieldCurrent(b.location?.city ?? b.location);
  el('b_summary').value = fieldCurrent(b.summary);
  el('b_linkedin').value = profileUrl('linkedin');
  el('b_portfolio').value = profileUrl('portfolio') || profileUrl('site');
  el('b_github').value = profileUrl('github');
  el('skills').value = (cv.skills || [])
    .map((s) => fieldCurrent(s.name))
    .filter(Boolean)
    .join(', ');
}

/** The form back into a CvDoc. Read on save, so nothing is lost to a missed input event. */
function collect() {
  const profiles = [];
  const add = (network, value) => {
    if (value.trim()) profiles.push({ network, url: value.trim() });
  };
  add('LinkedIn', el('b_linkedin').value);
  add('Portfolio', el('b_portfolio').value);
  add('GitHub', el('b_github').value);
  return normalizeCvDoc({
    ...cv,
    basics: {
      ...cv.basics,
      name: el('b_name').value.trim(),
      label: { text: el('b_label').value.trim() },
      email: el('b_email').value.trim(),
      phone: el('b_phone').value.trim(),
      location: { city: el('b_city').value.trim() },
      summary: { text: el('b_summary').value },
      profiles,
    },
    // Comma *or* newline: a pasted skills list from a CV comes one per line as often as not.
    skills: el('skills')
      .value.split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((name) => ({ name })),
  });
}

/**
 * The status card: where this CV came from, how much of it a form can be filled from, and
 * which allowance the AI half is on.
 *
 * The tier line is the honest half of "free fill, paid AI": a free or anonymous user is
 * metered at two analyses an hour, the website's own window, not a second allowance, and a paying customer is not metered at all. Saying so here means nobody meets
 * that limit for the first time as a refusal on an advert they were about to apply to.
 */
/**
 * Rename in place rather than through `prompt()`.
 *
 * Same reason `forget` does not call `confirm()`: a modal dialog blocks the extension's own
 * message channel, so the page would stop being able to talk to the worker.
 */
function startRename(main, title, row) {
  if (main.querySelector('input')) return;
  const input = document.createElement('input');
  input.value = row.label || '';
  input.placeholder = t('opt_cv_untitled');
  title.replaceWith(input);
  input.focus();
  input.select();
  let done = false;
  const commit = async () => {
    if (done) return;
    done = true;
    await send({ type: 'cv:rename', id: row.id, label: input.value.trim() || null });
    if (row.id === activeId) activeLabel = input.value.trim() || null;
    await renderLibrary();
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') commit();
    if (e.key === 'Escape') {
      done = true;
      renderLibrary();
    }
  });
  input.addEventListener('blur', commit);
}

/**
 * Switching CVs saves first.
 *
 * Losing what somebody just typed because they clicked another row would be the very hazard
 * the library was built to remove: one slot, silently overwritten. The document is theirs
 * either way, so saving is the safe default and the page says that it did.
 */
async function switchTo(row) {
  const note = dirty ? t('opt_library_saved_first') : '';
  if (dirty) await save({ quiet: true });
  await send({ type: 'cv:activate', id: row.id });
  await load();
  el('library-msg').textContent = [
    note,
    t('opt_library_switched', [row.label || row.summary?.name || t('opt_cv_untitled')]),
  ]
    .filter(Boolean)
    .join(' ');
}

async function renderLibrary() {
  const { cvs = [], max = 0 } = await send({ type: 'cv:list' });
  const host = el('cv-list');
  host.textContent = '';
  if (!cvs.length) line(host, t('opt_library_empty'), 'muted');

  for (const row of cvs) {
    const li = document.createElement('li');
    li.className = row.active ? 'cv-row active' : 'cv-row';

    const main = document.createElement('div');
    main.className = 'grow';
    const title = document.createElement('b');
    title.textContent = row.label || row.summary?.name || t('opt_cv_untitled');
    const meta = document.createElement('div');
    meta.className = 'meta';
    const bits = [t(SOURCE_BADGE[row.source] || SOURCE_BADGE.local)];
    if (row.summary)
      bits.push(
        t('opt_counts', [
          String(row.summary.fields),
          String(row.summary.work || 0),
          String(row.summary.skills || 0),
        ]),
      );
    if (row.file) bits.push(t(row.file.origin === 'upload' ? 'opt_file_badge' : 'opt_file_badge_generated'));
    meta.textContent = bits.join(' · ');
    main.append(title, meta);
    li.append(main);

    if (row.active) {
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = t('opt_library_active');
      li.append(badge);
    } else {
      const use = document.createElement('button');
      use.className = 'link';
      use.textContent = t('opt_library_use');
      use.addEventListener('click', () => switchTo(row));
      li.append(use);
    }

    const rename = document.createElement('button');
    rename.className = 'link';
    rename.textContent = t('opt_library_rename');
    rename.addEventListener('click', () => startRename(main, title, row));
    li.append(rename);

    // The last CV has no delete button: "effacer mes données" is the button for that, and it
    // says what it does. Deleting your way to an empty extension one row at a time does not.
    if (cvs.length > 1) {
      const del = document.createElement('button');
      del.className = 'link danger';
      del.textContent = t('opt_library_delete');
      del.addEventListener('click', async () => {
        if (del.dataset.armed !== '1') {
          del.dataset.armed = '1';
          del.textContent = t('opt_library_delete_confirm');
          return;
        }
        await send({ type: 'cv:delete', id: row.id });
        await load();
        el('library-msg').textContent = t('opt_library_deleted');
      });
      li.append(del);
    }
    host.append(li);
  }

  el('new-cv').disabled = cvs.length >= max;
  if (cvs.length >= max) el('library-msg').textContent = t('opt_library_full', [String(max)]);
  activeFile = cvs.find((r) => r.id === activeId)?.file || null;
  renderFile();
}

/**
 * The PDF a form's CV upload receives for the open CV: the user's own, or one made from the
 * document. A document that is not saved yet has none, and says so.
 */
function renderFile() {
  const kb = (f) => String(Math.max(1, Math.round(f.size / 1024)));
  const f = activeFile;
  el('cv-file-name').textContent = !activeId
    ? t('opt_file_save_first')
    : !f
      ? t('opt_file_not_printable')
      : f.origin === 'upload'
        ? t('opt_file_current', [f.name, kb(f)])
        : t('opt_file_generated', [f.name, kb(f)]);
  el('cv-file-choose').textContent = t(
    f?.origin === 'upload' ? 'opt_file_replace' : f ? 'opt_file_own' : 'opt_file_choose',
  );
  el('cv-file-choose').disabled = !activeId;
  el('cv-file-preview').hidden = !f;
  el('cv-file-remove').hidden = f?.origin !== 'upload';
}

/** Bytes → base64, chunked: messages to the worker are JSON and carry no binary. */
function base64(buffer) {
  const bytes = new Uint8Array(buffer);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

async function renderStatus() {
  const box = el('status');
  box.textContent = '';
  const state = await send({ type: 'state' });

  if (state.paired) line(box, t('opt_from_account_on', [state.cv_label || t('opt_cv_untitled')]));
  else if (state.cv_source === 'site') line(box, t('opt_source_site'));
  else if (state.has_cv) line(box, t('opt_source_local'));
  else line(box, t('opt_source_none'), 'warn');

  if (state.has_cv) {
    const s = state.summary || {};
    line(box, t('opt_counts', [String(state.fields), String(s.work || 0), String(s.skills || 0)]), 'muted');
    if (!state.cv_analysable) line(box, t('opt_thin'), 'warn');
  }
  if (state.stale) line(box, t('opt_stale'), 'warn');
  el('unpair').hidden = !state.paired;

  // Asked after the CV lines are already on screen, and deliberately **not awaited**: it
  // resolves an identity and reaches the network, and nothing else on this page may wait on
  // that. Awaiting it used to hold up everything rendered afterwards, so a slow or failed
  // request left the page showing no CV list at all: the one thing it exists to show.
  send({ type: 'tier' }).then((tier) => {
    if (tier.paid) line(box, t('opt_tier_paid'), 'ok');
    else if (tier.rate_limited)
      line(box, t('opt_tier_spent', [String(Math.ceil((tier.reset_seconds || 0) / 60))]), 'muted');
    else if (tier.mode) line(box, t(tier.mode === 'account' ? 'opt_tier_free' : 'opt_tier_anon'), 'muted');
  });
}

async function load() {
  const { cv: stored, extras, id, label } = await send({ type: 'cv:get' });
  activeId = id || null;
  activeLabel = label || null;
  cv = stored ? normalizeCvDoc(stored) : createEmptyCv();
  // A blank document with no rows reads as a broken page rather than an empty one.
  if (!cv.work.length) cv.work.push(emptyWork());
  if (!cv.education.length) cv.education.push(emptyEducation());
  if (!cv.languages.length) cv.languages.push(emptyLanguage());
  renderBasics();
  renderLists();
  for (const k of EXTRAS) el(`x_${k}`).value = extras?.[k] || '';
  // The library first: it is read from local storage and cannot fail, where the status ends
  // in an identity lookup that can.
  await renderLibrary();
  await renderStatus();
}

async function save({ quiet = false } = {}) {
  cv = collect();
  const extras = {};
  for (const k of EXTRAS) extras[k] = el(`x_${k}`).value.trim();
  // `activeId` is what makes Save an edit rather than a new document. Without it every save
  // would add a row, and a CV would multiply every time somebody fixed a typo.
  const res = await send({ type: 'cv:save', id: activeId, cv });
  await send({ type: 'extras', extras });
  if (res.error === 'library-full') {
    el('library-msg').textContent = t('opt_library_full', [String(res.max || '')]);
    return;
  }
  if (res.id) activeId = res.id;
  dirty = false;
  if (!quiet) el('saved').textContent = res.analysable ? t('opt_saved') : t('opt_saved_thin');
  await renderStatus();
  await renderLibrary();
}

/** Called once by the dashboard, when the page opens. */
export async function initCv() {
  await load();
  await initImporter(load);

  for (const id of [
    'b_name',
    'b_label',
    'b_email',
    'b_phone',
    'b_city',
    'b_summary',
    'b_linkedin',
    'b_portfolio',
    'b_github',
    'skills',
    ...EXTRAS.map((k) => `x_${k}`),
  ]) {
    el(id).addEventListener('input', markDirty);
  }
  el('add-work').addEventListener('click', () => {
    cv = collect();
    cv.work.push(emptyWork());
    renderLists();
    markDirty();
  });
  el('add-education').addEventListener('click', () => {
    cv = collect();
    cv.education.push(emptyEducation());
    renderLists();
    markDirty();
  });
  el('add-language').addEventListener('click', () => {
    cv = collect();
    cv.languages.push(emptyLanguage());
    renderLists();
    markDirty();
  });
  el('save').addEventListener('click', save);

  el('import').addEventListener('click', () => el('file').click());
  el('file').addEventListener('change', async () => {
    const file = el('file').files?.[0];
    if (!file) return;
    try {
      // Whatever shape it is in, our export, the site's localStorage draft, a plain JSON
      // Résumé, `normalizeCvDoc` reduces it to the one document the rest of this reads.
      const parsed = fromJsonResume(JSON.parse(await file.text()));
      if (!fieldCurrent(parsed.basics.name) && !parsed.work.length && !parsed.skills.length) {
        el('import-msg').textContent = t('opt_import_empty');
        return;
      }
      // An imported file is a new document. It used to replace whatever was open, which is
      // the same silent destruction the one-slot design caused everywhere else.
      if (dirty) await save({ quiet: true });
      const res = await send({
        type: 'cv:save',
        cv: parsed,
        source: 'local',
        label: file.name.replace(/\.json$/i, ''),
      });
      if (res.error === 'library-full') {
        el('import-msg').textContent = t('opt_library_full', [String(res.max || '')]);
        return;
      }
      dirty = false;
      await load();
      el('import-msg').textContent = t('opt_import_ok');
    } catch {
      // A file that is not JSON at all, or is JSON of some other kind.
      el('import-msg').textContent = t('opt_import_failed');
    } finally {
      el('file').value = '';
    }
  });

  el('cv-file-choose').addEventListener('click', () => el('cv-file-input').click());
  el('cv-file-preview').addEventListener('click', async () => {
    // The file as it would be sent: made from the CV as saved, so unsaved edits are saved first.
    if (dirty) await save({ quiet: true });
    const res = await send({ type: 'cv:file:get', id: activeId });
    if (!res.ok) return;
    const bytes = Uint8Array.from(atob(res.data), (c) => c.charCodeAt(0));
    window.open(URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })), '_blank');
  });
  el('cv-file-input').addEventListener('change', async () => {
    const file = el('cv-file-input').files?.[0];
    el('cv-file-input').value = '';
    if (!file || !activeId) return;
    // Checked here for a message that can say why, and again by the worker, which keeps it.
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    if (!isPdf) {
      el('cv-file-msg').textContent = t('opt_file_error_type');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      el('cv-file-msg').textContent = t('opt_file_error_size');
      return;
    }
    const res = await send({
      type: 'cv:file:set',
      id: activeId,
      name: file.name,
      mime: 'application/pdf',
      data: base64(await file.arrayBuffer()),
    });
    const why = { type: 'opt_file_error_type', size: 'opt_file_error_size' };
    el('cv-file-msg').textContent = t(res.ok ? 'opt_file_saved' : why[res.error] || 'opt_file_error');
    await renderLibrary();
  });
  el('cv-file-remove').addEventListener('click', async () => {
    if (!activeId) return;
    await send({ type: 'cv:file:remove', id: activeId });
    el('cv-file-msg').textContent = t('opt_file_removed');
    await renderLibrary();
  });

  el('export').addEventListener('click', () => {
    // A valid `resume.json`, not the shape we store. The `{text}` wrappers and `{id, text}`
    // highlights are ours; exported raw they render as "[object Object]" in anybody else's
    // theme, and the file is then useless outside this extension, which would make "an open
    // CV format" a claim rather than a fact.
    const doc = collect();
    const blob = new Blob([JSON.stringify(toJsonResume(doc), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${slug(activeLabel || fieldCurrent(doc.basics?.name)) || 'resume'}.json`;
    a.click();
    // Revoking immediately cancels the download in Chrome; one tick is enough.
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  el('new-cv').addEventListener('click', async () => {
    if (dirty) await save({ quiet: true });
    const res = await send({ type: 'cv:save', cv: createEmptyCv(), source: 'local' });
    if (res.error === 'library-full') {
      el('library-msg').textContent = t('opt_library_full', [String(res.max || '')]);
      return;
    }
    await load();
    el('library-msg').textContent = '';
    el('b_name').focus();
  });

  el('unpair').addEventListener('click', async () => {
    await send({ type: 'unpair' });
    await renderStatus();
  });
  el('forget').addEventListener('click', async () => {
    // No `confirm()`: a modal dialog blocks the extension's own message channel, and the
    // step this guards is one the button itself names. Two clicks instead.
    if (el('forget').dataset.armed !== '1') {
      el('forget').dataset.armed = '1';
      el('forget').textContent = t('opt_forget_confirm');
      return;
    }
    await send({ type: 'forget' });
    cv = createEmptyCv();
    await load();
    el('forget').dataset.armed = '';
    el('forget').textContent = t('opt_forget');
  });

  // Leaving with unsaved edits is the one place this page can lose work.
  window.addEventListener('beforeunload', (e) => {
    if (dirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
}

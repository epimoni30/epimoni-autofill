// SPDX-License-Identifier: Apache-2.0
// The dashboard's applications view: what the extension filled, and where each one stands.
//
// Part of the free core. Everything here is on this computer, read and written through the
// worker, which is the only writer of extension state; nothing reaches a network.

import { STATUSES, applicationsCsv } from '../shared/applications.js';

const send = (msg) => new Promise((r) => chrome.runtime.sendMessage(msg, (x) => r(x || {})));
const el = (id) => document.getElementById(id);
const t = (key, subs) => chrome.i18n.getMessage(key, subs) || key;
const lang = chrome.i18n.getUILanguage();
const day = (ts) =>
  new Date(ts).toLocaleDateString(lang, { day: 'numeric', month: 'short', year: 'numeric' });

let apps = [];
let filter = 'all';

function renderFilters() {
  const host = el('trk-filters');
  host.textContent = '';
  const count = (s) => (s === 'all' ? apps.length : apps.filter((a) => a.status === s).length);
  for (const s of ['all', ...STATUSES]) {
    if (s !== 'all' && !count(s)) continue;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.textContent = `${t(s === 'all' ? 'trk_all' : `trk_status_${s}`)} · ${count(s)}`;
    b.setAttribute('aria-pressed', String(filter === s));
    b.addEventListener('click', () => {
      filter = s;
      render();
    });
    host.appendChild(b);
  }
}

function card(a) {
  const li = document.createElement('li');
  li.className = 'app';
  li.dataset.id = a.id;

  const head = document.createElement('div');
  head.className = 'app-head';
  const main = document.createElement('div');
  main.className = 'app-main';
  const title = document.createElement('a');
  title.className = 'app-title';
  title.href = a.url;
  title.target = '_blank';
  title.rel = 'noopener';
  title.textContent = a.title || a.host;
  const meta = document.createElement('div');
  meta.className = 'app-meta';
  meta.textContent = [a.company, a.host].filter(Boolean).join(' · ');
  const when = document.createElement('div');
  when.className = 'app-meta';
  when.textContent = [
    t('trk_filled_on', [day(a.created_at)]),
    a.cv_label ? t('trk_with_cv', [a.cv_label]) : '',
  ]
    .filter(Boolean)
    .join(' · ');
  main.append(title, meta, when);

  const status = document.createElement('select');
  status.setAttribute('aria-label', t('trk_status'));
  for (const s of STATUSES) {
    const o = document.createElement('option');
    o.value = s;
    o.textContent = t(`trk_status_${s}`);
    o.selected = a.status === s;
    status.appendChild(o);
  }
  status.addEventListener('change', async () => {
    await send({ type: 'app:update', id: a.id, status: status.value });
    a.status = status.value;
    renderFilters();
  });
  head.append(main, status);
  li.appendChild(head);

  const foot = document.createElement('div');
  foot.className = 'app-foot';
  const note = document.createElement('textarea');
  note.value = a.note || '';
  note.placeholder = t('trk_note_placeholder');
  note.hidden = !a.note;
  note.addEventListener('change', () => send({ type: 'app:update', id: a.id, note: note.value }));
  const noteBtn = document.createElement('button');
  noteBtn.type = 'button';
  noteBtn.className = 'link';
  noteBtn.textContent = t('trk_note');
  noteBtn.hidden = Boolean(a.note);
  noteBtn.addEventListener('click', () => {
    note.hidden = false;
    noteBtn.hidden = true;
    note.focus();
  });
  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'link danger';
  del.textContent = t('trk_delete');
  del.addEventListener('click', async () => {
    if (del.dataset.armed !== '1') {
      del.dataset.armed = '1';
      del.textContent = t('trk_delete_confirm');
      return;
    }
    await send({ type: 'app:delete', id: a.id });
    apps = apps.filter((x) => x.id !== a.id);
    render();
  });
  foot.append(noteBtn, del);
  li.append(note, foot);
  return li;
}

function render() {
  if (filter !== 'all' && !apps.some((a) => a.status === filter)) filter = 'all';
  renderFilters();
  const list = el('trk-apps');
  list.textContent = '';
  for (const a of apps.filter((x) => filter === 'all' || x.status === filter)) list.appendChild(card(a));
  el('trk-empty').hidden = apps.length > 0;
  el('trk-export').disabled = !apps.length;
  el('trk-clear').hidden = !apps.length;
}

/** Read the list again: a fill in another tab may have added to it since the page opened. */
export async function refreshApplications() {
  apps = (await send({ type: 'app:list' })).apps || [];
  render();
}

/** Called once by the dashboard, when the page opens. */
export async function initApplications() {
  await refreshApplications();

  el('trk-export').addEventListener('click', () => {
    const csv = applicationsCsv(apps, {
      columns: ['title', 'company', 'site', 'url', 'status', 'filled', 'updated', 'cv', 'note'].map((c) =>
        t(`trk_col_${c}`),
      ),
      status: Object.fromEntries(STATUSES.map((s) => [s, t(`trk_status_${s}`)])),
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `${t('trk_file')}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  el('trk-clear').addEventListener('click', async () => {
    const b = el('trk-clear');
    if (b.dataset.armed !== '1') {
      b.dataset.armed = '1';
      b.textContent = t('trk_clear_confirm');
      return;
    }
    await send({ type: 'app:clear' });
    apps = [];
    b.dataset.armed = '';
    b.textContent = t('trk_clear');
    render();
  });
}

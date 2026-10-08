// SPDX-License-Identifier: Apache-2.0
// The dashboard's applications view: a board with one column per status, what the extension
// filled and what the user added by hand.
//
// Part of the free core. Everything here is on this computer, read and written through the
// worker, which is the only writer of extension state; nothing reaches a network.
//
// A card moves by drag and drop, and also by the status menu on the card: dragging needs a
// mouse, and the menu is what a keyboard, a screen reader or a touch screen uses.

import { STATUSES, applicationsCsv } from '../shared/applications.js';

const send = (msg) => new Promise((r) => chrome.runtime.sendMessage(msg, (x) => r(x || {})));
const el = (id) => document.getElementById(id);
const t = (key, subs) => chrome.i18n.getMessage(key, subs) || key;
const lang = chrome.i18n.getUILanguage();
const day = (ts) =>
  new Date(ts).toLocaleDateString(lang, { day: 'numeric', month: 'short', year: 'numeric' });

let apps = [];
// The card being dragged. Kept here rather than read back from `dataTransfer`, which a
// `dragover` handler is not allowed to read.
let dragged = null;

/** Move an application to another column, saved before the board is redrawn. */
async function move(id, status) {
  const a = apps.find((x) => x.id === id);
  if (!a || a.status === status) return;
  await send({ type: 'app:update', id, status });
  a.status = status;
  a.updated_at = Date.now();
  render();
}

function statusMenu(a) {
  const status = document.createElement('select');
  status.setAttribute('aria-label', t('trk_status'));
  for (const s of STATUSES) {
    const o = document.createElement('option');
    o.value = s;
    o.textContent = t(`trk_status_${s}`);
    o.selected = a.status === s;
    status.appendChild(o);
  }
  status.addEventListener('change', () => move(a.id, status.value));
  return status;
}

function card(a) {
  const li = document.createElement('li');
  li.className = 'app';
  li.dataset.id = a.id;
  li.draggable = true;
  li.addEventListener('dragstart', (e) => {
    dragged = a.id;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', a.title || a.host || a.id);
    li.classList.add('dragging');
  });
  li.addEventListener('dragend', () => {
    dragged = null;
    li.classList.remove('dragging');
    for (const c of document.querySelectorAll('.col.over')) c.classList.remove('over');
  });

  const title = document.createElement(a.url ? 'a' : 'span');
  title.className = 'app-title';
  if (a.url) {
    title.href = a.url;
    title.target = '_blank';
    title.rel = 'noopener';
    // A link is draggable on its own, and would carry the address instead of the card.
    title.draggable = false;
  }
  title.textContent = a.title || a.host;
  const meta = document.createElement('div');
  meta.className = 'app-meta where';
  meta.textContent = [a.company, a.host].filter(Boolean).join(' · ');
  meta.title = meta.textContent;
  const when = document.createElement('div');
  when.className = 'app-meta';
  when.textContent = [
    t(a.manual ? 'trk_added_on' : 'trk_filled_on', [day(a.created_at)]),
    a.cv_label ? t('trk_with_cv', [a.cv_label]) : '',
  ]
    .filter(Boolean)
    .join(' · ');
  li.append(title, meta, when, statusMenu(a));

  const note = document.createElement('textarea');
  note.value = a.note || '';
  note.placeholder = t('trk_note_placeholder');
  note.setAttribute('aria-label', t('trk_note'));
  note.hidden = !a.note;
  note.addEventListener('change', () => {
    a.note = note.value;
    send({ type: 'app:update', id: a.id, note: note.value });
  });
  const foot = document.createElement('div');
  foot.className = 'app-foot';
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

function column(status) {
  const col = document.createElement('section');
  col.className = 'col';
  col.dataset.status = status;
  const inCol = apps.filter((a) => a.status === status);
  const head = document.createElement('h2');
  head.className = 'col-head';
  head.id = `col-${status}`;
  const name = document.createElement('span');
  name.textContent = t(`trk_status_${status}`);
  const n = document.createElement('span');
  n.className = 'count';
  n.textContent = String(inCol.length);
  head.append(name, n);
  const list = document.createElement('ul');
  list.className = 'apps';
  list.setAttribute('aria-labelledby', head.id);
  for (const a of inCol) list.appendChild(card(a));
  col.append(head, list);

  col.addEventListener('dragover', (e) => {
    if (!dragged) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    col.classList.add('over');
  });
  col.addEventListener('dragleave', (e) => {
    if (!col.contains(e.relatedTarget)) col.classList.remove('over');
  });
  col.addEventListener('drop', (e) => {
    e.preventDefault();
    col.classList.remove('over');
    if (dragged) move(dragged, status);
  });
  return col;
}

function render() {
  const board = el('trk-board');
  board.textContent = '';
  for (const s of STATUSES) board.appendChild(column(s));
  board.hidden = !apps.length;
  el('trk-empty').hidden = apps.length > 0;
  el('trk-export').disabled = !apps.length;
  el('trk-clear').hidden = !apps.length;
  const count = el('nav-count');
  if (count) count.textContent = apps.length ? String(apps.length) : '';
}

/** Read the list again: a fill in another tab may have added to it since the page opened. */
export async function refreshApplications() {
  apps = (await send({ type: 'app:list' })).apps || [];
  render();
}

/** The form that adds an application the extension did not fill. */
function initAddForm() {
  const form = el('trk-add-form');
  const toggle = el('trk-add');
  const msg = el('trk-add-msg');
  const status = el('trk-add-status');
  for (const s of STATUSES) {
    const o = document.createElement('option');
    o.value = s;
    o.textContent = t(`trk_status_${s}`);
    o.selected = s === 'applied';
    status.appendChild(o);
  }
  const close = () => {
    form.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
    form.reset();
    status.value = 'applied';
    msg.textContent = '';
  };
  toggle.addEventListener('click', () => {
    if (!form.hidden) return close();
    form.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    el('trk-add-title').focus();
  });
  el('trk-add-cancel').addEventListener('click', close);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = el('trk-add-title').value.trim();
    let url = el('trk-add-url').value.trim();
    if (!title) {
      msg.textContent = t('trk_add_need_title');
      el('trk-add-title').focus();
      return;
    }
    // People paste "www.example.com/jobs/1" as often as a full address.
    if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`;
    const res = await send({
      type: 'app:add',
      title,
      company: el('trk-add-company').value.trim(),
      url,
      status: status.value,
    });
    if (!res.ok) {
      msg.textContent = t('trk_add_bad_url');
      el('trk-add-url').focus();
      return;
    }
    close();
    await refreshApplications();
  });
}

/** Called once by the dashboard, when the page opens. */
export async function initApplications() {
  initAddForm();
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

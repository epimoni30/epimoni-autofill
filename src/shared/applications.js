// SPDX-License-Identifier: Apache-2.0
// The applications the extension filled: a small local tracker.
//
// Kept in `chrome.storage.local` under its own key, beside the CV library rather than inside
// it: the library's bag is read on every fill, and a list that grows with every application
// has no business being parsed with it. Local only, like everything else in the free core: no
// account, no sync, no network.
//
// An application is one job page, keyed on its address with the noise taken out
// (`applicationKey`), so filling the same form twice, or a wizard's second step, updates the
// entry rather than adding one. The key is always computed by the worker from the tab the
// message came from, never taken from the message, so a page can only record or update its
// own entry.

const KEY = 'epimoni_apps';

/** Enough for a long search; past it the oldest entry goes. */
export const MAX_APPLICATIONS = 500;

/** Where an application stands, in the order it usually moves. */
export const STATUSES = ['filled', 'applied', 'interview', 'offer', 'rejected'];

// Query parameters that name the job on boards that put its id there rather than in the path.
const JOB_PARAMS = ['jk', 'vjk', 'id', 'jobid', 'job_id', 'currentjobid', 'offerid', 'offre', 'gh_jid'];

/**
 * A job page's address without what varies between visits of the same job: tracking
 * parameters, the fragment, a trailing slash. Null for anything that is not a web page.
 */
export function applicationKey(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const kept = [...u.searchParams]
    .filter(([k]) => JOB_PARAMS.includes(k.toLowerCase()))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  const path = u.pathname.replace(/\/+$/, '') || '/';
  return `${u.host}${path}${kept ? `?${kept}` : ''}`;
}

const clip = (v, n) =>
  String(v ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, n);

async function load() {
  const got = await chrome.storage.local.get(KEY);
  return Array.isArray(got[KEY]) ? got[KEY] : [];
}

const save = (list) => chrome.storage.local.set({ [KEY]: list });

/** Every application, most recent activity first. */
export async function listApplications() {
  return (await load()).sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0));
}

/**
 * A fill on a job page: add it, or bring the existing entry up to date.
 *
 * A title or company read from the advert replaces one taken from the page title, and never
 * the reverse: the wizard's second step has no advert on it, and must not erase what the first
 * one said. The status is never moved back: filling a form again after "entretien" does not
 * make it "rempli".
 */
export async function recordApplication({ url, title, company, fromAdvert, cv_id, cv_label, fields }) {
  const key = applicationKey(url);
  if (!key) return null;
  const list = await load();
  const at = Date.now();
  const i = list.findIndex((a) => a.key === key);
  const was = i >= 0 ? list[i] : null;
  const better = (field, value) =>
    value && (!was?.[field] || (fromAdvert && !was.from_advert))
      ? clip(value, 200)
      : was?.[field] || clip(value, 200);
  const next = {
    id: was?.id || `app-${at.toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    key,
    url: clip(url, 1000),
    host: new URL(url).host,
    title: better('title', title),
    company: better('company', company),
    from_advert: Boolean(was?.from_advert || fromAdvert),
    cv_id: cv_id || was?.cv_id || null,
    cv_label: clip(cv_label, 120) || was?.cv_label || null,
    fields: Math.max(Number(fields) || 0, was?.fields || 0),
    status: was?.status || 'filled',
    created_at: was?.created_at || at,
    updated_at: at,
    note: was?.note || '',
  };
  if (i >= 0) list[i] = next;
  else list.push(next);
  // Oldest activity goes first when the list is full.
  list.sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0));
  await save(list.slice(0, MAX_APPLICATIONS));
  return next;
}

/** Update what the user says about an application: its status or a note. */
export async function updateApplication(id, { status, note } = {}) {
  const list = await load();
  const a = list.find((x) => x.id === id);
  if (!a) return null;
  if (status !== undefined) {
    if (!STATUSES.includes(status)) return null;
    a.status = status;
  }
  if (note !== undefined) a.note = clip(note, 1000);
  a.updated_at = Date.now();
  await save(list);
  return a;
}

/** The entry for a page, by the page's address. */
export async function applicationFor(url) {
  const key = applicationKey(url);
  return key ? (await load()).find((a) => a.key === key) || null : null;
}

export async function deleteApplication(id) {
  const list = await load();
  const next = list.filter((a) => a.id !== id);
  if (next.length === list.length) return false;
  await save(next);
  return true;
}

export async function clearApplications() {
  await chrome.storage.local.remove(KEY);
}

/** The list as CSV, for a spreadsheet: comma-separated, quoted, UTF-8 with a BOM for Excel. */
export function applicationsCsv(list, headers) {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const day = (ts) => (ts ? new Date(ts).toISOString().slice(0, 10) : '');
  const rows = list.map((a) =>
    [
      a.title,
      a.company,
      a.host,
      a.url,
      headers.status[a.status] || a.status,
      day(a.created_at),
      day(a.updated_at),
      a.cv_label,
      a.note,
    ]
      .map(q)
      .join(','),
  );
  return `﻿${headers.columns.map(q).join(',')}\n${rows.join('\n')}\n`;
}

// SPDX-License-Identifier: Apache-2.0
// The sites where the user turned on automatic filling.
//
// By default the extension offers rather than acts: it fills a page when the user clicks, and
// nowhere on its own. A site on this list is one where the user said otherwise, from the
// popup, on that site: an application form that appears there is filled as it appears, with
// the same resolver, the same refusals and the same "tout annuler" as a click. It still never
// submits.
//
// Two kinds of site end up here. A job board the manifest already declares a content script
// for needs nothing more than the entry. Any other site also needs the browser's permission
// for that one origin (asked for in the popup, inside the user's click, from
// `optional_host_permissions`) and a content script registered for it, which `syncSiteScripts`
// keeps in step with this list and with what the browser has granted.
//
// Part of the free core: local storage, no account, no network.

const KEY = 'epimoni_sites';
const SCRIPT_ID = 'epimoni-sites';

/** Enough for anybody's job search; a longer list is a sign something else is writing it. */
export const MAX_SITES = 200;

/** The host of a web page's address, lower-cased, or null for anything that is not one. */
export function siteOf(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  return { host: u.hostname.toLowerCase(), scheme: u.protocol.slice(0, -1) };
}

/** The match pattern for one site, the only shape this module asks the browser for. */
export const originPattern = ({ host, scheme = 'https' }) => `${scheme}://${host}/*`;

/** Whether a manifest match pattern covers a host (scheme ignored: a site is its host). */
export function patternCovers(pattern, host) {
  const m = /^(\*|https?):\/\/([^/]+)\//.exec(pattern);
  if (!m) return false;
  const want = m[2].toLowerCase();
  if (want === '*') return true;
  if (want.startsWith('*.')) {
    const base = want.slice(2);
    return host === base || host.endsWith(`.${base}`);
  }
  return host === want;
}

/**
 * Whether the manifest already runs the content script on this host, so turning automatic
 * filling on there asks the browser for nothing.
 */
export function declaredFor(host, manifest) {
  return (manifest.content_scripts || []).some(
    (cs) => cs.js?.includes('content.js') && (cs.matches || []).some((p) => patternCovers(p, host)),
  );
}

async function load() {
  const got = await chrome.storage.local.get(KEY);
  return Array.isArray(got[KEY]) ? got[KEY] : [];
}

const save = (list) => chrome.storage.local.set({ [KEY]: list });

/** Every site with automatic filling on, most recently added first. */
export async function listSites() {
  return (await load()).sort((a, b) => (b.added_at || 0) - (a.added_at || 0));
}

export async function siteIsAuto(host) {
  return Boolean(host) && (await load()).some((s) => s.host === host);
}

/** Turn automatic filling on for a site. Idempotent. */
export async function addSite({ host, scheme = 'https' }) {
  if (!host || !/^[a-z0-9.-]+$/.test(host)) return null;
  const list = await load();
  const was = list.find((s) => s.host === host);
  if (was) return was;
  const next = { host, scheme: scheme === 'http' ? 'http' : 'https', added_at: Date.now() };
  list.unshift(next);
  await save(list.slice(0, MAX_SITES));
  return next;
}

export async function removeSite(host) {
  const list = await load();
  const next = list.filter((s) => s.host !== host);
  if (next.length === list.length) return false;
  await save(next);
  return true;
}

export async function clearSites() {
  await chrome.storage.local.remove(KEY);
}

/**
 * Make the registered content script match exactly the listed sites the manifest does not
 * cover and the browser has granted. Called after every change to the list, when a permission
 * is granted or withdrawn (the user can do that from chrome://extensions too), and when the
 * worker starts, so the three never drift apart for long.
 *
 * One registration for every site rather than one per site: a single id to update, and the
 * list of origins the browser holds is readable in one place.
 */
export async function syncSiteScripts(manifest = chrome.runtime.getManifest()) {
  const granted = new Set((await chrome.permissions.getAll()).origins || []);
  const matches = (await load())
    .filter((s) => !declaredFor(s.host, manifest))
    .map(originPattern)
    .filter((p) => granted.has(p));
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID] });
  if (!matches.length) {
    if (existing.length) await chrome.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] });
    return [];
  }
  const script = {
    id: SCRIPT_ID,
    js: ['content.js'],
    matches,
    allFrames: true,
    runAt: 'document_idle',
    persistAcrossSessions: true,
  };
  if (existing.length) await chrome.scripting.updateContentScripts([script]);
  else await chrome.scripting.registerContentScripts([script]);
  return matches;
}

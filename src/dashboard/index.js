// SPDX-License-Identifier: Apache-2.0
// The dashboard: the extension's one page, with a menu. The CV view (`cv.js`) and the
// applications view (`applications.js`) are the free core's two surfaces; neither reaches a
// network, and both read and write through the worker.
//
// The view is the URL's hash, so the popup and the in-page panel can open the right one
// (`dashboard.html#candidatures`) and a reload stays where it was.

import { initApplications, refreshApplications } from './applications.js';
import { initCv } from './cv.js';
import { refreshSites } from './sites.js';

const t = (key, subs) => chrome.i18n.getMessage(key, subs) || key;
const VIEWS = { cv: 'opt_title', candidatures: 'trk_title', sites: 'sites_title' };

function localise() {
  document.documentElement.lang = chrome.i18n.getUILanguage().slice(0, 2);
  for (const node of document.querySelectorAll('[data-i18n]')) node.textContent = t(node.dataset.i18n);
}

const current = () => {
  const v = location.hash.slice(1);
  return v in VIEWS ? v : 'cv';
};

async function show() {
  const view = current();
  for (const node of document.querySelectorAll('[data-view]')) node.hidden = node.dataset.view !== view;
  for (const a of document.querySelectorAll('[data-nav]')) {
    if (a.dataset.nav === view) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  document.title = `${t(VIEWS[view])} · Epimoni`;
  // The list can have grown in another tab since the page opened.
  if (view === 'candidatures') await refreshApplications();
  if (view === 'sites') await refreshSites();
  await count();
}

/** How many applications, beside the menu entry. */
async function count() {
  const { apps = [] } = await new Promise((r) =>
    chrome.runtime.sendMessage({ type: 'app:list' }, (x) => r(x || {})),
  );
  document.getElementById('nav-count').textContent = apps.length ? String(apps.length) : '';
}

localise();
window.addEventListener('hashchange', show);
await Promise.all([initCv(), initApplications()]);
await show();

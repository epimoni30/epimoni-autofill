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

/**
 * The menu's light/dark switch. Light is the default; the choice lives in localStorage under
 * the key `src/shared/theme.js` reads in every page's <head>, so it applies before paint.
 */
function themeToggle() {
  const button = document.getElementById('theme-toggle');
  const root = document.documentElement;
  const label = () => {
    const dark = root.dataset.theme === 'dark';
    button.setAttribute('aria-pressed', String(dark));
    button.title = t('dash_theme_dark');
    button.setAttribute('aria-label', t('dash_theme_dark'));
  };
  button.addEventListener('click', () => {
    const dark = root.dataset.theme !== 'dark';
    if (dark) root.dataset.theme = 'dark';
    else delete root.dataset.theme;
    try {
      localStorage.setItem('epimoni-theme', dark ? 'dark' : 'light');
    } catch {
      // Storage blocked: the switch still holds for this page.
    }
    label();
  });
  // theme.js follows a change made in another tab; keep the pressed state in step.
  window.addEventListener('storage', (e) => {
    if (e.key === 'epimoni-theme') label();
  });
  label();
}

localise();
themeToggle();
window.addEventListener('hashchange', show);
await Promise.all([initCv(), initApplications()]);
await show();

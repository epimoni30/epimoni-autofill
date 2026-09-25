// SPDX-License-Identifier: Apache-2.0
// Service worker, core half: the CV library, the profile a form is filled from, and the
// toolbar click. None of it touches the network: deterministic filling needs no account, no
// token and no connection. The Epimoni add-on (pairing, the offer analysis, the allowance,
// usage reporting) lives in `src/epimoni/` and is reached through the one import below.

import {
  read,
  write,
  clear,
  effectiveProfile,
  listCvs,
  saveCv,
  activateCv,
  renameCv,
  deleteCv,
  MAX_CVS,
} from '../shared/store.js';
import { cvIsAnalysable, cvSummary, normalizeCvDoc, toEntries, toProfile } from '../shared/cvdoc.js';
import { epimoniState, forgetEpimoni, handleEpimoni, installEpimoni } from '../epimoni/worker.js';

installEpimoni();

/**
 * The flat profile a form is actually filled from.
 *
 * `effectiveProfile` layers the typed extras and the account's name over the document's
 * stored profile, but an entry can legitimately carry none. A bag migrated from the old
 * one-slot shape brought the CV across and not always a profile with it, and such an install
 * would otherwise hold a full CV and fill nothing at all.
 *
 * Derived here rather than repaired in storage, so `toProfile` stays the one definition of
 * that mapping and the worker stays its only caller.
 */
function profileOf(state) {
  if (state.profile) return effectiveProfile(state);
  return effectiveProfile({ ...state, profile: state.cv ? toProfile(state.cv) : null });
}

/**
 * What a content script may ask for. Everything else, reading the whole library, writing,
 * deleting, unpairing, is for the extension's own pages only.
 *
 * A content script runs inside a job board's renderer process, next to code we do not
 * control. It is isolated from the page's JavaScript, but a renderer compromise is not
 * isolated from it, so the worker treats a message from a web page's frame as coming from
 * that page: it can have the flat profile it fills from, and nothing that edits or erases the
 * user's data.
 */
const CONTENT_SCRIPT_TYPES = new Set(['profile', 'report', 'tier', 'analyse', 'open-options']);
const EXTENSION_ORIGIN = chrome.runtime.getURL('');
const fromExtensionPage = (sender) =>
  typeof sender?.url === 'string' && sender.url.startsWith(EXTENSION_ORIGIN);

/**
 * The worker is the only writer of extension state, and the only holder of a token. Every
 * surface, the popup, the in-page panel, the CV editor, asks through here.
 */
chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  if (
    sender?.id !== chrome.runtime.id ||
    (!fromExtensionPage(sender) && !CONTENT_SCRIPT_TYPES.has(msg?.type))
  ) {
    respond({ ok: false, error: 'forbidden' });
    return false;
  }
  (async () => {
    const state = await read();
    switch (msg?.type) {
      case 'state': {
        // The token never leaves the worker.
        const summary = state.cv ? cvSummary(state.cv, state.extras || {}) : null;
        respond({
          ...epimoniState(state),
          cv_label: state.cv_label || null,
          cv_source: state.cv_source || null,
          taken_at: state.taken_at || null,
          fields: Object.keys(profileOf(state)).length,
          has_cv: !!state.cv,
          // Something is stored, but not enough for the comparison to mean anything. The
          // editor is where that is fixed, so the distinction has to reach the surfaces.
          cv_analysable: !!state.cv && cvIsAnalysable(state.cv),
          summary,
        });
        break;
      }
      case 'profile':
        // `entries` is the document entry by entry, for forms that ask for the career as
        // repeated blocks. Derived on every ask, like the profile of a migrated bag: the
        // document is the only copy, so there is nothing to keep in step.
        respond({ profile: profileOf(state), entries: state.cv ? toEntries(state.cv) : {} });
        break;
      case 'extras':
        await write({ extras: { ...(state.extras || {}), ...(msg.extras || {}) } });
        respond({ ok: true });
        break;
      // ── The CV library ──────────────────────────────────────────────────────────────
      // Typed here, imported from a file, or handed over by the site: several documents, one
      // shape, one place. `normalizeCvDoc` is applied on the way in rather than on the way
      // out, so nothing downstream has to wonder which of the three wrote it, and the worker
      // stays the only normaliser, which is why `store.js` takes a document already in shape.
      case 'cv:get':
        respond({
          cv: state.cv || null,
          id: state.active_cv_id || null,
          source: state.cv_source || null,
          label: state.cv_label || null,
          extras: state.extras || {},
        });
        break;
      case 'cv:list': {
        const rows = await listCvs();
        const bag = await read();
        respond({
          // The summary is built here because `cvSummary` lives with the document model and
          // the store deliberately imports nothing.
          cvs: rows.map((r) => {
            const doc = (bag.cvs || []).find((c) => c.id === r.id)?.cv || null;
            return {
              ...r,
              summary: doc ? cvSummary(doc, bag.extras || {}) : null,
              analysable: doc ? cvIsAnalysable(doc) : false,
            };
          }),
          max: MAX_CVS,
        });
        break;
      }
      case 'cv:save': {
        const cv = normalizeCvDoc(msg.cv || {});
        // The flat profile is derived here and never sent by a surface: it is what fills
        // forms, and two writers would be two chances for it to drift from the document.
        // No `id` means a new document; `msg.id` means editing the one already open.
        const saved = await saveCv({
          id: msg.id || null,
          cv,
          profile: toProfile(cv),
          source: msg.source || null,
          label: msg.label ?? null,
        });
        if (!saved) {
          respond({ ok: false, error: 'library-full', max: MAX_CVS });
          break;
        }
        respond({
          ok: true,
          id: saved.active_cv_id,
          summary: cvSummary(cv, state.extras || {}),
          analysable: cvIsAnalysable(cv),
        });
        break;
      }
      case 'cv:activate':
        respond({ ok: Boolean(await activateCv(msg.id)) });
        break;
      case 'cv:rename':
        respond({ ok: Boolean(await renameCv(msg.id, msg.label)) });
        break;
      case 'cv:delete':
        respond({ ok: Boolean(await deleteCv(msg.id)) });
        break;
      case 'cv:clear':
        // Every document, not just the active one: this is "effacer mes données".
        for (const row of await listCvs()) await deleteCv(row.id);
        await write({ profile: null });
        respond({ ok: true });
        break;
      case 'open-options':
        // A content script cannot open an extension page itself.
        chrome.runtime.openOptionsPage();
        respond({ ok: true });
        break;
      case 'forget':
        await clear();
        await forgetEpimoni();
        respond({ ok: true });
        break;
      default:
        respond((await handleEpimoni(msg, state)) ?? { ok: false, error: 'unknown' });
    }
  })();
  return true;
});

/**
 * First run: open the extension's own CV page.
 *
 * It used to open the site's landing page, which was right while pairing was the only way in
 * and wrong now that it is not: somebody who installs from the store without an Epimoni
 * account would land on a page telling them to connect an account they do not have. The CV
 * page offers both paths, import from the site, or write one here, and works offline.
 *
 * Only on `install`, never on `update`, which would reopen a tab on every silent bump.
 */
chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason !== 'install') return;
  chrome.runtime.openOptionsPage();
});

/**
 * Clicking the toolbar icon on a site we do not declare a content script for.
 *
 * This is the whole reason the manifest asks for `activeTab` + `scripting` instead of
 * `<all_urls>`: company career pages are unpredictable and there are tens of thousands of
 * them, but "read and change all your data on all websites" at install time is the single
 * biggest drop-off on a product that handles a CV. Here the user's click *is* the grant.
 */
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      files: ['content.js'],
    });
    await chrome.tabs.sendMessage(tab.id, { type: 'fill' });
  } catch {
    // An injection refused by the page (chrome://, the store itself) is not an error worth
    // surfacing; the popup already explains where filling works.
  }
});

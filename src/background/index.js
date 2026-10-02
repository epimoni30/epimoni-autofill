// SPDX-License-Identifier: Apache-2.0
// Service worker, core half: the CV library, the profile a form is filled from, and the
// toolbar click. None of it touches the network: deterministic filling needs no account, no
// token and no connection. The Epimoni add-on (pairing, the offer analysis, the allowance,
// usage reporting) lives in `src/epimoni/` and is reached through the one import below.

import {
  read,
  readAs,
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
import {
  cvIsAnalysable,
  cvSummary,
  normalizeCvDoc,
  toEntries,
  toJsonResume,
  toProfile,
} from '../shared/cvdoc.js';
import { cvIsPrintable, pdfName, renderCvPdf } from '../shared/pdf.js';
import {
  addApplication,
  applicationFor,
  clearApplications,
  deleteApplication,
  listApplications,
  recordApplication,
  updateApplication,
} from '../shared/applications.js';
import {
  clearFiles,
  deleteFile,
  fileMeta,
  fileProblem,
  fromBase64,
  getFile,
  listFileMeta,
  putFile,
  toBase64,
} from '../shared/files.js';
import {
  addSite,
  clearSites,
  declaredFor,
  listSites,
  originPattern,
  removeSite,
  siteIsAuto,
  siteOf,
  syncSiteScripts,
} from '../shared/sites.js';
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
const CONTENT_SCRIPT_TYPES = new Set([
  'profile',
  'cv-file',
  'cv:choices',
  'app:record',
  'app:applied',
  'open-tracker',
  'report',
  'tier',
  'analyse',
  'letter',
  'open-options',
  // Whether this page's site fills on its own, and the panel's "stop doing that here". Both
  // act on the sender's own tab, never on a host the message names.
  'site:auto',
  'site:auto:off',
  // The site bridge's envelope. The add-on checks the sender is the site's top frame.
  'site',
  // The panel's "allow" link, on a browser that asks for data-collection consent.
  'consent:open',
]);

/** The PDF's section titles, in the browser's language: the renderer itself is pure. */
const pdfLabels = () =>
  Object.fromEntries(
    ['profile', 'work', 'education', 'projects', 'certificates', 'skills', 'languages', 'present'].map(
      (k) => [k, chrome.i18n?.getMessage(`pdf_${k}`) || ''],
    ),
  );

/**
 * The file a CV upload receives for one library entry: the PDF the user attached, or else one
 * rendered from the document now. The rendered one is never stored, so it always matches the
 * CV as saved, and no path that writes a CV (the editor, an import, the site) has to remember
 * to refresh it. Null when there is neither: a CV with a name and nothing else is not sent to
 * an employer.
 */
async function cvFileOf(id, cv) {
  const upload = await getFile(id).catch(() => null);
  if (upload) return { ...upload, origin: 'upload' };
  if (!cv) return null;
  const resume = toJsonResume(cv);
  if (!cvIsPrintable(resume)) return null;
  const bytes = renderCvPdf(resume, pdfLabels());
  return {
    name: pdfName(resume),
    type: 'application/pdf',
    size: bytes.byteLength,
    bytes,
    origin: 'generated',
  };
}
const PENDING_SITE = 'site_pending';

/**
 * Automatic filling on for a site. A site the manifest does not cover needs the browser's
 * permission for its origin first, which only a click in the popup can ask for; without it
 * this refuses rather than store a site that would never fill.
 */
async function turnSiteOn(site) {
  const declared = declaredFor(site.host, chrome.runtime.getManifest());
  if (!declared && !(await chrome.permissions.contains({ origins: [originPattern(site)] })))
    return { ok: false, need: 'permission' };
  await addSite(site);
  await syncSiteScripts();
  return { ok: true, declared };
}

/** Automatic filling off, and the site's permission handed back when we asked for it. */
async function turnSiteOff(host) {
  const removed = await removeSite(host);
  const manifest = chrome.runtime.getManifest();
  if (removed && !declaredFor(host, manifest)) {
    const origins = ['https', 'http'].map((scheme) => originPattern({ host, scheme }));
    await chrome.permissions.remove({ origins }).catch(() => {});
  }
  await syncSiteScripts();
  return removed;
}

// The popup asked the browser for a site and may have been closed by the prompt: finish here.
chrome.permissions.onAdded.addListener(async ({ origins = [] }) => {
  const { [PENDING_SITE]: pending } = await chrome.storage.session.get(PENDING_SITE);
  if (!pending || Date.now() - pending.at > 5 * 60 * 1000) return;
  if (!origins.includes(originPattern(pending))) return;
  await chrome.storage.session.remove(PENDING_SITE);
  await addSite(pending);
  await syncSiteScripts();
});
// Withdrawn from chrome://extensions: the site cannot fill any more, so it leaves the list
// rather than sit there switched on and doing nothing.
chrome.permissions.onRemoved.addListener(async ({ origins = [] }) => {
  const manifest = chrome.runtime.getManifest();
  for (const s of await listSites()) {
    if (!declaredFor(s.host, manifest) && origins.includes(originPattern(s))) await removeSite(s.host);
  }
  await syncSiteScripts();
});
chrome.runtime.onStartup.addListener(() => syncSiteScripts().catch(() => {}));

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
          ...(await epimoniState(state)),
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
        //
        // `cv_file` is the attached PDF's name and size only. The bytes cross on a second
        // message, `cv-file`, sent once a page turns out to have a CV upload: most pages a
        // fill runs on do not, and they have no business receiving the document.
        //
        // `id` fills from another CV of the library for this page only (the panel's picker);
        // which CV is active for everything else does not change.
        {
          const st = msg.id ? await readAs(msg.id) : state;
          const account = await epimoniState(st);
          respond({
            profile: profileOf(st),
            entries: st.cv ? toEntries(st.cv) : {},
            cv_id: st.active_cv_id || null,
            cv_file: fileMeta(await cvFileOf(st.active_cv_id, st.cv)),
            // Whether the panel may offer the AI features: a paired account, token live.
            ai: account.ai,
            consent: account.consent,
            stale: Boolean(st.stale),
          });
        }
        break;
      case 'cv-file': {
        const st = msg.id ? await readAs(msg.id) : state;
        const f = await cvFileOf(st.active_cv_id, st.cv);
        respond(f ? { name: f.name, type: f.type, data: toBase64(f.bytes) } : { ok: false });
        break;
      }
      case 'cv:choices':
        // What the panel's picker needs, and no more: an id and a name per CV. The documents
        // stay in the worker.
        respond({
          cvs: (await listCvs()).map((r) => {
            const doc = (state.cvs || []).find((c) => c.id === r.id)?.cv;
            return { id: r.id, label: r.label || (doc && cvSummary(doc, {}).name) || null, active: r.active };
          }),
        });
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
        const uploads = await listFileMeta().catch(() => ({}));
        const files = {};
        for (const r of rows) {
          const doc = (bag.cvs || []).find((c) => c.id === r.id)?.cv || null;
          files[r.id] = uploads[r.id] || (doc ? fileMeta(await cvFileOf(r.id, doc)) : null);
        }
        respond({
          // The summary is built here because `cvSummary` lives with the document model and
          // the store deliberately imports nothing.
          cvs: rows.map((r) => {
            const doc = (bag.cvs || []).find((c) => c.id === r.id)?.cv || null;
            return {
              ...r,
              summary: doc ? cvSummary(doc, bag.extras || {}) : null,
              analysable: doc ? cvIsAnalysable(doc) : false,
              file: files[r.id] || null,
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
      case 'cv:delete': {
        const ok = Boolean(await deleteCv(msg.id));
        // A file left behind is an orphan nobody can reach, not a reason to fail the delete.
        if (ok) await deleteFile(msg.id).catch(() => {});
        respond({ ok });
        break;
      }
      case 'cv:clear':
        // Every document, not just the active one: this is "effacer mes données".
        for (const row of await listCvs()) await deleteCv(row.id);
        await clearFiles().catch(() => {});
        await write({ profile: null });
        respond({ ok: true });
        break;
      // ── The CV's file ───────────────────────────────────────────────────────────────
      // One PDF per library entry, for the upload box application forms ask for. Checked
      // here as well as on the page: the worker is the one that keeps it.
      case 'cv:file:set': {
        if (!(await listCvs()).some((r) => r.id === msg.id)) {
          respond({ ok: false, error: 'no-cv' });
          break;
        }
        const file = { name: msg.name, type: msg.mime, bytes: fromBase64(msg.data) };
        const problem = fileProblem(file);
        if (problem) {
          respond({ ok: false, error: problem });
          break;
        }
        respond({ ok: true, file: await putFile(msg.id, file) });
        break;
      }
      case 'cv:file:get': {
        // The file as a form would receive it, for the CV page's preview.
        const st = await readAs(msg.id);
        const f = st.active_cv_id === msg.id ? await cvFileOf(msg.id, st.cv) : null;
        respond(f ? { ok: true, name: f.name, origin: f.origin, data: toBase64(f.bytes) } : { ok: false });
        break;
      }
      case 'cv:file:remove':
        await deleteFile(msg.id);
        respond({ ok: true });
        break;
      // ── The application tracker ─────────────────────────────────────────────────────
      // A page records itself, and only itself: the address is the tab the message came
      // from, never one the message names.
      case 'app:record': {
        const url = sender.tab?.url || sender.url;
        const cvId = msg.cv_id || state.active_cv_id || null;
        const cvLabel = (state.cvs || []).find((c) => c.id === cvId)?.label || null;
        const app = await recordApplication({
          url,
          title: msg.title,
          company: msg.company,
          fromAdvert: Boolean(msg.from_advert),
          cv_id: cvId,
          cv_label: cvLabel,
          fields: msg.fields,
        });
        respond(app ? { ok: true, id: app.id, status: app.status } : { ok: false });
        break;
      }
      case 'app:applied': {
        // "J'ai envoyé ma candidature", from the panel on that page. It only ever moves an
        // application forward from "rempli": the user may have got further since.
        const app = await applicationFor(sender.tab?.url || sender.url);
        if (!app) {
          respond({ ok: false });
          break;
        }
        const next = app.status === 'filled' ? await updateApplication(app.id, { status: 'applied' }) : app;
        respond({ ok: true, status: next.status });
        break;
      }
      case 'app:add': {
        // From the dashboard only (not a content-script type): an application the extension
        // did not fill. The address, when given, is the user's own typing, not a tab's.
        const app = await addApplication(msg);
        respond(app ? { ok: true, app } : { ok: false });
        break;
      }
      case 'app:list':
        respond({ apps: await listApplications() });
        break;
      case 'app:update':
        respond({ ok: Boolean(await updateApplication(msg.id, { status: msg.status, note: msg.note })) });
        break;
      case 'app:delete':
        respond({ ok: await deleteApplication(msg.id) });
        break;
      case 'app:clear':
        await clearApplications();
        respond({ ok: true });
        break;
      case 'open-tracker':
        chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html#candidatures') });
        respond({ ok: true });
        break;
      case 'open-options':
        // A content script cannot open an extension page itself.
        chrome.runtime.openOptionsPage();
        respond({ ok: true });
        break;
      case 'site:auto': {
        const site = siteOf(sender.tab?.url || sender.url);
        respond({ auto: Boolean(site && (await siteIsAuto(site.host))) });
        break;
      }
      case 'site:auto:off': {
        const site = siteOf(sender.tab?.url || sender.url);
        respond({ ok: Boolean(site && (await turnSiteOff(site.host))) });
        break;
      }
      case 'site:status': {
        // The popup, about the tab it was opened over.
        const site = siteOf(msg.url);
        if (!site) {
          respond({ ok: false });
          break;
        }
        const declared = declaredFor(site.host, chrome.runtime.getManifest());
        respond({
          ok: true,
          ...site,
          declared,
          auto: await siteIsAuto(site.host),
          granted: declared || (await chrome.permissions.contains({ origins: [originPattern(site)] })),
        });
        break;
      }
      case 'site:pending': {
        // Said just before the popup asks the browser for this site. The popup can be closed
        // by the browser's own prompt, so the grant is finished in `permissions.onAdded`.
        const site = siteOf(`${msg.scheme === 'http' ? 'http' : 'https'}://${msg.host}/`);
        if (site) await chrome.storage.session.set({ [PENDING_SITE]: { ...site, at: Date.now() } });
        respond({ ok: Boolean(site) });
        break;
      }
      case 'site:enable': {
        const site = siteOf(`${msg.scheme === 'http' ? 'http' : 'https'}://${msg.host}/`);
        respond(site ? await turnSiteOn(site) : { ok: false });
        break;
      }
      case 'site:disable':
        respond({ ok: await turnSiteOff(String(msg.host || '').toLowerCase()) });
        break;
      case 'sites:list': {
        const manifest = chrome.runtime.getManifest();
        respond({
          sites: (await listSites()).map((s) => ({ ...s, declared: declaredFor(s.host, manifest) })),
        });
        break;
      }
      case 'forget':
        await clear();
        await clearApplications();
        await clearSites();
        await syncSiteScripts().catch(() => {});
        await clearFiles().catch(() => {});
        await forgetEpimoni();
        respond({ ok: true });
        break;
      default: {
        // An analysis asked from a page that fills from another CV of the library compares
        // that CV, so the score is about the document the form was filled from.
        const st =
          (msg.type === 'analyse' || msg.type === 'letter') && msg.cv_id ? await readAs(msg.cv_id) : state;
        respond((await handleEpimoni(msg, st, sender)) ?? { ok: false, error: 'unknown' });
      }
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
  // On an update too: the registered script must match the list the new version reads.
  syncSiteScripts().catch(() => {});
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

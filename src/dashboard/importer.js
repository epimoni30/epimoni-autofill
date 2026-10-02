// SPDX-License-Identifier: Apache-2.0
// "Importer mon CV existant": a CV the person already has, as a PDF or as text, turned into a
// CV here without typing it in again.
//
// Two halves with the line between them in the usual place. Reading the PDF is the free core:
// `shared/pdftext.js`, on this computer, and the text is shown to the person before anything
// else happens, editable. Sorting that text into fields is the Epimoni add-on (a paired
// account, `cv:import-text`), using the backend's verbatim parser, which copies and never
// rewrites. The PDF itself is kept as the new CV's file, so an application form gets the
// document the person made rather than one rendered from the fields.

import { pdfText } from '../shared/pdftext.js';
import { toBase64 } from '../shared/files.js';

const send = (msg) => new Promise((r) => chrome.runtime.sendMessage(msg, (x) => r(x || {})));
const el = (id) => document.getElementById(id);
const t = (key, subs) => chrome.i18n.getMessage(key, subs) || key;
const SITE = 'https://www.epimoni30.com/extension-chrome';

const MAX_PDF = 5 * 1024 * 1024;

/** `reload` re-reads the library and opens the active CV, which the import has just become. */
export async function initImporter(reload) {
  const msg = el('pdf-import-msg');
  const review = el('pdf-import-review');
  const text = el('pdf-import-text');
  const go = el('pdf-import-go');
  const note = el('pdf-import-ai');
  let pdf = null; // {name, bytes} when the text came from a file

  const state = await send({ type: 'state' });
  if (!state.ai) {
    go.disabled = true;
    note.textContent = t('opt_pdf_import_needs_account');
    note.append(' ');
    const a = document.createElement('a');
    a.href = SITE;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = t('popup_ai_connect');
    note.appendChild(a);
  }

  const showReview = () => {
    review.hidden = false;
    // From the top: focus alone puts the caret, and the view, at the end of a long CV.
    text.focus();
    text.setSelectionRange(0, 0);
    text.scrollTop = 0;
  };

  el('pdf-import-choose').addEventListener('click', () => el('pdf-import-input').click());
  el('pdf-import-paste').addEventListener('click', () => {
    pdf = null;
    msg.textContent = '';
    showReview();
  });
  el('pdf-import-input').addEventListener('change', async () => {
    const file = el('pdf-import-input').files?.[0];
    el('pdf-import-input').value = '';
    if (!file) return;
    msg.textContent = t('opt_pdf_import_reading');
    const bytes = new Uint8Array(await file.arrayBuffer());
    let res;
    try {
      res = await pdfText(bytes);
    } catch {
      res = { text: '', problem: 'unreadable' };
    }
    const PROBLEM = {
      'not-pdf': 'opt_pdf_import_not_pdf',
      encrypted: 'opt_pdf_import_encrypted',
      'no-text': 'opt_pdf_import_no_text',
      unreadable: 'opt_pdf_import_unreadable',
    };
    if (res.problem) {
      msg.textContent = t(PROBLEM[res.problem] || 'opt_pdf_import_unreadable');
      // A scan or a locked file can still be imported by pasting its text.
      return;
    }
    pdf = { name: file.name, bytes };
    text.value = res.text;
    msg.textContent = t('opt_pdf_import_read', [String(res.text.split(/\s+/).length)]);
    showReview();
  });

  go.addEventListener('click', async () => {
    const value = text.value.trim();
    if (value.split(/\s+/).length < 30) {
      msg.textContent = t('opt_pdf_import_too_short');
      return;
    }
    go.disabled = true;
    msg.textContent = t('opt_pdf_import_working');
    const label = pdf ? pdf.name.replace(/\.pdf$/i, '') : '';
    const res = await send({
      type: 'cv:import-text',
      text: value,
      label,
      lang: chrome.i18n.getUILanguage().slice(0, 2),
    });
    go.disabled = false;
    if (!res.ok) {
      const WHY = {
        quota: () => t('panel_quota', [String(Math.ceil((res.seconds || 0) / 60))]),
        'library-full': () => t('opt_library_full', ['']),
        'too-long': () => t('opt_pdf_import_too_long'),
        'too-short': () => t('opt_pdf_import_too_short'),
        empty: () => t('opt_pdf_import_empty'),
        network: () => t('panel_offline'),
        'not-paired': () => t('opt_pdf_import_needs_account'),
        expired: () => t('panel_stale'),
      };
      msg.textContent = (WHY[res.kind] || (() => t('opt_pdf_import_failed')))();
      return;
    }
    // The person's own PDF goes with the CV it became, when it is one a form may take.
    if (pdf && pdf.bytes.length <= MAX_PDF)
      await send({
        type: 'cv:file:set',
        id: res.id,
        name: pdf.name,
        mime: 'application/pdf',
        data: toBase64(pdf.bytes),
      });
    review.hidden = true;
    text.value = '';
    pdf = null;
    await reload();
    msg.textContent = t('opt_pdf_import_done');
  });
}

// SPDX-License-Identifier: Apache-2.0
// The pairing confirmation page. The worker parks every request from the site and opens this
// page; nothing is written until the user accepts here. See `requestPairing` in worker.js.
//
// Every value on this page comes from a request somebody else sent, so every one is written
// as text, never as markup.

const send = (msg) => new Promise((r) => chrome.runtime.sendMessage(msg, (x) => r(x || {})));
const el = (id) => document.getElementById(id);
const t = (key, subs) => chrome.i18n.getMessage(key, subs) || key;
const id = location.hash.slice(1);

function localise() {
  document.documentElement.lang = chrome.i18n.getUILanguage().slice(0, 2);
  for (const node of document.querySelectorAll('[data-i18n]')) node.textContent = t(node.dataset.i18n);
}

function para(text, className) {
  const p = document.createElement('p');
  p.textContent = text;
  if (className) p.className = className;
  el('body').appendChild(p);
}

function done(titleKey, textKey, className) {
  el('title').textContent = t(titleKey);
  el('body').replaceChildren();
  para(t(textKey), className);
  el('actions').hidden = true;
}

async function main() {
  localise();
  const req = await send({ type: 'pair:pending', id });
  if (!req.ok) return done('pair_expired_title', 'pair_expired');

  const account = req.kind === 'account';
  el('title').textContent = t(account ? 'pair_title_account' : 'pair_title_cv');
  para(t('pair_from_site'), 'muted');

  const dl = document.createElement('dl');
  const row = (key, value) => {
    if (!value) return;
    const dt = document.createElement('dt');
    dt.textContent = t(key);
    const dd = document.createElement('dd');
    dd.textContent = value;
    dl.append(dt, dd);
  };
  // The address is the server's answer for the token being handed over, not a name the
  // request chose for itself: it is the line that tells the user whose account this is.
  if (account) row('pair_account', req.email);
  row('pair_cv', [req.cv_name, req.cv_label && `(${req.cv_label})`].filter(Boolean).join(' '));
  el('body').appendChild(dl);

  para(t(account ? 'pair_warning_account' : 'pair_warning_cv'), 'warn');

  el('actions').hidden = false;
  // A short pause before Accept is live: a click aimed at the page that was here a moment ago
  // must not land on it.
  setTimeout(() => {
    el('accept').disabled = false;
  }, 800);

  // On a browser that asks for data-collection consent (Firefox), an account pairing is
  // where the AI turns on, so the Accept click also asks for it. It has to be the first thing
  // the handler does: an `await` before it would lose the user gesture. The pairing does not
  // wait on the answer: a refusal leaves filling as it is and the AI off, askable later.
  const consent = Array.isArray(req.consent) ? req.consent : [];
  if (consent.length) para(t('consent_pair_note'), 'muted');

  const decide = (type) => async (e) => {
    if (!e.isTrusted) return;
    if (type === 'pair:accept' && consent.length)
      chrome.permissions.request({ data_collection: consent }).catch(() => {});
    el('accept').disabled = true;
    el('refuse').disabled = true;
    const res = await send({ type, id });
    if (type === 'pair:refuse') return done('pair_refused_title', 'pair_refused');
    if (res.ok) return done('pair_done_title', account ? 'pair_done_account' : 'pair_done_cv', 'ok');
    done('pair_failed_title', res.error === 'library-full' ? 'pair_library_full' : 'pair_expired');
  };
  el('accept').addEventListener('click', decide('pair:accept'));
  el('refuse').addEventListener('click', decide('pair:refuse'));
}

main();

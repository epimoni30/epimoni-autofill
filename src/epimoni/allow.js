// SPDX-License-Identifier: Apache-2.0
// The data-collection consent page (allow.html). The worker says which categories are still
// missing; the click asks the browser for exactly those. `permissions.request` is called
// first thing in the handler: an `await` before it would lose the user gesture it needs.

const send = (msg) => new Promise((r) => chrome.runtime.sendMessage(msg, (x) => r(x || {})));
const el = (id) => document.getElementById(id);
const t = (key) => chrome.i18n.getMessage(key) || key;

function show(key, className) {
  el('result').textContent = t(key);
  el('result').className = className || '';
  el('result').hidden = false;
  el('actions').hidden = true;
}

async function main() {
  document.documentElement.lang = chrome.i18n.getUILanguage().slice(0, 2);
  for (const node of document.querySelectorAll('[data-i18n]')) node.textContent = t(node.dataset.i18n);
  const { missing = [] } = await send({ type: 'consent:missing' });
  if (!missing.length) return show('consent_done', 'ok');

  el('allow').addEventListener('click', (e) => {
    if (!e.isTrusted) return;
    el('allow').disabled = true;
    chrome.permissions.request({ data_collection: missing }).then(
      (granted) => show(granted ? 'consent_done' : 'consent_refused', granted ? 'ok' : 'muted'),
      () => show('consent_refused', 'muted'),
    );
  });
}

main();

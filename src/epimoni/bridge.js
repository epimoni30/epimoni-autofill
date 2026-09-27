// SPDX-License-Identifier: Apache-2.0
// The site's door into the extension, on every browser: a content script on
// https://www.epimoni30.com that relays `window.postMessage` to the worker and the answer back.
//
// Why not `externally_connectable` alone: Firefox does not have it, and it makes the site name
// the extension's id, which differs between a store build, an unpacked build on each machine,
// and each browser. The bridge needs no id: if it answers, the extension is installed.
//
// It decides nothing. It forwards three message types and nothing else; the worker checks the
// sender's origin and frame as the browser reports them (`fromBridge` in worker.js) and applies
// the same rules to a bridged request as to an external one, confirmation page included.
// A script on the site can use it, which is no more than it could do with
// `externally_connectable`: that is why a pairing is a request the user accepts, not an order.
//
// Page side:
//   window.postMessage({epimoni: 'request', id, msg}, origin)
//   ← window.postMessage({epimoni: 'response', id, res}, origin)

(() => {
  const SITE = 'https://www.epimoni30.com';
  const FORWARD = new Set(['epimoni:ping', 'epimoni:pair', 'epimoni:pair-status']);
  if (location.origin !== SITE || window.top !== window) return;

  // Runs at document_start, before any page script: the site reads this to know there is a
  // bridge to ask, instead of waiting out a ping timeout for every visitor without one.
  document.documentElement.setAttribute('data-epimoni-bridge', '');

  const reply = (id, res) => window.postMessage({ epimoni: 'response', id, res }, SITE);

  window.addEventListener('message', (event) => {
    if (event.source !== window || event.origin !== SITE) return;
    const d = event.data;
    if (d?.epimoni !== 'request' || typeof d.id !== 'string' || !FORWARD.has(d.msg?.type)) return;
    try {
      chrome.runtime.sendMessage({ type: 'site', msg: d.msg }).then(
        (res) => reply(d.id, res || { ok: false, error: 'empty' }),
        () => reply(d.id, { ok: false, error: 'unreachable' }),
      );
    } catch {
      // The extension was reloaded or removed under a page that still holds this script.
      reply(d.id, { ok: false, error: 'unreachable' });
    }
  });
})();

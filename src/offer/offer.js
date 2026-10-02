// SPDX-License-Identifier: Apache-2.0
// The "Remplir avec Epimoni" button: offered on a page that holds an application form, filled
// only when it is clicked.
//
// Deliberately tiny and separate from content.js. It runs on the supported job boards, and, if
// the user turned the button on for every site, on every page they visit, so it must cost
// nothing where there is no form: no lexicon, no resolver, one cheap look at the page, a
// debounced second look when the page grows, and nothing at all once it has decided. The filler
// (content.js, two hundred kilobytes of language packs) is injected by the worker only after
// the click, and that click is the user's request, exactly like a click on the toolbar icon.
//
// It never fills on its own. A site where the user wants that has automatic filling, and there
// the button is not shown at all.

(() => {
  if (window.top !== window || window.__epimoniOffer) return;
  window.__epimoniOffer = true;
  if (location.hostname === 'www.epimoni30.com') return;

  const send = (msg) =>
    new Promise((r) => {
      try {
        chrome.runtime.sendMessage(msg, (x) => r(chrome.runtime.lastError ? {} : x || {}));
      } catch {
        r({}); // the extension was reloaded under this page
      }
    });
  const t = (key) => chrome.i18n.getMessage(key) || '';
  // Per tab and per site, the page's own session storage: closed here, it stays closed while
  // the person moves around this site in this tab.
  const HIDDEN = 'epimoni-offer-hidden';
  try {
    if (sessionStorage.getItem(HIDDEN)) return;
  } catch {}

  const SKIP = new Set([
    'hidden',
    'submit',
    'button',
    'image',
    'reset',
    'checkbox',
    'radio',
    'search',
    'range',
    'color',
  ]);
  const IDENTITY =
    /e-?mail|courriel|t[ée]l[ée]?phone|phone|mobile|portable|pr[ée]nom|first.?name|last.?name|given.?name|family.?name|\bnom\b|surname|nombre|apellido/i;
  const APPLICATION =
    /postuler|candidat|apply|application|curriculum|\bcv\b|r[ée]sum[ée]|lettre de motivation|cover letter|solicitud|postular/i;

  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const s = getComputedStyle(el);
    return s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05;
  };
  const described = (el) =>
    [
      el.name,
      el.id,
      el.autocomplete,
      el.placeholder,
      el.getAttribute('aria-label'),
      el.labels?.[0]?.textContent,
    ]
      .filter(Boolean)
      .join(' ');

  /**
   * An application form, by cheap evidence only: three visible fields, one of them asking who
   * you are, and either a CV upload or the page talking about applying. A login box (a
   * password field) is never one, and neither is a search bar or a newsletter box.
   */
  function looksLikeApplication() {
    if ([...document.querySelectorAll('input[type="password"]')].some(visible)) return false;
    const fields = [...document.querySelectorAll('input, textarea, select')].filter(
      (el) => !SKIP.has((el.type || '').toLowerCase()) && visible(el),
    );
    if (fields.length < 3) return false;
    const identity = fields.some(
      (el) => el.type === 'email' || el.type === 'tel' || IDENTITY.test(described(el)),
    );
    if (!identity) return false;
    if (document.querySelector('input[type="file"]')) return true;
    return APPLICATION.test(`${document.title} ${(document.body?.innerText || '').slice(0, 20000)}`);
  }

  let host = null;
  let done = false; // clicked or closed: not offered again on this page
  function show(state) {
    if (done || host || document.getElementById('epimoni-panel')) return;
    host = document.createElement('div');
    host.id = 'epimoni-offer';
    // Closed, so the page cannot read or press it; open in a development build, for the tests.
    const dev = chrome.runtime.getManifest().name.startsWith('DEV');
    const root = host.attachShadow({ mode: dev ? 'open' : 'closed' });
    const style = document.createElement('style');
    style.textContent = `
      .pill { position: fixed; z-index: 2147483646; right: 18px; bottom: 18px; display: flex; align-items: center;
        gap: 2px; background: #7c5cff; color: #fff; border-radius: 999px; box-shadow: 0 6px 22px rgba(0,0,0,.22);
        font: 600 13px/1 system-ui, -apple-system, sans-serif; animation: in .18s ease-out; }
      @keyframes in { from { transform: translateY(8px); opacity: 0 } }
      button { font: inherit; color: inherit; background: none; border: 0; cursor: pointer; }
      .go { display: flex; align-items: center; gap: 8px; padding: 10px 6px 10px 12px; }
      .mark { display: grid; place-items: center; width: 22px; height: 22px; border-radius: 6px; background: #fff;
        color: #7c5cff; font-size: 10px; font-weight: 800; letter-spacing: -.02em; }
      .x { padding: 10px 12px 10px 6px; opacity: .8; font-size: 15px; }
      .x:hover, .go:hover { opacity: 1; text-decoration: underline; }`;
    const pill = document.createElement('div');
    pill.className = 'pill';
    const go = document.createElement('button');
    go.className = 'go';
    const mark = document.createElement('span');
    mark.className = 'mark';
    mark.textContent = 'E30';
    go.append(mark, t(state.has_cv ? 'offer_fill' : 'offer_add_cv'));
    const x = document.createElement('button');
    x.className = 'x';
    x.textContent = '×';
    x.setAttribute('aria-label', t('offer_close'));
    pill.append(go, x);
    root.append(style, pill);
    go.addEventListener('click', (e) => {
      if (!e.isTrusted) return; // the page's own script cannot press it
      done = true;
      remove();
      send({ type: state.has_cv ? 'offer:fill' : 'open-options' });
    });
    x.addEventListener('click', (e) => {
      if (!e.isTrusted) return;
      done = true;
      try {
        sessionStorage.setItem(HIDDEN, '1');
      } catch {}
      remove();
      stop();
    });
    document.documentElement.appendChild(host);
  }
  function remove() {
    host?.remove();
    host = null;
  }

  let observer = null;
  let timer = null;
  const stop = () => {
    observer?.disconnect();
    clearTimeout(timer);
  };

  send({ type: 'offer:state' }).then((state) => {
    // A site that fills on its own needs no button; one that was already filled needs none
    // either (the panel is there).
    if (!state.ok || state.auto) return;
    const check = () => {
      // Filled from the toolbar meanwhile: the panel takes the corner, the button goes.
      if (document.getElementById('epimoni-panel')) {
        remove();
        stop();
        return;
      }
      if (!host && looksLikeApplication()) show(state);
    };
    check();
    // Forms that arrive after "Postuler", or with the next step of a single-page site.
    let pending = null;
    observer = new MutationObserver(() => {
      clearTimeout(pending);
      pending = setTimeout(check, 700);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    timer = setTimeout(stop, 30 * 60 * 1000);
  });
})();

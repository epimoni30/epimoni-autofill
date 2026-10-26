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
  // Words a form uses about applying for a job. "Apply" alone is left out: a coupon, a filter
  // or a setting is applied too, and a checkout asks a name, an e-mail and a phone.
  const APPLICATION =
    /postuler|candidat|apply (now|for|to|online|here)|easy apply|\bapplication\b|curriculum|\bcv\b|r[ée]sum[ée]|lettre de motivation|cover letter|solicitud|postular|aplicar|candidatura|aplikuj/i;
  // An address that says it is an application page: /apply, /applications/new, /candidature.
  const APPLY_PATH =
    /\/(apply|application|applications|candidature|candidatures|postuler|postular)(\/|$|\?)/i;

  // Web components keep their fields in shadow roots (SmartRecruiters does), out of reach of
  // querySelectorAll. These read through them, and climb from a shadow root to its host.
  const deep = (root, selector, out = []) => {
    out.push(...root.querySelectorAll(selector));
    for (const el of root.querySelectorAll('*')) if (el.shadowRoot) deep(el.shadowRoot, selector, out);
    return out;
  };
  const up = (n) => n.parentElement || n.getRootNode?.().host || null;
  const inside = (box, n) => {
    for (let x = n; x; x = up(x)) if (x === box) return true;
    return false;
  };

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

  // What a form says about itself: its headings, labels, legends, buttons and field names, never
  // the prose around it. An article that says "choose an application" next to its comment box is
  // not an application form, and the page's text used to be enough to say it was.
  const CUES =
    'h1, h2, h3, h4, h5, h6, legend, label, button, [role="button"], input[type="submit"], input[type="button"]';
  const cues = (box, els) =>
    [
      document.title,
      location.search,
      ...deep(box, CUES).map((el) => el.value || el.textContent || ''),
      ...els.map(described),
    ]
      .join(' ')
      .slice(0, 8000);

  /**
   * The fields that belong together: a form's own, and for fields outside any form, those under
   * the nearest element that holds three of them, so a comment box and a newsletter box at two
   * ends of a page stay two groups.
   */
  function groups(fields) {
    const boxes = new Set();
    for (const el of fields) {
      let box = el.closest('form');
      if (!box) {
        box = up(el);
        while (box && box !== document.body && fields.filter((f) => inside(box, f)).length < 3) box = up(box);
      }
      boxes.add(box || document.body);
    }
    // Each group is every field inside its box, so fields that stopped climbing at different
    // depths of one form are still counted together.
    return [...boxes].map((box) => [box, fields.filter((f) => inside(box, f))]);
  }

  /**
   * An application form, by cheap evidence only: three visible fields of one form, one of them
   * asking who you are, and either a CV upload in that form or the form saying it is for
   * applying. A login box (a password field) is never one, and neither is a search bar, a
   * newsletter box or a comment form.
   */
  function looksLikeApplication() {
    if (deep(document, 'input[type="password"]').some(visible)) return false;
    const fields = deep(document, 'input, textarea, select').filter(
      (el) => !SKIP.has((el.type || '').toLowerCase()) && visible(el),
    );
    if (fields.length < 3) return false;
    return groups(fields).some(([box, els]) => {
      if (els.length < 3) return false;
      const identity = els.some(
        (el) => el.type === 'email' || el.type === 'tel' || IDENTITY.test(described(el)),
      );
      if (!identity) return false;
      return (
        deep(box, 'input[type="file"]').length > 0 ||
        APPLY_PATH.test(location.pathname) ||
        APPLICATION.test(cues(box, els))
      );
    });
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
    // A tab on the right edge, halfway down, the way coupon extensions do it: out of the page's
    // corners (where chat widgets and reCAPTCHA live), visible without covering the form.
    const style = document.createElement('style');
    style.textContent = `
      .tab { position: fixed; z-index: 2147483647; right: 0; top: 50%; transform: translateY(-50%);
        width: 176px; background: #fff; color: #18181b; border: 1px solid #e4e4e7; border-right: 0;
        border-radius: 14px 0 0 14px; box-shadow: -6px 8px 28px rgba(0,0,0,.16); overflow: hidden;
        font: 13px/1.35 system-ui, -apple-system, sans-serif; animation: in .2s ease-out; }
      @keyframes in { from { transform: translate(100%, -50%) } }
      button { font: inherit; color: inherit; background: none; border: 0; cursor: pointer; }
      .head { display: flex; align-items: center; gap: 7px; padding: 9px 8px 9px 11px; background: #7c5cff; color: #fff; }
      .mark { display: grid; place-items: center; width: 22px; height: 22px; border-radius: 6px; background: #fff;
        color: #7c5cff; font-size: 10px; font-weight: 800; letter-spacing: -.02em; flex: none; }
      .name { font-weight: 700; flex: 1; }
      .x { padding: 0 4px; font-size: 16px; line-height: 1; opacity: .85; }
      .x:hover { opacity: 1; }
      .body { padding: 10px 11px 12px; }
      .hint { color: #71717a; font-size: 12px; margin-bottom: 8px; }
      .go { width: 100%; padding: 8px 10px; border-radius: 9px; background: #7c5cff; color: #fff; font-weight: 600; }
      .go:hover { background: #6a48ff; }`;
    const pill = document.createElement('div');
    pill.className = 'tab';
    pill.setAttribute('role', 'region');
    pill.setAttribute('aria-label', 'Epimoni');
    const head = document.createElement('div');
    head.className = 'head';
    const mark = document.createElement('span');
    mark.className = 'mark';
    mark.textContent = 'E30';
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = 'Epimoni';
    const x = document.createElement('button');
    x.className = 'x';
    x.textContent = '×';
    x.setAttribute('aria-label', t('offer_close'));
    head.append(mark, name, x);
    const body = document.createElement('div');
    body.className = 'body';
    const hint = document.createElement('div');
    hint.className = 'hint';
    hint.textContent = t(state.has_cv ? 'offer_hint' : 'offer_hint_no_cv');
    const go = document.createElement('button');
    go.className = 'go';
    go.textContent = t(state.has_cv ? 'offer_fill' : 'offer_add_cv');
    body.append(hint, go);
    pill.append(head, body);
    root.append(style, pill);
    // Pressed only by a click the person made on a tab they could see: the page's script cannot
    // press it, and a page that hides or covers it cannot borrow a click (src/content/clickguard.js).
    const guard = clickGuard(host, root, pill, {
      onRefuse: () => {
        hint.textContent = t('guard_refused');
        hint.setAttribute('role', 'status');
      },
    });
    go.addEventListener('click', (e) => {
      if (guard.allow(e, go)) return;
      guard.stop();
      done = true;
      if (!state.has_cv) {
        remove();
        send({ type: 'open-options' });
        return;
      }
      go.disabled = true;
      // The filler may not be injectable here (no host access to this page): say so and point
      // at the toolbar icon, rather than taking the button away with nothing filled.
      send({ type: 'offer:fill' }).then((r) => {
        if (r.ok) {
          remove();
          return;
        }
        hint.textContent = t('offer_fill_failed');
        hint.setAttribute('role', 'status');
        go.remove();
      });
    });
    x.addEventListener('click', (e) => {
      if (!e.isTrusted) return;
      guard.stop();
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

  send({ type: 'offer:state' }).then(async (state) => {
    if (!state.ok) return;
    // A site that fills on its own needs no button, as long as the filler is on this page to
    // do it. It is not when a single-page site moved here from an address it does not run on
    // (LinkedIn's feed, then a job): then the button is the only way to fill. Scripts injected
    // separately do not arrive in a set order, so the filler gets a moment to show up.
    if (state.auto) {
      if (!window.__epimoniLoaded) await new Promise((r) => setTimeout(r, 1500));
      if (window.__epimoniLoaded) return;
    }
    const check = () => {
      // Filled from the toolbar meanwhile: the panel takes the corner, the button goes.
      if (document.getElementById('epimoni-panel')) {
        remove();
        stop();
        return;
      }
      // Taken out by the page: a framework that re-renders the whole document (a failed React
      // hydration does, measured on a Greenhouse job board) drops every node it did not make.
      if (host && !host.isConnected) host = null;
      // LinkedIn runs this on every page so that a job opened from the feed still gets the
      // button, but only its job pages hold an application; the feed changes constantly and
      // must not pay for a walk of the document each time it does.
      if (location.hostname === 'www.linkedin.com' && !location.pathname.startsWith('/jobs/')) return;
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

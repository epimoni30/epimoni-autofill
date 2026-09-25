// SPDX-License-Identifier: Apache-2.0
// Content script: scan the page, resolve each control, fill what we are confident about,
// and show the user what was touched.
//
// It holds no token and makes no network call: everything goes through the service worker.
// It also never submits: there is no code path here that clicks a submit control or presses
// Enter on a form. That is what keeps the extension inside LinkedIn's "enhance the user's
// own experience" carve-out and the Chrome Web Store single-purpose rule, so it is a
// structural property, not a setting.

(() => {
  if (window.__epimoniLoaded) return;
  window.__epimoniLoaded = true;
  const DEV = typeof EPIMONI_DEV !== 'undefined' && EPIMONI_DEV;
  if (DEV) console.log('[epimoni] content script active on', location.href);

  const resolver = createResolver({ lexicons: EPIMONI_PACKS, autocomplete: EPIMONI_AUTOCOMPLETE });
  const send = (msg) => new Promise((r) => chrome.runtime.sendMessage(msg, (x) => r(x || {})));
  // Never show a canonical key to a user: they are internal names, and an English one on a
  // French form reads as a bug. A missing translation falls back to the key with underscores
  // stripped rather than rendering "__MSG_field_x__".
  const t = (key, subs) => chrome.i18n.getMessage(key, subs) || key.replace(/^field_/, '').replace(/_/g, ' ');
  // A scoped key names a field of one entry, so its label says which: "Expérience 2 ·
  // Entreprise". Message names cannot hold a dot, hence `field_work_company`.
  const fieldLabel = (k, index) => {
    const label = t(`field_${k.replace('.', '_')}`);
    if (index === undefined || index === null) return label;
    return `${t(`cvsection_${k.slice(0, k.indexOf('.'))}`)} ${index + 1} · ${label}`;
  };

  const report = (what, extra = {}) =>
    send({ type: 'report', name: 'ext_fill', meta: { what, host: location.hostname, ...extra } });
  const seen = (extra = {}) =>
    send({ type: 'report', name: 'ext_seen', meta: { host: location.hostname, ...extra } });

  let lastRun = [];
  let lastSuggestions = [];
  let dismissed = 0;
  // The advert on this page, extracted once. Extraction is free; the analysis is not, so the
  // two are deliberately separate: we read the page on sight and spend nothing until asked.
  let posting = null;
  const EDITOR = 'https://www.epimoni30.com/editeur';

  // The panel is appended to the host page's DOM, so the page's own script can reach it. It can
  // read what the panel says, which is why nothing from the network is ever parsed as markup
  // (`esc`), and it can call `.click()` on its buttons, which is why every button that spends,
  // writes or opens something acts only on a click the user made (`byUser`).
  const esc = (v) =>
    String(v).replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    );
  const byUser = (fn) => (e) => {
    if (e?.isTrusted) return fn(e);
  };
  const money = (n) => `${Number(n)} %`;

  /**
   * "Voir l'analyse complète": the same run, opened on the site.
   *
   * `id` + `ml` is the editor's documented arrival contract (`utils/editorLink.js`): `ml` is a
   * stored run whose own `analysis_type` decides where it lands, and `id` names the document
   * to lay it over. There is no `cv` because `cvVSoffer-doc` stores no `cv_id`: the CV is
   * already the builder document this run was made from.
   */
  function fullAnalysisHref({ ml_id: mlId, builder_id: builderId }) {
    const params = new URLSearchParams();
    if (builderId) params.set('id', builderId);
    params.set('ml', mlId);
    return `${EDITOR}?${params.toString()}`;
  }

  async function fill() {
    const { profile, entries = {} } = await send({ type: 'profile' });
    if (DEV) console.log('[epimoni] profile fields:', profile ? Object.keys(profile).length : 0);
    // Nothing to fill from. That is one state, whatever the reason: no account, no hand-off,
    // nothing typed in. It used to say "connect your Epimoni account", which is now advice
    // about only one of the three ways out of it.
    if (!profile || !Object.keys(profile).length) {
      banner('no-profile');
      return;
    }

    // The engine, fillers included, is `runFill` in fill.js: the same code the measurement
    // runs. What stays here is the part a user sees: outlines, the panel, the telemetry.
    const run = await runFill({
      root: document,
      url: location.href,
      profile,
      entries,
      resolver,
      fillers: EPIMONI_FILLERS,
    });
    if (DEV && run.errors.length) console.warn('[epimoni] fillers:', run.errors);
    const { filled, suggestions, blocks } = run;
    for (const f of filled) {
      f.outline = f.el.style.outline;
      f.el.style.outline = '2px solid #7c5cff';
      if (!f.radio) f.el.style.outlineOffset = '1px';
    }

    const left = leftovers(blocks, entries);
    lastRun = filled;
    lastSuggestions = suggestions;
    dismissed = 0;
    report('fill_run', {
      filled: filled.length,
      suggested: suggestions.length,
      ai_candidates: run.ai,
      unknown: run.unknown,
      controls: run.els.length,
      radios: run.radios,
      // Which fillers applied here, by id. The per-host fill rate is how a filler proves it
      // earns its place.
      fillers: run.fillers.join(','),
      // Field *names*, never values, which questions we can answer is the thing worth
      // knowing; what this user answered is not ours to collect.
      keys: filled.map((f) => f.key).join(','),
      by_label: filled.filter((f) => f.via !== 'autocomplete').length,
      blocks: new Set(
        blocks.filter((b) => b?.section && b.index !== null).map((b) => `${b.section}#${b.index}`),
      ).size,
      leftover: left.reduce((n, l) => n + l.count, 0),
    });
    banner('filled', filled, {
      suggested: suggestions.length,
      ai: run.ai,
      ongoing: run.ongoing,
      leftovers: left,
    });
  }

  /**
   * CV entries with no block on this page, per section the page actually asks for.
   *
   * The extension never clicks "Ajouter une expérience": adding structure to somebody's form
   * is the page's business and theirs. So it says what is left, and a second click after they
   * add a block fills it: filled blocks read as answered, and block *k* still maps to entry
   * *k*. A section the page does not ask for is not "left over"; it is simply not asked.
   */
  function leftovers(blocks, entries) {
    const seen = new Map();
    for (const b of blocks) {
      if (!b?.section || b.index === null) continue;
      seen.set(b.section, Math.max(seen.get(b.section) ?? -1, b.index));
    }
    return [...seen]
      .map(([section, top]) => ({ section, count: (entries[section]?.length || 0) - (top + 1) }))
      .filter((l) => l.count > 0);
  }

  async function undoAll() {
    for (const { el, outline, radio, undo } of lastRun) {
      // `clearValue` goes through the same native-setter-plus-events path as filling.
      // Assigning `selectedIndex = 0` directly (which this did) clears the DOM while
      // leaving the framework's state holding the old value, so the form still submits it.
      // A filler's widget is undone the filler's way, through the same guarded API.
      if (undo)
        await Promise.resolve()
          .then(undo)
          .catch(() => {});
      else if (radio) clearRadio(el);
      else clearValue(el);
      el.removeAttribute('data-epimoni-filled');
      // Restore whatever outline the page had, rather than assuming there was none.
      el.style.outline = outline || '';
      report('field_rejected', {});
    }
    lastRun = [];
    document.getElementById('epimoni-panel')?.remove();
  }

  /**
   * The review surface. A summary panel rather than a chip floating beside each field:
   * anchoring an overlay to a control inside a scrolling ATS form is a well-known way to
   * end up with labels drifting over the page, and the thing the user actually needs is one
   * place that answers "what did you just touch, and can I undo it".
   */
  function banner(kind, filled = [], counts = {}) {
    document.getElementById('epimoni-panel')?.remove();
    // The panel sits in the host page's DOM, so it lives in a closed shadow root: the page's
    // script can see that a panel exists, but not read it, and it lists CV values the user
    // has not put in any field yet (the "à vérifier" suggestions), which are not the page's to
    // read. Development builds open it so the end-to-end suite can.
    const host = document.createElement('div');
    host.id = 'epimoni-panel';
    const panel = document.createElement('div');
    host.attachShadow({ mode: DEV ? 'open' : 'closed' }).appendChild(panel);
    panel.style.cssText = [
      'position:fixed',
      'z-index:2147483647',
      'right:16px',
      'bottom:16px',
      'max-width:320px',
      'font:13px/1.45 system-ui,-apple-system,sans-serif',
      'color:#111',
      'background:#fff',
      'border:1px solid #e4e4e7',
      'border-radius:12px',
      'box-shadow:0 8px 28px rgba(0,0,0,.14)',
      'padding:12px 14px',
    ].join(';');

    if (kind === 'no-profile') {
      panel.innerHTML = `<b>Epimoni</b><br>${t('panel_no_profile')}`;
      // The CV editor is an extension page, which a content script cannot open itself.
      const b = document.createElement('button');
      b.textContent = t('panel_add_cv');
      b.style.cssText =
        'display:block;margin-top:9px;border:1px solid #7c5cff;background:#7c5cff;color:#fff;font-weight:600;border-radius:8px;padding:6px 10px;cursor:pointer;font:inherit';
      b.addEventListener(
        'click',
        byUser(() => send({ type: 'open-options' })),
      );
      panel.appendChild(b);
      const a = document.createElement('a');
      a.href = 'https://www.epimoni30.com/extension-chrome';
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = t('panel_open_epimoni');
      a.style.cssText = 'display:inline-block;margin-top:8px;color:#7c5cff;font-weight:600';
      panel.appendChild(a);
    } else {
      const lines = filled.map((f) => `<li>${fieldLabel(f.key, f.index)}</li>`).join('');
      const headline =
        filled.length === 1 ? t('panel_filled_one') : t('panel_filled_many', [String(filled.length)]);
      panel.innerHTML =
        `<b>${headline}</b>` +
        (counts.ai
          ? `<br><span style="color:#71717a">${t('panel_open_questions', [String(counts.ai)])}</span>`
          : '') +
        `<ul style="margin:8px 0 0;padding-left:18px;color:#3f3f46">${lines}</ul>` +
        (counts.leftovers || [])
          .map(
            (l) =>
              `<div style="margin-top:8px;color:#3f3f46">${t('panel_leftover', [String(l.count), t(`cvsection_${l.section}`)])}</div>`,
          )
          .join('') +
        (counts.ongoing ? `<div style="margin-top:8px;color:#3f3f46">${t('panel_tick_current')}</div>` : '') +
        `<div style="margin-top:10px;color:#71717a">${t('panel_review')}</div>`;
      const undo = document.createElement('button');
      undo.textContent = t('panel_undo');
      undo.style.cssText =
        'margin-top:10px;border:1px solid #e4e4e7;background:#fafafa;border-radius:8px;padding:5px 10px;cursor:pointer;font:inherit;color:#18181b';
      undo.addEventListener('click', byUser(undoAll));
      panel.appendChild(undo);
    }
    if (kind !== 'no-profile') suggestionSection(panel);
    if (kind !== 'no-profile') offerSection(panel);

    const close = document.createElement('button');
    close.textContent = '×';
    close.setAttribute('aria-label', t('panel_close'));
    close.style.cssText =
      'position:absolute;top:6px;right:8px;border:0;background:none;font-size:16px;cursor:pointer;color:#a1a1aa';
    close.addEventListener('click', () => host.remove());
    panel.appendChild(close);
    document.documentElement.appendChild(host);
  }

  /**
   * The fields the resolver named but would not commit to.
   *
   * These are the ones the landing page calls "à vérifier": ambiguous between two keys, or
   * below the fill threshold. The engine is right to refuse them (a wrong value in a
   * submitted application is unrecoverable) but refusing silently and showing a number was
   * half a feature. Here the user gets the value and one click either way.
   */
  function suggestionSection(panel) {
    if (!lastSuggestions.length) return;

    const box = document.createElement('div');
    box.style.cssText = 'margin-top:10px;padding-top:10px;border-top:1px solid #e4e4e7';
    box.innerHTML = `<div style="color:#71717a;margin-bottom:6px">${t('panel_to_check', [String(lastSuggestions.length)])}</div>`;

    for (const s of lastSuggestions) {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:6px;margin-top:5px';

      const label = document.createElement('span');
      label.style.cssText =
        'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#3f3f46';
      label.textContent = `${fieldLabel(s.key, s.index)} : ${s.value}`;
      label.title = String(s.value);
      // Hovering the row points at the field it is about, which is the cheapest way to answer
      // "which box is this?" without anchoring an overlay to a control inside a scrolling form.
      row.addEventListener('mouseenter', () => {
        s.el.style.outline = '2px dashed #a1a1aa';
      });
      row.addEventListener('mouseleave', () => {
        if (!s.accepted) s.el.style.outline = s.prevOutline || '';
      });

      const accept = document.createElement('button');
      accept.textContent = '✓';
      accept.setAttribute('aria-label', t('panel_accept'));
      accept.style.cssText =
        'border:1px solid #e4e4e7;background:#fafafa;border-radius:6px;padding:1px 7px;cursor:pointer;font:inherit;color:#18181b';
      accept.addEventListener(
        'click',
        byUser(async () => {
          // Through the same path as a fill, the native setter, or the owning filler's writer,
          // or a controlled form keeps the old value in its state and submits that instead.
          const { ok, undo } = await writeOne(s.el, s.value, s.owner);
          if (!ok) return;
          s.undo = undo;
          s.accepted = true;
          s.el.style.outline = '2px solid #7c5cff';
          // Joining `lastRun` is what puts it under "tout annuler": an accepted suggestion is
          // a fill, and it must be as undoable as one.
          lastRun.push({
            el: s.el,
            key: s.key,
            index: s.index,
            value: s.value,
            via: 'suggest',
            outline: s.prevOutline,
            undo: s.undo,
          });
          report('field_accepted', { key: s.key });
          row.remove();
          if (!box.querySelector('button')) box.remove();
        }),
      );

      const dismiss = document.createElement('button');
      dismiss.textContent = '×';
      dismiss.setAttribute('aria-label', t('panel_dismiss'));
      dismiss.style.cssText =
        'border:1px solid #e4e4e7;background:transparent;border-radius:6px;padding:1px 7px;cursor:pointer;font:inherit;color:#a1a1aa';
      dismiss.addEventListener(
        'click',
        byUser(() => {
          s.el.style.outline = s.prevOutline || '';
          dismissed += 1;
          report('field_rejected', { key: s.key });
          row.remove();
          if (!box.querySelector('button')) box.remove();
        }),
      );

      s.prevOutline = s.el.style.outline;
      row.append(label, accept, dismiss);
      box.appendChild(row);
    }
    panel.appendChild(box);
  }

  /**
   * The offer half of the panel: is this advert worth applying to, and where am I short.
   *
   * It offers, it never runs on its own. Extraction is free, but the comparison is a metered
   * LLM call, and spending somebody's hourly quota because they opened a page is both a cost
   * and a consent problem. One click, and only after they ask.
   *
   * It no longer requires an account. A free or anonymous caller gets one analysis an hour,
   * the website's own window, and a paying customer is not metered at all. The cost is named *before* the button, not discovered as a refusal afterwards.
   */
  function offerSection(panel) {
    if (!posting) posting = extractPosting(document, location.href);
    if (!posting.ok) return; // not a posting page, or a wall, so say nothing rather than guess

    const box = document.createElement('div');
    box.style.cssText = 'margin-top:12px;padding-top:10px;border-top:1px solid #e4e4e7';
    panel.appendChild(box);

    const say = (html) => {
      box.innerHTML = html;
    };
    // The plans on the site's home page, in the user's language: /#pricing, /en/#pricing…
    const lang = chrome.i18n.getUILanguage().slice(0, 2);
    const plans = `https://www.epimoni30.com/${['en', 'es'].includes(lang) ? `${lang}/` : ''}#pricing`;
    const cta = (parent, href, text) => {
      const a = document.createElement('a');
      a.href = href;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = text;
      a.style.cssText = 'display:inline-block;margin-top:8px;color:#7c5cff;font-weight:600';
      parent.appendChild(a);
      return a;
    };

    const idle = () => {
      say(`<div style="color:#3f3f46;margin-bottom:8px">${t('panel_offer_found')}</div>`);
      const go = document.createElement('button');
      go.textContent = t('panel_analyse_cta');
      go.style.cssText =
        'border:1px solid #7c5cff;background:#7c5cff;color:#fff;font-weight:600;border-radius:8px;padding:6px 10px;cursor:pointer;font:inherit';
      go.addEventListener('click', byUser(run));
      box.appendChild(go);

      // What this click costs, written beside the button rather than after it. Asked
      // asynchronously so the button is live immediately: the answer only adds a line.
      const note = document.createElement('div');
      note.style.cssText = 'margin-top:7px;color:#71717a;font-size:12px';
      box.appendChild(note);
      send({ type: 'tier' }).then((tier) => {
        if (tier.paid) note.textContent = t('panel_tier_paid');
        else if (tier.rate_limited) {
          note.textContent = t('panel_tier_spent', [String(Math.ceil((tier.reset_seconds || 0) / 60))]);
          // The free hour is spent: the way past the wait is a plan, said before the click
          // rather than only after a refused one.
          cta(note, plans, t('panel_quota_cta')).style.display = 'block';
        } else note.textContent = t(tier.mode === 'account' ? 'panel_tier_free' : 'panel_tier_anon');
      });
    };

    async function run() {
      say(`<div style="color:#71717a">${t('panel_analysing')}</div>`);
      const res = await send({
        type: 'analyse',
        posting,
        host: location.hostname,
        lang: chrome.i18n.getUILanguage().slice(0, 2),
      });

      if (res.ok) {
        const { score, weakest } = res.teaser || {};
        const gaps = (weakest || [])
          .map((w) => `<li>${esc(t(`section_${w.name}`))}: ${money(w.score)}</li>`)
          .join('');
        say(
          (score === null || score === undefined
            ? ''
            : `<div style="font-size:15px;font-weight:700">${t('panel_match', [money(score)])}</div>`) +
            (gaps
              ? `<div style="color:#71717a;margin-top:6px">${t('panel_weakest')}</div><ul style="margin:4px 0 0;padding-left:18px;color:#3f3f46">${gaps}</ul>`
              : '') +
            // The account token had expired and the run went out on the free anonymous tier
            // instead. It worked, and the user should know which allowance paid for it.
            (res.stale
              ? `<div style="color:#b45309;margin-top:6px;font-size:12px">${t('panel_stale_degraded')}</div>`
              : ''),
        );
        // `linkable` is the worker's answer, not a guess from `ml_id`: only a paired account
        // can open the run on the site, because /editeur reads it back through a session that
        // owns it. Offering the link to an anonymous caller sends them to a page that finds
        // nothing, which is worse than not offering it.
        if (res.ml_id && res.linkable) {
          const link = cta(box, fullAnalysisHref(res), t('panel_see_full'));
          // The click is the hand-off. The run itself is already paid for: the site reads it
          // back through the unmetered `/ml/detail/{ml_id}`.
          link.addEventListener('click', () => report('handoff_site', { host: location.hostname }));
        } else if (res.ml_id) {
          // Nothing to link to, so the offer is the thing an account would buy: keeping this.
          cta(box, 'https://www.epimoni30.com/extension-chrome', t('panel_keep_analysis'));
        }
        return;
      }

      // Each refusal means something different, and a single "ça n'a pas marché" would hide
      // the only one the user can act on.
      const WHY = {
        quota: () => t('panel_quota', [String(Math.ceil((res.seconds || 0) / 60))]),
        expired: () => t('panel_stale'),
        'no-cv': () => t('panel_no_cv'),
        'too-long': () => t('panel_too_long'),
        network: () => t('panel_offline'),
        // The comparison came back having assessed nothing. The hour is not spent (the
        // backend refunds the window when it refuses) so the one thing to offer is another go.
        empty: () => t('panel_empty'),
      };
      say(`<div style="color:#3f3f46">${(WHY[res.kind] || (() => t('panel_analyse_failed')))()}</div>`);
      if (res.kind === 'empty' || res.kind === 'failed' || res.kind === 'network') {
        const retry = document.createElement('button');
        retry.textContent = t('panel_retry');
        retry.style.cssText =
          'margin-top:8px;border:1px solid #e4e4e7;background:#fafafa;border-radius:8px;padding:5px 10px;cursor:pointer;font:inherit;color:#18181b';
        // The user's click, not an automatic second attempt: a retry is another model call,
        // and spending one on every occurrence without being asked trades a visible failure
        // for an invisible bill.
        retry.addEventListener('click', byUser(run));
        box.appendChild(retry);
      }
      if (res.kind === 'no-cv') {
        // The CV is the user's to fix and the editor is where they fix it: an extension
        // page, so it goes through the worker rather than through an href.
        const b = document.createElement('button');
        b.textContent = t('panel_add_cv');
        b.style.cssText =
          'margin-top:8px;border:1px solid #e4e4e7;background:#fafafa;border-radius:8px;padding:5px 10px;cursor:pointer;font:inherit;color:#18181b';
        b.addEventListener(
          'click',
          byUser(() => send({ type: 'open-options' })),
        );
        box.appendChild(b);
      } else if (res.kind === 'quota') {
        cta(box, plans, t('panel_quota_cta'));
      } else if (res.kind === 'expired') {
        cta(box, 'https://www.epimoni30.com/extension-chrome', t('panel_open_epimoni'));
      }
    }

    idle();
  }

  chrome.runtime.onMessage.addListener((msg, _s, respond) => {
    if (msg?.type === 'fill') {
      fill();
      respond({ ok: true });
    }
    return false;
  });

  // Development builds only: lets a test drive a fill without a toolbar click. A shipped
  // build has EPIMONI_DEV false, so a crafted URL can never make the extension act.
  if (DEV && new URLSearchParams(location.search).get('epimoni_autofill') === '1') {
    console.log('[epimoni] autofill trigger seen');
    fill();
  }

  /**
   * What became of this application page, reported once as the user leaves it.
   *
   * The editor's `session_id` has no analogue here, there is no page load to belong to and
   * the worker is killed every thirty seconds, so the unit is one page: how much we filled,
   * and what the user did with what we only proposed. That last number is the one read on
   * whether the "à vérifier" tier is useful or merely noise.
   *
   * `visibilitychange → hidden` rather than `unload`: `unload` does not fire reliably on
   * mobile or on a bfcache restore, and is the classic way to lose the very events you were
   * counting on. `pagehide` is kept as the belt to that braces, and a `once` guard stops the
   * pair from double-counting when both fire.
   */
  let ended = false;
  function endSession() {
    if (ended) return;
    if (!lastRun.length && !lastSuggestions.length) return; // nothing happened; say nothing
    ended = true;
    const accepted = lastRun.filter((f) => f.via === 'suggest').length;
    send({
      type: 'report',
      name: 'ext_session_end',
      meta: {
        host: location.hostname,
        filled: lastRun.length - accepted,
        accepted,
        rejected: dismissed,
        // The number `fill_run` cannot know, and the reason this event is worth sending at
        // all: proposed, and the user left without answering either way. A high share here
        // means the "à vérifier" list is being ignored rather than used.
        unanswered: Math.max(lastSuggestions.length - accepted - dismissed, 0),
      },
    });
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') endSession();
  });
  window.addEventListener('pagehide', endSession);

  // On a declared site, offer rather than act: filling a form the user has not asked about
  // is how an extension surprises somebody mid-application.
  if (document.querySelector('form, [role="form"]')) {
    const els = fillableElements(document);
    if (els.length >= 3) seen({ controls: els.length });
  }
})();

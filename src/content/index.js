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
  // The address the last fill ran at, clicked or automatic: automatic filling leaves it alone.
  let filledFor = null;
  // Whether this site fills on its own: the panel offers to turn it on when it does not.
  let siteAuto = false;
  // Which CV of the library this page is filled from. Null is the active one; the panel's
  // picker sets it for this page only, and the offer analysis follows it.
  let pageCvId = null;
  let choices = [];
  // This page's entry in the local application tracker, once a fill has recorded it.
  let tracked = null;
  // The form's cover-letter box, when it has one: `{el, max}`. Filled by the AI tier only,
  // and only through the panel, never by the fill itself.
  let letterTarget = null;
  // The CV entries this page was filled from, for the free skills line.
  let pageEntries = {};
  // Whether this browser has a paired Epimoni account with a live token, which is what the
  // AI features (the analysis, the letter) need. Everything else in the panel is free.
  let pageAi = false;
  let pageStale = false;
  // Paired, but the browser still needs the user's consent to send the CV (Firefox).
  let pageConsent = false;

  /**
   * In place of an AI button, for somebody without a paired account: what it needs and where
   * to get it. The button itself is shown disabled above, so the feature stays visible.
   */
  function needsAccount(parent) {
    const note = document.createElement('div');
    note.style.cssText = 'margin-top:7px;color:#71717a;font-size:12px';
    if (pageConsent) {
      // The grant is asked on an extension page, inside a click there: the panel only opens it.
      note.textContent = t('ai_consent_note');
      const b = document.createElement('button');
      b.textContent = t('ai_consent_cta');
      b.style.cssText =
        'display:block;margin-top:4px;border:0;background:none;padding:0;color:#7c5cff;font-weight:600;cursor:pointer;font:inherit';
      b.addEventListener(
        'click',
        byUser(() => send({ type: 'consent:open' })),
      );
      note.appendChild(b);
      parent.appendChild(note);
      return;
    }
    note.textContent = t(pageStale ? 'panel_ai_reconnect' : 'panel_ai_needs_account');
    const a = document.createElement('a');
    a.href = 'https://www.epimoni30.com/extension-chrome';
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = t(pageStale ? 'panel_ai_reconnect_cta' : 'panel_ai_connect');
    a.style.cssText = 'display:block;margin-top:4px;color:#7c5cff;font-weight:600';
    note.appendChild(a);
    parent.appendChild(note);
  }
  let highlighted = false;

  /**
   * The letter's character limit: the box's own `maxlength`, else what its label says
   * ("1500 caractères maximum", "max. 1 500 caractères"). Null when neither says.
   */
  function letterLimit(el, bundle) {
    if (el.maxLength > 0) return el.maxLength;
    for (const src of bundle.sources) {
      const m = /\b(\d{1,2} \d{3}|\d{3,5}) (caracteres|characters|signes|caractere)\b/.exec(src.text);
      if (m) return Number(m[1].replace(' ', ''));
    }
    return null;
  }

  /** The cover-letter box among a run's controls, if it is empty and in view. */
  function findLetter(run) {
    const row = run.rows.find(
      (r) => r.decision.key === 'cover_letter' && r.el.tagName === 'TEXTAREA' && !hasUserValue(r.el),
    );
    return row ? { el: row.el, max: letterLimit(row.el, row.bundle) } : null;
  }

  /**
   * Record this page in the tracker. The worker keys it on the tab's address, so all a page
   * says is what the job is: from the advert when there is one, else the page's title.
   */
  async function track(fields) {
    if (!fields) return;
    if (!posting) posting = extractPosting(document, location.href);
    const res = await send({
      type: 'app:record',
      title: posting.ok ? posting.title : document.title,
      company: posting.ok ? posting.organisation : '',
      from_advert: Boolean(posting.ok),
      fields,
      cv_id: pageCvId,
    });
    if (res.ok) tracked = res;
  }
  let lastSuggestions = [];
  let dismissed = 0;
  // The advert on this page, extracted once. Extraction is free; the analysis is not, so the
  // two are deliberately separate: we read the page on sight and spend nothing until asked.
  let posting = null;
  const EDITOR = 'https://www.epimoni30.com/editeur';

  // The panel is appended to the host page's DOM, so the page's own script can reach it. It can
  // read what the panel says, which is why the panel is built, never parsed: every string goes
  // in as text through `h`, and there is no `innerHTML` to forget an escape in. It can also
  // call `.click()` on its buttons, which is why every button that spends, writes or opens
  // something acts only on a click the user made (`byUser`).
  const h = (tag, style, ...kids) => {
    const n = document.createElement(tag);
    if (style) n.style.cssText = style;
    for (const k of kids)
      if (k !== null && k !== undefined && k !== false && k !== '')
        n.append(typeof k === 'object' ? k : String(k));
    return n;
  };
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

  // Controls this page has already been through. A re-fill (below) writes and offers only what
  // is not in here, so a field the user emptied on purpose is not filled again behind them.
  const handled = new WeakSet();
  // CV uploads this page has been given the PDF in. Many ATS upload on `change` and then empty
  // the input, which would make it look unanswered to the next click: attaching again would
  // send the employer the same CV twice. Undo releases them.
  const attached = new WeakSet();
  // How long after a fill the page is watched for new questions: a multi-step form (LinkedIn
  // Easy Apply, most ATS wizards) renders its next step after the user presses "Suivant".
  const WATCH_MS = 2 * 60 * 1000;
  let watcher = null;
  // The panel's live parts, kept here because in a shipped build its shadow root is closed.
  let ui = null;

  /** The attached PDF, fetched from the worker only once a CV upload on this page asks for it. */
  async function loadCvFile() {
    const r = await send({ type: 'cv-file', id: pageCvId });
    if (!r.data) return null;
    const bin = atob(r.data);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
    return new File([bytes], r.name, { type: r.type });
  }

  const engine = (ctx, skip) =>
    runFill({
      root: document,
      url: location.href,
      profile: ctx.profile,
      entries: ctx.entries,
      files: ctx.files,
      resolver,
      fillers: EPIMONI_FILLERS,
      skip,
    });

  function remember(run) {
    for (const f of run.filled) if (f.key === 'cv_file') attached.add(f.el);
    for (const r of run.rows) handled.add(r.el);
    for (const { group } of run.radioRows) for (const r of group.inputs) handled.add(r);
  }

  function outline(filled) {
    for (const f of filled) {
      f.outline = f.el.style.outline;
      f.el.style.outline = '2px solid #7c5cff';
      if (!f.radio) f.el.style.outlineOffset = '1px';
    }
  }

  function reportRun(run, extra = {}) {
    const { filled, suggestions, blocks } = run;
    report('fill_run', {
      filled: filled.length,
      suggested: suggestions.length,
      ai_candidates: run.ai,
      unknown: run.unknown,
      controls: run.els.length,
      radios: run.radios,
      files: run.files,
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
      leftover: leftovers(blocks, run.entries).reduce((n, l) => n + l.count, 0),
      ...extra,
    });
  }

  /**
   * One fill of this page. `auto` is a fill nobody clicked for, on a site where the user turned
   * automatic filling on: it says nothing when it has nothing to say (no CV yet, or a form
   * with nothing it recognises), and a page it fills only one field of, a newsletter box or a
   * search bar, is not recorded as an application.
   */
  async function fill({ auto = false } = {}) {
    watcher?.stop();
    filledFor = location.href;
    const {
      profile,
      entries = {},
      cv_file: cvFile,
      cv_id: cvId,
      ai,
      stale,
      consent,
    } = await send({ type: 'profile', id: pageCvId });
    pageAi = Boolean(ai);
    pageStale = Boolean(stale);
    pageConsent = Boolean(consent);
    pageCvId = cvId || pageCvId;
    pageEntries = entries;
    // The names of the other CVs, for the picker. Only when there is more than one.
    choices = (await send({ type: 'cv:choices' })).cvs || [];
    siteAuto = Boolean((await send({ type: 'site:auto' })).auto);
    if (DEV) console.log('[epimoni] profile fields:', profile ? Object.keys(profile).length : 0);
    // Nothing to fill from. That is one state, whatever the reason: no account, no hand-off,
    // nothing typed in. It used to say "connect your Epimoni account", which is now advice
    // about only one of the three ways out of it.
    if (!profile || !Object.keys(profile).length) {
      if (auto) return;
      banner('no-profile');
      return;
    }
    const ctx = {
      profile,
      entries,
      files: cvFile ? { cv_file: { name: cvFile.name, load: loadCvFile } } : {},
    };

    // The engine, fillers included, is `runFill` in fill.js: the same code the measurement
    // runs. What stays here is the part a user sees: outlines, the panel, the telemetry.
    // A click goes over the whole page again (a block the user added since is filled, and
    // anything answered is left alone), except a CV upload already given the PDF; only the
    // automatic re-fill skips everything it has seen.
    const run = await engine(ctx, attached);
    run.entries = entries;
    if (auto && !run.filled.length && !run.suggestions.length) return;
    if (DEV && run.errors.length) console.warn('[epimoni] fillers:', run.errors);
    remember(run);
    letterTarget = findLetter(run);
    outline(run.filled);
    lastRun = run.filled;
    lastSuggestions = run.suggestions;
    dismissed = 0;
    reportRun(run);
    await track(auto && lastRun.length < 2 ? 0 : lastRun.length);
    banner('filled', lastRun, {
      auto,
      suggested: run.suggestions.length,
      ai: run.ai,
      ongoing: run.ongoing,
      leftovers: leftovers(run.blocks, entries),
    });
    watch(ctx);
  }

  /**
   * Keep filling as the form grows, for a while after a fill.
   *
   * The next step of a wizard, a section rendered late, a block the user added: each used to
   * need another toolbar click. Now new controls are filled the same way, with the same
   * resolver and the same refusals, and only new ones (`handled`). It stops after
   * `WATCH_MS`, on "tout annuler", and on the next click, which starts it again.
   *
   * Only added nodes wake it, and only when they hold a form control: the page's own
   * animations, and this panel, never trigger a scan.
   */
  function watch(ctx) {
    let timer = null;
    let running = false;
    const CONTROLS = 'input, textarea, select, [role="combobox"]';
    const obs = new MutationObserver((muts) => {
      const grew = muts.some((m) =>
        Array.from(m.addedNodes).some(
          (n) =>
            n.nodeType === 1 &&
            n.id !== 'epimoni-panel' &&
            (n.matches(CONTROLS) || n.querySelector(CONTROLS)),
        ),
      );
      if (!grew) return;
      clearTimeout(timer);
      timer = setTimeout(refill, 400);
    });
    const stop = () => {
      obs.disconnect();
      clearTimeout(timer);
      clearTimeout(idle);
      if (watcher === self) watcher = null;
    };
    const idle = setTimeout(stop, WATCH_MS);
    const self = { stop };
    watcher = self;
    obs.observe(document.documentElement, { childList: true, subtree: true });

    async function refill() {
      if (running || watcher !== self) return;
      running = true;
      try {
        const run = await engine(ctx, handled);
        run.entries = ctx.entries;
        remember(run);
        const letterAppeared = !letterTarget && findLetter(run);
        if (letterAppeared) letterTarget = letterAppeared;
        if (letterAppeared && ui?.host.isConnected) ui.letter?.();
        if (watcher !== self || (!run.filled.length && !run.suggestions.length)) return;
        outline(run.filled);
        lastRun.push(...run.filled);
        lastSuggestions.push(...run.suggestions);
        reportRun(run, { refill: 1 });
        track(lastRun.length);
        if (ui?.host.isConnected) {
          ui.update(lastRun, run.suggestions, { ai: run.ai, leftovers: leftovers(run.blocks, ctx.entries) });
        } else {
          banner('filled', lastRun, { ai: run.ai, leftovers: leftovers(run.blocks, ctx.entries) });
        }
      } finally {
        running = false;
      }
    }
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

  async function undoAll({ quiet = false } = {}) {
    watcher?.stop();
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
      attached.delete(el);
      // Restore whatever outline the page had, rather than assuming there was none.
      el.style.outline = outline || '';
      // Switching CV undoes to refill: not the user rejecting what was filled.
      if (!quiet) report('field_rejected', {});
    }
    lastRun = [];
    document.getElementById('epimoni-panel')?.remove();
  }

  /**
   * "Ajoutée à vos candidatures", and the one thing the extension cannot know by itself:
   * whether the user sent it. It never submits, so the user says so, in one click.
   */
  function trackerLine() {
    const box = document.createElement('div');
    box.style.cssText = 'margin-top:10px;color:#3f3f46';
    const say = document.createElement('div');
    const render = () => {
      say.textContent = t(tracked.status === 'filled' ? 'panel_tracked' : 'panel_tracked_applied');
      sent.hidden = tracked.status !== 'filled';
    };
    const sent = document.createElement('button');
    sent.textContent = t('panel_mark_applied');
    sent.style.cssText =
      'margin:6px 6px 0 0;border:1px solid #e4e4e7;background:#fafafa;border-radius:8px;padding:5px 10px;cursor:pointer;font:inherit;color:#18181b';
    sent.addEventListener(
      'click',
      byUser(async () => {
        const res = await send({ type: 'app:applied' });
        if (res.ok) tracked = { ...tracked, status: res.status };
        render();
      }),
    );
    const open = document.createElement('button');
    open.textContent = t('panel_open_tracker');
    open.style.cssText =
      'margin-top:6px;border:0;background:none;padding:0;cursor:pointer;font:inherit;color:#7c5cff;font-weight:600';
    open.addEventListener(
      'click',
      byUser(() => send({ type: 'open-tracker' })),
    );
    box.append(say, sent, open);
    render();
    return box;
  }

  /**
   * "Rempli avec [CV court ▾]": which CV of the library filled this page, and another one in
   * one step. Choosing undoes this fill and fills again from the other CV, for this page only:
   * the one the extension uses everywhere else is chosen in the popup or on the CV page.
   */
  function picker() {
    const row = document.createElement('label');
    row.style.cssText = 'display:flex;align-items:center;gap:6px;margin:0 22px 8px 0;color:#71717a';
    row.append(t('panel_filled_with'));
    const select = document.createElement('select');
    select.style.cssText =
      'flex:1;min-width:0;font:inherit;color:#18181b;background:#fff;border:1px solid #e4e4e7;border-radius:6px;padding:2px 4px';
    for (const c of choices) {
      const o = document.createElement('option');
      o.value = c.id;
      o.textContent = c.label || t('opt_cv_untitled');
      o.selected = c.id === pageCvId;
      select.appendChild(o);
    }
    select.addEventListener(
      'change',
      byUser(async () => {
        pageCvId = select.value;
        await undoAll({ quiet: true });
        await fill();
      }),
    );
    row.appendChild(select);
    return row;
  }

  /**
   * Under a fill the user asked for: the one click that makes this site fill on its own next
   * time. On a supported job board, or once the user allowed every site for the button, it is
   * done here; on any other site the browser has to be asked first, which only the extension's
   * menu can do, so the line says where.
   */
  function alwaysLine() {
    const line = h('div', 'margin-top:8px;color:#71717a', t('panel_always_offer'), ' ');
    const on = document.createElement('button');
    on.textContent = t('panel_always_on');
    on.style.cssText = 'border:0;background:none;padding:0;color:#7c5cff;font:inherit;cursor:pointer';
    on.addEventListener(
      'click',
      byUser(async () => {
        const res = await send({ type: 'site:auto:on' });
        if (res.ok) siteAuto = true;
        line.replaceChildren(t(res.ok ? 'panel_always_done' : 'panel_always_needs_menu'));
      }),
    );
    line.appendChild(on);
    return line;
  }

  /** Under a fill nobody clicked for: why it happened, and the way to stop it on this site. */
  function autoLine() {
    const line = h('div', 'margin-top:8px;color:#71717a', t('panel_auto_filled'), ' ');
    const off = document.createElement('button');
    off.textContent = t('panel_auto_off');
    off.style.cssText = 'border:0;background:none;padding:0;color:#7c5cff;font:inherit;cursor:pointer';
    off.addEventListener(
      'click',
      byUser(async () => {
        await send({ type: 'site:auto:off' });
        stopAuto();
        line.replaceChildren(t('panel_auto_is_off'));
      }),
    );
    line.appendChild(off);
    return line;
  }

  /**
   * The review surface. A summary panel rather than a chip floating beside each field:
   * anchoring an overlay to a control inside a scrolling ATS form is a well-known way to
   * end up with labels drifting over the page, and the thing the user actually needs is one
   * place that answers "what did you just touch, and can I undo it".
   */
  function banner(kind, filled = [], counts = {}) {
    document.getElementById('epimoni-panel')?.remove();
    ui = null;
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
      // Fill summary, letter, tailored CV and analysis can outgrow a small window.
      'max-height:calc(100vh - 32px)',
      'overflow:auto',
    ].join(';');

    if (kind === 'no-profile') {
      panel.replaceChildren(h('b', null, 'Epimoni'), h('br'), t('panel_no_profile'));
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
      // Re-rendered in place when a re-fill adds to it, so an offer analysis already on screen
      // below it is not thrown away.
      const summary = document.createElement('div');
      const render = (list, c) => {
        const headline =
          list.length === 1 ? t('panel_filled_one') : t('panel_filled_many', [String(list.length)]);
        const line = 'margin-top:8px;color:#3f3f46';
        summary.replaceChildren(
          h('b', null, headline),
          ...(c.ai ? [h('br'), h('span', 'color:#71717a', t('panel_open_questions', [String(c.ai)]))] : []),
          h(
            'ul',
            'margin:8px 0 0;padding-left:18px;color:#3f3f46',
            ...list.map((f) => h('li', null, fieldLabel(f.key, f.index))),
          ),
          ...(c.leftovers || []).map((l) =>
            h('div', line, t('panel_leftover', [String(l.count), t(`cvsection_${l.section}`)])),
          ),
          ...(c.ongoing ? [h('div', line, t('panel_tick_current'))] : []),
          h('div', 'margin-top:10px;color:#71717a', t('panel_review')),
        );
      };
      render(filled, counts);
      if (choices.length > 1) panel.appendChild(picker());
      panel.appendChild(summary);
      const undo = document.createElement('button');
      undo.textContent = t('panel_undo');
      undo.style.cssText =
        'margin-top:10px;border:1px solid #e4e4e7;background:#fafafa;border-radius:8px;padding:5px 10px;cursor:pointer;font:inherit;color:#18181b';
      undo.addEventListener('click', byUser(undoAll));
      panel.appendChild(undo);
      if (counts.auto) panel.appendChild(autoLine());
      else if (!siteAuto) panel.appendChild(alwaysLine());
      if (tracked) panel.appendChild(trackerLine());
      ui = {
        host,
        panel,
        update: (list, fresh, c) => {
          render(list, { ...counts, ...c });
          suggestionSection(panel, fresh, ui.offer);
        },
      };
    }
    if (kind !== 'no-profile') {
      suggestionSection(
        panel,
        lastSuggestions.filter((x) => !x.accepted && !x.dismissed),
      );
      ui.offer = offerSection(panel);
      // The letter goes above the analysis. A box that shows up later, on a wizard's second
      // step, gets its section then.
      ui.letter = () => {
        if (!ui.letterBox) ui.letterBox = letterSection(panel, ui.offer);
      };
      ui.letter();
      if (!ui.tailorBox) ui.tailorBox = tailorSection(panel, ui.offer);
    }

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
  function suggestionSection(panel, list, before = null) {
    if (!list.length) return;

    const box = document.createElement('div');
    box.style.cssText = 'margin-top:10px;padding-top:10px;border-top:1px solid #e4e4e7';
    box.append(h('div', 'color:#71717a;margin-bottom:6px', t('panel_to_check', [String(list.length)])));

    for (const s of list) {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:6px;margin-top:5px';

      const label = document.createElement('span');
      label.style.cssText =
        'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#3f3f46';
      // A file is shown by its name: the value itself is the document.
      const shown = isFile(s.value) ? s.value.name : s.value;
      label.textContent = `${fieldLabel(s.key, s.index)} : ${shown}`;
      label.title = String(shown);
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
          if (isFile(s.value)) attached.add(s.el);
          s.el.style.outline = '2px solid #7c5cff';
          // Joining `lastRun` is what puts it under "tout annuler": an accepted suggestion is
          // a fill, and it must be as undoable as one.
          lastRun.push({
            el: s.el,
            key: s.key,
            index: s.index,
            value: isFile(s.value) ? s.value.name : s.value,
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
          s.dismissed = true;
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
    if (before?.isConnected) panel.insertBefore(box, before);
    else panel.appendChild(box);
  }

  /**
   * The cover letter, from the AI tier: offered when the form has a letter box and the page
   * has an advert, written by the backend on one click, and put in the box on a second one.
   *
   * Never written into the form on its own. It is prose in the user's name, and the rule for
   * the AI tier is the same as for an ambiguous field: it proposes, the user decides. A letter
   * longer than the box accepts is not cut to fit; it is shown with the count, to shorten.
   */
  /**
   * The cover letter for the advert on this page. Offered wherever there is an advert: with a
   * letter box on the form it can be put in it, and without one (a form that wants the letter
   * as a file, or none at all yet) it can be copied or saved as a PDF.
   */
  function letterSection(panel, before) {
    if (!posting) posting = extractPosting(document, location.href);
    if (!posting.ok) return null;
    const box = letterTarget?.el || null;
    const max = letterTarget?.max || null;

    const wrap = document.createElement('div');
    wrap.style.cssText = 'margin-top:12px;padding-top:10px;border-top:1px solid #e4e4e7';
    if (before?.isConnected) panel.insertBefore(wrap, before);
    else panel.appendChild(wrap);
    const button = (text, primary) => {
      const b = document.createElement('button');
      b.textContent = text;
      b.style.cssText = primary
        ? 'margin:8px 6px 0 0;border:1px solid #7c5cff;background:#7c5cff;color:#fff;font-weight:600;border-radius:8px;padding:6px 10px;cursor:pointer;font:inherit'
        : 'margin:8px 6px 0 0;border:1px solid #e4e4e7;background:#fafafa;border-radius:8px;padding:5px 10px;cursor:pointer;font:inherit;color:#18181b';
      return b;
    };
    const line = (text, color = '#3f3f46') => {
      const d = document.createElement('div');
      d.style.color = color;
      d.textContent = text;
      wrap.appendChild(d);
      return d;
    };

    const idle = () => {
      wrap.textContent = '';
      line(t(box ? 'panel_letter_found' : 'panel_letter_offer'));
      if (max) line(t('panel_letter_limit', [String(max)]), '#71717a');
      const go = button(t('panel_letter_cta'), true);
      wrap.appendChild(go);
      if (!pageAi) {
        go.disabled = true;
        go.style.opacity = '0.5';
        go.style.cursor = 'not-allowed';
        needsAccount(wrap);
        return;
      }
      go.addEventListener('click', byUser(write));
      const note = line('', '#71717a');
      note.style.fontSize = '12px';
      send({ type: 'tier' }).then((tier) => {
        if (tier.paid) note.textContent = t('panel_tier_paid');
        else if (tier.rate_limited)
          note.textContent = t('panel_tier_spent', [String(Math.ceil((tier.reset_seconds || 0) / 60))]);
        else note.textContent = t(tier.mode === 'account' ? 'panel_tier_free' : 'panel_tier_anon');
      });
    };

    async function write() {
      wrap.textContent = '';
      line(t('panel_letter_writing'), '#71717a');
      const res = await send({
        type: 'letter',
        posting,
        cv_id: pageCvId,
        max_chars: max,
        host: location.hostname,
        lang: chrome.i18n.getUILanguage().slice(0, 2),
      });
      wrap.textContent = '';
      if (!res.ok) {
        const WHY = {
          quota: () => t('panel_quota', [String(Math.ceil((res.seconds || 0) / 60))]),
          expired: () => t('panel_stale'),
          'no-cv': () => t('panel_no_cv'),
          'too-long': () => t('panel_too_long'),
          network: () => t('panel_offline'),
          empty: () => t('panel_letter_empty'),
        };
        line((WHY[res.kind] || (() => t('panel_analyse_failed')))());
        const retry = button(t('panel_retry'));
        retry.addEventListener('click', byUser(write));
        wrap.appendChild(retry);
        return;
      }
      const fits = !(box && box.maxLength > 0 && res.text.length > box.maxLength);
      line(
        max
          ? t('panel_letter_count_limit', [String(res.chars), String(max)])
          : t('panel_letter_count', [String(res.chars)]),
        fits && res.within !== false ? '#71717a' : '#b45309',
      );
      const preview = document.createElement('div');
      preview.style.cssText =
        'margin-top:6px;max-height:160px;overflow:auto;white-space:pre-wrap;border:1px solid #e4e4e7;border-radius:8px;padding:8px;background:#fafafa;color:#18181b;font-size:12px';
      preview.textContent = res.text;
      wrap.appendChild(preview);
      if (!fits) line(t('panel_letter_too_long'), '#b45309');
      const insert = button(t('panel_letter_insert'), true);
      insert.disabled = !fits;
      if (!box) insert.hidden = true;
      insert.addEventListener(
        'click',
        byUser(async () => {
          if (hasUserValue(box)) return; // the user started writing their own meanwhile
          const { ok } = await writeOne(box, res.text, null);
          if (!ok) return;
          const prev = box.style.outline;
          box.style.outline = '2px solid #7c5cff';
          // Under "tout annuler" like any fill.
          lastRun.push({
            el: box,
            key: 'cover_letter',
            value: res.text,
            via: 'letter',
            outline: prev,
            undo: null,
          });
          report('field_accepted', { key: 'cover_letter' });
          insert.remove();
          line(t('panel_letter_inserted'), '#15803d');
        }),
      );
      const copy = button(t('panel_letter_copy'));
      copy.addEventListener(
        'click',
        byUser(() =>
          navigator.clipboard?.writeText(res.text).then(() => (copy.textContent = t('panel_letter_copied'))),
        ),
      );
      // A PDF made on this computer from the letter and the CV's name and contact: for a form
      // that wants the letter as a file, or for sending it some other way.
      const pdf = button(t('panel_letter_pdf'));
      pdf.addEventListener(
        'click',
        byUser(async () => {
          const file = await send({
            type: 'letter:pdf',
            paragraphs: res.paragraphs || res.text.split(/\n\n+/),
            subject: res.subject || '',
            company: posting.organisation || '',
            cv_id: pageCvId,
          });
          if (!file.data) return;
          const bytes = Uint8Array.from(atob(file.data), (c) => c.charCodeAt(0));
          const a = document.createElement('a');
          a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
          a.download = file.name;
          a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        }),
      );
      wrap.append(insert, copy, pdf);
    }

    idle();
    // The popup's "Rédiger ma lettre": the click there is the user's, so it runs from here.
    if (ui) ui.runLetter = () => (pageAi ? write() : null);
    return wrap;
  }

  /** The field a rewrite changed, in the user's words: "Expérience 2", "Compétences". */
  function changedField(key) {
    const m = /^experience\.(\d+)\./.exec(key);
    if (m) return `${t('cvsection_work')} ${Number(m[1]) + 1}`;
    const names = {
      title: 'field_current_title',
      summary: 'field_summary',
      skills: 'opt_skills',
      languages: 'opt_languages',
      certifications: 'cvsection_certificates',
    };
    return names[key] ? t(names[key]) : key;
  }

  /**
   * "Adapter mon CV à cette offre": the AI rewrites the CV for the advert on this page and the
   * result is a new CV in the library, beside the original, which stays as it was. From here
   * the user can fill this form from it (its PDF goes into the CV upload), download that PDF,
   * or read it over in the dashboard. Spends only on a click.
   */
  function tailorSection(panel, before) {
    if (!posting) posting = extractPosting(document, location.href);
    if (!posting.ok) return null;
    const wrap = document.createElement('div');
    wrap.style.cssText = 'margin-top:12px;padding-top:10px;border-top:1px solid #e4e4e7';
    if (before?.isConnected) panel.insertBefore(wrap, before);
    else panel.appendChild(wrap);
    const button = (text, primary) => {
      const b = document.createElement('button');
      b.textContent = text;
      b.style.cssText = primary
        ? 'margin:8px 6px 0 0;border:1px solid #7c5cff;background:#7c5cff;color:#fff;font-weight:600;border-radius:8px;padding:6px 10px;cursor:pointer;font:inherit'
        : 'margin:8px 6px 0 0;border:1px solid #e4e4e7;background:#fafafa;border-radius:8px;padding:5px 10px;cursor:pointer;font:inherit;color:#18181b';
      return b;
    };
    const line = (text, color = '#3f3f46') => {
      const d = document.createElement('div');
      d.style.color = color;
      d.textContent = text;
      wrap.appendChild(d);
      return d;
    };

    const download = async (id) => {
      const file = await send({ type: 'cv-file', id });
      if (!file.data) return;
      const bytes = Uint8Array.from(atob(file.data), (c) => c.charCodeAt(0));
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      a.download = file.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };

    const idle = () => {
      wrap.textContent = '';
      // Filled from a CV already adapted (to this offer or another): adapting it again would
      // spend a call to rewrite a rewrite. Say so, and keep what is useful.
      const inUse = choices.find((c) => c.id === pageCvId);
      if (inUse?.tailored) {
        line(t('panel_tailor_in_use', [inUse.label || '']), '#15803d');
        const pdf = button(t('panel_tailor_pdf'));
        pdf.addEventListener(
          'click',
          byUser(() => download(inUse.id)),
        );
        const review = button(t('panel_tailor_review'));
        review.addEventListener(
          'click',
          byUser(() => send({ type: 'open-options' })),
        );
        wrap.append(pdf, review);
        return;
      }
      line(t('panel_tailor_offer'));
      const go = button(t('panel_tailor_cta'));
      wrap.appendChild(go);
      if (!pageAi) {
        go.disabled = true;
        go.style.opacity = '0.5';
        go.style.cursor = 'not-allowed';
        needsAccount(wrap);
        return;
      }
      go.addEventListener('click', byUser(run));
    };

    const failed = (res, again) => {
      const WHY = {
        quota: () => t('panel_quota', [String(Math.ceil((res.seconds || 0) / 60))]),
        expired: () => t('panel_stale'),
        'no-cv': () => t('panel_no_cv'),
        'too-long': () => t('panel_too_long'),
        network: () => t('panel_offline'),
        empty: () => t('panel_tailor_empty'),
        'library-full': () => t('panel_tailor_full'),
      };
      line((WHY[res.kind] || (() => t('panel_analyse_failed')))());
      const retry = button(t('panel_retry'));
      retry.addEventListener('click', byUser(again));
      wrap.appendChild(retry);
    };

    async function run() {
      wrap.textContent = '';
      line(t('panel_tailor_working'), '#71717a');
      const res = await send({
        type: 'tailor',
        posting,
        cv_id: pageCvId,
        host: location.hostname,
        lang: chrome.i18n.getUILanguage().slice(0, 2),
      });
      wrap.textContent = '';
      if (!res.ok) return failed(res, run);
      if (res.saved) return done(res.saved);
      review(res.proposals);
    }

    /**
     * Every proposal with a box to tick. A rewrite of what the CV says is ticked; one that
     * adds something the CV did not say (a bullet, a skill, a summary where there was none) is
     * not, and says why: only the user knows whether they did it.
     */
    function review(proposals) {
      wrap.textContent = '';
      line(t('panel_tailor_review_intro', [String(proposals.length)]));
      const boxes = [];
      for (const p of proposals) {
        const row = document.createElement('label');
        row.style.cssText = 'display:flex;gap:7px;align-items:flex-start;margin-top:8px;cursor:pointer';
        const box = document.createElement('input');
        box.type = 'checkbox';
        box.checked = !p.adds;
        box.style.cssText = 'margin:3px 0 0;accent-color:#7c5cff';
        boxes.push([box, p.i]);
        const body = h(
          'div',
          'min-width:0;font-size:12px;color:#3f3f46',
          h('b', null, changedField(p.key)),
          p.adds ? h('div', 'color:#b45309', t('panel_tailor_adds')) : null,
          h(
            'div',
            'white-space:pre-wrap;max-height:84px;overflow:auto;margin-top:2px;padding:4px 6px;background:#fafafa;border:1px solid #e4e4e7;border-radius:6px;color:#18181b',
            p.improved,
          ),
          p.reason ? h('div', 'color:#71717a;margin-top:2px', p.reason) : null,
        );
        row.append(box, body);
        wrap.appendChild(row);
      }
      const make = button(t('panel_tailor_make'), true);
      const note = line('', '#b45309');
      make.addEventListener(
        'click',
        byUser(async () => {
          const accept = boxes.filter(([b]) => b.checked).map(([, i]) => i);
          if (!accept.length) {
            note.textContent = t('panel_tailor_none');
            return;
          }
          make.disabled = true;
          const saved = await send({ type: 'tailor:save', posting, cv_id: pageCvId, accept });
          if (!saved.ok) {
            make.disabled = false;
            note.textContent = t(
              saved.kind === 'library-full' ? 'panel_tailor_full' : 'panel_analyse_failed',
            );
            return;
          }
          done(saved);
        }),
      );
      wrap.insertBefore(make, note);
      // The panel can be long by now (fill, tracker, skills, letter): bring the list up.
      wrap.scrollIntoView({ block: 'nearest' });
    }

    function done(saved) {
      wrap.textContent = '';
      line(t('panel_tailor_done', [saved.label]), '#15803d');
      const use = button(t('panel_tailor_use'), true);
      use.addEventListener(
        'click',
        byUser(async () => {
          pageCvId = saved.cv_id;
          await undoAll({ quiet: true });
          await fill();
        }),
      );
      const pdf = button(t('panel_tailor_pdf'));
      pdf.addEventListener(
        'click',
        byUser(() => download(saved.cv_id)),
      );
      const reviewBtn = button(t('panel_tailor_review'));
      reviewBtn.addEventListener(
        'click',
        byUser(() => send({ type: 'open-options' })),
      );
      wrap.append(use, pdf, reviewBtn);
      wrap.scrollIntoView({ block: 'nearest' });
    }

    idle();
    // The popup's "Adapter mon CV": the click there is the user's, so it runs from here.
    if (ui) ui.runTailor = () => (pageAi ? run() : null);
    return wrap;
  }

  /**
   * "Vos compétences citées dans l'annonce": the free half of reading an advert. A plain match
   * of the CV's skills against the advert's text, on this machine, with a button that marks
   * them in the page. What it cannot say (what the advert asks for that the CV lacks, and how
   * much that matters) is the paid analysis just below it.
   */
  function skillSection(panel) {
    const terms = skillTerms(pageEntries);
    if (!terms.length) return;
    const { found } = mentions(terms, posting.text);
    const box = document.createElement('div');
    box.style.cssText = 'margin-top:12px;padding-top:10px;border-top:1px solid #e4e4e7;color:#3f3f46';
    const head = document.createElement('div');
    head.textContent = found.length
      ? t('panel_skills_found', [String(found.length), String(terms.length)])
      : t('panel_skills_none');
    box.appendChild(head);
    if (found.length) {
      const list = document.createElement('div');
      list.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;margin-top:6px';
      for (const term of found) {
        const chip = document.createElement('span');
        chip.textContent = term;
        chip.style.cssText =
          'border-radius:999px;padding:1px 8px;background:#efebff;color:#4c1d95;font-size:12px;white-space:nowrap';
        list.appendChild(chip);
      }
      box.appendChild(list);
      const toggle = document.createElement('button');
      const label = () => t(highlighted ? 'panel_skills_unmark' : 'panel_skills_mark');
      toggle.textContent = label();
      toggle.style.cssText =
        'margin-top:7px;border:0;background:none;padding:0;cursor:pointer;font:inherit;color:#7c5cff;font-weight:600';
      toggle.addEventListener(
        'click',
        byUser(() => {
          highlighted = !highlighted;
          const marked = highlightTerms(highlighted ? found : []);
          if (highlighted && !marked) highlighted = false; // nothing drawable: say so by not toggling
          toggle.textContent = label();
        }),
      );
      box.appendChild(toggle);
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
   * It no longer requires an account. A free or anonymous caller gets two analyses an hour,
   * the website's own window, and a paying customer is not metered at all. The cost is named *before* the button, not discovered as a refusal afterwards.
   */
  function offerSection(panel) {
    if (!posting) posting = extractPosting(document, location.href);
    if (!posting.ok) return null; // not a posting page, or a wall, so say nothing rather than guess
    skillSection(panel);

    const box = document.createElement('div');
    box.style.cssText = 'margin-top:12px;padding-top:10px;border-top:1px solid #e4e4e7';
    panel.appendChild(box);

    // Replaces what the section says; the nodes are built with `h`, never parsed.
    const say = (...nodes) => box.replaceChildren(...nodes.filter(Boolean));
    // The plans on the site's home page, in the user's language: /#pricing, /en/#pricing…
    const lang = chrome.i18n.getUILanguage().slice(0, 2);
    const plans = `https://www.epimoni30.com/${['en', 'es', 'pt'].includes(lang) ? `${lang}/` : ''}#pricing`;
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
      say(h('div', 'color:#3f3f46;margin-bottom:8px', t('panel_offer_found')));
      const go = document.createElement('button');
      go.textContent = t('panel_analyse_cta');
      go.style.cssText =
        'border:1px solid #7c5cff;background:#7c5cff;color:#fff;font-weight:600;border-radius:8px;padding:6px 10px;cursor:pointer;font:inherit';
      box.appendChild(go);
      if (!pageAi) {
        go.disabled = true;
        go.style.opacity = '0.5';
        go.style.cursor = 'not-allowed';
        needsAccount(box);
        return;
      }
      go.addEventListener('click', byUser(run));

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
      say(h('div', 'color:#71717a', t('panel_analysing')));
      const res = await send({
        type: 'analyse',
        cv_id: pageCvId,
        posting,
        host: location.hostname,
        lang: chrome.i18n.getUILanguage().slice(0, 2),
      });

      if (res.ok) {
        const { score, weakest } = res.teaser || {};
        const gaps = (weakest || []).map((w) =>
          h('li', null, `${t(`section_${w.name}`)}: ${money(w.score)}`),
        );
        say(
          score === null || score === undefined
            ? null
            : h('div', 'font-size:15px;font-weight:700', t('panel_match', [money(score)])),
          ...(gaps.length
            ? [
                h('div', 'color:#71717a;margin-top:6px', t('panel_weakest')),
                h('ul', 'margin:4px 0 0;padding-left:18px;color:#3f3f46', ...gaps),
              ]
            : []),
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
      say(h('div', 'color:#3f3f46', (WHY[res.kind] || (() => t('panel_analyse_failed')))()));
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
    // The popup's "Analyser l'offre": the click there is the user's, so it runs from here.
    if (ui) ui.runAnalyse = () => (pageAi ? run() : null);
    return box;
  }

  /**
   * A line in the panel when the popup asked for something this page cannot give: no advert
   * to analyse, no letter box to write for.
   */
  function panelNote(key) {
    if (!ui?.panel) return;
    const d = document.createElement('div');
    d.style.cssText = 'margin-top:10px;padding-top:10px;border-top:1px solid #e4e4e7;color:#b45309';
    d.textContent = t(key);
    ui.panel.appendChild(d);
  }

  // `after` is the popup's AI action, run after the fill that finds the advert and the letter
  // box: the user's click in the popup is the request, the way a click in the panel is.
  chrome.runtime.onMessage.addListener((msg, _s, respond) => {
    if (msg?.type === 'fill') {
      fill().then(() => {
        if (msg.after === 'analyse') (ui?.runAnalyse || (() => panelNote('panel_no_advert')))();
        else if (msg.after === 'letter') (ui?.runLetter || (() => panelNote('panel_no_letter_box')))();
        else if (msg.after === 'tailor') (ui?.runTailor || (() => panelNote('panel_no_advert')))();
      });
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

  /**
   * Unless the user turned automatic filling on for this site, from the popup. Then an
   * application form is filled as it appears: on load, or when a single-page site renders it
   * after "Postuler", or at a new address. Once per address, so "tout annuler" is final for
   * that page, and never over a fill the user already clicked for. The form growing after
   * that is the re-fill's business (`watch`), as after a click.
   */
  let autoObserver = null;
  let autoTimer = null;
  let autoDoneFor = null;
  const AUTO_MS = 30 * 60 * 1000;
  function stopAuto() {
    autoObserver?.disconnect();
    autoObserver = null;
    clearTimeout(autoTimer);
  }
  function autoCheck() {
    if (autoDoneFor === location.href) return;
    if (fillableElements(document).length < 3) return;
    autoDoneFor = location.href;
    if (filledFor === location.href) return;
    fill({ auto: true });
  }
  send({ type: 'site:auto' }).then(({ auto }) => {
    if (!auto) return;
    autoCheck();
    let pending = null;
    autoObserver = new MutationObserver(() => {
      clearTimeout(pending);
      pending = setTimeout(autoCheck, 500);
    });
    autoObserver.observe(document.documentElement, { childList: true, subtree: true });
    autoTimer = setTimeout(stopAuto, AUTO_MS);
  });
})();

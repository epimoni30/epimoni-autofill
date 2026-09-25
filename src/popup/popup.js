// The popup answers three questions: can it fill this page, where did its CV come from, and
// what does the AI half cost me right now. It never shows the token.
//
// Editing lives on the options page rather than here. The six extras used to be in this
// 300 px panel beside the CV that has none of them, which meant two surfaces owning halves
// of one profile; they now sit in the same form as the CV they complete.
//
// Every string goes through `chrome.i18n`.

const send = (msg) => new Promise((r) => chrome.runtime.sendMessage(msg, (x) => r(x || {})));
const el = (id) => document.getElementById(id);
const t = (key, subs) => chrome.i18n.getMessage(key, subs) || key;
const SITE = 'https://www.epimoni30.com/extension-chrome';
// The plans on the site's home page, in the user's language: /#pricing, /en/#pricing…
const LANG = chrome.i18n.getUILanguage().slice(0, 2);
const PLANS = `https://www.epimoni30.com/${['en', 'es'].includes(LANG) ? `${LANG}/` : ''}#pricing`;

/** Fill in everything the markup named, and set the document language for a screen reader. */
function localise() {
  document.documentElement.lang = chrome.i18n.getUILanguage().slice(0, 2);
  for (const node of document.querySelectorAll('[data-i18n]')) {
    node.textContent = t(node.dataset.i18n);
  }
}

/** How long ago the CV was taken, in words rather than a date. */
const ago = (ts) => {
  if (!ts) return '';
  const days = Math.round((Date.now() - ts) / 86400000);
  if (days <= 0) return t('popup_today');
  if (days === 1) return t('popup_yesterday');
  return t('popup_days_ago', [String(days)]);
};

/** Text, never innerHTML: a CV label is user data and has no business being parsed as markup. */
function line(parent, text, className) {
  const div = document.createElement('div');
  if (className) div.className = className;
  div.textContent = text;
  parent.appendChild(div);
}

function link(parent, href, text) {
  const a = document.createElement('a');
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener';
  a.textContent = text;
  a.style.display = 'block';
  parent.appendChild(a);
  return a;
}

/** A button that opens the CV editor. It is an extension page, so it needs the worker. */
function editorButton(parent, key, primary) {
  const b = document.createElement('button');
  if (primary) b.className = 'primary';
  b.textContent = t(key);
  b.addEventListener('click', async () => {
    await send({ type: 'open-options' });
    window.close();
  });
  parent.appendChild(b);
  return b;
}

(async () => {
  localise();
  const state = await send({ type: 'state' });
  const status = el('status');
  status.textContent = '';

  // No CV from anywhere: from an account, from the site, or typed here. This is the only
  // state in which the extension cannot do its job, and it is one click from being fixed:
  // which is why it offers the editor rather than only naming the account it lacks.
  if (!state.has_cv) {
    line(status, t('popup_no_profile'));
    editorButton(el('actions'), 'popup_add_cv', true);
    link(el('links'), SITE, t('popup_connect_link'));
    return;
  }

  // An expired 31-day token. Filling still works (the profile is local) and the analysis
  // falls through to the free anonymous tier, so this is a prompt rather than a failure.
  if (state.stale) line(status, t('popup_stale'), 'warn');

  line(status, t('popup_ready_fields', [String(state.fields)]));
  if (state.paired && state.cv_label) line(status, t('popup_cv', [state.cv_label]), 'muted');
  else if (state.cv_source === 'local') line(status, t('popup_cv_local'), 'muted');
  else if (state.cv_source === 'site') line(status, t('popup_cv_site'), 'muted');
  const when = ago(state.taken_at || state.paired_at);
  if (when) line(status, t('popup_synced', [when]), 'muted');
  // Something is stored, but not enough for a comparison against an advert to mean anything.
  if (!state.cv_analysable) line(status, t('popup_thin'), 'warn');

  const fillBtn = document.createElement('button');
  fillBtn.className = 'primary';
  fillBtn.textContent = t('popup_fill');
  fillBtn.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    // Inject before messaging: on a site with no declared content script there is nothing
    // listening yet, and this is the click that grants us the page.
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        files: ['content.js'],
      });
    } catch {}
    chrome.tabs.sendMessage(tab.id, { type: 'fill' });
    window.close();
  });
  el('actions').appendChild(fillBtn);
  const edit = editorButton(el('actions'), 'popup_edit_cv', false);
  edit.style.marginLeft = '6px';

  if (state.stale || !state.paired)
    link(el('links'), SITE, t(state.stale ? 'popup_reconnect' : 'popup_connect_link'));

  // The allowance, last and quietly: it is the answer to a question the user has not asked
  // yet, and it reaches the network. Everything above is already on screen by now.
  const tier = await send({ type: 'tier' });
  if (tier.paid) line(el('links'), t('popup_tier_paid'), 'ok');
  else if (tier.rate_limited) {
    line(el('links'), t('popup_tier_spent', [String(Math.ceil((tier.reset_seconds || 0) / 60))]), 'muted');
    link(el('links'), PLANS, t('panel_quota_cta'));
  } else line(el('links'), t(tier.mode === 'account' ? 'popup_tier_free' : 'popup_tier_anon'), 'muted');
})();

// The toolbar popup is a menu, and only that: which CV fills forms, the fast action (fill this
// page), the AI actions (analyse the advert, write the cover letter), and the dashboard.
// Everything else (editing, the library, the applications) lives on the dashboard.
//
// The AI actions are for a paired Epimoni account and are shown disabled without one, with
// the step that turns them on. Every string goes through `chrome.i18n`.

const send = (msg) => new Promise((r) => chrome.runtime.sendMessage(msg, (x) => r(x || {})));
const el = (id) => document.getElementById(id);
const t = (key, subs) => chrome.i18n.getMessage(key, subs) || key;
const SITE = 'https://www.epimoni30.com/extension-chrome';
// The plans on the site's home page, in the user's language: /#pricing, /en/#pricing…
const LANG = chrome.i18n.getUILanguage().slice(0, 2);
const PLANS = `https://www.epimoni30.com/${['en', 'es', 'pt'].includes(LANG) ? `${LANG}/` : ''}#pricing`;

/** Fill in everything the markup named, and set the document language for a screen reader. */
function localise() {
  document.documentElement.lang = chrome.i18n.getUILanguage().slice(0, 2);
  for (const node of document.querySelectorAll('[data-i18n]')) {
    node.textContent = t(node.dataset.i18n);
  }
}

function link(parent, href, text) {
  const a = document.createElement('a');
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener';
  a.textContent = text;
  parent.appendChild(a);
  return a;
}

/**
 * Run something on the page in the active tab: the fill, or the fill followed by one of the
 * AI actions (`after`). Injecting first is what grants the page: on a site with no declared
 * content script, this click is the permission.
 */
async function onPage(after) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      files: ['content.js'],
    });
  } catch {}
  chrome.tabs.sendMessage(tab.id, after ? { type: 'fill', after } : { type: 'fill' });
  window.close();
}

const openDashboard = (hash = '') => {
  chrome.tabs.create({ url: chrome.runtime.getURL(`dashboard.html${hash}`) });
  window.close();
};

/** Which CV fills forms, and the choice between them when there are several. */
async function renderCv(state) {
  const host = el('cv');
  host.textContent = '';
  if (!state.has_cv) {
    host.textContent = t('popup_no_profile');
    return;
  }
  const { cvs = [] } = await send({ type: 'cv:list' });
  if (cvs.length > 1) {
    const select = document.createElement('select');
    select.id = 'cv-pick';
    select.setAttribute('aria-label', t('popup_cv_used'));
    for (const c of cvs) {
      const o = document.createElement('option');
      o.value = c.id;
      o.textContent = c.label || c.summary?.name || t('opt_cv_untitled');
      o.selected = c.active;
      select.appendChild(o);
    }
    select.addEventListener('change', () => send({ type: 'cv:activate', id: select.value }));
    host.append(t('popup_cv_used'), select);
  } else {
    host.textContent = t('popup_cv', [state.cv_label || cvs[0]?.summary?.name || t('opt_cv_untitled')]);
  }
}

/**
 * The AI actions are for a paired Epimoni account. Without one they stay visible and
 * disabled, with the one step that turns them on; with one, the allowance is said beneath.
 */
async function renderAi(state) {
  const note = el('ai-note');
  const ready = Boolean(state.ai) && state.has_cv;
  el('analyse').disabled = !ready;
  el('letter').disabled = !ready;
  if (!state.ai && state.consent) {
    // Paired, and the browser asks before the CV leaves it (Firefox). The request has to come
    // from a click on an extension page that stays open, which the popup is not.
    note.textContent = t('ai_consent_note');
    note.appendChild(document.createElement('br'));
    const b = document.createElement('button');
    b.className = 'linkish';
    b.textContent = t('ai_consent_cta');
    b.addEventListener('click', () => send({ type: 'consent:open' }).then(() => window.close()));
    note.appendChild(b);
    return;
  }
  if (!state.ai) {
    note.textContent = t(state.stale ? 'popup_ai_reconnect' : 'popup_ai_needs_account');
    note.appendChild(document.createElement('br'));
    link(note, SITE, t(state.stale ? 'popup_reconnect' : 'popup_ai_connect')).style.display = 'inline-block';
    return;
  }
  // Asked last and quietly: it reaches the network, and everything above is on screen already.
  const tier = await send({ type: 'tier' });
  if (tier.paid) note.textContent = t('popup_tier_paid');
  else if (tier.rate_limited) {
    note.textContent = t('popup_tier_spent', [String(Math.ceil((tier.reset_seconds || 0) / 60))]);
    note.appendChild(document.createElement('br'));
    link(note, PLANS, t('panel_quota_cta')).style.display = 'inline-block';
  } else note.textContent = t('popup_tier_free');
}

(async () => {
  localise();
  const state = await send({ type: 'state' });

  el('fill').disabled = !state.has_cv;
  el('fill').addEventListener('click', () => onPage(null));
  el('analyse').addEventListener('click', () => onPage('analyse'));
  el('letter').addEventListener('click', () => onPage('letter'));
  el('dashboard').addEventListener('click', () => openDashboard(state.has_cv ? '' : '#cv'));

  await renderCv(state);
  await renderAi(state);
})();

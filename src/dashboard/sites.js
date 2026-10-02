// SPDX-License-Identifier: Apache-2.0
// The dashboard's sites view: where the extension fills on its own, and the way to stop it.
//
// Sites are turned on from the popup, on the site itself, because that is where the browser
// can be asked for the site's permission. Here they are listed and turned off. Part of the
// free core: nothing here reaches a network.

const send = (msg) => new Promise((r) => chrome.runtime.sendMessage(msg, (x) => r(x || {})));
const el = (id) => document.getElementById(id);
const t = (key, subs) => chrome.i18n.getMessage(key, subs) || key;
const lang = chrome.i18n.getUILanguage();
const day = (ts) =>
  new Date(ts).toLocaleDateString(lang, { day: 'numeric', month: 'short', year: 'numeric' });

function row(s) {
  const li = document.createElement('li');
  li.className = 'cv-row';
  const main = document.createElement('div');
  main.className = 'grow';
  const name = document.createElement('b');
  name.textContent = s.host;
  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.textContent = [t('sites_since', [day(s.added_at)]), s.declared ? t('sites_declared') : '']
    .filter(Boolean)
    .join(' · ');
  main.append(name, meta);
  const off = document.createElement('button');
  off.type = 'button';
  off.textContent = t('sites_off');
  off.addEventListener('click', async () => {
    await send({ type: 'site:disable', host: s.host });
    await refreshSites();
  });
  li.append(main, off);
  return li;
}

/**
 * The button on every site. Turning it on asks the browser for all sites, inside this click;
 * turning it off hands that access back. The worker follows the grant either way.
 */
async function renderOffer() {
  const btn = el('offer-toggle');
  const { on } = await send({ type: 'offer:everywhere' });
  btn.textContent = t(on ? 'sites_offer_off' : 'sites_offer_on');
  btn.className = on ? '' : 'primary';
  el('offer-state').textContent = t(on ? 'sites_offer_is_on' : 'sites_offer_is_off');
  btn.onclick = async () => {
    try {
      if (on) await chrome.permissions.remove({ origins: ['https://*/*'] });
      else await chrome.permissions.request({ origins: ['https://*/*'] });
    } catch {}
    // The worker registers or drops the script on the permission event; give it a moment.
    setTimeout(renderOffer, 300);
  };
}

export async function refreshSites() {
  await renderOffer();
  const { sites = [] } = await send({ type: 'sites:list' });
  const list = el('sites-list');
  list.textContent = '';
  for (const s of sites) list.appendChild(row(s));
  el('sites-empty').hidden = sites.length > 0;
}

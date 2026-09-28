// SPDX-License-Identifier: Apache-2.0
// Firefox, desktop and Android: `node build.mjs --target=firefox` → dist-firefox/.
//
// The source code is the same; only the manifest differs, and every difference is here with
// its reason. The `chrome.*` namespace works in Firefox for every API the extension uses
// (storage.local/session, runtime, tabs, scripting, action, i18n), so there is no polyfill.

/**
 * The add-on's id on addons.mozilla.org. Permanent once the first version is signed: the id
 * is what updates, storage and granted permissions hang off.
 */
export const GECKO_ID = 'autofill@epimoni30.com';

export default {
  id: 'firefox',
  dist: 'dist-firefox',

  transform(source) {
    const m = structuredClone(source);

    // Firefox MV3 runs the background as an event page, not a service worker. The worker is
    // already written for being killed and restarted (state in storage, never in scope), so
    // the lifecycle difference costs nothing; the module graph loads the same way.
    m.background = { scripts: ['background.js'], type: 'module' };

    // No `externally_connectable` in Firefox. The site reaches the extension through the
    // bridge content script (`src/epimoni/bridge.js`), which every target declares.
    delete m.externally_connectable;

    // Chrome-only keys. `match_origin_as_fallback` is how Chrome reaches the about:blank and
    // srcdoc frames some boards render their forms in; `match_about_blank` is Firefox's
    // (narrower) equivalent.
    delete m.minimum_chrome_version;
    for (const cs of m.content_scripts || []) {
      if (cs.match_origin_as_fallback) cs.match_about_blank = true;
      delete cs.match_origin_as_fallback;
    }

    m.browser_specific_settings = {
      gecko: {
        id: GECKO_ID,
        // 140 is the first release that reads `data_collection_permissions`, which AMO
        // requires of every new add-on; it is also an ESR.
        strict_min_version: '140.0',
        // What leaves the browser, in Mozilla's categories. The free core sends nothing.
        // The Epimoni add-on sends the CV and the advert when the user asks for an analysis
        // or a letter, and counts-only usage events carrying the page's host. Those are
        // *optional*: src/epimoni/consent.js gates each on a grant, asked inside a click on an
        // extension page (the pairing page's Accept, or allow.html).
        data_collection_permissions: {
          required: ['none'],
          optional: ['personallyIdentifyingInfo', 'websiteContent', 'technicalAndInteraction', 'browsingActivity'],
        },
      },
      gecko_android: { strict_min_version: '142.0' },
    };
    return m;
  },

  /** Rules Firefox enforces at load time, checked at build time instead. */
  validate(m) {
    const problems = [];
    if (m.background?.service_worker) problems.push('Firefox has no background.service_worker');
    if (!m.background?.scripts?.length) problems.push('Firefox needs background.scripts');
    if (m.externally_connectable) problems.push('Firefox does not support externally_connectable');
    if (!m.browser_specific_settings?.gecko?.id) problems.push('Firefox needs browser_specific_settings.gecko.id');
    if (!m.browser_specific_settings?.gecko?.data_collection_permissions)
      problems.push('AMO requires browser_specific_settings.gecko.data_collection_permissions');
    for (const cs of m.content_scripts || [])
      if ('match_origin_as_fallback' in cs) problems.push('match_origin_as_fallback is Chrome-only');
    return problems;
  },
};

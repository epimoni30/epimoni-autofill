// SPDX-License-Identifier: Apache-2.0
// Firefox's data-collection consent, for the one part of the extension that sends anything.
//
// Firefox asks the user, apart from install, before an add-on transmits data, in Mozilla's
// categories (`browser_specific_settings.gecko.data_collection_permissions`, platform/firefox.mjs).
// The free core sends nothing and needs nothing here. The add-on sends the CV and the advert
// when the user asks for an analysis or a letter, and counts-only usage events: both are
// declared *optional*, so both wait for a grant.
//
// A build that declares no optional collection (Chrome's) has nothing to ask, and every
// check here answers yes: the gate is the manifest, not a browser sniff.

/** An analysis or a letter: the CV (it names the person) and the advert's text. */
export const AI_DATA = ['personallyIdentifyingInfo', 'websiteContent'];
/** Usage events: counts and decisions, and the host of the page they are about. */
export const USAGE_DATA = ['technicalAndInteraction', 'browsingActivity'];

const declared = () =>
  chrome.runtime.getManifest().browser_specific_settings?.gecko?.data_collection_permissions?.optional || [];

/** The categories of `wanted` this build must ask for and has not been granted. */
export async function missing(wanted) {
  const asked = wanted.filter((c) => declared().includes(c));
  if (!asked.length) return [];
  try {
    return (await chrome.permissions.contains({ data_collection: asked })) ? [] : asked;
  } catch {
    // An API that cannot answer is not a yes: nothing leaves without a grant.
    return asked;
  }
}

export const consented = async (wanted) => (await missing(wanted)).length === 0;

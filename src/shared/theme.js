// SPDX-License-Identifier: Apache-2.0
// Light by default; dark only when the user turned it on with the dashboard's toggle.
//
// A classic script loaded in <head>, before the body paints: an extension page cannot run an
// inline script (MV3 CSP), and an ES module is deferred, so either would flash the light page
// before going dark. localStorage is synchronous and shared by every page of the extension's
// origin, which is exactly the reach a display preference needs. The worker never reads it.
(() => {
  const KEY = 'epimoni-theme';
  const apply = (value) => {
    if (value === 'dark') document.documentElement.dataset.theme = 'dark';
    else delete document.documentElement.dataset.theme;
  };
  try {
    apply(localStorage.getItem(KEY));
  } catch {
    // Storage blocked: stay light.
  }
  // Another open page (dashboard tab, popup) flipped it: follow without a reload.
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) apply(e.newValue);
  });
})();

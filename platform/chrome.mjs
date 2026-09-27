// SPDX-License-Identifier: Apache-2.0
// Chrome, and Edge, which loads the same package. `manifest.json` is written for Chrome, so this
// target is the identity: it exists so that every target goes through the same seam in
// `build.mjs`, and a new browser is one more file here rather than a branch there.

export default {
  id: 'chrome',
  dist: 'dist',
  transform: (manifest) => manifest,
  validate: () => [],
};

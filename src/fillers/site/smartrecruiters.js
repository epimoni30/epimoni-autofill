// SPDX-License-Identifier: Apache-2.0
// Site filler: SmartRecruiters' one-click application form.
//
// Its fields are web components. The CV upload is an <input type=file> inside a drop zone's
// shadow root, and the text beside it is the drop zone's own ("Choisissez un fichier ou
// déposez-le ici"); the "CV" heading that names it sits outside, past two shadow boundaries,
// where no label rule reaches. The components' own names say what each upload is for, so this
// filler reads them as label evidence, the way the Workday filler reads automation ids. It
// writes nothing and decides nothing: the core weighs the words like any other label.
//
// The same drop zone sits at the top of the form inside the box that reads a CV back into the
// fields; its evidence says so, and the cv_file key refuses "autofill".

// Component → what a control inside it is asking for, in words the language packs know.
const COMPONENTS = [
  ['oc-apply-with-resume', 'autofill from resume'],
  ['oc-resume-upload', 'cv'],
  ['oc-avatar', 'photo'],
];
const SELECTOR = COMPONENTS.map(([tag]) => tag).join(', ');

/** `closest`, continuing from a shadow root to the element that hosts it. */
function closestAcross(el, selector) {
  let node = el;
  while (node) {
    if (node.nodeType === 1 && node.matches(selector)) return node;
    const root = node.getRootNode?.();
    node = node.parentElement || (root && root !== node && root.host) || null;
  }
  return null;
}

export default {
  id: 'smartrecruiters',
  kind: 'site',
  match: {
    hosts: ['jobs.smartrecruiters.com', '*.smartrecruiters.com'],
    // Also served inside a company's own careers page.
    probe: (doc) => Boolean(doc.querySelector('oc-oneclick-form, oc-resume-upload, oc-apply-with-resume')),
  },

  describe(el) {
    const component = closestAcross(el, SELECTOR);
    return component ? COMPONENTS.find(([tag]) => component.localName === tag)[1] : null;
  },
};

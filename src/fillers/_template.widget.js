// SPDX-License-Identifier: Apache-2.0
// A widget filler, empty. Copy it to widget/<id>.js, list it in index.js, and add
// test/fixtures/fillers/<id>/ with a page that reproduces the widget, controlled, the way its
// framework is, and at least one trap. See widget/aria-combobox.js for a complete example.
//
// A widget filler knows one kind of control, on any site: a date picker library, a tag
// input, a design system's dropdown. It never decides which question the control asks (the
// core reads the control's label like any other) nor which answer to give: the core formats
// the value, and `api.pick` matches it against the options by the core's own rule.
//
// The guarded API (`api`, src/content/guard.js) is the only way to act:
//   api.open(target?)       click the control, or something inside it
//   api.choose(option)      click an option inside the control or the popup it declares
//                           (aria-controls / aria-owns)
//   api.type(input, text)   set text in an input inside the widget; never a key press
//   api.setValue / api.clear   the core's native write, for inputs inside the widget
//   api.pick(texts, value)  index of the option `value` selects, or -1
//   api.popups()            the popups the control declares
//   api.waitFor(fn, ms)     poll until fn() is truthy, at most 2 s
// It refuses, quietly, returning false, submit and reset buttons, a <button> with no type
// inside a form (a submit button by default), links, checkboxes, radios, file and password
// inputs, anything outside the control and its popup, and more than six clicks per write.

export default {
  id: 'my-widget',
  kind: 'widget',
  match: {
    // Claim the controls this filler operates. Be precise: a claim you cannot write is a miss.
    widget: (el) => el.matches('[data-my-widget]'),
  },
  // controls(root) { return [...root.querySelectorAll('[data-my-widget]')]; },
  // options(el) { return true; },
  // answered(el) { return false; },
  async write(_el, _value, _api) {
    return false;
  },
};

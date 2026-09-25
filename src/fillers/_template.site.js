// SPDX-License-Identifier: Apache-2.0
// A site filler, empty. Copy it to site/<id>.js, list it in index.js, and add
// test/fixtures/fillers/<id>/ with at least one annotated page and one trap. `npm run check`
// measures it and fails on a single wrong fill.
//
// A site filler knows one job board or ATS. It adds *evidence*; the core still decides every
// field with the same thresholds and disqualifiers as everywhere else. Every hook is optional:
// implement only the ones your site needs, and prefer the smallest: a site whose labels are
// fine needs no filler at all, and one whose ids are telling needs only `describe`.
//
// What a filler may not do is enforced by the build (tools/bundle.mjs, FORBIDDEN): no clicks,
// no submits, no keys, no network, no extension APIs, no markup, no checkboxes. To operate a
// widget, implement `write` and use the `api` it is given (src/content/guard.js).
//
// You may import from '../../content/dom.js' (normalize, deepQueryAll…).

export default {
  id: 'my-site', // the file name, lowercase-dashed
  kind: 'site',
  match: {
    // Hostnames this filler applies to. `*.example.com` covers example.com and its subdomains.
    hosts: [],
    // Optional: recognise the site's markup where it is served on a customer's own domain.
    // Keep it specific: a probe that matches every page applies your evidence everywhere.
    // probe: (doc) => Boolean(doc.querySelector('[data-my-ats-form]')),
    //
    // Optional: claim controls this filler *operates* (a custom widget). The first filler
    // that claims a control writes it; site fillers are asked before widget fillers.
    // widget: (el) => el.matches('.my-ats-dropdown'),
  },

  // Extra controls the native scan cannot see (it finds <input>, <textarea>, <select>).
  // controls(root) { return [...root.querySelectorAll('[data-my-ats-field]')]; },

  // What this control asks, in words: a string or a list of strings, weighed above a `name`
  // attribute and below a visible label. Read the site's stable markup, not its styling.
  // describe(el) { return el.closest('[data-field]')?.getAttribute('data-field'); },

  // Which entry of which CV section the control belongs to: { section, index } with a
  // section from src/schema/fields.js and index from 0. Checked against the page's own ids
  // and structure; a disagreement makes the block suggest-only, never a fill.
  // hint(el) { return null; },

  // For a control this filler claims: its answers (an array of labels), or `true` if they
  // only exist once it is opened. Makes it a closed list, matched like a <select>.
  // options(el) { return null; },

  // For a control this filler claims: has the user already answered it?
  // answered(el) { return false; },

  // For a control this filler claims: write `value`, only through `api`. Return true or
  // { ok: true, undo } where undo() reverts it, also through `api`.
  // async write(el, value, api) { return false; },
};

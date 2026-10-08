// DOM layer: finding fillable controls, describing them, and writing to them.
//
// Everything here exists because a job application form is rarely plain HTML. The three
// recurring realities: the form is often inside an iframe (Greenhouse/Lever/Workable
// embeds), its controls are often inside shadow roots (Teamtailor-style components), and
// its inputs are usually React-controlled, which means `el.value = x` is silently
// discarded.

import { MONTHS } from '../lexicon/index.js';

/**
 * Lowercase, strip diacritics, reduce to words. `Prénom` and `PRENOM_1` both become `prenom 1`.
 * `ł` has no decomposition, so NFD leaves it whole: without its own rule "Wykształcenie"
 * would split into "wykszt alcenie".
 */
export function normalize(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/ł/g, 'l')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Walk the composed tree, entering every open shadow root. */
export function deepQueryAll(root, selector) {
  const out = [];
  const visit = (node) => {
    if (!node) return;
    if (node.querySelectorAll) out.push(...node.querySelectorAll(selector));
    const walker = node.querySelectorAll ? node.querySelectorAll('*') : [];
    for (const el of walker) if (el.shadowRoot) visit(el.shadowRoot);
  };
  visit(root);
  return out;
}

const CONTROL = 'input, textarea, select';
const SKIP_TYPES = new Set([
  'hidden',
  'submit',
  'button',
  'reset',
  'image',
  'file',
  'password',
  'checkbox',
  'radio',
  'range',
  'color',
]);

function visible(el) {
  const style = el.ownerDocument.defaultView?.getComputedStyle(el);
  if (style && (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0))
    return false;
  const r = el.getBoundingClientRect();
  return r.width > 1 && r.height > 1;
}

/**
 * A text control the user could not see, however its own style reads.
 *
 * `visible` looks at the control alone. That is enough for honest pages, and not enough for a
 * page that wants the CV: an input labelled "Adresse" inside an `opacity:0` wrapper, parked at
 * `left:-9999px`, or clipped to nothing is filled by a toolbar click and read back by the page's
 * own script, with the user never having seen the question. So text controls (the ones a CV
 * value lands in) must also be rendered by their ancestors, sit inside the document, and not
 * be clipped away. Radios are not held to this: custom radio groups routinely hide the native
 * input behind a styled label, and they carry an option, not a CV value.
 */
function concealed(el) {
  if (
    typeof el.checkVisibility === 'function' &&
    !el.checkVisibility({ opacityProperty: true, visibilityProperty: true, contentVisibilityAuto: true })
  )
    return true;
  const view = el.ownerDocument.defaultView;
  const r = el.getBoundingClientRect();
  if (view && (r.right + view.scrollX <= 0 || r.bottom + view.scrollY <= 0)) return true;
  const style = view?.getComputedStyle(el);
  if (
    style &&
    (/^rect\(0(px)?,? 0(px)?,? 0(px)?,? 0(px)?\)$/.test(style.clip) || /inset\(50%/.test(style.clipPath))
  )
    return true;
  return false;
}

/**
 * Controls we refuse to touch, whatever any label says.
 *
 * A password or payment field is never part of a job application, so a match on one is
 * by definition a bug in the resolver, and the cost of that bug is high enough that it
 * is blocked structurally rather than left to the scorer. The whole-form check is the
 * important half: a login box sitting on a career page has a perfectly ordinary
 * `email` field next to its password, and filling it is how an extension ends up
 * typing a user's address into someone else's sign-in form.
 */
export function isDenied(el, passwordForms) {
  const type = (el.getAttribute('type') || '').toLowerCase();
  if (type === 'password') return true;
  const ac = normalize(el.getAttribute('autocomplete'));
  if (ac.startsWith('cc ') || ac === 'new password' || ac === 'current password' || ac === 'one time code')
    return true;
  const form = el.form || el.closest('form');
  if (!form) return false;
  // `passwordForms` is computed once per scan. Without it this walked the whole form subtree
  // for every control in it, which is quadratic on the long multi-section forms that ATS
  // pages are made of.
  if (passwordForms) return passwordForms.has(form);
  return deepQueryAll(form, 'input[type="password"]').length > 0;
}

/** Forms containing a password field, computed once per scan for `isDenied`. */
function formsWithPassword(root) {
  const forms = new Set();
  for (const pw of deepQueryAll(root, 'input[type="password"]')) {
    const form = pw.form || pw.closest('form');
    if (form) forms.add(form);
  }
  return forms;
}

/**
 * Every control on the page we could write to: the native ones in document order, then the
 * `extra` ones fillers found (a `role="combobox"` div, a custom dropdown).
 *
 * Extras go through the same refusals as native controls, disabled, hidden, a password or
 * payment field, anything in a form that holds a password, plus one more: a filler cannot
 * hand back an input that is a checkbox, a radio or a file picker. The rules that keep the
 * extension safe apply before any filler sees a control, not after.
 */
export function fillableElements(root = document, extra = []) {
  const passwordForms = formsWithPassword(root);
  const allowed = (el) => {
    if (el.disabled || el.readOnly || el.getAttribute('aria-disabled') === 'true') return false;
    if (el.tagName === 'INPUT' && SKIP_TYPES.has((el.getAttribute('type') || 'text').toLowerCase()))
      return false;
    if (!visible(el) || concealed(el)) return false;
    if (isDenied(el, passwordForms)) return false;
    return true;
  };
  const native = deepQueryAll(root, CONTROL).filter(allowed);
  const seen = new Set(native);
  const more = [];
  for (const el of extra) {
    if (el?.nodeType !== 1 || seen.has(el)) continue;
    seen.add(el);
    if (allowed(el)) more.push(el);
  }
  return [...native, ...more];
}

/** Does a file input's `accept` let a PDF in? No `accept` at all means anything goes. */
function acceptsPdf(el) {
  const accept = (el.getAttribute('accept') || '').toLowerCase().trim();
  if (!accept) return true;
  return accept
    .split(',')
    .map((a) => a.trim())
    .some(
      (a) => a === '.pdf' || a === 'application/pdf' || a === 'application/*' || a === '*/*' || a === '*',
    );
}

const seenBy = (node) => node && visible(node) && !concealed(node);

/**
 * What the user sees of a file input, or null when they see nothing.
 *
 * Almost no upload is a bare `<input type=file>`: the input is hidden and a styled label or a
 * drop zone stands in for it. So the input's own visibility decides nothing here; what must be
 * visible is the thing the user would click: its `<label>`, or the nearest ancestor (three
 * hops at most) that holds this one file input and nothing else to upload. That keeps the rule
 * the text path follows for the same reason: a CV is never handed to a control the user could
 * not have seen asking for it.
 */
function fileSurface(el) {
  if (seenBy(el)) return el;
  const root = el.getRootNode();
  const byFor = el.id && root.querySelector ? root.querySelector(`label[for="${CSS.escape(el.id)}"]`) : null;
  if (seenBy(byFor)) return byFor;
  if (seenBy(el.closest('label'))) return el.closest('label');
  let node = el.parentElement;
  for (let hops = 0; node && hops < 3; hops += 1, node = node.parentElement) {
    if (node.querySelectorAll('input[type="file" i]').length !== 1) return null;
    if (seenBy(node)) return node;
  }
  return null;
}

/**
 * File inputs a CV could go into, kept apart from `fillableElements`.
 *
 * A file input never joins the text scan: it would change the shape of the repeated-section
 * blocks around it, and it takes one key only (`cv_file`, the registry's `file` shape). The
 * refusals are the text path's, minus the input's own visibility (see `fileSurface`), plus
 * one: an `accept` that rules out a PDF.
 */
export function fileInputs(root = document) {
  const passwordForms = formsWithPassword(root);
  return deepQueryAll(root, 'input[type="file" i]').filter((el) => {
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') return false;
    if (isDenied(el, passwordForms)) return false;
    return acceptsPdf(el) && Boolean(fileSurface(el));
  });
}

function labelledByText(el) {
  const ids = (el.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean);
  const doc = el.ownerDocument;
  return ids.map((id) => doc.getElementById(id)?.textContent || '').join(' ');
}

function forLabelText(el) {
  const doc = el.ownerDocument;
  const root = el.getRootNode();
  let text = '';
  if (el.id) {
    // getElementById does not cross into a shadow root, so ask the element's own root too.
    const byFor =
      (root.querySelector ? root.querySelector(`label[for="${CSS.escape(el.id)}"]`) : null) ||
      doc.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    if (byFor) text += ` ${byFor.textContent}`;
  }
  const wrapping = el.closest('label');
  if (wrapping) text += ` ${wrapping.textContent}`;
  return text;
}

/**
 * Text around the control, for forms that label by position only, which is most French
 * job boards.
 *
 * Returns a precision flag as well as the text, because the two cases are not the same
 * signal. A wrapper holding exactly one control and one short run of text *is* a label,
 * tag name aside, and deserves a label's trust: French boards mark up rows as
 * `<div><span>Poste actuel</span><input></div>` all day. A wrapper holding several
 * controls, or a paragraph of prose, is a genuine guess and must stay cheap: that is
 * where reading further up sweeps in the previous question and produces a confident
 * wrong match instead of an honest miss.
 *
 * Bounded to three hops for the same reason.
 */
function nearbyText(el) {
  let node = el,
    hops = 0,
    best = '',
    precise = false;
  while (node && hops < 3) {
    const parent = node.parentElement;
    if (!parent) break;
    const own = Array.from(parent.childNodes)
      .filter(
        (n) =>
          n.nodeType === Node.TEXT_NODE ||
          (n.nodeType === Node.ELEMENT_NODE && !n.matches?.(CONTROL) && !n.querySelector?.(CONTROL)),
      )
      .map((n) => n.textContent || '')
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (own.length > best.length) {
      best = own;
      const controls = parent.querySelectorAll(CONTROL).length;
      precise = controls === 1 && own.length > 1 && own.length <= 80;
    }
    if (best.length > 3) break;
    node = parent;
    hops += 1;
  }
  return { text: best.slice(0, 160), precise };
}

/** How much a filler's description of a control is trusted: above a `name`, below a label. */
export const FILLER_WEIGHT = 0.85;

/**
 * Everything we know about what a control is asking for, each piece carrying how much
 * it should be trusted. An explicit label is near-certain; text scraped from around the
 * control is a hint.
 *
 * `extra` is what fillers said about it: `sources` (text, tagged with the filler's id) and
 * `options` (the answers a custom dropdown offers, which makes it a closed list exactly like
 * a `<select>`: the same shape rules and the same option matching apply).
 */
export function labelBundle(el, extra = {}) {
  const near = nearbyText(el);
  const sources = [
    ['label', forLabelText(el), 0.95],
    ['aria-label', el.getAttribute('aria-label'), 0.95],
    ['aria-labelledby', labelledByText(el), 0.95],
    ['placeholder', el.getAttribute('placeholder'), 0.8],
    ['name', el.getAttribute('name'), 0.75],
    ['title', el.getAttribute('title'), 0.7],
    ['id', el.getAttribute('id'), 0.7],
    ['legend', el.closest('fieldset')?.querySelector('legend')?.textContent, 0.65],
    ['nearby', near.text, near.precise ? 0.9 : 0.6],
  ];
  for (const x of extra.sources || []) sources.push([x.kind, x.text, FILLER_WEIGHT]);
  const described = sources
    .map(([kind, raw, weight]) => ({ kind, text: normalize(raw), weight }))
    .filter((s) => s.text.length > 1);
  // `true` is a closed list whose answers are not on the page until it is opened: shaped as a
  // dropdown for the resolver, matched by the filler at write time with the same rule.
  const closed = extra.options === true;
  const options = Array.isArray(extra.options) ? extra.options.map(String) : null;
  return {
    autocomplete: normalize(el.getAttribute('autocomplete')).replace(/ /g, '-'),
    type: (
      el.getAttribute('type') ||
      (el.tagName === 'TEXTAREA'
        ? 'textarea'
        : el.tagName === 'SELECT' || options || closed
          ? 'select'
          : 'text')
    ).toLowerCase(),
    tag: options || closed ? 'select' : el.tagName.toLowerCase(),
    maxLength: el.maxLength > 0 ? el.maxLength : null,
    part: datePart(el, described, options),
    sources: described,
    ...(options ? { options } : {}),
  };
}

/** A closed list's answers as `{text, value}`: a filler's options, or a `<select>`'s own. */
function optionList(el, bundle) {
  if (bundle.options) return bundle.options.map((t) => ({ text: t, value: t }));
  if (el.tagName === 'SELECT')
    return Array.from(el.options).map((o) => ({ text: o.textContent, value: o.value }));
  return null;
}

/**
 * The option a value picks, or null. Exact first (on the label or the value), then a prefix
 * of at least three characters: the same rule `setValue` has always used on a `<select>`, so a
 * custom dropdown answers exactly what a native one would.
 */
export function matchOption(list, value) {
  const want = normalize(value);
  if (!want) return null;
  return (
    list.find((o) => normalize(o.text) === want || normalize(o.value) === want) ||
    list.find((o) => want.length > 2 && normalize(o.text).startsWith(want)) ||
    null
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Dates: which half of a date a control asks for, and how to write one into it.

// Month-name prefixes come from the language packs (`dates.months`): `fev` matches
// "févr." and "février", `feb` "February" and "febrero". Longest prefix first, so a pack
// adding "juin" beside "jun" cannot be shadowed by the shorter one.
const MONTH_PREFIXES = Object.entries(MONTHS).sort((a, b) => b[0].length - a[0].length);

/** A normalised option label → its month number, or null. */
export function monthOf(text) {
  const t = normalize(text);
  if (!t) return null;
  const hit = MONTH_PREFIXES.find(([p]) => t.startsWith(p));
  return hit ? hit[1] : null;
}

/**
 * Does this control hold only the month, or only the year, of a date?
 *
 * A start date split over two dropdowns is two controls with one label, and both resolve to
 * the same key. Telling them apart is what lets both be filled, and what keeps a year from
 * being written into the month list. A select says so through its options; a text input
 * through its label, and only when the label names one half and not the other.
 */
function datePart(el, sources, options = null) {
  if (options || el.tagName === 'SELECT') {
    const opts = (options || Array.from(el.options).map((o) => o.textContent)).map(normalize).filter(Boolean);
    const years = opts.filter((t) => /^(19|20)[0-9]{2}$/.test(t)).length;
    if (years >= 3 && years >= opts.length - 2) return 'year';
    const months = opts.filter((t) => monthOf(t) !== null || /^(0?[1-9]|1[0-2])$/.test(t)).length;
    if (months >= 12 && opts.length <= 14) return 'month';
    return null;
  }
  const words = ` ${sources.map((x) => x.text).join(' ')} `;
  const month = / (mois|month|mes|mm) /.test(words);
  const year = / (annee|year|ano|aaaa|yyyy) /.test(words);
  if (month && !year) return 'month';
  if (year && !month) return 'year';
  return null;
}

/**
 * A value from the CV → what this particular control should receive.
 *
 * Returns `{value}` to fill, `{suggest}` to offer without writing, `{ongoing: true}` for the
 * end of a role still in progress, or null when the control cannot take what we have.
 *
 * Dates are the reason this exists. The rule is the one the JSON Résumé export follows: never
 * invent precision. A bare "2016" fills a year and leaves a month dropdown alone, and a
 * `type=date` input (which needs a day nobody wrote down) is only ever offered.
 */
export function formatValue(el, bundle, v) {
  if (v === undefined || v === null || v === '') return null;
  const list = optionList(el, bundle);
  if (typeof v !== 'object') {
    // A filler's dropdown is matched here, so the filler only ever has to pick the option it
    // is given. A native `<select>` is matched by `setValue`, as it always was.
    if (bundle.options) {
      const hit = matchOption(list, v);
      return hit ? { value: hit.value } : null;
    }
    return { value: String(v) };
  }
  if (v.ongoing) return { ongoing: true };
  const { y, m, raw } = v;
  const mm = m ? String(m).padStart(2, '0') : null;
  if (list) {
    if (bundle.part === 'year') {
      if (!y) return null;
      const hit = matchOption(list, String(y));
      return hit ? { value: hit.value } : bundle.options ? null : { value: String(y) };
    }
    if (bundle.part === 'month') {
      if (!m) return null;
      const opt = list.find(
        (o) => monthOf(o.text) === m || (/^\s*[0-9]{1,2}\s*$/.test(o.value) && Number(o.value) === m),
      );
      return opt ? { value: opt.value } : null;
    }
    return null;
  }
  const type = (el.getAttribute('type') || '').toLowerCase();
  if (type === 'month') return y && m ? { value: `${y}-${mm}` } : null;
  if (type === 'date') return y && m ? { suggest: `${y}-${mm}-01` } : null;
  if (bundle.part === 'year') return y ? { value: String(y) } : null;
  if (bundle.part === 'month') return mm ? { value: mm } : null;
  const ph = (el.getAttribute('placeholder') || '').trim().toLowerCase();
  let f = ph.match(/^(mm|mois)\s*([/.-])\s*(aaaa|yyyy)$/);
  if (f) return y && m ? { value: `${mm}${f[2]}${y}` } : null;
  f = ph.match(/^(aaaa|yyyy)\s*([/.-])\s*mm$/);
  if (f) return y && m ? { value: `${y}${f[2]}${mm}` } : null;
  if (/^(aaaa|yyyy)$/.test(ph) || (el.maxLength > 0 && el.maxLength <= 4))
    return y ? { value: String(y) } : null;
  // A placeholder asking for a day: we never have one.
  if (/(jj|dd)/.test(ph)) return null;
  return raw ? { value: raw } : null;
}

/**
 * The value a decision stands for: the flat profile for an unscoped key, the right entry of
 * the right section for a scoped one. `entries` comes from `toEntries` in shared/cvdoc.js.
 */
export function valueFor(decision, el, bundle, profile, entries) {
  const { key, index } = decision;
  if (index === undefined || index === null) return formatValue(el, bundle, profile?.[key]);
  const dot = key.indexOf('.');
  const row = entries?.[key.slice(0, dot)]?.[index];
  return formatValue(el, bundle, row?.[key.slice(dot + 1)]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Repeated sections: which entry of which CV section a control belongs to.
//
// A form asks for a career as blocks, one per job, one per degree, and a field's label
// ("Entreprise", "Date de début") says nothing about *which* job. The block does. Two kinds
// of evidence, strongest first:
//
//   1. the form's own attributes: `experiences[1][company]`, `workExperience-2--jobTitle`;
//   2. structure: a heading that names a section, and inside it sibling containers with the
//      same fields, whose order is the entry's index.
//
// Where the two disagree, the block is marked `weak` and the resolver only suggests.

const HEADING = 'h1, h2, h3, h4, h5, h6, legend, [role="heading"]';
// Tokens that follow a section's name in an attribute without being one: the `history` in
// `education_history_1`. Only these let the token *before* them name the section: reading
// back unconditionally would put `work_phone_1` in the work history.
const ATTR_SUFFIX = new Set([
  'history',
  'entry',
  'entries',
  'item',
  'items',
  'list',
  'row',
  'block',
  'group',
  'section',
]);

/** Headings that caption this container: its own, or the one just above it. */
function captionsOf(node) {
  const out = [];
  const aria = node.getAttribute('aria-label');
  if (aria) out.push(aria);
  if (node.getAttribute('aria-labelledby')) out.push(labelledByText(node));
  for (const child of node.children) {
    if (child.matches(HEADING)) {
      out.push(child.textContent);
      break;
    }
    if (child.matches(CONTROL) || child.querySelector(CONTROL)) break;
    const h = child.querySelector(HEADING);
    if (h) {
      out.push(h.textContent);
      break;
    }
  }
  if (!out.length) {
    const prev = node.previousElementSibling;
    if (prev && !prev.matches(CONTROL) && !prev.querySelector(CONTROL)) {
      const h = prev.matches(HEADING) ? prev : prev.querySelector(HEADING);
      if (h) out.push(h.textContent);
    }
  }
  return out.map(normalize).filter(Boolean);
}

const numberIn = (text) => {
  const m = String(text).match(/\b([0-9]{1,2})\b/);
  return m ? Number(m[1]) : null;
};

/** `{section, n}` from the control's `name`/`id`, or null. */
function attrEvidence(el, lex) {
  for (const raw of [el.getAttribute('name'), el.id]) {
    if (!raw) continue;
    // camelCase → words, so `workExperience-2` reads as `work experience 2`.
    const flat = raw.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
    for (const m of flat.matchAll(/([a-z]+)[[\]_.-]{0,3}([0-9]{1,2})(?![0-9])/g)) {
      const before = flat.slice(0, m.index).match(/([a-z]+)[^a-z]*$/)?.[1];
      const section =
        lex.attrSection(m[1]) || (ATTR_SUFFIX.has(m[1]) && before ? lex.attrSection(before) : null);
      if (section) return { section, n: Number(m[2]) };
    }
  }
  return null;
}

/** A control's label with its digits removed, so "Poste 1" and "Poste 2" read alike. */
function signatureLabel(el) {
  const text =
    forLabelText(el) ||
    el.getAttribute('aria-label') ||
    el.getAttribute('placeholder') ||
    nearbyText(el).text;
  return `${el.tagName}:${normalize(text)
    .replace(/[0-9]+/g, '')
    .trim()}`;
}

function structuralBlock(el, lex, ctx) {
  // Up to the outermost ancestor captioned with one section, stopping at a caption that
  // names something else. An unnumbered caption naming no section at all ("Informations
  // personnelles") also stops the climb: this control belongs to that group, whatever
  // the page says further up.
  let node = el.parentElement;
  let root = null;
  let section = null;
  for (let hops = 0; node && hops < 12; hops += 1, node = node.parentElement) {
    const caps = captionsOf(node);
    if (!caps.length) continue;
    const hit = caps.map((c) => lex.sectionOf(c)).find(Boolean);
    if (hit) {
      if (section && hit !== section) break;
      section = hit;
      root = node;
    } else if (!caps.some((c) => /[0-9]/.test(c))) {
      break;
    }
  }
  if (!root) return null;

  // Blocks captioned one by one with no heading above them all: "Expérience 1",
  // "Expérience 2" side by side. The climb stopped at one of them; its siblings are the rest.
  const parent = root.parentElement;
  if (parent) {
    const peers = [...parent.children].filter((c) => captionsOf(c).some((t) => lex.sectionOf(t) === section));
    if (peers.length >= 2 && peers.includes(root)) {
      const index = peers.indexOf(root);
      const n = captionsOf(root)
        .map(numberIn)
        .find((x) => x !== null);
      const weak = (n !== null && n !== undefined && n !== index + 1) || !ctx.sameShape(peers);
      return { section, index, weak, via: 'caption' };
    }
  }

  // Otherwise, descend from the section to the level where it splits into blocks.
  let at = root;
  for (let depth = 0; depth < 10; depth += 1) {
    const kids = [...at.children].filter((k) => ctx.count(k) > 0);
    if (kids.length === 1) {
      at = kids[0];
      continue;
    }
    const multi = kids.filter((k) => ctx.count(k) >= 2);
    if (multi.length >= 2) {
      const same = ctx.sameShape(multi);
      // Siblings with different fields are rows of one block ("Date de début" beside
      // "Date de fin"), not blocks: unless each is big enough to be an entry on its own,
      // in which case they are blocks we cannot vouch for.
      if (same || multi.every((k) => ctx.count(k) >= 3)) {
        const mine = multi.find((k) => k.contains(el));
        // A control beside the blocks rather than in one ("Nombre d'années d'expérience"
        // above the list of jobs) asks about the person, not about an entry: it is a flat
        // question and goes to the unscoped keys like any other.
        if (!mine) return null;
        const index = multi.indexOf(mine);
        const n = captionsOf(mine)
          .map(numberIn)
          .find((x) => x !== null);
        const weak = !same || (n !== null && n !== undefined && n !== index + 1);
        return { section, index, weak, via: 'structure' };
      }
    }
    break;
  }
  // One block. A single control under a section heading is a flat field ("Compétences" as
  // one textarea) and stays with the unscoped keys.
  return ctx.count(root) >= 2 ? { section, index: 0, weak: false, via: 'structure' } : null;
}

/**
 * For every control, the block it belongs to: `{section, index, weak, via}`, or null outside
 * any repeated section. `section: null` means the evidence contradicts itself, and the
 * resolver gives such a control no key at all.
 *
 * `lex` is the resolver, for `sectionOf` and `attrSection`: the vocabulary lives in the
 * lexicon, not here.
 */
export function assignBlocks(els, lex, hints = []) {
  const counts = new Map();
  const count = (node) => {
    if (!counts.has(node)) counts.set(node, els.filter((e) => node.contains(e)).length);
    return counts.get(node);
  };
  const sameShape = (nodes) => {
    const sig = (n) =>
      els
        .filter((e) => n.contains(e))
        .map(signatureLabel)
        .join('|');
    const first = sig(nodes[0]);
    return nodes.every((n) => sig(n) === first);
  };
  const ctx = { count, sameShape };

  const attrs = els.map((el) => attrEvidence(el, lex));
  // A form may number its rows from 1. Decided per section, from the whole page: a lone
  // `experience_1` is the first entry only if no `experience_0` exists.
  const base = new Map();
  for (const a of attrs) if (a) base.set(a.section, Math.min(base.get(a.section) ?? a.n, a.n));

  return els.map((el, i) => {
    // Up to three independent sources: the form's own ids, the page structure, and a filler
    // that knows this site or widget. Any two naming different sections contest the block,
    // which then takes no key at all; any two giving different indexes make it `weak`, which
    // only ever suggests. A filler's hint is evidence like the others, never a verdict.
    const a = attrs[i];
    const found = [];
    if (a) found.push({ section: a.section, index: a.n - (base.get(a.section) === 1 ? 1 : 0), via: 'attr' });
    const h = hints[i];
    if (h?.section && Number.isInteger(h.index) && h.index >= 0)
      found.push({ section: h.section, index: h.index, via: h.via || 'filler' });
    const s = structuralBlock(el, lex, ctx);
    if (!found.length) return s;
    if (s) found.push(s);
    if (new Set(found.map((f) => f.section)).size > 1)
      return { section: null, index: null, weak: true, via: 'conflict' };
    const indexes = new Set(found.map((f) => f.index).filter((x) => x !== null && x !== undefined));
    const [first] = found;
    return {
      section: first.section,
      index: first.index,
      weak: indexes.size > 1 || Boolean(s?.weak),
      via: first.via,
    };
  });
}

/**
 * Radio groups, as one question each.
 *
 * A group of radios sharing a name is a single question with a closed answer list: the same
 * shape as a `<select>`, and handled the same way: if no option matches, nothing is filled.
 * Radios are therefore grouped rather than treated as individual controls, because the
 * question lives on the group (a legend, a line of text) while the individual inputs carry
 * only the answers.
 *
 * **Checkboxes are deliberately absent.** A lone checkbox on an application form is almost
 * always consent, terms, data processing, a mailing list, and ticking consent on somebody's
 * behalf is wrong however confident the matcher is. Under the GDPR consent has to be an
 * affirmative act by the person, so this is a rule, not a gap to be filled in later.
 */
export function radioGroups(root = document) {
  const groups = new Map();
  for (const r of deepQueryAll(root, 'input[type="radio"]')) {
    if (r.disabled || !visible(r)) continue;
    const name = r.getAttribute('name');
    // An unnamed radio cannot be grouped, and guessing a grouping is how the wrong answer
    // gets selected.
    if (!name) continue;
    const form = r.form || r.closest('form') || root;
    const key = `${name}`;
    const existing = groups.get(key);
    if (existing) existing.inputs.push(r);
    else groups.set(key, { name, form, inputs: [r] });
  }
  return [...groups.values()].filter((g) => g.inputs.length >= 2);
}

/** The smallest element containing every input in the group. */
function commonAncestor(inputs) {
  let node = inputs[0].parentElement;
  while (node && !inputs.every((i) => node.contains(i))) node = node.parentElement;
  return node || inputs[0].parentElement;
}

/** An element's own text, ignoring anything that wraps a form control. */
function ownText(el) {
  if (!el) return '';
  return Array.from(el.childNodes)
    .filter(
      (n) =>
        n.nodeType === Node.TEXT_NODE ||
        (n.nodeType === Node.ELEMENT_NODE && !n.matches?.(CONTROL) && !n.querySelector?.(CONTROL)),
    )
    .map((n) => n.textContent || '')
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}

/**
 * Describe a radio group the way `labelBundle` describes a single control.
 *
 * The option labels are deliberately left out of the bundle: they are the answers, and
 * feeding "Oui"/"Non" into the question text is how a group gets matched on its answers.
 */
export function radioGroupBundle(group) {
  const container = commonAncestor(group.inputs);
  const fieldset = group.inputs[0].closest('fieldset');
  const legend = fieldset?.querySelector('legend')?.textContent;
  const own = ownText(container);

  // The hop to the parent only happens when the container says nothing itself, and only when
  // the parent holds no other controls. Reading it unconditionally sweeps in the neighbouring
  // question: on a form with a "recevoir des offres par e-mail" checkbox two fieldsets down,
  // that made an authorisation group look like an email field. The same lesson as `guard` in
  // resolve.js: a hint may suggest, only evidence may forbid.
  const parent = container?.parentElement;
  const parentIsolated = parent && parent.querySelectorAll(CONTROL).length === group.inputs.length && !own;

  const sources = [
    ['legend', legend, 0.95],
    ['aria-label', container?.getAttribute('aria-label'), 0.95],
    ['nearby', own, 0.9],
    ...(parentIsolated ? [['nearby', ownText(parent), 0.85]] : []),
    ['name', group.name, 0.75],
  ];
  return {
    autocomplete: '',
    type: 'radio',
    tag: 'radiogroup',
    maxLength: null,
    sources: sources
      .map(([kind, raw, weight]) => ({ kind, text: normalize(raw), weight }))
      .filter((x) => x.text.length > 1),
  };
}

// Read off the prototypes when this module loads in a page. Guarded so the module can also be
// *imported* where there is no DOM, the build loads the filler list to validate it, and a
// filler imports from here, without anything being written there.
const nativeSetter = (ctor, prop) =>
  typeof globalThis[ctor] === 'function'
    ? Object.getOwnPropertyDescriptor(globalThis[ctor].prototype, prop)?.set
    : undefined;
const CHECKED_SETTER = nativeSetter('HTMLInputElement', 'checked');
const SETTERS = {
  INPUT: nativeSetter('HTMLInputElement', 'value'),
  TEXTAREA: nativeSetter('HTMLTextAreaElement', 'value'),
  SELECT: nativeSetter('HTMLSelectElement', 'value'),
};

/**
 * Write a value the way a keystroke would.
 *
 * React installs its own `value` setter on the element instance, so assigning through it
 * updates the DOM but never the component's state: the field looks filled and submits
 * empty. Going through the prototype's original setter and then dispatching a *bubbling*
 * `input` event is what React's synthetic event system actually listens for.
 *
 * A `<select>` is matched against its options instead: writing a value no option carries
 * would leave the control on its old selection, and a silently unchanged select is a
 * wrong answer we would report as a success.
 */
export function setValue(el, value) {
  if (el.tagName === 'SELECT') {
    const option = matchOption(
      Array.from(el.options).map((o) => ({ text: o.textContent, value: o.value })),
      value,
    );
    if (!option) return false;
    SETTERS.SELECT?.call(el, option.value);
  } else {
    const setter = SETTERS[el.tagName];
    if (!setter) return false;
    setter.call(el, value);
  }
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.setAttribute('data-epimoni-filled', '1');
  return true;
}

/** Is this value a file (a `File`, from any frame's realm) rather than text? */
export const isFile = (v) => Boolean(v) && typeof v === 'object' && typeof v.name === 'string' && 'size' in v;

/**
 * Put a file into a file input, the way choosing it in the picker would.
 *
 * A file input's `files` can only be set from a `FileList`, and the only way to make one is a
 * `DataTransfer`. The events are the picker's: frameworks and drop-zone libraries read the
 * file on `change`. Undoing is `clearValue`: an empty value is the one a file input accepts.
 */
export function setFile(el, file) {
  if (!isFile(file) || (el.getAttribute('type') || '').toLowerCase() !== 'file') return false;
  const dt = new DataTransfer();
  dt.items.add(file);
  el.files = dt.files;
  if (el.files?.length !== 1) return false;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.setAttribute('data-epimoni-filled', '1');
  return true;
}

/** The visible answer a radio stands for: its label, else its aria-label, else its value. */
function radioLabel(r) {
  return normalize(forLabelText(r) || r.getAttribute('aria-label') || r.value);
}

/**
 * Select the option in a radio group that matches a value.
 *
 * Matching is exact first, then prefix, then substring, so a stored "Oui, ressortissant UE"
 * still picks "Oui", and a group with no match is left untouched, which turns a wrong answer
 * into a miss. Goes through the native `checked` setter for the same reason `setValue` goes
 * through the native `value` setter: a framework ignores a write it did not make.
 */
export function setRadio(group, value) {
  const want = normalize(value);
  if (!want) return null;
  const inputs = group.inputs;
  // The stored answer and the option can each be the longer of the two: a user types
  // "Oui, ressortissant UE" against an option "Oui", and types "Oui" against an option
  // "Oui, j'ai un titre de séjour". Both directions are tried, but only on word boundaries:
  // a bare substring test lets the option "Non" win inside "oui, non applicable".
  const firstWord = want.split(' ')[0];
  const hit =
    inputs.find((r) => radioLabel(r) === want) ||
    inputs.find((r) => radioLabel(r) === firstWord) ||
    inputs.find((r) => {
      const label = radioLabel(r);
      return label.length > 1 && (label === want || label.startsWith(`${want} `));
    }) ||
    null;
  if (!hit) return null;
  CHECKED_SETTER?.call(hit, true);
  hit.dispatchEvent(new Event('input', { bubbles: true }));
  hit.dispatchEvent(new Event('change', { bubbles: true }));
  hit.setAttribute('data-epimoni-filled', '1');
  return hit;
}

/** Undo a radio selection, notifying the framework as a real deselection would. */
export function clearRadio(el) {
  CHECKED_SETTER?.call(el, false);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.removeAttribute('data-epimoni-filled');
}

/** Has any option in this group already been answered? Then leave it alone. */
export function radioAnswered(group) {
  return group.inputs.some((r) => r.checked && !r.hasAttribute('data-epimoni-filled'));
}

/**
 * Undo a fill the way a user clearing the field would.
 *
 * Goes through the same native setter and the same bubbling events as `setValue`: a
 * `<select>` reset with `selectedIndex = 0` looks empty while the framework still holds the
 * old value, and the form submits what the framework holds.
 */
export function clearValue(el) {
  if (el.tagName === 'SELECT') {
    const first = el.options[0];
    SETTERS.SELECT?.call(el, first ? first.value : '');
  } else {
    SETTERS[el.tagName]?.call(el, '');
  }
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

/** Has the user (or the site) already put something here? Then leave it alone. */
export function hasUserValue(el) {
  if (el.getAttribute('data-epimoni-filled')) return false;
  if (el.tagName === 'SELECT') return el.selectedIndex > 0 && !!el.value;
  return String(el.value || '').trim().length > 0;
}

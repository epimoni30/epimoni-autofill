// SPDX-License-Identifier: Apache-2.0
// The text of a PDF, read on this computer: what a CV import starts from.
//
// No dependency, like the PDF writer beside it. A full PDF engine is most of a megabyte; reading
// the text layer of a CV needs much less: the objects, their compressed streams (FlateDecode,
// which the browser inflates natively), the object streams that newer writers pack them into,
// each font's ToUnicode map (how Word, Google Docs, Canva and Chrome say which character a
// glyph is), and the handful of content-stream operators that show text and move between lines.
//
// What it does not do, on purpose: OCR (a scanned CV has no text layer, and that is said to the
// user rather than guessed at), encryption, and layout analysis beyond "a new baseline is a new
// line". Two-column CVs come out column by column in whatever order the writer drew them, which
// is good enough for the parser the text goes to next, and the user sees the text before it is
// sent anywhere.
//
// Pure apart from `DecompressionStream`, which every target (Chrome, Firefox, Node 18+) has.

import { openEncrypted } from './pdfcrypt.js';

const WS = new Set([0, 9, 10, 12, 13, 32]);
const DELIM = new Set('()<>[]{}/%'.split('').map((c) => c.charCodeAt(0)));

/** A byte string: one char per byte, so indices are byte offsets. */
function latin1(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return s;
}

/**
 * Tokens of PDF syntax, objects and content streams alike. Strings come back as arrays of byte
 * values; an inline image (BI … ID … EI) is skipped whole, since its data is binary.
 */
function* tokens(src, start = 0, end = src.length) {
  let i = start;
  while (i < end) {
    const c = src.charCodeAt(i);
    if (WS.has(c)) {
      i += 1;
      continue;
    }
    if (c === 37) {
      // % comment
      while (i < end && src[i] !== '\n' && src[i] !== '\r') i += 1;
      continue;
    }
    if (c === 40) {
      // ( literal string )
      const bytes = [];
      let depth = 1;
      i += 1;
      while (i < end && depth > 0) {
        const ch = src[i];
        if (ch === '\\') {
          const n = src[i + 1];
          const esc = { n: 10, r: 13, t: 9, b: 8, f: 12, '(': 40, ')': 41, '\\': 92 }[n];
          if (esc !== undefined) {
            bytes.push(esc);
            i += 2;
          } else if (n >= '0' && n <= '7') {
            let oct = '';
            let k = i + 1;
            while (k < i + 4 && src[k] >= '0' && src[k] <= '7') oct += src[k++];
            bytes.push(Number.parseInt(oct, 8) & 0xff);
            i = k;
          } else if (n === '\r' || n === '\n') {
            i += n === '\r' && src[i + 2] === '\n' ? 3 : 2;
          } else i += 1;
          continue;
        }
        if (ch === '(') depth += 1;
        else if (ch === ')') depth -= 1;
        if (depth > 0) bytes.push(src.charCodeAt(i));
        i += 1;
      }
      yield { t: 'str', v: bytes };
      continue;
    }
    if (c === 60 && src[i + 1] === '<') {
      yield { t: '<<' };
      i += 2;
      continue;
    }
    if (c === 62 && src[i + 1] === '>') {
      yield { t: '>>' };
      i += 2;
      continue;
    }
    if (c === 60) {
      // <hex string>
      const close = src.indexOf('>', i);
      const hex = src.slice(i + 1, close < 0 ? end : close).replace(/[^0-9a-fA-F]/g, '');
      const bytes = [];
      for (let k = 0; k < hex.length; k += 2)
        bytes.push(Number.parseInt(hex.slice(k, k + 2).padEnd(2, '0'), 16));
      yield { t: 'str', v: bytes, hex: true };
      i = close < 0 ? end : close + 1;
      continue;
    }
    if (c === 91 || c === 93 || c === 123 || c === 125) {
      yield { t: src[i] };
      i += 1;
      continue;
    }
    if (c === 47) {
      // /Name, with #xx escapes
      let k = i + 1;
      while (k < end && !WS.has(src.charCodeAt(k)) && !DELIM.has(src.charCodeAt(k))) k += 1;
      yield {
        t: 'name',
        v: src
          .slice(i + 1, k)
          .replace(/#([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(Number.parseInt(h, 16))),
      };
      i = k;
      continue;
    }
    let k = i;
    while (k < end && !WS.has(src.charCodeAt(k)) && !DELIM.has(src.charCodeAt(k))) k += 1;
    if (k === i) {
      i += 1; // a stray delimiter: skip it rather than loop
      continue;
    }
    const word = src.slice(i, k);
    i = k;
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(word)) {
      yield { t: 'num', v: Number(word) };
      continue;
    }
    if (word === 'ID') {
      // Inline image data runs to an EI that stands alone.
      const m = /\sEI(?=[\s]|$)/g;
      m.lastIndex = i;
      const found = m.exec(src);
      i = found ? found.index + 3 : end;
      continue;
    }
    yield { t: 'kw', v: word };
  }
}

/** A token that is a value on its own: a number, a name, a string, a boolean. */
function prim(tok) {
  if (!tok) return null;
  if (tok.t === 'num') return { num: tok.v };
  if (tok.t === 'name') return { name: tok.v };
  if (tok.t === 'str') return { str: tok.v };
  if (tok.t === 'kw' && (tok.v === 'true' || tok.v === 'false')) return tok.v === 'true';
  return null;
}

/** One object's text → its value, refs resolved to `{ref}` in dicts and arrays alike. */
function parseObject(src, start, end) {
  // Rewrite "n g R" to a single token the value parser keeps, then parse.
  const toks = [];
  for (const tk of tokens(src, start, end)) {
    if (
      tk.t === 'kw' &&
      tk.v === 'R' &&
      toks.length >= 2 &&
      toks.at(-1).t === 'num' &&
      toks.at(-2).t === 'num'
    ) {
      toks.pop();
      const n = toks.pop().v;
      toks.push({ t: 'ref', v: n });
    } else toks.push(tk);
  }
  const it = toks[Symbol.iterator]();
  const parse = (first) => {
    const tok = first ?? it.next().value;
    if (tok?.t === 'ref') return { ref: tok.v };
    if (tok?.t === '<<') {
      const dict = {};
      for (;;) {
        const k = it.next().value;
        if (!k || k.t === '>>') return dict;
        if (k.t === 'name') dict[k.v] = parse();
      }
    }
    if (tok?.t === '[') {
      const arr = [];
      for (;;) {
        const n = it.next().value;
        if (!n || n.t === ']') return arr;
        arr.push(parse(n));
      }
    }
    return prim(tok);
  };
  return parse();
}

async function inflate(bytes) {
  const ds = new DecompressionStream('deflate');
  const out = new Response(new Blob([bytes]).stream().pipeThrough(ds)).arrayBuffer();
  return new Uint8Array(await out);
}

const nameOf = (v) => v?.name;
const numOf = (v) => v?.num;

/** Every object written out in the file, by number: `{value, stream, num, gen}`. */
function readObjects(bytes, src) {
  const objects = new Map();
  const re = /(\d+)\s+(\d+)\s+obj\b/g;
  let m = re.exec(src);
  while (m) {
    const num = Number(m[1]);
    const from = m.index + m[0].length;
    const endobj = src.indexOf('endobj', from);
    const stop = endobj < 0 ? src.length : endobj;
    const streamAt = src.indexOf('stream', from);
    let value;
    let stream = null;
    if (streamAt >= 0 && streamAt < stop && src.slice(from, streamAt).includes('>>')) {
      value = parseObject(src, from, streamAt);
      let dataStart = streamAt + 6;
      if (src[dataStart] === '\r') dataStart += 1;
      if (src[dataStart] === '\n') dataStart += 1;
      const len = numOf(value?.Length);
      let dataEnd = len !== undefined ? dataStart + len : -1;
      if (dataEnd < 0 || src.slice(dataEnd, dataEnd + 20).indexOf('endstream') < 0) {
        dataEnd = src.indexOf('endstream', dataStart);
        while (dataEnd > dataStart && (src[dataEnd - 1] === '\n' || src[dataEnd - 1] === '\r')) dataEnd -= 1;
      }
      stream = bytes.subarray(dataStart, Math.max(dataStart, dataEnd));
    } else value = parseObject(src, from, stop);
    objects.set(num, { value, stream, num, gen: Number(m[2]) });
    re.lastIndex = Math.max(stop, from);
    m = re.exec(src);
  }

  return objects;
}

/** The objects newer writers pack into object streams, added beside the others. */
async function unpackObjectStreams(objects, decode) {
  for (const [, o] of [...objects]) {
    if (nameOf(o.value?.Type) !== 'ObjStm' || !o.stream) continue;
    const data = await decode(o);
    if (!data) continue;
    const text = latin1(data);
    const n = numOf(o.value.N) || 0;
    const first = numOf(o.value.First) || 0;
    const head = [...tokens(text, 0, first)].filter((tk) => tk.t === 'num').map((tk) => tk.v);
    for (let k = 0; k < n; k += 1) {
      const num = head[2 * k];
      const at = first + head[2 * k + 1];
      const next = k + 1 < n ? first + head[2 * k + 3] : text.length;
      if (num !== undefined && !objects.has(num))
        objects.set(num, { value: parseObject(text, at, next), stream: null, num, gen: 0 });
    }
  }
}

/**
 * A stream's bytes: decrypted when the file is, then inflated when the writer compressed it.
 * Null for filters we do not read (images, mostly) and for anything that fails to decode.
 */
async function decodeWith(o, crypt) {
  const f = o.value?.Filter;
  const filters = (Array.isArray(f) ? f : f ? [f] : []).map(nameOf);
  let data = o.stream;
  // Cross-reference streams are never encrypted; everything else in an encrypted file is.
  if (crypt && nameOf(o.value?.Type) !== 'XRef') {
    try {
      data = await crypt.stream(data, o.num, o.gen);
    } catch {
      return null;
    }
  }
  for (const name of filters) {
    if (name !== 'FlateDecode' && name !== 'Fl') return null;
    try {
      data = await inflate(data);
    } catch {
      return null;
    }
  }
  return data;
}

/** A font's ToUnicode CMap → {width: bytes per code, map: code → text}. */
function parseCMap(text) {
  const map = new Map();
  let width = 0;
  const hex = (h) => Number.parseInt(h, 16);
  const utf16 = (h) => {
    const units = [];
    for (let k = 0; k + 4 <= h.length; k += 4) units.push(hex(h.slice(k, k + 4)));
    if (h.length === 2) units.push(hex(h));
    return String.fromCharCode(...units);
  };
  for (const [, body] of text.matchAll(/begincodespacerange([\s\S]*?)endcodespacerange/g)) {
    const first = /<([0-9a-fA-F]+)>/.exec(body);
    if (first) width = Math.max(width, first[1].length / 2);
  }
  for (const [, body] of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g))
    for (const [, src, dst] of body.matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]*)>/g)) {
      map.set(hex(src), utf16(dst));
      width = width || src.length / 2;
    }
  for (const [, body] of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const [, lo, hi, rest] of body.matchAll(
      /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(<[0-9a-fA-F]*>|\[[^\]]*\])/g,
    )) {
      const a = hex(lo);
      const b = hex(hi);
      width = width || lo.length / 2;
      if (rest.startsWith('[')) {
        const items = [...rest.matchAll(/<([0-9a-fA-F]*)>/g)].map((x) => x[1]);
        items.forEach((d, k) => {
          map.set(a + k, utf16(d));
        });
      } else {
        const d = rest.slice(1, -1);
        const base = hex(d.slice(-4) || '0');
        const prefix = d.length > 4 ? utf16(d.slice(0, -4)) : '';
        for (let c = a; c <= b && c - a < 65536; c += 1)
          map.set(c, prefix + String.fromCharCode(base + (c - a)));
      }
    }
  }
  return { width: width || 1, map };
}

// WinAnsi bytes 0x80–0x9F, which Latin-1 leaves as control codes.
const WIN = {
  128: '€',
  130: '‚',
  131: 'ƒ',
  132: '„',
  133: '…',
  134: '†',
  135: '‡',
  136: 'ˆ',
  137: '‰',
  138: 'Š',
  139: '‹',
  140: 'Œ',
  142: 'Ž',
  145: '‘',
  146: '’',
  147: '“',
  148: '”',
  149: '•',
  150: '–',
  151: '—',
  152: '˜',
  153: '™',
  154: 'š',
  155: '›',
  156: 'œ',
  158: 'ž',
  159: 'Ÿ',
};

/**
 * The text of a PDF, line by line.
 *
 * Returns `{ text, pages, problem }`. `problem` is `'not-pdf'`, `'encrypted'`, or
 * `'no-text'` (a scan, or fonts with no way back to characters), each worth telling the user
 * in its own words; otherwise null.
 */
export async function pdfText(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (latin1(bytes.subarray(0, 1024)).indexOf('%PDF-') < 0) return { text: '', pages: 0, problem: 'not-pdf' };
  const src = latin1(bytes);
  const objects = readObjects(bytes, src);
  const get = (v) => {
    let x = v;
    for (let k = 0; x?.ref !== undefined && k < 8; k += 1) x = objects.get(x.ref)?.value;
    return x;
  };
  const objOf = (v) => (v?.ref !== undefined ? objects.get(v.ref) : null);

  // The trailer, classic or a cross-reference stream's dictionary: where /Encrypt and /ID are.
  const at = src.lastIndexOf('trailer');
  const trailer =
    (at >= 0
      ? parseObject(src, at + 7, src.indexOf('startxref', at) > 0 ? src.indexOf('startxref', at) : src.length)
      : null) ||
    [...objects.values()].reverse().find((o) => nameOf(o.value?.Type) === 'XRef')?.value ||
    {};
  let crypt = null;
  if (trailer.Encrypt !== undefined) {
    crypt = await openEncrypted(get(trailer.Encrypt), new Uint8Array(trailer.ID?.[0]?.str || []));
    if (!crypt) return { text: '', pages: 0, problem: 'encrypted' };
  }
  const decode = (o) => decodeWith(o, crypt);
  await unpackObjectStreams(objects, decode);

  // Pages in reading order: from the catalog's page tree, resources inherited downwards.
  const pages = [];
  const catalog = [...objects.values()].find((o) => nameOf(o.value?.Type) === 'Catalog')?.value;
  const walk = (node, inherited, depth = 0) => {
    const n = get(node);
    if (!n || depth > 32) return;
    const res = n.Resources !== undefined ? get(n.Resources) : inherited;
    if (nameOf(n.Type) === 'Page' || (n.Contents !== undefined && !n.Kids)) pages.push({ page: n, res });
    else for (const kid of n.Kids || []) walk(kid, res, depth + 1);
  };
  if (catalog?.Pages) walk(catalog.Pages, null);
  if (!pages.length)
    for (const [, o] of [...objects].sort((a, b) => a[0] - b[0]))
      if (nameOf(o.value?.Type) === 'Page') pages.push({ page: o.value, res: get(o.value.Resources) });

  const fontCache = new Map();
  const fontOf = async (res, name) => {
    const ref = get(res?.Font)?.[name];
    const key = ref?.ref ?? `${name}`;
    if (fontCache.has(key)) return fontCache.get(key);
    const font = get(ref) || {};
    let decoder = null;
    const tu = objOf(font.ToUnicode);
    if (tu?.stream) {
      const data = await decode(tu);
      if (data) decoder = parseCMap(latin1(data));
    }
    const composite = nameOf(font.Subtype) === 'Type0';
    // Glyph advances, in thousandths of the font size: where a word ends, so a gap can be told
    // from the next letter.
    const widths = new Map();
    let fallback = 500;
    if (composite) {
      const cid = get(get(font.DescendantFonts)?.[0]) || {};
      fallback = numOf(cid.DW) ?? 1000;
      const W = get(cid.W) || [];
      for (let k = 0; k < W.length; ) {
        const first = numOf(W[k]);
        const next = get(W[k + 1]);
        if (Array.isArray(next)) {
          next.forEach((w, j) => {
            widths.set(first + j, numOf(w));
          });
          k += 2;
        } else {
          const last = numOf(next);
          const w = numOf(W[k + 2]);
          for (let c = first; c <= last && c - first < 65536; c += 1) widths.set(c, w);
          k += 3;
        }
      }
    } else {
      const firstChar = numOf(font.FirstChar) ?? 0;
      (get(font.Widths) || []).forEach((w, j) => {
        widths.set(firstChar + j, numOf(w));
      });
      fallback = numOf(get(font.FontDescriptor)?.MissingWidth) || 500;
    }
    const entry = { decoder, width: decoder?.width || (composite ? 2 : 1), composite, widths, fallback };
    fontCache.set(key, entry);
    return entry;
  };
  /** A shown string → [{text, advance}] per code, advance in thousandths of the font size. */
  const glyphs = (font, bytes) => {
    const out = [];
    const w = font?.width || 1;
    for (let k = 0; k + w <= bytes.length; k += w) {
      let code = 0;
      for (let j = 0; j < w; j += 1) code = code * 256 + bytes[k + j];
      let text = '';
      if (font?.decoder) text = font.decoder.map.get(code) ?? '';
      else if (!font?.composite) text = WIN[code] || String.fromCharCode(code);
      out.push({
        text,
        advance: font?.widths.get(code) ?? font?.fallback ?? 500,
        space: w === 1 && code === 32,
      });
    }
    return out;
  };

  // [a b c d e f] products, the PDF way: row vector times matrix.
  const mul = (m, n) => [
    m[0] * n[0] + m[1] * n[2],
    m[0] * n[1] + m[1] * n[3],
    m[2] * n[0] + m[3] * n[2],
    m[2] * n[1] + m[3] * n[3],
    m[4] * n[0] + m[5] * n[2] + n[4],
    m[4] * n[1] + m[5] * n[3] + n[5],
  ];
  const ID = [1, 0, 0, 1, 0, 0];

  // Every piece of text drawn, in drawing order, where it starts and ends on the page.
  let runs = [];

  const run = async (content, res, ctm0, depth) => {
    if (depth > 4) return;
    const src = latin1(content);
    const stack = [];
    let ctm = ctm0;
    const saved = [];
    let font = null;
    let size = 1;
    let tm = ID;
    let tlm = ID;
    let tc = 0;
    let tw = 0;
    let th = 1;
    let tl = 0;
    let rise = 0;
    const moveLine = (tx, ty) => {
      tlm = mul([1, 0, 0, 1, tx, ty], tlm);
      tm = tlm;
    };
    const showString = (bytes) => {
      const m = mul(tm, ctm);
      const scale = Math.hypot(m[2], m[3]) * size || size;
      const x = m[4];
      const y = m[5] + rise;
      let text = '';
      let adv = 0;
      for (const g of glyphs(font, bytes)) {
        text += g.text;
        adv += ((g.advance / 1000) * size + tc + (g.space ? tw : 0)) * th;
      }
      tm = mul([1, 0, 0, 1, adv, 0], tm);
      const end = mul(tm, ctm);
      if (text) runs.push({ x, y, x2: end[4], size: scale, text });
    };
    for (const tk of tokens(src)) {
      if (tk.t !== 'kw') {
        if (tk.t === '[') stack.push('[');
        else if (tk.t === ']') {
          const at = stack.lastIndexOf('[');
          const arr = stack.splice(at < 0 ? 0 : at);
          arr.shift();
          stack.push({ arr });
        } else stack.push(tk);
        continue;
      }
      const op = tk.v;
      const nums = stack.filter((v) => v.t === 'num').map((v) => v.v);
      const lastStr = () => stack.filter((v) => v.t === 'str').at(-1)?.v;
      switch (op) {
        case 'q':
          saved.push(ctm);
          break;
        case 'Q':
          ctm = saved.pop() || ctm0;
          break;
        case 'cm':
          if (nums.length >= 6) ctm = mul(nums.slice(-6), ctm);
          break;
        case 'BT':
          tm = ID;
          tlm = ID;
          break;
        case 'Tf':
          font = await fontOf(res, stack.find((v) => v.t === 'name')?.v);
          size = nums.at(-1) ?? size;
          break;
        case 'Tc':
          tc = nums.at(-1) ?? 0;
          break;
        case 'Tw':
          tw = nums.at(-1) ?? 0;
          break;
        case 'Tz':
          th = (nums.at(-1) ?? 100) / 100;
          break;
        case 'TL':
          tl = nums.at(-1) ?? 0;
          break;
        case 'Ts':
          rise = nums.at(-1) ?? 0;
          break;
        case 'Td':
          moveLine(nums.at(-2) ?? 0, nums.at(-1) ?? 0);
          break;
        case 'TD':
          tl = -(nums.at(-1) ?? 0);
          moveLine(nums.at(-2) ?? 0, nums.at(-1) ?? 0);
          break;
        case 'Tm':
          if (nums.length >= 6) {
            tm = nums.slice(-6);
            tlm = tm;
          }
          break;
        case 'T*':
          moveLine(0, -tl);
          break;
        case 'Tj':
          if (lastStr()) showString(lastStr());
          break;
        case "'":
          moveLine(0, -tl);
          if (lastStr()) showString(lastStr());
          break;
        case '"':
          tw = nums.at(-2) ?? tw;
          tc = nums.at(-1) ?? tc;
          moveLine(0, -tl);
          if (lastStr()) showString(lastStr());
          break;
        case 'TJ':
          for (const part of stack.filter((v) => v.arr).at(-1)?.arr || []) {
            if (part.t === 'str') showString(part.v);
            else if (part.t === 'num') tm = mul([1, 0, 0, 1, (-part.v / 1000) * size * th, 0], tm);
          }
          break;
        case 'Do': {
          const name = stack.find((v) => v.t === 'name')?.v;
          const xo = objOf(get(res?.XObject)?.[name]);
          if (xo?.stream && nameOf(xo.value?.Subtype) === 'Form') {
            const data = await decode(xo);
            const matrix = (get(xo.value.Matrix) || []).map(numOf);
            const inner = matrix.length === 6 ? mul(matrix, ctm) : ctm;
            if (data) await run(data, get(xo.value.Resources) || res, inner, depth + 1);
          }
          break;
        }
        default:
      }
      stack.length = 0;
    }
  };

  /**
   * Runs → lines. A run on another baseline starts a line; on the same baseline, a gap wider
   * than a fifth of the font size is a space, and a jump back to the left (a second column, a
   * date drawn before its title) starts a line too.
   */
  const assemble = () => {
    const out = [];
    let line = '';
    let prev = null;
    for (const r of runs) {
      const sz = Math.max(r.size, 1);
      if (!prev || Math.abs(r.y - prev.y) > sz * 0.5 || r.x < prev.x2 - sz * 3) {
        if (line.trim()) out.push(line.replace(/\s+/g, ' ').trim());
        line = r.text;
      } else {
        const gap = r.x - prev.x2;
        if (gap > sz * 0.2 && !line.endsWith(' ') && !r.text.startsWith(' ')) line += ' ';
        line += r.text;
      }
      prev = r;
    }
    if (line.trim()) out.push(line.replace(/\s+/g, ' ').trim());
    return out;
  };

  const lines = [];
  for (const { page, res } of pages) {
    const contents = Array.isArray(page.Contents) ? page.Contents : [page.Contents];
    const parts = [];
    for (const c of contents) {
      const o = objOf(c);
      if (!o?.stream) continue;
      const data = await decode(o);
      if (data) parts.push(data);
    }
    // A page's content may be split over several streams mid-operator: join, then read.
    const total = parts.reduce((n, p) => n + p.length + 1, 0);
    const joined = new Uint8Array(total);
    let at = 0;
    for (const p of parts) {
      joined.set(p, at);
      at += p.length;
      joined[at++] = 10;
    }
    runs = [];
    await run(joined, res, ID, 0);
    lines.push(...assemble(), '');
  }
  const text = lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const letters = (text.match(/\p{L}/gu) || []).length;
  return { text, pages: pages.length, problem: letters < 20 ? 'no-text' : null };
}

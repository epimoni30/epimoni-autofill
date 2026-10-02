// SPDX-License-Identifier: Apache-2.0
// Opening a PDF that is "protected" with no password, so its text can be read.
//
// CV builders and some exporters encrypt the file with an empty user password and an owner
// password that only restricts copying or printing. Every PDF viewer opens such a file without
// asking anything, so the person has no idea theirs is encrypted; an import that refused it
// would refuse a CV that looks perfectly ordinary to them. A file that really needs a password
// to open is still refused, because the empty one does not check out.
//
// The PDF standard security handler, revisions 2 to 6: RC4 (40 to 128 bits) and AES-128 keyed
// through MD5, and AES-256 keyed through SHA-2. Only streams are decrypted, since streams hold
// everything the text reader needs (content, fonts' ToUnicode maps, object streams). MD5 and
// RC4 are written out here; AES and SHA-2 come from WebCrypto.

const PAD = [
  0x28, 0xbf, 0x4e, 0x5e, 0x4e, 0x75, 0x8a, 0x41, 0x64, 0x00, 0x4e, 0x56, 0xff, 0xfa, 0x01, 0x08, 0x2e, 0x2e,
  0x00, 0xb6, 0xd0, 0x68, 0x3e, 0x80, 0x2f, 0x0c, 0xa9, 0xfe, 0x64, 0x53, 0x69, 0x7a,
];

/** MD5 of a byte array (RFC 1321). */
export function md5(input) {
  const K = new Int32Array(64);
  for (let i = 0; i < 64; i += 1) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) | 0;
  const S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
  const len = input.length;
  const total = (((len + 8) >> 6) + 1) * 64;
  const buf = new Uint8Array(total);
  buf.set(input);
  buf[len] = 0x80;
  const bits = len * 8;
  const view = new DataView(buf.buffer);
  view.setUint32(total - 8, bits >>> 0, true);
  view.setUint32(total - 4, Math.floor(bits / 2 ** 32), true);
  let a0 = 0x67452301;
  let b0 = 0xefcdab89 | 0;
  let c0 = 0x98badcfe | 0;
  let d0 = 0x10325476;
  for (let off = 0; off < total; off += 64) {
    let A = a0;
    let B = b0;
    let C = c0;
    let D = d0;
    for (let i = 0; i < 64; i += 1) {
      let F;
      let g;
      if (i < 16) {
        F = (B & C) | (~B & D);
        g = i;
      } else if (i < 32) {
        F = (D & B) | (~D & C);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        F = B ^ C ^ D;
        g = (3 * i + 5) % 16;
      } else {
        F = C ^ (B | ~D);
        g = (7 * i) % 16;
      }
      const s = S[(i >> 4) * 4 + (i % 4)];
      const sum = (A + F + K[i] + view.getInt32(off + g * 4, true)) | 0;
      A = D;
      D = C;
      C = B;
      B = (B + ((sum << s) | (sum >>> (32 - s)))) | 0;
    }
    a0 = (a0 + A) | 0;
    b0 = (b0 + B) | 0;
    c0 = (c0 + C) | 0;
    d0 = (d0 + D) | 0;
  }
  const out = new Uint8Array(16);
  const ov = new DataView(out.buffer);
  [a0, b0, c0, d0].forEach((w, i) => {
    ov.setInt32(i * 4, w, true);
  });
  return out;
}

export function rc4(key, data) {
  const S = new Uint8Array(256);
  for (let i = 0; i < 256; i += 1) S[i] = i;
  for (let i = 0, j = 0; i < 256; i += 1) {
    j = (j + S[i] + key[i % key.length]) & 255;
    [S[i], S[j]] = [S[j], S[i]];
  }
  const out = new Uint8Array(data.length);
  for (let k = 0, i = 0, j = 0; k < data.length; k += 1) {
    i = (i + 1) & 255;
    j = (j + S[i]) & 255;
    [S[i], S[j]] = [S[j], S[i]];
    out[k] = data[k] ^ S[(S[i] + S[j]) & 255];
  }
  return out;
}

const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};
const le32 = (n) => new Uint8Array([n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255]);
const same = (a, b, n) => a.length >= n && b.length >= n && a.subarray(0, n).every((x, i) => x === b[i]);

const subtle = () => globalThis.crypto?.subtle;

/** AES-CBC decrypt with PKCS#7 padding, the shape PDF uses for strings and streams. */
async function aesDecrypt(key, iv, data) {
  const k = await subtle().importKey('raw', key, 'AES-CBC', false, ['decrypt']);
  return new Uint8Array(await subtle().decrypt({ name: 'AES-CBC', iv }, k, data));
}

/** AES-CBC encrypt with no padding (data is a multiple of 16): WebCrypto pads, so drop it. */
async function aesEncryptRaw(key, iv, data) {
  const k = await subtle().importKey('raw', key, 'AES-CBC', false, ['encrypt']);
  return new Uint8Array(await subtle().encrypt({ name: 'AES-CBC', iv }, k, data)).subarray(0, data.length);
}

/**
 * AES-256 decrypt of one or two blocks with no padding (how /UE is stored). WebCrypto always
 * checks padding, so a block of valid padding is encrypted onto the end first.
 */
async function aesDecryptRaw(key, iv, data) {
  const last = data.subarray(data.length - 16);
  const pad = new Uint8Array(16).fill(16);
  const extra = await aesEncryptRaw(key, last, pad);
  return aesDecrypt(key, iv, concat(data, extra));
}

async function sha(name, data) {
  return new Uint8Array(await subtle().digest(name, data));
}

/** Revision 6's hash (ISO 32000-2, algorithm 2.B); revision 5 is plain SHA-256. */
async function hash2B(password, salt, udata, rev) {
  let K = await sha('SHA-256', concat(password, salt, udata));
  if (rev < 6) return K;
  for (let i = 0; ; i += 1) {
    const block = concat(password, K, udata);
    const K1 = new Uint8Array(block.length * 64);
    for (let r = 0; r < 64; r += 1) K1.set(block, r * block.length);
    const E = await aesEncryptRaw(K.subarray(0, 16), K.subarray(16, 32), K1);
    let mod = 0;
    for (let b = 0; b < 16; b += 1) mod = (mod * 256 + E[b]) % 3;
    K = await sha(['SHA-256', 'SHA-384', 'SHA-512'][mod], E);
    if (i >= 63 && E[E.length - 1] <= i - 32) break;
  }
  return K.subarray(0, 32);
}

const bytesOf = (v) => new Uint8Array(v?.str || []);

/**
 * The decrypter for a file's /Encrypt dictionary and first /ID, with the empty user password.
 * Returns `null` when the empty password does not open it (a real password is needed) or the
 * handler is one this does not know; otherwise `{ stream(bytes, num, gen) }`.
 */
export async function openEncrypted(enc, id0) {
  if (enc?.Filter?.name !== 'Standard') return null;
  const V = enc.V?.num ?? 0;
  const R = enc.R?.num ?? 0;
  const O = bytesOf(enc.O);
  const U = bytesOf(enc.U);
  const P = enc.P?.num ?? 0;
  const stmf = enc.StmF?.name;
  const cfm = stmf && enc.CF?.[stmf]?.CFM?.name;

  if (R >= 5) {
    if (!subtle()) return null;
    const empty = new Uint8Array(0);
    const valid = await hash2B(empty, U.subarray(32, 40), empty, R);
    if (!same(valid, U, 32)) return null;
    const keyKey = await hash2B(empty, U.subarray(40, 48), empty, R);
    const fileKey = await aesDecryptRaw(keyKey, new Uint8Array(16), bytesOf(enc.UE).subarray(0, 32));
    return {
      stream: (data) =>
        data.length > 16 ? aesDecrypt(fileKey, data.subarray(0, 16), data.subarray(16)) : data,
    };
  }

  const n = R === 2 ? 5 : Math.min(16, Math.max(5, (enc.Length?.num ?? 40) / 8));
  const meta = enc.EncryptMetadata === false && R >= 4 ? [new Uint8Array([255, 255, 255, 255])] : [];
  let key = md5(concat(new Uint8Array(PAD), O.subarray(0, 32), le32(P), id0, ...meta)).subarray(0, n);
  if (R >= 3) for (let i = 0; i < 50; i += 1) key = md5(key).subarray(0, n);

  // The empty password is right if it reproduces /U.
  if (R === 2) {
    if (!same(rc4(key, new Uint8Array(PAD)), U, 32)) return null;
  } else {
    let x = rc4(key, md5(concat(new Uint8Array(PAD), id0)));
    for (let i = 1; i <= 19; i += 1)
      x = rc4(
        key.map((b) => b ^ i),
        x,
      );
    if (!same(x, U, 16)) return null;
  }

  const aes = V === 4 && cfm === 'AESV2';
  if (aes && !subtle()) return null;
  const objectKey = (num, gen) => {
    const salt = aes ? [new Uint8Array([0x73, 0x41, 0x6c, 0x54])] : [];
    const k = md5(
      concat(
        key,
        new Uint8Array([num & 255, (num >> 8) & 255, (num >> 16) & 255, gen & 255, (gen >> 8) & 255]),
        ...salt,
      ),
    );
    return k.subarray(0, Math.min(16, n + 5));
  };
  return {
    stream: (data, num, gen) => {
      const k = objectKey(num, gen);
      if (!aes) return rc4(k, data);
      return data.length > 16 ? aesDecrypt(k, data.subarray(0, 16), data.subarray(16)) : data;
    },
  };
}

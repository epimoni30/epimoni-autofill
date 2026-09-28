// SPDX-License-Identifier: Apache-2.0
// The CV files: the PDF a user attached to a library entry, kept in the extension's own
// IndexedDB. A CV with none gets one rendered from the document on demand (`shared/pdf.js`),
// which is never stored: derived on read, like the active CV, so it cannot go stale.
//
// Not `chrome.storage.local`, which holds JSON: a PDF would be stored as a base64 string a
// third larger than the file, inside the same bag every `read()` parses, twenty CVs deep. The
// database lives in the extension's origin, so no page can reach it, and like the library it
// never leaves the machine: nothing here syncs and nothing here makes a network call.
//
// Keyed by the library entry's `id`, so switching the active CV switches its file with it and
// deleting an entry deletes its file. The worker is the only caller, as it is for the library.

const DB = 'epimoni-files';
const STORE = 'files';

/** Big enough for any CV, small enough that a mistaken 80-page scan is refused. */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

/** PDF only, for now: it is what every application form accepts. */
export const FILE_TYPES = ['application/pdf'];

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(mode, fn) {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const req = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(req?.result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  } finally {
    db.close();
  }
}

/** Why a file cannot be kept, or null when it can. */
export function fileProblem({ name, type, bytes }) {
  if (!name || !bytes?.byteLength) return 'empty';
  if (!FILE_TYPES.includes(type)) return 'type';
  if (bytes.byteLength > MAX_FILE_BYTES) return 'size';
  return null;
}

/** Keep `bytes` (an ArrayBuffer) as the file of library entry `id`, replacing any before it. */
export async function putFile(id, { name, type, bytes }) {
  const record = {
    name: String(name).slice(0, 200),
    type,
    size: bytes.byteLength,
    bytes,
    added_at: Date.now(),
  };
  await tx('readwrite', (s) => s.put(record, id));
  return fileMeta(record);
}

/** The whole record, bytes included, or null. */
export async function getFile(id) {
  if (!id) return null;
  return (await tx('readonly', (s) => s.get(id))) || null;
}

/** What a surface may show about a file: never the bytes. */
export function fileMeta(record) {
  return record
    ? {
        name: record.name,
        type: record.type,
        size: record.size,
        added_at: record.added_at || null,
        origin: record.origin || 'upload',
      }
    : null;
}

/** Every entry's file metadata, as `{id: meta}`, for the library listing. */
export async function listFileMeta() {
  const out = {};
  await tx('readonly', (s) => {
    const req = s.openCursor();
    req.onsuccess = () => {
      const c = req.result;
      if (!c) return;
      out[c.key] = fileMeta(c.value);
      c.continue();
    };
    return req;
  });
  return out;
}

export async function deleteFile(id) {
  if (!id) return;
  await tx('readwrite', (s) => s.delete(id));
}

export async function clearFiles() {
  await tx('readwrite', (s) => s.clear());
}

// Messages between the worker and a page are JSON, which carries no bytes: a file crosses as
// base64 and is turned back into bytes on the other side. Chunked, because spreading a
// multi-megabyte array into `String.fromCharCode` overflows the call stack.

export function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function fromBase64(b64) {
  const bin = atob(String(b64 || ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

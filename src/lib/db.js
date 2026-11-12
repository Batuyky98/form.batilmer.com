// GEÇİCİ VERİ DEPOSU (localStorage)
// MySQL bağlandığında bu dosya tamamen kalkacak; api.js içindeki fonksiyonlar fetch ile sunucuya gidecek.
// Tablolar, dokümandaki MySQL veri modeliyle birebir aynı isimlerde tutuluyor.

import { normalizeContent } from './templates.js';

const KEY = 'batilmer_form_db_v1';

const EMPTY = {
  version: 1,
  users: [],
  sessions: [],
  forms: [],
  versions: [],
  permissions: [],
  submissions: [],
  appointments: [],
  blocks: [],
  logs: [],
  outbox: [],
  resetTokens: []
};

// Eski sürümden kalan verileri yeni alanlara uyarlar (MySQL'deki "migration" karşılığı)
function migrate(db) {
  for (const f of db.forms) {
    f.draft = normalizeContent(f.draft);
    if (f.published) f.published = normalizeContent(f.published);
  }
  for (const s of db.submissions) {
    if (!s.status) s.status = 'yeni';
    if (!s.notes) s.notes = [];
  }
  return db;
}

export function load() {
  const raw = localStorage.getItem(KEY);
  if (!raw) return structuredClone(EMPTY);
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Bozuk veri: üzerine yazmamak için yedeğini al, boş başla
    localStorage.setItem(`${KEY}_bozuk_${Date.now()}`, raw);
    return structuredClone(EMPTY);
  }
  return migrate({ ...structuredClone(EMPTY), ...parsed });
}

export class StorageFullError extends Error {}

export function save(db) {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch (e) {
    // Tarayıcı deposu (yaklaşık 5 MB) dolarsa – genelde büyük dosya yüklemelerinde
    throw new StorageFullError(e?.message || 'storage full');
  }
  window.dispatchEvent(new CustomEvent('batilmer-db-change'));
}

// Bir işlemi "transaction" gibi çalıştırır: oku → değiştir → yaz
export function tx(fn) {
  const db = load();
  const result = fn(db);
  save(db);
  return result;
}

export function read(fn) {
  return fn(load());
}

export function resetAll() {
  localStorage.removeItem(KEY);
}

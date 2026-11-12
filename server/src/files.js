// Formlardan yüklenen dosyalar veritabanına değil diske yazılır: DATA_DIR/uploads/<dosya-id>
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';

export const uploadsDir = () => path.join(config.dataDir, 'uploads');

export async function ensureDirs() {
  await fs.mkdir(uploadsDir(), { recursive: true });
}

export function filePath(id) {
  if (!/^[a-z0-9_]+$/i.test(id)) throw new Error('geçersiz dosya id');
  return path.join(uploadsDir(), id);
}

export async function writeUpload(id, buffer) {
  await fs.writeFile(filePath(id), buffer, { mode: 0o640 });
}

export async function removeUploads(ids) {
  await Promise.all(ids.map((id) => fs.rm(filePath(id), { force: true }).catch(() => {})));
}

// "data:application/pdf;base64,...." → { mime, buffer }
export function decodeDataUrl(dataUrl) {
  const m = /^data:([\w.+-]+\/[\w.+-]+)?(;[\w-]+=[\w-]+)*;base64,([A-Za-z0-9+/=\s]+)$/.exec(String(dataUrl || ''));
  if (!m) return null;
  return { mime: m[1] || 'application/octet-stream', buffer: Buffer.from(m[3], 'base64') };
}

// Dosyanın ilk baytlarına bakarak gerçekten iddia edilen türde olup olmadığını kontrol et
export function sniffMatches(ext, buf) {
  const head = buf.subarray(0, 8);
  const hex = head.toString('hex');
  switch (ext) {
    case 'pdf':
      return head.subarray(0, 4).toString() === '%PDF';
    case 'png':
      return hex.startsWith('89504e47');
    case 'jpg':
      return hex.startsWith('ffd8ff');
    case 'doc':
    case 'xls':
      // eski Office (OLE) ya da yeni Office (zip)
      return hex.startsWith('d0cf11e0') || hex.startsWith('504b0304');
    default:
      return false;
  }
}

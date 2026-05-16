import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const SCREENSHOTS_DIR = path.join(process.cwd(), 'screenshots');
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CacheMeta {
  url: string;
  capturedAt: number;
}

export function ensureScreenshotsDir(): void {
  if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  }
}

export function urlToKey(url: string): string {
  return crypto.createHash('md5').update(url).digest('hex');
}

export function getImagePath(key: string): string {
  return path.join(SCREENSHOTS_DIR, `${key}.png`);
}

function getMetaPath(key: string): string {
  return path.join(SCREENSHOTS_DIR, `${key}.json`);
}

export type CacheStatus = 'valid' | 'stale' | 'missing';

export function getCacheStatus(key: string): CacheStatus {
  const metaPath = getMetaPath(key);
  const imgPath = getImagePath(key);

  if (!fs.existsSync(metaPath) || !fs.existsSync(imgPath)) {
    return 'missing';
  }

  const meta: CacheMeta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
  return Date.now() - meta.capturedAt < CACHE_TTL_MS ? 'valid' : 'stale';
}

export function saveMeta(key: string, url: string): void {
  const meta: CacheMeta = { url, capturedAt: Date.now() };
  fs.writeFileSync(getMetaPath(key), JSON.stringify(meta, null, 2));
}

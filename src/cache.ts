import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const SCREENSHOTS_DIR = path.join(process.cwd(), 'screenshots');
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export type ViewportMode = 'mobile' | 'desktop' | 'fullhd';

interface CacheMeta {
  url: string;
  mode: ViewportMode;
  capturedAt: number;
}

export interface ScreenshotRecord {
  key: string;
  url: string;
  mode: ViewportMode;
  capturedAt: number;
  imageUrl: string;
}

export type CacheStatus = 'valid' | 'stale' | 'missing';

export function ensureScreenshotsDir(): void {
  if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  }
}

export function urlToKey(url: string, mode: ViewportMode): string {
  return crypto.createHash('md5').update(`${url}|${mode}`).digest('hex');
}

export function getImagePath(key: string): string {
  return path.join(SCREENSHOTS_DIR, `${key}.png`);
}

function getMetaPath(key: string): string {
  return path.join(SCREENSHOTS_DIR, `${key}.json`);
}

export function getCacheStatus(key: string): CacheStatus {
  const metaPath = getMetaPath(key);
  const imgPath = getImagePath(key);

  if (!fs.existsSync(metaPath) || !fs.existsSync(imgPath)) return 'missing';

  const meta: CacheMeta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
  return Date.now() - meta.capturedAt < CACHE_TTL_MS ? 'valid' : 'stale';
}

export function saveMeta(key: string, url: string, mode: ViewportMode): void {
  const meta: CacheMeta = { url, mode, capturedAt: Date.now() };
  fs.writeFileSync(getMetaPath(key), JSON.stringify(meta, null, 2));
}

export function listScreenshots(): ScreenshotRecord[] {
  ensureScreenshotsDir();
  const files = fs.readdirSync(SCREENSHOTS_DIR).filter((f) => f.endsWith('.json'));
  const records: ScreenshotRecord[] = [];

  for (const file of files) {
    const key = file.replace('.json', '');
    if (!fs.existsSync(getImagePath(key))) continue;

    try {
      const meta: CacheMeta = JSON.parse(
        fs.readFileSync(path.join(SCREENSHOTS_DIR, file), 'utf-8'),
      );
      records.push({
        key,
        url: meta.url,
        mode: meta.mode ?? 'desktop',
        capturedAt: meta.capturedAt,
        imageUrl: `/images/${key}.png`,
      });
    } catch {
      // skip corrupted meta files
    }
  }

  return records.sort((a, b) => b.capturedAt - a.capturedAt);
}

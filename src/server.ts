import express, { Request, Response } from 'express';
import path from 'path';
import dotenv from 'dotenv';
import {
  ensureScreenshotsDir,
  urlToKey,
  getCacheStatus,
  getImagePath,
  saveMeta,
  listScreenshots,
  ViewportMode,
} from './cache';
import { captureScreenshot } from './screenshot';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3050;
const VALID_MODES: ViewportMode[] = ['mobile', 'desktop', 'fullhd'];

ensureScreenshotsDir();

app.use(express.json());
app.use('/images', express.static(path.join(process.cwd(), 'screenshots')));
app.use(express.static(path.join(process.cwd(), 'public')));

// ── List all cached screenshots ──────────────────────────────────────────────
app.get('/api/screenshots', (_req: Request, res: Response) => {
  res.json(listScreenshots());
});

// ── Capture or serve from SWR cache (JSON response for UI) ───────────────────
app.get('/api/capture', async (req: Request, res: Response): Promise<void> => {
  const { url, mode = 'desktop', force } = req.query;

  if (!url || typeof url !== 'string') {
    res.status(400).json({ error: 'Missing required query param: url' });
    return;
  }

  const targetMode = (typeof mode === 'string' && VALID_MODES.includes(mode as ViewportMode)
    ? mode
    : 'desktop') as ViewportMode;

  let targetUrl: string;
  try {
    targetUrl = decodeURIComponent(url);
    new URL(targetUrl);
  } catch {
    res.status(400).json({ error: 'Invalid URL' });
    return;
  }

  const key = urlToKey(targetUrl, targetMode);
  const imagePath = getImagePath(key);
  const status = force === 'true' ? 'stale' : getCacheStatus(key);

  const makeRecord = () => ({
    key,
    url: targetUrl,
    mode: targetMode,
    capturedAt: Date.now(),
    imageUrl: `/images/${key}.png`,
  });

  if (status === 'missing') {
    console.log(`[CAPTURE] First-time capture (${targetMode}): ${targetUrl}`);
    try {
      await captureScreenshot(targetUrl, imagePath, targetMode);
      saveMeta(key, targetUrl, targetMode);
      res.json(makeRecord());
    } catch (err) {
      console.error('[ERROR] Capture failed:', err);
      res.status(500).json({ error: 'Screenshot capture failed' });
    }
    return;
  }

  if (status === 'stale') {
    console.log(`[REVALIDATE] Serving stale, refreshing in background (${targetMode}): ${targetUrl}`);
    res.json({ ...makeRecord(), stale: true });

    captureScreenshot(targetUrl, imagePath, targetMode)
      .then(() => saveMeta(key, targetUrl, targetMode))
      .catch((err) => console.error('[ERROR] Background revalidation failed:', err));
    return;
  }

  res.json(makeRecord());
});

// ── Legacy redirect endpoint (keeps <img> tag usage working) ─────────────────
app.get('/screenshot', async (req: Request, res: Response): Promise<void> => {
  const { url, mode = 'desktop', force } = req.query;

  if (!url || typeof url !== 'string') {
    res.status(400).json({ error: 'Missing required query param: url' });
    return;
  }

  const targetMode = (typeof mode === 'string' && VALID_MODES.includes(mode as ViewportMode)
    ? mode
    : 'desktop') as ViewportMode;

  let targetUrl: string;
  try {
    targetUrl = decodeURIComponent(url);
    new URL(targetUrl);
  } catch {
    res.status(400).json({ error: 'Invalid URL' });
    return;
  }

  const key = urlToKey(targetUrl, targetMode);
  const imagePath = getImagePath(key);
  const status = force === 'true' ? 'stale' : getCacheStatus(key);

  if (status === 'missing') {
    try {
      await captureScreenshot(targetUrl, imagePath, targetMode);
      saveMeta(key, targetUrl, targetMode);
      res.redirect(`/images/${key}.png`);
    } catch (err) {
      console.error('[ERROR] Capture failed:', err);
      res.status(500).json({ error: 'Screenshot capture failed' });
    }
    return;
  }

  if (status === 'stale') {
    res.redirect(`/images/${key}.png`);
    captureScreenshot(targetUrl, imagePath, targetMode)
      .then(() => saveMeta(key, targetUrl, targetMode))
      .catch((err) => console.error('[ERROR] Background revalidation failed:', err));
    return;
  }

  res.redirect(`/images/${key}.png`);
});

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`\nScreenshot service → http://localhost:${PORT}`);
  console.log(`  UI:              GET /`);
  console.log(`  Capture (JSON):  GET /api/capture?url=<url>&mode=mobile|desktop|fullhd`);
  console.log(`  List:            GET /api/screenshots`);
  console.log(`  Image redirect:  GET /screenshot?url=<url>&mode=<mode>\n`);
});

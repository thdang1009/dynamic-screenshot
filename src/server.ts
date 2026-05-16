import express, { Request, Response } from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { ensureScreenshotsDir, urlToKey, getCacheStatus, getImagePath, saveMeta } from './cache';
import { captureScreenshot } from './screenshot';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3050;

ensureScreenshotsDir();

// Serve cached screenshots as static files
app.use('/images', express.static(path.join(process.cwd(), 'screenshots')));

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/screenshot', async (req: Request, res: Response): Promise<void> => {
  const { url, force } = req.query;

  if (!url || typeof url !== 'string') {
    res.status(400).json({ error: 'Missing required query param: url' });
    return;
  }

  let targetUrl: string;
  try {
    targetUrl = decodeURIComponent(url);
    new URL(targetUrl); // validate
  } catch {
    res.status(400).json({ error: 'Invalid URL' });
    return;
  }

  const key = urlToKey(targetUrl);
  const imagePath = getImagePath(key);
  const status = force === 'true' ? 'stale' : getCacheStatus(key);

  if (status === 'missing') {
    console.log(`[CAPTURE] First-time capture: ${targetUrl}`);
    try {
      await captureScreenshot(targetUrl, imagePath);
      saveMeta(key, targetUrl);
      res.redirect(`/images/${key}.png`);
    } catch (err) {
      console.error('[ERROR] Capture failed:', err);
      res.status(500).json({ error: 'Screenshot capture failed' });
    }
    return;
  }

  if (status === 'stale') {
    // SWR: serve stale immediately, refresh in background
    console.log(`[REVALIDATE] Stale cache — serving stale, refreshing in background: ${targetUrl}`);
    res.redirect(`/images/${key}.png`);

    captureScreenshot(targetUrl, imagePath)
      .then(() => saveMeta(key, targetUrl))
      .catch((err) => console.error('[ERROR] Background revalidation failed:', err));
    return;
  }

  // Cache is valid
  res.redirect(`/images/${key}.png`);
});

app.listen(PORT, () => {
  console.log(`\nScreenshot service running at http://localhost:${PORT}`);
  console.log(`  GET /screenshot?url=<encoded-url>    — Capture or serve cached screenshot`);
  console.log(`  GET /screenshot?url=<url>&force=true — Force cache invalidation`);
  console.log(`  GET /health                           — Health check\n`);
});

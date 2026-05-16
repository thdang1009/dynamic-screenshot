import puppeteer from 'puppeteer';
import fs from 'fs';
import { ViewportMode } from './cache';

const VIEWPORTS: Record<ViewportMode, { width: number; height: number; isMobile?: boolean }> = {
  mobile:  { width: 390,  height: 844,  isMobile: true },
  desktop: { width: 1280, height: 800 },
  fullhd:  { width: 1920, height: 1080 },
};

const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function captureScreenshot(
  url: string,
  outputPath: string,
  mode: ViewportMode = 'desktop',
): Promise<void> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport(VIEWPORTS[mode]);

    if (mode === 'mobile') {
      await page.setUserAgent(MOBILE_UA);
    }

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30_000 });

    // Scroll down then back to top to trigger lazy-loaded images
    await page.evaluate(async () => {
      await new Promise<void>((resolve) => {
        const distance = 300;
        let totalScrolled = 0;

        const timer = setInterval(() => {
          window.scrollBy(0, distance);
          totalScrolled += distance;

          if (totalScrolled >= document.body.scrollHeight) {
            clearInterval(timer);
            window.scrollTo(0, 0);
            resolve();
          }
        }, 100);
      });
    });

    await sleep(600);

    const buffer = await page.screenshot({ fullPage: true, type: 'png' });
    fs.writeFileSync(outputPath, buffer);
  } finally {
    await browser.close();
  }
}

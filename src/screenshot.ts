import puppeteer from 'puppeteer';
import fs from 'fs';

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function captureScreenshot(url: string, outputPath: string): Promise<void> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

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

    await sleep(600); // let lazy images finish loading after scroll

    const buffer = await page.screenshot({ fullPage: true, type: 'png' });
    fs.writeFileSync(outputPath, buffer);
  } finally {
    await browser.close();
  }
}

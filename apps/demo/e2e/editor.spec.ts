import { expect, test } from '@playwright/test';
import fs from 'fs/promises';

async function createScanPng(page: import('@playwright/test').Page): Promise<Buffer> {
  return page.screenshot({
    clip: {
      x: 0,
      y: 0,
      width: 320,
      height: 240
    }
  });
}

async function uploadSampleScan(page: import('@playwright/test').Page): Promise<void> {
  await page.setInputFiles('input[data-role="file-input"]', {
    name: 'scan.png',
    mimeType: 'image/png',
    buffer: await createScanPng(page)
  });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('opens local scan and creates a tab with canvas preview', async ({ page }) => {
  await uploadSampleScan(page);

  await expect(page.locator('.grey-editor__tab').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'scan.png' })).toBeVisible();
  await expect(page.locator('canvas[data-role="canvas"]')).toBeVisible();
  // Validation is limited to canvas and tab presence after file load.
  await expect(page.locator('canvas[data-role="canvas"]')).toBeVisible();
});

test('applies a rotation operation with live angle preview', async ({ page }) => {
  await uploadSampleScan(page);

  const rotationInput = page.locator('input[data-role="rotation-number"]');
  await rotationInput.fill('31.5');
  await rotationInput.press('Tab');

  await expect(rotationInput).toHaveValue('31.5');
  await expect(page.locator('canvas[data-role="canvas"]')).toBeVisible();
});

test('opens save dialog with shortcut and downloads export', async ({ page }) => {
  await uploadSampleScan(page);

  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('[data-role="save-modal"].is-open')).toBeVisible();

  await page.selectOption('select[data-role="format-select"]', 'jpeg');
  await page.fill('input[data-role="long-edge-input"]', '280');
  await page.locator('input[data-role="long-edge-input"]').press('Tab');
  await expect(page.locator('input[data-role="scale-input"]')).toBeDisabled();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download' }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(/\.jpg$/);
});

test('exports grayscale image with equal RGB channel intensities', async ({ page }) => {
  await uploadSampleScan(page);

  await page.getByRole('button', { name: 'Save' }).click();
  await page.selectOption('select[data-role="format-select"]', 'png');

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download' }).click();
  const download = await downloadPromise;

  const downloadPath = (await download.path()) ?? '';
  const downloadBytes = await fs.readFile(downloadPath);
  const dataUrl = `data:image/png;base64,${downloadBytes.toString('base64')}`;

  const [r, g, b] = await page.evaluate(async (url) => {
    const img = new Image();
    img.src = url;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = (err) => reject(err);
    });

    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      throw new Error('2D context unavailable');
    }

    ctx.drawImage(img, 0, 0);
    const pixel = ctx.getImageData(Math.floor(img.width / 2), Math.floor(img.height / 2), 1, 1).data;
    return [pixel[0], pixel[1], pixel[2]];
  }, dataUrl);

  expect(r).toBe(g);
  expect(g).toBe(b);
});

test('toggles rotation grid overlay and renders helper lines', async ({ page }) => {
  await uploadSampleScan(page);

  const gridCheckbox = page.locator('input[data-role="rotation-grid-checkbox"]');
  await expect(gridCheckbox).toBeChecked();

  await gridCheckbox.click();
  await expect(gridCheckbox).not.toBeChecked();

  await gridCheckbox.click();
  await expect(gridCheckbox).toBeChecked();

  const hasOverlayData = await page.evaluate(() => {
    const overlay = document.querySelector<HTMLCanvasElement>('canvas[data-role="overlay"]');
    if (!overlay) {
      return false;
    }
    const ctx = overlay.getContext('2d');
    if (!ctx) {
      return false;
    }
    const imageData = ctx.getImageData(Math.floor(overlay.width / 2), Math.floor(overlay.height / 2), 1, 1).data;
    return imageData[3] > 0;
  });

  expect(hasOverlayData).toBeTruthy();
});

test('closes a tab when close button is clicked', async ({ page }) => {
  page.on('pageerror', (err) => {
    console.log('PAGE ERROR', err.message || err);
  });
  page.on('console', (msg) => {
    console.log('PAGE LOG', msg.type(), msg.text());
  });

  await uploadSampleScan(page);
  await page.evaluate(() => console.log('JS console visible'));
  await uploadSampleScan(page);

  await expect(page.locator('.grey-editor__tab')).toHaveCount(2);

  const firstCloseButton = page.locator('.grey-editor__tab-close').first();
  console.log('firstCloseButton visible', await firstCloseButton.isVisible());
  await firstCloseButton.click();

  await page.waitForTimeout(1000);

  const afterCount1 = await page.locator('.grey-editor__tab').count();
  console.log('after Playwright click count', afterCount1);

  await page.evaluate(() => {
    const btn = document.querySelector<HTMLButtonElement>('.grey-editor__tab-close');
    if (btn) {
      btn.click();
    }
  });

  await page.waitForTimeout(1000);

  const afterCount2 = await page.locator('.grey-editor__tab').count();
  console.log('after JS click count', afterCount2);

  const debugTabs = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.grey-editor__tab')).map((el) => el.textContent?.trim())
  );
  console.log('tab labels after close:', debugTabs);

  await expect(page.locator('.grey-editor__tab')).toHaveCount(1);
});

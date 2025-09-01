import path from 'path';
import { clickAny, waitForAny, nap, handleDomFailure, logStep, typeLikeHuman } from '../utils.js';

export async function openComposer(page, timeout = 20000) {
  logStep('Відкриваю композер (What’s new? / New thread)');
  const openedViaTile = await clickAny(page, [
    'text=What’s new?',
    "text=What's new?",
    '[aria-label="What’s new?"]',
    '[aria-label="What\'s new?"]',
  ], { timeout: Math.min(timeout, 8000), purpose: 'Плитка What’s new?' }).catch(() => false);

  if (!openedViaTile) {
    await clickAny(page, [
      '[aria-label="New thread"]',
      'button[aria-label*="New"]',
      'a[href*="/compose"]',
      'text=New thread'
    ], { timeout: Math.min(timeout, 8000), purpose: 'Створення нового треду' }).catch(() => false);
  }

  const dialog = await waitForAny(page, [
    'div[role="dialog"]',
    '[data-testid="composer-root"]'
  ], { timeout, optional: false, purpose: 'Діалог композера' });

  if (!dialog) {
    await handleDomFailure(page, 'Не знайшов діалог композера');
    throw new Error('Composer dialog not found');
  }

  const area = await page.$('div[role="dialog"] div[contenteditable="true"], [data-testid="composer-root"] div[contenteditable="true"], div[role="dialog"] textarea, [data-testid="composer-root"] textarea');
  return area;
}

async function waitAndClickActivePost(page, timeout = 12000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const clicked = await page.evaluate(() => {
      const dialog = document.querySelector('div[role="dialog"], [data-testid="composer-root"]');
      if (!dialog) return false;
      const candidates = Array.from(dialog.querySelectorAll('button,[role="button"],[aria-label]'));
      const btn = candidates.find(el => {
        const txt = (el.innerText || el.textContent || '').trim().toLowerCase();
        const aria = (el.getAttribute('aria-label') || '').trim().toLowerCase();
        const isPost = txt === 'post' || aria === 'post' || txt.includes('post');
        const disabled = el.getAttribute('aria-disabled') === 'true' || el.disabled;
        return isPost && !disabled && el.offsetParent !== null;
      });
      if (btn) { btn.click(); return true; }
      return false;
    });
    if (clicked) return true;
    await nap(250);
  }
  return false;
}

async function attachImageIfAny(page, imagePath, timeout = 15000) {
  if (!imagePath) return;
  logStep(`Додаю зображення ${imagePath}`);
  const abs = path.resolve(imagePath);
  const [fileChooser] = await Promise.all([
    page.waitForFileChooser({ timeout }).catch(() => null),
    clickAny(page, [
      'div[role="dialog"] input[type="file"]',
      'div[role="dialog"] [aria-label*="photo"]',
      'div[role="dialog"] button:has-text("Add photo")',
      'input[type="file"]',
      'button[aria-label*="Add photo"]',
      'text=Add photo'
    ], { timeout, purpose: 'Кнопка додати фото' }).catch(() => false)
  ]);
  if (fileChooser) {
    await fileChooser.accept([abs]);
  } else {
    const fileInput = await page.$('div[role="dialog"] input[type="file"], input[type="file"]');
    if (fileInput) await fileInput.uploadFile(abs);
  }
}

export async function fillAndPost(page, { composerHandle = null, text = '', image = null, timeout = 15000 } = {}) {
  logStep('Заповнюю текст треду');
  let area = composerHandle;
  if (!area) {
    area = await page.$('div[role="dialog"] div[contenteditable="true"], [data-testid="composer-root"] div[contenteditable="true"], div[role="dialog"] textarea, [data-testid="composer-root"] textarea');
  }
  if (!area) {
    await handleDomFailure(page, 'Не знайшов поле вводу тексту у діалозі композера');
    throw new Error('Composer input not found');
  }
  await area.click();
  await typeLikeHuman(area, text);

  if (image) {
    await attachImageIfAny(page, image, timeout).catch(() => {});
  }

  logStep('Натискаю Post');
  let posted = await waitAndClickActivePost(page, 12000);
  if (!posted) {
    try {
      const isMac = (await page.evaluate(() => navigator.platform)).toLowerCase().includes('mac');
      await page.keyboard.down(isMac ? 'Meta' : 'Control');
      await page.keyboard.press('Enter');
      await page.keyboard.up(isMac ? 'Meta' : 'Control');
      posted = true;
    } catch { /* ignore */ }
  }

  await waitForAny(page, [
    'text=Your thread was posted',
    'text=View',
    'text=Undo'
  ], { timeout: timeout * 2, optional: true, purpose: 'Після публікації' });

  return posted;
}

export default { openComposer, fillAndPost };

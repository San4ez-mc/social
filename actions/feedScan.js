// actions/feedScan.js
// Сканування стрічки Threads із можливістю пропустити блок рекомендацій

import { tryStep } from '../helpers/misc.js';
import { ensureThreadsReady } from '../core/login.js';
import { slowScroll } from '../utils.js';

/**
 * Прокручує стрічку декілька разів, попередньо авторизуючись.
 * @param {import('puppeteer').Page} page
 * @param {object} opts
 * @param {number} [opts.scanScrolls=20] скільки кроків прокручування зробити
 * @returns {Promise<object>} результат
 */
export async function run(page, { scanScrolls = 20 } = {}) {
  await tryStep('ensureThreadsReady', () => ensureThreadsReady(page), { page });
  await scrollPastSuggestionsIfPresent(page, { ensureLogin: false });
  await slowScroll(page, scanScrolls);
  return { ok: true };
}

/**
 * Якщо на початку стрічки є блок "Suggested for you", прокручує його, щоб
 * стрічка містила лише пости з підписок.
 * @param {import('puppeteer').Page} page
 * @param {object} opts
 * @param {boolean} [opts.ensureLogin=true] чи викликати логін усередині
 * @returns {Promise<boolean>} true, якщо блок було знайдено й пропущено
 */
export async function scrollPastSuggestionsIfPresent(page, { ensureLogin = true } = {}) {
  if (ensureLogin) {
    await tryStep('ensureThreadsReady', () => ensureThreadsReady(page), { page });
  }

  const skipped = await page.evaluate(() => {
    const headers = Array.from(document.querySelectorAll('h2, h3'));
    const block = headers.find(h => /Suggested for you|Рекомендовано/i.test(h.textContent || ''));
    if (!block) return false;
    const rect = block.getBoundingClientRect();
    window.scrollBy(0, rect.bottom + 50);
    return true;
  }).catch(() => false);

  return skipped;
}

export default { run, scrollPastSuggestionsIfPresent };

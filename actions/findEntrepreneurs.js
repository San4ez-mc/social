// actions/findEntrepreneurs.js
// Виконує пошук профілів підприємців у Threads та підписується на кілька з них

import { tryStep } from '../helpers/misc.js';
import { ensureThreadsReady } from '../core/login.js';
import { run as searchFollow } from './search.follow.js';

/**
 * Випадково шукає підприємців за ключовими словами та підписується на них.
 * Початок: головна стрічка Threads
 * Кінець: головна стрічка Threads
 *
 * @param {import('puppeteer').Page} page сторінка браузера
 * @param {object} opts
 * @param {number} [opts.maxFollows=3] максимальна кількість підписок
 * @returns {Promise<object>} інформація про кількість підписок
 */
export async function run(page, { maxFollows = 3 } = {}) {
  await tryStep('ensureThreadsReady', () => ensureThreadsReady(page), { page });

  const keywords = [
    'підприємець',
    'керівник',
    'власник',
    'entrepreneur',
    'owner',
    'founder',
  ];

  const follows = Math.min(4, Math.max(0, maxFollows));

  return await searchFollow(page, {
    queries: keywords,
    maxFollowsPerRun: follows,
    likesPerProfile: [3, 4],
  });
}

export default { run };

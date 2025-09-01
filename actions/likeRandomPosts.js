// actions/likeRandomPosts.js
import { isOnThreadsFeed } from '../core/feed.js';
import * as coachAgent from '../coach/coachAgent.js';
import { SELECTORS } from '../constants/selectors.js';

const pause = (min=200, max=600) => new Promise(r => setTimeout(r, Math.floor(min + Math.random()*(max-min))));
const withRetry = async (name, fn, tries=3) => {
  let lastErr;
  for (let i=1;i<=tries;i++){
    try { return await fn(); } catch (e){ lastErr=e; await pause(400,1000); }
  }
  throw Object.assign(new Error(`[${name}] failed after ${tries} retries`), { cause: lastErr });
};
const sample = (arr, n) => arr.sort(() => 0.5 - Math.random()).slice(0, n);

export async function likeRandomPosts(page, { handleOrUrl, user, maxLikes = 4 }) {
  const ts = new Date().toISOString();
  const profileUrl = handleOrUrl.startsWith('http') ? handleOrUrl : `https://www.threads.com/${handleOrUrl.replace(/^\/?/, '')}`;
  try {
    if (!await isOnThreadsFeed(page, user)) {
      throw new Error('Not on Threads feed or not authorized');
    }

    // Відкрити профіль
    await withRetry('gotoProfile', async () => {
      await page.goto(profileUrl, { waitUntil: 'networkidle0', timeout: 30000 });
      await pause(400,900);
    });

    // Зібрати кнопки «лайк» на стрічці профілю
    const likeSelectors = SELECTORS.profile.posts.likeButtons;
    const postLikeHandles = await withRetry('collectLikeButtons', async () => {
      await page.waitForSelector(likeSelectors.root, { timeout: 15000 });
      return await page.$$(likeSelectors.item);
    });

    const toLike = sample(postLikeHandles, Math.min(maxLikes, 4)); // ліміт 3–4
    for (const btn of toLike) {
      try {
        await btn.click();
        await pause();
      } catch {}
    }

    // Повернутися у стрічку
    await withRetry('backToFeed', async () => {
      await page.click(SELECTORS.nav.home);
      await pause(400,900);
    });

    return { ok: true, liked: toLike.length };
  } catch (err) {
    await coachAgent.report({ stage: 'likeRandomPosts', message: err.message, screenshotPath: null, context: { handleOrUrl, ts } });
    throw err;
  }
}

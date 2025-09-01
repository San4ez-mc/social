// actions/followUser.js
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

export async function followUser(page, { handleOrUrl, user }) {
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

    // Якщо вже підписані — пропускаємо
    const alreadyFollowing = await page.$(SELECTORS.profile.followingButton) !== null;
    if (!alreadyFollowing) {
      await withRetry('clickFollow', async () => {
        await page.waitForSelector(SELECTORS.profile.followButton, { timeout: 10000 });
        await page.click(SELECTORS.profile.followButton);
        await pause(400,900);
      });
    }

    // Повернутися у стрічку
    await withRetry('backToFeed', async () => {
      await page.click(SELECTORS.nav.home);
      await pause(400,900);
    });

    return { ok: true, alreadyFollowing };
  } catch (err) {
    await coachAgent.report({ stage: 'followUser', message: err.message, screenshotPath: null, context: { handleOrUrl, ts } });
    throw err;
  }
}

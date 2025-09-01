// actions/leaveComment.js
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
const pick = arr => arr[Math.floor(Math.random()*arr.length)];

export async function leaveComment(page, { handleOrUrl, user, templates }) {
  const ts = new Date().toISOString();
  const profileUrl = handleOrUrl.startsWith('http') ? handleOrUrl : `https://www.threads.com/${handleOrUrl.replace(/^\/?/, '')}`;
  const text = pick(templates);
  try {
    if (!await isOnThreadsFeed(page, user)) {
      throw new Error('Not on Threads feed or not authorized');
    }

    // Відкрити профіль
    await withRetry('gotoProfile', async () => {
      await page.goto(profileUrl, { waitUntil: 'networkidle0', timeout: 30000 });
      await pause(400,900);
    });

    // Відкрити останній/перший пост (або коментар інпут із карточки)
    await withRetry('openFirstPost', async () => {
      await page.waitForSelector(SELECTORS.profile.posts.firstPost, { timeout: 15000 });
      await page.click(SELECTORS.profile.posts.firstPost);
      await pause(400,900);
    });

    // Ввести коментар
    await withRetry('typeComment', async () => {
      await page.waitForSelector(SELECTORS.post.comment.input, { timeout: 10000 });
      await page.click(SELECTORS.post.comment.input);
      await page.type(SELECTORS.post.comment.input, text, { delay: 40 + Math.floor(Math.random()*40) });
      await pause();
      await page.click(SELECTORS.post.comment.submit);
      await pause(500,1000);
    });

    // Закрити пост (якщо модалка) і назад у стрічку
    await withRetry('closeAndBack', async () => {
      if (await page.$(SELECTORS.post.closeModal)) {
        await page.click(SELECTORS.post.closeModal);
        await pause(200,600);
      }
      await page.click(SELECTORS.nav.home);
      await pause(400,900);
    });

    return { ok: true, comment: text };
  } catch (err) {
    await coachAgent.report({ stage: 'leaveComment', message: err.message, screenshotPath: null, context: { handleOrUrl, ts, text } });
    throw err;
  }
}

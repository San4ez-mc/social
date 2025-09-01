// actions/searchUsers.js
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

export async function searchUsers(page, { keyword, user }) {
  const ts = new Date().toISOString();
  try {
    if (!await isOnThreadsFeed(page, user)) {
      throw new Error('Not on Threads feed or not authorized');
    }

    // Відкрити пошук (іконка «лупа» у верхньому/нижньому барі)
    await withRetry('openSearch', async () => {
      await page.waitForSelector(SELECTORS.feed.searchButton, { timeout: 10000 });
      await page.click(SELECTORS.feed.searchButton);
      await pause();
    });

    // Ввести ключове слово
    await withRetry('typeKeyword', async () => {
      await page.waitForSelector(SELECTORS.search.input, { timeout: 10000 });
      await page.click(SELECTORS.search.input, { clickCount: 3 });
      await page.type(SELECTORS.search.input, keyword, { delay: 50 + Math.floor(Math.random()*60) });
      await pause(500,900);
    });

    // Зібрати перші результати-профілі
    const profiles = await withRetry('collectProfiles', async () => {
      await page.waitForSelector(SELECTORS.search.results.profileCards, { timeout: 15000 });
      return await page.$$eval(SELECTORS.search.results.profileCards, cards => cards.slice(0,20).map(c => {
        const handle = c.querySelector('a[href^="/@"]')?.getAttribute('href') ?? null;
        const title  = c.querySelector('a[href^="/@"]')?.textContent?.trim() ?? null;
        return { handle, title };
      }).filter(x => x.handle));
    });

    // Повернутися в стрічку
    await withRetry('backToFeed', async () => {
      await page.click(SELECTORS.nav.backOrHome); // кнопка «Назад» або «Додому»
      await pause(300,800);
    });

    return profiles;
  } catch (err) {
    await coachAgent.report({ stage: 'searchUsers', message: err.message, screenshotPath: null, context: { keyword, ts } });
    throw err;
  }
}

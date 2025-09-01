// actions/engageByKeywords.js
import { isOnThreadsFeed } from '../core/feed.js';
import * as coachAgent from '../coach/coachAgent.js';
import { searchUsers } from './searchUsers.js';
import { followUser } from './followUser.js';
import { likeRandomPosts } from './likeRandomPosts.js';
import { leaveComment } from './leaveComment.js';

const pause = (min=200, max=600) => new Promise(r => setTimeout(r, Math.floor(min + Math.random()*(max-min))));
const sample = (arr, n) => arr.sort(() => 0.5 - Math.random()).slice(0, n);

export async function engageByKeywords(page, {
  user,
  keywords = ['підприємець','керівник','власник','бізнесмен','owner'],
  maxProfilesPerRun = 4,
  likePerProfile = 3,
  commentChance = 0.35,
  commentTemplates = [
    'Дуже слушна думка!',
    'Корисний досвід, дякую 🙌',
    'Погоджуюсь. Так і має бути.',
    'Цікава перспектива, беру на замітку.'
  ]
}) {
  const ts = new Date().toISOString();
  try {
    if (!await isOnThreadsFeed(page, user)) {
      throw new Error('Not on Threads feed or not authorized');
    }

    // 1) Обрати випадковий ключ
    const keyword = keywords[Math.floor(Math.random()*keywords.length)];

    // 2) Знайти профілі
    const profiles = await searchUsers(page, { keyword, user });
    const subset = sample(profiles, Math.min(maxProfilesPerRun, 4)); // 3–4 профілі

    // 3) Пройтись по кожному профілю: лайки → підписка → (інколи) комент
    const results = [];
    for (const p of subset) {
      const handle = p.handle.startsWith('/') ? p.handle : `/${p.handle}`;
      const url = `https://www.threads.com${handle}`;
      try {
        await likeRandomPosts(page, { handleOrUrl: url, user, maxLikes: likePerProfile });
        await pause();

        const followRes = await followUser(page, { handleOrUrl: url, user });
        await pause();

        if (Math.random() < commentChance) {
          await leaveComment(page, { handleOrUrl: url, user, templates: commentTemplates });
          await pause();
        }

        results.push({ handle, followed: !followRes.alreadyFollowing });
      } catch (e) {
        await coachAgent.report({ stage: 'engageByKeywords:item', message: e.message, screenshotPath: null, context: { ts, handle } });
      }
    }

    // Гарантовано повернутися у стрічку
    try {
      await page.evaluate(() => {
        const home = document.querySelector('a[href="/"]');
        if (home) home.click();
      });
      await pause(400,900);
    } catch {}

    return { ok: true, keyword, results };
  } catch (err) {
    await coachAgent.report({ stage: 'engageByKeywords', message: err.message, screenshotPath: null, context: { ts } });
    throw err;
  }
}

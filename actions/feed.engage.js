// actions/feed.engage.js
import { isOnThreadsFeed } from '../core/login.js';
import { scrollAndReact } from '../core/feed.js';
import { BUSINESS_SEARCH_KEYWORDS } from '../prompts.js';

/**
 * Початок: головна стрічка Threads
 * Кінець: головна стрічка Threads
 */
export async function run(page, {
    rounds = 3,
    pause = 1200,
    keywords = BUSINESS_SEARCH_KEYWORDS,
    doLike = true,
    doComment = false,
    commentText = 'Класна думка!',
    IG_USER = 'ol.matsuk',
} = {}) {
    if (!(await isOnThreadsFeed(page, IG_USER))) {
        throw new Error('Not on Threads feed');
    }
    const res = await scrollAndReact(page, { rounds, pause, keywords, doLike, doComment, commentText });
    return { ok: true, ...res };
}

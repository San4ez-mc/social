// actions/feed.engage.js
import { ensureThreadsReady } from '../core/login.js';
import { scrollAndReact } from '../core/feed.js';
import { BUSINESS_SEARCH_KEYWORDS } from '../coach_prompts/prompts.js';

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
    timeout = 25000,
    IG_USER = 'ol.matsuk',
} = {}) {
    await ensureThreadsReady(page, timeout, { IG_USER });
    const res = await scrollAndReact(page, { rounds, pause, keywords, doLike, doComment, commentText });
    return { ok: true, ...res };
}

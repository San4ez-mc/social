// actions/feed.engage.js
import { ensureThreadsReady } from '../core/login.js';
import { scrollAndReact } from '../core/feed.js';
import { BUSINESS_SEARCH_KEYWORDS } from '../coach_prompts/prompts.js';
import { tryStep } from '../helpers/misc.js';

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
    await tryStep('ensureThreadsReady', () => ensureThreadsReady(page, timeout, { IG_USER }), { page });
    const res = await tryStep('scrollAndReact', () => scrollAndReact(page, { rounds, pause, keywords, doLike, doComment, commentText }), { page });
    return { ok: true, ...res };
}

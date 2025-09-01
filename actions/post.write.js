// actions/post.write.js
import { ensureThreadsReady } from '../core/login.js';
import { isOnThreadsFeed } from '../core/feed.js';
import { openComposer, fillAndPost } from '../core/composer.js';
import { buildPromptForType, MAX_CHARS } from '../coach_prompts/prompts.js';
import { tryStep } from '../helpers/misc.js';

// заглушка під реальний LLM-виклик; зараз формуємо текст із промпта
async function generatePostText({ type = 'story', hint = '' } = {}) {
    const base = buildPromptForType(type) + (hint ? `\n\n${hint}` : '');
    return base.slice(0, MAX_CHARS);
}

/**
 * Початок: головна стрічка Threads
 * Кінець: головна стрічка Threads
 */
export async function run(page, {
    type = 'story',
    hint = '',
    timeout = 25000,
    image = null
} = {}) {

    await tryStep('ensureThreadsReady', () => ensureThreadsReady(page), { page });
    await tryStep('openComposer', () => openComposer(page, timeout), { page });
    const text = await tryStep('generatePostText', () => generatePostText({ type, hint }), { context: { type, hint } });
    await tryStep('fillAndPost', () => fillAndPost(page, { text, image, timeout }), { page, context: { text, image } });

    return { ok: true, textUsed: text };
}

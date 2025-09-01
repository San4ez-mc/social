// actions/post.write.js
import { ensureThreadsReady } from '../core/login.js';
import { openComposer, fillAndPost } from '../core/composer.js';
import { buildPromptForType, MAX_CHARS } from '../coach_prompts/prompts.js';

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
    IG_USER = 'ol.matsuk',
    image = null
} = {}) {
    // 1) гарантуємо Threads
    await ensureThreadsReady(page, timeout, { IG_USER });

    // 2) відкриваємо композер
    await openComposer(page, timeout);

    // 3) запит до GPT (тут — генерація з промпта)
    const text = await generatePostText({ type, hint });

    // 4) постимо (і, якщо треба, картинку)
    await fillAndPost(page, { text, image, timeout });

    // 5) повернення у головну стрічку (звичайно після посту уже там)
    return { ok: true, textUsed: text };
}

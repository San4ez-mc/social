import OpenAI from 'openai';
import { logGptCommand } from './coach/coachAgent.js';
import { MAX_CHARS, buildPromptForNewsRetry } from './prompts.js';
import { LIMITS } from './constants/limits.js';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/** Акуратно обрізати текст до MAX_CHARS із пріоритетом речення/слова */
function clampToLimit(text, limit = MAX_CHARS) {
    if (!text) return '';
    const clean = String(text).trim().replace(/\s+\n/g, '\n').replace(/\n{3,}/g, '\n\n');
    if (clean.length <= limit) return clean;

    const slice = clean.slice(0, limit);
    const lastPunct = Math.max(
        slice.lastIndexOf('. '),
        slice.lastIndexOf('! '),
        slice.lastIndexOf('? '),
        slice.lastIndexOf('.\n')
    );
    if (lastPunct > limit * 0.6) return slice.slice(0, lastPunct + 1).trim();

    const lastSpace = slice.lastIndexOf(' ');
    if (lastSpace > limit * 0.6) return slice.slice(0, lastSpace).trim();

    return slice.trim();
}

/**
 * Отримати текст поста від OpenAI за готовим промптом.
 * meta = { type: 'story'|'tip'|'news'|'humor', day?:number }
 */
export async function getPostTextFromOpenAI(prompt, meta = {}) {
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    const sys = [
        'Ти помічник для створення коротких постів у Threads українською.',
        'Вимоги: без хештегів, без емодзі на початку, дружній але професійний тон.',
        `Загальний ліміт: ${MAX_CHARS} символів.`,
        'Відповідай лише чистим текстом без префіксів та markdown.'
    ].join(' ');

    await logGptCommand('post-request', { role: 'system', content: sys }, { role: 'user', content: prompt }, { meta });

    const resp = await openai.chat.completions.create({
        model,
        messages: [
            { role: 'system', content: sys },
            { role: 'user', content: prompt }
        ],
        temperature: meta.type === 'news' ? 0.2 : 0.6
    });

    let txt = resp?.choices?.[0]?.message?.content?.trim() || '';
    txt = txt.replace(/^["“”]|["“”]$/g, '').trim();

    // Якщо новини — дозволь повторити спробу при NEED_SOURCE
    if (meta.type === 'news' && /^NEED_SOURCE\b/i.test(txt)) {
        const retryPrompt = buildPromptForNewsRetry();
        await logGptCommand('post-retry-request', { role: 'user', content: retryPrompt });
        const retry = await openai.chat.completions.create({
            model,
            messages: [
                { role: 'system', content: sys },
                { role: 'user', content: retryPrompt }
            ],
            temperature: 0.2
        });
        txt = (retry?.choices?.[0]?.message?.content || 'NEED_SOURCE').trim();
    }

    // Підчищаємо довжину
    txt = clampToLimit(txt, MAX_CHARS);

    // Гарантуємо, що "tip" починається з потрібного префіксу, якщо він не згенерувався
    if (meta.type === 'tip') {
        const re = /^порада від бізнес консультанта №\d+\s—\s/i;
        if (!re.test(txt)) {
            const n = meta.day || 1;
            txt = `порада від бізнес консультанта №${n} — ` + txt.replace(/^[-–—:]\s*/, '');
            txt = clampToLimit(txt, MAX_CHARS);
        }
    }

    await logGptCommand('post-response', { text: txt, meta });
    return txt;
}

/**
 * Згенерувати короткий позитивний коментар до переданого тексту.
 * Використовує OpenAI для формування відповіді.
 * @param {string} source текст поста
 * @returns {Promise<string>} позитивний коментар
 */
export async function getPositiveCommentForText(source) {
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    const sys = 'Ти пишеш короткі позитивні коментарі українською до постів у Threads. Без хештегів.';
    const prompt = `Напиши короткий позитивний коментар до такого поста:\n"${clampToLimit(source, LIMITS.commentMaxLen)}"`;
    await logGptCommand('comment-request', { role: 'user', content: prompt });
    const resp = await openai.chat.completions.create({
        model,
        messages: [
            { role: 'system', content: sys },
            { role: 'user', content: prompt }
        ],
        temperature: 0.7
    });

    let txt = resp?.choices?.[0]?.message?.content?.trim() || '';
    txt = txt.replace(/^["“”]|["“”]$/g, '').trim();
    txt = clampToLimit(txt, LIMITS.commentMaxLen);
    await logGptCommand('comment-response', { text: txt });
    return txt;
}

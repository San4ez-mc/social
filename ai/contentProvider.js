// ai/contentProvider.js
import { openai } from './openaiClient.js';
import { buildPromptForType as legacyBuildPromptForType, nextDayCounter } from '../prompts.js';

/**
 * Повертає промпт для типу посту (використовує існуючу логіку з prompts.js).
 * @param {'story'|'tip'|'news'|'humor'} type
 * @param {object} extras
 */
export function buildPromptForType(type, extras = {}) {
    return legacyBuildPromptForType(type, extras);
}

/**
 * Генерує текст посту через OpenAI або повертає переданий override.
 * Для типу 'tip' додає префікс із порядковим номером дня (nextDayCounter()).
 * Обрізає текст до 420 символів для безпечної кнопки Post.
 * @param {{type?:string,textOverride?:string}} opts
 */
export async function getPostTextFromOpenAI(opts = {}) {
    const { type = 'story', textOverride } = opts;
    if (textOverride) return String(textOverride).slice(0, 420);

    const system = 'Ти коротко і чітко пишеш українською для Threads. Максимум 420 символів.';
    let user = buildPromptForType(type, {});

    // Префікс для поради дня
    if (type === 'tip') {
        const n = nextDayCounter(new Date());
        user = `День №${n}. ${user}`;
    }

    const resp = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        temperature: 0.7,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }]
    });

    const text = resp.choices?.[0]?.message?.content?.trim() || '';
    return text.slice(0, 420);
}

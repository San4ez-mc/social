// ai/smartComment.js
import { openai } from './openaiClient.js';

/**
 * Генерує короткий розумний коментар до посту (1–2 речення, ≤220 символів).
 * Українською, без кліше й емодзі-спаму.
 * @param {string} postText
 * @param {string} [seedKeyword]
 * @returns {Promise<string|null>}
 */
export async function generateSmartCommentForPost(postText, seedKeyword = '') {
    const system = 'Ти коментуєш дописи в Threads українською. 1–2 речення, максимум 220 символів. Без кліше типу "круто", без емодзі-спаму.';
    const user = `Ключове слово: ${seedKeyword || '-'}.
Ось текст допису користувача:
${postText.slice(0, 1200)}

Напиши змістовний, тактовний і короткий коментар, що додає цінність.`;

    try {
        const r = await openai.chat.completions.create({
            model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
            temperature: 0.5,
            messages: [{ role: 'system', content: system }, { role: 'user', content: user }]
        });
        const out = r.choices?.[0]?.message?.content?.trim() || '';
        return out.slice(0, 220) || null;
    } catch {
        return null;
    }
}

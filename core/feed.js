// core/feed.js
import { waitForAny, screenshotStep } from '../utils.js';

export function matchesKeywords(text, keywords = []) {
    const t = (text || '').toLowerCase();
    return keywords.some(k => t.includes(String(k || '').toLowerCase()));
}

export async function scrollAndReact(page, {
    rounds = 3,
    pause = 1200,
    keywords = [],
    doLike = true,
    doComment = false,
    commentText = '🔥'
} = {}) {
    await waitForAny(page, ['body'], { timeout: 8000, optional: false });
    const reacted = { liked: 0, commented: 0 };

    for (let r = 0; r < rounds; r++) {
        await page.evaluate(() => window.scrollBy({ top: window.innerHeight * 0.9, behavior: 'smooth' }));
        await page.waitForTimeout(pause);

        // знайдемо видимі пости та їхні кнопки
        const posts = await page.evaluate(() => {
            const arr = [];
            const blocks = document.querySelectorAll('article, div[role="article"], div.x78zum5.xdt5ytf');
            blocks.forEach((node) => {
                const rect = node.getBoundingClientRect();
                if (rect.bottom < 0 || rect.top > window.innerHeight) return;
                const txt = (node.innerText || '').trim();
                if (txt && txt.length > 30) {
                    const like = node.querySelector('[aria-label="Подобається"], [aria-label="Like"]') ? true : false;
                    const comment = node.querySelector('[aria-label="Коментувати"], [aria-label="Comment"]') ? true : false;
                    arr.push({ text: txt.slice(0, 2000), like, comment });
                }
            });
            return arr;
        });

        for (const p of posts) {
            if (!matchesKeywords(p.text, keywords)) continue;

            // лайк
            if (doLike && p.like) {
                try {
                    await page.evaluate((text) => {
                        const blocks = document.querySelectorAll('article, div[role="article"], div.x78zum5.xdt5ytf');
                        for (const node of blocks) {
                            const t = (node.innerText || '').trim();
                            if (t && t.includes(text.slice(0, 25))) {
                                const btn = node.querySelector('[aria-label="Подобається"], [aria-label="Like"]');
                                if (btn) { btn.click(); return true; }
                            }
                        }
                        return false;
                    }, p.text);
                    reacted.liked++;
                } catch { }
            }

            // комент
            if (doComment && p.comment) {
                try {
                    await page.evaluate((payload) => {
                        const { text, reply } = payload;
                        const blocks = document.querySelectorAll('article, div[role="article"], div.x78zum5.xdt5ytf');
                        for (const node of blocks) {
                            const t = (node.innerText || '').trim();
                            if (t && t.includes(text.slice(0, 25))) {
                                const btn = node.querySelector('[aria-label="Коментувати"], [aria-label="Comment"]');
                                if (btn) { btn.click(); }
                                break;
                            }
                        }
                    }, { text: p.text, reply: commentText });
                    await page.waitForTimeout(300);

                    const replyBox = await page.$('textarea, div[contenteditable="true"]');
                    if (replyBox) {
                        await replyBox.type(commentText, { delay: 10 });
                        await page.keyboard.press('Enter');
                        reacted.commented++;
                        await page.waitForTimeout(300);
                    }
                } catch { }
            }
        }
    }

    await screenshotStep(page, 'feed_after_engage');
    return reacted;
}

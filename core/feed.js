// core/feed.js
import { waitForAny, screenshotStep, nap } from '../utils.js';
import { THREADS_PROFILE_LINK, THREADS_COMPOSER_ANY } from '../constants/selectors.js';

export async function isOnThreadsFeed(page, expectedUser) {
    return await page
        .evaluate(({ PROFILE, COMPOSER, expectedUser }) => {
            const hasComposer = Array.from(document.querySelectorAll(COMPOSER))
                .some(el => /Що нового\?|What’s new\?|What's new\?/i.test(el.textContent || ''));
            const profile = document.querySelector(PROFILE);
            const href = profile?.getAttribute('href') || '';
            const userOk = expectedUser ? href.includes(`/${expectedUser}`) : true;
            return hasComposer && userOk;
        }, { PROFILE: THREADS_PROFILE_LINK, COMPOSER: THREADS_COMPOSER_ANY, expectedUser })
        .catch(() => false);
}

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
    commentText = '🔥',
    generateComment = null
} = {}) {
    await waitForAny(page, ['body'], { timeout: 8000, optional: false });
    const reacted = { liked: 0, commented: 0 };

    for (let r = 0; r < rounds; r++) {
        await page.evaluate(() => window.scrollBy({ top: window.innerHeight * 0.9, behavior: 'smooth' }));
        await nap(pause);

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
                    const reply = generateComment ? await generateComment(p.text) : commentText;
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
                    }, { text: p.text, reply });
                    await nap(300);

                    const replyBox = await page.$('textarea, div[contenteditable="true"]');
                    if (replyBox) {
                        await replyBox.type(reply, { delay: 10 });
                        await page.keyboard.press('Enter');
                        reacted.commented++;
                        await nap(300);
                    }
                } catch { }
            }
        }
    }

    await screenshotStep(page, 'feed_after_engage');
    return reacted;
}

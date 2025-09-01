// actions/search.follow.js
import { ensureThreadsReady } from '../core/login.js';
import { isOnThreadsFeed } from '../core/feed.js';
import { waitForAny, clickAny } from '../utils.js';
import { tryStep } from '../helpers/misc.js';

/**
 * Початок: головна стрічка Threads
 * Кінець: головна стрічка Threads
 *
 * Алгоритм:
 *  - Відкрити пошук
 *  - Ввести ключові слова (по черзі)
 *  - Відкрити декілька профілів, поставити 3–4 лайки та натиснути Follow
 *  - Повернутися на головну
 */
export async function run(page, {
    queries = ['підприємець', 'власник бізнесу', 'керівник', 'owner', 'entrepreneur', 'founder'],
    maxFollowsPerRun = 3,
    likesPerProfile = [3, 4], // діапазон
    timeout = 25000,
} = {}) {

    await tryStep('ensureThreadsReady', () => ensureThreadsReady(page), { page });


    await tryStep('open search', async () => {
        await clickAny(page, [
            '[aria-label="Search"]',
            'a[href*="/search"]',
            'button:has-text("Search")',
        ], { timeout: 6000, purpose: 'Кнопка пошуку' }).catch(() => { });

        await waitForAny(page, ['input[type="search"]', 'input[placeholder*="Search"]', 'input[placeholder*="Пошук"]'], {
            timeout: 8000, purpose: 'Поле пошуку'
        });
    }, { page });

    let follows = 0;

    for (const q of queries) {
        if (follows >= maxFollowsPerRun) break;
        await tryStep(`search.follow.${q}`, async () => {
            const input = await page.$('input[type="search"], input[placeholder*="Search"], input[placeholder*="Пошук"]');
            if (!input) return;
            await input.click({ clickCount: 3 }).catch(() => { });
            await input.type(q, { delay: 25 });
            await page.keyboard.press('Enter');
            await page.waitForTimeout(1200);

            const opened = await clickAny(page, [
                'a[href*="/@"]',
                'a[role="link"]:has(div)',
            ], { timeout: 5000, purpose: 'Відкрити профіль зі списку' }).then(() => true).catch(() => false);
            if (!opened) return;

            const [minL, maxL] = likesPerProfile;
            const toLike = Math.max(minL, Math.min(maxL, minL + Math.floor(Math.random() * (maxL - minL + 1))));
            for (let i = 0; i < toLike; i++) {
                await page.evaluate(() => window.scrollBy({ top: window.innerHeight * 0.8, behavior: 'smooth' }));
                await page.waitForTimeout(600);
                try {
                    await page.evaluate(() => {
                        const btn = document.querySelector('[aria-label="Подобається"], [aria-label="Like"]');
                        if (btn) btn.click();
                    });
                } catch { }
            }

            const followed = await clickAny(page, [
                'button:has-text("Follow")',
                'div[role="button"]:has-text("Follow")',
                'button:has-text("Підписатися")',
                'div[role="button"]:has-text("Підписатися")',
            ], { timeout: 4000, purpose: 'Follow' }).then(() => true).catch(() => false);
            if (followed) follows++;

            await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => { });
            await page.waitForTimeout(600);
            await page.goto('https://www.threads.com/', { waitUntil: 'domcontentloaded' }).catch(() => { });
        }, { page, context: { query: q } });
    }

    await tryStep('return home', () => page.goto('https://www.threads.com/', { waitUntil: 'domcontentloaded' }).catch(() => { }), { page });

    return { ok: true, follows };
}

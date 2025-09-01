// actions/search.follow.js
import { ensureThreadsReady } from '../core/login.js';
import { waitForAny, clickAny } from '../utils.js';

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
    IG_USER = 'ol.matsuk'
} = {}) {
    await ensureThreadsReady(page, timeout, { IG_USER });

    // Відкриваємо пошук
    await clickAny(page, [
        '[aria-label="Search"]',
        'a[href*="/search"]',
        'button:has-text("Search")',
    ], { timeout: 6000, purpose: 'Кнопка пошуку' }).catch(() => { });

    await waitForAny(page, ['input[type="search"]', 'input[placeholder*="Search"]', 'input[placeholder*="Пошук"]'], {
        timeout: 8000, purpose: 'Поле пошуку'
    });

    let follows = 0;

    for (const q of queries) {
        if (follows >= maxFollowsPerRun) break;

        // Ввести запит
        const input = await page.$('input[type="search"], input[placeholder*="Search"], input[placeholder*="Пошук"]');
        if (!input) break;
        await input.click({ clickCount: 3 }).catch(() => { });
        await input.type(q, { delay: 25 });
        await page.keyboard.press('Enter');
        await page.waitForTimeout(1200);

        // Відкрити перший релевантний профіль
        const opened = await clickAny(page, [
            'a[href*="/@"]',
            'a[role="link"]:has(div)',
        ], { timeout: 5000, purpose: 'Відкрити профіль зі списку' }).then(() => true).catch(() => false);
        if (!opened) continue;

        // 3–4 лайки довільним постам профілю
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

        // Підписатися
        const followed = await clickAny(page, [
            'button:has-text("Follow")',
            'div[role="button"]:has-text("Follow")',
            'button:has-text("Підписатися")',
            'div[role="button"]:has-text("Підписатися")',
        ], { timeout: 4000, purpose: 'Follow' }).then(() => true).catch(() => false);

        if (followed) follows++;

        // Назад до списку результатів
        await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => { });
        await page.waitForTimeout(600);

        // Назад на головну (щоб гарантовано закінчити на фіді)
        await page.goto('https://www.threads.net/', { waitUntil: 'domcontentloaded' }).catch(() => { });
    }

    // фінальне повернення на головну
    await page.goto('https://www.threads.net/', { waitUntil: 'domcontentloaded' }).catch(() => { });

    return { ok: true, follows };
}

// postThreads.js — оркестратор

import 'dotenv/config';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

import { launchBrowser, newPageWithCookies } from './core/browser.js';
import { loginInstagram } from './core/auth.js';
import { continueWithInstagramOnThreads } from './core/threadsBridge.js';
import { openComposer } from './core/composer.js';

import { run as runPost } from './actions/post.js';
import { run as runFind } from './actions/findEntrepreneurs.js';
import { run as runFeed, scrollPastSuggestionsIfPresent } from './actions/feedScan.js';

import { logStep, saveCookies, loadCookies } from './utils.js';

const argv = yargs(hideBin(process.argv))
    .option('action', { type: 'string', default: 'post', choices: ['post', 'find-entrepreneurs', 'feed-scan', 'skip-suggestions'] })
    .option('type', { type: 'string', choices: ['story', 'tip', 'news', 'humor'] })
    .option('text', { type: 'string' })
    .option('image', { type: 'string' })
    .option('timeout', { type: 'number', default: 22000 })
    .option('headless', { type: 'boolean', default: false })
    .option('otp', { type: 'string' })
    .parse();

const IG_USER = process.env.IG_USER || process.env.INSTAGRAM_USER;
const IG_PASS = process.env.IG_PASS || process.env.INSTAGRAM_PASS;
const HEADLESS = argv.headless ?? (process.env.HEADLESS === 'true');

if (!IG_USER || !IG_PASS) {
    console.error('[FATAL] IG_USER/IG_PASS не задані у .env'); process.exit(1);
}

(async () => {
    logStep('Старт бота постингу в Threads');
    const browser = await launchBrowser({ headless: HEADLESS });
    const page = await newPageWithCookies(browser);

    try {
        // 0) спробувати підвантажити куки до будь-яких дій
        await loadCookies(page, 'cookies_instagram.json').then(() => {
            console.log('[COOKIES] застосовані cookies_instagram.json (якщо існували)');
        }).catch(() => { });

        // 1) Завжди виконуємо логін до Instagram
        logStep('Перехід на instagram.com (логін)');
        await loginInstagram(page, argv.timeout, { user: IG_USER, pass: IG_PASS, otp: argv.otp });
        await saveCookies(page, 'cookies_instagram.json').catch(() => { });

        // 2) Threads SSO + вибір акаунта
        await continueWithInstagramOnThreads(page, argv.timeout, { IG_USER: IG_USER });

        // 3) ДІЇ
        if (argv.action === 'post') {
            const input = await openComposer(page, argv.timeout); // забезпечує відкриття попапа і фокус
            await runPost(page, { ...argv, composerHandle: input });
        } else if (argv.action === 'find-entrepreneurs') {
            await runFind(page, argv);
        } else if (argv.action === 'feed-scan') {
            await runFeed(page, argv);
        } else if (argv.action === 'skip-suggestions') {
            await scrollPastSuggestionsIfPresent(page);
        } else {
            throw new Error(`Невідомий action: ${argv.action}`);
        }

        // 4) зберігаємо cookies на виході
        await saveCookies(page, 'cookies_instagram.json').catch(() => { });

    } catch (err) {
        console.error('[ERROR]', err?.stack || err?.message || err);
        try { const ts = new Date().toISOString().replace(/[:.]/g, '-'); await page.screenshot({ path: `error_${ts}.png`, fullPage: true }); } catch { }
    } finally {
        // браузер спеціально НЕ закриваємо, щоб залишити сесію відкритою
        try { await saveCookies(page, 'cookies_instagram.json'); } catch { }
    }
})();

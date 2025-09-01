// postThreads.js — оркестратор

import 'dotenv/config';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

import { launchBrowser, newPageWithCookies, persistAndClose } from './core/browser.js';
import { loginInstagram } from './core/auth.js';
import { continueWithInstagramOnThreads } from './core/threadsBridge.js';
import { openComposer } from './core/composer.js';

import { run as runPost } from './actions/post.js';
import { run as runFind } from './actions/findEntrepreneurs.js';
import { run as runFeed, scrollPastSuggestionsIfPresent } from './actions/feedScan.js';

import { logStep, waitForAny, saveCookies, loadCookies } from './utils.js';

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

// перевірка сесії за cookies
async function isInstagramLoggedIn(page, timeout) {
    await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded' }).catch(() => { });
    const logged = await waitForAny(page, [
        'a[href*="/accounts/edit"]',
        'a[href*="/direct/inbox"]',
        'nav[role="navigation"]'
    ], { timeout: 4000, optional: true, purpose: 'Перевірка IG домашньої' });
    return !!logged;
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

        // 1) IG login тільки якщо справді потрібно
        const logged = await isInstagramLoggedIn(page, argv.timeout);
        if (!logged) {
            logStep('Перехід на instagram.com (логін)');
            await loginInstagram(page, argv.timeout, { user: IG_USER, pass: IG_PASS, otp: argv.otp });
            await saveCookies(page, 'cookies_instagram.json').catch(() => { });
        } else {
            console.log('[COOKIES] сесія валідна — логін пропущено');
        }

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
        await persistAndClose(browser, page);
    }
})();

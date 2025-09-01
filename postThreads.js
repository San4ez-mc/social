// postThreads.js — оркестратор

import 'dotenv/config';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

import { launchBrowser, newPageWithCookies } from './core/browser.js';
import { ensureThreadsReady } from './core/login.js';
import { openComposer } from './core/composer.js';

import { run as runPost } from './actions/post.js';
import { run as runFind } from './actions/findEntrepreneurs.js';
import { run as runFeed, scrollPastSuggestionsIfPresent } from './actions/feedScan.js';

import { logStep } from './utils.js';

const argv = yargs(hideBin(process.argv))
    .option('action', { type: 'string', default: 'post', choices: ['post', 'find-entrepreneurs', 'feed-scan', 'skip-suggestions', 'random'] })
    .option('type', { type: 'string', choices: ['story', 'tip', 'news', 'humor'] })
    .option('text', { type: 'string' })
    .option('image', { type: 'string' })
    .option('timeout', { type: 'number', default: 22000 })
    .option('headless', { type: 'boolean', default: false })
    .option('otp', { type: 'string' })
    .parse();

const HEADLESS = argv.headless ?? (process.env.HEADLESS === 'true');

(async () => {
    logStep('Старт бота постингу в Threads');
    const browser = await launchBrowser({ headless: HEADLESS });
    const page = await newPageWithCookies(browser);

    try {
        // 1) Авторизація та підготовка Threads
        await ensureThreadsReady(page);

        // 2) ДІЇ
        let action = argv.action;
        if (action === 'random') {
            const choices = ['post', 'find-entrepreneurs', 'feed-scan', 'skip-suggestions'];
            action = choices[Math.floor(Math.random() * choices.length)];
            logStep(`Випадково обрано дію: ${action}`);
        }

        if (action === 'post') {
            const input = await openComposer(page, argv.timeout); // забезпечує відкриття попапа і фокус
            await runPost(page, { ...argv, composerHandle: input });
        } else if (action === 'find-entrepreneurs') {
            await runFind(page, argv);
        } else if (action === 'feed-scan') {
            await runFeed(page, argv);
        } else if (action === 'skip-suggestions') {
            await scrollPastSuggestionsIfPresent(page);
        } else {
            throw new Error(`Невідомий action: ${action}`);
        }

    } catch (err) {
        console.error('[ERROR]', err?.stack || err?.message || err);
        try { const ts = new Date().toISOString().replace(/[:.]/g, '-'); await page.screenshot({ path: `error_${ts}.png`, fullPage: true }); } catch { }
    } finally {
        // браузер спеціально НЕ закриваємо, щоб залишити сесію відкритою
    }
})();

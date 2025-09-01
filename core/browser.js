// core/browser.js
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { loadCookies, saveCookies, logStep } from '../utils.js';

puppeteer.use(StealthPlugin());

/**
 * Запускає браузер Puppeteer з мінімально потрібними флагами.
 * @param {object} opts
 * @param {boolean} [opts.headless=false] - режим headless
 * @returns {Promise<import('puppeteer').Browser>}
 */
export async function launchBrowser({ headless = false } = {}) {
    const browser = await puppeteer.launch({
        headless,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--lang=uk-UA', '--start-fullscreen'],
        defaultViewport: null
    });
    return browser;
}

/**
 * Створює сторінку, підвантажує cookies Instagram (якщо є).
 * @param {import('puppeteer').Browser} browser
 * @returns {Promise<import('puppeteer').Page>}
 */
export async function newPageWithCookies(browser) {
    const page = await browser.newPage();
    await loadCookies(page, 'cookies_instagram.json').catch(() => { });
    // Wrap native page.click to log selector and current URL
    const origClick = page.click.bind(page);
    page.click = async (selector, options) => {
        try {
            logStep(`CLICK ${selector} @ ${page.url()}`);
        } catch { /* ignore logging errors */ }
        return origClick(selector, options);
    };

    // Also log navigations via page.goto
    const origGoto = page.goto.bind(page);
    page.goto = async (...args) => {
        const res = await origGoto(...args);
        try {
            logStep(`GOTO ${page.url()}`);
        } catch { /* ignore logging errors */ }
        return res;
    };

    return page;
}

/**
 * Зберігає cookies Instagram і закриває браузер.
 * @param {import('puppeteer').Browser} browser
 * @param {import('puppeteer').Page} page
 */
export async function persistAndClose(browser, page) {
    try {
        await saveCookies(page, 'cookies_instagram.json');
        logStep('Cookies Instagram збережено');
    } catch { }
    await browser.close().catch(() => { });
}

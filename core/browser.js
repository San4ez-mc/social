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
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--lang=uk-UA'],
        defaultViewport: { width: 1400, height: 900 }
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

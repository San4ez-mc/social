// core/browser.js
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { logStep } from '../utils.js';

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
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--lang=uk-UA', '--start-maximized'],
        defaultViewport: null
    });
    return browser;
}

/**
 * Створює сторінку без попереднього завантаження сторонніх cookies.
 * @param {import('puppeteer').Browser} browser
 * @returns {Promise<import('puppeteer').Page>}
 */
export async function newPageWithCookies(browser) {
    const page = await browser.newPage();
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

    // Track any navigation (including redirects) and show current URL in-page
    page.on('framenavigated', async frame => {
        if (frame === page.mainFrame()) {
            const url = frame.url();
            try { logStep(`NAVIGATED ${url}`); } catch { /* ignore logging errors */ }
            try {
                await page.evaluate(current => {
                    let box = document.getElementById('__nav_debug_box');
                    if (!box) {
                        box = document.createElement('div');
                        box.id = '__nav_debug_box';
                        Object.assign(box.style, {
                            position: 'fixed',
                            bottom: '0',
                            left: '0',
                            background: 'rgba(0,0,0,0.7)',
                            color: '#fff',
                            fontFamily: 'monospace',
                            fontSize: '12px',
                            padding: '2px 4px',
                            zIndex: '2147483647'
                        });
                        document.body.appendChild(box);
                    }
                    box.textContent = current;
                }, url).catch(() => { });
            } catch { /* ignore evaluate errors */ }
        }
    });

    return page;
}

// Функція збереження cookies не потрібна — цим опікується login.js

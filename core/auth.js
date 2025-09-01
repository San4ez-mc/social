// core/auth.js
import { waitForAny, logStep } from '../utils.js';

export function getIgCreds() {
    const user = (process.env.IG_USER || "").trim();
    const pass = (process.env.IG_PASS || "").trim();
    if (!user || !pass) throw new Error("[FATAL] IG_USER / IG_PASS відсутні у .env");
    return { user, pass };
}

export function getThreadsCreds() {
    const user = (process.env.THREADS_USERNAME || "").trim();
    const pass = (process.env.THREADS_PASSWORD || "").trim();
    if (!user || !pass) throw new Error("[FATAL] THREADS_USERNAME / THREADS_PASSWORD відсутні у .env");
    return { user, pass };
}

/**
 * Авторизація в Instagram. Функція переходить на форму логіну,
 * вводить передані облікові дані та очікує на появу домашньої сторінки
 * або інпуту 2FA. Після логіну браузер НЕ закривається.
 *
 * @param {import('puppeteer').Page} page
 * @param {number} timeout таймаут очікування елементів
 * @param {{user: string, pass: string, otp?: string}} creds
 */
export async function loginInstagram(page, timeout, { user, pass, otp } = {}) {
    logStep('Перехід на instagram.com/login');
    await page.goto('https://www.instagram.com/accounts/login/', { waitUntil: 'domcontentloaded' });

    await waitForAny(page, [
        'input[name="username"]',
        'input[name="password"]',
        'button[type="submit"]',
    ], { timeout, purpose: 'Форма логіну Instagram', optional: false });

    if (user) await page.type('input[name="username"]', user, { delay: 20 });
    if (pass) await page.type('input[name="password"]', pass, { delay: 20 });

    await page.click('button[type="submit"]').catch(() => { });

    await waitForAny(page, [
        'nav',
        'text=Home',
        'input[name="verificationCode"], input[name="code"]'
    ], { timeout: timeout * 2, purpose: 'Після логіну', optional: true });

    if (otp) {
        const codeInput = await page.$('input[name="verificationCode"], input[name="code"]');
        if (codeInput) {
            await codeInput.type(otp, { delay: 20 }).catch(() => { });
            await page.click('button[type="submit"], text=Confirm, text=Submit').catch(() => { });
            await waitForAny(page, ['nav', 'text=Home'], { timeout: timeout * 2, optional: true });
        }
    }

    logStep('Успішний логін Instagram (ймовірно)');
}

// core/threadsBridge.js
import { logStep, waitForAny, clickAny, clickByPartialText, handleDomFailure } from '../utils.js';

async function isThreadsAuthed(page) {
    const url = page.url();
    if (url.includes('threads.net') || url.includes('threads.com')) {
        const hasUi = await page.$('a[href*="/compose"], [aria-label="New thread"], textarea, div[contenteditable="true"], [aria-label="Post"]').catch(() => null);
        return !!hasUi;
    }
    return false;
}

async function pickIgAccountOnContinue(page, timeout, IG_USER) {
    logStep('На екрані "Continue to Threads" — вибираю акаунт');

    const clickedByText = await clickByPartialText(
        page,
        'button,[role="button"],a,li[role="button"],div[role="button"]',
        String(IG_USER || '').trim(),
        { timeout: Math.min(timeout, 6000) }
    ).catch(() => false);

    if (clickedByText) {
        logStep('Клік по картці акаунта (за текстом IG_USER)');
        return true;
    }

    const clickedFallback = await clickAny(page, [
        'div[role="button"]',
        'li[role="button"]',
        'button[role="button"]',
        'button'
    ], { timeout: Math.min(timeout, 6000), purpose: 'Картка акаунта' }).catch(() => false);

    return !!clickedFallback;
}

export async function continueWithInstagramOnThreads(page, timeout = 20000, { IG_USER } = {}) {
    logStep('Перехід на threads.net');
    await page.goto('https://www.threads.net/', { waitUntil: 'domcontentloaded' }).catch(() => { });
    if (!(page.url().includes('threads.net') || page.url().includes('threads.com'))) {
        await page.goto('https://www.threads.com/', { waitUntil: 'domcontentloaded' }).catch(() => { });
    }

    if (await isThreadsAuthed(page)) {
        logStep('Вже авторизований у Threads — пропускаю конект з IG');
        return;
    }

    let clicked = await clickAny(page, [
        'text=Continue with Instagram',
        'button:has-text("Continue with Instagram")',
        '[data-testid="ig-login"]',
    ], { timeout, purpose: 'Кнопка Continue with Instagram' }).then(() => true).catch(() => false);

    if (!clicked) {
        clicked = await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('div[role="button"],button'));
            const target = buttons.find(b => /Continue with Instagram/i.test(b.textContent || ''));
            if (target) {
                try {
                    target.scrollIntoView({ block: 'center', inline: 'center' });
                    target.click();
                    return true;
                } catch { return false; }
            }
            return false;
        }).catch(() => false);
    }

    if (!clicked) {
        const handle = await page.$('div[role="button"] >> text=Continue with Instagram').catch(() => null);
        if (handle) {
            const box = await handle.boundingBox().catch(() => null);
            if (box) {
                await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
                clicked = true;
            }
        }
    }

    if (!clicked) { try { await page.keyboard.press('Enter'); } catch { } }

    await Promise.race([
        waitForAny(page, [
            'text=Continue to Threads',
            'text=Back to Threads',
            'text=Log in to another Instagram account',
            'text=Continue',
            'text=Allow'
        ], { timeout: timeout * 2, optional: true, purpose: 'Екран продовження в Threads' }),
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout }).catch(() => { })
    ]);

    const pageContent = await page.content().catch(() => '');
    if (page.url().includes('instagram.com') && /Continue to Threads/i.test(pageContent)) {
        const picked = await pickIgAccountOnContinue(page, timeout, IG_USER);
        if (!picked) {
            await handleDomFailure(page, `На сторінці "Continue to Threads" не вдалося натиснути картку акаунта ${IG_USER}.`);
        }
    }

    await waitForAny(page, ['text=Not now', 'text=Continue', 'text=Allow'], { timeout, optional: true, purpose: 'Після конекту з IG' });
    await clickByPartialText(page, 'Not now').catch(() => { });
    await clickByPartialText(page, 'Continue').catch(() => { });
    await clickByPartialText(page, 'Allow').catch(() => { });

    if (!(page.url().includes('threads.net') || page.url().includes('threads.com'))) {
        await page.goto('https://www.threads.net/', { waitUntil: 'domcontentloaded' }).catch(() => { });
    }
}

export default continueWithInstagramOnThreads;

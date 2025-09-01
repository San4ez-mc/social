// core/threadsBridge.js
import { logStep, waitForAny, clickByText, clickByPartialText } from '../utils.js';

export async function continueWithInstagramOnThreads(page, timeout = 20000) {
    logStep('Перехід на threads.net');
    await page.goto('https://www.threads.net/', { waitUntil: 'domcontentloaded' }).catch(() => { });
    if (!(page.url().includes('threads.net') || page.url().includes('threads.com'))) {
        await page.goto('https://www.threads.com/login?hl=uk', { waitUntil: 'domcontentloaded' }).catch(() => { });
    }

    // Пошук та клік по "Continue with Instagram"
    let clicked = await page.$('text=Continue with Instagram').then(h => h ? h.click().then(() => true) : false).catch(() => false);

    if (!clicked) {
        clicked = await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('div[role="button"],button'));
            const target = buttons.find(b => /Continue with Instagram/i.test(b.textContent || ''));
            if (target) {
                target.click();
                return true;
            }
            return false;
        });
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

    await waitForAny(page, ['text=Not now', 'text=Continue', 'text=Allow'], { timeout, optional: true, purpose: 'Після конекту з IG' });
    await clickByPartialText(page, 'Not now').catch(() => { });
    await clickByText(page, 'Continue').catch(() => { });
    await clickByText(page, 'Allow').catch(() => { });

    if (!(page.url().includes('threads.net') || page.url().includes('threads.com'))) {
        await page.goto('https://www.threads.net/', { waitUntil: 'domcontentloaded' }).catch(() => { });
    }
}

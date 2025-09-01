// core/composer.js
import path from "node:path";
import { logStep } from "../helpers/logger.js";
import {
    clickAny,
    waitForAny,
    nap,
    handleDomFailure,
    typeLikeHuman,
} from "../utils.js";

/** Відкрити діалог композера Threads */
export async function openComposer(page, timeout = 8000) {
    logStep("Відкриваю композер Threads");
    await clickAny(page, [
        'text=What\u2019s new?',
        "text=What's new?",
        '[aria-label="What\u2019s new?"]',
        '[aria-label="What\'s new?"]',
        '[aria-label="New thread"]',
        'button[aria-label*="New"]',
        'a[href*="/compose"]',
        'text=New thread'
    ], { timeout, purpose: 'Відкрити композер' }).catch(() => { });

    await waitForAny(page, [
        'div[role="dialog"]',
        '[data-testid="composer-root"]'
    ], { timeout, optional: false, purpose: 'Діалог композера' });
}

/** Додати зображення, якщо воно задане */
async function attachImageIfAny(page, imagePath, timeout = 15000) {
    if (!imagePath) return;
    logStep(`Додаю зображення ${imagePath}`);
    const [fileChooser] = await Promise.all([
        page.waitForFileChooser({ timeout }).catch(() => null),
        clickAny(page, [
            'div[role="dialog"] input[type="file"]',
            'div[role="dialog"] [aria-label*="photo"]',
            'div[role="dialog"] button:has-text("Add photo")',
            'input[type="file"]',
            'button[aria-label*="Add photo"]',
            'text=Add photo'
        ], { timeout, purpose: 'Кнопка додати фото' }).catch(() => false)
    ]);
    if (fileChooser) {
        await fileChooser.accept([path.resolve(imagePath)]);
    } else {
        const fileInput = await page.$('div[role="dialog"] input[type="file"], input[type="file"]');
        if (fileInput) await fileInput.uploadFile(path.resolve(imagePath));
    }
}

/** Заповнити композер і натиснути Post */
export async function fillAndPost(page, { text = "", image = null, timeout = 20000 } = {}) {
    logStep("Заповнюю композер");

    const area = await waitForAny(page, [
        'div[role="dialog"] div[contenteditable="true"]',
        '[data-testid="composer-root"] div[contenteditable="true"]',
        'div[role="dialog"] textarea',
        '[data-testid="composer-root"] textarea'
    ], { timeout, optional: true, purpose: 'Поле вводу композера' });

    if (!area) {
        await handleDomFailure(page, 'Не знайшов поле вводу композера');
        throw new Error('Composer input not found');
    }

    await area.click().catch(() => { });
    await typeLikeHuman(area, text);

    await attachImageIfAny(page, image, timeout).catch(() => { });

    // Кнопка Post
    const posted = await clickAny(page, [
        'div[role="dialog"] button:has-text("Post")',
        'div[role="dialog"] [role="button"]:has-text("Post")',
        'div[role="dialog"] button:has-text("Опублікувати")',
        'div[role="dialog"] [role="button"]:has-text("Опублікувати")'
    ], { timeout: 12000, purpose: 'Кнопка Post' }).catch(() => false);

    if (!posted) {
        try {
            const isMac = (await page.evaluate(() => navigator.platform)).toLowerCase().includes('mac');
            await page.keyboard.down(isMac ? 'Meta' : 'Control');
            await page.keyboard.press('Enter');
            await page.keyboard.up(isMac ? 'Meta' : 'Control');
        } catch { /* ignore */ }
    }

    // Можливий діалог "Save to drafts?"
    await clickAny(page, [
        'text=Don\'t save',
        'text=Не зберігати'
    ], { timeout: 4000, purpose: 'Draft dialog' }).catch(() => { });

    await nap(500);
}

export default {
    openComposer,
    fillAndPost,
};


import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import OpenAI from 'openai'; // для генерації коментарів через ChatGPT
import { getCoachPlan, applyCoachPlan, logGptCommand } from './coach/coachAgent.js';
import {
    loadCookies,
    saveCookies,
    waitForAny,
    clickAny,
    clickByText,
    clickByPartialText,
    typeLikeHuman,
    nap,
    handleDomFailure,
    logStep,
    randInt,
    shuffle,
    slowScroll
} from './utils.js';
import { getPostTextFromOpenAI } from './contentProvider.js';
import {
    buildPromptForType,
    nextDayCounter,
    ENTREPRENEUR_KEYWORDS,
    BUSINESS_SEARCH_KEYWORDS,
    COMMENT_BANK
} from './prompts.js';

puppeteer.use(StealthPlugin());

/* ---------- CLI ---------- */
const argv = yargs(hideBin(process.argv))
    .option('action', { type: 'string', default: 'post', choices: ['post', 'find-entrepreneurs', 'feed-scan', 'skip-suggestions'], describe: 'Що робити: post | find-entrepreneurs | feed-scan | skip-suggestions' })
    .option('type', { type: 'string', choices: ['story', 'tip', 'news', 'humor'], describe: 'Тип посту: story|tip|news|humor' })
    .option('text', { type: 'string', describe: 'Готовий текст посту (інакше згенерує OpenAI за типом/промптом із коду)' })
    .option('image', { type: 'string', describe: 'Шлях до зображення (опц.)' })
    .option('timeout', { type: 'number', default: 22000, describe: 'Таймаут очікувань, мс' })
    .option('headless', { type: 'boolean', default: false, describe: 'Запуск у headless' })
    .option('otp', { type: 'string', describe: 'Код 2FA (якщо просить Instagram)' })
    .option('maxFollows', { type: 'number', default: 3, describe: 'Максимум підписок за один виклик (антиспам безпека)' })
    // нижче параметри, що були — лишаємо як є; commentMax переюзаємо у feed-scan
    .option('likeMin', { type: 'number', default: 5, describe: 'Мінімум лайків у engage-keywords (застаріло)' })
    .option('likeMax', { type: 'number', default: 20, describe: 'Максимум лайків у engage-keywords (застаріло)' })
    .option('commentMin', { type: 'number', default: 1, describe: 'Мінімум коментарів у engage-keywords (застаріло)' })
    .option('commentMax', { type: 'number', default: 6, describe: 'Максимум коментарів у feed-scan' })
    .option('scanScrolls', { type: 'number', default: 200, describe: 'Скільки прокруток зробити у feed-scan' })
    .strict()
    .parse();

const IG_USER = process.env.IG_USER || process.env.INSTAGRAM_USER;
const IG_PASS = process.env.IG_PASS || process.env.INSTAGRAM_PASS;
const HEADLESS = argv.headless ?? (process.env.HEADLESS === 'true');

/* ---------- OpenAI for comments ---------- */
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

if (!IG_USER || !IG_PASS) {
    console.error('[FATAL] Не задано IG_USER/IG_PASS у .env');
    process.exit(1);
}

/* ---------- Helpers specific to Threads flow ---------- */

async function loginInstagram(page, timeout) {
    logStep('Перехід на instagram.com/login');
    await page.goto('https://www.instagram.com/accounts/login/', { waitUntil: 'domcontentloaded' });
    await waitForAny(page, [
        'input[name="username"]',
        'input[name="password"]',
        'button[type="submit"]',
    ], { timeout, purpose: 'Форма логіну Instagram' }).catch(async (e) => {
        await handleDomFailure(page, 'Не знайшов форму логіну Instagram');
        throw e;
    });

    const userEl = await page.$('input[name="username"]');
    const passEl = await page.$('input[name="password"]');
    if (userEl && passEl) {
        logStep('Вводжу логін і пароль');
        await userEl.click({ clickCount: 3 });
        await typeLikeHuman(userEl, IG_USER);
        await passEl.click({ clickCount: 3 });
        await typeLikeHuman(passEl, IG_PASS);
    } else {
        await handleDomFailure(page, 'Не знайшов інпут логіну/паролю');
        throw new Error('Не знайшов інпут логіну/паролю');
    }

    await clickAny(page, ['button[type="submit"]', 'text/Log in', 'text=Увійти'], { timeout, purpose: 'Кнопка логіну' })
        .catch(async (e) => {
            await handleDomFailure(page, 'Не знайшов кнопку логіну');
            throw e;
        });

    await waitForAny(page, [
        'text=Turn on Notifications',
        'text=Save Info',
        'text=Save login info?',
        'a[role="link"][href*="/"]',
        'text=Home'
    ], { timeout: timeout * 2, optional: true, purpose: 'Після логіну' });

    const needsCode = !!(await page.$('input[name="verificationCode"], input[name="code"]'));
    if (needsCode) {
        logStep('Instagram просить код підтвердження (2FA). Очікую код...');
        const code = argv.otp || process.env.IG_OTP;
        if (code) {
            const codeEl = await page.$('input[name="verificationCode"], input[name="code"]');
            if (codeEl) {
                await typeLikeHuman(codeEl, code);
                await clickByText(page, 'Confirm').catch(() => { });
                await clickByText(page, 'Submit').catch(() => { });
            }
        } else {
            logStep('Очікування ручного введення коду 2FA у вікні браузера...');
            await waitForAny(page, ['text=Home', 'a[href*="/accounts/edit"]', 'text=Not now'], { timeout: timeout * 3, optional: true, purpose: 'Очікування завершення 2FA' });
        }
    }
    logStep('Успішний логін Instagram (ймовірно)');
}

/** Перевірити, що ми вже всередині Threads (авторизовані) */
async function isThreadsAuthed(page) {
    const url = page.url();
    if (url.includes('threads.net') || url.includes('threads.com')) {
        const hasUi = await page.$('a[href*="/compose"], [aria-label="New thread"], textarea, div[contenteditable="true"], [aria-label="Post"]').catch(() => null);
        return !!hasUi;
    }
    return false;
}

/** Клік по картці акаунта на екрані “Continue to Threads” */
async function pickIgAccountOnContinue(page, timeout) {
    logStep('На екрані "Continue to Threads" — вибираю акаунт');

    // 1) Прямий клік по елементу, що містить текст IG_USER
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

    // 2) Фолбек: клік по будь-якій клікабельній картці
    const clickedFallback = await clickAny(page, [
        'div[role="button"]',
        'li[role="button"]',
        'button[role="button"]',
        'button'
    ], { timeout: Math.min(timeout, 6000), purpose: 'Картка акаунта' }).catch(() => false);

    return !!clickedFallback;
}

/**
 * Threads login bridge (Instagram → Threads)
 *
 * Щоб екран "Continue to Threads" з вибором акаунта більше не з’являвся:
 *  1) Дозволь Instagram «Save login info?» (або збережи сесію вручну через cookies_instagram.json).
 *  2) Не виходь з акаунта Instagram у цьому профілі браузера між запусками скрипта.
 *  3) Не чищай cookies для instagram.com/threads.net між сесіями.
 *  4) Якщо екран усе ж з’явився — функція pickIgAccountOnContinue() клікне картку з IG_USER,
 *     а також є запасний план через CoachAgent, який підкаже куди натиснути.
 */
async function continueWithInstagramOnThreads(page, timeout) {
    logStep('Перехід на threads.net');
    await page.goto('https://www.threads.net/', { waitUntil: 'domcontentloaded' }).catch(() => { });
    if (!(page.url().includes('threads.net') || page.url().includes('threads.com'))) {
        await page.goto('https://www.threads.com/login?hl=uk', { waitUntil: 'domcontentloaded' }).catch(() => { });
    }

    if (await isThreadsAuthed(page)) {
        logStep('Вже авторизований у Threads — пропускаю конект з IG');
        return;
    }

    // 1) Базова спроба через наявні хелпери (було раніше)
    let clicked = await clickAny(page, [
        'text=Continue with Instagram',
        'button:has-text("Continue with Instagram")',
        '[data-testid="ig-login"]',
    ], { timeout, purpose: 'Кнопка Continue with Instagram' }).then(() => true).catch(() => false);

    // 2) Надійний фолбек — шукаємо саме div[role=button] зі спаном "Continue with Instagram"
    if (!clicked) {
        clicked = await page.evaluate(() => {
            // Знаходимо всі div[role="button"] і перевіряємо наявність span з потрібним текстом
            const buttons = Array.from(document.querySelectorAll('div[role="button"]'));
            const target = buttons.find(div => {
                const span = div.querySelector('span');
                const txt = (span?.innerText || span?.textContent || '').trim().toLowerCase();
                return txt === 'continue with instagram';
            });
            if (!target) return false;
            try {
                target.scrollIntoView({ block: 'center', inline: 'center' });
                (target as HTMLElement).click();
                return true;
            } catch { return false; }
        });
    }

    // 3) Ще один фолбек: клікаємо по центру елемента мишкою (на випадок, якщо .click() не тригерить)
    if (!clicked) {
        const handle = await page.$('div[role="button"] >> text=Continue with Instagram').catch(() => null);
        if (handle) {
            const box = await handle.boundingBox().catch(() => null);
            if (box) {
                await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
                await page.mouse.down();
                await page.mouse.up();
                clicked = true;
            }
        }
    }

    // 4) Останній шанс: якщо елемент у фокусі — натиснути Enter
    if (!clicked) {
        try { await page.keyboard.press('Enter'); } catch { /* ignore */ }
    }

    // Чекаємо або появу екрана продовження, або зміну/завантаження сторінки
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

    const pageContent = await page.content();
    if (page.url().includes('instagram.com') && /Continue to Threads/i.test(pageContent)) {
        const picked = await pickIgAccountOnContinue(page, timeout);
        if (!picked) {
            const plan = await getCoachPlan(page, `На сторінці "Continue to Threads" не вдалося натиснути картку акаунта ${IG_USER}.`);
            await logGptCommand('threads-continue-account-pick', plan);
            await applyCoachPlan(page, plan);
        }
    }

    await waitForAny(page, ['text=Not now', 'text=Continue', 'text=Allow'], { timeout, optional: true, purpose: 'Після конекту з IG' });
    await clickByPartialText(page, 'Not now').catch(() => { });
    await clickByText(page, 'Continue').catch(() => { });
    await clickByText(page, 'Allow').catch(() => { });

    if (!(page.url().includes('threads.net') || page.url().includes('threads.com'))) {
        await page.goto('https://www.threads.net/', { waitUntil: 'domcontentloaded' }).catch(() => { });
    }
}


/** Відкрити композер (клік по “What’s new?” або кнопці створення) */
async function openComposer(page, timeout) {
    logStep('Відкриваю композер (What’s new? / New thread)');
    const openedViaTile = await clickAny(page, [
        'text=What’s new?',
        "text=What's new?",
        '[aria-label="What’s new?"]',
        '[aria-label="What\'s new?"]',
    ], { timeout: Math.min(timeout, 8000), purpose: 'Плитка What’s new?' }).catch(() => false);

    if (!openedViaTile) {
        await clickAny(page, [
            '[aria-label="New thread"]',
            'button[aria-label*="New"]',
            'a[href*="/compose"]',
            'text=New thread'
        ], { timeout: Math.min(timeout, 8000), purpose: 'Створення нового треду' }).catch(() => false);
    }

    const dialog = await waitForAny(page, [
        'div[role="dialog"]',
        '[data-testid="composer-root"]'
    ], { timeout, optional: false, purpose: 'Діалог композера' });

    return !!dialog;
}

/** Знайти активну кнопку Post в діалозі */
async function waitAndClickActivePost(page, timeout = 12000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
        const clicked = await page.evaluate(() => {
            const dialog = document.querySelector('div[role="dialog"], [data-testid="composer-root"]');
            if (!dialog) return false;
            const candidates = Array.from(dialog.querySelectorAll('button,[role="button"],[aria-label]'));
            const btn = candidates.find(el => {
                const txt = (el.innerText || el.textContent || '').trim().toLowerCase();
                const aria = (el.getAttribute('aria-label') || '').trim().toLowerCase();
                const isPost = txt === 'post' || aria === 'post' || txt.includes('post');
                const disabled = el.getAttribute('aria-disabled') === 'true' || el.hasAttribute('disabled');
                return isPost && !disabled && el.offsetParent !== null;
            });
            if (btn) { (btn).click(); return true; }
            return false;
        });
        if (clicked) return true;
        await nap(250);
    }
    return false;
}

/** Заповнити і опублікувати пост у діалозі композера */
async function fillAndPost(page, text, timeout) {
    logStep('Заповнюю текст треду (у діалозі)');
    const area = await (async () => {
        const candidates = [
            'div[role="dialog"] div[contenteditable="true"]',
            '[data-testid="composer-root"] div[contenteditable="true"]',
            'div[role="dialog"] textarea',
            '[data-testid="composer-root"] textarea'
        ];
        for (const sel of candidates) {
            const el = await page.$(sel);
            if (el) return el;
        }
        return null;
    })();

    if (!area) {
        await handleDomFailure(page, 'Не знайшов поле вводу тексту у діалозі композера');
        const plan = await getCoachPlan(page, 'Не можу знайти поле вводу тексту у попапі Threads.');
        await logGptCommand('threads-compose-area', plan);
        await applyCoachPlan(page, plan);
    } else {
        await area.click();
        await typeLikeHuman(area, text);
    }

    logStep('Натискаю Post');
    let posted = await waitAndClickActivePost(page, 12000);

    if (!posted) {
        try {
            const isMac = (await page.evaluate(() => navigator.platform)).toLowerCase().includes('mac');
            await page.keyboard.down(isMac ? 'Meta' : 'Control');
            await page.keyboard.press('Enter');
            await page.keyboard.up(isMac ? 'Meta' : 'Control');
            posted = true;
        } catch { /* ignore */ }
    }

    const maybeDrafts = await waitForAny(page, ['text=Save to drafts?', 'text=Don\'t save', 'text=Save'], { timeout: 4000, optional: true, purpose: 'Drafts dialog' });
    if (maybeDrafts) {
        await clickByText(page, "Don't save").catch(() => { });
        await nap(400);
        if (!posted) {
            posted = await waitAndClickActivePost(page, 8000);
        }
    }

    if (!posted) {
        await handleDomFailure(page, 'Не зміг натиснути Post');
        const plan = await getCoachPlan(page, 'Текст у композері введено, але не можу натиснути Post/Share у Threads.');
        await logGptCommand('threads-post', plan);
        await applyCoachPlan(page, plan);
    }

    await waitForAny(page, [
        'text=Your thread was posted',
        'text=View',
        'text=Undo'
    ], { timeout: timeout * 2, optional: true, purpose: 'Після публікації' });
}

/** Додати зображення (опційно) */
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

/* ===== Нові/оновлені допоміжні процедури ===== */

/** ПІДСИЛЕНО: лайк знайде і кнопки, і SVG з aria-label="Like" + клікабельний предок */
async function likeVisiblePosts(page, howMany = 5) {
    let liked = 0;

    async function clickLikeCandidates(maxToLike) {
        return await page.evaluate((max) => {
            const isVisible = el => !!el && el.offsetParent !== null;

            // 1) Кнопки/ролі з aria/text Like
            const btns = Array.from(document.querySelectorAll('button,[role="button"]'))
                .filter(b => {
                    const t = (b.innerText || '').toLowerCase();
                    const a = (b.getAttribute('aria-label') || '').toLowerCase();
                    const liked = a.includes('unlike') || t.includes('liked');
                    const like = a === 'like' || t === 'like' || t.includes('like');
                    return isVisible(b) && like && !liked;
                });

            // 2) SVG-іконки Like → підіймаємось до клікабельного предка
            const svgs = Array.from(document.querySelectorAll('svg[aria-label="Like"]'))
                .map(svg => {
                    let cur = svg;
                    for (let i = 0; i < 6 && cur; i++) {
                        if (cur.tagName === 'BUTTON' || cur.getAttribute('role') === 'button') return cur;
                        cur = cur.parentElement;
                    }
                    return svg.closest('button,[role="button"]') || svg.parentElement;
                })
                .filter(isVisible);

            const candidates = [];
            const seen = new Set();
            for (const el of [...btns, ...svgs]) {
                if (!el) continue;
                if (seen.has(el)) continue;
                seen.add(el);
                candidates.push(el);
            }

            let done = 0;
            for (const el of candidates) {
                try { el.click(); done++; } catch { }
                if (done >= max) break;
            }
            return done;
        }, Math.min(3, howMany - liked));
    }

    for (let round = 0; round < 12 && liked < howMany; round++) {
        liked += await clickLikeCandidates(howMany - liked);
        await slowScroll(page, 1, 500);
    }
    logStep(`Поставлено лайків: ${liked}/${howMany}`);
    return liked;
}

/** ДІСТАТИ ЛИШЕ ТЕКСТ ПОСТА (БЕЗ HTML) + ЖОРСТКЕ ОГРАНИЧЕННЯ ДОВЖИНИ */
async function extractCurrentPostText(page) {
    const maxLen = 2000; // жорсткий ліміт символів
    const raw = await page.evaluate((MAX) => {
        const take = (s) => (s || '').replace(/\s+/g, ' ').trim();
        const container = document.querySelector('div[role="dialog"]') || document;

        const blocks = [];
        const articleNodes = Array.from(container.querySelectorAll('article, div[role="article"]'));
        for (const n of articleNodes) {
            const t = take(n.innerText || n.textContent || '');
            if (t) blocks.push(t);
        }
        const textNodes = Array.from(container.querySelectorAll('div[dir="auto"], div[data-lexical-editor], p'));
        for (const n of textNodes) {
            const t = take(n.innerText || n.textContent || '');
            if (t) blocks.push(t);
        }
        if (blocks.length === 0) {
            const paras = Array.from(container.querySelectorAll('p, span')).map(n => take(n.innerText || n.textContent || ''));
            paras.sort((a, b) => b.length - a.length);
            if (paras[0]) blocks.push(paras[0]);
        }
        blocks.sort((a, b) => b.length - a.length);
        let text = blocks[0] || '';
        text = text.replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
        if (text.length > MAX) text = text.slice(0, MAX).replace(/\s+\S*$/, '').trim();
        return text;
    }, maxLen);

    let safe = (raw || '').replace(/\s+/g, ' ').trim();
    if (safe.length > 2000) safe = safe.slice(0, 2000).replace(/\s+\S*$/, '').trim();
    return safe;
}

/** Згенерувати розумний короткий коментар через OpenAI (вхід — ТІЛЬКИ ТЕКСТ) */
async function generateSmartCommentForPost(postText, seedKeyword = '') {
    try {
        let safeText = (postText || '').replace(/\s+/g, ' ').trim();
        if (safeText.length > 2000) safeText = safeText.slice(0, 2000).replace(/\s+\S*$/, '').trim();

        const sys = [
            'Ти пишеш дуже короткі, доречні коментарі українською до постів у Threads.',
            'Стиль: доброзичливо, по ділі, без повчань, 1-2 речення, жодних хештегів.',
            'Не повторюй текст поста, дай мікроінсайт або уточнююче запитання.',
            'Уникай кліше на кшталт "круто", "дякую за пост".',
            'Довжина до 220 символів.'
        ].join(' ');
        const user = `Ось чистий текст поста (без HTML):\n---\n${safeText}\n---\nКлючове слово (необов’язково): ${seedKeyword || '(нема)'}\nЗгенеруй 1 доречний коментар. Формат: чистий текст.`;

        await logGptCommand('smart-comment-request', { role: 'system', content: sys }, { role: 'user', content: user });

        const resp = await openai.chat.completions.create({
            model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
            messages: [
                { role: 'system', content: sys },
                { role: 'user', content: user }
            ],
            temperature: 0.6
        });

        let txt = resp.choices?.[0]?.message?.content?.trim() || '';
        txt = txt.replace(/\s+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/^["“”]|["“”]$/g, '').trim();
        if (txt.length > 220) txt = txt.slice(0, 220).replace(/\s+\S*$/, '').trim();

        await logGptCommand('smart-comment-response', { text: txt });
        return txt || null;
    } catch (e) {
        console.log('[OPENAI ERR] Не вдалося згенерувати коментар:', e.message);
        return null;
    }
}

/** Допоміжна: обчислення серійного № для tip від 01.09.2025 (1 вересня — №1) */
function tipSerialNumber(dateInput = new Date()) {
    const startUTC = Date.UTC(2025, 8, 1); // 1 вересня 2025 (місяці 0-based)
    const d = new Date(dateInput);
    const todayUTC = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
    const diff = Math.floor((todayUTC - startUTC) / 86400000) + 1;
    return Math.max(1, diff);
}

/** Відкрити пошук та повернути інпут (для find-entrepreneurs лишаємо як було) */
async function openSearch(page, timeout) {
    logStep('Відкриваю пошук Threads');
    await clickAny(page, [
        '[aria-label="Search"]',
        'a[href*="/search"]',
        'button[aria-label*="Search"]',
        'input[placeholder*="Search"]'
    ], { timeout, purpose: 'Кнопка пошуку' }).catch(() => false);

    const input = await page.$('input[placeholder*="Search"], input[type="search"]');
    if (input) return input;

    await waitForAny(page, [
        'input[placeholder*="Search"]',
        'input[type="search"]',
        'textarea[placeholder*="Search"]'
    ], { timeout, purpose: 'Поле пошуку' });

    return await page.$('input[placeholder*="Search"], input[type="search"], textarea[placeholder*="Search"]');
}

async function typeSearchQuery(page, q) {
    const input = await page.$('input[placeholder*="Search"], input[type="search"], textarea[placeholder*="Search"]');
    if (!input) return false;
    await input.click({ clickCount: 3 }).catch(() => { });
    await input.type(q, { delay: 50 });
    await nap(400);
    await page.keyboard.press('Enter').catch(() => { });
    await clickByPartialText(page, 'Search').catch(() => { });
    await nap(800);
    return true;
}

async function commentOnSomePosts(page, howMany = 1, bank = COMMENT_BANK, seedKeyword = '') {
    let commented = 0;
    for (let round = 0; round < 10 && commented < howMany; round++) {
        const opened = await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('a[href*="/post/"]'));
            for (const a of links) {
                const visible = (a).offsetParent !== null;
                if (visible) { (a).click(); return true; }
            }
            return false;
        });
        if (!opened) { await slowScroll(page, 1, 400); continue; }

        await waitForAny(page, [
            'textarea[placeholder*="Reply"]',
            'div[contenteditable="true"]',
            '[aria-label="Reply"]',
            'button:has-text("Reply")'
        ], { timeout: 8000, optional: true, purpose: 'Реплай-область' });

        const postText = await extractCurrentPostText(page);
        let text = await generateSmartCommentForPost(postText, seedKeyword);
        if (!text) {
            text = bank[randInt(0, bank.length - 1)];
        }

        const typed = await page.evaluate((t) => {
            const area = document.querySelector('textarea[placeholder*="Reply"], div[contenteditable="true"]');
            if (!area) return false;
            if (area.tagName.toLowerCase() === 'div') {
                area.focus();
                const evt = new InputEvent('input', { bubbles: true });
                area.textContent = t;
                area.dispatchEvent(evt);
            } else {
                (area).focus();
                (area).value = t;
                const evt = new Event('input', { bubbles: true });
                area.dispatchEvent(evt);
            }
            return true;
        }, text);

        if (!typed) {
            const plan = await getCoachPlan(page, 'Не знайшов поле для коментаря/реплая у пості Threads.');
            await applyCoachPlan(page, plan);
        }

        await clickByText(page, 'Post').catch(() => { });
        await nap(700);
        commented++;

        await page.keyboard.press('Escape').catch(() => { });
        await nap(300);
    }
    logStep(`Залишено коментарів: ${commented}/${howMany}`);
    return commented;
}

async function openFirstProfileFromResults(page, timeout) {
    const clicked = await clickAny(page, [
        'a[href*="/@"]',
        'a[href*="/profile"]',
        'div[role="button"] a[href*="/"]'
    ], { timeout: Math.min(timeout, 6000), purpose: 'Перший профіль з результатів' }).catch(() => false);

    if (!clicked) {
        const plan = await getCoachPlan(page, 'Не вдалось клікнути на профіль у результатах пошуку Threads.');
        await applyCoachPlan(page, plan);
    }
}

async function followOnProfileAndLikeSome(page, maxLikesEach = randInt(3, 4)) {
    await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button,[role="button"]'));
        const followBtn = btns.find(b => {
            const t = (b.innerText || '').toLowerCase();
            const a = (b.getAttribute('aria-label') || '').toLowerCase();
            return (t.includes('follow') || a.includes('follow')) && !t.includes('following');
        });
        if (followBtn) (followBtn).click();
    });
    await nap(600);
    await likeVisiblePosts(page, maxLikesEach);
}

/* ===== Нове: довгий скрол фіду + автокоментарі за ключовими словами ===== */

async function openNextFeedPost(page, seen = new Set()) {
    const href = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a[href*="/post/"]'))
            .map(a => a.getAttribute('href'))
            .filter(Boolean);
        const uniq = Array.from(new Set(links));
        return uniq.find(h => h.includes('/post/')) || null;
    });
    if (!href || seen.has(href)) return null;
    seen.add(href);
    try {
        await clickAny(page, [`a[href="${href}"]`], { timeout: 4000, purpose: 'Відкриття поста з фіду' });
        await waitForAny(page, ['div[role="dialog"]', '[aria-label="Reply"]'], { timeout: 6000, optional: true, purpose: 'Деталі поста' });
        return href;
    } catch { return null; }
}

async function scrollPastSuggestionsIfPresent(page) {
    const found = await page.evaluate(() => {
        const hasClose = !!document.querySelector('svg[aria-label="Close"]');
        const hasFollow = Array.from(document.querySelectorAll('div[role="button"],button'))
            .some(b => ((b.innerText || '').toLowerCase().includes('follow')));
        return hasClose && hasFollow;
    });
    if (found) {
        await page.evaluate(() => window.scrollBy(0, window.innerHeight * 0.9));
        return true;
    }
    return false;
}

async function feedScanAndComment(page, { scrolls = 200, commentLimit = 6, keywords = [] } = {}) {
    const SEEN = new Set();
    let commented = 0;

    const KEYSET = (keywords.length ? keywords : [...BUSINESS_SEARCH_KEYWORDS, ...ENTREPRENEUR_KEYWORDS])
        .map(k => k.toLowerCase());

    for (let i = 0; i < scrolls && commented < commentLimit; i++) {
        const href = await openNextFeedPost(page, SEEN);

        if (href) {
            const postText = await extractCurrentPostText(page);
            const low = (postText || '').toLowerCase();
            const matched = KEYSET.find(k => low.includes(k));

            if (matched) {
                let text = await generateSmartCommentForPost(postText, matched);
                if (text) {
                    const typed = await page.evaluate((t) => {
                        const area = document.querySelector('textarea[placeholder*="Reply"], div[contenteditable="true"]');
                        if (!area) return false;
                        if (area.tagName.toLowerCase() === 'div') {
                            area.focus(); area.textContent = t;
                            area.dispatchEvent(new InputEvent('input', { bubbles: true }));
                        } else {
                            area.focus(); area.value = t;
                            area.dispatchEvent(new Event('input', { bubbles: true }));
                        }
                        return true;
                    }, text);

                    if (typed) {
                        await clickByText(page, 'Post').catch(() => { });
                        await nap(500);
                        commented++;
                    }
                }
            }

            await page.keyboard.press('Escape').catch(() => { });
            await nap(250);
        }

        await scrollPastSuggestionsIfPresent(page);
        await slowScroll(page, 1, 300);
    }
    logStep(`feed-scan: коментарів опубліковано ${commented}/${commentLimit}`);
}

/* ===== Основні сценарії ===== */

async function doActionPost(page, timeout) {
    await openComposer(page, timeout);

    let postText = argv.text;
    if (!postText) {
        const type = argv.type || 'story';

        // Формуємо промпти локально під твої вимоги (news, tip, humor),
        // для інших типів лишаємо штатний buildPromptForType.
        let day;
        let prompt;

        if (type === 'tip') {
            day = tipSerialNumber(new Date());
            prompt = [
                `Почни з рядка: "порада від бізнес консультанта №${day} — " (саме так, малими літерами).`,
                'Далі: одна не директивна порада у формі короткої розповіді/замітки (без наказових форм).',
                'Додай 1 приклад застосування + 1 мʼяке запитання наприкінці.',
                'Мова — українська. Без хештегів і кліше. Ліміт 420 символів.'
            ].join(' ');
        } else if (type === 'news') {
            prompt = [
                'Зроби коротку реальну новину зі світу українського бізнесу + дуже лаконічний коментар.',
                'Фокус: новини останніх 48 годин з українських джерел.',
                'Приклади: Економічна правда, Forbes Україна, НВ Бізнес, Liga.Бізнес, Мінфін, AIN.UA, dev.ua, DOU (про бізнес), офіційні пресрелізи.',
                'У кінці вкажи джерело та дату у дужках, напр.: (Економічна правда, 28.08).',
                'Без посилань і без вигаданих назв. Якщо немає впевненості — поверни рівно: NEED_SOURCE.',
                'Формат: один блок чистого тексту, до 420 символів.'
            ].join(' ');
        } else if (type === 'humor') {
            prompt = [
                'Короткий бізнес-гумор для Threads: міні-сцена/діалог/каламбур або іронія.',
                '1–3 короткі абзаци, без токсичності та хейту. Фінально — мʼякий «гачок» (риторичне запитання/іронічна репліка).',
                'Мова — українська. До 420 символів. Без хештегів.'
            ].join(' ');
        } else {
            prompt = buildPromptForType(type, {});
        }

        logStep(`Запитую текст посту у OpenAI (type=${type}${day ? `, day=${day}` : ''})`);
        postText = await getPostTextFromOpenAI(prompt, { type, day });
        await logGptCommand('post-text', { role: 'user', prompt }, { role: 'assistant', content: postText });

        // Ретрай для news, якщо прийшов NEED_SOURCE
        if (type === 'news' && /^NEED_SOURCE$/i.test((postText || '').trim())) {
            logStep('NEED_SOURCE → повторний запит новини з фокусом на українські джерела');
            const retryPrompt = [
                'Обери 1 свіжу (≤48 год) бізнес-новину з українських джерел (Економічна правда, Forbes Україна, НВ Бізнес, Liga.Бізнес, Мінфін, AIN.UA, dev.ua, DOU) та стисни її у 2–3 речення.',
                'Додай 1 короткий авторський коментар.',
                'У дужках в кінці обовʼязково вкажи джерело+дату (напр.: (Forbes Україна, 29.09)).',
                'Без посилань. Якщо не впевнений у фактах — NEED_SOURCE. До 420 символів.'
            ].join(' ');
            postText = await getPostTextFromOpenAI(retryPrompt, { type: 'news' });
        }

        // Форсуємо префікс для tip, якщо LLM проігнорував
        if (type === 'tip' && day) {
            const need = `порада від бізнес консультанта №${day}`;
            const low = (postText || '').trim().toLowerCase();
            if (!low.startsWith(need)) {
                postText = `порада від бізнес консультанта №${day} — ` + (postText || '').trim();
            }
            if (postText.length > 420) {
                postText = postText.slice(0, 420).replace(/\s+\S*$/, '').trim();
            }
        }
    }

    if (argv.image) await attachImageIfAny(page, argv.image);

    await fillAndPost(page, postText, timeout);

    logStep('✅ Пост опубліковано');
    try {
        await page.screenshot({ path: 'success_screenshot.png', fullPage: true });
        console.log('[DEBUG] Збережено success_screenshot.png');
    } catch { }

    // Після публікації — агресивніший скрол + більше лайків (нативна активність)
    await nap(800);
    await slowScroll(page, randInt(3, 5), 450);
    await likeVisiblePosts(page, randInt(5, 8));
}

async function doActionFindEntrepreneurs(page, timeout) {
    logStep('Запускаю find-entrepreneurs');
    await openSearch(page, timeout);

    const keys = shuffle(ENTREPRENEUR_KEYWORDS).slice(0, randInt(3, 6));
    const maxFollows = Math.max(1, Math.min(argv.maxFollows, 4)); // м’яко: 3–4 підписки за виклик

    let followsDone = 0;
    for (const k of keys) {
        if (followsDone >= maxFollows) break;
        logStep(`Пошук профілів за: ${k}`);
        await typeSearchQuery(page, k);

        await nap(1200);
        await openFirstProfileFromResults(page, timeout);
        await waitForAny(page, ['[aria-label="Back"]', 'button:has-text("Follow")'], { timeout: 8000, optional: true, purpose: 'Перехід у профіль' });

        await followOnProfileAndLikeSome(page, randInt(3, 4));
        followsDone++;

        await page.keyboard.press('Alt+ArrowLeft').catch(() => { });
        await nap(600);
    }
    logStep(`Готово: підписок зроблено ${followsDone}/${maxFollows}.`);
}

/* Нові екшени відповідно до правок */

async function doActionFeedScan(page, timeout) {
    logStep('Запускаю feed-scan (довгий скрол фіду + автокоменти за ключовими словами)');
    await page.goto('https://www.threads.net/', { waitUntil: 'domcontentloaded' }).catch(() => { });
    await feedScanAndComment(page, { scrolls: argv.scanScrolls, commentLimit: argv.commentMax });
}

async function doActionSkipSuggestions(page) {
    logStep('Сканую сторінку на предмет блоку рекомендацій, автоскролю вниз якщо знайду...');
    const acted = await scrollPastSuggestionsIfPresent(page);
    logStep(acted ? 'Знайшов блок → прокрутив' : 'Блок не знайдено');
}

/* ---------- Main ---------- */
(async () => {
    const browser = await puppeteer.launch({
        headless: HEADLESS,
        args: ['--no-sandbox', '--disable-gpu', '--lang=uk-UA']
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 900 });

    logStep('Старт бота постингу в Threads');

    const cookiesLoaded = await loadCookies(page, 'cookies_instagram.json');
    if (cookiesLoaded) {
        logStep('Куки Instagram завантажені, перевіряю сесію');
        await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded' });
    }

    if (!cookiesLoaded || (await page.url()).includes('/accounts/login')) {
        await loginInstagram(page, argv.timeout);
        await saveCookies(page, 'cookies_instagram.json');
        logStep('Cookies Instagram збережено');
    }

    await continueWithInstagramOnThreads(page, argv.timeout);

    if (!(await isThreadsAuthed(page))) {
        await nap(1500);
    }

    if (argv.action === 'post') {
        await doActionPost(page, argv.timeout);
    } else if (argv.action === 'find-entrepreneurs') {
        await doActionFindEntrepreneurs(page, argv.timeout);
    } else if (argv.action === 'feed-scan') {
        await doActionFeedScan(page, argv.timeout);
    } else if (argv.action === 'skip-suggestions') {
        await doActionSkipSuggestions(page);
    }

    await nap(1000);
    await browser.close();
})().catch(async (err) => {
    console.error(`[ERROR] ${err?.stack || err}`);
    try {
        const when = new Date().toISOString().replace(/[:.]/g, '-');
        // eslint-disable-next-line no-undef
        await page?.screenshot?.({ path: `error_${when}.png`, fullPage: true });
    } catch { }
    process.exitCode = 1;
});

import fs from 'fs/promises';
import path from 'path';

/** ===== Логування кроків ===== */
const STEPS_LOG = path.resolve('logs/steps.log');
async function ensureLogsDir() {
    try { await fs.mkdir(path.dirname(STEPS_LOG), { recursive: true }); } catch { }
}
export async function logStepAsync(message) {
    await ensureLogsDir();
    const line = `[${new Date().toISOString()}] ${message}\n`;
    await fs.appendFile(STEPS_LOG, line, 'utf8').catch(() => { });
    console.log(`[STEP] ${message}`);
}
export function logStep(message) { logStepAsync(message); }

/** Універсальна пауза */
export const nap = (ms) => new Promise(res => setTimeout(res, ms));

/** Рандомні утиліти */
export const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
export const shuffle = (arr) => arr.map(v => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map(([, v]) => v);

/** Очікування будь-якого селектора (+ підтримка text=/text= і :has-text()) */
export async function waitForAny(page, selectors, { timeout = 10000, visible = true, optional = true, purpose = '' } = {}) {
    const start = Date.now();

    // Пошук видимого елемента за ТОЧНИМ текстом (без XPath, крос-версійно)
    async function queryByTextExact(txt) {
        const handle = await page.evaluateHandle((needle, wantVisible) => {
            const take = s => (s || '').replace(/\s+/g, ' ').trim();
            const nNeedle = take(needle);
            const nodes = Array.from(document.querySelectorAll('button,[role="button"],a,div,span'));
            const el = nodes.find(n => take(n.innerText || n.textContent) === nNeedle && (!wantVisible || n.offsetParent !== null));
            return el || null;
        }, txt.trim(), visible).catch(() => null);
        const el = handle?.asElement?.() || null;
        if (!el && handle) { try { await handle.dispose(); } catch { } }
        return el;
    }

    // Пошук видимого елемента за ЧАСТКОВИМ текстом (без XPath)
    async function queryByTextContains(txt) {
        const handle = await page.evaluateHandle((needle, wantVisible) => {
            const norm = s => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
            const p = norm(needle);
            const nodes = Array.from(document.querySelectorAll('button,[role="button"],a,div,span'));
            const el = nodes.find(n => norm(n.innerText || n.textContent).includes(p) && (!wantVisible || n.offsetParent !== null));
            return el || null;
        }, txt.trim(), visible).catch(() => null);
        const el = handle?.asElement?.() || null;
        if (!el && handle) { try { await handle.dispose(); } catch { } }
        return el;
    }

    while (Date.now() - start <= timeout) {
        for (const rawSel of selectors) {
            const sel = (rawSel || '').toString();

            // Підтримка Playwright-подібних селекторів `text=...` і `text/...`
            if (sel.startsWith('text=') || sel.startsWith('text/')) {
                const needle = sel.slice(5);
                const h = await queryByTextExact(needle);
                if (h) { if (purpose) logStep(`✔ Знайшов: ${purpose} (${sel})`); return h; }
                continue;
            }
            // Підтримка псевдо `:has-text("...")`
            const m = sel.match(/:has-text\("([^"]+)"\)/);
            if (m) {
                const needle = m[1];
                const h = await queryByTextContains(needle);
                if (h) { if (purpose) logStep(`✔ Знайшов: ${purpose} (${sel})`); return h; }
                continue;
            }

            // Звичайний CSS
            try {
                const h = await page.waitForSelector(sel, { timeout: 400, visible });
                if (h) { if (purpose) logStep(`✔ Знайшов: ${purpose} (${sel})`); return h; }
            } catch { /* keep looping */ }
        }
        await nap(120);
    }
    if (!optional) throw new Error(`Не знайшов потрібний елемент: ${purpose || selectors.join(', ')}`);
    return null;
}

/** Клік по ПЕРШОМУ доступному селектору зі списку */
export async function clickAny(page, selectors, { timeout = 8000, purpose = '' } = {}) {
    const h = await waitForAny(page, selectors, { timeout, optional: true, visible: true, purpose });
    if (!h) return false;
    await h.click().catch(() => { });
    await nap(200);
    return true;
}

/** Клік по точному тексту
 *  Сигнатури:
 *   - clickByText(page, text)
 *   - clickByText(page, cssTags, text)
 */
export async function clickByText(page, a, b, { timeout = 8000 } = {}) {
    const tags = (b === undefined) ? 'button,[role="button"],a,div,span' : a;
    const text = (b === undefined) ? a : b;

    const ok = await page.evaluate(({ tags, text }) => {
        const take = (s) => (s || '').replace(/\s+/g, ' ').trim();
        const t = take(text);
        const nodes = Array.from(document.querySelectorAll(tags));
        for (const n of nodes) {
            if (take(n.innerText) === t && n.offsetParent !== null) { n.click(); return true; }
        }
        return false;
    }, { tags, text });

    if (!ok) await nap(timeout);
    return ok;
}

/** Клік по частковому збігу тексту
 *  Сигнатури:
 *   - clickByPartialText(page, partial)
 *   - clickByPartialText(page, cssTags, partial)
 */
export async function clickByPartialText(page, a, b, { timeout = 8000 } = {}) {
    const tags = (b === undefined) ? 'button,[role="button"],a,div,span' : a;
    const partial = (b === undefined) ? a : b;

    const ok = await page.evaluate(({ tags, partial }) => {
        const norm = (s) => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
        const p = norm(partial);
        const nodes = Array.from(document.querySelectorAll(tags));
        for (const n of nodes) {
            if (norm(n.innerText).includes(p) && n.offsetParent !== null) { n.click(); return true; }
        }
        return false;
    }, { tags, partial });

    if (!ok) await nap(timeout);
    return ok;
}

/** Повільний скрол стрічки */
export async function slowScroll(page, steps = 3, pause = 700) {
    for (let i = 0; i < steps; i++) {
        await page.evaluate(() => { window.scrollBy(0, Math.round(window.innerHeight * 0.8)); });
        await nap(pause);
    }
}

/** Кукіси */
export async function loadCookies(page, pathFile = 'cookies.json') {
    try {
        const buf = await fs.readFile(pathFile, 'utf8');
        const cookies = JSON.parse(buf);
        if (Array.isArray(cookies) && cookies.length) {
            await page.setCookie(...cookies);
            return true;
        }
        return false;
    } catch { return false; }
}

export async function saveCookies(page, pathFile = 'cookies.json') {
    try {
        const cookies = await page.cookies();
        await fs.mkdir(path.dirname(pathFile), { recursive: true });
        await fs.writeFile(pathFile, JSON.stringify(cookies, null, 2), 'utf8');
        return true;
    } catch { return false; }
}

/** Поле пошуку (для людей) */
export async function typeSearchQuery(page, q) {
    return await page.evaluate((q) => {
        const take = (s) => (s || '').replace(/\s+/g, ' ').trim();
        const input = document.querySelector('input[placeholder*="Search"], input[type="search"]');
        if (!input) return false;
        input.focus();
        input.value = '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.value = take(q);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
    }, q);
}

/** === Додано: мʼяке оброблення DOM-провалів (щоб не падати) === */
export async function handleDomFailure(page, message) {
    try {
        logStep(`⚠️ DOM failure: ${message}`);
        const when = new Date().toISOString().replace(/[:.]/g, '-');
        await fs.mkdir('logs', { recursive: true }).catch(() => { });
        await page.screenshot({ path: `logs/domfail_${when}.png`, fullPage: true }).catch(() => { });
    } catch { /* ignore */ }
}

/** === Додано: "людський" набір у поле === */
export async function typeLikeHuman(elHandle, text, { minDelay = 25, maxDelay = 60 } = {}) {
    const delay = randInt(minDelay, maxDelay);
    try {
        await elHandle.type(text, { delay });
    } catch {
        // fallback по-символьно, якщо .type недоступний
        for (const ch of String(text)) {
            await elHandle.type(ch, { delay: randInt(minDelay, maxDelay) }).catch(() => { });
        }
    }
}

export async function screenshotStep(page, name) {
    try {
        const dir = path.resolve('screens');
        await fs.mkdir(dir, { recursive: true });
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        const file = path.join(dir, `${ts}_${name}.png`);
        await page.screenshot({ path: file, fullPage: true });
        console.log(`[SCREENSHOT] saved ${file}`);
    } catch (err) {
        console.warn('[SCREENSHOT] failed', err?.message || err);
    }
}

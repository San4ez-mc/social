// core/login.js
import fs from "node:fs";
import path from "node:path";
import {
    logStep,
    logError,
    screenshot as takeShot,
} from "../helpers/logger.js";
import { tryStep } from "../helpers/misc.js";
import { getThreadsCreds } from "./auth.js";
import {
    THREADS_LOGIN_USER_INPUT,
    THREADS_LOGIN_PASS_INPUT,
    THREADS_LOGIN_SUBMIT,
    THREADS_PROFILE_LINK,
    THREADS_COMPOSER_ANY,
    COOKIES_THREADS_PATH,
} from "../constants/selectors.js";

/* ========= утиліти ========= */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitUrlHas(page, substr, timeout = 30000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
        if ((page.url() || "").includes(substr)) return true;
        await sleep(200);
    }
    return false;
}
async function waitUrlNot(page, substr, timeout = 30000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
        if (!((page.url() || "").includes(substr))) return true;
        await sleep(200);
    }
    return false;
}
async function retry(fn, tries = 3, delays = [500, 1000, 2000]) {
    let lastErr;
    for (let i = 0; i < tries; i++) {
        try { return await fn(); }
        catch (e) { lastErr = e; if (i < tries - 1) await sleep(delays[i] || 1000); }
    }
    throw lastErr;
}
/* ========= cookies ========= */
async function setCookies(page, cookies) {
    const client = await page.target().createCDPSession();
    await client.send("Network.setCookies", { cookies });
}
async function getAllCookies(page) {
    const client = await page.target().createCDPSession();
    const { cookies } = await client.send("Network.getAllCookies");
    return cookies || [];
}
async function loadCookies(page) {
    try {
        if (fs.existsSync(COOKIES_THREADS_PATH)) {
            const t = JSON.parse(fs.readFileSync(COOKIES_THREADS_PATH, "utf8"));
            if (Array.isArray(t) && t.length) {
                await setCookies(page, t);
                logStep(`Cookies threads loaded (${t.length})`);
            }
        }
    } catch (e) { logError(`threads cookies load failed: ${e?.message}`); }
}
async function saveCookies(page) {
    try {
        const all = await getAllCookies(page);
        const forThreads = all.filter(c => /threads\.(net|com)$/i.test((c.domain || "").replace(/^\./, "")));
        fs.writeFileSync(COOKIES_THREADS_PATH, JSON.stringify(forThreads, null, 2));
        logStep("Cookies saved (threads)");
    } catch (e) { logError(`cookies save failed: ${e?.message}`); }
}

/* ========= helpers ========= */
async function isThreadsAuthorized(page) {
    return await page.evaluate((PROFILE, SEL_COMPOSER) => {
        const hasComposer = Array.from(document.querySelectorAll(SEL_COMPOSER))
            .some(el => /Що нового\?|What’s new\?|What's new\?/i.test(el.textContent || ""));
        const hasProfile = !!document.querySelector(PROFILE);
        const postBtn = Array.from(document.querySelectorAll('button,[role="button"]'))
            .some(b => /Опублікувати|Post/i.test(b.textContent || ""));
        return hasComposer || (hasProfile && postBtn);
    }, THREADS_PROFILE_LINK, THREADS_COMPOSER_ANY).catch(() => false);
}


async function fillThreadsLoginForm(page, user, pass) {
    if (!user || !pass) {
        console.log('[fillThreadsLoginForm] missing creds', { user, pass });
        return false;
    }
    const uSel = THREADS_LOGIN_USER_INPUT;
    const pSel = THREADS_LOGIN_PASS_INPUT;
    const sSel = THREADS_LOGIN_SUBMIT;
    console.log('[fillThreadsLoginForm] selectors', { uSel, pSel, sSel });
    const u = await page.$(uSel).catch(() => null);
    const p = await page.$(pSel).catch(() => null);
    console.log('[fillThreadsLoginForm] inputs found', { u: !!u, p: !!p });
    if (!u || !p) {
        console.log('[fillThreadsLoginForm] missing input element');
        return false;
    }

    await page.focus(uSel).catch(() => { });
    await page.keyboard.down('Control').catch(() => { });
    await page.keyboard.press('A').catch(() => { });
    await page.keyboard.up('Control').catch(() => { });
    await page.type(uSel, user, { delay: 20 }).catch(() => { });

    await page.focus(pSel).catch(() => { });
    await page.keyboard.down('Control').catch(() => { });
    await page.keyboard.press('A').catch(() => { });
    await page.keyboard.up('Control').catch(() => { });
    await page.type(pSel, pass, { delay: 20 }).catch(() => { });

    await takeShot(page, 'threads_login_filled');

    console.log('[fillThreadsLoginForm] search button using', sSel);
    const [loginBtn] = await page.$x(sSel).catch(() => []);
    if (!loginBtn) {
        console.log('[fillThreadsLoginForm] login button not found');
        return false;
    }
    const btnHtml = await page.evaluate(el => el.outerHTML, loginBtn).catch(() => null);
    console.log('[fillThreadsLoginForm] loginBtn html:', btnHtml);

    await page.evaluate(el => {
        el.dataset.prevOutline = el.style.outline || '';
        el.style.outline = '3px solid red';
    }, loginBtn);
    await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => { }),
        page.evaluate(el => {
            const prev = el.dataset.prevOutline;
            el.click();
            el.style.outline = prev;
        }, loginBtn)
    ]);

    await loginBtn.dispose();

    await takeShot(page, 'threads_login_submit');
    return true;
}



export async function ensureThreadsReady(page, opts = {}) {
    const { user: threadsUser, pass: threadsPass } = getThreadsCreds();

    page.setDefaultTimeout(20000);
    page.setDefaultNavigationTimeout(30000);

    await tryStep("INIT: preload cookies", () => loadCookies(page), { page });

    await tryStep("Go to Threads login", async () => {
        const loginUrl = 'https://www.threads.com/login?hl=uk';
        await retry(async () => {
            let resp = await page.goto(loginUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
            const status = resp?.status();
            if (status === 500 || status === 505) {
                await page.goto('https://www.threads.com', { waitUntil: "domcontentloaded", timeout: 30000 });
                resp = await page.goto(loginUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
            }
        });
        await takeShot(page, "login_loaded");
    }, { page });

    const already = await tryStep("Check threads auth", () => isThreadsAuthorized(page), { page });
    if (already) {
        logStep("Вже авторизовані на Threads");
        await takeShot(page, "threads_already_ready");
        return;
    }

    await tryStep("threads login", () => fillThreadsLoginForm(page, threadsUser, threadsPass), { page });

    if ((page.url() || "").includes("/login")) {
        logStep("URL все ще /login, повторюю вхід");
        await tryStep("threads login retry", () => fillThreadsLoginForm(page, threadsUser, threadsPass), { page });
        await sleep(1000);
    }

    await tryStep("Очікую завантаження фіду Threads…", () => waitUrlNot(page, "/login", 45000), { page });

    if ((page.url() || "").includes("/login")) {
        logStep("Після очікування все ще на /login");
        await takeShot(page, "threads_not_authorized");
        const e = new Error("Threads: після логіну залишилися на сторінці логіну.");
        e.keepOpen = true;
        throw e;
    }

    const until = Date.now() + 70000;
    while (Date.now() < until) {
        if (await isThreadsAuthorized(page)) {
            await takeShot(page, "threads_ready");
            logStep("Threads готовий (авторизовано, є «Що нового?»)");
            break;
        }
        await sleep(500);
    }

    if (!(await isThreadsAuthorized(page))) {
        const dom = await page.content();
        fs.writeFileSync(path.resolve("коди сторінок", "threads_not_authorized.html"), dom);
        await takeShot(page, "threads_not_authorized");
        const e = new Error("Threads: не бачу авторизованої головної (композер/Опублікувати/аватар).");
        e.keepOpen = true;
        throw e;
    }

    await tryStep("save cookies", () => saveCookies(page), { page });
}

export default {
    "login.test": async ({ page, user }) => ensureThreadsReady(page, { user }),
};

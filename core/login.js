// core/login.js
import fs from "node:fs";
import path from "node:path";
import {
    logStep,
    logError,
    screenshot as takeShot,
} from "../helpers/logger.js";
import { consultAndExecute } from "../coach/coachAgent.js";
import { getIgCreds } from "./auth.js";
import {
    THREADS_HOME_URLS,
    THREADS_LOGIN_ANCHOR,
    THREADS_LOGIN_BUTTON_TEXT,
    THREADS_CONTINUE_WITH_IG,
    THREADS_PROFILE_LINK,
    THREADS_COMPOSER_ANY,
    IG_LOGIN_FORM,
    IG_USER_INPUT,
    IG_PASS_INPUT,
    IG_SUBMIT_BTN,
    COOKIES_THREADS_PATH,
    COOKIES_IG_PATH,
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
async function retry(fn, tries = 3, delays = [500, 1000, 2000]) {
    let lastErr;
    for (let i = 0; i < tries; i++) {
        try { return await fn(); }
        catch (e) { lastErr = e; if (i < tries - 1) await sleep(delays[i] || 1000); }
    }
    throw lastErr;
}
async function clickHandle(page, handle) {
    if (!handle) throw new Error("clickHandle: empty handle");
    const el = handle.asElement ? handle.asElement() : null;
    if (el && el.click) return el.click();
    return page.evaluate((node) => node && node.click && node.click(), handle);
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
    try {
        if (fs.existsSync(COOKIES_IG_PATH)) {
            const ig = JSON.parse(fs.readFileSync(COOKIES_IG_PATH, "utf8"));
            if (Array.isArray(ig) && ig.length) {
                await setCookies(page, ig);
                logStep(`Cookies instagram loaded (${ig.length})`);
            }
        }
    } catch (e) { logError(`instagram cookies load failed: ${e?.message}`); }
}
async function saveCookies(page) {
    try {
        const all = await getAllCookies(page);
        const forThreads = all.filter(c => /threads\.(net|com)$/i.test((c.domain || "").replace(/^\./, "")));
        const forIg = all.filter(c => /instagram\.com$/i.test((c.domain || "").replace(/^\./, "")));
        fs.writeFileSync(COOKIES_THREADS_PATH, JSON.stringify(forThreads, null, 2));
        fs.writeFileSync(COOKIES_IG_PATH, JSON.stringify(forIg, null, 2));
        logStep("Cookies saved (threads & instagram)");
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

/** На головній Threads — вхід на /login */
async function clickLoginEntryOnHome(page) {
    logStep("Шукаю вхід на /login на головній…");

    let handle = await page.$(THREADS_LOGIN_ANCHOR);

    if (!handle) {
        handle = await page.evaluateHandle((reSource) => {
            const re = new RegExp(reSource, "i");
            const nodes = Array.from(document.querySelectorAll('[role="button"],button,a,div,span'));
            const isVisible = (el) => {
                const r = el.getBoundingClientRect();
                const cs = getComputedStyle(el);
                return r.width > 4 && r.height > 4 && cs.visibility !== "hidden" && cs.display !== "none";
            };
            return nodes.find(n => n.textContent && re.test(n.textContent) && isVisible(n)) || null;
        }, THREADS_LOGIN_BUTTON_TEXT.source).catch(() => null);
    }

    if (!handle) {
        const dom = await page.content();
        fs.writeFileSync(path.resolve("коди сторінок", "threads_home_missing_login.html"), dom);
        const shot = await takeShot(page, "coach_login_entry");
        const goal = "Find and click login/SSO button on Threads home to navigate to /login";
        const candidates = { tried: [THREADS_LOGIN_ANCHOR, "role=button + login text"] };
        const coach = await consultAndExecute({
            page, stage: "threads.loginEntry", message: "Login entry not found",
            goal, screenshotPath: shot, dom, candidates
        });
        if (!coach.ok) {
            const e = new Error("Не знайшов лінк/кнопку входу на /login на головній Threads (coach failed).");
            e.keepOpen = true; e.coach = coach; throw e;
        }
        return; // Коуч вже клікнув і, ймовірно, був навігейт
    }

    await takeShot(page, "before_click_login_entry");
    await Promise.all([
        page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => { }),
        clickHandle(page, handle).catch(() => { }),
    ]);
    await takeShot(page, "after_click_login_entry");
}

/** На /login — клік по «Продовжити з Instagram» */
async function clickContinueWithInstagramOnLogin(page) {
    logStep("На /login: шукаю «Продовжити з Instagram»…");
    await retry(async () => await page.waitForSelector(THREADS_CONTINUE_WITH_IG, { visible: true }));
    let sso = await page.$(THREADS_CONTINUE_WITH_IG);

    if (!sso) {
        sso = await page.evaluateHandle((reSource, sel) => {
            const re = new RegExp(reSource, "i");
            const nodes = Array.from(document.querySelectorAll(`${sel},[role="button"],a,button,div,span`));
            const isVisible = (el) => {
                const r = el.getBoundingClientRect();
                const cs = getComputedStyle(el);
                return r.width > 4 && r.height > 4 && cs.visibility !== "hidden" && cs.display !== "none";
            };
            return nodes.find(n => (((n.textContent || "").match(re)) || n.matches(sel)) && isVisible(n)) || null;
        }, THREADS_LOGIN_BUTTON_TEXT.source, THREADS_CONTINUE_WITH_IG).catch(() => null);
    }

    if (!sso) {
        const dom = await page.content();
        fs.writeFileSync(path.resolve("коди сторінок", "threads_login_missing_sso.html"), dom);
        const shot = await takeShot(page, "missing_continue_with_instagram");
        const goal = "Find and click 'Continue with Instagram' button to start SSO";
        const candidates = { tried: [THREADS_CONTINUE_WITH_IG, "role=button + 'Continue with Instagram' text"] };
        const coach = await consultAndExecute({
            page, stage: "threads.sso", message: "Continue-with-Instagram button not found",
            goal, screenshotPath: shot, dom, candidates
        });
        if (!coach.ok) {
            const e = new Error("На /login не знайшов «Продовжити з Instagram» (coach failed).");
            e.keepOpen = true; e.coach = coach; throw e;
        }
        return;
    }

    await takeShot(page, "before_click_sso");
    await Promise.all([
        page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => { }),
        clickHandle(page, sso).catch(() => { }),
    ]);
    await takeShot(page, "after_click_sso");
}

export async function login(page, opts = {}) {
    const { user: igUser, pass } = getIgCreds();
    const wantedUser = opts.user || igUser || process.env.THREADS_USER || "ol.matsuk";

    page.setDefaultTimeout(20000);
    page.setDefaultNavigationTimeout(30000);

    logStep("INIT: preload cookies");
    await loadCookies(page);

    // 1) Перехід на Threads
    logStep("Go to Threads (uk)");
    await retry(async () => {
        for (const url of THREADS_HOME_URLS) {
            try { await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 }); return; }
            catch { }
        }
        throw new Error("Threads home not reachable");
    });
    await takeShot(page, "home_loaded");

    // Якщо вже авторизовані — фініш
    if (await isThreadsAuthorized(page)) {
        logStep("Вже авторизовані на Threads");
        await takeShot(page, "threads_already_ready");
        return;
    }

    // 2) Вхід на /login (головна)
    await clickLoginEntryOnHome(page);

    // 3) На /login — SSO
    await clickContinueWithInstagramOnLogin(page);

    // 4) Instagram
    await waitUrlHas(page, "instagram.com", 25000);

    const tEnd = Date.now() + 70000;
    while (Date.now() < tEnd) {
        const url = page.url() || "";

        // (а) Вибір акаунта
        const chosen = await page.evaluate((nick) => {
            const btns = Array.from(document.querySelectorAll('div[role="button"], a[role="button"], button'));
            const t = btns.find(b => (b.textContent || "").trim().toLowerCase().includes(nick.toLowerCase()));
            if (t) { t.scrollIntoView({ block: "center" }); t.click(); return true; }
            return false;
        }, igUser).catch(() => false);

        if (chosen) {
            logStep(`Вибрав акаунт: ${igUser}`);
            await waitUrlHas(page, "threads.", 45000);
            break;
        }

        // (б) Форма логіну IG
        const hasForm = await page.$(IG_LOGIN_FORM);
        if (hasForm) {
            if (!igUser || !pass) {
                const e = new Error("IG_USER / IG_PASS не задані для логіну в Instagram.");
                e.keepOpen = true;
                throw e;
            }
            logStep("Instagram login form found — typing creds");

            await page.focus(IG_USER_INPUT).catch(() => { });
            await page.keyboard.down("Control").catch(() => { });
            await page.keyboard.press("A").catch(() => { });
            await page.keyboard.up("Control").catch(() => { });
            await page.type(IG_USER_INPUT, igUser, { delay: 20 });

            await page.focus(IG_PASS_INPUT).catch(() => { });
            await page.keyboard.down("Control").catch(() => { });
            await page.keyboard.press("A").catch(() => { });
            await page.keyboard.up("Control").catch(() => { });
            await page.type(IG_PASS_INPUT, pass, { delay: 20 });

            await takeShot(page, "ig_login_filled");

            await Promise.all([
                page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => { }),
                page.click(IG_SUBMIT_BTN).catch(async () => {
                    await page.evaluate(() => {
                        const btn = Array.from(document.querySelectorAll('button,[role="button"]'))
                            .find(b => /log in|увійти/i.test(b.textContent || ""));
                        if (btn) btn.click();
                    });
                }),
            ]);

            await takeShot(page, "ig_login_submit");
            await waitUrlHas(page, "threads.", 45000);
            break;
        }

        if (/threads\.(net|com)/i.test(url)) break; // вже редіректимося назад
        await sleep(300);
    }

    // 5) Перевірка фіду
    logStep("Очікую повернення у Threads…");
    await waitUrlHas(page, "threads.", 45000);

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

    // 6) Cookies
    await saveCookies(page);
}

export default {
    "login.test": async ({ page, user }) => login(page, { user }),
};

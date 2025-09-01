// core/login.js
import fs from "node:fs";
import path from "node:path";
import {
    logStep,
    logError,
    screenshot as takeShot,
} from "../helpers/logger.js";
import { consultAndExecute } from "../coach/coachAgent.js";
import { tryStep } from "../helpers/misc.js";
import { getIgCreds, getThreadsCreds } from "./auth.js";
import {
    THREADS_LOGIN_ENTRY_TEXT,
    THREADS_LOGIN_BUTTON_TEXT,
    THREADS_LOGIN_USER_INPUT,
    THREADS_LOGIN_PASS_INPUT,
    THREADS_LOGIN_SUBMIT,
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
    return page.evaluate(node => node && node.click && node.click(), handle).catch(() => { });
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

/** На /login — клік по «Продовжити з Instagram» */

async function findSsoButton(page) {
    let sso = await page.$(THREADS_CONTINUE_WITH_IG).catch(() => null);
    let btn = null;

    if (!sso) {
        btn = (await page.evaluateHandle(() => {
            const node = document.evaluate(
                '//div[@role="button"]//svg[@aria-label="Instagram"]',
                document,
                null,
                XPathResult.FIRST_ORDERED_NODE_TYPE,
                null
            ).singleNodeValue;
            return node?.closest('div[role="button"]') || null;
        }).catch(() => null))?.asElement();
        console.log('Trying XPath //div[@role="button"]//svg[@aria-label="Instagram"]:', Boolean(btn));
        if (btn) {

            await page.evaluate((el) => {
                el.style.outline = '3px solid red';
                setTimeout(() => { el.style.outline = ''; }, 20000);
            }, btn);
            await sleep(20000);

            sso = btn;
        }
    }

    if (!sso) {
        btn = (await page.evaluateHandle(() => {
            const node = document.evaluate(
                '//div[@role="button"]//span[normalize-space(text())="Продовжити з Instagram"]',
                document,
                null,
                XPathResult.FIRST_ORDERED_NODE_TYPE,
                null
            ).singleNodeValue;
            return node?.closest('div[role="button"]') || null;
        }).catch(() => null))?.asElement();
        console.log('Trying XPath //div[@role="button"]//span[normalize-space(text())="Продовжити з Instagram"]:', Boolean(btn));
        if (btn) {

            await page.evaluate((el) => {
                el.style.outline = '3px solid red';
                setTimeout(() => { el.style.outline = ''; }, 20000);
            }, btn);
            await sleep(20000);

            sso = btn;
        }
    }

    if (!sso) {
        btn = (await page.evaluateHandle(() => {
            const node = document.evaluate(
                '//div[@role="button"]//span[contains(text(), "Продовжити з Instagram")]',
                document,
                null,
                XPathResult.FIRST_ORDERED_NODE_TYPE,
                null
            ).singleNodeValue;
            return node?.closest('div[role="button"]') || null;
        }).catch(() => null))?.asElement();
        console.log('Trying XPath //div[@role="button"]//span[contains(text(), "Продовжити з Instagram")]:', Boolean(btn));
        if (btn) {

            await page.evaluate((el) => {
                el.style.outline = '3px solid red';
                setTimeout(() => { el.style.outline = ''; }, 20000);
            }, btn);
            await sleep(20000);

            sso = btn;
        }
    }

    if (!sso) {
        btn = (await page.evaluateHandle(() => {
            const node = Array.from(document.querySelectorAll('div[role="button"] span'))
                .find(el => el.textContent && el.textContent.includes('Продовжити з Instagram'));
            return node?.closest('div[role="button"]') || null;
        }).catch(() => null))?.asElement();
        console.log('Trying CSS div[role="button"] span + text includes:', Boolean(btn));
        if (btn) {

            await page.evaluate((el) => {
                el.style.outline = '3px solid red';
                setTimeout(() => { el.style.outline = ''; }, 20000);
            }, btn);
            await sleep(20000);

            sso = btn;
        }
    }

    if (!sso) {
        btn = (await page.evaluateHandle(() => {
            const node = document.evaluate(
                '//div[contains(@class,"x1i10hfl") and @role="button"]',
                document,
                null,
                XPathResult.FIRST_ORDERED_NODE_TYPE,
                null
            ).singleNodeValue;
            return node;
        }).catch(() => null))?.asElement();
        console.log('Trying XPath //div[contains(@class,"x1i10hfl") and @role="button"]:', Boolean(btn));
        if (btn) {

            await page.evaluate((el) => {
                el.style.outline = '3px solid red';
                setTimeout(() => { el.style.outline = ''; }, 20000);
            }, btn);
            await sleep(20000);

            sso = btn;
        }
    }

    if (!sso) {
        btn = (await page.evaluateHandle(() => {
            const node = document.evaluate(
                '//div[@role="button"]//*[contains(text(),"Instagram")]',
                document,
                null,
                XPathResult.FIRST_ORDERED_NODE_TYPE,
                null
            ).singleNodeValue;
            return node?.closest('div[role="button"]') || null;
        }).catch(() => null))?.asElement();
        console.log('Trying XPath //div[@role="button"]//*[contains(text(),"Instagram")]:', Boolean(btn));
        if (btn) {

            await page.evaluate((el) => {
                el.style.outline = '3px solid red';
                setTimeout(() => { el.style.outline = ''; }, 20000);
            }, btn);
            await sleep(20000);

            sso = btn;
        }
    }

    if (!sso) {
        btn = (await page.evaluateHandle((reSource, sel) => {
            const re = new RegExp(reSource, 'i');
            const nodes = Array.from(document.querySelectorAll(`${sel},[role="button"],a,button,div,span`));
            const isVisible = (el) => {
                const r = el.getBoundingClientRect();
                const cs = getComputedStyle(el);
                return r.width > 4 && r.height > 4 && cs.visibility !== 'hidden' && cs.display !== 'none';
            };
            return nodes.find(n => (((n.textContent || '').match(re)) || n.matches(sel)) && isVisible(n));
        }, THREADS_LOGIN_BUTTON_TEXT.source, THREADS_CONTINUE_WITH_IG).catch(() => null))?.asElement();
        console.log("Trying role=button + 'Continue with Instagram' text:", Boolean(btn));
        if (btn) {

            await page.evaluate((el) => {
                el.style.outline = '3px solid red';
                setTimeout(() => { el.style.outline = ''; }, 20000);
            }, btn);
            await sleep(20000);

            sso = btn;
        }
    }

    return sso;
}

async function fillThreadsLoginForm(page, user, pass) {
    if (!user || !pass) return false;
    const uSel = THREADS_LOGIN_USER_INPUT;
    const pSel = THREADS_LOGIN_PASS_INPUT;
    const sSel = THREADS_LOGIN_SUBMIT;
    const u = await page.$(uSel).catch(() => null);
    const p = await page.$(pSel).catch(() => null);
    if (!u || !p) return false;

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

    await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => { }),
        page.click(sSel).catch(async () => {
            await page.evaluate((re) => {
                const nodes = Array.from(document.querySelectorAll('button,[role="button"]'));
                const rx = new RegExp(re, 'i');
                const btn = nodes.find(n => rx.test(n.textContent || ''));
                if (btn) btn.click();
            }, THREADS_LOGIN_ENTRY_TEXT.source);
        })
    ]);

    await takeShot(page, 'threads_login_submit');
    return true;
}

async function clickContinueWithInstagramOnLogin(page, creds = {}) {
    logStep("На /login: заповнюю форму логіну…");
    const filled = await fillThreadsLoginForm(page, creds.user, creds.pass);
    if (filled) return;

    logStep("Форма не знайдена або не заповнена — шукаю «Продовжити з Instagram»…");
    let sso = null;
    const until = Date.now() + 15000;
    while (!sso && Date.now() < until) {
        sso = await findSsoButton(page);
        if (!sso) {
            if (typeof page.waitForTimeout === 'function') {
                await page.waitForTimeout(500).catch(() => { });
            } else {
                await sleep(500);
            }
        }
    }

    if (!sso) {
        const dom = await page.content();
        fs.writeFileSync(path.resolve("коди сторінок", "threads_login_missing_sso.html"), dom);
        const shot = await takeShot(page, "missing_continue_with_instagram");
        const goal = "Find and click 'Continue with Instagram' button to start SSO";
        const candidates = { tried: [
            THREADS_CONTINUE_WITH_IG,
            "XPath //div[@role=\"button\"]//svg[@aria-label=\"Instagram\"]",
            "XPath //div[@role=\"button\"]//span[normalize-space(text())=\"Продовжити з Instagram\"]",
            "CSS div[role=\"button\"] span + text includes",
            "XPath //div[contains(@class,\"x1i10hfl\") and @role=\"button\"]",
            "XPath //div[@role=\"button\"]//*[contains(text(),\"Instagram\")]",
            "role=button + 'Continue with Instagram' text"
        ] };
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
    await Promise.allSettled([
        page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 1000 }),
        clickHandle(page, sso)
    ]);
    await takeShot(page, "after_click_sso");
}

// Instagram може запропонувати зберегти інформацію
export async function handleSaveCredentialsIfAppears(page) {
    try {
        const btn = (await page.evaluateHandle(() => {
            const nodes = Array.from(document.querySelectorAll('button,[role="button"]'));
            const target = nodes.find(n => /Зберегти інформацію/i.test(n.textContent || ""));
            if (target) target.scrollIntoView({ block: 'center', inline: 'center' });
            return target || null;
        }).catch(() => null))?.asElement();

        if (btn) {
            logStep('Instagram: натискаю «Зберегти інформацію»');
            await takeShot(page, 'ig_save_credentials');
            await Promise.all([
                page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => { }),
                clickHandle(page, btn).catch(() => { }),
            ]);
        }
    } catch (e) {
        logError(`handleSaveCredentialsIfAppears failed: ${e?.message}`);
    }
}

export async function ensureThreadsReady(page, opts = {}) {
    const { user: igUser, pass: igPass } = getIgCreds();
    const { user: threadsUser, pass: threadsPass } = getThreadsCreds();

    page.setDefaultTimeout(20000);
    page.setDefaultNavigationTimeout(30000);

    await tryStep("INIT: preload cookies", () => loadCookies(page), { page });

    await tryStep("Go to Threads login", async () => {
        await retry(async () => {
            await page.goto('https://www.threads.com/login?hl=uk', { waitUntil: "domcontentloaded", timeout: 30000 });
        });
        await takeShot(page, "login_loaded");
    }, { page });

    const already = await tryStep("Check threads auth", () => isThreadsAuthorized(page), { page });
    if (already) {
        logStep("Вже авторизовані на Threads");
        await takeShot(page, "threads_already_ready");
        return;
    }

    await tryStep("threads login", () => clickContinueWithInstagramOnLogin(page, { user: threadsUser, pass: threadsPass }), { page });

    const redirectedToIg = await tryStep("wait instagram redirect", () => waitUrlHas(page, "instagram.com", 25000), { page });

    if (redirectedToIg) {
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
                await handleSaveCredentialsIfAppears(page);
                await waitUrlHas(page, "threads.", 45000);
                break;
            }

            // (б) Форма логіну IG
            const hasForm = await page.$(IG_LOGIN_FORM);
            if (hasForm) {
                if (!igUser || !igPass) {
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
                await page.type(IG_PASS_INPUT, igPass, { delay: 20 });

                await takeShot(page, "ig_login_filled");

                await page.evaluate((selector) => {
                    const btn = document.querySelector(selector) ||
                        Array.from(document.querySelectorAll('button,[role="button"]'))
                            .find(b => /log in|увійти/i.test(b.textContent || ""));
                    if (btn) btn.style.boxShadow = '0 0 4px 2px #4ea5ff';
                }, IG_SUBMIT_BTN);
                await page.waitForTimeout(500);

                await Promise.all([
                    page.waitForNavigation({ waitUntil: "networkidle0", timeout: 45000 }).catch(() => { }),
                    page.click(IG_SUBMIT_BTN).catch(async () => {
                        await page.evaluate(() => {
                            const btn = Array.from(document.querySelectorAll('button,[role="button"]'))
                                .find(b => /log in|увійти/i.test(b.textContent || ""));
                            if (btn) btn.click();
                        });
                    }),
                ]);

                await takeShot(page, "ig_login_submit");
                await handleSaveCredentialsIfAppears(page);
                await waitUrlHas(page, "threads.", 45000);
                break;
            }

            if (/threads\.(net|com)/i.test(url)) break; // вже редіректимося назад
            await sleep(300);
        }
    }

    await tryStep("Очікую повернення у Threads…", () => waitUrlHas(page, "threads.", 45000), { page });

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

export { clickContinueWithInstagramOnLogin };

export default {
    "login.test": async ({ page, user }) => ensureThreadsReady(page, { user }),
};

// coach/coachAgent.js
// Інтеграція з ChatGPT (Chat Completions) + виконання команд на сторінці.
import { logStep, logError, appendCoachSolution } from "../helpers/logger.js";

const COACH_MODEL = process.env.COACH_MODEL || "gpt-4o-mini";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";

/**
 * Виконує клік по ElementHandle|JSHandle(Element)
 */
async function clickHandle(page, handle) {
    if (!handle) throw new Error("clickHandle: empty handle");
    const el = handle.asElement ? handle.asElement() : null;
    if (el && el.click) return el.click();
    return page.evaluate((node) => node && node.click && node.click(), handle);
}

/**
 * Повертає перший видимий елемент за селектором (у т.ч. :scope all)
 */
async function queryVisible(page, selector) {
    return page.evaluateHandle((sel) => {
        const isVisible = (el) => {
            const r = el.getBoundingClientRect();
            const cs = getComputedStyle(el);
            return r.width > 4 && r.height > 4 && cs.visibility !== "hidden" && cs.display !== "none";
        };
        const nodes = Array.from(document.querySelectorAll(sel));
        return nodes.find(isVisible) || null;
    }, selector);
}

/**
 * Відправляє промт до ChatGPT і повертає JSON з планом дій.
 * Очікуваний формат відповіді:
 * {
 *   "actions": [
 *     {"type":"click","selector":"css-selector","waitForNavigation":true}
 *   ],
 *   "notes": "будь-які примітки"
 * }
 */
async function askChatForPlan({ stage, message, goal, domSnippet, candidates }) {
    if (!OPENAI_API_KEY) {
        throw new Error("OPENAI_API_KEY is not set (.env)");
    }

    const sys = [
        "You are a web automation coach for Puppeteer.",
        "Return strictly valid JSON with keys: actions (array), notes (string).",
        "Each action: {type:'click'|'type'|'wait', selector?:string, text?:string, waitForNavigation?:boolean, timeoutMs?:number}",
        "Prefer robust CSS selectors. Avoid :contains(). Use role, aria-label, [href*], and visibility assumptions.",
    ].join(" ");

    const user = `
Stage: ${stage}
Problem: ${message}
Goal: ${goal}

Known candidates (may be wrong):
${JSON.stringify(candidates || [], null, 2)}

DOM (trimmed):
${domSnippet}
`;

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${OPENAI_API_KEY}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            model: COACH_MODEL,
            temperature: 0.2,
            response_format: { type: "json_object" },
            messages: [
                { role: "system", content: sys },
                { role: "user", content: user }
            ]
        })
    });

    if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`Chat API failed: ${res.status} ${t}`);
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content || "{}";
    let plan;
    try { plan = JSON.parse(content); }
    catch { plan = { actions: [], notes: "parse_error", raw: content }; }
    return plan;
}

/**
 * Пробує виконати план (actions) на сторінці.
 */
async function executePlanOnPage(page, plan) {
    const results = [];
    for (const act of plan.actions || []) {
        const r = { action: act, ok: false, error: null };
        try {
            if (act.type === "click" && act.selector) {
                const h = await queryVisible(page, act.selector);
                const val = await (await h)?.jsonValue?.().catch(() => null);
                if (!h || !val) throw new Error(`selector not found/visible: ${act.selector}`);
                await clickHandle(page, h);
                if (act.waitForNavigation) {
                    await page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: act.timeoutMs || 30000 }).catch(() => { });
                }
                r.ok = true;
            } else if (act.type === "type" && act.selector) {
                await page.focus(act.selector);
                await page.keyboard.down("Control").catch(() => { });
                await page.keyboard.press("A").catch(() => { });
                await page.keyboard.up("Control").catch(() => { });
                await page.type(act.selector, act.text || "", { delay: 10 });
                r.ok = true;
            } else if (act.type === "wait") {
                await page.waitForTimeout(act.timeoutMs || 500);
                r.ok = true;
            } else {
                throw new Error("unknown action or missing selector");
            }
        } catch (e) {
            r.error = e?.message || String(e);
        }
        results.push(r);
        if (!r.ok) break; // зупиняємось на першій невдалій дії
    }
    const success = results.length > 0 && results.every(x => x.ok);
    return { success, results };
}

/**
 * Головна API-функція коуча:
 * 1) надсилає DOM + ситуацію → отримує план
 * 2) виконує план
 * 3) у разі провалу — надсилає повторний репорт із результатами для уточнення
 * 4) у разі успіху — логує рішення
 */
export async function consultAndExecute({
    page, stage, message, goal, screenshotPath, dom, candidates
}) {
    const domSnippet = String(dom || "").slice(0, 60000); // обрізаємо, щоб не перевищити ліміти
    logStep(`COACH ▶ stage=${stage} | goal=${goal}`);

    // 1) перший план
    const plan = await askChatForPlan({ stage, message, goal, domSnippet, candidates });
    logStep(`COACH plan: ${JSON.stringify(plan)}`);

    // 2) виконання
    let exec = await executePlanOnPage(page, plan);

    // 3) якщо неуспішно — уточнення з репортом
    if (!exec.success) {
        const feedback = {
            stage, message, goal,
            feedback: {
                results: exec.results,
                notes: plan.notes || null
            }
        };

        const refinePrompt = `
Refine the plan because previous attempt failed.
Here are execution results (first failure stops the run):
${JSON.stringify(exec.results, null, 2)}
Return improved "actions" JSON only.
    `;

        const plan2 = await askChatForPlan({
            stage: `${stage}#refine`,
            message,
            goal: `${goal}\n${refinePrompt}`,
            domSnippet,
            candidates
        });

        logStep(`COACH refined plan: ${JSON.stringify(plan2)}`);
        exec = await executePlanOnPage(page, plan2);

        if (!exec.success) {
            logError("COACH: both attempts failed.");
            return { ok: false, tried: [plan, plan2], exec };
        } else {
            appendCoachSolution({ ts: Date.now(), stage, message, goal, plan: plan2, screenshotPath, success: true });
            logStep("COACH: refined plan succeeded ✅");
            return { ok: true, plan: plan2, exec };
        }
    } else {
        appendCoachSolution({ ts: Date.now(), stage, message, goal, plan, screenshotPath, success: true });
        logStep("COACH: plan succeeded ✅");
        return { ok: true, plan, exec };
    }
}

export async function report({ stage, message, screenshotPath = '', context = null }) {
    logError(`REPORT[${stage}]: ${message}`);
    try {
        appendCoachSolution({ ts: Date.now(), stage, message, screenshotPath, context, type: 'report' });
    } catch { }
}

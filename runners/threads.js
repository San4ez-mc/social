// runners/threads.js
import fs from "node:fs";
import path from "node:path";
import { launchBrowser, newPageWithCookies, persistAndClose } from "../core/browser.js";
import { ensureThreadsReady } from "../core/login.js";

function logStep(m) {
    const line = `[${new Date().toISOString()}][runner][step] ${m}\n`;
    try {
        fs.mkdirSync(path.resolve("logs"), { recursive: true });
        fs.appendFileSync(path.resolve("logs/steps.log"), line, "utf8");
    } catch { }
    console.log("[STEP]", m);
}

function parseArgs(argv) {
    const args = {};
    argv.slice(2).forEach((a, i, arr) => {
        if (a.startsWith("--")) {
            const key = a.replace(/^--/, "");
            const val = arr[i + 1] && !arr[i + 1].startsWith("--") ? arr[i + 1] : true;
            args[key] = val;
        }
    });
    return args;
}

async function keepAlive(note = "Coach mode active — press Ctrl+C to exit") {
    console.log(`\n${note}\n`);
    // eslint-disable-next-line no-constant-condition
    await new Promise(() => { }); // навмисно "висимо"
}

async function main() {
    const argv = parseArgs(process.argv);
    const action = argv.action || "login.test";
    const headless = argv.headless === "true";

    logStep(`Старт браузера (headless=${headless})`);
    const browser = await launchBrowser({ headless });
    const page = await newPageWithCookies(browser);

    try {
        if (action !== "login.test") throw new Error(`Unknown --action=${action}`);

        logStep("Запуск дії login.test");
        await ensureThreadsReady(page, {
            user: argv.user || process.env.THREADS_USER || "ol.matsuk",
        });

        logStep("login.test завершено успішно");
        console.log("[RESULT] ✔ Авторизація завершена");
        logStep("Збереження стану та закриття браузера");
        await persistAndClose(browser, page).catch(() => { });
        process.exit(0);
    } catch (e) {
        if (e && e.keepOpen) {
            console.error("\n[COACH] Перехопив помилку зі збереженням браузера відкритим.");
            if (e.coach) {
                console.error("[COACH] Exec:", JSON.stringify(e.coach.exec || {}, null, 2));
                console.error("[COACH] Tried plans:", (e.coach.tried ? e.coach.tried.length : 0));
            }
            console.error("[FATAL]", e.message);
            await keepAlive("Браузер залишено відкритим. Перевір DOM та повтори дію вручну. Ctrl+C — вихід.");
        } else {
            console.error("[FATAL]", e?.stack || e?.message || e);
            logStep("Збереження стану та закриття браузера");
            await persistAndClose(browser, page).catch(() => { });
            process.exit(1);
        }
    }
}

main();

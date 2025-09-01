// helpers/logger.js
import fs from "node:fs";
import path from "node:path";

export function logLine(kind, msg, user = process.env.THREADS_USER || "ol.matsuk") {
    const line = `[${new Date().toISOString()}][${user}][${kind}] ${msg}\n`;
    try {
        fs.mkdirSync(path.resolve("logs"), { recursive: true });
        fs.appendFileSync(path.resolve("logs/steps.log"), line, "utf8");
    } catch { }
    console.log(`[${kind.toUpperCase()}]`, msg);
}

export const logStep = (m) => logLine("step", m);
export const logError = (m) => logLine("error", m);

export async function screenshot(page, slug, full = true) {
    try {
        const dir = path.resolve("screens");
        fs.mkdirSync(dir, { recursive: true });
        const file = path.join(
            dir,
            `${new Date().toISOString().replace(/[:.]/g, "-")}_${slug.replace(/\W+/g, "_")}.png`
        );
        await page.screenshot({ path: file, fullPage: full }).catch(() => { });
        logStep(`SCREENSHOT: ${file}`);
        return file;
    } catch { return ""; }
}

export function appendCoachSolution(rec) {
    try {
        const dir = path.resolve("logs");
        fs.mkdirSync(dir, { recursive: true });
        fs.appendFileSync(path.join(dir, "coach_solutions.jsonl"), JSON.stringify(rec) + "\n", "utf8");
    } catch { }
}

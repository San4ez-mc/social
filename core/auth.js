// core/auth.js
export function getIgCreds() {
    const user = (process.env.IG_USER || "").trim();
    const pass = (process.env.IG_PASS || "").trim();
    if (!user || !pass) throw new Error("[FATAL] IG_USER / IG_PASS відсутні у .env");
    return { user, pass };
}

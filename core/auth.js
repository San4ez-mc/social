// core/auth.js

// Повертає креденшали для Threads із змінних середовища.
export function getThreadsCreds() {
    const user = (process.env.THREADS_USERNAME || "").trim();
    const pass = (process.env.THREADS_PASSWORD || "").trim();
    if (!user || !pass) {
        throw new Error("[FATAL] THREADS_USERNAME / THREADS_PASSWORD відсутні у .env");
    }
    return { user, pass };
}


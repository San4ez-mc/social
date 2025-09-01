// helpers/misc.js
import { logStep, logError, screenshot } from './logger.js';
import * as coachAgent from '../coach/coachAgent.js';

export async function tryStep(name, fn, { page = null, context = null } = {}) {
    logStep(`${name}: start`);
    try {
        const res = await fn();
        logStep(`${name}: ok`);
        return res;
    } catch (e) {
        logError(`${name}: ${e?.message || e}`);
        let screenshotPath = '';
        if (page) {
            try { screenshotPath = await screenshot(page, name); } catch { }
        }
        try {
            await coachAgent.report?.({ stage: name, message: e?.message || String(e), screenshotPath, context });
        } catch { }
        throw e;
    }
}

export {
    logStep,
    nap,
    handleDomFailure,
    randInt,
    shuffle,
    slowScroll
} from '../utils.js';

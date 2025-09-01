import { getPostTextFromOpenAI } from '../contentProvider.js';
import { buildPromptForType, tipSerialNumber } from '../prompts.js';
import { logStep } from '../utils.js';
import { fillAndPost } from '../core/composer.js';

export async function run(page, { type = 'story', text = '', image = null, composerHandle = null, timeout = 22000 } = {}) {
  let postText = text;
  if (!postText) {
    const day = type === 'tip' ? tipSerialNumber(new Date()) : undefined;
    const prompt = buildPromptForType(type, { day });
    postText = await getPostTextFromOpenAI(prompt, { type, day });
  }
  logStep(`Готую пост типу ${type}`);
  await fillAndPost(page, { composerHandle, text: postText, image, timeout });
  return { ok: true, textUsed: postText };
}

export default { run };

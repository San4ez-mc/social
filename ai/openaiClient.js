// ai/openaiClient.js
import OpenAI from 'openai';

/**
 * Єдиний клієнт OpenAI для всього проєкту.
 * Ключ береться з process.env.OPENAI_API_KEY
 */
export const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

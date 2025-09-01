import assert from 'node:assert/strict';
import { test } from 'node:test';
import puppeteer from 'puppeteer';
import { continueWithInstagramOnThreads } from '../core/threadsBridge.js';

// Мок для сторінки Threads: повертаємо кнопку "Continue with Instagram"
const MOCK_HTML = '<div role="button"><span>Continue with Instagram</span></div>';

test('continueWithInstagramOnThreads handles basic flow', async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();

  await page.setRequestInterception(true);
  page.on('request', req => {
    if (req.url().startsWith('https://www.threads.net/') || req.url().startsWith('https://www.threads.com/')) {
      req.respond({ status: 200, contentType: 'text/html', body: MOCK_HTML });
    } else {
      req.respond({ status: 200, body: '' });
    }
  });

  await assert.doesNotReject(() => continueWithInstagramOnThreads(page, 500, { IG_USER: 'test' }));

  await browser.close();
});

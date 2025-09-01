import assert from 'node:assert/strict';
import { test } from 'node:test';
import puppeteer from 'puppeteer';

const htmlButton = `
<div role="button" id="sso">
  <div><span>Продовжити з Instagram</span></div>
</div>
`;

test('clickContinueWithInstagramOnLogin handles standard button', async () => {
  const { clickContinueWithInstagramOnLogin } = await import('../core/login.js');
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setContent(htmlButton);
  await assert.doesNotReject(() => clickContinueWithInstagramOnLogin(page));
  await browser.close();
});

test('clickContinueWithInstagramOnLogin handles SVG icon button', async () => {
  const { clickContinueWithInstagramOnLogin } = await import('../core/login.js');
  const html = `
    <div role="button" id="sso"><svg aria-label="Instagram"></svg></div>
  `;
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setContent(html);
  await assert.doesNotReject(() => clickContinueWithInstagramOnLogin(page));
  await browser.close();
});

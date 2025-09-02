import test from 'node:test';
import assert from 'assert/strict';
import { clickCssOrXPath } from '../utils.js';

test('clickCssOrXPath clicks via CSS when available', async () => {
  let clicked = false;
  const handle = { click: async () => { clicked = true; } };
  const page = {
    waitForSelector: async () => handle,
    $x: async () => { throw new Error('should not use XPath'); }
  };
  const ok = await clickCssOrXPath(page, ['.one', '.two'], '//div');
  assert.equal(ok, true);
  assert.equal(clicked, true);
});

test('clickCssOrXPath falls back to XPath', async () => {
  let cssTried = false;
  let xpathTried = false;
  let clicked = false;
  const handle = { click: async () => { clicked = true; } };
  const page = {
    waitForSelector: async () => { cssTried = true; throw new Error('not found'); },
    $x: async () => { xpathTried = true; return [handle]; }
  };
  const ok = await clickCssOrXPath(page, ['.missing'], '//span');
  assert.equal(ok, true);
  assert.equal(cssTried, true);
  assert.equal(xpathTried, true);
  assert.equal(clicked, true);
});

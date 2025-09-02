import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import { isOnThreadsFeed } from '../core/feed.js';

function makePage(html) {
  return {
    evaluate: async (fn, opts) => {
      const { window } = new JSDOM(html);
      const prev = globalThis.document;
      globalThis.document = window.document;
      try {
        return fn(opts);
      } finally {
        globalThis.document = prev;
      }
    }
  };
}

test('isOnThreadsFeed returns true for authorized feed', async () => {
  const html = `
    <a href="/@testuser">profile</a>
    <span>Що нового?</span>
  `;
  const page = makePage(html);
  assert.equal(await isOnThreadsFeed(page, '@testuser'), true);
});

test('isOnThreadsFeed returns false for wrong user', async () => {
  const html = `
    <a href="/@other">profile</a>
    <span>Що нового?</span>
  `;
  const page = makePage(html);
  assert.equal(await isOnThreadsFeed(page, '@testuser'), false);
});

test('isOnThreadsFeed returns false when composer missing', async () => {
  const html = `<a href="/@testuser">profile</a>`;
  const page = makePage(html);
  assert.equal(await isOnThreadsFeed(page, '@testuser'), false);
});

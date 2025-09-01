import test from 'node:test';
import assert from 'assert/strict';
import { waitForAny } from '../utils.js';

// Переконуємось, що кожен селектор справді використано у пошуку
// ітерації відбуваються навіть при відсутності результату

test('waitForAny attempts all selectors', async () => {
  const attempted = [];
  const fakeHandle = { asElement: () => null, dispose: async () => {} };
  const page = {
    frames: () => [],
    evaluateHandle: async (fn, sel) => { attempted.push(sel); return fakeHandle; }
  };
  const selectors = ['.one', '.two', '.three'];
  await waitForAny(page, selectors, { timeout: 30, optional: true });
  assert.deepEqual(new Set(attempted), new Set(selectors));
});

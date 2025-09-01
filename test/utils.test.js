import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randInt, shuffle, nap, logStepAsync } from '../utils.js';
import { test } from 'node:test';

test('randInt returns value within inclusive range', () => {
  for (let i = 0; i < 100; i++) {
    const val = randInt(1, 5);
    assert.ok(val >= 1 && val <= 5);
  }
});

test('shuffle returns array with same elements', () => {
  const arr = [1, 2, 3, 4];
  const shuffled = shuffle([...arr]);
  assert.equal(shuffled.length, arr.length);
  assert.deepEqual([...shuffled].sort(), [...arr].sort());
});

test('nap waits at least the specified time', async () => {
  const start = Date.now();
  await nap(50);
  assert.ok(Date.now() - start >= 45);
});

test('logStepAsync writes messages to logs/steps.log', async () => {
  const logPath = path.resolve('logs/steps.log');
  await fs.rm(path.dirname(logPath), { recursive: true, force: true });
  await logStepAsync('test message');
  const content = await fs.readFile(logPath, 'utf8');
  assert.match(content, /test message/);
});

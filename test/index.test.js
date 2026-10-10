import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hello } from '../src/index.js';

test('greets the world by default', () => {
  assert.equal(hello(), 'Hello, world!');
});

test('greets someone by name', () => {
  assert.equal(hello('Ada'), 'Hello, Ada!');
});

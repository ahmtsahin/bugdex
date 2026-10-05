import { test } from 'node:test'
import assert from 'node:assert/strict'
import { round } from './money.js'

test('round keeps two decimals', () => {
  assert.equal(round(10.005), 10.01)
  assert.equal(round(0.1 + 0.2), 0.3)
})

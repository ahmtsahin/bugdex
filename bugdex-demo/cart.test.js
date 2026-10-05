import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyDiscount, total } from './cart.js'

test('total adds up price times quantity', () => {
  assert.equal(total([{ price: 10, qty: 2 }, { price: 5, qty: 1 }]), 25)
})

test('a 10% discount on 200 is 180', () => {
  assert.equal(applyDiscount(200, 10), 180)
})

test('the discount is a percentage, not a flat amount', () => {
  assert.equal(applyDiscount(50, 20), 40)
})

test('a 100% discount makes it free', () => {
  assert.equal(applyDiscount(80, 100), 0)
})

test('a 50% discount halves the price', () => {
  assert.equal(applyDiscount(30, 50), 15)
})

test('a 25% discount on 40 is 30', () => {
  assert.equal(applyDiscount(40, 25), 30)
})

test('an empty cart costs nothing', () => {
  assert.equal(applyDiscount(0, 0), 0)
})

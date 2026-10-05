import { test } from 'node:test'
import assert from 'node:assert/strict'
import { customerName, itemCount, shippingCountry } from './checkout.js'

const cart = {
  items: [{ price: 10, qty: 2 }, { price: 5, qty: 1 }],
  shipping: { country: 'TR' },
  buyer: { name: 'Ada' },
}

test('counts the items in the cart', () => {
  assert.equal(itemCount(cart), 2)
})

test('ships to the buyer country', () => {
  assert.equal(shippingCountry(cart), 'TR')
})

test('ships to whichever country the cart names', () => {
  assert.equal(shippingCountry({ ...cart, shipping: { country: 'DE' } }), 'DE')
})

test('greets the buyer by name', () => {
  assert.equal(customerName(cart), 'Ada')
})

test('greets a cart with no buyer as a guest', () => {
  assert.equal(customerName({ items: [] }), 'Guest')
})

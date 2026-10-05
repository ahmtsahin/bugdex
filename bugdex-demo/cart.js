import { round } from './money.js'

export function total(items) {
  return round(items.reduce((sum, item) => sum + item.price * item.qty, 0))
}

export function applyDiscount(amount, percent) {
  return round(amount - (amount * percent) / 100)
}

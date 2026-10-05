export function itemCount(cart) {
  return cart.items.length
}

export function shippingCountry(cart {
  return cart.shipping.country
}

export function customerName(cart) {
  return cart.buyer?.name ?? 'Guest'
}

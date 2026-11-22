import 'server-only'
import { cache } from 'react'
import { cookies } from 'next/headers'
import { CART_COOKIE, gqlOrNull } from './client'

export type CartLine = { id: string; productId: string; name: string; slug: string; imageUrl: string | null; quantity: number; unitAmount: number; totalAmount: number; available: number }
export type Cart = {
  id: string
  fulfilment: 'delivery' | 'pickup' | null
  currencyCode: string
  serviceArea: { id: string; name: string } | null
  pickupBranch: { id: string; name: string; address: string } | null
  address: Record<string, string>
  name: string | null
  email: string | null
  phone: string | null
  lines: CartLine[]
  planDiscountPercent: number
  discountAmount: number
  deliveryAmount: number
  subtotalAmount: number
  taxAmount: number
  totalAmount: number
  count: number
}

/** The visitor's open cart, read through activeCart (the cart token travels in a server cookie). */
export const getCart = cache(async (): Promise<Cart | null> => {
  const jar = await cookies()
  if (!jar.get(CART_COOKIE)?.value) return null
  const r = await gqlOrNull<{ activeCart: Cart | null }>('{ activeCart }')
  return r?.activeCart ?? null
})

export async function cartCount() {
  const cart = await getCart()
  return cart?.count ?? 0
}

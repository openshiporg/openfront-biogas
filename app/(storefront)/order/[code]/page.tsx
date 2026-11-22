import { OrderScreen } from '@/features/storefront/screens/CodeScreens'

export const metadata = { title: 'Your order', robots: { index: false } }
export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  return <OrderScreen code={decodeURIComponent(code)} />
}

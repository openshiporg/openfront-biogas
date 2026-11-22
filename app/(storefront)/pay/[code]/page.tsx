import { PayScreen } from '@/features/storefront/screens/CodeScreens'

export const metadata = { title: 'Pay', robots: { index: false } }
export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  return <PayScreen code={decodeURIComponent(code)} />
}

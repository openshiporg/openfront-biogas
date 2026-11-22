import { QuoteScreen } from '@/features/storefront/screens/CodeScreens'

export const metadata = { title: 'Your quote', robots: { index: false } }
export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  return <QuoteScreen code={decodeURIComponent(code)} />
}

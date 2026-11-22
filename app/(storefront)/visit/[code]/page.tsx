import { VisitScreen } from '@/features/storefront/screens/CodeScreens'

export const metadata = { title: 'Your visit', robots: { index: false } }
export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  return <VisitScreen code={decodeURIComponent(code)} />
}

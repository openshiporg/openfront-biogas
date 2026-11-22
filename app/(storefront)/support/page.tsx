import { SupportScreen } from '@/features/storefront/screens/ShopFlowScreens'

export const metadata = { title: 'Report a problem' }
export default async function Page({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code } = await searchParams
  return <SupportScreen code={code} />
}

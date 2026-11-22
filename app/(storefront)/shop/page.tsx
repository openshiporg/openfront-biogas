import { ShopScreen } from '@/features/storefront/screens/CatalogScreens'

export const metadata = { title: 'Shop' }
export default async function Page({ searchParams }: { searchParams: Promise<{ category?: string; fits?: string }> }) {
  const q = await searchParams
  return <ShopScreen category={q.category} fits={q.fits} />
}

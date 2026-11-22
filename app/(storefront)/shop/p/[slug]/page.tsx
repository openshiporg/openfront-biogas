import { PartScreen } from '@/features/storefront/screens/CatalogScreens'

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return <PartScreen slug={slug} />
}

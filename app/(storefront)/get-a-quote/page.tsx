import { GetAQuoteScreen } from '@/features/storefront/screens/LeadScreens'

export const metadata = { title: 'Get a quote' }
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return <GetAQuoteScreen q={await searchParams} />
}

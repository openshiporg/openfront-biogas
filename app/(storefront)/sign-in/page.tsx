import { SignInScreen } from '@/features/storefront/screens/AccountScreens'

export const metadata = { title: 'Sign in' }
export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string; created?: string }> }) {
  const { next, created } = await searchParams
  return <SignInScreen next={next} created={created === '1'} />
}

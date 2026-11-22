import { SignInScreen } from '@/features/storefront/screens/AccountScreens'

export const metadata = { title: 'Sign in' }
export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams
  return <SignInScreen next={next} />
}

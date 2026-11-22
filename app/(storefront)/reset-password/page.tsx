import { ResetPasswordScreen } from '@/features/storefront/screens/AccountScreens'

export const metadata = { title: 'Reset your password' }
export default async function Page({ searchParams }: { searchParams: Promise<{ email?: string; token?: string }> }) {
  const q = await searchParams
  return <ResetPasswordScreen email={q.email} token={q.token} />
}

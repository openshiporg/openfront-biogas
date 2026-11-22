export const dynamic = 'force-dynamic';

import { DashboardLayout } from '@/features/dashboard/components/DashboardLayout';
import { getAdminMetaAction, getAuthenticatedUser } from '@/features/dashboard/actions';

export default async function ListLayout({ children }: { children: React.ReactNode }) {
  // Fetch adminMeta and user data server-side to avoid loading states
  const [adminMetaResponse, userResponse] = await Promise.all([
    getAdminMetaAction(),
    getAuthenticatedUser()
  ]);
  
  const adminMeta = adminMetaResponse.success ? adminMetaResponse.data : null;
  // The setup card is for an empty company: once there are leads, the company has been set up.
  const user = userResponse.success && userResponse.data?.authenticatedItem
    ? { ...userResponse.data.authenticatedItem, menuItemsCount: userResponse.data.leadsCount ?? 0, brandName: userResponse.data.companySettings?.name ?? null }
    : null;

  return (
    <DashboardLayout adminMeta={adminMeta} authenticatedItem={user}>
      {children}
    </DashboardLayout>
  );
}
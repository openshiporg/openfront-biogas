import { viewer } from '../../lib/server'
import { settingsTabs } from '../../lib/navigation'
import { Page, Tabs, Empty } from '../../components/ui'

export const SETTINGS = '/dashboard/platform/settings'

/** Settings pages share the tab strip (lib/navigation settingsTabs). Returns the signed-in viewer and whether they may edit. */
export async function settingsAccess(permission: string | string[] = 'canManageSettings') {
  const me = await viewer()
  return { me, allowed: (Array.isArray(permission) ? permission : [permission]).some(p => me.can(p)) }
}

export function SettingsShell({ active, title, allowed, children }: { active: string; title: string; allowed: boolean; children?: React.ReactNode }) {
  return (
    <Page title={title} crumbs={active === SETTINGS ? [] : [{ label: 'Settings', href: SETTINGS }]}>
      <Tabs active={active} items={settingsTabs.map(t => ({ key: t.href, label: t.label, href: t.href }))} />
      {allowed ? children : <Empty>Your role cannot change these settings. Ask the owner.</Empty>}
    </Page>
  )
}

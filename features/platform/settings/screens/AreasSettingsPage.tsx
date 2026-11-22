import { q } from '../../lib/server'
import { money } from '../../lib/format'
import { Section, Meta, Empty, Status } from '../../components/ui'
import { RecordForm } from '../../records/RecordForm'
import { SettingsShell, settingsAccess, SETTINGS } from '../components/SettingsShell'

const PATH = `${SETTINGS}/areas`
const m = (v: number | null | undefined) => ((v ?? 0) / 100).toFixed(2)

/** P59: branches and the service areas each covers, with delivery fee and install surcharge. Postcodes decide which area a site is in. */
export default async function AreasSettingsPage() {
  const { allowed } = await settingsAccess()
  if (!allowed) return <SettingsShell active={PATH} title="Branches and areas" allowed={false} />
  const d = await q<any>(`{
    branches(orderBy: [{ name: asc }]) { id name code address phone lat lng isActive usersCount }
    serviceAreas(orderBy: [{ name: asc }]) { id name country region postcodes deliveryFeeAmount installSurchargeAmount isActive branch { id name } sitesCount }
    companySettings { currencyCode }
  }`)
  const cur = d.companySettings?.currencyCode ?? 'USD'
  const branchOptions = d.branches.map((b: any) => ({ value: b.id, label: b.name }))
  return (
    <SettingsShell active={PATH} title="Branches and areas" allowed>
      <Section title={`Branches · ${d.branches.length}`}>
        {d.branches.map((b: any) => (
          <div key={b.id} className="space-y-1 border-b py-3 last:border-b-0">
            <div className="flex flex-wrap items-baseline justify-between gap-2"><span className="font-medium">{b.name} <Meta>{b.code} · {b.address} · {b.usersCount} staff</Meta></span><Status value={b.isActive ? 'active' : 'retired'} /></div>
            <details><summary className="cursor-pointer text-xs text-muted-foreground">Edit</summary>
              <RecordForm list="Branch" id={b.id} submit="Save branch" paths={[PATH]} className="mt-2" fields={[
                { name: 'name', label: 'Name', required: true, defaultValue: b.name }, { name: 'code', label: 'Code', width: 'sm', required: true, defaultValue: b.code },
                { name: 'phone', label: 'Phone', kind: 'tel', width: 'sm', defaultValue: b.phone }, { name: 'address', label: 'Address', width: 'lg', defaultValue: b.address },
                { name: 'lat', label: 'Latitude', kind: 'number', width: 'sm', defaultValue: b.lat ?? '' }, { name: 'lng', label: 'Longitude', kind: 'number', width: 'sm', defaultValue: b.lng ?? '' },
                { name: 'isActive', label: 'Open', kind: 'checkbox', defaultValue: b.isActive },
              ]} />
            </details>
          </div>
        ))}
        <details><summary className="cursor-pointer text-xs text-muted-foreground">Add a branch</summary>
          <RecordForm list="Branch" submit="Add branch" paths={[PATH]} className="mt-2" fields={[
            { name: 'name', label: 'Name', required: true }, { name: 'code', label: 'Code', width: 'sm', required: true }, { name: 'phone', label: 'Phone', kind: 'tel', width: 'sm' }, { name: 'address', label: 'Address', width: 'lg' },
          ]} />
        </details>
      </Section>

      <Section title={`Service areas · ${d.serviceAreas.length}`}>
        {d.serviceAreas.length ? d.serviceAreas.map((a: any) => (
          <div key={a.id} className="space-y-1 border-b py-3 last:border-b-0">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-medium">{a.name} <Meta>{a.branch?.name ?? 'No branch'} · {[a.region, a.country].filter(Boolean).join(', ')} · delivery {money(a.deliveryFeeAmount, cur)} · install surcharge {money(a.installSurchargeAmount, cur)} · {Array.isArray(a.postcodes) ? a.postcodes.length : 0} postcodes · {a.sitesCount} sites</Meta></span>
              <Status value={a.isActive ? 'active' : 'retired'} />
            </div>
            <details><summary className="cursor-pointer text-xs text-muted-foreground">Edit</summary>
              <RecordForm list="ServiceArea" id={a.id} submit="Save area" paths={[PATH]} className="mt-2" fields={[
                { name: 'name', label: 'Name', required: true, defaultValue: a.name }, { name: 'branch', label: 'Branch', kind: 'select', width: 'md', defaultValue: a.branch?.id, options: branchOptions },
                { name: 'region', label: 'State or county', width: 'sm', defaultValue: a.region }, { name: 'country', label: 'Country', width: 'sm', defaultValue: a.country },
                { name: 'deliveryFeeAmount', label: 'Delivery fee', kind: 'money', width: 'sm', defaultValue: m(a.deliveryFeeAmount) },
                { name: 'installSurchargeAmount', label: 'Install surcharge', kind: 'money', width: 'sm', defaultValue: m(a.installSurchargeAmount) },
                { name: 'postcodes', label: 'Postcodes (JSON list, prefixes allowed)', width: 'lg', defaultValue: JSON.stringify(a.postcodes ?? []) },
                { name: 'isActive', label: 'We serve this area', kind: 'checkbox', defaultValue: a.isActive },
              ]} />
            </details>
          </div>
        )) : <Empty>No service areas. Without one, every address shows as outside the area.</Empty>}
        <details><summary className="cursor-pointer text-xs text-muted-foreground">Add an area</summary>
          <RecordForm list="ServiceArea" submit="Add area" paths={[PATH]} className="mt-2" fields={[
            { name: 'name', label: 'Name', required: true }, { name: 'branch', label: 'Branch', kind: 'select', width: 'md', options: branchOptions },
            { name: 'region', label: 'State or county', width: 'sm' }, { name: 'country', label: 'Country', width: 'sm' },
            { name: 'deliveryFeeAmount', label: 'Delivery fee', kind: 'money', width: 'sm' }, { name: 'installSurchargeAmount', label: 'Install surcharge', kind: 'money', width: 'sm' },
            { name: 'postcodes', label: 'Postcodes (JSON list)', width: 'lg', placeholder: '["786", "787"]' },
          ]} />
        </details>
      </Section>
    </SettingsShell>
  )
}

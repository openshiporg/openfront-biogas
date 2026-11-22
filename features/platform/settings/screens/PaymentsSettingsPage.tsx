import { q } from '../../lib/server'
import { label } from '../../lib/format'
import { Section, Meta, Status } from '../../components/ui'
import { RecordForm } from '../../records/RecordForm'
import { SettingsShell, settingsAccess, SETTINGS } from '../components/SettingsShell'
import { stripeConfigured } from '@/features/integrations/payment/stripe'

const PATH = `${SETTINGS}/payments`
const CODES = ['mobile_money', 'bank_transfer', 'cash', 'stripe']

/**
 * P60: payment methods and what customers are told. Mobile money, bank transfer and cash need no keys: the customer sends a
 * reference and staff verify it. Card works once the Stripe keys are set on the server; the page says which keys it reads.
 */
export default async function PaymentsSettingsPage() {
  const { allowed } = await settingsAccess()
  if (!allowed) return <SettingsShell active={PATH} title="Payment methods" allowed={false} />
  const d = await q<any>(`{ paymentProviders(orderBy: [{ sortOrder: asc }]) { id name code isEnabled isOnline instructions sortOrder } }`)
  const have = new Set(d.paymentProviders.map((p: any) => p.code))
  const missing = CODES.filter(c => !have.has(c))
  const stripeReady = stripeConfigured()
  return (
    <SettingsShell active={PATH} title="Payment methods" allowed>
      <Section title="Methods customers can use">
        {d.paymentProviders.map((p: any) => (
          <div key={p.id} className="space-y-2 border-b py-3 last:border-b-0">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-medium">{p.name} <Meta>{label(p.code)}{p.code === 'stripe' ? (stripeReady ? ' · card keys set' : ' · needs STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET on the server') : ' · reference checked by staff'}</Meta></span>
              <Status value={p.isEnabled ? 'active' : 'paused'} />
            </div>
            <RecordForm list="PaymentProvider" id={p.id} submit="Save" paths={[PATH]} fields={[
              { name: 'name', label: 'Name customers see', defaultValue: p.name },
              { name: 'sortOrder', label: 'Order', kind: 'number', width: 'sm', defaultValue: String(p.sortOrder ?? 0) },
              { name: 'instructions', label: p.code === 'stripe' ? 'Note under the card form' : 'Instructions (account, till or handle, and what to put as the reference)', kind: 'textarea', defaultValue: p.instructions },
              { name: 'isEnabled', label: 'Offered to customers', kind: 'checkbox', defaultValue: p.isEnabled },
            ]} />
          </div>
        ))}
      </Section>
      {missing.length ? (
        <Section title="Add a method">
          <RecordForm list="PaymentProvider" submit="Add method" paths={[PATH]} fields={[
            { name: 'code', label: 'Method', kind: 'select', width: 'md', options: missing.map(c => ({ value: c, label: c === 'stripe' ? 'Card (Stripe)' : label(c) })) },
            { name: 'name', label: 'Name customers see', required: true },
            { name: 'instructions', label: 'Instructions', kind: 'textarea' },
          ]} />
        </Section>
      ) : null}
    </SettingsShell>
  )
}

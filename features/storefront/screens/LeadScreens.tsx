import { getStore } from '../lib/data/store'
import { getViewer } from '../lib/data/session'
import { PageHead, Section } from '../components/ui'
import { Calculator } from '../components/Calculator'
import { QuoteRequest } from '../components/QuoteRequest'
import { telHref } from '../lib/format'

/* S4 */
export async function CalculatorScreen() {
  const store = await getStore()
  return (
    <>
      <PageHead title="Size my system" intro="Tell us what waste you have and what you spend on cooking fuel. We will show the gas you could make, the system that fits and how soon it pays for itself." />
      <Section><Calculator currencyCode={store.currencyCode} /></Section>
    </>
  )
}

/* S5 */
export async function GetAQuoteScreen({ q }: { q: { interest?: string; system?: string; assessment?: string; ref?: string } }) {
  const [store, viewer] = await Promise.all([getStore(), getViewer()])
  return (
    <>
      <PageHead title="Get a quote" intro={<>Four short steps. We reply with a written quote, with options and payment plans.{store.phone ? <> Prefer to talk? Call <a href={telHref(store.phone)} className="font-bold text-[var(--clay)] underline">{store.phone}</a>.</> : null}</>} />
      <Section className="max-w-[900px]">
        <QuoteRequest
          country={store.country}
          currencyCode={store.currencyCode}
          timeZone={store.timezone}
          surveyFeeAmount={store.surveyFeeAmount}
          phone={store.phone}
          initial={{ interest: q.interest, system: q.system, assessment: q.assessment, referral: q.ref }}
          viewer={viewer && !viewer.isStaff ? { name: viewer.name, email: viewer.email, phone: viewer.phone } : null}
        />
      </Section>
    </>
  )
}

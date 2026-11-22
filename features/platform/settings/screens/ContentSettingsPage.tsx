import { q } from '../../lib/server'
import { label } from '../../lib/format'
import { Section, Meta, Status, Tabs } from '../../components/ui'
import { RecordForm } from '../../records/RecordForm'
import { RemoveButton } from '../../records/RecordButtons'
import { SettingsShell, settingsAccess, SETTINGS } from '../components/SettingsShell'

const PATH = `${SETTINGS}/content`
const CATS = ['no_gas', 'low_pressure', 'smell', 'leak', 'stove_fault', 'slurry_overflow', 'other']
const VIEWS = [{ key: 'stories', label: 'Stories' }, { key: 'faqs', label: 'Questions' }, { key: 'guides', label: 'Troubleshooting guides' }, { key: 'resources', label: 'Manuals and videos' }]
const Edit = ({ children }: { children: React.ReactNode }) => <details><summary className="cursor-pointer text-xs text-muted-foreground">Edit</summary><div className="mt-2">{children}</div></details>

/** P63: what the storefront shows: customer stories, questions, troubleshooting guides and manuals. */
export default async function ContentSettingsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const sp = await searchParams
  const view = VIEWS.find(v => v.key === sp.view) ?? VIEWS[0]
  const { allowed } = await settingsAccess(['canManageSettings', 'canManageTickets', 'canManageCatalog'])
  if (!allowed) return <SettingsShell active={PATH} title="Storefront content" allowed={false} />
  const d = await q<any>(`{
    stories(orderBy: [{ createdAt: desc }]) { id title slug customerName location body imageUrl savingsText isPublished }
    faqs(orderBy: [{ sortOrder: asc }]) { id question answer category sortOrder isPublished }
    troubleshootingGuides(orderBy: [{ title: asc }]) { id title slug symptomCategory stepsText language isPublished }
    resources(orderBy: [{ title: asc }]) { id title kind url file { url filename } language isPublished }
  }`)
  const pub = (x: any) => <Status value={x.isPublished ? 'published' : 'draft'} />
  const storyF = (x: any = {}) => [
    { name: 'title', label: 'Title', required: true, width: 'lg' as const, defaultValue: x.title }, { name: 'slug', label: 'Web address name', required: true, defaultValue: x.slug },
    { name: 'customerName', label: 'Customer', defaultValue: x.customerName }, { name: 'location', label: 'Where', defaultValue: x.location },
    { name: 'savingsText', label: 'Saving (one line)', width: 'lg' as const, defaultValue: x.savingsText }, { name: 'imageUrl', label: 'Photo web address', width: 'lg' as const, defaultValue: x.imageUrl },
    { name: 'body', label: 'Story', kind: 'textarea' as const, defaultValue: x.body }, { name: 'isPublished', label: 'On the storefront', kind: 'checkbox' as const, defaultValue: x.isPublished ?? true },
  ]
  const faqF = (x: any = {}) => [
    { name: 'question', label: 'Question', required: true, width: 'lg' as const, defaultValue: x.question }, { name: 'category', label: 'Group', width: 'sm' as const, defaultValue: x.category ?? 'general' },
    { name: 'sortOrder', label: 'Order', kind: 'number' as const, width: 'sm' as const, defaultValue: String(x.sortOrder ?? 0) },
    { name: 'answer', label: 'Answer', kind: 'textarea' as const, required: true, defaultValue: x.answer }, { name: 'isPublished', label: 'On the storefront', kind: 'checkbox' as const, defaultValue: x.isPublished ?? true },
  ]
  const guideF = (x: any = {}) => [
    { name: 'title', label: 'Title', required: true, width: 'lg' as const, defaultValue: x.title }, { name: 'slug', label: 'Web address name', required: true, defaultValue: x.slug },
    { name: 'symptomCategory', label: 'Problem', kind: 'select' as const, width: 'md' as const, defaultValue: x.symptomCategory ?? 'other', options: CATS.map(c => ({ value: c, label: label(c) })) },
    { name: 'language', label: 'Language', width: 'sm' as const, defaultValue: x.language ?? 'en' },
    { name: 'stepsText', label: 'Steps (one per line)', kind: 'textarea' as const, defaultValue: x.stepsText }, { name: 'isPublished', label: 'On the storefront', kind: 'checkbox' as const, defaultValue: x.isPublished ?? true },
  ]
  const resF = (x: any = {}) => [
    { name: 'title', label: 'Title', required: true, width: 'lg' as const, defaultValue: x.title },
    { name: 'kind', label: 'Kind', kind: 'select' as const, width: 'sm' as const, defaultValue: x.kind ?? 'manual', options: ['manual', 'video', 'guide'].map(v => ({ value: v, label: label(v) })) },
    { name: 'url', label: 'Web address (PDF or video)', width: 'lg' as const, defaultValue: x.url }, { name: 'language', label: 'Language', width: 'sm' as const, defaultValue: x.language ?? 'en' },
    { name: 'isPublished', label: 'On the storefront', kind: 'checkbox' as const, defaultValue: x.isPublished ?? true },
  ]
  return (
    <SettingsShell active={PATH} title="Storefront content" allowed>
      <Tabs active={view.key} items={VIEWS.map(v => ({ key: v.key, label: v.label, href: `${PATH}?view=${v.key}`, count: { stories: d.stories, faqs: d.faqs, guides: d.troubleshootingGuides, resources: d.resources }[v.key].length }))} />
      {view.key === 'stories' ? (
        <Section title="Customer stories">
          {d.stories.map((x: any) => <div key={x.id} className="border-b py-3 last:border-b-0"><div className="flex flex-wrap justify-between gap-2"><span className="font-medium">{x.title} <Meta>{x.customerName}{x.location ? `, ${x.location}` : ''}</Meta></span>{pub(x)}</div><Edit><RecordForm list="Story" id={x.id} submit="Save" paths={[PATH]} fields={storyF(x)} /></Edit></div>)}
          <Meta>Add a story</Meta><RecordForm list="Story" submit="Add story" paths={[PATH]} fields={storyF()} />
        </Section>
      ) : null}
      {view.key === 'faqs' ? (
        <Section title="Questions">
          {d.faqs.map((x: any) => <div key={x.id} className="border-b py-3 last:border-b-0"><div className="flex flex-wrap justify-between gap-2"><span className="font-medium">{x.question} <Meta>{x.category}</Meta></span><span className="flex gap-3">{pub(x)}<RemoveButton list="Faq" id={x.id} paths={[PATH]}>Remove</RemoveButton></span></div><Edit><RecordForm list="Faq" id={x.id} submit="Save" paths={[PATH]} fields={faqF(x)} /></Edit></div>)}
          <Meta>Add a question</Meta><RecordForm list="Faq" submit="Add question" paths={[PATH]} fields={faqF()} />
        </Section>
      ) : null}
      {view.key === 'guides' ? (
        <Section title="Troubleshooting guides">
          {d.troubleshootingGuides.map((x: any) => <div key={x.id} className="border-b py-3 last:border-b-0"><div className="flex flex-wrap justify-between gap-2"><span className="font-medium">{x.title} <Meta>{label(x.symptomCategory)} · {x.language}</Meta></span>{pub(x)}</div><Edit><RecordForm list="TroubleshootingGuide" id={x.id} submit="Save" paths={[PATH]} fields={guideF(x)} /></Edit></div>)}
          <Meta>Customers see the guide for their problem before they open a ticket; staff use it to triage.</Meta>
          <RecordForm list="TroubleshootingGuide" submit="Add guide" paths={[PATH]} fields={guideF()} />
        </Section>
      ) : null}
      {view.key === 'resources' ? (
        <Section title="Manuals and videos">
          {d.resources.map((x: any) => <div key={x.id} className="border-b py-3 last:border-b-0"><div className="flex flex-wrap justify-between gap-2"><span className="font-medium">{x.title} <Meta>{label(x.kind)} · {x.file?.url || x.url ? <a className="underline" href={x.file?.url || x.url} target="_blank" rel="noreferrer">open</a> : 'no file or address'}</Meta></span>{pub(x)}</div><Edit><RecordForm list="Resource" id={x.id} submit="Save" paths={[PATH]} fields={resF(x)} /></Edit></div>)}
          <RecordForm list="Resource" submit="Add manual or video" paths={[PATH]} fields={resF()} />
        </Section>
      ) : null}
    </SettingsShell>
  )
}

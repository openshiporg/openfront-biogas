import { q } from '../../lib/server'
import { label } from '../../lib/format'
import { Section, Meta, Status, Row } from '../../components/ui'
import { RecordForm } from '../../records/RecordForm'
import { RemoveButton } from '../../records/RecordButtons'
import { SettingsShell, settingsAccess, SETTINGS } from '../components/SettingsShell'

const PATH = `${SETTINGS}/checklists`
const KINDS = ['survey_farm', 'survey_kitchen', 'pre_install', 'install', 'commissioning', 'follow_up', 'service', 'delivery', 'maintenance']
const INPUTS = ['yes_no', 'number', 'text', 'choice', 'photo']

/** P62: checklists technicians fill on each visit type. Required items must be answered before the visit can be completed. */
export default async function ChecklistsSettingsPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const sp = await searchParams
  const { allowed } = await settingsAccess()
  if (!allowed) return <SettingsShell active={PATH} title="Checklists" allowed={false} />
  const d = await q<any>(`{ checklistTemplates(orderBy: [{ kind: asc }, { name: asc }]) { id name kind isActive items(orderBy: [{ sortOrder: asc }]) { id prompt helpText inputType choices unit isRequired sortOrder } } }`)
  const open = d.checklistTemplates.find((t: any) => t.id === sp.id) ?? d.checklistTemplates[0]
  return (
    <SettingsShell active={PATH} title="Checklists" allowed>
      <div className="flex flex-wrap gap-3 text-sm">
        {d.checklistTemplates.map((t: any) => <a key={t.id} href={`${PATH}?id=${t.id}`} className={open?.id === t.id ? 'font-medium underline' : 'text-muted-foreground hover:underline'}>{t.name}</a>)}
      </div>
      {open ? (
        <Section title={`${open.name} · ${label(open.kind)} · ${open.items.length} items`} aside={<Status value={open.isActive ? 'active' : 'paused'} />}>
          <RecordForm list="ChecklistTemplate" id={open.id} submit="Save checklist" paths={[PATH]} fields={[
            { name: 'name', label: 'Name', required: true, defaultValue: open.name },
            { name: 'kind', label: 'Used on', kind: 'select', width: 'md', defaultValue: open.kind, options: KINDS.map(k => ({ value: k, label: label(k) })) },
            { name: 'isActive', label: 'In use', kind: 'checkbox', defaultValue: open.isActive },
          ]} />
          {open.items.map((i: any, n: number) => (
            <div key={i.id} className="border-b py-2 last:border-b-0">
              <Row className="border-b-0 py-1">
                <span>{n + 1}. {i.prompt} <Meta>{label(i.inputType)}{i.unit ? ` (${i.unit})` : ''}{i.isRequired ? ' · required' : ''}{Array.isArray(i.choices) && i.choices.length ? ` · ${i.choices.join(' / ')}` : ''}</Meta></span>
                <RemoveButton list="ChecklistItem" id={i.id} paths={[PATH]}>Remove</RemoveButton>
              </Row>
              <details><summary className="cursor-pointer text-xs text-muted-foreground">Edit</summary>
                <RecordForm list="ChecklistItem" id={i.id} submit="Save item" paths={[PATH]} className="mt-2" fields={[
                  { name: 'prompt', label: 'Question', required: true, width: 'lg', defaultValue: i.prompt },
                  { name: 'inputType', label: 'Answer', kind: 'select', width: 'sm', defaultValue: i.inputType, options: INPUTS.map(v => ({ value: v, label: label(v) })) },
                  { name: 'unit', label: 'Unit', width: 'sm', defaultValue: i.unit },
                  { name: 'choices', label: 'Choices (JSON list)', width: 'md', defaultValue: JSON.stringify(i.choices ?? []) },
                  { name: 'sortOrder', label: 'Order', kind: 'number', width: 'sm', defaultValue: String(i.sortOrder ?? n) },
                  { name: 'helpText', label: 'Help for the technician', width: 'lg', defaultValue: i.helpText },
                  { name: 'isRequired', label: 'Required', kind: 'checkbox', defaultValue: i.isRequired },
                ]} />
              </details>
            </div>
          ))}
          <Meta>Add an item</Meta>
          <RecordForm list="ChecklistItem" fixed={{ template: open.id, sortOrder: String(open.items.length) }} submit="Add item" paths={[PATH]} fields={[
            { name: 'prompt', label: 'Question', required: true, width: 'lg' },
            { name: 'inputType', label: 'Answer', kind: 'select', width: 'sm', options: INPUTS.map(v => ({ value: v, label: label(v) })) },
            { name: 'unit', label: 'Unit', width: 'sm' },
            { name: 'isRequired', label: 'Required', kind: 'checkbox', defaultValue: true },
          ]} />
        </Section>
      ) : null}
      <Section title="New checklist">
        <RecordForm list="ChecklistTemplate" submit="Add checklist" paths={[PATH]} fields={[
          { name: 'name', label: 'Name', required: true }, { name: 'kind', label: 'Used on', kind: 'select', width: 'md', options: KINDS.map(k => ({ value: k, label: label(k) })) },
        ]} />
      </Section>
    </SettingsShell>
  )
}

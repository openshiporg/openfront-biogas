import { q } from '../../lib/server'

const cell = (v: unknown) => { const s = v === null || v === undefined ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
const minor = (n: number | null | undefined) => (n === null || n === undefined ? '' : (n / 100).toFixed(2))

/** P57: payments or invoices between two dates as CSV, read through the signed-in staff session (list access rules apply). */
export async function exportCsv(kind: string, from: string, to: string): Promise<{ name: string; body: string } | null> {
  const range = { gte: new Date(`${from}T00:00:00Z`).toISOString(), lt: new Date(new Date(`${to}T00:00:00Z`).getTime() + 86400000).toISOString() }
  if (kind === 'payments') {
    const d = await q<any>(`query($r: DateTimeNullableFilter!) { payments(where: { receivedAt: $r }, orderBy: [{ receivedAt: asc }], take: 10000) {
      receiptNumber receivedAt verifiedAt status method amount refundedAmount currencyCode reference payerPhone customer { number name } order { number } verifiedBy { name } collectedBy { name } } }`, { r: range })
    const rows = d.payments.map((p: any) => [p.receiptNumber, p.receivedAt, p.verifiedAt, p.status, p.method, minor(p.amount), minor(p.refundedAmount), p.currencyCode, p.reference, p.payerPhone, p.customer?.number, p.customer?.name, p.order?.number, p.collectedBy?.name, p.verifiedBy?.name])
    return { name: `payments-${from}-to-${to}.csv`, body: [['receipt', 'received_at', 'verified_at', 'status', 'method', 'amount', 'refunded', 'currency', 'reference', 'payer_phone', 'customer_number', 'customer', 'order', 'taken_by', 'verified_by'], ...rows].map(r => r.map(cell).join(',')).join('\n') }
  }
  if (kind === 'invoices') {
    const d = await q<any>(`query($r: DateTimeNullableFilter!) { invoices(where: { issuedAt: $r }, orderBy: [{ issuedAt: asc }], take: 10000) {
      number status issuedAt dueAt totalAmount currencyCode customer { number name } order { number } } }`, { r: range })
    const rows = d.invoices.map((i: any) => [i.number, i.status, i.issuedAt, i.dueAt, minor(i.totalAmount), i.currencyCode, i.customer?.number, i.customer?.name, i.order?.number])
    return { name: `invoices-${from}-to-${to}.csv`, body: [['number', 'status', 'issued_at', 'due_at', 'total', 'currency', 'customer_number', 'customer', 'order'], ...rows].map(r => r.map(cell).join(',')).join('\n') }
  }
  return null
}

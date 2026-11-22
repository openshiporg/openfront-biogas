import { exportCsv } from '@/features/platform/reports/lib/export'

const DAY = /^\d{4}-\d{2}-\d{2}$/

export async function GET(req: Request) {
  const u = new URL(req.url)
  const from = u.searchParams.get('from') ?? '', to = u.searchParams.get('to') ?? ''
  if (!DAY.test(from) || !DAY.test(to)) return new Response('Give from and to dates (YYYY-MM-DD).', { status: 400 })
  try {
    const out = await exportCsv(u.searchParams.get('kind') ?? '', from, to)
    if (!out) return new Response('Unknown export.', { status: 400 })
    return new Response(out.body, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${out.name}"`, 'cache-control': 'no-store' } })
  } catch {
    return new Response('Your role cannot export this.', { status: 403 })
  }
}

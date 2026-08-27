/**
 * GET /api/consultations?gp&status&ministry&q → ConsultationsResponse.
 * status: open|closed|all (default all); q searches title, citation,
 * and ministry server-side (docs/architecture.md §5).
 */
import type { ConsultationsResponse, ConsultationStatus } from '#shared/types'
import { GP_RE } from '#shared/utils/gp'

const STATUS_VALUES: ConsultationStatus[] = ['open', 'closed', 'all']

function isStatus(s: string): s is ConsultationStatus {
  return (STATUS_VALUES as readonly string[]).includes(s)
}

export default defineEventHandler(async (event): Promise<ConsultationsResponse> => {
  const query = getQuery(event)

  const gpParam = firstQueryValue(query.gp)?.toUpperCase()
  if (gpParam !== undefined && !GP_RE.test(gpParam)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Ungültige Gesetzgebungsperiode (römische Ziffern erwartet)',
    })
  }

  const statusParam = firstQueryValue(query.status) ?? 'all'
  if (!isStatus(statusParam)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Ungültiger Status (open, closed oder all erwartet)',
    })
  }
  const status = statusParam

  const ministry = firstQueryValue(query.ministry)?.toUpperCase()
  const q = firstQueryValue(query.q)?.toLowerCase()

  const currentGp = await getCurrentGp()
  const gp = gpParam ?? currentGp
  const items = (await getConsultationsForGp(gp)).items.map(reconcileActive)

  // Filter vocabulary of the GP: all ministries, independent of the active filter.
  const ministryMap = new Map<string, string>()
  for (const item of items) {
    if (item.ministryCode && !ministryMap.has(item.ministryCode)) {
      ministryMap.set(item.ministryCode, item.ministryName)
    }
  }
  const ministries = [...ministryMap.entries()]
    .map(([code, name]) => ({ code, name }))
    .sort((a, b) => a.code.localeCompare(b.code, 'de-AT'))

  const filtered = items.filter((item) => {
    if (status === 'open' && !item.active) return false
    if (status === 'closed' && item.active) return false
    if (ministry && item.ministryCode.toUpperCase() !== ministry) return false
    if (q) {
      const haystack =
        `${item.title} ${item.citation} ${item.ministryName} ${item.ministryCode}`.toLowerCase()
      if (!haystack.includes(q)) return false
    }
    return true
  })

  const availableGps = listAvailableGps(currentGp)
  if (!availableGps.includes(gp)) availableGps.push(gp)

  // Open first, nearest Frist leading (the acting audience's order: "which
  // deadline ends next?"); closed after, most recently ended first. A dead
  // item must never lead the page while consultations end this week.
  const sorted = [...filtered].sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1
    if (a.active) {
      if (a.deadline && b.deadline) {
        return a.deadline.localeCompare(b.deadline) || b.inr - a.inr
      }
      // Open without Frist has no urgency — after the dated ones.
      if (a.deadline !== b.deadline) return a.deadline ? -1 : 1
      return b.arrivedAt.localeCompare(a.arrivedAt) || b.inr - a.inr
    }
    const aEnd = a.deadline ?? a.arrivedAt
    const bEnd = b.deadline ?? b.arrivedAt
    return bEnd.localeCompare(aEnd) || b.inr - a.inr
  })

  return {
    items: sorted,
    total: sorted.length,
    gp,
    availableGps,
    ministries,
  }
})

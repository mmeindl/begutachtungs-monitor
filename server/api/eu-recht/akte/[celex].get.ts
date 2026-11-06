/**
 * GET /api/eu-recht/akte/:celex?gp= → EuActResponse: one EU act and every
 * draft of the window that names it — those that implement it, those that
 * only restate it, the Länder with none (docs/architecture.md §12.66,
 * Nachtrag 3). Two dates and a stand per draft, no verdict (rule D6).
 *
 * 400 for a CELEX that is no act's (`3` + year + L/R/D/F + number), 404 for
 * an act no draft of the map names, 503 while no build has finished — the
 * page must not say „no draft" where nobody has looked.
 */
import type { EuActDraft, EuActResponse } from '#shared/types'
import { reconcileActive } from '../../../utils/parliament/drafts'
import { withRisActiveOn } from '../../../utils/ris/risRecord'
import { withLandActiveOn } from '../../../utils/laender/sources'
import { gpFromParam, readGpQuery, requirePlausibleGp } from '../../../utils/http/params'
import { actPageOf } from '../../../utils/eu/euMap'

/** An act's CELEX: sector 3, year, L(Richtlinie) R(Verordnung) D(Beschluss) F(Rahmenbeschluss), number. */
const ACT_CELEX_RE = /^3\d{4}[LRDF]\d{4}$/

export default defineEventHandler(async (event): Promise<EuActResponse> => {
  const celex = (getRouterParam(event, 'celex') ?? '').toUpperCase()
  if (!ACT_CELEX_RE.test(celex)) throw createError({ statusCode: 400, statusMessage: 'Ungültige CELEX-Nummer' })
  const currentGp = await getCurrentGp()
  const gp = requirePlausibleGp(gpFromParam(readGpQuery(event), currentGp), currentGp)
  const map = await getEuMap(gp)
  if (!map) throw createError({ statusCode: 503, statusMessage: 'Die EU-Übersicht wird gerade aufgebaut' })
  const page = actPageOf(map, celex)
  if (!page) throw createError({ statusCode: 404, statusMessage: 'Kein Entwurf nennt diesen Rechtsakt' })
  return {
    gp,
    window: map.window,
    builtAt: map.builtAt,
    ...page,
    implementing: page.implementing.map(activeToday),
    restating: page.restating.map(activeToday),
    incomplete: map.incomplete,
  }
})

/**
 * `active` decided per request, as the lists decide it (`reconcileActive`,
 * `withRisActiveOn`, `withLandActiveOn`): the map is cached for hours, and a
 * row must not count down a Frist that ended since it was assembled.
 */
function activeToday(d: EuActDraft): EuActDraft {
  const row = d.row
  if (row.kind === 'me') return { ...d, row: { ...row, draft: reconcileActive(row.draft) } }
  if (row.kind === 'ris') return { ...d, row: { ...row, item: withRisActiveOn([row.item])[0]! } }
  return { ...d, row: { ...row, item: withLandActiveOn([row.item])[0]! } }
}

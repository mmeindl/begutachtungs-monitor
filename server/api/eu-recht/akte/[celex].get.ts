/**
 * GET /api/eu-recht/akte/:celex?gp= → EuActResponse: one EU act and every
 * draft of the window that names it — those that implement it, those that
 * only restate it, the Länder with none. Two dates and a stand per draft, no verdict (rule D6).
 * Beside them, from the Cellar per request: the act's Amtsblatt reference
 * for the „Zitieren" button (`ojReferenceOf`) and its rail — who adopted
 * it, the procedure from the proposal on, entry into force and application
 * (`railOf`). Either is null where the Cellar did not answer; the page then
 * cites without the reference and says the procedure could not be read.
 *
 * A DIRECTIVE NO DRAFT NAMES HAS A PAGE TOO (15.11.2026, step 7): the list
 * of directives to transpose links every directive, also where nobody
 * works on it. Its head then comes from the Cellar's own record of the act
 * (`directiveHeadOf`), and the page lists no draft. For a directive the
 * answer also carries what the Member State notified to the Commission
 * (`actMeasuresOf`), null where the Cellar did not answer.
 *
 * 400 for a CELEX that is no act's (`3` + year + L/R/D/F + number), 404 for
 * an act that is neither named by a draft of the map nor a directive the
 * Cellar knows, 503 while no build has finished — the page must not say
 * „no draft" where nobody has looked.
 */
import type { EuActDraft, EuActResponse, LandCode } from '#shared/types'
import { EU_MEMBER_STATE } from '#shared/utils/eu'
import { LAND_CODES } from '#shared/utils/laender'
import { reconcileActive } from '../../../utils/parliament/drafts'
import { withRisActiveOn } from '../../../utils/ris/risRecord'
import { withLandActiveOn } from '../../../utils/laender/sources'
import { gpFromParam, readGpQuery, requirePlausibleGp } from '../../../utils/http/params'
import { actPageOf } from '../../../utils/eu/euMap'
import { actMeasuresOf, ojReferenceOf, railOf, transpositionOf } from '../../../utils/eu/cellarService'
import { directiveHeadOf } from '../../../utils/eu/umsetzung'

/** An act's CELEX: sector 3, year, L(Richtlinie) R(Verordnung) D(Beschluss) F(Rahmenbeschluss), number. */
const ACT_CELEX_RE = /^3\d{4}[LRDF]\d{4}$/

export default defineEventHandler(async (event): Promise<EuActResponse> => {
  const celex = (getRouterParam(event, 'celex') ?? '').toUpperCase()
  if (!ACT_CELEX_RE.test(celex)) throw createError({ statusCode: 400, statusMessage: 'Ungültige CELEX-Nummer' })
  const currentGp = await getCurrentGp()
  const gp = requirePlausibleGp(gpFromParam(readGpQuery(event), currentGp), currentGp)
  const map = await getEuMap(gp)
  if (!map) throw createError({ statusCode: 503, statusMessage: 'Die EU-Übersicht wird gerade aufgebaut' })
  const page = actPageOf(map, celex) ?? await unnamedDirectivePage(celex, map.incomplete)
  if (!page) throw createError({ statusCode: 404, statusMessage: 'Kein Entwurf nennt diesen Rechtsakt' })
  const directive = page.act.kind === 'richtlinie'
  // Asked side by side, so the page waits for the slower of the two, not both
  // in turn. A Cellar that does not answer costs the citation its Amtsblatt
  // reference and the rail its procedure, never the page.
  const [published, rail, measures] = await Promise.all([
    ojReferenceOf(celex),
    railOf(celex),
    directive ? actMeasuresOf(EU_MEMBER_STATE, celex) : null,
  ])
  return {
    gp,
    window: map.window,
    builtAt: map.builtAt,
    ...page,
    implementing: page.implementing.map(activeToday),
    restating: page.restating.map(activeToday),
    incomplete: map.incomplete,
    oj: published?.oj ?? null,
    eli: published?.eli ?? null,
    rail,
    measures,
    memberState: directive ? EU_MEMBER_STATE : null,
  }
})

/**
 * The page of a directive the map does not hold: its head from the Cellar,
 * no draft, and every Land the last build read as one without a draft.
 * Null where the CELEX is no directive's or the Cellar does not know it.
 */
async function unnamedDirectivePage(celex: string, incomplete: readonly string[]): Promise<Pick<EuActResponse, 'act' | 'implementing' | 'restating' | 'landsWithout'> | null> {
  if (celex[5] !== 'L') return null
  const dates = await transpositionOf(celex)
  const act = dates ? directiveHeadOf(celex, dates) : null
  if (!act) return null
  return { act, implementing: [], restating: [], landsWithout: LAND_CODES.filter((l: LandCode) => !incomplete.includes(l)) }
}

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

/**
 * GET /api/eu-recht/vorschlag/:year/:number → EuVorschlagResponse: one
 * proposal of the Commission by its COM number — COM(2026) 780 is
 * `/api/eu-recht/vorschlag/2026/780` — with its procedure as far as the
 * Cellar records it (`proposalOf`), and beside it the consultation behind
 * it on the Commission's portal (`consultationOf`), within the act page's
 * portal budget (step 3 of the EU cycle, 15.11.2026).
 *
 * 400 for a year that is no four digits between 1990 and next year, or a
 * number that is not one to four digits without a leading zero (the page
 * answers a padded number 301 to the canonical address before asking).
 * 404 only where the Cellar answered and does not know the number. A
 * Cellar that does not answer is `proposal: null` — the page says it could
 * not read the procedure, never that there is none.
 *
 * THE ACTS' PAGES. An act the proposal produced is linked to the monitor's
 * page only where that page exists today: an act of the period's map, or a
 * directive (every directive the Cellar knows has a page since step 7).
 * Any other act would answer 404 there, so it is linked to EUR-Lex. The
 * map is asked within the lists' budget (`euMapForList`); a map not at
 * hand costs a non-directive its link to the monitor, never the page.
 */
import type { EuProposalAct, EuVorschlagResponse } from '#shared/types'
import { euActPath, euProposalAddress, type EU_ACT_PATH_WORD } from '#shared/utils/eu'
import { euProposalActs, euProposalRedirect } from '#shared/utils/euVorschlag'
import { todayIso } from '#shared/utils/format'
import { eurLexCelexUrl } from '../../../../utils/eu/cellarDossier'
import { proposalCelex } from '../../../../utils/eu/cellarVorschlag'
import { proposalOf } from '../../../../utils/eu/cellarService'
import { consultationOf } from '../../../../utils/eu/portalService'
import { withinBudget } from '../../../../utils/http/budget'

/** As on an act's page (`PORTAL_BUDGET_MS` in `akte/[celex].get.ts`): past it the page says the consultation could not be read, and the reading goes on into the cache. */
const PORTAL_BUDGET_MS = 9_000

const ACT_KIND: Record<string, keyof typeof EU_ACT_PATH_WORD> = { L: 'richtlinie', R: 'verordnung', D: 'beschluss', F: 'rahmenbeschluss' }
const KIND_LABEL: Record<keyof typeof EU_ACT_PATH_WORD, string> = { richtlinie: 'Richtlinie', verordnung: 'Verordnung', beschluss: 'Beschluss', rahmenbeschluss: 'Rahmenbeschluss' }

/**
 * An act's label without its title: the form since 2015 („Verordnung (EU)
 * 2024/1747") from the CELEX; before 2015 the number's suffix („/EG") is
 * not in the CELEX, so the CELEX itself stands, as `directiveLabel` does.
 */
function labelOf(celex: string): string {
  const m = /^3(\d{4})([LRDF])(\d{4})$/.exec(celex)
  const kind = m ? ACT_KIND[m[2]!] : undefined
  if (m && kind && Number(m[1]) >= 2015) return `${KIND_LABEL[kind]} (EU) ${m[1]}/${Number(m[3])}`
  return `CELEX ${celex}`
}

export default defineEventHandler(async (event): Promise<EuVorschlagResponse> => {
  const address = euProposalAddress(getRouterParam(event, 'year') ?? '', getRouterParam(event, 'number') ?? '', todayIso())
  const celex = address ? proposalCelex(address.year, address.number) : null
  if (!address || !celex) throw createError({ statusCode: 400, statusMessage: 'Ungültige Nummer eines Vorschlags' })
  const reference = `COM(${address.year}) ${address.number}`

  // Side by side: the page waits for the slower of the two, not both in turn.
  const [read, consultation] = await Promise.all([
    proposalOf(celex),
    withinBudget(consultationOf([reference]), PORTAL_BUDGET_MS),
  ])
  if (read.state === 'unbekannt') throw createError({ statusCode: 404, statusMessage: 'Kein Vorschlag mit dieser Nummer im Cellar' })
  const record = read.state === 'gelesen' ? read.record : null

  const celexes = record ? euProposalActs(record) : []
  const map = celexes.some((c) => c[5] !== 'L') ? await euMapForList(await getCurrentGp()) : null
  const acts: EuProposalAct[] = celexes.map((c) => {
    const pageExists = c[5] === 'L' || !!map?.acts[c]
    return { celex: c, label: map?.acts[c]?.label ?? labelOf(c), path: pageExists ? euActPath(c) : null, eurLexUrl: eurLexCelexUrl(c) }
  })

  return {
    reference,
    celex,
    eurLexUrl: eurLexCelexUrl(celex),
    proposal: record,
    acts,
    redirect: euProposalRedirect(acts),
    consultation: consultation ?? { state: 'ungelesen', reference: `COM(${address.year})${address.number}` },
  }
})

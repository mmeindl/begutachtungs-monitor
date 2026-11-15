/**
 * Every Initiativantrag of a period with its state — the Nuxt-aware glue of
 * `/api/antraege` around the pure decisions in `antraege.ts`.
 *
 * WHAT IT READS, cached elsewhere already: list 101's Anträge of the period
 * (`getAntraegeForGp`, one call, read by the list of laws without a
 * Begutachtung too), the BGBl Teil-I Jahrgänge (the Verordnung join's
 * pages), and one detail JSON per Antrag whose row cannot answer
 * (`needsReading`) through the leaf cache `gegenstand` — about 100 for
 * GP XXVIII (its Anträge still in the house), about 80 for XXVII (the
 * erledigten ones whose vote did not carry).
 *
 * NO CACHE OF ITS OWN, as `zweite-runde` has none: the answer is a join of
 * cached reads, cheap to compute again, and a derived copy would be one more
 * memo on a 704 MB box (plan, „Cache, heap and cold start").
 *
 * A FAILURE IS NOT AN ANSWER. A record that did not arrive within the budget
 * leaves its row at the weakest state the list carries — `pending-unverified`
 * („in Behandlung", never „Stellungnahme möglich"), `ended` — and the reads
 * run on into the leaf cache, so the next request has them. The Jahrgänge
 * failing makes no row `promulgated` and says so (`bgblUnread`).
 */
import type { AntraegeResponse } from '#shared/types'
import { carriesDraft } from '#shared/utils/antragPath'
import { ANTRAG_PATHS } from '#shared/utils/antragPathTable'
import { gpHasEnded, periodAgainstSource } from '#shared/utils/gp'
import { todayIso } from '#shared/utils/format'
import { withinBudget } from '../http/budget'
import { mapWithConcurrency } from '../pool'
import { pickBgblIForItem } from '../ris/bgblVorlage'
import { getBgblTeil1Year } from '../ris/bgblService'
import type { BgblRecord } from '../ris/bgblJoin'
import { BGBL_AUTH_FROM, yearsOfPeriod } from '../ris/skippedLaws'
import { antragRowOf, classifyAntrag, compareAntragRows, needsReading, readAntragDetail, type AntragReading } from './antraege'
import { getAntraegeForGp, getCurrentGp, getGegenstand } from './drafts'

/** Detail reads at a time — the committee reads' limit (`skippedLawsService`). */
const READ_CONCURRENCY = 4
/** How long the list waits for the records before it answers with what came. */
const READ_BUDGET_MS = 20_000

/**
 * The Anträge whose text carries a consulted draft (`ANTRAG_PATHS`,
 * `carriesDraft`): the list shows them as their draft's row („als
 * Initiativantrag …"), so they are no row of their own here. An Antrag with
 * only a part of a draft's text (72/A XXVIII) stays a row: its draft's row
 * does not name it.
 */
function carriedAntraege(gp: string): Set<number> {
  return new Set(Object.values(ANTRAG_PATHS[gp] ?? {}).filter((p) => carriesDraft(p)).map((p) => p.antrag.inr))
}

export async function getAntraege(gp: string): Promise<AntraegeResponse> {
  const [rows, currentGp] = await Promise.all([getAntraegeForGp(gp), getCurrentGp()])
  const running = !gpHasEnded(gp, currentGp) && gp === currentGp
  const years = yearsOfPeriod(gp, todayIso()) ?? []
  let records: BgblRecord[] | null
  try {
    records = years.length ? (await Promise.all(years.map((y) => getBgblTeil1Year(y)))).flat() : null
  } catch {
    records = null
  }
  const carried = carriedAntraege(gp)
  const own = rows.filter((row) => !carried.has(row.inr))
  const bgblOf = new Map(own.map((row) => [row.inr, records ? pickBgblIForItem(records, gp, { ityp: 'A', inr: row.inr }) : null]))

  // The records, as they arrive: what came within the budget counts, the
  // rest goes on into the leaf cache.
  const readings = new Map<number, AntragReading>()
  const toRead = own.filter((row) => needsReading(row, running, bgblOf.get(row.inr) !== null))
  await withinBudget(
    mapWithConcurrency(toRead, READ_CONCURRENCY, async (row) => {
      try {
        readings.set(row.inr, readAntragDetail((await getGegenstand(gp, 'A', row.inr)).content))
      } catch {
        // One record that fails leaves its row at the weakest state.
      }
    }),
    READ_BUDGET_MS,
  )

  const items = own
    .map((row) => {
      const bgbl = bgblOf.get(row.inr) ?? null
      const reading = readings.get(row.inr)
      const state = classifyAntrag(row, { running, promulgated: bgbl !== null, reading })
      return antragRowOf(row, state, bgbl, reading)
    })
    .sort(compareAntragRows)
  // A period that ended before the Bundesgesetzblatt in RIS begins was
  // never read: no failure, and the list says it in its own words
  // (`coversFrom`, 15.11.2026) rather than „gerade nicht abrufbar".
  const beforeSource = periodAgainstSource(gp, BGBL_AUTH_FROM) === 'before'
  return { gp, running, items, bgblUnread: records === null && !beforeSource, coversFrom: BGBL_AUTH_FROM }
}

/**
 * Every treaty's Vorlage of a period with its state — the Nuxt-aware glue of
 * `/api/staatsvertraege` around `staatsvertraege.ts`.
 *
 * WHAT IT READS, cached elsewhere already: the period's item list
 * (`getItemsForGp`, one call shared with the Vorlagen and the committee
 * motions) and the BGBl Teil-I and Teil-III Jahrgänge (the same Jahrgang
 * pages as the Verordnung join), and — only for an erledigtes item RIS has
 * no record for — the item's detail record, for Parliament's BGBl link
 * (`resolveTreatyBgbl`, the page's rule): 7 in XXVIII, 14 in XXVII on
 * 14.11.2026. No cache of its own: a join of cached reads, as `/api/antraege`.
 * A record that does not arrive within the budget leaves its row without
 * the link — `approved`/`unlisted`, the weaker state.
 *
 * Every Jahrgang from the period's first year to today: a treaty's
 * Kundmachung can come years after its approval (2,023 days at most in GP
 * XXVII, `pnpm corpus:staatsvertraege`).
 */
import type { StaatsvertraegeResponse } from '#shared/types'
import { GP_STARTS, gpHasEnded } from '#shared/utils/gp'
import { todayIso } from '#shared/utils/format'
import type { BgblRecord } from '../ris/bgblJoin'
import { withinBudget } from '../http/budget'
import { mapWithConcurrency } from '../pool'
import { extractBgblLink } from './detailJson'
import { getBgblTeil1Year, getBgblTeil3Year } from '../ris/bgblService'
import { getCurrentGp, getGegenstand, getItemsForGp } from './drafts'
import { TREATY_DOKTYP } from './vorlageDetailAssembly'
import { compareTreatyRows, needsTreatyLink, treatyRowOf } from './staatsvertraege'

/** Detail reads at a time, and how long the list waits for them (`antraegeService`). */
const READ_CONCURRENCY = 4
const READ_BUDGET_MS = 20_000

export async function getStaatsvertraege(gp: string): Promise<StaatsvertraegeResponse> {
  const [rows, currentGp] = await Promise.all([getItemsForGp(gp), getCurrentGp()])
  const running = !gpHasEnded(gp, currentGp) && gp === currentGp
  const first = Number((GP_STARTS[gp] ?? '').slice(0, 4))
  const now = Number(todayIso().slice(0, 4))
  const years: number[] = []
  if (Number.isFinite(first) && first > 0) for (let y = first; y <= now; y++) years.push(y)
  let records: BgblRecord[] | null
  try {
    records = years.length ? (await Promise.all(years.flatMap((y) => [getBgblTeil1Year(y), getBgblTeil3Year(y)]))).flat() : null
  } catch {
    records = null
  }
  const treaties = rows.filter((row) => row.doktyp === TREATY_DOKTYP)
  const links = new Map<number, ReturnType<typeof extractBgblLink>>()
  await withinBudget(
    mapWithConcurrency(treaties.filter((row) => needsTreatyLink(row, records)), READ_CONCURRENCY, async (row) => {
      try {
        links.set(row.inr, extractBgblLink((await getGegenstand(gp, 'I', row.inr)).content?.status?.bgbllinks))
      } catch {
        // One record that fails leaves its row without the link.
      }
    }),
    READ_BUDGET_MS,
  )
  const items = treaties
    .map((row) => treatyRowOf(row, records, running, links.get(row.inr) ?? null))
    .sort(compareTreatyRows)
  return { gp, running, items, bgblUnread: records === null }
}

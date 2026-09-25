/**
 * "Zuletzt Gesetz geworden" — the drafts whose law reached the
 * Bundesgesetzblatt (docs/architecture.md §12.23).
 *
 * Why it reads list 101 and not our own closed drafts: what the section
 * needs is the END of the chain, and the Ministerialentwurf does not know
 * it. Its stage record stops at the Regierungsvorlage (88/ME ends with
 * "Regierungsvorlage (474 d.B.)"; the Kundmachung is on the Vorlage).
 * Walking the drafts would cost two fetches per row to learn what one fetch
 * on the Vorlage says, and would still miss a law whose Begutachtung ended
 * long before the vote.
 *
 * So: list 101 (one call for the whole GP, already cached for the second
 * round), narrowed by the Status column to the finished Vorlagen — 111 of
 * 117 in GP XXVIII on 2026-09-18 — then one detail JSON each for the newest
 * SCAN of them. Measured cold the same day: 30 parallel Gegenstand fetches
 * answer in 0.54 s wall (0.42 s each), so the section is server-rendered
 * like the rest of the accountability layer.
 *
 * ORDER IS THE BGBl NUMBER, not a date: see `bgblOrderKey`. Selection is
 * strictly that order — which law gets shown is never a judgement.
 */
import type { ClosedOutcome, DraftSummary } from '#shared/types'
import { HOME_LIST_LENGTH } from '#shared/utils/draftOrder'
import { STATUS_FINISHED } from '#shared/utils/draftStations'
import { bgblOrderKey, extractBgblLink } from './detailJson'
import { pickEnacted, type EnactedCandidate } from './enactedOrder'
import { previousGp } from '#shared/utils/gp'
import { getCurrentGp, getDraftsForGp, getGegenstand, getVorlagenForGp, reconcileActive } from './drafts'

/**
 * How many finished Vorlagen are opened before the order is applied.
 *
 * The list can only be narrowed by Einlangen, and Einlangen does not order
 * promulgations: measured 2026-09-18 over the 30 newest finished Vorlagen of
 * GP XXVIII, the gap between Einlangen and the vote runs up to 91 days
 * (449 d.B., 26.03. → 25.06.), while 30 Vorlagen are about six months of
 * arrivals at the observed rate (117 in the GP). Two times the worst
 * observed lag is the margin; it costs 30 cached fetches and buys that the
 * newest Kundmachung cannot sit just outside the window.
 */
const SCAN = 30

/**
 * One candidate: the Vorlage's Kundmachung plus the draft it came from.
 * What is done with a list of them — order, one row per draft — is
 * `enactedOrder.ts`, where it can be read back.
 */
interface Candidate extends EnactedCandidate {
  rvCitation: string
  bgblNumber: string
}

/** One period's newest Kundmachungen, at most `HOME_LIST_LENGTH` of them. */
async function enactedOf(gp: string): Promise<ClosedOutcome[]> {
  const vorlagen = (await getVorlagenForGp(gp))
    .filter((v) => v.status === STATUS_FINISHED)
    .sort((a, b) => b.date.localeCompare(a.date) || b.inr - a.inr)
    .slice(0, SCAN)

  const scanned = await Promise.all(
    vorlagen.map(async (v): Promise<Candidate | null> => {
      try {
        const detail = await getGegenstand(gp, 'I', v.inr)
        const bgbl = extractBgblLink(detail.content?.status?.bgbllinks)
        const order = bgblOrderKey(bgbl?.number)
        if (!bgbl?.number || order === null) return null

        /* No Ministerialentwurf, no row — and that is not a gap in the
         * data but a fact about the law: 6 of these 30 never were in
         * Begutachtung (Bundesfinanzgesetze, UWG-Novelle, measured
         * 2026-09-18). A Begutachtungs-Monitor showing them here would
         * answer "aus welcher Begutachtung?" with silence.
         * `preconst` is not a universal field, so its absence is never
         * proof on its own (docs/api-exploration.md §101). */
        const pre = detail.content?.preconst ?? []
        const me = pre.find((p) => p?.ityp === 'ME' && p.gp_code && p.inr != null)
        if (!me) return null

        return {
          order,
          rvCitation: v.citation,
          bgblNumber: bgbl.number,
          draft: { gp: String(me.gp_code), inr: Number(me.inr) },
        }
      } catch {
        // Per-item tolerance, as everywhere in this layer: one failing
        // Gegenstand must not take the section down.
        return null
      }
    }),
  )
  const candidates = pickEnacted(scanned.filter((c): c is Candidate => c !== null))

  /* The rows themselves come from list 81 — the same cached leaf the rest of
   * the page reads, so the card carries the Frist, the Ressort and the
   * Stellungnahmen count without a single fetch of its own. Grouped by GP
   * because a Vorlage may carry a draft from the period before it. */
  const byGp = new Map<string, Map<number, DraftSummary>>()
  const items: ClosedOutcome[] = []
  for (const c of candidates) {
    if (items.length >= HOME_LIST_LENGTH) break
    let drafts = byGp.get(c.draft.gp)
    if (!drafts) {
      try {
        const { items: rows } = await getDraftsForGp(c.draft.gp)
        drafts = new Map(rows.map((d) => [d.inr, d]))
      } catch {
        drafts = new Map()
      }
      byGp.set(c.draft.gp, drafts)
    }
    const draft = drafts.get(c.draft.inr)
    // A draft we cannot describe is a row we cannot render: the card is the
    // Begutachtung, not the law.
    if (!draft) continue
    items.push({
      ...reconcileActive(draft),
      rvCitation: c.rvCitation,
      bgblNumber: c.bgblNumber,
    })
  }

  return items
}

/**
 * The section as the page gets it: the newest Kundmachungen, and the period
 * they came out of (docs/architecture.md §12.35).
 *
 * A new Gesetzgebungsperiode promulgates nothing for months — measured
 * 2026-09-25, GP XXVIII's first law out of a Ministerialentwurf was BGBl. I
 * Nr. 25/2025, whose Vorlage did not even arrive until 201 days after the
 * period convened; GP XXVII's first was 14 days in. So the section falls
 * back to the period before, NAMED, instead of standing empty through the
 * weeks in which a new government is watched hardest.
 *
 * THE CONDITION IS „no row at all", not a count, and here that is enough —
 * unlike the volume ranking next to it, which needs a second clause
 * (`canRankPeriod`). A ranking of one is not a ranking; a single Kundmachung
 * is a whole fact, and „zuletzt Gesetz geworden" is true of it the moment it
 * exists.
 *
 * Note what the fallback is NOT needed for: a row whose draft comes from an
 * earlier period. That case is ordinary and already handled — the scan reads
 * list 101 of one period, but a Vorlage may carry a Ministerialentwurf from
 * the one before it, and four of GP XXVII's first six laws did. The fallback
 * moves the period whose VORLAGEN are scanned, nothing else.
 */
export async function getRecentlyEnacted(): Promise<{ gp: string; items: ClosedOutcome[] }> {
  const gp = await getCurrentGp()
  const items = await enactedOf(gp)
  if (items.length) return { gp, items }

  const prev = previousGp(gp)
  if (!prev) return { gp, items }
  try {
    const fallback = await enactedOf(prev)
    return fallback.length ? { gp: prev, items: fallback } : { gp, items }
  } catch {
    /* Per-period tolerance, as everywhere in this layer: the fallback is a
     * second chance, never a second way to fail. The page then says the
     * running period has no Kundmachung yet, which is what it knows. */
    return { gp, items }
  }
}

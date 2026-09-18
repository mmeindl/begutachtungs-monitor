/**
 * GET /api/dashboard/zweite-runde → DashboardSecondRound: the
 * Regierungsvorlagen that are taking Stellungnahmen **right now**.
 *
 * Why this exists. Anyone can file on a Vorlage in the Nationalrat the same
 * way they filed on the Ministerialentwurf — same list upstream, same form.
 * Until this section the monitor showed that window only on the detail page
 * of a draft that happened to have a Vorlage, so the one moment where a
 * closed Begutachtung still has an open door was invisible to anyone who
 * did not already know which page to open. In the Nachverfolgung reading
 * this is the input that can still change the text in the Ausschuss.
 *
 * Cost. ONE list-101 call for the whole period, narrowed by its `Status`
 * column to the handful still before the Nationalrat (6 of 117 on
 * 2026-09-15), then one detail JSON and one sizing call per candidate. The
 * `Status` column agreed with the authoritative flag on 117 of 117 GP-XXVIII
 * Vorlagen — and is still used only to NARROW: `statementsstate` is read per
 * item and decides what is shown. Verify, then display; a proxy that was
 * right yesterday is not a claim.
 *
 * Deliberately NOT in /feed.xml or /kalender.ics: the Vorlage publishes no
 * Frist — the form closes with the vote — so there is no date an alert or a
 * calendar entry could hang on.
 */
import type { DashboardSecondRound, OpenVorlage } from '#shared/types'

/** Upstream's "still before the Nationalrat" (`mapVorlageRow`). */
const STATUS_IN_HOUSE = '2'

export default defineEventHandler(async (): Promise<DashboardSecondRound> => {
  const gp = await getCurrentGp()
  const candidates = (await getVorlagenForGp(gp)).filter((v) => v.status === STATUS_IN_HOUSE)

  const resolved = await Promise.all(
    candidates.map(async (v): Promise<OpenVorlage | null> => {
      try {
        const detail = await getGegenstand(gp, 'I', v.inr)
        // The claim on screen is this flag, not the list column above.
        if (!isFilingOpen(detail.content)) return null

        // The Begutachtung it came from, if there was one. `preconst` is not
        // a universal field, so a missing pointer means "we have no page for
        // it", never "no Begutachtung happened" — the row then links out.
        const pre = detail.content?.preconst ?? []
        const me = pre.find((p) => p?.ityp === 'ME' && p.gp_code && p.inr != null) ?? null

        // The count enriches the row; it must not be able to remove it.
        const statementCount = await getStatementsForRv(gp, v.inr)
          .then((s) => s.total)
          .catch(() => null)

        return {
          citation: v.citation,
          title: v.title,
          date: v.date,
          parliamentUrl: v.parliamentUrl,
          statementCount,
          draft: me ? { gp: String(me.gp_code), inr: Number(me.inr) } : null,
        }
      } catch {
        // Per-item tolerance, as in the outcomes section: one failing
        // Gegenstand must not take the whole section down.
        return null
      }
    }),
  )

  const items = resolved
    .filter((v): v is OpenVorlage => v !== null)
    .sort((a, b) => b.date.localeCompare(a.date) || b.citation.localeCompare(a.citation))

  return { gp, items }
})

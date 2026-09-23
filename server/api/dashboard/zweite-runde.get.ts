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
 * 2026-09-15; the column has two such values, see below), then one detail
 * JSON and one sizing call per candidate, plus
 * list 81 once — but only when a row names no Ministerialentwurf and the
 * section would otherwise claim there was none. The
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

/**
 * Upstream's "still before the Nationalrat" (`mapVorlageRow`) — BOTH values
 * of it.
 *
 * `2` is the Vorlage in Behandlung; `1` is „Einlangen im Nationalrat", the
 * days between arriving and being assigned. The form is open in both, and
 * narrowing on `2` alone silently dropped the newest arrivals — exactly the
 * ones with the most time left to file. On 23.09.2026 seven GP-XXVIII
 * Vorlagen stood at status 1 (620–626 d.B.) and none of them reached this
 * section.
 *
 * Still only a narrowing: `isFilingOpen` is read per item below and is what
 * the section claims. Verify, then display.
 */
const STATUS_BEFORE_THE_HOUSE = new Set(['1', '2'])

/** One row, before the cross-check has decided about the missing pointer. */
type PendingVorlage = Omit<OpenVorlage, 'consultation'> & {
  consultation: OpenVorlage['consultation'] | { kind: 'unresolved' }
}

export default defineEventHandler(async (): Promise<DashboardSecondRound> => {
  const gp = await getCurrentGp()
  const candidates = (await getVorlagenForGp(gp)).filter((v) => STATUS_BEFORE_THE_HOUSE.has(v.status))

  const resolved = await Promise.all(
    candidates.map(async (v): Promise<PendingVorlage | null> => {
      try {
        const detail = await getGegenstand(gp, 'I', v.inr)
        // The claim on screen is this flag, not the list column above.
        if (!isFilingOpen(detail.content)) return null

        // The Begutachtung it came from, if there was one. `preconst` is not
        // a universal field, so a missing pointer means "we have no page for
        // it", never "no Begutachtung happened" — the row then links out, and
        // whether it may also SAY „ohne Begutachtung" is decided below,
        // against list 81 rather than against a missing field.
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
          consultation: me
            ? { kind: 'draft' as const, gp: String(me.gp_code), inr: Number(me.inr) }
            : { kind: 'unresolved' as const },
        }
      } catch {
        // Per-item tolerance, as in the outcomes section: one failing
        // Gegenstand must not take the whole section down.
        return null
      }
    }),
  )

  const rows = resolved.filter((v): v is PendingVorlage => v !== null)

  /**
   * The cross-check for every row without a pointer: only here, because it
   * needs list 81 — ONE fetch for all open rows together, and none at all as
   * long as every Vorlage names its own draft (the normal case: 85 of 117 in
   * GP XXVIII). The list is in the cache for every page of the monitor
   * anyway.
   *
   * If it fails, the row stays `unknown` and says nothing: a failure of the
   * check must not turn into the claim it was meant to support.
   */
  const unresolved = rows.filter((v) => v.consultation.kind === 'unresolved')
  const drafts = unresolved.length ? await getDraftsForGp(gp).then((d) => d.items).catch(() => null) : []

  const items: OpenVorlage[] = rows
    .map((v): OpenVorlage => {
      if (v.consultation.kind !== 'unresolved') return v as OpenVorlage
      const checked = drafts !== null && findPrecedingDraft(v, drafts) === null
      return { ...v, consultation: checked ? { kind: 'none' } : { kind: 'unknown' } }
    })
    .sort((a, b) => b.date.localeCompare(a.date) || b.citation.localeCompare(a.citation))

  return { gp, items }
})

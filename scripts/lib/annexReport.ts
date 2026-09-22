/**
 * What the harness measures, as a record — and the verdict over it (§12.13).
 *
 * `harness/annexPdf.ts` writes the report (`--json=`), `ci/annexDrift.ts`
 * reads it and raises the alarm. The verdict logic lives **here** and not in
 * the harness: it has already sat there twice, which is where it can neither
 * be tested nor applied (§12.13 for the annex, §12.12 for the apply report).
 * Pure and importable means `tests/annexReport.test.ts` can hold every rule
 * against an invented report, without RIS.
 *
 * **Class A** is everything that needs no baseline — zeros that have to stay
 * zero no matter which drafts happen to be in the corpus. That is the whole
 * idea: the harness runs over the **400 most recent** Begut records, so over
 * a moving window. Any figure that moves with the window's composition is no
 * good for a weekly comparison — it would report a change every week and be
 * noise nobody reads within a month.
 *
 * The window is 400 and not "GP XXVIII" because RIS **silently ignores**
 * `Begut.Gesetzgebungsperiode`: the harness passes it (`harness/annexPdf.ts`,
 * the RIS query under `--- CLI ---`) and gets the whole Begut corpus back,
 * sorted newest first. Measured on 23.09.2026 against the cached answer of a
 * run filtered by `--gp=XXVIII`: 4.570 hits in total, and 69 of the 400
 * records carry a `BeginnBegutachtungsfrist` before 24.10.2024, the day GP
 * XXVIII began — the earliest is 29.04.2024. Same class of trap as the one
 * `ris/konsLaw.ts` records for `Abkuerzung`.
 *
 * **Not in class A**, measured on 16.09.2026 over GP XXVIII:
 *
 * | Figure                             | XML | PDF |
 * |------------------------------------|-----|-----|
 * | `changeRowsNoPara`                 |  75 |   0 |
 * | `noLaw` (outside every Artikel)    |  12 |   0 |
 *
 * Both are zero on one path and not on the other, and the golden test freezes
 * the zero only for its two annexes (`annexGolden.test.ts`), not for the
 * corpus. As a class-A rule they would have fired on the first run and
 * devalued the alarm. They belong in class B (per draft against a checked-in
 * baseline) and are therefore in the report, although nobody checks them
 * today.
 */

/** What a draft came to in the harness, without the calibration data. */
export interface AnnexDraftReport {
  /**
   * The RIS document key — the identity class B's baseline hangs on. Not
   * `cite`: that one is for humans and collides (see `DraftResult.id` in the
   * harness).
   */
  id: string
  /** Begutachtungsverfahrennummer, or failing that the Kurztitel/ID */
  cite: string
  source: 'xml' | 'pdf'
  /** Why the draft was not scored at all (annex refused, and the like) */
  note: string | null
  checked: number
  clean: number
  substantial: number
  substantialClean: number
  /** Rows outside every Artikel boundary — class B, see the header */
  noLaw: number
  /** Pages whose geometry the parser could not establish */
  droppedPages: number
  ran: boolean
  notRunReason: string | null
  verifiedParas: number
  withheldParas: number
  withheldStanding: number
  withheldAlreadyStanding: number
  withheldNotInDraft: number
  uncheckedParas: number
  rowsNoPara: number
  /** …of those, shown as a change — class B, see the header */
  changeRowsNoPara: number
  /** The gate's four assurances. Each one has to be zero. */
  verdictless: number
  wronglyVerified: number
  withheldWithText: number
  withheldWithoutCause: number
}

export interface AnnexReport {
  /** When it was measured — class B's baseline needs the provenance later */
  at: string
  gp: string
  /** `--xml` measures the table path, otherwise the rasterised annexes */
  path: 'xml' | 'pdf'
  limit: number
  /** Records RIS delivered at all */
  records: number
  drafts: AnnexDraftReport[]
}

export interface Finding {
  /**
   * `zusicherung` — the gate broke one of its own promises; that is a fault
   * of ours and has nothing to do with the corpus.
   * `form` — a document has a shape the parser could not establish; that is
   * the report this alarm was built for.
   * `messung` — the run measured nothing or next to nothing, so the result
   * is not one at all (`lib/harnessCache.ts`: a run against nothing looks
   * like a finding).
   * `grundlinie` — class B: a draft we have measured before measures
   * differently today.
   * `wartung` — nothing is broken, but something wants pulling up by hand.
   * It stands here because a reminder that depends on remembering is none.
   */
  kind: 'zusicherung' | 'form' | 'messung' | 'grundlinie' | 'wartung'
  /** The draft, or null for a statement about the whole run */
  draft: string | null
  text: string
}

/**
 * How many drafts with an annex a run has to find at the very least.
 *
 * On 16.09.2026 the harness found 126 drafts with a readable XML annex and
 * 114 with a rasterised one. The window is the most recent records, and
 * Begut records are added rather than removed — so the number rises rather
 * than falls. The threshold sits far below that on purpose: it catches the
 * total failure (RIS does not answer, or the annex is renamed and `annex`
 * matches nothing any more), not the ordinary movement. A tight threshold
 * here would be exactly the weekly false alarm this alarm is meant to avoid.
 */
export const MIN_DRAFTS_WITH_ANNEX = 60

/**
 * Class A: every finding that stands without a baseline.
 *
 * The order is deliberate — first whether anything was measured at all, then
 * the assurances, then the shape. A run that found nothing must not also
 * report „0 Zusicherungen verletzt", because zero out of nothing is no
 * all-clear.
 */
export function classAFindings(report: AnnexReport): Finding[] {
  const out: Finding[] = []
  const run = (kind: Finding['kind'], text: string) => out.push({ kind, draft: null, text })

  if (report.records === 0) {
    run('messung', 'Das RIS hat keinen einzigen Begut-Datensatz geliefert — der Lauf hat nichts gemessen.')
    return out
  }
  if (report.drafts.length < MIN_DRAFTS_WITH_ANNEX) {
    run(
      'messung',
      `Nur ${report.drafts.length} Entwürfe mit Beilage gefunden (Schwelle ${MIN_DRAFTS_WITH_ANNEX}, am 16.09.2026 waren es 126 auf dem Tabellen- und 114 auf dem PDF-Pfad). Entweder antwortet das RIS unvollständig, oder die Beilage heißt nicht mehr so, wie der Prüfstand sie sucht.`,
    )
    // Carry on, do not return: the drafts that are there get checked all the
    // same — half a corpus can very well show a real break.
  }

  for (const d of report.drafts) {
    const at = (text: string, kind: Finding['kind'] = 'zusicherung') => out.push({ kind, draft: d.cite, text })

    // The four assurances. The harness has printed them as „müssen 0 sein"
    // since 10.09.2026; here they get an exit code.
    if (d.verdictless > 0) at(`${d.verdictless} Paragraphen ohne Urteil — das Tor hat eine Zeile ausgeliefert, über die es nichts gesagt hat.`)
    if (d.wronglyVerified > 0) at(`${d.wronglyVerified} Paragraphen als geprüft ausgeliefert, obwohl das Urteil das nicht trägt.`)
    if (d.withheldWithText > 0) at(`${d.withheldWithText} einbehaltene Paragraphen tragen noch ihren Text — Einbehalten heißt im Server leeren, nicht im Client verstecken.`)
    if (d.withheldWithoutCause > 0) at(`${d.withheldWithoutCause} Paragraphen einbehalten, ohne einen Grund zu nennen.`)

    // The split of the withheld paragraphs has to add up. The verification
    // result claims as much in its comment (`annex/verdict.ts`,
    // `withheldCauses`), but nobody ever checked it: a fourth cause that
    // nobody adds to the sum would otherwise drop out of the page silently.
    const causes = d.withheldStanding + d.withheldAlreadyStanding + d.withheldNotInDraft
    if (causes !== d.withheldParas) {
      at(`${d.withheldParas} Paragraphen einbehalten, aber die Gründe summieren auf ${causes} (geltende Fassung ${d.withheldStanding}, Geltendes als neu ${d.withheldAlreadyStanding}, nicht angeordnet ${d.withheldNotInDraft}).`)
    }

    // The one figure about the document's shape that is zero on both paths
    // today. It is what this alarm is actually for: a page typeset unlike
    // the rest is not read, and what stands on it is missing from the page —
    // visible only here.
    if (d.droppedPages > 0) {
      at(`${d.droppedPages} Seite${d.droppedPages === 1 ? '' : 'n'} der Beilage ${d.droppedPages === 1 ? 'wurde' : 'wurden'} nicht gelesen, weil die Seitengeometrie sich nicht belegen ließ. Am 16.09.2026 war das über GP XXVIII auf beiden Pfaden null — hier steht also eine Gestalt, die der Korpus bis dahin nicht hatte.`, 'form')
    }
  }
  return out
}

/** The finding as text for the GitHub issue, short enough for a title. */
export function summarize(findings: readonly Finding[]): string {
  if (findings.length === 0) return 'ohne Befund'
  const by = (k: Finding['kind']) => findings.filter((f) => f.kind === k).length
  const parts: string[] = []
  if (by('messung')) parts.push(`${by('messung')}× Messung`)
  if (by('grundlinie')) parts.push(`${by('grundlinie')}× Grundlinie`)
  if (by('wartung')) parts.push(`${by('wartung')}× Wartung`)
  if (by('zusicherung')) parts.push(`${by('zusicherung')}× Zusicherung`)
  if (by('form')) parts.push(`${by('form')}× Gestalt`)
  return parts.join(', ')
}

/**
 * Class B: the figures that stand fixed for an annex once published — and
 * their German names for the report.
 *
 * Why equality and not a band: an annex published as a NOR never changes
 * (`annex/annexPdfService.ts` builds `PUBLISHED_DOCUMENT_TTL_S`, 30 days, on
 * exactly that), and the gate holds every Paragraph against RIS **as of the
 * `BeginnBegutachtungsfrist`** — against a fixed date, that is, not against
 * today. The same draft has to measure the same tomorrow as today. Where it
 * does not, something happened, and a tolerance band would only hide what.
 *
 * What a finding does NOT say is the cause. Two are possible: we changed the
 * engine without pulling the baseline up, or RIS touched a record after the
 * fact (a consolidation can be corrected retroactively). Telling those apart
 * is reading work on the finding, not a rule.
 */
const BASELINE_FIELDS = {
  note: 'Vermerk',
  checked: 'geprüfte Paragraphen',
  clean: '≥99 % gedeckt',
  substantial: 'Paragraphen mit Fließtext',
  substantialClean: 'davon ≥99 % gedeckt',
  noLaw: 'Zeilen außerhalb jeder Artikelgrenze',
  droppedPages: 'nicht gelesene Seiten',
  ran: 'geprüft',
  notRunReason: 'Grund, warum nicht geprüft wurde',
  verifiedParas: 'bestätigt',
  withheldParas: 'einbehalten',
  withheldStanding: 'einbehalten (geltende Fassung steht so nicht im RIS)',
  withheldAlreadyStanding: 'einbehalten (Geltendes als neu gezeigt)',
  withheldNotInDraft: 'einbehalten (Text, den der Entwurf nicht anordnet)',
  uncheckedParas: 'ungeprüft',
  rowsNoPara: 'Zeilen ohne Paragraphenangabe',
  changeRowsNoPara: 'davon als Änderung gezeigt',
} as const satisfies Partial<Record<keyof AnnexDraftReport, string>>

type BaselineField = keyof typeof BASELINE_FIELDS

/** A draft in the baseline: the compared fields, plus `cite` to read by. */
export type BaselineEntry = Pick<AnnexDraftReport, BaselineField> & { cite: string }

export interface AnnexBaseline {
  /** When the baseline was drawn — the provenance of a finding */
  at: string
  gp: string
  /** Per path, per RIS document key. The two paths are disjoint. */
  paths: Record<'xml' | 'pdf', Record<string, BaselineEntry>>
}

/** Draw the baseline from reports — the same format class B reads. */
export function toBaseline(reports: readonly AnnexReport[]): AnnexBaseline {
  const paths: AnnexBaseline['paths'] = { xml: {}, pdf: {} }
  for (const report of reports) {
    for (const d of report.drafts) {
      const entry = { cite: d.cite } as BaselineEntry
      for (const field of Object.keys(BASELINE_FIELDS) as BaselineField[]) {
        ;(entry as Record<string, unknown>)[field] = d[field]
      }
      paths[report.path][d.id] = entry
    }
  }
  return { at: new Date().toISOString(), gp: reports[0]?.gp ?? 'XXVIII', paths }
}

/**
 * Class B: every draft the baseline knows and that measures differently
 * today.
 *
 * **Only drafts that stand in both.** A draft the baseline does not know is
 * new — class A applies to it and nothing else. And one that stands in the
 * baseline and is missing from the report has slipped out of the window of
 * the 400 most recent records; that is the normal case and not a report.
 * Reporting either would mean reporting the window's movement every week,
 * and that is exactly what kills an alarm.
 *
 * **One finding per draft, not per field.** A shifted parse moves a dozen
 * counters at once; as a dozen reports the one draft would no longer be
 * recognisable as one.
 */
export function classBFindings(report: AnnexReport, baseline: AnnexBaseline): Finding[] {
  const known = baseline.paths[report.path]
  if (!known || Object.keys(known).length === 0) {
    return [{ kind: 'grundlinie', draft: null, text: `Die Grundlinie kennt den ${report.path === 'xml' ? 'Tabellenpfad' : 'PDF-Pfad'} nicht. Ohne sie prüft Klasse B hier nichts — neu ziehen mit \`ci/annexDrift.ts --grundlinie-schreiben=…\`.` }]
  }

  const out: Finding[] = []
  for (const d of report.drafts) {
    const was = known[d.id]
    if (!was) continue
    const moved: string[] = []
    for (const field of Object.keys(BASELINE_FIELDS) as BaselineField[]) {
      const before = was[field]
      const now = d[field]
      if (before !== now) moved.push(`${BASELINE_FIELDS[field]}: ${JSON.stringify(before)} → ${JSON.stringify(now)}`)
    }
    if (moved.length > 0) {
      out.push({
        kind: 'grundlinie',
        draft: d.cite,
        text: `misst sich anders als beim letzten Mal (${baseline.at.slice(0, 10)}, \`${d.id}\`) — ${moved.join('; ')}.`,
      })
    }
  }
  return out
}

/**
 * How old the baseline may get before the alarm reminds us of it itself.
 *
 * The baseline ages on its own: the window of the 400 most recent records
 * moves, new drafts arrive, and for each one the baseline does not know only
 * class A applies. Class B's coverage therefore falls by itself, and it does
 * so silently — the alarm would stay green while checking less and less.
 *
 * 60 days, for two reasons: at the frequency seen so far a few dozen records
 * rotate through the window in that time, and it is the same deadline after
 * which GitHub switches off scheduled workflows in a quiet repository
 * (`uptime.yml`) — two maintenance deadlines with one number are easier to
 * remember than two.
 *
 * It is pulled up by hand, not by the workflow: a baseline that writes
 * itself forward could absorb exactly the shift it exists to discover
 * (§12.13).
 */
export const MAX_BASELINE_AGE_DAYS = 60

/**
 * What has to be pulled up by hand — today exactly one thing.
 *
 * Called once per run and not per report: the baseline is one file for both
 * paths, and the same reminder twice is noise. `now` is a parameter so the
 * test does not have to wait.
 */
export function maintenanceFindings(baseline: AnnexBaseline | null, now: Date = new Date()): Finding[] {
  if (!baseline) return []
  const at = Date.parse(baseline.at)
  if (Number.isNaN(at)) {
    return [{ kind: 'wartung', draft: null, text: `Die Grundlinie trägt kein lesbares Datum (\`at\`: ${JSON.stringify(baseline.at)}), ihr Alter ist also nicht zu beurteilen.` }]
  }
  const days = Math.floor((now.getTime() - at) / 86_400_000)
  if (days < MAX_BASELINE_AGE_DAYS) return []
  const n = (p: 'xml' | 'pdf') => Object.keys(baseline.paths[p] ?? {}).length
  return [{
    kind: 'wartung',
    draft: null,
    text:
      `Die Grundlinie ist ${days} Tage alt (gezogen am ${baseline.at.slice(0, 10)}, Schwelle ${MAX_BASELINE_AGE_DAYS} Tage, ${n('xml')} + ${n('pdf')} Entwürfe). ` +
      'Seither sind Entwürfe in das Fenster der 400 jüngsten gekommen, die Klasse B nicht kennt — für die gilt nur Klasse A. ' +
      'Nachziehen aus den Berichten dieses Laufs (Artefakt `annex-reports`): ' +
      '`npx vite-node scripts/ci/annexDrift.ts -- --grundlinie-schreiben=tests/fixtures/annex-baseline.json annex-xml.json annex-pdf.json`, ' +
      'dann committen. Nichts ist kaputt; ungenutzt wird der Alarm nur blinder.',
  }]
}

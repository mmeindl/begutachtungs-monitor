/**
 * Was der Prüfstand misst, als Datensatz — und das Urteil darüber (§12.13).
 *
 * `annex-pdf-verify.ts` schreibt den Bericht (`--json=`), `annex-drift.ts`
 * liest ihn und schlägt Alarm. Die Urteilslogik steht **hier** und nicht im
 * Prüfstand: sie lag dort schon zweimal, nämlich dort, wo sie weder getestet
 * noch angewendet werden kann (§12.13 für die Beilage, §12.12 für den
 * Apply-Report). Rein und importierbar heißt: `tests/annexReport.test.ts`
 * kann jede Regel gegen einen erfundenen Bericht halten, ohne das RIS.
 *
 * **Klasse A** ist alles, was ohne Grundlinie auskommt — Nullen, die eine
 * Null bleiben müssen, egal welche Entwürfe gerade im Korpus stehen. Das ist
 * die ganze Idee: der Prüfstand läuft über die **400 jüngsten**
 * Begut-Datensätze (`Begut.Gesetzgebungsperiode` ignoriert das RIS still,
 * siehe Prüfstandskopf), also über ein wanderndes Fenster. Jede Kennzahl, die
 * mit der Zusammensetzung des Fensters wandert, taugt nicht für einen
 * wöchentlichen Vergleich — sie meldete jede Woche eine Änderung und wäre
 * nach einem Monat Rauschen, das niemand mehr liest.
 *
 * **Nicht in Klasse A**, gemessen am 16.09.2026 über GP XXVIII:
 *
 * | Kennzahl                        | XML | PDF |
 * |---------------------------------|-----|-----|
 * | `changeRowsNoPara`              |  75 |   0 |
 * | `noLaw` (außerhalb jedes Artikels) |  12 |   0 |
 *
 * Beide sind auf einem Pfad null und auf dem anderen nicht, und der
 * Golden-Test friert die Null nur für seine zwei Beilagen ein
 * (`annexGolden.test.ts`), nicht für den Korpus. Als Klasse-A-Regel hätten
 * sie beim ersten Lauf angeschlagen und das Alarmsignal entwertet. Sie
 * gehören in Klasse B (Vergleich je Entwurf gegen eine eingecheckte
 * Grundlinie) und stehen deshalb im Bericht, obwohl heute niemand sie prüft.
 */

/** Was ein Entwurf im Prüfstand ergeben hat, ohne die Kalibrierungsdaten. */
export interface AnnexDraftReport {
  /**
   * Der RIS-Dokumentschlüssel — die Identität, an der die Grundlinie von
   * Klasse B hängt. Nicht `cite`: das ist für Menschen und kollidiert
   * (siehe `DraftResult.id` im Prüfstand).
   */
  id: string
  /** Begutachtungsverfahrennummer, oder ersatzweise Kurztitel/ID */
  cite: string
  source: 'xml' | 'pdf'
  /** Warum der Entwurf gar nicht bewertet wurde (Beilage verweigert o. ä.) */
  note: string | null
  checked: number
  clean: number
  substantial: number
  substantialClean: number
  /** Zeilen außerhalb jeder Artikelgrenze — Klasse B, siehe Kopf */
  noLaw: number
  /** Seiten, deren Geometrie der Parser nicht belegen konnte */
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
  /** …davon als Änderung gezeigt — Klasse B, siehe Kopf */
  changeRowsNoPara: number
  /** Die vier Zusicherungen des Tors. Jede muss null sein. */
  verdictless: number
  wronglyVerified: number
  withheldWithText: number
  withheldWithoutCause: number
}

export interface AnnexReport {
  /** Wann gemessen wurde — die Grundlinie von Klasse B braucht später die Herkunft */
  at: string
  gp: string
  /** `--xml` misst den Tabellenpfad, sonst die gerasterten Beilagen */
  path: 'xml' | 'pdf'
  limit: number
  /** Datensätze, die das RIS überhaupt geliefert hat */
  records: number
  drafts: AnnexDraftReport[]
}

export interface Finding {
  /**
   * `zusicherung` — das Tor hat eine eigene Zusage gebrochen; das ist ein
   * Fehler von uns und hat mit dem Korpus nichts zu tun.
   * `form` — ein Dokument hat eine Gestalt, die der Parser nicht belegen
   * konnte; das ist die Meldung, für die dieser Alarm gebaut ist.
   * `messung` — der Lauf hat nichts oder fast nichts gemessen, das Ergebnis
   * ist also gar keines (`harness-cache.ts`: ein Lauf gegen nichts sieht aus
   * wie ein Befund).
   * `grundlinie` — Klasse B: ein Entwurf, den wir schon einmal gemessen
   * haben, misst sich heute anders.
   * `wartung` — nichts ist kaputt, aber etwas will von Hand nachgezogen
   * werden. Steht hier, weil eine Erinnerung, die vom Erinnern abhängt,
   * keine ist.
   */
  kind: 'zusicherung' | 'form' | 'messung' | 'grundlinie' | 'wartung'
  /** Der Entwurf, oder null für eine Aussage über den ganzen Lauf */
  draft: string | null
  text: string
}

/**
 * Wie viele Entwürfe mit Beilage ein Lauf mindestens finden muss.
 *
 * Am 16.09.2026 fand der Prüfstand 126 Entwürfe mit lesbarer XML-Beilage und
 * 114 mit gerasterter. Das Fenster sind die jüngsten Datensätze und
 * Begut-Datensätze kommen dazu, statt zu verschwinden — die Zahl wächst also
 * eher, als dass sie fällt. Die Schwelle liegt bewusst weit darunter: sie
 * fängt den Totalausfall (das RIS antwortet nicht, oder der Name der Beilage
 * ändert sich und `annex` trifft nichts mehr), nicht die normale Bewegung.
 * Eine enge Schwelle hier wäre genau der wöchentliche Fehlalarm, den dieser
 * Alarm vermeiden soll.
 */
export const MIN_DRAFTS_WITH_ANNEX = 60

/**
 * Klasse A: alle Befunde, die ohne Grundlinie feststehen.
 *
 * Reihenfolge ist Absicht — erst ob überhaupt gemessen wurde, dann die
 * Zusicherungen, dann die Gestalt. Ein Lauf, der nichts gefunden hat, darf
 * nicht auch noch „0 Zusicherungen verletzt" melden, denn null von nichts
 * ist keine Entwarnung.
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
    // Weiter, nicht zurück: die Entwürfe, die da sind, werden trotzdem
    // geprüft — ein halber Korpus kann sehr wohl einen echten Bruch zeigen.
  }

  for (const d of report.drafts) {
    const at = (text: string, kind: Finding['kind'] = 'zusicherung') => out.push({ kind, draft: d.cite, text })

    // Die vier Zusicherungen. Der Prüfstand druckt sie seit dem 10.09.2026
    // als „müssen 0 sein"; hier bekommen sie einen Exit-Code.
    if (d.verdictless > 0) at(`${d.verdictless} Paragraphen ohne Urteil — das Tor hat eine Zeile ausgeliefert, über die es nichts gesagt hat.`)
    if (d.wronglyVerified > 0) at(`${d.wronglyVerified} Paragraphen als geprüft ausgeliefert, obwohl das Urteil das nicht trägt.`)
    if (d.withheldWithText > 0) at(`${d.withheldWithText} einbehaltene Paragraphen tragen noch ihren Text — Einbehalten heißt im Server leeren, nicht im Client verstecken.`)
    if (d.withheldWithoutCause > 0) at(`${d.withheldWithoutCause} Paragraphen einbehalten, ohne einen Grund zu nennen.`)

    // Die Aufteilung der Einbehaltungen muss aufgehen. `GateResult` behauptet
    // das im Kommentar („und es hat zu summieren"), geprüft hat es nie
    // jemand: eine vierte Ursache, die niemand in die Summe aufnimmt, fiele
    // sonst lautlos aus der Seitenkopie heraus.
    const causes = d.withheldStanding + d.withheldAlreadyStanding + d.withheldNotInDraft
    if (causes !== d.withheldParas) {
      at(`${d.withheldParas} Paragraphen einbehalten, aber die Gründe summieren auf ${causes} (geltende Fassung ${d.withheldStanding}, Geltendes als neu ${d.withheldAlreadyStanding}, nicht angeordnet ${d.withheldNotInDraft}).`)
    }

    // Die eine Kennzahl über die Gestalt des Dokuments, die heute auf beiden
    // Pfaden null ist. Sie ist der eigentliche Zweck dieses Alarms: eine
    // Seite, die anders gesetzt ist als die übrigen, wird nicht gelesen, und
    // was auf ihr steht, fehlt auf der Seite — sichtbar nur hier.
    if (d.droppedPages > 0) {
      at(`${d.droppedPages} Seite${d.droppedPages === 1 ? '' : 'n'} der Beilage ${d.droppedPages === 1 ? 'wurde' : 'wurden'} nicht gelesen, weil die Seitengeometrie sich nicht belegen ließ. Am 16.09.2026 war das über GP XXVIII auf beiden Pfaden null — hier steht also eine Gestalt, die der Korpus bis dahin nicht hatte.`, 'form')
    }
  }
  return out
}

/** Der Befund als Text für das GitHub-Issue, kurz genug für einen Titel. */
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
 * Klasse B: die Kennzahlen, die für eine einmal veröffentlichte Beilage
 * feststehen — und ihre deutschen Namen für die Meldung.
 *
 * Warum Gleichheit und kein Band: eine NOR-veröffentlichte Beilage ändert
 * sich nie (`annexPdfService.ts` baut den 30-Tage-Cache genau darauf), und
 * das Tor hält jeden Paragraphen gegen das RIS **zum
 * `BeginnBegutachtungsfrist`** — gegen ein festes Datum also, nicht gegen
 * heute. Derselbe Entwurf muss sich morgen genauso messen wie heute. Wo er
 * das nicht tut, ist etwas passiert, und ein Toleranzband würde nur
 * verstecken, was.
 *
 * Was ein Befund NICHT sagt, ist die Ursache. Zwei kommen in Frage: wir haben
 * die Engine geändert, ohne die Grundlinie nachzuziehen, oder das RIS hat
 * einen Datensatz nachträglich angefasst (eine Konsolidierung kann
 * rückwirkend korrigiert werden). Das auseinanderzuhalten ist Lesearbeit am
 * Befund, keine Regel.
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

/** Ein Entwurf in der Grundlinie: die verglichenen Felder, plus `cite` zum Lesen. */
export type BaselineEntry = Pick<AnnexDraftReport, BaselineField> & { cite: string }

export interface AnnexBaseline {
  /** Wann die Grundlinie gezogen wurde — die Herkunft eines Befunds */
  at: string
  gp: string
  /** Je Pfad, je RIS-Dokumentschlüssel. Die beiden Pfade sind disjunkt. */
  paths: Record<'xml' | 'pdf', Record<string, BaselineEntry>>
}

/** Die Grundlinie aus Berichten ziehen — dasselbe Format, das Klasse B liest. */
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
 * Klasse B: jeder Entwurf, den die Grundlinie kennt und der sich heute anders
 * misst.
 *
 * **Nur Entwürfe, die in beiden stehen.** Ein Entwurf, den die Grundlinie
 * nicht kennt, ist neu — für ihn gilt Klasse A und sonst nichts. Und einer,
 * der in der Grundlinie steht und im Bericht fehlt, ist aus dem Fenster der
 * 400 jüngsten Datensätze gerutscht; das ist der Normalfall und keine
 * Meldung. Beides zu melden hieße, jede Woche die Bewegung des Fensters zu
 * melden, und genau daran stirbt ein Alarm.
 *
 * **Ein Befund je Entwurf, nicht je Feld.** Ein verschobener Parse bewegt ein
 * Dutzend Zähler auf einmal; als ein Dutzend Meldungen wäre der eine Entwurf
 * nicht mehr als einer zu erkennen.
 */
export function classBFindings(report: AnnexReport, baseline: AnnexBaseline): Finding[] {
  const known = baseline.paths[report.path]
  if (!known || Object.keys(known).length === 0) {
    return [{ kind: 'grundlinie', draft: null, text: `Die Grundlinie kennt den ${report.path === 'xml' ? 'Tabellenpfad' : 'PDF-Pfad'} nicht. Ohne sie prüft Klasse B hier nichts — neu ziehen mit \`annex-drift.ts --grundlinie-schreiben=…\`.` }]
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
 * Wie alt die Grundlinie werden darf, bevor der Alarm sie selbst anmahnt.
 *
 * Die Grundlinie altert ohne Zutun: das Fenster der 400 jüngsten Datensätze
 * wandert, neue Entwürfe kommen dazu, und für jeden, den die Grundlinie nicht
 * kennt, gilt nur Klasse A. Die Deckung von Klasse B sinkt also von selbst,
 * und zwar lautlos — der Alarm bliebe grün, während er immer weniger prüft.
 *
 * 60 Tage, aus zwei Gründen: in dieser Zeit rotieren nach der bisherigen
 * Frequenz einige Dutzend Datensätze durch das Fenster, und es ist dieselbe
 * Frist, nach der GitHub geplante Workflows in einem stillen Repository
 * abschaltet (`uptime.yml`) — zwei Wartungsfristen mit einer Zahl sind
 * leichter zu behalten als zwei.
 *
 * Nachgezogen wird von Hand, nicht vom Workflow: eine Grundlinie, die sich
 * selbst fortschreibt, könnte genau die Verschiebung aufsaugen, für deren
 * Entdeckung sie da ist (§12.13).
 */
export const MAX_BASELINE_AGE_DAYS = 60

/**
 * Was von Hand nachzuziehen ist — heute genau eine Sache.
 *
 * Wird einmal je Lauf aufgerufen und nicht je Bericht: die Grundlinie ist
 * eine Datei für beide Pfade, und zweimal dieselbe Mahnung ist Rauschen.
 * `now` ist ein Parameter, damit der Test nicht warten muss.
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
      `Die Grundlinie ist ${days} Tage alt (gezogen am ${baseline.at.slice(0, 10)}, Schwelle ${MAX_BASELINE_AGE_DAYS} Tage, ${n('xml')} + ${n('pdf')} Entwürfe). `
      + 'Seither sind Entwürfe in das Fenster der 400 jüngsten gekommen, die Klasse B nicht kennt — für die gilt nur Klasse A. '
      + 'Nachziehen aus den Berichten dieses Laufs (Artefakt `annex-reports`): '
      + '`npx vite-node scripts/annex-drift.ts -- --grundlinie-schreiben=tests/fixtures/annex-baseline.json annex-xml.json annex-pdf.json`, '
      + 'dann committen. Nichts ist kaputt; ungenutzt wird der Alarm nur blinder.',
  }]
}

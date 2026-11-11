/**
 * Bund zu Land in words and positions: the
 * fact on a Land's draft, the line on a Ministerialentwurf, the act page.
 *
 * NACHVERFOLGUNG, NO VERDICT (rule D6, as for EU law). The fact says what
 * the Land's own text says it carries out; the act page shows the Land
 * drafts with their dates beside the Kundmachung, and the Frist only as the
 * Grundsatzgesetz's own sentence — no computed date, no countdown, no
 * „überfällig", no day count. Counts are DRAFTS, never Länder, and an
 * absence is said as „noch kein Entwurf im Fenster", never „0 Länder".
 *
 * Pure: the components render what this returns, the tests read it without one.
 */
import type { BgblICitation, BundesrechtFinding, BundLandActResponse, LandBundesrechtResponse, MeBundesrechtLine } from '#shared/types'
import { formatDateDe } from '#shared/utils/format'
import { LAND_CODES, LAND_NAME } from '#shared/utils/laender'
import { viewOfRow, type EntryView } from './entryView'
import { dayOf, edgeAlign, laneBarOf, type EuChartView } from './euRecht'
import { laneNameOf } from './euKarte'
import type { Station } from './spine'

/** „BGBl. I Nr. 44/2025". */
export function bgblCitationDe(c: BgblICitation): string {
  return `BGBl. I Nr. ${c.number}/${c.year}`
}

/** „Kärnten, Tirol und Wien". */
function listDe(names: readonly string[]): string {
  return names.length < 2 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} und ${names.at(-1)}`
}

/** Whether a finding names its act: a Grundsatzgesetz by name or Kundmachung, an agreement by its subject. */
export function isNamedFinding(f: Pick<BundesrechtFinding, 'kind' | 'name' | 'bgbl'>): boolean {
  return f.kind === 'vereinbarung' ? Boolean(f.name) : Boolean(f.name || f.bgbl)
}

/**
 * The h3 of the Bund section in „Der Entwurf", by what it lists: „Welches
 * Bundesgesetz der Entwurf ausführt", „Welche Vereinbarung der Entwurf
 * umsetzt", both in one where a draft does both (sbg-34196 would). Null
 * without a named act — then no section.
 */
export function bundesrechtSectionHeading(rows: readonly BundesrechtRowView[]): string | null {
  const gg = rows.some((r) => r.key.startsWith('gg'))
  const va = rows.some((r) => r.key.startsWith('va'))
  if (gg && va) return 'Welches Bundesgesetz der Entwurf ausführt und welche Vereinbarung er umsetzt'
  if (gg) return 'Welches Bundesgesetz der Entwurf ausführt'
  return va ? 'Welche Vereinbarung der Entwurf umsetzt' : null
}

/** One row of the Land block „Der Entwurf", in parts the component links. */
export interface BundesrechtRowView {
  key: string
  /** The linked part, or the plain one where nothing links: „Anstellungserfordernisse-Grundsatzgesetz", „Vereinbarung gemäß Art. 15a B-VG über …". */
  label: string
  /** „, BGBl. I Nr. 44/2025" after it; null without a citation. */
  citation: string | null
  /** „, teilweise" where the draft says so. */
  partial: boolean
  /** The act page. */
  path: string | null
}

/**
 * The rows of the Land's section in „Der Entwurf" (06.11.2026). The
 * verb — „führt das … aus", „setzt eine Art.-15a-Vereinbarung um" — stands
 * once, as the Entwurf station's fact (`utils/origin.ts`); the block names
 * the act. A Grundsatzgesetz is never „umgesetzt" anywhere on the page.
 */
export function bundesrechtRows(r: LandBundesrechtResponse | null | undefined): BundesrechtRowView[] {
  // No named act, no row: „Grundsatzbestimmungen des Bundes" names nothing a reader could look up (06.11.2026).
  return (r?.findings ?? []).filter(isNamedFinding).map((f, i) => {
    const citation = f.bgbl ? `, ${bgblCitationDe(f.bgbl)}` : null
    if (f.kind === 'vereinbarung') {
      return { key: `va-${i}`, label: f.name ? `Vereinbarung gemäß Art. 15a B-VG ${f.name}` : 'Vereinbarung gemäß Art. 15a B-VG', citation: null, partial: f.partial, path: null }
    }
    return { key: `gg-${i}`, label: f.name ?? (f.bgbl ? 'Grundsatzgesetz des Bundes' : 'Grundsatzbestimmungen des Bundes'), citation, partial: f.partial, path: f.path }
  })
}

/** „3 Entwürfen der Länder" (dative), „einem Entwurf der Länder". */
function draftsDative(n: number): string {
  return n === 1 ? 'einem Entwurf der Länder' : `${n} Entwürfen der Länder`
}

/**
 * The Frist clause as the page quotes it: the whole sentence, never a piece
 * that ends on a comma. A reference a reader cannot resolve without the
 * act — „gemäß Absatz 8", „gemäß § 41" — is cut out with „…": 91/2025's
 * „… binnen sechs Monaten nach Inkrafttreten der Grundsatzbestimmungen
 * gemäß Absatz 8, zu erlassen." is quoted „… nach Inkrafttreten der
 * Grundsatzbestimmungen … zu erlassen."
 */
export function fristQuoteOf(clause: string): string {
  return clause
    .replace(/\s+gemäß\s+(?:Absatz|Abs\.|§|Artikel|Art\.)\s*[^,]*?(?=,|\s+zu erlassen)/gu, ' …')
    .replace(/,\s+zu erlassen\.$/u, ' zu erlassen.')
    .replace(/\s+/gu, ' ')
    .trim()
}

/**
 * The span of a Frist clause the Bundesgesetzblatt station names: „binnen
 * eines Jahres", „binnen sechs Monaten nach Inkrafttreten der
 * Grundsatzbestimmungen" — the sentence without its frame („Die
 * Ausführungsgesetze der Länder sind … zu erlassen.") and without a
 * reference the reader cannot resolve here („gemäß Absatz 8"). The act page
 * quotes the whole sentence (`fristQuoteOf`).
 */
export function fristSpanOf(clause: string): string {
  return fristQuoteOf(clause)
    .replace(/^Die Ausführungsgesetze der Länder sind\s+/u, '')
    .replace(/\s*…?\s*zu erlassen\.$/u, '')
    .replace(/[\s,]+$/u, '')
}

/** The block „Ausführung durch die Länder" in the Bundesgesetzblatt section (`BgblLaenderBlock`). */
export const LAENDER_BLOCK_ANCHOR = '#ausfuehrung-laender'

/**
 * The Bundesgesetzblatt station's detail line on a Ministerialentwurf whose
 * Grundsatzgesetz is kundgemacht: the procedure after the
 * Kundmachung, so it stands at that station — never „0 Länder" (D6).
 */
export function bundesrechtFollowUp(line: MeBundesrechtLine | null | undefined): NonNullable<Station['followUp']> | null {
  if (!line) return null
  // A link line of its own where there are rows to jump to — in-page, as every
  // link in the spine: the block in „Im Bundesgesetzblatt" carries the rows and
  // the way to the act page. Without rows a plain fact, like the rest of a row.
  if (line.drafts > 0) return { before: '', link: { href: LAENDER_BLOCK_ANCHOR, label: `In ${draftsDative(line.drafts)} ausgeführt →` }, after: '' }
  const frist = line.fristClause ? ` · Frist: ${fristSpanOf(line.fristClause)}` : ''
  return { before: `Ausführung durch die Länder: noch kein Entwurf${frist}`, link: null, after: '' }
}

/** The stations with the follow-up at the Bundesgesetzblatt. */
export function withBundesrechtFollowUp(stations: readonly Station[], line: MeBundesrechtLine | null | undefined): Station[] {
  const followUp = bundesrechtFollowUp(line)
  return followUp ? stations.map((s) => (s.id === 'bgbl' ? { ...s, followUp } : s)) : [...stations]
}

/** The credit items the line adds to the card's source line: RIS always, the Länder' documents where it counts drafts. */
export function bundesrechtCreditItems(line: MeBundesrechtLine | null | undefined): string[] {
  if (!line) return []
  return ['Bundesgesetzblatt (RIS)', ...(line.drafts > 0 ? ['Dokumente der Länder'] : [])]
}

/* ------------------------------------------------------------------ *
 * The act page
 * ------------------------------------------------------------------ */

export interface BundLandActPageView {
  /** The h1: „BGBl. I Nr. 44/2025". */
  title: string
  /** RIS's Titel, under the h1. */
  subject: string | null
  /** „Kundgemacht am 24.07.2025". */
  kundmachung: string | null
  risUrl: string
  vorlage: string | null
  me: { citation: string; path: string } | null
  /** The Frist clause verbatim, quoted on the page. */
  fristClause: string | null
  /** „3 Entwürfe der Länder (Kärnten, Oberösterreich, Steiermark)" — drafts, never Länder. */
  count: string | null
  entries: EntryView[]
  /** Per entry key: „führt es teilweise aus", visible with the row. */
  partial: Record<string, string>
  /** Each row's dates in a sentence, for a screen reader (the chart's lanes are hidden from it). */
  said: Record<string, string>
  chart: EuChartView | null
  incomplete: string | null
}

/** „3 Entwürfe der Länder (Kärnten, Oberösterreich, Steiermark)". */
export function draftsCountDe(lands: readonly string[], n: number): string | null {
  if (n === 0) return null
  const names = [...new Set(lands)]
  return `${n === 1 ? '1 Entwurf' : `${n} Entwürfe`} der Länder (${listDe(names)})`
}

export function bundLandActPageView(r: BundLandActResponse): BundLandActPageView {
  const act = r.act
  const drafts = r.drafts
  const entries = drafts.map((d) => viewOfRow(d.row))

  // One track, the Kundmachung the mark over the lanes (`EuTimelineChart`), as the act page of EU law draws its deadline.
  // A draft gets a lane where its stand is known. Without Begutachtung dates
  // (Kärnten's ktn-15193 dates none) the lane is the grey track and its
  // stand dot: ink is reserved for the span from the draft's own
  // Begutachtung (owner's decision 06.11.2026). Without a stand only the
  // row stands.
  const drawn = drafts.filter((d) => d.stand && (d.begutachtung.start ?? d.begutachtung.end ?? act.kundmachung))
  const days = [
    ...(act.kundmachung ? [act.kundmachung] : []),
    ...drawn.flatMap((d) => [d.begutachtung.start, d.begutachtung.end, d.stand!.date]),
  ].filter((d): d is string => !!d).map(dayOf)
  const first = days.length ? Math.min(...days) : 0
  const span = days.length ? Math.max(...days) - first : 0
  const at = (iso: string) => ((dayOf(iso) - first) / span) * 100
  const ticks = act.kundmachung ? [act.kundmachung] : []
  const laneOf = (d: (typeof drawn)[number]) => laneBarOf(at, d.begutachtung, d.stand!, ticks)
  const chart: EuChartView | null = drawn.length && span > 0
    ? {
        deadlines: act.kundmachung ? [{ key: 'kundmachung', at: at(act.kundmachung), align: edgeAlign(at(act.kundmachung)), lines: ['Kundmachung', formatDateDe(act.kundmachung)] }] : [],
        lanes: drawn.map((d) => ({
          key: d.key,
          path: d.path,
          publisher: LAND_NAME[d.publisher],
          name: laneNameOf(d.title),
          title: d.title,
          bar: laneOf(d),
        })),
        footnote: null,
      }
    : null

  const said: Record<string, string> = {}
  const partial: Record<string, string> = {}
  drafts.forEach((d, i) => {
    const key = entries[i]!.key
    const { start, end } = d.begutachtung
    const begutachtung = start ? (end ? `Begutachtung ${formatDateDe(start)} bis ${formatDateDe(end)}` : `Begutachtung ab ${formatDateDe(start)}`) : end ? `Begutachtung bis ${formatDateDe(end)}` : null
    const stand = d.stand && d.stand.label !== 'Heute' ? `${d.stand.label} am ${formatDateDe(d.stand.date)}` : null
    said[key] = [begutachtung, stand].filter(Boolean).join(' · ')
    if (d.partial) partial[key] = 'führt es teilweise aus'
  })

  const incompleteLands = r.incomplete.filter((p): p is (typeof LAND_CODES)[number] => p !== 'bund')
  return {
    title: act.citation,
    subject: act.title,
    kundmachung: act.kundmachung ? `Kundgemacht am ${formatDateDe(act.kundmachung)}` : null,
    risUrl: act.risUrl,
    vorlage: act.vorlage,
    me: act.me ? { citation: act.me.citation, path: act.me.path } : null,
    fristClause: act.fristClause ? fristQuoteOf(act.fristClause) : null,
    count: draftsCountDe(LAND_CODES.filter((l) => drafts.some((d) => d.publisher === l)).map((l) => LAND_NAME[l]), drafts.length),
    entries,
    partial,
    said,
    chart,
    incomplete: incompleteLands.length ? `Gerade nicht abrufbar: ${listDe(incompleteLands.map((l) => LAND_NAME[l]))} – Entwürfe von dort können fehlen.` : null,
  }
}

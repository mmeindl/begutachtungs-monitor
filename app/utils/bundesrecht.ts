/**
 * Bund zu Land in words and positions (docs/architecture.md §12.67): the
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

/** „BGBl. I Nr. 44/2025". */
export function bgblCitationDe(c: BgblICitation): string {
  return `BGBl. I Nr. ${c.number}/${c.year}`
}

/** „Kärnten, Tirol und Wien". */
function listDe(names: readonly string[]): string {
  return names.length < 2 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} und ${names.at(-1)}`
}

/** One line of the Land fact, in parts the component links. */
export interface BundesrechtLineView {
  key: string
  /** Before the linked part: „Führt das ", „Setzt die Vereinbarung gemäß Art. 15a B-VG ". */
  before: string
  /** The linked part — the law's name, or the citation where no name was read; null where there is nothing to link. */
  linked: string | null
  /** After it: „ aus", „ teilweise aus", „ um". */
  after: string
  /** „, BGBl. I Nr. 44/2025" after the name. */
  citation: string | null
  /** The act page. */
  path: string | null
}

/**
 * The Land fact's lines. A Grundsatzgesetz is „ausgeführt", an agreement
 * „umgesetzt" — never „setzt … um" for a Grundsatzgesetz: a Land does not
 * transpose the Bund's law, it carries out its principles.
 */
export function bundesrechtLines(r: LandBundesrechtResponse | null | undefined): BundesrechtLineView[] {
  return (r?.findings ?? []).map((f, i) => (f.kind === 'grundsatzgesetz' ? grundsatzLine(f, i) : vereinbarungLine(f, i)))
}

function grundsatzLine(f: BundesrechtFinding, i: number): BundesrechtLineView {
  const aus = f.partial ? ' teilweise aus' : ' aus'
  const cite = f.bgbl ? bgblCitationDe(f.bgbl) : null
  if (f.name) return { key: `gg-${i}`, before: 'Führt das ', linked: f.name, after: aus, citation: cite ? `, ${cite}` : null, path: f.path }
  if (cite) return { key: `gg-${i}`, before: 'Führt ein Grundsatzgesetz des Bundes', after: aus, linked: null, citation: `, ${cite}`, path: f.path }
  return { key: `gg-${i}`, before: 'Führt Grundsatzbestimmungen des Bundes', linked: null, after: aus, citation: null, path: null }
}

function vereinbarungLine(f: BundesrechtFinding, i: number): BundesrechtLineView {
  const um = f.partial ? ' teilweise um' : ' um'
  return f.name
    ? { key: `va-${i}`, before: `Setzt die Vereinbarung gemäß Art. 15a B-VG ${f.name}`, linked: null, after: um, citation: null, path: null }
    : { key: `va-${i}`, before: 'Setzt eine Vereinbarung gemäß Art. 15a B-VG', linked: null, after: um, citation: null, path: null }
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

/** The Ministerialentwurf's line: two facts, never „0 Länder" (D6). */
export interface MeLineView {
  /** „Ausgeführt in 3 Entwürfen der Länder" — the link — or null where none exists yet. */
  link: string | null
  path: string
  /** „Ausführungsgesetze der Länder: noch kein Entwurf im Fenster". */
  none: string | null
  /** The Grundsatzgesetz's Frist sentence (`fristQuoteOf`), where none exists yet and it sets a Frist. */
  frist: string | null
}

export function meLineView(line: MeBundesrechtLine | null | undefined): MeLineView | null {
  if (!line) return null
  if (line.drafts > 0) return { link: `Ausgeführt in ${draftsDative(line.drafts)}`, path: line.path, none: null, frist: null }
  return { link: null, path: line.path, none: 'Ausführungsgesetze der Länder: noch kein Entwurf im Fenster', frist: line.fristClause ? fristQuoteOf(line.fristClause) : null }
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
  // (Kärnten's ktn-15193 dates none) its line runs from the Kundmachung to
  // its stand — the Land follows the act, so that is where its way starts
  // on this page; the EU act page draws no such lane, because there the
  // deadline is no start. Without a stand only the row stands.
  const drawn = drafts.filter((d) => d.stand && (d.begutachtung.start ?? d.begutachtung.end ?? act.kundmachung))
  const days = [
    ...(act.kundmachung ? [act.kundmachung] : []),
    ...drawn.flatMap((d) => [d.begutachtung.start, d.begutachtung.end, d.stand!.date]),
  ].filter((d): d is string => !!d).map(dayOf)
  const first = days.length ? Math.min(...days) : 0
  const span = days.length ? Math.max(...days) - first : 0
  const at = (iso: string) => ((dayOf(iso) - first) / span) * 100
  const ticks = act.kundmachung ? [act.kundmachung] : []
  const laneOf = (d: (typeof drawn)[number]) => {
    const bar = laneBarOf(at, d.begutachtung, d.stand!, ticks)
    // No Begutachtung dates: the ink line from the Kundmachung, not a dot alone.
    if (!(d.begutachtung.start ?? d.begutachtung.end) && act.kundmachung) bar.from = Math.min(at(act.kundmachung), bar.value)
    return bar
  }
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

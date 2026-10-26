/**
 * The ressort's Textgegenüberstellung as an oracle for the engine
 * (docs/architecture.md §12.12, docs/api-exploration.md §2c).
 *
 * PURE MODULE — relative imports only, so vitest runs it directly.
 *
 * A draft's annex prints the standing law and the proposed law side by side,
 * written by the ministry. Its "Vorgeschlagene Fassung" column *is* the
 * consolidated result the engine computes — from an independent author, on
 * the first day of the consultation, before any RIS version exists. Where the
 * engine's output and that column agree on a paragraph, two independent
 * readings of the same instructions coincide; that is the closest thing to
 * verification available at draft time.
 *
 * The annex abbreviates unchanged text ("(2) bis (4) …") and prints markers
 * the tree does not carry, so the comparison is not text equality but four
 * containments over the rows of one §:
 *
 *   1. every changed row's *current* text is in the standing § — the annex
 *      talks about the same law version the engine started from;
 *   2. every changed row's *proposed* text is in the engine's result, and a
 *      row that proposes nothing — the annex's way of writing a deletion —
 *      is gone from it: the engine did what the ministry says the draft does;
 *   3. every word the engine inserted is one the annex's proposed column
 *      shows, and every word it removed one the geltende column shows — the
 *      engine did nothing the ministry does not show;
 *   4. what a changed row strikes does not still stand in the result where
 *      the row took it out — the result holds no more than the annex
 *      proposes (`keptDeletion`, since 01.10.2026; checks 1 to 3 only ever
 *      asked whether the proposed text is IN the result).
 *
 * A § the annex does not mention, or mentions only in elided rows, gets no
 * verdict: the oracle is silent, not positive.
 */
import { diffTokens } from '../diff/wordDiff'
import { compareToken, normalizeText } from '../lawtext/normalize'
import type { ComparisonRow } from '../annex/comparisonRows'
import { printedLayout, printedStretches } from '../annex/elision'
import { punctuationTokens } from '../text/punctuationTokens'
import { isSchedule, unitKey } from '../text/designation'
import { bodyText, type LawNode } from '../lawtext/konsTree'
import { PARAGRAPH_NUMBER } from '../../../shared/utils/paragraphNumber'

export type OracleVerdict =
  /** All four containments hold */
  | 'bestätigt'
  /** The annex shows a change the engine's text does not contain, or vice versa */
  | 'widersprochen'
  /** The annex's current text is not in the standing §: different version, or a mis-aligned row */
  | 'fremd'
  /** The annex has no substantive row for this § */
  | 'stumm'

export interface OracleReport {
  para: string
  verdict: OracleVerdict
  /** Rows of the annex that belong to this § */
  rows: number
  /** Why, for the report */
  note: string | null
}

/** „§ 6.01a.", „§ 365m1." at the start of a Gliederungssymbol, read whole as every reader reads a § number (`PARAGRAPH_NUMBER`). */
const GLD_PARAGRAPH_RE = new RegExp(String.raw`^§+\s*(${PARAGRAPH_NUMBER})`)

/**
 * "§ 5." → "5", "§ 12a." → "12a"; null for anything else.
 *
 * The annex's own Gliederungssymbol, anchored at the start of it — not
 * `text/designation.bareParaId`, which reads the first number anywhere in a
 * label: a row opening with anything but a § must not answer here.
 */
export function paraIdOfGld(gld: string | null): string | null {
  const t = normalizeText(gld ?? '')
  // „§ 2.01." whole: a Verordnung that numbers its §§ by Kapitel (the
  // Wasserstraßen-Verkehrsordnung's „§ 8.03") is keyed so on the address
  // side (`unitKey`), and read as „2" here every § of a Kapitel fell into
  // one (26.10.2026).
  const m = GLD_PARAGRAPH_RE.exec(t)
  if (m) return m[1]!
  // A schedule names itself, and it is a unit of the law like any other:
  // „Anlage 1", „Anhang". Keyed under `unitKey` so it meets the address side
  // under the same name — 11 rows in 2 of the 10 Entwürfe whose instructions
  // address a schedule at all (26.09.2026). Anchored like the § above: a row
  // that merely MENTIONS an Anlage opens none.
  return isSchedule(t) ? unitKey(t.replace(/[.,;:]\s*$/, '')) : null
}

/**
 * The annex's rows grouped by the § they belong to: a row opens a § with its
 * `gld`, every following row without one continues it.
 *
 * **Filed under the designation the § carries AFTER the draft**
 * (`ComparisonRow.paraAfter`, 26.10.2026) — the one the engine's result for it
 * carries. Which § a row belongs to is still decided by the left column, the
 * annex's own order; only the drawer changes. Filed by the left one, 51/ME
 * XXVIII put the old § 14, now § 22, into the drawer of the NEW § 14: the
 * engine's § 22 found no row of its own, and its § 14 met a row about
 * another provision. A § nothing of which stands afterwards stays under its
 * own number, set aside (`paragraphRows`, `origin`).
 *
 * Keyed by **law and designation**, because a Sammelnovelle's next law starts
 * its own § 1 and 15,1 % of § designations in the multi-law annexes recur in
 * another law of the same package. The key was a running counter over the
 * annex's article rows, which drifted in 26 of 36 packages — every heading
 * advanced it, whether or not it opened a law — and the caller then asked for
 * the bare designation and silently got the *first* law's § 5 (2026-09-09).
 */
export function rowsByParagraph(rows: readonly ComparisonRow[]): Map<string, ComparisonRow[]> {
  const out = new Map<string, ComparisonRow[]>()
  const struck = new Set<ComparisonRow>()
  const position = new Map<ComparisonRow, number>()
  const standing = new Map<ComparisonRow, string>()
  /** The § open, by its own number — what the rules below compare against. */
  let current: string | null = null
  /** Where its rows go: its number after the draft, or its own, set aside. */
  let drawer: { key: string; struck: boolean; standing: string } | null = null
  for (const [i, row] of rows.entries()) {
    if (row.kind === 'article') {
      current = null
      drawer = null
      continue
    }
    /** The row whose designation opened the § — this one, or for a heading the one below. */
    let opener = row
    let id = paraIdOfGld(row.gld)
    // A schedule the annex opens with a line printed once per column carries
    // its name in `para`, not in `gld` (`comparisonRows`, `opensAnlage`), and
    // followed only by `gld` its rows stayed under the § before it: „Armenien,
    // Aserbaidschan," was held against § 3 of the Zweite
    // Außenwirtschaftsverordnung, „a) Die Sperrstrecke d" against § 109 of
    // the Eisenbahnkreuzungsverordnung (06.10.2026). Schedules only — a §
    // still opens with its own symbol.
    if (!id && row.para && isSchedule(normalizeText(row.para))) id = paraIdOfGld(row.para)
    // A § heading is printed as its own row *above* the row that carries the
    // § symbol. Read in order it landed in the § before — "Tabakfreie
    // Nikotinerzeugnisse" was checked against § 10g and contradicted a
    // correct result (Tabakgesetz, 2026-09-09). A short row without gld and
    // without a closing full stop, right before a row that opens a §, is
    // that §'s heading.
    const next = rows[i + 1]
    if (!id && next && next.kind === 'pair' && paraIdOfGld(next.gld) && isHeadingRow(row)) {
      id = paraIdOfGld(next.gld)
      opener = next
    }
    // A § the annex opened without a row that carries its symbol. Where the
    // designation stands in a row of its own and nothing beside it —
    // „§ 190." over the salary table of the Richter- und
    // Staatsanwaltschaftsdienstgesetz — `comparisonRows` emits no row for it
    // and hands the § on in `para` alone; an elision line naming its §
    // („§ 16 Abs. 1 bis 24 …", `elisionOpens`) does the same. Read by `gld`
    // alone, every row of such a § was filed under the § ABOVE it: 126/ME
    // XXVIII held § 190's rows against § 184, which came out `fremd`, and
    // left § 190 without a single row (25.10.2026).
    //
    // **Only where no row of that § carries the symbol.** `comparisonRows`
    // also hands the § below to the heading rows it held back for it
    // (`heldHeadings`) — a changed Abschnitt heading („Besondere Vorschriften
    // für den Verkehr mit Fahrrädern und Motorfahrrädern.") among them, which
    // RIS keeps out of every §'s own text. Read by `para` they opened that §
    // early and made it `fremd`: six §§ the oracle had confirmed, measured
    // over the 400 drafts of the ME-Prüfstand. Where the § opens with its own
    // symbol below, those rows stay where they were (`opensBelow`).
    if (!id && row.para) {
      const opened = paraIdOfGld(row.para)
      if (opened && paragraphKey(opened, row.law) !== current && !opensBelow(rows, i, opened)) id = opened
    }
    if (id) {
      current = paragraphKey(id, row.law)
      drawer = { ...drawerOf(id, opener, row.law), standing: id }
    }
    if (!current || !drawer) continue
    const list = out.get(drawer.key) ?? []
    list.push(row)
    out.set(drawer.key, list)
    position.set(row, i)
    standing.set(row, drawer.standing)
    if (drawer.struck) struck.add(row)
  }
  STRUCK.set(out, struck)
  POSITION.set(out, position)
  STANDING.set(out, standing)
  return out
}

/**
 * Where a § opened by `opener` is filed: under the number it carries after
 * the draft, or — where nothing of it stands afterwards (`paraAfter` null) —
 * under its own number, set aside for the § the engine made of it.
 */
function drawerOf(id: string, opener: ComparisonRow, law: string | null): { key: string; struck: boolean } {
  if (opener.paraAfter === opener.para) return { key: paragraphKey(id, law), struck: false }
  if (opener.paraAfter === null) return { key: paragraphKey(id, law), struck: true }
  return { key: paragraphKey(paraIdOfGld(opener.paraAfter) ?? id, law), struck: false }
}

/**
 * Per map of `rowsByParagraph`, what `paragraphRows` needs beside the drawers:
 * the rows of §§ nothing of which stands after the draft, the standing § each
 * row's left column belongs to (its own number, before the draft), and every
 * row's place in the annex, so rows joined from two drawers keep the printed
 * order. Keyed on the map, so all three die with it.
 */
const STRUCK = new WeakMap<ReadonlyMap<string, ComparisonRow[]>, ReadonlySet<ComparisonRow>>()
const STANDING = new WeakMap<ReadonlyMap<string, ComparisonRow[]>, ReadonlyMap<ComparisonRow, string>>()
const POSITION = new WeakMap<ReadonlyMap<string, ComparisonRow[]>, ReadonlyMap<ComparisonRow, number>>()

/**
 * Whether a row further down, inside the run that inherits the same `para`,
 * opens `id` with its own symbol — the § then has a row of its own, and a
 * row above it that merely inherits it is not where it opens.
 */
function opensBelow(rows: readonly ComparisonRow[], at: number, id: string): boolean {
  const { para, law } = rows[at]!
  for (let j = at + 1; j < rows.length; j++) {
    const r = rows[j]!
    if (r.kind !== 'pair' || r.para !== para || r.law !== law) return false
    if (r.gld) return paraIdOfGld(r.gld) === id
  }
  return false
}

/** The key `rowsByParagraph` files a § under. */
export function paragraphKey(id: string, law: string | null): string {
  return `${law ?? ''}#${id}`
}

/**
 * The annex rows of one § of the engine's result — of a named law where the
 * annex divides its laws.
 *
 * A caller that does not know which law of a package it means may only ask
 * when there is exactly one candidate. Answering anyway is what the running
 * counter did, and it held the engine's § 5 against another law's § 5.
 *
 * `origin` is the § of the standing law the result's § came from
 * (`renamedOrigins`): itself unless the draft renumbered, null for a § the
 * draft brings in new. A row's LEFT column is the standing text of the § it
 * is filed under by the left designation, so it speaks only for the § the
 * engine made of that one:
 *
 *  - the rows of a § the annex strikes join the § of their own number only
 *    where that is its origin — „§ 5 lautet" printed as the old § 5 struck
 *    and the new § 5 set elsewhere (51/ME XXVIII) is one § to the engine;
 *    the old § 16 struck beside the old § 9 moving to § 16 is not;
 *  - a row that moved into this § from another number, where the engine
 *    did not derive the § from that number, keeps its right column only.
 *    The PDF path pairs its columns by number, so where 35/ME XXVIII moves
 *    the old § 44f to § 44g and brings in a new § 44f, the row „§ 44f." has
 *    the old one's text on the left and the new one's on the right; held
 *    against the new § 44f, the left column read as standing text the annex
 *    got wrong („fremd"), which it did not.
 */
export function paragraphRows(byParagraph: ReadonlyMap<string, ComparisonRow[]>, id: string, law?: string | null, origin: string | null = id): ComparisonRow[] {
  const own = drawerRows(byParagraph, id, law)
  const struck = STRUCK.get(byParagraph)
  const standing = STANDING.get(byParagraph)
  if (!struck || !standing) return own
  // „Anl." finds the one schedule's drawer (`drawerRows`), whose rows stand
  // under that schedule's number.
  const originId = id === 'Anl.' && origin === 'Anl.' && own[0] ? (standing.get(own[0]) ?? origin) : origin
  const kept: ComparisonRow[] = []
  for (const r of own) {
    const from = standing.get(r)
    if (struck.has(r)) {
      if (from === originId) kept.push(r)
      continue
    }
    if (from === originId || !r.current) kept.push(r)
    else if (r.proposed) kept.push(rightColumnOnly(r))
  }
  // A struck § is filed under its own number, so another number's struck rows
  // stand in that number's drawer only.
  const inherited = originId === null || origin === id ? [] : drawerRows(byParagraph, originId, law).filter((r) => struck.has(r) && standing.get(r) === originId)
  if (inherited.length === 0) return kept
  const position = POSITION.get(byParagraph)!
  return [...kept, ...inherited].sort((a, b) => position.get(a)! - position.get(b)!)
}

/** A row as the § its right column belongs to sees it: text the draft brings in. */
function rightColumnOnly(row: ComparisonRow): ComparisonRow {
  return { ...row, current: '', change: row.elided ? row.change : 'inserted', segments: null, editorial: false, elisionRange: false }
}

function drawerRows(byParagraph: ReadonlyMap<string, ComparisonRow[]>, id: string, law?: string | null): ComparisonRow[] {
  // „Anl." is an instruction saying „the schedule", and the annex writes the
  // number („Anlage 1"). They are the same unit wherever the map holds
  // exactly one schedule; where it holds several the instruction named none
  // and nothing here may choose for it.
  const key = id === 'Anl.' ? soleSchedule(byParagraph, law) ?? id : id
  if (law !== undefined) return byParagraph.get(paragraphKey(key, law)) ?? []
  const hits = rowsById(byParagraph).get(key) ?? []
  return hits.length === 1 ? hits[0]! : []
}

/** A row that shows a change the draft has to instruct — as the page's `showsInstructedChange` reads it. */
function showsChange(row: ComparisonRow): boolean {
  return row.kind === 'pair' && row.change !== 'unchanged' && !row.editorial && !row.elisionRange && !row.elided
}

/**
 * The units the annex shows changing in one law — for the §§ a draft changes
 * without naming them one by one: an instruction on the whole text („Im
 * gesamten Gesetzestext wird jeweils …") and a law the draft enacts anew.
 * Neither names its §§, and the annex is the one document that lists them.
 *
 * Each under the designation it carries after the draft — the drawer it is
 * filed in (`rowsByParagraph`) — and only where something of it stands
 * afterwards: a § the annex strikes whole is no § of the result, and no
 * outcome of ours belongs at it.
 *
 * `law` as `paragraphRows` takes it; without one (a single-law draft) the
 * rows the annex files under no law and under `fallback`.
 */
export function annexChangedUnits(byParagraph: ReadonlyMap<string, ComparisonRow[]>, law: string | null | undefined, fallback: string | null = null): string[] {
  const struck = STRUCK.get(byParagraph)
  const out: string[] = []
  for (const [key, rows] of byParagraph) {
    const cut = key.lastIndexOf('#')
    if (cut < 0) continue
    const lawPart = key.slice(0, cut)
    const fits = law !== undefined ? lawPart === (law ?? '') : lawPart === '' || (fallback !== null && lawPart === fallback)
    if (!fits || (struck && rows.every((r) => struck.has(r)))) continue
    if (rows.some(showsChange)) out.push(key.slice(cut + 1))
  }
  return out
}

/**
 * The same drawers less some of them, as a map `paragraphRows` reads like the
 * one it came from: the struck rows, the standing § of each row and the
 * printed order stay attached (they are keyed by row, not by drawer). A plain
 * filtered copy would lose all three, and with them the origin's reading of
 * every renumbered § (`kons/consolidate.ts`, `annexOf`).
 */
export function someDrawers(byParagraph: ReadonlyMap<string, ComparisonRow[]>, keep: (key: string) => boolean): Map<string, ComparisonRow[]> {
  const out = new Map([...byParagraph].filter(([key]) => keep(key)))
  const struck = STRUCK.get(byParagraph)
  const standing = STANDING.get(byParagraph)
  const position = POSITION.get(byParagraph)
  if (struck) STRUCK.set(out, struck)
  if (standing) STANDING.set(out, standing)
  if (position) POSITION.set(out, position)
  return out
}

/** The one schedule of this law in the annex — null where there is none or several. */
function soleSchedule(byParagraph: ReadonlyMap<string, ComparisonRow[]>, law?: string | null): string | null {
  const ids = new Set<string>()
  for (const full of byParagraph.keys()) {
    const at = full.indexOf('#')
    const lawPart = at < 0 ? '' : full.slice(0, at)
    const unit = at < 0 ? full : full.slice(at + 1)
    if (law !== undefined && law !== null && lawPart !== law) continue
    if (isSchedule(unit)) ids.add(unit)
  }
  return ids.size === 1 ? [...ids][0]! : null
}

/**
 * The same map read by § alone — built once per map instead of materialised
 * and filtered per §. On a single-law draft this ran for every § of the
 * annex, over every key of the map (`docs/refactor-plan.md` §6.8).
 *
 * Keyed on the map object, so the index dies with it. The map is built once
 * per request by `rowsByParagraph` and not written to afterwards; an index
 * over a map that is still being filled would be a different function.
 */
const ROWS_BY_ID = new WeakMap<ReadonlyMap<string, ComparisonRow[]>, Map<string, ComparisonRow[][]>>()

function rowsById(byParagraph: ReadonlyMap<string, ComparisonRow[]>): Map<string, ComparisonRow[][]> {
  const known = ROWS_BY_ID.get(byParagraph)
  if (known) return known
  const index = new Map<string, ComparisonRow[][]>()
  for (const [key, rows] of byParagraph) {
    // The same cut `endsWith('#' + id)` made: everything after the last
    // separator is the §, and a key without one answers to no §.
    const cut = key.lastIndexOf('#')
    if (cut < 0) continue
    const id = key.slice(cut + 1)
    const list = index.get(id) ?? []
    list.push(rows)
    index.set(id, list)
  }
  ROWS_BY_ID.set(byParagraph, index)
  return index
}

function isHeadingRow(row: ComparisonRow): boolean {
  // An elided row is the annex's notation for text it leaves out — „(3) …"
  // at the foot of the § before — and never a heading, however short it is
  // and whatever it does not end with. Read as one, the previous §'s tail
  // was filed at the head of the next: harmless while no check read elided
  // rows, and 165 false alarms of check 5 once one did (26.10.2026).
  if (row.elided) return false
  const cells = [row.current, row.proposed].filter(Boolean)
  // Nor a row that opens with an Absatz marker: „(5) bis (16)", printed
  // without its „…", is the same tail of the § before (Schulunterrichtsgesetz
  // § 19/§ 20, ASVG § 31c/§ 31d). A § heading never opens with one.
  if (cells.some((c) => /^\s*\(\d/.test(c))) return false
  return cells.length > 0 && cells.every((c) => c.length <= 120 && !/[.;:]$/.test(c))
}

/**
 * A Paragraphenkennung with its full stop, the number whole (`PARAGRAPH_NUMBER`,
 * in a lookahead so it cannot give its decimal back to the stop) — or, for a
 * Kapitel's number, without one: „§ 8.03 Sicherheit an Bord …". Cut as „§ 8."
 * the rest „03" stayed in the comparison form.
 */
const PARAGRAPH_MARKER_RE = new RegExp(String.raw`§+\s*(?=(${PARAGRAPH_NUMBER}))\1(?:\.|(?<=\.\d[\da-z]*)(?=\s|$))\s*`, 'g')

/**
 * Comparison form of annex text: markers the tree does not carry are
 * dropped, whitespace and quotes normalised the way `plainText` does.
 *
 * **The Paragraphenkennung is dropped wherever it stands, not only at the
 * head of the cell** (26.09.2026, §12.12a). The anchor was right while a cell
 * was an Absatz: there „§ 5." can only be the first thing printed. On the PDF
 * path a cell is a whole §, and the Beilage prints the §'s own Überschrift
 * *before* the designation — „Spielbedingungen und Vertrieb § 16. (1) Der
 * Konzessionär hat …" — so the designation stood in the middle of the cell
 * and stayed. It is not law text on either side: `konsTree` carries it as
 * `marker`, and `plainText` never prints it. Dropping it globally keeps the
 * two sides symmetrical, because both go through this function; a citation
 * that ends a sentence („gemäß § 5.") loses its number in the comparison
 * form on both sides at once, which costs a little sharpness and cannot
 * create a false match.
 */
export function stripMarkers(t: string): string {
  return normalizeText(
    normalizeText(t)
      .replace(PARAGRAPH_MARKER_RE, ' ')
      .replace(/(^|\s)\(\d+[a-z]*\)(?=\s|$)/g, '$1')
      .replace(/(^|\s)(\d+[a-z]*)\.(?=\s|$)/g, (_whole, pre: string, num: string, offset: number, all: string) =>
        keepsNumber(all.slice(0, offset), all.slice(offset + _whole.length)) ? `${pre}${num}` : pre)
      .replace(/(^|\s)[a-z]{1,2}\)(?=\s)/g, '$1'),
  )
}

/**
 * Whether „15." is a number of the text rather than a Ziffer's marker: the
 * day of a date („mit 15. Juli 2026"), or a citation's number at the end of
 * a sentence („gemäß Abs. 2.", „nach Z 4.").
 *
 * **The marker rule stripped them all until 26.10.2026**, on both sides
 * alike, so the comparison was symmetrical and blind: a draft moving an
 * Inkrafttreten from „1. Juli" to „15. Juli", or a reference from „Abs. 2."
 * to „Abs. 3.", left the same comparison form whether the engine carried it
 * out or not — and an engine that missed it was confirmed. Kept only where
 * the text around says which kind of number it is; every other bare „3."
 * still goes as the marker it usually is. The dot goes either way, so a
 * number ending the cell reads like the same number inside a sentence.
 */
function keepsNumber(before: string, after: string): boolean {
  return MONTH_AFTER_RE.test(after) || CITATION_BEFORE_RE.test(before)
}
const MONTH_AFTER_RE = /^\s*(?:Jänner|Januar|Feber|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)(?!\p{L})/u
const CITATION_BEFORE_RE = /(?:(?<!\p{L})(?:Abs|Art|lit|Nr|Z|Ziff|Pkt|Tz|Rz)\.?|(?<!\p{L})(?:Absatz|Absätze|Artikel|Ziffer|Ziffern|Satz|Sätze|Punkt|Teil|Abschnitt|Hauptstück|Kapitel))\s*$/u

/**
 * Whitespace- and quote-free form for containment: the two sources break
 * lines differently, and the annex sometimes quotes a citation the law does
 * not ("die Einhaltung der „§§ 4 bis 6 …“", Tabakgesetz § 14, 2026-09-09).
 *
 * Hyphens, dashes and „&" go too, and RIS's own notes: the ressorts copy the
 * geltende Fassung out of RIS by hand, and the copy differs from RIS's text
 * in exactly these — „Schieneninfrastruktur Dienstleistungsgesellschaft"
 * against „Schieneninfrastruktur-Dienstleistungsgesellschaft", „wenn sie -
 * im Falle" against „wenn sie im Falle", „F&E" against „FE", „(Anm.: Abs. 7
 * aufgehoben durch …)", which `plainText` never prints. 17 `fremd` over 140
 * drafts were nothing else (06.10.2026, §12.12).
 */
function key(t: string): string {
  return stripMarkers(sameText(t)).replace(/[\s"'„“‚‘\-‐‑–—&]/g, '')
}

/** How often `needle` stands in `hay`, without overlaps. */
function occurrences(hay: string, needle: string): number {
  let n = 0
  for (let at = hay.indexOf(needle); at >= 0; at = hay.indexOf(needle, at + needle.length)) n++
  return n
}

/** What the comparison form and the word list both drop: the copy's spellings of the same text. */
function sameText(t: string): string {
  return t.replace(RIS_NOTE_RE, ' ').replace(PLACEHOLDER_RE, 'XXX').replace(REPEALED_RE, ' ')
}

/** „(Anm.: Abs. 2 aufgehoben durch Art. 4 Z 54, BGBl. I Nr. 118/2016)" */
const RIS_NOTE_RE = /\(Anm\.?:[^()]*\)/g
/**
 * The citation of a Bundesgesetzblatt not yet issued: the draft writes „BGBl.
 * I Nr. xxx/xxxx", its own annex „xxx/yyyy" or „XX/2025" — one placeholder,
 * spelt three ways (06.10.2026). Only where an x or y stands in it, and as a
 * token of its own: the word diff hands check 3 „xxx/2026" without its „Nr.",
 * and a placeholder normalised on one side only contradicted four §§ the
 * first version had confirmed.
 */
const PLACEHOLDER_RE = /(?<![\p{L}\d])(?=[\dxXyY]*\/?[\dxXyY]*[xXyY])[\dxXyY]+\s*\/\s*[\dxXyY]+(?![\p{L}\d])/gu
/** „Aufgehoben" where a repealed Absatz stood — the annex prints it, RIS's text does not. */
const REPEALED_RE = /(?<!\p{L})(?:Aufgehoben|\(aufgehoben\))(?!\p{L})/gu

// --- Measured surface: the harness asks `unaccountedStretch` in this form. ---
export const containmentKey = key

/** Words without punctuation — "36," and "36" are the same word. */
function words(t: string): string[] {
  return punctuationTokens(stripMarkers(sameText(t)))
}

/**
 * The annex's words for check 3, and the same words with a line-break hyphen
 * closed up as well. The PDF annexes break a compound at its hyphen and the
 * reader keeps the space („ESG- Faktoren", „E- GovG"), so the engine's
 * „ESG-Faktoren" stood in no cell and check 3 reported an invention — about
 * two dozen of the §§ the annex „contradicted" in the ME-Prüfstand
 * (06.10.2026). Check 2 never saw it: `key` drops spaces and hyphens. A set
 * of both readings and not a rewrite, because „Status- oder" is a suspended
 * hyphen and has to stay a word of its own; the closed form is built from
 * the same characters, so nothing the annex does not print gets in.
 */
function cellWords(t: string): string[] {
  // And the syllable break, where the hyphen belongs to the line and not to
  // the word: „Konzentrations- schwellen" is „Konzentrationsschwellen".
  return [...words(t), ...words(t.replace(/(\p{L})- (?=\p{L})/gu, '$1-')), ...words(t.replace(/(\p{Ll})- (?=\p{Ll})/gu, '$1'))]
}

/**
 * A minus b as multisets. Check 3 subtracts the words on BOTH sides of the
 * diff first, for the reason `applyGuard` does (b4d7e38): where an inserted
 * phrase repeats a word beside it, the LCS reports the old word as removed
 * and re-inserted — „bestimmten" in FPG § 77, „Chemikalien" in AußWG § 81 —
 * and check 3 then asked the annex's geltende column for a word nobody
 * removed. Word order is check 2's to judge.
 */
function bagMinus(a: readonly string[], b: readonly string[]): string[] {
  const counts = new Map<string, number>()
  for (const t of b) counts.set(t, (counts.get(t) ?? 0) + 1)
  return a.filter((t) => {
    const n = counts.get(t) ?? 0
    if (n > 0) counts.set(t, n - 1)
    return n === 0
  })
}

/**
 * How much of the standing text's beginning has to reappear in the cell
 * before a prefix counts as a heading stack. Long enough that the §'s own
 * Überschrift is what was found and not a stray word, short enough that a
 * ressort's hyphen or footnote mark inside the heading does not defeat it.
 */
const HEAD_PROBE = 24
/** The dots that belong to a designation rather than to a sentence. */
const DESIGNATION_DOT_RE = /(?:\d+[a-z]*|[IVXLCDM]+|(?<!\p{L})\p{Lu})\./gu

/**
 * The cell without the stack of group headings the PDF path prints above a §
 * — null when there is none, or when what stands in front is not a stack.
 *
 * RIS keeps „3. Teil", „1. Hauptstück", „2. Abschnitt" out of the §'s own
 * text on purpose (`konsTree.context`): they head a group of §§, and a
 * Novelle replacing the § does not replace them. The Beilage prints them over
 * the § all the same, so the first stretch of a PDF row regularly reads
 * „3. Abschnitt Antragstellung Inhalt des Mehrfachantrags § 34. (1) …" where
 * the standing text begins at the §'s own heading. RIS carries the stack for
 * this § in only a small minority of documents, so asking it is no answer —
 * measured 26.09.2026, §12.12a.
 *
 * **The rule is structural, and both halves of it carry weight.** What is
 * dropped has to *open like a heading* and contain no sentence punctuation
 * of its own, and what remains has to be the standing text's own beginning.
 * Without the first half the previous §'s last words would be dropped too —
 * „beträgt 75 000 € je Förderwerber Ausmaß der Förderung" — and a row
 * carrying foreign text would pass a check whose whole purpose is to catch
 * it. That is not a hypothetical: over 60 drafts the guard refused exactly 5
 * such rows while admitting 24 true stacks (26.09.2026).
 *
 * „Like a heading" was „with a group unit" until 06.10.2026, and that missed
 * every group the law names otherwise: „Dritter Abschnitt", „III. Form der
 * letztwilligen Verfügung", „B. Zwischen Bund und Ländern (Gemeinden)
 * geteilte Abgaben", „GEMEINSAME BESTIMMUNGEN …", the tail of a long title
 * „(Waldfondsgesetz)". A capital, a digit or a bracket opens all of them; the
 * previous §'s tail opens in lower case, and that half of the guard stands.
 */
function withoutHeadingStack(piece: string, text: string, from: number): { piece: string; found: number } | null {
  if (!HEADING_START_RE.test(piece)) return null
  // EVERY cut, not the first: the PDF path prints a group whose name is the
  // §'s own heading twice — „1. Abschnitt Status des Asylberechtigten Status
  // des Asylberechtigten § 3." — and cutting at the first copy leaves a
  // remainder that starts with the heading and still is not the standing
  // text (05.10.2026, §12.12).
  for (let cut = 1; cut <= piece.length - MIN_HEAD_REST; cut++) {
    const rest = piece.slice(cut)
    // The §'s own heading may be all the stretch has left — „2. Abschnitt
    // Umstellungsförderung (58-01) Fördervoraussetzungen" before the marks of
    // „§ 209. (1) bis (5) …" — so a remainder shorter than the probe has to
    // open the standing text whole.
    if (!text.startsWith(rest.slice(0, HEAD_PROBE))) continue
    if (!isStack(piece.slice(0, cut))) continue
    const found = text.indexOf(rest, from)
    if (found >= 0) return { piece: rest, found }
  }
  return null
}

/** The fewest characters a remainder must keep to count as the §'s own heading. */
const MIN_HEAD_REST = 8
/** „3. TEIL: SCHLUSSBESTIMMUNGEN" — a colon after the unit is a heading's, not a sentence's. */
const UNIT_COLON_RE = /(Teil|Hauptst(?:ü|ue)ck|Abschnitt|Unterabschnitt|Kapitel|Titel):/gi

/** A heading opens with a capital, a number or a bracket — never in lower case. */
const HEADING_START_RE = /^[\p{Lu}\d(]/u

/** Opens like a heading and has no sentence punctuation of its own. */
function isStack(dropped: string): boolean {
  if (!HEADING_START_RE.test(dropped)) return false
  return !/[.;:!?]/.test(dropped.replace(DESIGNATION_DOT_RE, '').replace(UNIT_COLON_RE, '$1'))
}

/**
 * „3. Abschnitt", „4. Abschnitt: Pflichten des Seilbahnunternehmens",
 * „ABSCHNITT IIA", „Siebenter Teil" — the heading of a group, numbered or
 * counted in words, as a stretch of its own.
 * Read on the RAW stretch: the comparison form strips „3." as a marker, and
 * without its number „Teile der Förderung" would open like a heading. The
 * unit has to end where the word ends, or „1. Teilnehmer" opens like „1. Teil".
 */
const NUMBERED_UNIT_RE = /^\s*(?:(?:(?:\d+[a-z]*|[IVXLCDM]+)\.|(?:Erst|Zweit|Dritt|Viert|Fünft|Sechst|Siebent|Sieb|Acht|Neunt|Zehnt|Elft|Zwölft)e[rs]?)\s*(?:Teil|Hauptst(?:ü|ue)ck|Abschnitt|Unterabschnitt|Kapitel|Titel)(?!\p{L})|(?:Teil|Hauptst(?:ü|ue)ck|Abschnitt|Unterabschnitt|Kapitel|Titel)\s+(?:\d+[a-z]*|[IVXLCDM]+[A-Z]?)(?![\p{L}\d]))/iu

/**
 * Whether a stretch is nothing but a group heading. The ressort prints the
 * NEXT group's heading at the foot of a § — „… (5) bis (8) … 3. Abschnitt"
 * (Bäderhygieneverordnung § 43), or as the whole of a row (§ 9 of the
 * Seilbahn-Verordnung); RIS files it with no § at all (`konsTree.context`).
 * It says nothing about the § either way, like a stretch of bare markers.
 */
function isGroupHeadingOnly(stretch: string): boolean {
  if (!NUMBERED_UNIT_RE.test(stretch)) return false
  return !/[.;:!?]/.test(oldStyleDotsOff(stretch).replace(DESIGNATION_DOT_RE, '').replace(UNIT_COLON_RE, '$1'))
}

/**
 * The older laws close the unit and the title with a full stop — „VI.
 * Hauptstück. Behandlung der aufzubewahrenden Acten.", „II. Abschnitt."
 * (Notariatsordnung). Those two dots are a heading's; any other is not.
 *
 * **Only where the unit itself carries the stop.** Dropping the final stop
 * of any numbered stretch let „2. Abschnitt … § 6. (1) Zuständig ist das
 * Landesgericht." pass as a heading, its one full stop being the last — and
 * a foreign row came out confirmed. A test caught it (06.10.2026).
 */
function oldStyleDotsOff(stretch: string): string {
  const unitStop = /(Teil|Hauptst(?:ü|ue)ck|Abschnitt|Unterabschnitt|Kapitel|Titel)\./i
  if (!unitStop.test(stretch)) return stretch
  return stretch.replace(unitStop, '$1').replace(/\.\s*$/, '')
}

/**
 * „… ist zu bestrafen. Begehung einer Verwaltungsübertretung in einem die
 * Zurechnungsfähigkeit" — the next §'s heading, cut where the PDF wraps it,
 * left at the foot of this § (SPG § 82, AIFMG § 38, NAG § 49). The oracle
 * does not know the neighbour, so the shape has to carry it: after a
 * sentence's end, the last thing in the cell, a capital first, at most 14
 * words, and no full stop, colon, semicolon, digit or § of its own — law text
 * ends its sentences, a heading does not.
 */
const NEXT_HEADING_RE = /(?<=[.;!?])\s+\p{Lu}[^.;:!?§\d]*$/u

function isNextHeading(stretch: string): boolean {
  const trailer = NEXT_HEADING_RE.exec(stretch)?.[0]
  return trailer !== undefined && trailer.trim().split(/\s+/).length <= 14
}

/**
 * „… wenn das Zertifikat wieder auflebt. 2. Hauptstück" — the next group's
 * heading in the same stretch as the last sentence of this §, with no mark
 * between them. Only after a sentence's end, only numbered or counted in
 * words, and with no sentence punctuation of its own.
 */
const TRAILING_GROUP_RE = /(?<=[.;!?])\s*(?:(?:\d+[a-z]*|[IVXLCDM]+)\.\s*|(?:Erst|Zweit|Dritt|Viert|Fünft|Sechst|Siebent|Sieb|Acht|Neunt|Zehnt|Elft|Zwölft)e[rs]?\s+)(?:Teil|Hauptst(?:ü|ue)ck|Abschnitt|Unterabschnitt|Kapitel|Titel)(?!\p{L})[^.;:!?]*$/iu

/**
 * An Absatz chain the annex prints without its „…" — „(2) bis (3)", „(1)
 * und (2)" — marked as the omission it is.
 *
 * Some ressorts write the omission that way (138/ME XXVIII § 32, and
 * Salzburg throughout). Check 5 reads such a chain as designations
 * (`ABSATZ_RUN_RE`), but checks 1, 2 and 4 cut the cell at its marks
 * (`printedLayout`), found none, and read „bis" as law text: the standing
 * text carries no such word, and the row came out `fremd` (26.10.2026).
 * Marked where check 5 reads a chain — at the start of the cell or after a
 * sentence's end or a mark —, joined by „bis" or „und", and only where
 * nothing of its own follows: the end of the cell, the next Absatz's marker
 * or a mark. Followed by words, the chain opens an Absatz and stays text.
 */
const DOTLESS_OMISSION_RE = /(?:^|(?<=[.:;…]\s*))\(\d{1,3}[a-z]?\)(?:\s+(?:bis|und)\s+\(\d{1,3}[a-z]?\))+(?=\s*(?:$|\(\d{1,3}[a-z]?\)\s|\.\.\.|…))/g

function markedOmissions(cell: string): string {
  return normalizeText(cell).replace(DOTLESS_OMISSION_RE, (chain: string, offset: number, all: string) => (/^\s*(?:\.\.\.|…)/.test(all.slice(offset + chain.length)) ? chain : `${chain} …`))
}

/**
 * The stretch of a cell that `text` does not account for — null when it
 * accounts for all of them, in the order the cell prints them.
 *
 * **Containment had to become piecewise, and the PDF path is why.** The two
 * checks below ask whether a running text carries what the annex prints, and
 * they asked it of the cell as ONE string. On the table path a cell is an
 * Absatz, so that mostly holds; on the PDF path a cell is a **whole §**, and
 * the ressort leaves its unchanged stretches out inside it („(2) bis (4) …").
 * A § with holes is a subsequence of the standing text and never a substring
 * of it, so check 1 refused every such row as `fremd` — **0 of 1.585** rows
 * the corpus could resolve against RIS passed it (25.09.2026). Segmenting at
 * the marks and asking the same question of each stretch answers 682 of them
 * (43,0 %); on the table path 58 of 66 against 3 today.
 *
 * **In order and without overlap**, which is what keeps this a check. Three
 * stretches looked up independently could each match anywhere, so a cell whose
 * Absätze the annex printed in the wrong order would pass; walking an index
 * forward means the standing text has to carry them as the annex prints them.
 *
 * **A cell without a mark comes back whole** (`printedStretches`), so this is
 * `includes` for every row that reads correctly today — the generalisation
 * costs no strictness anywhere the old test already had an answer.
 */
// --- Measured surface: exported for tests and harness scripts, not for the app. ---
export function unaccountedStretch(text: string, cell: string): string | null {
  let at = 0
  let first = true
  const stretches = printedStretches(markedOmissions(cell))
  for (const [index, stretch] of stretches.entries()) {
    let piece = key(stretch)
    // A stretch that is nothing but markers — "§ 5." alone at the head of a
    // PDF row — keys to the empty string and says nothing either way.
    // Nor a rule the PDF draws as underscores („______________"): no letter,
    // no digit, nothing it could say about the §.
    if (piece === '' || !/[\p{L}\d]/u.test(piece)) continue
    let found = text.indexOf(piece, at)
    // Nor does a stretch that is nothing but a group heading — wherever it
    // stands, since the next group's heading comes at the foot of a §.
    if (found < 0 && isGroupHeadingOnly(stretch)) continue
    // The next §'s heading, wrapped at the foot of the cell: only the last
    // stretch, only after a finished sentence (`NEXT_HEADING_RE`).
    if (found < 0 && index === stretches.length - 1 && isNextHeading(stretch)) {
      const trimmed = key(stretch.replace(NEXT_HEADING_RE, ''))
      const retry = trimmed === '' ? -1 : text.indexOf(trimmed, at)
      if (retry >= 0) {
        piece = trimmed
        found = retry
      }
    }
    if (found < 0 && TRAILING_GROUP_RE.test(stretch)) {
      const trimmed = key(stretch.replace(TRAILING_GROUP_RE, ''))
      const retry = trimmed === '' ? -1 : text.indexOf(trimmed, at)
      if (retry >= 0) {
        piece = trimmed
        found = retry
      }
    }
    // Only the first stretch of a cell can carry the heading stack: it is
    // what stands above the § itself.
    if (found < 0 && first) {
      const rescued = withoutHeadingStack(piece, text, at)
      if (rescued) ({ piece, found } = rescued)
    }
    if (found < 0) return stretch
    at = found + piece.length
    first = false
  }
  return null
}

/** How check 4's report opens — the harness counts its alarms by it. */
export const KEPT_DELETION_NOTE = 'Gestrichener Text steht noch im Ergebnis'

/**
 * Check 4's numbers, measured by `harness/faultInjection.ts` (class E,
 * docs/architecture.md §12.12a, 01.10.2026).
 *
 * - `ANCHOR`: an equal run of the row's own diff this long is a word the row
 *   keeps. A single equal word is the LCS pairing „die" or „ist" across a
 *   rewritten sentence by chance, and a region cut there splits one deletion
 *   into fragments no result carries.
 * - `MIN_KEPT`: how many words have to stand beside a stretch before they
 *   count. One or two are what the next Absatz happens to open with („Der",
 *   „Die Behörde").
 * - `PROBE`: how many are compared at most — enough to be a sentence.
 * - `MIN_LOOSE`: struck text with no printed stretch beside it has no place
 *   to be looked for, only a presence. It counts from this many words, the
 *   `MIN_STANDING_STRETCH` floor of the right-column rules: below it, a
 *   phrase can stand anywhere in a §.
 * - `EDGE_PROBE`: how many of a stretch's words place it in the result — its
 *   first ones for where it starts, its last ones for where it ends. The PDF
 *   path prints a group heading over the first stretch („3. TEIL STRAF-,
 *   SCHLUSS- UND ÜBERGANGSBESTIMMUNGEN") that RIS keeps out of the § — check 2
 *   drops that stack (`withoutHeadingStack`); here the end of a stretch is
 *   found without needing its start.
 */
const ANCHOR = 2
const MIN_KEPT = 3
const PROBE = 8
const MIN_LOOSE = 6
const EDGE_PROBE = 12
/** Above this many token pairs the row diff is skipped — `MAX_DP_CELLS` of `diff/wordDiff.ts`. */
const MAX_ROW_CELLS = 2_500_000

/** The token that stands for an elision mark in `cellTokens`. */
const ELISION = '…'
/**
 * What pairing two elision marks is worth to the row diff, in words. The
 * marks are the annex's own structure — „this much is left out here" on both
 * sides — and a plain LCS trades one of them for a few words of a rewritten
 * sentence on the other side of it.
 */
const MARK_WEIGHT = 1000

/**
 * Words as check 4 compares them: markers dropped (`stripMarkers`), edge
 * punctuation off (`punctuationTokens`), inner hyphens folded
 * (`compareToken`).
 *
 * Words rather than the whitespace-free `key` of checks 1 and 2, because
 * this check asks what stands NEXT to a stretch, and in `key` form
 * „Bundesminister" has the „in" of „Bundesministerin" standing next to it.
 */
function words4(t: string): string[] {
  return punctuationTokens(stripMarkers(t)).map(compareToken)
}

/**
 * A cell as words, with every elision run as one `ELISION` token — cut by
 * `printedLayout`, the cut `printedStretches` makes, so the designation chain
 * that announces a mark („(3) bis (7) …") is gone exactly where checks 1 and
 * 2 drop it.
 */
/**
 * Through `sameText` like every other comparison, and check 4 is where it
 * mattered most (06.10.2026): once check 2 read „(2) Aufgehoben." as the
 * repealed Absatz it is, this check still looked for „Aufgehoben" in the
 * result to find the edge of the stretch — RIS never prints it — and a kept
 * Absatz beside it went unasked (Budgetbegleitgesetz 2025 §§ 412, 417, 808).
 */
function cellTokens(t: string): string[] {
  return printedLayout(markedOmissions(sameText(t)), true).flatMap((piece) => (piece === null ? [ELISION] : words4(piece)))
}

type TokenOp = 'equal' | 'removed' | 'inserted'
interface TokenRun {
  type: TokenOp
  tokens: string[]
}

/**
 * LCS over two token arrays, as runs — the recurrence of `diffTokens` on
 * words already compared, with paired marks weighted by `MARK_WEIGHT`.
 */
function tokenRuns(a: readonly string[], b: readonly string[]): TokenRun[] | null {
  const n = a.length
  const m = b.length
  if (n * m > MAX_ROW_CELLS) return null
  const width = m + 1
  const dp = new Uint32Array((n + 1) * width)
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * width + j] = a[i] === b[j] ? dp[(i + 1) * width + j + 1]! + (a[i] === ELISION ? MARK_WEIGHT : 1) : Math.max(dp[(i + 1) * width + j]!, dp[i * width + j + 1]!)
    }
  }
  const runs: TokenRun[] = []
  const emit = (type: TokenOp, token: string): void => {
    const last = runs[runs.length - 1]
    if (last && last.type === type) last.tokens.push(token)
    else runs.push({ type, tokens: [token] })
  }
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      emit('equal', a[i]!)
      i++
      j++
    } else if (dp[(i + 1) * width + j]! >= dp[i * width + j + 1]!) emit('removed', a[i++]!)
    else emit('inserted', b[j++]!)
  }
  while (i < n) emit('removed', a[i++]!)
  while (j < m) emit('inserted', b[j++]!)
  return runs
}

/** Where `needle` stands in `hay` as one unbroken run of words, from `from` on — -1 if nowhere. */
function runAt(hay: readonly string[], needle: readonly string[], from = 0): number {
  if (needle.length === 0) return -1
  outer: for (let i = from; i + needle.length <= hay.length; i++) {
    for (let k = 0; k < needle.length; k++) if (hay[i + k] !== needle[k]) continue outer
    return i
  }
  return -1
}

const PARAGRAPH_SYMBOL_RE = new RegExp(String.raw`§+\s*${PARAGRAPH_NUMBER}\.`)

/** The words a cell prints ahead of its § symbol — the §'s heading on the PDF path, nothing on the table path. */
function headingOf(cell: string): string[] {
  const symbol = PARAGRAPH_SYMBOL_RE.exec(cell)
  return symbol && symbol.index > 0 ? words4(cell.slice(0, symbol.index)) : []
}

/** A region of a row's diff: what lies between two of its anchors. */
interface Region {
  /**
   * The current column's words in it, cut at the current column's own
   * elision marks — what the row strikes there, plus stray equal words
   */
  pieces: string[][]
  /** Per piece: whether the proposed column prints words beside it inside the region */
  printedIn: boolean[]
  /** Whether the current column has words here the proposed one does not */
  strikes: boolean
  /** Whether the proposed column leaves text out here that the current one prints */
  elided: boolean
  /** The proposed column's word positions it covers, `[from, to)` */
  from: number
  to: number
}

/**
 * The row's diff cut at its anchors — equal runs of `ANCHOR` words, or the
 * elision marks both columns print at the same place.
 */
function regionsOf(runs: readonly TokenRun[]): Region[] {
  const out: Region[] = []
  let p = 0
  let open: Region | null = null
  for (const run of runs) {
    const anchor = run.type === 'equal' && (run.tokens.length >= ANCHOR || run.tokens.includes(ELISION))
    if (anchor) {
      if (open) out.push(open)
      open = null
      p += run.tokens.length
      continue
    }
    open ??= { pieces: [[]], printedIn: [false], strikes: false, elided: false, from: p, to: p }
    if (run.type === 'inserted') {
      if (run.tokens.includes(ELISION)) open.elided = true
      open.printedIn[open.pieces.length - 1] = true
    } else {
      for (const w of run.tokens) {
        if (w === ELISION) {
          open.pieces.push([])
          open.printedIn.push(false)
        } else open.pieces[open.pieces.length - 1]!.push(w)
      }
      if (run.type === 'removed' && run.tokens.some((w) => w !== ELISION)) open.strikes = true
      // A stray equal word is a word both columns print.
      if (run.type === 'equal') open.printedIn[open.pieces.length - 1] = true
    }
    if (run.type !== 'removed') p += run.tokens.length
    open.to = p
  }
  if (open) out.push(open)
  return out
}

/**
 * Check 4: text a changed row strikes, still standing in the result where
 * the row took it out — the words found, or null.
 *
 * **The one direction checks 1 to 3 never asked** (§12.12, 30.09.2026). Check 2
 * asks whether the proposed column is IN the result, never whether the result
 * holds MORE; check 3 counts only words the engine inserted or removed, and a
 * deletion the engine did not carry out inserts and removes nothing. So a
 * result that kept an Absatz the annex strikes inside a *changed* row passed
 * all three: Seilbahn-Entwurf § 10, whose Beilage drops Abs. 3 in the row
 * that also rewrites Abs. 2. A row that strikes everything — an empty
 * proposed cell — was already read (check 2's mirror image); this is the
 * same question for the part of a row that goes.
 *
 * **What a row strikes** is read off its own word diff, current against
 * proposed, cut into regions at the words it keeps (`regionsOf`). A region
 * that strikes something sits in one of three places, and each is asked
 * differently:
 *
 * - *Inside a printed stretch* — kept words on both sides. Check 2 already
 *   answers it: it wants the stretch as one unbroken run, so text left
 *   standing in its middle breaks it. That is why three quarters of the
 *   injected faults were caught before this check existed, and nothing is
 *   asked here.
 * - *At the edge of a printed stretch* — after its last word or before its
 *   first, where the row ends or the ressort set „…". Here the proposed
 *   column is intact and the extra text merely stands beside it, which is
 *   the blind spot. The row's stretches are placed in the result in order,
 *   as check 2 places them, and the words the result carries **right there**
 *   are read: where they are words this region strikes, and words the
 *   proposed column of this § prints nowhere, the struck text still stands.
 * - *With no printed word beside it* — between two marks („a) bis e) …
 *   f) … g) bis j) …" against „a) bis e) … g) bis j) …"), or in a row whose
 *   right column is nothing but marks („§ 73. (1) und (2) …" against a left
 *   column that goes on to Abs. 3). There is no place to look, only a
 *   presence: the struck text counts where it stands anywhere in the result,
 *   as the empty-cell check reads it, and only from `MIN_LOOSE` words.
 *
 * **The calibration is how tightly the words are tied to their place**, and
 * both loosenings were measured and failed. Looking for the struck text with
 * a few words of context anywhere in the § gave six corpus alarms on the
 * table path, four of them phrases that stand twice in the law — in an
 * Absatz the annex never printed (Staatsanwaltschaftsgesetz § 34 Abs. 3), in
 * the §'s own heading (VfGG § 56h). Accepting beside a stretch any words the
 * row's left column prints and the § prints nowhere on the right caught
 * hardly more (98.8 against 97.7 % of fault E on the table path, the same on
 * the PDF path) and raised the corpus alarms over both paths from five to
 * seventeen („die Bezeichnung des", „Der Sparkassenrat kann": old wording of a
 * replaced sentence, standing by chance at the edge of the next one). The
 * words have to be the ones *this* region strikes. They are read off the
 * result rather than off the region's start, because where a row rewrites
 * one sentence and drops the next the region holds both, and the struck
 * sentence is its second half (Sektenfragen-Gesetz § 11).
 *
 * Not asked: a region where the proposed column sets a mark the current one
 * does not — the ressort leaving text out, not striking it; and, before the
 * first stretch, words the left column prints ahead of the § symbol, which
 * is the §'s Überschrift — the PDF path cuts the right column's copy of it
 * short where the heading wraps (SPG § 57), and a heading is not struck by
 * being printed shorter.
 */
// --- Measured surface: exported for tests and harness scripts, not for the app. ---
export function keptDeletion(got: string, rows: readonly ComparisonRow[]): string | null {
  const pairs = rows.filter((r) => r.kind === 'pair')
  const gotTokens = words4(sameText(got))
  const shownRight = cellTokens(pairs.map((r) => r.proposed).join(' '))
  for (const row of pairs) {
    if (row.elided || row.change === 'unchanged' || !row.current || !row.proposed) continue
    const proposed = cellTokens(row.proposed)
    const runs = tokenRuns(cellTokens(row.current), proposed)
    if (!runs) continue

    // The row's printed stretches: which one every proposed word belongs to,
    // and where each starts and ends in the result — in order.
    const stretchOf: number[] = []
    const stretches: string[][] = []
    for (const [i, w] of proposed.entries()) {
      if (w === ELISION) continue
      if (i === 0 || proposed[i - 1] === ELISION) stretches.push([])
      stretches[stretches.length - 1]!.push(w)
      stretchOf[i] = stretches.length - 1
    }
    const starts: (number | null)[] = []
    const ends: (number | null)[] = []
    let from = 0
    for (const s of stretches) {
      const head = runAt(gotTokens, s.slice(0, EDGE_PROBE), from)
      const tailProbe = s.slice(-EDGE_PROBE)
      const tail = runAt(gotTokens, tailProbe, Math.max(from, head))
      // Not found in word form: `key` matched it across a line break or a
      // hyphen the words split differently. No edge to stand next to.
      starts.push(head < 0 ? null : head)
      ends.push(tail < 0 ? null : tail + tailProbe.length)
      if (tail >= 0) from = tail + tailProbe.length
    }
    // Words the result carries beside a stretch are struck text still
    // standing when one piece of the region strikes those very words and the
    // § prints them nowhere on the right.
    const standing = (beside: string[], region: Region): boolean =>
      beside.length >= MIN_KEPT && region.pieces.some((piece) => runAt(piece, beside) >= 0) && runAt(shownRight, beside) < 0
    const heading = headingOf(row.current)

    for (const region of regionsOf(runs)) {
      if (!region.strikes || region.elided) continue
      const leftPrinted = region.from > 0 && proposed[region.from - 1] !== ELISION
      const rightPrinted = region.to < proposed.length && proposed[region.to] !== ELISION
      if (leftPrinted && rightPrinted) continue
      const inserted = region.to > region.from
      const width = Math.min(PROBE, Math.max(...region.pieces.map((piece) => piece.length)))
      // The stretch the region closes: the words after it in the result.
      const end = !rightPrinted && (leftPrinted || inserted) ? ends[stretchOf[region.to - 1]!] : null
      if (end != null) {
        const beside = gotTokens.slice(end, end + width)
        if (standing(beside, region)) return beside.join(' ')
      }
      // The stretch the region opens: the words before it.
      const start = !leftPrinted && (rightPrinted || inserted) ? starts[stretchOf[region.from]!] : null
      if (start != null) {
        const beside = gotTokens.slice(Math.max(0, start - width), start)
        if (standing(beside, region) && runAt(heading, beside) < 0) return beside.join(' ')
      }
      // Pieces with no printed word beside them inside the region and none
      // at its edge: between the current column's own marks, or where the
      // region touches no printed word at all.
      const last = region.pieces.length - 1
      for (const [i, piece] of region.pieces.entries()) {
        if (region.printedIn[i] || (i === 0 && leftPrinted) || (i === last && rightPrinted) || piece.length < MIN_LOOSE) continue
        if (runAt(shownRight, piece) < 0 && runAt(gotTokens, piece) >= 0) return piece.join(' ')
      }
    }
  }
  return null
}

/** How check 5's report opens — the harness counts its alarms by it. */
export const ABSATZ_ORDER_NOTE = 'Absätze der Beilage nicht so im Ergebnis'

/**
 * „(1h)" → „1h": the Absatz markers a cell prints, in order — an elision's
 * designation chain („(2) bis (14) …", „(3) und (4) …") included.
 *
 * **Only where a marker can stand**: at the start of the cell, or after the
 * end of a sentence or an elision mark. Anywhere else a number in brackets
 * is text — the grades „sehr gut (1), gut (2)" of an exam regulation, the
 * wavelength „(254nm)" of the Bäderhygieneverordnung — and read as markers
 * they made check 5 contradict sound results (26.10.2026).
 */
function absatzMarkers(cell: string, own: string | null = null): string[] {
  const out: string[] = []
  // On the PDF path a cell is a whole §, and what stands in front of ITS
  // designation is not the § — its heading, or the § before's tail
  // („(3) […] § 6f. (1) …", DokuG-Novelle 2025). Only its own: a citation
  // ending a sentence („nach § 13.") is no place to cut.
  // A chain without its „…" reads as the one with it (`markedOmissions`), so
  // the marker behind it stands where a marker can stand.
  const full = markedOmissions(cell)
  const symbol = own ? new RegExp(`§+\\s*${own.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.\\s`).exec(full) : null
  const text = symbol ? full.slice(symbol.index) : full
  for (const m of text.matchAll(ABSATZ_RUN_RE)) {
    // „(2) Aufgehoben." is the annex's way of saying the Absatz is gone, and
    // RIS prints nothing in its place (`REPEALED_RE`).
    if (/^\s*(?:Aufgehoben|\(aufgehoben\)|entfällt)/i.test(text.slice(m.index! + m[0].length))) continue
    for (const n of m[0].matchAll(/\((\d{1,3}[a-z]?)\)/g)) out.push(n[1]!)
  }
  return out
}
/** A marker where one can stand, and the chain „bis"/„und" may hang on it. */
const ABSATZ_RUN_RE = /(?:^|(?<=[.:;…]\s*)|(?<=\.\.\.\s*))\(\d{1,3}[a-z]?\)(?:\s+(?:bis|und)\s+\(\d{1,3}[a-z]?\))*(?=\s|$)/g

/**
 * Check 5: the Absätze the annex prints in its proposed column — every row
 * of the §, in its order, the elided ones included — stand in the result,
 * in the same order. The first that does not, or null.
 *
 * **The one thing checks 1 to 4 cannot see is structure** (26.10.2026). They
 * compare text, and `stripMarkers` takes every „(2)" out first, because the
 * annex sets its markers differently from the tree. So a result that put a
 * new Absatz in the wrong place, or lost one, read the same as the right
 * one wherever its words were all there: 48/ME KOG § 35 came out
 * „(1f), (2), (1h), (3)" — the instruction says „vor Abs. 2" — and was
 * confirmed; 126/ME StAG § 42 lacked the (26) a second Artikel inserts and
 * was confirmed. Both are in the annex's own column as markers: „(1h)" above
 * „(2) bis (14) …", „(1) bis (26) …" above „(27)".
 *
 * Read off the result's DISPLAY text with the same reader as the annex's
 * column (`absatzSequence`), so both sides count a marker the same way —
 * and an Absatz the engine set inline („(1) … (2) Die Frist …" in one node,
 * Radonschutzverordnung § 11) reads as the two Absätze it says, which is
 * what the reader sees. Not where the tree holds an Absatz without a number:
 * RIS prints some first Absätze bare, and then the annex's „(1)" has
 * nothing to meet (`absatzSequence` → undefined).
 */
// --- Measured surface: exported for tests and harness scripts, not for the app. ---
export function absatzOrderBroken(rows: readonly ComparisonRow[], resultAbsaetze: readonly string[], standingAbsaetze: readonly string[] | null = null, own: string | null = null): { note: string; foreign: boolean } | null {
  if (resultAbsaetze.length === 0) return null
  const printed: string[] = []
  const assumed = new Set<string>()
  for (const row of rows) {
    if (row.kind !== 'pair') continue
    for (const m of absatzMarkers(row.current, own)) assumed.add(m)
    if (!row.proposed) continue
    for (const m of absatzMarkers(row.proposed, own)) if (printed[printed.length - 1] !== m) printed.push(m)
  }
  let at = 0
  for (const m of printed) {
    const found = resultAbsaetze.indexOf(m, at)
    if (found >= 0) {
      at = found + 1
      continue
    }
    if (resultAbsaetze.includes(m)) return { note: `(${m}) steht im Ergebnis an anderer Stelle`, foreign: false }
    // An Absatz the annex treats as standing — its geltende column prints it
    // too, „(1) bis (26) …" on both sides — and that the text the engine
    // started from lacks: the annex assumes an Absatz RIS does not carry on
    // that day, another version or one another Artikel of the draft inserts
    // first. That is the annex starting from another text (`fremd`), not our
    // result contradicting it. An Absatz the annex inserts is new on its
    // side alone, and missing from our result it is the engine's miss.
    const foreign = standingAbsaetze !== null && !standingAbsaetze.includes(m) && assumed.has(m)
    return { note: `(${m}) fehlt im Ergebnis${foreign ? ' und im geltenden Text' : ''}`, foreign }
  }
  return null
}

/**
 * The Absatz markers a § displays, in order, as check 5 reads them — or
 * undefined where the tree holds an Absatz without a number, which no marker
 * of the annex can meet.
 */
export function absatzSequence(node: LawNode): string[] | undefined {
  if (node.children.some((c) => c.level === 'abs' && !c.id)) return undefined
  return absatzMarkers(bodyText(node).replace(/\n/g, ' … '))
}

/**
 * The oracle's verdict on one §: `before` and `got` as `plainText` gives
 * them (`before` null for a § the draft creates), `rows` the annex rows of
 * that §, and `resultAbsaetze` the result's `absatzSequence` for check 5
 * (`absatzOrderBroken`) — left out by a caller that has no tree, which then
 * gets checks 1 to 4 only. `standingAbsaetze`, the standing §'s, tells an
 * Absatz the engine lost from one the annex assumes and RIS never had.
 */
export function oracleVerdict(id: string, before: string | null, got: string, rows: readonly ComparisonRow[], resultAbsaetze?: readonly string[], standingAbsaetze?: readonly string[] | null): OracleReport {
  const substantive = rows.filter((r) => r.kind === 'pair' && !r.elided && r.change !== 'unchanged')
  if (substantive.length === 0) return { para: id, verdict: 'stumm', rows: rows.length, note: null }

  const beforeKey = key(before ?? '')
  const gotKey = key(got)
  for (const row of substantive) {
    const missing = row.current ? unaccountedStretch(beforeKey, row.current) : null
    if (missing !== null) {
      return { para: id, verdict: 'fremd', rows: rows.length, note: `Geltende Fassung der Gegenüberstellung nicht im Ausgangstext: "${missing.slice(0, 60)}"` }
    }
  }
  for (const row of substantive) {
    // A row with nothing in the proposed column is the annex saying this text
    // goes away — and `row.proposed && …` skipped exactly that shape, so the
    // one row that speaks about a deletion was the one row check 2 never
    // read. What it has to say is the mirror image: the text must be *gone*
    // from the result (23.09.2026).
    if (!row.proposed) {
      // Unless a row of its own inserts the very same text again: 51/ME
      // XXVIII strikes the old § 10 whole and prints the § 17 it becomes as
      // new, both under „Strafbestimmung". To the engine they are one §
      // renamed (`paragraphRows`, `origin`), and the heading it keeps is the
      // one the annex proposes — not a deletion left standing (26.10.2026).
      // Only an inserted row, and only as often as the annex says: a CHANGED
      // row proposing that text sets it in place of another one („§ 154
      // Abs. 1 sowie die Absatzbezeichnung ‚(2)' entfallen", 121/ME), and a
      // result that holds it more often than the standing text did, less
      // what the annex strikes and plus what it inserts, kept the deletion
      // after all. Counted over the whole §, because a heading recurs in its
      // text: „Vollziehung" over „Mit der Vollziehung … ist betraut".
      const struck = key(row.current)
      const strikes = substantive.filter((r) => !r.proposed && key(r.current) === struck).length
      const inserts = substantive.filter((r) => r.change === 'inserted' && key(r.proposed) === struck).length
      const again = struck !== '' && inserts > 0 && occurrences(gotKey, struck) <= occurrences(beforeKey, struck) - strikes + inserts
      if (row.current && !again && unaccountedStretch(gotKey, row.current) === null) {
        return { para: id, verdict: 'widersprochen', rows: rows.length, note: `Gestrichene Fassung steht noch im Ergebnis: "${row.current.slice(0, 60)}"` }
      }
      continue
    }
    // The same segmentation as check 1, and it has to be the same: freeing
    // the geltende column alone would move a § out of `fremd` only to have
    // its proposed column — elided by the very same ressort in the very same
    // row — contradict it, and the page would then tell the reader the annex
    // disagrees with us where in truth it simply left text out.
    const missing = unaccountedStretch(gotKey, row.proposed)
    if (missing !== null) {
      return { para: id, verdict: 'widersprochen', rows: rows.length, note: `Vorgeschlagene Fassung nicht im Ergebnis: "${missing.slice(0, 60)}"` }
    }
  }
  // Everything the engine inserted must be a word the annex's proposed
  // column contains somewhere in this §, and everything it removed a word the
  // annex's *geltende* column carries. A bag test, not a diff against the
  // annex text: the annex elides unchanged stretches, and an LCS diff
  // against that partial text called words the engine placed correctly
  // "invented" (2026-09-09). Weaker than a diff, but it cannot be fooled by
  // what the annex leaves out, and check 2 already pins every changed row.
  //
  // **Both directions, since 23.09.2026.** The doc comment above has promised
  // "every word the engine inserted or removed" since the module was written,
  // and only the insertions were ever counted. A deletion one level too high —
  // "§ 5 Z 20 lit. a sublit. bb entfällt." applied to lit. a — invents no
  // word at all, so it passed every check here and `gateParagraph` published
  // it. The standing text the engine dropped beyond what the annex shows as
  // dropped is the signal, and it needs no diff of the annex either.
  const { segments } = diffTokens(stripMarkers(before ?? ''), stripMarkers(got))
  if (segments === null) return { para: id, verdict: 'widersprochen', rows: rows.length, note: 'Wortdiff zu groß für den Abgleich' }
  const pairs = rows.filter((r) => r.kind === 'pair')
  const insertedRaw = segments.filter((s) => s.type === 'inserted').flatMap((s) => words(s.text))
  const removedRaw = segments.filter((s) => s.type === 'removed').flatMap((s) => words(s.text))
  const inserted = bagMinus(insertedRaw, removedRaw)
  const shown = new Set(pairs.flatMap((r) => cellWords(r.proposed)))
  const unshown = inserted.filter((w) => !shown.has(w))
  if (unshown.length > 0) {
    return { para: id, verdict: 'widersprochen', rows: rows.length, note: `Engine fügte ein, was die Gegenüberstellung nicht zeigt: ${unshown.slice(0, 6).join(' ')}` }
  }
  const removed = bagMinus(removedRaw, insertedRaw)
  const dropped = new Set(pairs.flatMap((r) => cellWords(r.current)))
  const unshownRemoved = removed.filter((w) => !dropped.has(w))
  if (unshownRemoved.length > 0) {
    return { para: id, verdict: 'widersprochen', rows: rows.length, note: `Engine entfernte, was die Gegenüberstellung nicht zeigt: ${unshownRemoved.slice(0, 6).join(' ')}` }
  }
  // Check 4, last on purpose: every § it speaks on passed the other three,
  // so its alarms are exactly the confirmations it withdraws (`keptDeletion`).
  const kept = keptDeletion(got, rows)
  if (kept !== null) {
    return { para: id, verdict: 'widersprochen', rows: rows.length, note: `${KEPT_DELETION_NOTE}: "${kept.slice(0, 60)}"` }
  }
  // Check 5, last for the same reason: its alarms are the confirmations it
  // withdraws.
  const broken = resultAbsaetze ? absatzOrderBroken(rows, resultAbsaetze, standingAbsaetze ?? null, id) : null
  if (broken !== null) {
    return { para: id, verdict: broken.foreign ? 'fremd' : 'widersprochen', rows: rows.length, note: `${ABSATZ_ORDER_NOTE}: ${broken.note}` }
  }
  return { para: id, verdict: 'bestätigt', rows: rows.length, note: null }
}

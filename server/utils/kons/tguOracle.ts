/**
 * The ressort's Textgegenüberstellung as an oracle for the engine
 * (docs/api-exploration.md §2c).
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
 * the tree does not carry, so the comparison is not text equality but five
 * checks over the rows of one §:
 *
 *   1. every changed row's *current* text is in the standing § — the annex
 *      talks about the same law version the engine started from;
 *   2. every changed row's *proposed* text is in the engine's result, and a
 *      row that proposes nothing — the annex's way of writing a deletion —
 *      is gone from it: the engine did what the ministry says the draft does;
 *   3. every word the engine inserted is one the annex's proposed column
 *      shows, and every word it removed one the geltende column shows — and,
 *      since 19.11.2026, shows *there*, with the words around it
 *      (`unplacedChange`): the engine did nothing the ministry does not show;
 *   4. what a changed row strikes does not still stand in the result where
 *      the row took it out — the result holds no more than the annex
 *      proposes (`keptDeletion`, since 01.10.2026; checks 1 to 3 only ever
 *      asked whether the proposed text is IN the result);
 *   5. the Absätze the annex prints stand in the result in its order, and
 *      none it strikes still stands there (`absatzOrderBroken`).
 *
 * Their reach and their blind spots are measured by fault injection
 * (`scripts/harness/faultInjection.ts`, whose doc comment carries the
 * table) and held against the enacted law by the BGBl bench
 * (`scripts/harness/kons.ts --oracle`).
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
import { articleUnitId, articleUnitLaws, explanationParaId } from '../../../shared/utils/explanationKey'
import { expandRange } from './novao'

export type OracleVerdict =
  /** All five checks hold */
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

/**
 * "§ 5." → "5", "§ 12a." → "12a"; null for anything else.
 *
 * The annex's own Gliederungssymbol, anchored at the start of it — not
 * `text/designation.bareParaId`, which reads the first number anywhere in a
 * label: a row opening with anything but a § must not answer here.
 */
export function paraIdOfGld(gld: string | null): string | null {
  return paraIdOf(gld)
}

function paraIdOf(gld: string | null): string | null {
  const t = normalizeText(gld ?? '')
  // „§ 2.01." whole: a Verordnung that numbers its §§ by Kapitel (the
  // Wasserstraßen-Verkehrsordnung's „§ 8.03") is keyed so on the address
  // side (`unitKey`), and read as „2" here every § of a Kapitel fell into
  // one (26.10.2026).
  //
  // Read by the reader the page reads a § block with (`explanationParaId`):
  // „§. 517.", the full stop after the sign with which RIS prints the §§ of
  // the ZPO and the Jurisdiktionsnorm, among it. A pattern of its own here
  // learnt that form alone, and the page could not find the confirmed §§'
  // rows (20.11.2026).
  const id = explanationParaId(t)
  if (id) return id
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
  // A law whose units are Artikel — the B-VG — keys „Artikel 52." as the
  // engine names it, „52" (`articleUnitLaws`, decided for the page alike).
  const byArticle = articleUnitLaws(rows)
  const paraIdOfGld = (gld: string | null, law: string | null = null): string | null => {
    const id = paraIdOf(gld)
    if (id !== null || !byArticle.has(law ?? '')) return id
    return articleUnitId(normalizeText(gld ?? ''))
  }
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
    let id = paraIdOfGld(row.gld, row.law)
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
    if (!id && next && next.kind === 'pair' && paraIdOfGld(next.gld, next.law) && isHeadingRow(row, next)) {
      id = paraIdOfGld(next.gld, next.law)
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
      const opened = paraIdOfGld(row.para, row.law)
      if (opened && paragraphKey(opened, row.law) !== current && !opensBelow(rows, i, opened, (g) => paraIdOfGld(g, row.law))) id = opened
    }
    if (id) {
      current = paragraphKey(id, row.law)
      drawer = { ...drawerOf(id, opener, row.law, (g) => paraIdOfGld(g, row.law)), standing: id }
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
function drawerOf(id: string, opener: ComparisonRow, law: string | null, idOf: (gld: string | null) => string | null = paraIdOf): { key: string; struck: boolean } {
  if (opener.paraAfter === opener.para) return { key: paragraphKey(id, law), struck: false }
  if (opener.paraAfter === null) return { key: paragraphKey(id, law), struck: true }
  return { key: paragraphKey(idOf(opener.paraAfter) ?? id, law), struck: false }
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
function opensBelow(rows: readonly ComparisonRow[], at: number, id: string, idOf: (gld: string | null) => string | null = paraIdOf): boolean {
  const { para, law } = rows[at]!
  for (let j = at + 1; j < rows.length; j++) {
    const r = rows[j]!
    if (r.kind !== 'pair' || r.para !== para || r.law !== law) return false
    if (r.gld) return idOf(r.gld) === id
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
  if (inherited.length === 0) return movedLeftColumn(byParagraph, kept, own, originId, id, origin, law, struck, standing)
  const position = POSITION.get(byParagraph)!
  return [...kept, ...inherited].sort((a, b) => position.get(a)! - position.get(b)!)
}

/**
 * A renumbered § whose old text the PDF path paired with another § by number
 * (20.11.2026): where 35/ME XXVIII moves the old § 44f to § 44g, the row
 * „§ 44g." carries the old § 44g on the left and the new one on the right,
 * and the row „§ 44f." the old § 44f on the left. The new § 44g kept only its
 * right column, every word the draft struck from the old § 44f stood in no
 * cell, and check 3 reported „daß" → „dass" as a removal the annex does not
 * show. Its left column is the origin's row's: one row of each, the origin's
 * standing for the origin and struck nowhere. Anything else stays as it was.
 */
function movedLeftColumn(
  byParagraph: ReadonlyMap<string, ComparisonRow[]>,
  kept: ComparisonRow[],
  own: readonly ComparisonRow[],
  originId: string | null,
  id: string,
  origin: string | null,
  law: string | null | undefined,
  struck: ReadonlySet<ComparisonRow>,
  standing: ReadonlyMap<ComparisonRow, string>,
): ComparisonRow[] {
  if (originId === null || origin === id) return kept
  const pairs = kept.filter((r) => r.kind === 'pair')
  if (pairs.length !== 1 || pairs[0]!.current || pairs[0]!.elided || own.filter((r) => r.kind === 'pair').length !== 1) return kept
  const left = drawerRows(byParagraph, originId, law).filter((r) => r.kind === 'pair' && !struck.has(r) && standing.get(r) === originId && r.current)
  if (left.length !== 1 || left[0]!.elided) return kept
  const moved: ComparisonRow = { ...pairs[0]!, current: left[0]!.current, change: 'changed', segments: null, editorial: false, elisionRange: false }
  return kept.map((r) => (r === pairs[0] ? moved : r))
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
 * annex, over every key of the map.
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

/**
 * `next`, where given, is the row below. A row the parser already filed
 * under the § that row opens (`para` = its `gld`) is that §'s heading at any
 * length (20.11.2026): capped at 120 characters, „Einholung einer
 * Strafregisterauskunft aus einem anderen Mitgliedstaat der Europäischen
 * Union oder aus dem Vereinigten Königreich" stayed with § 9b, and § 9c of
 * the Strafregistergesetz (2/ME XXVIII) met the words of its heading as
 * inventions; § 10b and ARHG § 17a the same. Never a group heading: the
 * parser hands the § below the group headings it held back too.
 */
function isHeadingRow(row: ComparisonRow, next?: ComparisonRow): boolean {
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
  const typed = next !== undefined && next.kind === 'pair' && !row.gld && row.para !== null && next.gld === row.para
  // The laws that print „§. 39." close their § headings with a full stop
  // too: „Rechtshilfe auf Ersuchen ausländischer Gerichte." over JN § 39,
  // „Unzulässigkeit und Verweigerung des Zeugnisses." over ZPO § 320
  // (20.11.2026). Over such a designation only, and one stop at the end of a
  // short line: a sentence of the § above has its own form and its own row.
  const oldStyle = next !== undefined && next.kind === 'pair' && OLD_STYLE_GLD_RE.test(normalizeText(next.gld ?? ''))
  const ends = (c: string) => !/[.;:]$/.test(c) || (oldStyle && c.length <= 120 && /\p{L}\.$/u.test(c) && !/[.;:!?]\s/.test(c))
  return cells.length > 0 && cells.every((c) => (c.length <= 120 || (typed && !isGroupHeadingOnly(c))) && ends(c))
}

/** „§. 39." — the sign with its own full stop, the form of the oldest laws RIS prints (`explanationParaId`). */
const OLD_STYLE_GLD_RE = /^§+\.\s*\d/

/**
 * A Paragraphenkennung with its full stop, the number whole (`PARAGRAPH_NUMBER`,
 * in a lookahead so it cannot give its decimal back to the stop) — or, for a
 * Kapitel's number, without one: „§ 8.03 Sicherheit an Bord …". Cut as „§ 8."
 * the rest „03" stayed in the comparison form.
 */
const PARAGRAPH_MARKER_RE = new RegExp(String.raw`§+\.?\s*(?=(${PARAGRAPH_NUMBER}))\1(?:\.|(?<=\.\d[\da-z]*)(?=\s|$))\s*`, 'g')

/**
 * Comparison form of annex text: markers the tree does not carry are
 * dropped, whitespace and quotes normalised the way `plainText` does.
 *
 * **The Paragraphenkennung is dropped wherever it stands, not only at the
 * head of the cell** (26.09.2026). The anchor was right while a cell
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
        keepsNumber(all.slice(0, offset), all.slice(offset + _whole.length), num) ? `${pre}${num}` : pre)
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
function keepsNumber(before: string, after: string, num: string): boolean {
  if (MONTH_AFTER_RE.test(after) || CITATION_BEFORE_RE.test(before) || /^\d{4,}$/.test(num)) return true
  // „ist der 1. Handel mit Finanzinstrumenten, … 2. die Annahme …" sets a
  // list's first marker after the article its items share, so „1." stays a
  // marker after a determiner too. Not decided by whether a „2." follows:
  // the annex prints the markers and RIS's text does not, so that question
  // gets two answers for one sentence (19.11.2026, 23 §§ moved).
  return num !== '1' && (ORDINAL_BEFORE_RE.test(before) || ORDINAL_RANGE_BEFORE_RE.test(before))
}
const MONTH_AFTER_RE = /^\s*(?:Jänner|Januar|Feber|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)(?!\p{L})/u
// „S. 1." is the page of an Official Journal citation („ABl. Nr. L 283 vom
// 31.10.2017 S. 1."), and only with its stop: „S" alone is no designator.
const CITATION_BEFORE_RE = /(?:(?<!\p{L})(?:Abs|Art|lit|Nr|Z|Ziff|Pkt|Tz|Rz)\.?|(?<!\p{L})S\.|(?<!\p{L})(?:Absatz|Absätze|Artikel|Ziffer|Ziffern|Satz|Sätze|Punkt|Teil|Abschnitt|Hauptstück|Kapitel))\s*$/u
/**
 * An ordinal of the text: „das 18. Lebensjahr", „nach dem 2. Hauptstück",
 * „am 15. Tag", „der 2. Genehmigungsfreistellungsverordnung", „sein 63.
 * Lebensjahr" (19.11.2026). An article or a possessive asks for a noun, so
 * the number after it is an adjective of that noun — „1." excepted, see
 * `keepsNumber`. Stripped as markers, a draft raising an age read the same
 * whether the engine carried it out or not: fault class „Zahl" got 44 of 482
 * changed figures past the oracle on the PDF path and 27 of 295 on the table
 * path, nearly all of them such ordinals, and one real result was among
 * them — APG § 4 (15/ME XXVIII), where the draft raises the Korridorpension
 * from the 62nd to the 63rd year, the engine left the 62 standing and the
 * oracle confirmed it (the request path withholds that § as refused, so the
 * page never showed it; the oracle had no part in that).
 *
 * Every rule here reads only what stands BEFORE the number, in its own
 * sentence: that is text both sides share. The annex prints Ziffer markers
 * and RIS's text does not, so a rule that asked what follows — whether a
 * „2." comes after a „1." — answered one sentence twice and moved 23 §§ in
 * the first run.
 */
const DETERMINER = String.raw`(?:der|die|das|dem|den|des|am|im|zum|zur|vom|beim|ins|ans|ein|eine|einem|einen|einer|eines|sein|seine|seinem|seinen|seiner|seines|ihr|ihre|ihrem|ihren|ihrer|ihres|jede[mnrs]?)`
// Whatever stands before the determiner is not asked: the annex prints a
// marker there that RIS's text does not („oder 2. das 20. Lebensjahr"
// against „oder das 20. Lebensjahr"), and a rule that read it would judge
// one sentence twice. „Personen, die 1. Staatsangehörige …" — a relative
// clause opening a list — is the „1." that stays a marker anyway.
const ORDINAL_BEFORE_RE = new RegExp(String.raw`(?<!\p{L})${DETERMINER}\s*$`, 'iu')
/** …and the ordinals that continue one in a range: „das 3. bis 6. und das 12. bis 15. Hauptstück". */
const ORDINAL_RANGE_BEFORE_RE = new RegExp(String.raw`(?<!\p{L})${DETERMINER}\s+\d+[a-z]*\.(?:\s+(?:bis|und|oder|sowie)\s+\d+[a-z]*\.)*\s+(?:bis|und|oder|sowie)\s*$`, 'iu')

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
 * drafts were nothing else (06.10.2026).
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
  return sameLayout(t)
    .replace(RIS_NOTE_RE, ' ')
    .replace(NOTE_REFERENCE_RE, ' ')
    .replace(WEB_VIEW_RE, ' ')
    .replace(VERSION_LABEL_RE, ' ')
    .replace(PLACEHOLDER_RE, 'XXX')
    .replace(REPEALED_RE, ' ')
}

/**
 * The same words in another setting (20.11.2026), read alike on both sides —
 * RIS's own text carries some of them too — since no draft orders and no
 * engine makes any of it:
 *
 *  - „lit. b)": the Litera named with its bracket, which the marker rule
 *    below would take off with the letter (106/ME XXVIII, BUAG § 31);
 *  - „Z." before a number, the abbreviation's other spelling (49/ME, MedienG
 *    § 26);
 *  - „a." where RIS prints „a)": a list marker in another spelling, at the
 *    head of the text, behind a colon, a semicolon or an omission mark, or
 *    behind another marker (4/ME, UGB § 189; 74/ME, BFA-VG § 43) — never
 *    behind a comma or a word, where „d. h." and „u. a." stand;
 *  - „|", a table's column rule (104/ME, FAG 2024 § 11).
 *
 * Commas, full stops inside a sentence, quotation marks and spellings stay
 * as they are: no fault class injects punctuation, so a wrong comma of the
 * engine would pass unseen (`docs/decisions.md`, „More tolerance when matching
 * against the annex").
 */
function sameLayout(t: string): string {
  return t
    .replace(/\|/g, ' ')
    .replace(/(?<![\p{L}])(lit\.)(?=[a-z]{1,2}\b)/gu, '$1 ')
    .replace(/(?<![\p{L}])(lit\.\s*[a-z]{1,2})\)/gu, '$1')
    .replace(/(?<![\p{L}])Z\.(?=\s*\d)/gu, 'Z')
    .replace(/(^\s*|(?:[:;…]|\.\.\.)\s*|(?:^|\s)(?:\(\d+[a-z]*\)|\d+[a-z]*\.)\s+)([a-z])\.(?=\s)/g, '$1$2)')
}

/**
 * A marker glued to its word, „3.eine", „, 5.das", „.2.sonstigen" — the PDF
 * text layer of the ressort's annex (21/ME, 19/ME, 113/ME XXVIII,
 * 20.11.2026). In the annex's cells only (`oracleVerdict`): where the
 * engine's result carries „2.vom", inherited from a draft that glues its
 * markers, check 2 has to see it.
 */
function unglued(t: string): string {
  return t.replace(/(?<![\p{L}\d])(\d+[a-z]?\.)(?=\p{Ll}{2})/gu, '$1 ')
}

/**
 * „(Anm.: Abs. 2 aufgehoben durch Art. 4 Z 54, BGBl. I Nr. 118/2016)" — and
 * one bracket inside it (20.11.2026), the shape `lawtext/konsTree.ts` and
 * `annex/annexText.ts` strip: the ressort's own „(Anm.: § 85 (2) bleibt
 * inhaltlich unverändert …)" in 61/ME XXVIII's BAO annex stood as text of
 * the left column.
 */
const RIS_NOTE_RE = /\(Anm\.?\s*:[^()]*(?:\([^()]*\)[^()]*)*\)/g
/**
 * RIS's web view, copied into the left column with the law (20.11.2026): the
 * footnote reference „75 000 Euro (Anm. 1)" — the number's valorisation note,
 * which `lawtext/konsTree.ts` drops from the standing text — the line
 * „Beachte für folgende Bestimmung", and the label over a version, „Ab
 * 1.9.2025:", „Ab 1.9.2025 bzw. mit dem der Kundmachung folgenden Tag:". In
 * no § document's text, and on either side no word of the law: 21 §§ of
 * period XXVIII were withheld as `anhang-fremd` for nothing else (58/ME
 * BVergG 2018 § 213, 24/ME BSFG 2017 §§ 27, 28). The label only with a date
 * in figures and its colon, as RIS prints it; the law writes its dates out.
 */
const NOTE_REFERENCE_RE = /\(\s*Anm\.?\s*\d+[a-z]?\s*\)/g
const WEB_VIEW_RE = /Beachte für folgende Bestimmung(?:en)?/g
const VERSION_LABEL_RE = /(?<![\p{L}\d])Ab \d{1,2}\.\s?\d{1,2}\.\s?\d{4}(?:\s+bzw\.\s[^:.;]{0,80})?:/gu
/**
 * The citation of a Bundesgesetzblatt not yet issued: the draft writes „BGBl.
 * I Nr. xxx/xxxx", its own annex „xxx/yyyy" or „XX/2025" — one placeholder,
 * spelt three ways (06.10.2026). Only where an x or y stands in it, and as a
 * token of its own: the word diff hands check 3 „xxx/2026" without its „Nr.",
 * and a placeholder normalised on one side only contradicted four §§ the
 * first version had confirmed. A „#" is the same placeholder digit
 * (20.11.2026): 4/ME XXVIII prints „xxx/202#" in its annex where the draft
 * writes „xxx/2025", and the § stood contradicted for it.
 */
const PLACEHOLDER_RE = /(?<![\p{L}\d#])(?=[\dxXyY#]*\/?[\dxXyY#]*[xXyY#])[\dxXyY#]+\s*\/\s*[\dxXyY#]+(?![\p{L}\d#])/gu
/**
 * „Aufgehoben" where a repealed Absatz stood — the annex prints it, RIS's
 * text does not. „(entfällt)" in brackets is the same placeholder
 * (20.11.2026): 141/ME XXVIII prints „3. (entfällt)" and „(1) (entfällt)"
 * for the units it strikes, and two §§ of the Zivildienstgesetz stood
 * contradicted by their own placeholder. Only in brackets: a bare
 * „entfällt" is a word of the law („die Pflicht entfällt").
 */
const REPEALED_RE = /(?<!\p{L})(?:Aufgehoben|\((?:aufgehoben|entfällt)\))(?!\p{L})/gu

// --- Measured surface: the harness asks `unaccountedStretch` in this form. ---
export const containmentKey = key

/**
 * The comparison form before `key` closes it up: `sameText` and the marker
 * rule over the whole text, spaces kept. The second witness
 * (`kons/draftWitness.ts`) cuts it into tokens and needs the very reading the
 * checks use, or a word they compare would be a different word there.
 */
export function comparisonText(t: string): string {
  return stripMarkers(sameText(t))
}

/** Words without punctuation — "36," and "36" are the same word. */
function words(t: string, reading: (t: string) => string = (t) => t): string[] {
  return punctuationTokens(reading(stripMarkers(sameText(t))))
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
  return [...words(t), ...words(t.replace(/(\p{L})- (?=\p{L})/gu, '$1-')), ...words(t.replace(/(\p{Ll})- (?=\p{Ll})/gu, '$1')), ...words(t, splitHyphens)]
}

/**
 * A hyphen between two letters, split into a word of its own (20.11.2026).
 * RIS sets „ARF - Mittel" where the annex prints „ARF-Mittel" (TDBG § 40d,
 * 116/ME XXVIII, a § the bench finds identical to the enacted law), and
 * check 3 asked the annex for the three words „ARF", „-", „Mittel" the engine
 * removed. The annex is read this way as well, on the comparison form where
 * every dash is „-" (`normalizeText`); the engine's words stay as the diff
 * cut them. Closing RIS's spaced hyphen instead failed on a chain the diff
 * cuts in the middle („wird - GVG-B -" against „wird – GVG-B – geregelt",
 * AsylG § 50, 74/ME). Nothing gets in that the annex does not print.
 */
function splitHyphens(t: string): string {
  return t.replace(/(\p{L})-(?=\p{L})/gu, '$1 - ')
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
/**
 * The dots that belong to a designation rather than to a sentence — a Roman
 * one with a letter too (20.11.2026): „IIIa. Abschnitt" (BWG, 108/ME XXVIII)
 * and „IIa. Hauptstück" (EU-JZG, 161/ME) read as a sentence's full stop, and
 * a new group's heading over a § was neither a stack nor a heading alone.
 */
const DESIGNATION_DOT_RE = /(?:\d+[a-z]*|[IVXLCDM]+|(?<!\p{L})[IVXLCDM]+[a-z]|(?<!\p{L})\p{Lu})\./gu

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
 * measured 26.09.2026.
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
function withoutHeadingStack(piece: string, text: string, from: number, stackOk: StackOk | null = null, raw = ''): { piece: string; found: number } | null {
  if (!HEADING_START_RE.test(piece)) return null
  // EVERY cut, not the first: the PDF path prints a group whose name is the
  // §'s own heading twice — „1. Abschnitt Status des Asylberechtigten Status
  // des Asylberechtigten § 3." — and cutting at the first copy leaves a
  // remainder that starts with the heading and still is not the standing
  // text (05.10.2026).
  for (let cut = 1; cut < piece.length; cut++) {
    const rest = piece.slice(cut)
    // A remainder shorter than a heading only below a group unit: „2.
    // Unterabschnitt Internationale Zusammenarbeit 7. Abschnitt Sanktionen
    // § 106. (1) Wer …" leaves „Wer" (BörseG § 106). Without one, „f)
    // ‚Gefilterter Honig'" left „Honig", which the result opens with by
    // chance (Honigverordnung § 3).
    if (rest.length < MIN_HEAD_REST && !GROUP_UNIT_RE.test(piece.slice(0, cut))) continue
    // The §'s own heading may be all the stretch has left — „2. Abschnitt
    // Umstellungsförderung (58-01) Fördervoraussetzungen" before the marks of
    // „§ 209. (1) bis (5) …" — so a remainder shorter than the probe has to
    // open the standing text whole.
    if (!text.startsWith(rest.slice(0, HEAD_PROBE))) continue
    if (!isStack(piece.slice(0, cut)) || (stackOk && !stackOk(piece.slice(0, cut), raw))) continue
    // Where the standing text begins, and nowhere else (19.11.2026). Found
    // anywhere, a remainder whose first words merely recur further down
    // passed: „Zivilflugplatz-Bewilligung" opens LFG § 68 and stands again in
    // brackets in its first sentence, so everything before that bracket —
    // law text, commas and all — was dropped as a „stack", and a word lost
    // from it went unseen. Fault classes Wort-weg and Überschrift found 31
    // and 130 such misses on the PDF path.
    if (text.startsWith(rest, from)) return { piece: rest, found: from }
  }
  return null
}

/**
 * Whether a prefix check 2 would drop as a heading stack may be dropped —
 * given in comparison form (`dropped`) and with the raw stretch it opens
 * (`raw`), where a group's numbering still stands.
 */
type StackOk = (dropped: string, raw: string) => boolean

/**
 * What check 2 may drop in front of a row's proposed column as a heading
 * stack (19.11.2026): anything, where the geltende column prints something
 * in front of its § symbol too — the annex prints a stack over this § —, and
 * otherwise only what is shaped like a group heading: a unit („Abschnitt"),
 * a numbering („4. Kleinhandel …", „8a. …", „III. …"), capitals („MASSNAHMEN
 * ZUR …"), or a title's tail in brackets („… (EKB-InvestitionsV)").
 *
 * A plain prefix where the geltende column prints none is the § heading the
 * draft adds, and the result has to carry it. Dropped as a stack it went
 * unchecked: BBG 2027-2028 § 61 (GSpG) was confirmed without the heading
 * „Vollziehung" the draft prepends and the engine had refused, BAO § 48h
 * without the one it inserts (refused too), AußWG § 70a — a new § inserted
 * „samt Überschriften" — without its heading at all.
 */
function stackOkFor(current: string): StackOk {
  const cell = normalizeText(current)
  const symbol = cell ? PARAGRAPH_SYMBOL_RE.exec(cell) : null
  if (symbol !== null && /\p{L}/u.test(cell.slice(0, symbol.index))) return () => true
  return (dropped, raw) => GROUP_UNIT_RE.test(dropped) || /\)$/.test(dropped) || /^\s*(?:\d+[a-z]*|[IVXLCDM]+[a-z]?|\p{Lu})\.(?:\s|$)/u.test(raw) || /^\s*\p{Lu}{2,}\s+\p{Lu}{2,}/u.test(raw)
}

/**
 * Whether a cell's first stretch is a group heading whose tail is the
 * standing §'s own heading — „Abschnitt IV Gemeinsame Bestimmungen …
 * Auswirkung künftiger Änderungen … § 37. (1) bis (12) …", the § symbol cut
 * off with the chain it announces (19.11.2026). Where the geltende column
 * prints one, the proposed column's must carry the § heading the result
 * opens with, and is not passed over as a group heading alone
 * (`isGroupHeadingOnly`): it was, and a § heading the draft changes and the
 * engine left alone was confirmed — 57 of 1.088 heading faults on the PDF
 * path went through so.
 */
function groupStretchCarriesHeading(cell: string, beforeKey: string): boolean {
  if (!cell || beforeKey === '') return false
  const first = printedStretches(markedOmissions(cell)).find((st) => /[\p{L}\d]/u.test(key(st)))
  return first !== undefined && isGroupHeadingOnly(first) && withoutHeadingStack(key(first), beforeKey, 0) !== null
}

/** How the first stretch of the row that opens the § is held (`placedStretches`). */
interface HeadingPlacement {
  /** It is a group heading with the § heading in its tail (`groupStretchCarriesHeading`) */
  required: boolean
  stackOk: StackOk | null
}

/** The fewest characters a remainder must keep to count as the §'s own heading. */
const MIN_HEAD_REST = 8
/** A group unit's name, as the comparison form keeps it (its number stripped). */
const GROUP_UNIT_RE = /(?:Teil|Hauptst(?:ü|ue)ck|Abschnitt|Unterabschnitt|Kapitel|Titel)/i
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
const NUMBERED_UNIT_RE = /^\s*(?:(?:(?:\d+[a-z]*|[IVXLCDM]+[a-z]?)\.|(?:Erst|Zweit|Dritt|Viert|Fünft|Sechst|Siebent|Sieb|Acht|Neunt|Zehnt|Elft|Zwölft)e[rs]?)\s*(?:Teil|Hauptst(?:ü|ue)ck|Abschnitt|Unterabschnitt|Kapitel|Titel)(?!\p{L})|(?:Teil|Hauptst(?:ü|ue)ck|Abschnitt|Unterabschnitt|Kapitel|Titel)\s+(?:\d+[a-z]*|[IVXLCDM]+[A-Z]?)(?![\p{L}\d]))/iu

/**
 * Whether a stretch is nothing but a group heading. The ressort prints the
 * NEXT group's heading at the foot of a § — „… (5) bis (8) … 3. Abschnitt"
 * (Bäderhygieneverordnung § 43), or as the whole of a row (§ 9 of the
 * Seilbahn-Verordnung); RIS files it with no § at all (`konsTree.context`).
 * It says nothing about the § either way, like a stretch of bare markers.
 */
function isGroupHeadingOnly(stretch: string): boolean {
  if (!NUMBERED_UNIT_RE.test(stretch)) return false
  // A stretch that carries a § symbol and text after it opens that §
  // (19.11.2026): „3. Abschnitt Bestimmungen zur Visumpflicht Form und
  // Wirkung der Visa D § 20. (1) Visa D werden erteilt als" has no full stop
  // of its own up to the omission mark, and read as a heading alone its §
  // heading and its law text were never held against the result. The
  // heading stack above a § is `withoutHeadingStack`'s to drop. Nothing
  // after the symbol („15. Teil … 1. Abschnitt Behörden § 148. (…)") and it
  // is the stack alone.
  const symbol = PARAGRAPH_SYMBOL_RE.exec(stretch)
  if (symbol && /\p{L}/u.test(stretch.slice(symbol.index + symbol[0].length))) return false
  return !/[.;:!?]/.test(oldStyleDotsOff(stretch).replace(DESIGNATION_DOT_RE, '').replace(UNIT_COLON_RE, '$1'))
}

/**
 * The rows of a § without the next group's heading at their foot
 * (20.11.2026). The table path files the heading of the group that follows
 * a § — „3a. Abschnitt", then its title „Organhandel und verwandte strafbare
 * Handlungen" on a row of its own — under the § above it (StGB § 104b,
 * 122/ME XXVIII; EU-JZG § 23, 161/ME: „IIa. Hauptstück", „Durchführung der
 * Verordnung (EU) 2024/3011"). The result carries no group headings by
 * design, so check 2 looked for them in vain. A stretch that is nothing but a
 * group heading was passed over already (`isGroupHeadingOnly`); its title on
 * the next row was not.
 *
 * Only at the foot: from a row that is a group heading alone to the last
 * row, every row after it a title — short, no full stop, colon or semicolon
 * at its end, no § symbol, no Absatz marker — and at least one row of the §
 * itself above. A § heading stands above the § body, never below it, so the
 * rule cannot take one.
 */
function withoutNextGroup(rows: readonly ComparisonRow[]): readonly ComparisonRow[] {
  let cut = rows.length
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i]!
    if (row.kind !== 'pair' || row.elided) break
    const cells = [row.current, row.proposed].filter(Boolean)
    if (cells.length === 0) break
    if (cells.every(isGroupHeadingOnly)) {
      cut = i
      continue
    }
    if (cells.every((c) => c.length <= 120 && /^[\p{Lu}\d]/u.test(c) && !/[.;:]$/.test(c) && !/§|^\s*\(\d/.test(c))) continue
    break
  }
  if (cut === rows.length || !rows.slice(0, cut).some((r) => r.kind === 'pair' && !r.elided && (r.current || r.proposed))) return rows
  return rows.slice(0, cut)
}

/**
 * The rows of a § without a group's title the parser held back for it and
 * `isHeadingRow` read as the §'s heading (20.11.2026). Past 120 characters a
 * row the parser files under the § below is that §'s heading
 * (`isHeadingRow`, `next`) — and so is the title of the group above it,
 * which the parser hands on the same way: „Europäische Ermittlungsanordnung,
 * Europäische Herausgabe- und Sicherungsanordnung, …" over EU-JZG § 55a
 * (161/ME XXVIII), whose left column stands nowhere in the standing §. It
 * goes from the comparison, as it went from this § before; it no longer
 * lands in the § above either, where it made § 47 `fremd`. A heading the
 * standing § does carry stays, and so does one with no left column: a new
 * §'s heading is held against the result.
 */
function withoutHeldGroupTitle(rows: readonly ComparisonRow[], before: string | null): readonly ComparisonRow[] {
  const pairs = rows.filter((r) => r.kind === 'pair')
  const head = pairs[0]
  if (!head || head.gld || !head.current || (head.current.length <= 120 && head.proposed.length <= 120)) return rows
  if (!isHeadingRow(head, pairs[1])) return rows
  if (unaccountedStretch(key(before ?? ''), head.current) === null) return rows
  return rows.filter((r) => r !== head)
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
 * The same with the letter of the group it opens and the old full stops,
 * „… zu erlassen. E. Beistandspflicht." (BAO § 153g, 148/ME XXVIII,
 * 20.11.2026): one capital and its stop, then a title of at most six words,
 * every one capitalised but the words that join a title („und", „der",
 * „für" …) — „E. Beistandspflicht gilt immer." is a sentence.
 */
const LETTERED_NEXT_HEADING_RE = /(?<=[.;!?])\s+\p{Lu}\.\s+\p{Lu}[^.;:!?§\d]*\.?$/u
const TITLE_JOINER_RE = /^(?:und|oder|sowie|der|die|das|des|dem|den|von|vom|für|zur|zum|im|in|bei|mit|aus|über|nach|gegen|auf|an)$/

function isLetteredNextHeading(stretch: string): boolean {
  const trailer = LETTERED_NEXT_HEADING_RE.exec(stretch)?.[0]
  if (trailer === undefined) return false
  const words = trailer.trim().replace(/\.$/, '').split(/\s+/).slice(1)
  return words.length <= 6 && words.every((w) => /^[\p{Lu}(]/u.test(w) || TITLE_JOINER_RE.test(w.replace(/,$/, '')))
}

/**
 * A stretch of its own behind an omission mark, last in the cell, that can
 * only head what follows (20.11.2026): „(4) bis (6) … Eintragung und
 * Weiterleitung von Daten in Register und Verzeichnis" — the next §'s heading
 * at the foot of SchFG § 112 (21/ME XXVIII) — and the bare number of the next
 * group, „(1) bis (8) ... IV." (BWG § 9, 108/ME). Law text behind a mark ends
 * in a sign: a sentence, a list item's comma or semicolon. This ends in
 * none, opens with a capital and carries no digit or § — or is a Roman
 * numeral and its stop alone.
 */
function isHeadingAfterMark(stretch: string): boolean {
  const t = stretch.trim()
  if (/^[IVXLC]+\.$/.test(t)) return true
  return /^\p{Lu}[^.;:!?§\d]*$/u.test(t) && t.split(/\s+/).length <= 14
}

/**
 * „… wenn das Zertifikat wieder auflebt. 2. Hauptstück" — the next group's
 * heading in the same stretch as the last sentence of this §, with no mark
 * between them. Only after a sentence's end, only numbered or counted in
 * words, and with no sentence punctuation of its own.
 */
const TRAILING_GROUP_RE = /(?<=[.;!?])\s*(?:(?:\d+[a-z]*|[IVXLCDM]+[a-z]?)\.\s*|(?:Erst|Zweit|Dritt|Viert|Fünft|Sechst|Siebent|Sieb|Acht|Neunt|Zehnt|Elft|Zwölft)e[rs]?\s+)(?:Teil|Hauptst(?:ü|ue)ck|Abschnitt|Unterabschnitt|Kapitel|Titel)(?!\p{L})[^.;:!?]*$/iu

/**
 * The same with the unit first, „… festlegen. ABSCHNITT 3" (FKG § 11, 30/ME
 * XXVIII, 20.11.2026): alone or with a capitalised title behind it, so that
 * law text opening with a unit („… gilt. Abschnitt 3 gilt sinngemäß") is
 * never taken. Case-sensitive, since under the `i` flag `\p{Lu}` matches a
 * lower-case letter too: the unit capitalised or in capitals.
 */
const TRAILING_UNIT_FIRST_RE = /(?<=[.;!?])\s*(?:Teil|Hauptst(?:ü|ue)ck|Abschnitt|Unterabschnitt|Kapitel|Titel|TEIL|HAUPTST(?:Ü|UE)CK|ABSCHNITT|UNTERABSCHNITT|KAPITEL|TITEL)\s+(?:\d+[a-z]*|[IVXLCDM]+[A-Z]?)(?![\p{L}\d])(?:\s+[\p{Lu}\d][^.;:!?]*)?$/u

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

/**
 * The same for Ziffern (20.11.2026): „: 1. bis 4 5. zwei Vertreter/innen …"
 * (UVP-G 2000 § 26, 138/ME XXVIII), „1. bis 2. 3." (AIFMG § 5, 76/ME) — a
 * chain at the start of the cell or behind a sign, followed straight by the
 * next Ziffer's marker. Behind a word it is a date or a citation („vom 1.
 * bis 4. Juli"), and stays text.
 */
const DOTLESS_ZIFFER_OMISSION_RE = /(?:^|(?<=[.:;…]\s*))\d{1,3}[a-z]?\.\s+bis\s+\d{1,3}[a-z]?\.?(?=\s+\d{1,3}[a-z]?\.\s)/g

function markedOmissions(cell: string): string {
  const mark = (chain: string, offset: number, all: string) => (/^\s*(?:\.\.\.|…)/.test(all.slice(offset + chain.length)) ? chain : `${chain} …`)
  return normalizeText(cell).replace(DOTLESS_OMISSION_RE, mark).replace(DOTLESS_ZIFFER_OMISSION_RE, mark)
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
export function unaccountedStretch(text: string, cell: string, anchor: ((at: number, stretch: string) => boolean) | null = null): string | null {
  return placedStretches(text, cell, 0, anchor, null).missing
}

/**
 * `unaccountedStretch` from `from` on, with where the cell's last stretch
 * ended — so check 2 can hold the rows of a § in the order the annex prints
 * them (`oracleVerdict`).
 */
function placedStretches(text: string, cell: string, from: number, anchor: ((at: number, stretch: string) => boolean) | null, heading: HeadingPlacement | null): { missing: string | null; end: number } {
  let at = from
  let first = true
  let anchored = anchor
  const stretches = printedStretches(markedOmissions(cell))
  for (const [index, stretch] of stretches.entries()) {
    let piece = key(stretch)
    // A stretch that is nothing but markers — "§ 5." alone at the head of a
    // PDF row — keys to the empty string and says nothing either way.
    // Nor a rule the PDF draws as underscores („______________"): no letter,
    // no digit, nothing it could say about the §.
    if (piece === '' || !/[\p{L}\d]/u.test(piece)) continue
    let found = text.indexOf(piece, at)
    // `anchor`: the cell opens the § with its heading, and the result opens
    // with it too (`plainText` puts the heading first) — at a place the
    // predicate accepts (`headingAnchor`), never merely anywhere. Found
    // anywhere, a heading the result does not carry was found in its body:
    // „Vollziehung" in „Mit der Vollziehung … ist betraut", a heading row
    // „Bundesstaatsanwaltschaft" in „Die Bundesstaatsanwaltschaft wirkt …"
    // (19.11.2026). Only the stack rescue below may still place it, and only
    // at the start.
    if (anchored) {
      const accept = anchored
      let p = found
      while (p >= 0 && !accept(p, stretch)) p = text.indexOf(piece, p + 1)
      found = p
    }
    anchored = null
    // A group heading first in the cell may carry the §'s own heading in its
    // tail: read it as the stack it is before passing it over, and where the
    // § heading has to be there, never pass it over (19.11.2026).
    if (found < 0 && first && isGroupHeadingOnly(stretch)) {
      const rescued = withoutHeadingStack(piece, text, at, heading?.stackOk ?? null, stretch)
      if (rescued) ({ piece, found } = rescued)
      else if (heading?.required) return { missing: stretch, end: at }
    }
    // Nor does a stretch that is nothing but a group heading — wherever it
    // stands, since the next group's heading comes at the foot of a §.
    if (found < 0 && isGroupHeadingOnly(stretch)) continue
    // The next §'s heading or group number as the last stretch, behind a
    // mark (`isHeadingAfterMark`).
    if (found < 0 && index > 0 && index === stretches.length - 1 && isHeadingAfterMark(stretch)) continue
    // The next §'s heading, wrapped at the foot of the cell: only the last
    // stretch, only after a finished sentence (`NEXT_HEADING_RE`), or with
    // its group's letter (`LETTERED_NEXT_HEADING_RE`).
    const nextHeading = index === stretches.length - 1 ? (isNextHeading(stretch) ? NEXT_HEADING_RE : isLetteredNextHeading(stretch) ? LETTERED_NEXT_HEADING_RE : null) : null
    if (found < 0 && nextHeading) {
      const trimmed = key(stretch.replace(nextHeading, ''))
      const retry = trimmed === '' ? -1 : text.indexOf(trimmed, at)
      if (retry >= 0) {
        piece = trimmed
        found = retry
      }
    }
    const trailing = [TRAILING_GROUP_RE, TRAILING_UNIT_FIRST_RE].find((re) => re.test(stretch))
    if (found < 0 && trailing) {
      const trimmed = key(stretch.replace(trailing, ''))
      const retry = trimmed === '' ? -1 : text.indexOf(trimmed, at)
      if (retry >= 0) {
        piece = trimmed
        found = retry
      }
    }
    // Only the first stretch of a cell can carry the heading stack: it is
    // what stands above the § itself.
    if (found < 0 && first) {
      const rescued = withoutHeadingStack(piece, text, at, heading?.stackOk ?? null, stretch)
      if (rescued) ({ piece, found } = rescued)
    }
    if (found < 0) return { missing: stretch, end: at }
    at = found + piece.length
    first = false
  }
  return { missing: null, end: at }
}

/**
 * Where the heading a changed row opens the § with may stand in the result
 * (19.11.2026) — at the start, or after the part of the heading the row does
 * not print.
 *
 * The PDF path wraps a long heading over two rows and leaves its first line
 * at the foot of the § above (`NEXT_HEADING_RE`), so the § opens with the
 * tail: „ausschließenden Rauschzustand § 83. (1) Wer …" under „Begehung einer
 * Verwaltungsübertretung in einem die Zurechnungsfähigkeit ausschließenden
 * Rauschzustand", „Forderungen des Bundes § 73." under „Stundung, … bei
 * Forderungen des Bundes" — and the two columns wrap differently, one
 * printing the heading whole where the other prints its tail (SPG § 57,
 * MinBestG § 69). The result cannot say where its heading ends, so the
 * standing text has to:
 *
 * - at `at` = 0, the heading is where the result begins;
 * - right after the head the row's GELTENDE column implies: its first
 *   stretch stands that far into the standing text, behind heading words
 *   only. A result whose heading the engine did not change against a draft
 *   that does fails here, because the old heading opens both texts;
 * - after a head the result shares with the standing text word for word,
 *   heading words only, where the stretch shows it is a tail — it opens in
 *   lower case, as no heading does, or it carries the §'s text after its
 *   symbol, so that tail and body stand together right where the shared
 *   head ends — or the head is designations alone („G. Verwendung
 *   technischer Einrichtungen …", BAO § 48j).
 *
 * „Heading words only": no full stop, colon or question mark — a heading
 * carries commas and semicolons („Zentrale Informationssammlung; Zulässigkeit
 * der Ermittlung, Verarbeitung und Übermittlung"), and designation dots are
 * a heading's too.
 */
function headingAnchor(current: string, beforeKey: string, gotKey: string): (at: number, stretch: string) => boolean {
  const headingWords = (head: string): boolean => !/[.:!?]/.test(head.replace(DESIGNATION_DOT_RE, ''))
  const firstStretch = printedStretches(markedOmissions(current)).map(key).find((k) => k !== '' && /[\p{L}\d]/u.test(k))
  const standingAt = firstStretch ? beforeKey.indexOf(firstStretch) : -1
  const head = standingAt > 0 && headingWords(beforeKey.slice(0, standingAt)) ? beforeKey.slice(0, standingAt) : ''
  return (at, stretch) => {
    if (at === 0) return true
    if (head !== '' && at === head.length && gotKey.startsWith(head)) return true
    const shared = gotKey.slice(0, at)
    if (shared !== beforeKey.slice(0, at) || !headingWords(shared)) return false
    const symbol = PARAGRAPH_SYMBOL_RE.exec(stretch)
    const carriesBody = symbol !== null && /\p{L}/u.test(stretch.slice(symbol.index + symbol[0].length))
    return /^\s*\p{Ll}/u.test(stretch) || shared.replace(DESIGNATION_DOT_RE, '') === '' || carriesBody
  }
}

/** How check 4's report opens — the harness counts its alarms by it. */
export const KEPT_DELETION_NOTE = 'Gestrichener Text steht noch im Ergebnis'
/** What check 4 answers for a row too long to read (`tokenRuns`): nothing it could confirm. */
export const ROW_TOO_LONG: unique symbol = Symbol('Zeile zu lang für Prüfung 4')

/**
 * Check 4's numbers, measured by `harness/faultInjection.ts` (class E,
 * 01.10.2026).
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
/** Above this many token pairs the row diff leaves the matrix for linear memory — `MAX_DP_CELLS` of `diff/wordDiff.ts`. */
const MAX_ROW_CELLS = 2_500_000
/** Above this many the row cannot be read, and check 4 confirms nothing — `MAX_LINEAR_CELLS` of `diff/wordDiff.ts`. */
const MAX_LINEAR_ROW_CELLS = 30_000_000

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
 *
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
 *
 * **Past the matrix's ceiling in linear memory** (20.11.2026), as
 * `beyondCeiling` takes the guard and checks 1 to 3 there: Hirschberg's split
 * halves the earlier text, finds where the later one splits so the two
 * halves' scores add up to the whole, and hands each half to the matrix once
 * it fits. Skipped there, a row too long for the matrix was no row to check
 * 4, and the § was confirmed without it: on the PDF path a cell holds a whole
 * §, and the Außenwirtschaftsgesetz's § 1 (1,924 against 2,099 words) was
 * confirmed so (audit of 20.11.2026). Measured with the whole matrix, check 4
 * finds nothing kept there; the linear path finds the same. Null only past
 * `MAX_LINEAR_ROW_CELLS`, and the caller then confirms nothing.
 */
function tokenRuns(a: readonly string[], b: readonly string[]): TokenRun[] | null {
  const n = a.length
  const m = b.length
  if (n * m > MAX_LINEAR_ROW_CELLS) return null
  if (n * m > MAX_ROW_CELLS && n > 1) {
    const mid = n >> 1
    const forward = scoreRow(a.slice(0, mid), b)
    const backward = scoreRow(a.slice(mid).reverse(), [...b].reverse())
    let split = 0
    for (let t = 1; t <= m; t++) if (forward[t]! + backward[m - t]! > forward[split]! + backward[m - split]!) split = t
    const runs = tokenRuns(a.slice(0, mid), b.slice(0, split))!
    for (const run of tokenRuns(a.slice(mid), b.slice(split))!) {
      const last = runs[runs.length - 1]
      if (last && last.type === run.type) last.tokens.push(...run.tokens)
      else runs.push(run)
    }
    return runs
  }
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

/** The score of `a` against every prefix of `b`, in one row — `tokenRuns`'s recurrence in linear memory. */
function scoreRow(a: readonly string[], b: readonly string[]): Float64Array {
  let prev = new Float64Array(b.length + 1)
  let row = new Float64Array(b.length + 1)
  for (const x of a) {
    for (let t = 1; t <= b.length; t++) row[t] = x === b[t - 1] ? prev[t - 1]! + (x === ELISION ? MARK_WEIGHT : 1) : Math.max(prev[t]!, row[t - 1]!)
    ;[prev, row] = [row, prev]
  }
  return prev
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

const PARAGRAPH_SYMBOL_RE = new RegExp(String.raw`§+\.?\s*${PARAGRAPH_NUMBER}\.`)

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
 * **The one direction checks 1 to 3 never asked** (30.09.2026). Check 2
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
 *   injected faults were caught before this check existed. **Except where
 *   the region is only inside by the LCS's choice** (19.11.2026): a pure
 *   deletion whose struck words end with the words from the stretch's start
 *   to it, or begin with those from it to the stretch's end, is the same
 *   deletion set at the stretch's edge — „Der Auftraggeber hat [die Vergabe
 *   … Gesamtpreis. Der Auftraggeber hat] über jeden …" is „[Der Auftraggeber
 *   hat die Vergabe … Gesamtpreis.] Der Auftraggeber hat über jeden …". The
 *   LCS takes the first equal words it meets, so a struck Absatz that opens
 *   like the next one lands in the middle, check 2 finds the stretch whole
 *   (the next Absatz), and the struck Absatz in front of it went unasked:
 *   BVergGVS § 30 (58/ME XXVIII against BGBl. I Nr. 8/2026) was confirmed
 *   with the Abs. 8 the annex strikes. Such a region is read at that edge,
 *   in the words it strikes there.
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
export function keptDeletion(got: string, rows: readonly ComparisonRow[]): string | typeof ROW_TOO_LONG | null {
  const pairs = rows.filter((r) => r.kind === 'pair')
  const gotTokens = words4(sameText(got))
  const shownRight = cellTokens(pairs.map((r) => r.proposed).join(' '))
  for (const row of pairs) {
    if (row.elided || row.change === 'unchanged' || !row.current || !row.proposed) continue
    const proposed = cellTokens(row.proposed)
    const runs = tokenRuns(cellTokens(row.current), proposed)
    if (!runs) return ROW_TOO_LONG

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
      const inserted = region.to > region.from
      const width = Math.min(PROBE, Math.max(...region.pieces.map((piece) => piece.length)))
      if (leftPrinted && rightPrinted) {
        const edge = slidToEdge(region, proposed, inserted)
        const k = stretchOf[region.from - 1]!
        const slid = (piece: readonly string[], beside: string[]): boolean => beside.length >= MIN_KEPT && runAt(piece, beside) >= 0 && runAt(shownRight, beside) < 0
        const end = ends[k]
        if (edge.right && end != null) {
          const beside = gotTokens.slice(end, end + width)
          if (slid(edge.right, beside)) return beside.join(' ')
        }
        const start = starts[k]
        if (edge.left && start != null) {
          const beside = gotTokens.slice(Math.max(0, start - width), start)
          if (slid(edge.left, beside) && runAt(heading, beside) < 0) return beside.join(' ')
        }
        continue
      }
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

/** How check 3 reports a change the annex shows nowhere near where the engine made it. */
export const PLACE_NOTE = 'Engine änderte, wo die Gegenüberstellung nichts ändert'

/** How many consecutive words place a changed word in the annex — fewer only at the edge of a printed stretch. */
const PLACE_WINDOW = 4

/**
 * Check 3 in place: every change the engine made — a run of words its diff
 * inserts, or a run it removes — stands in the annex with the words beside
 * it, the inserted ones in a row's proposed column, the removed ones in a
 * changed row's geltende column. The first run that does not, or null.
 *
 * **The bags of check 3 ask a vocabulary question** (19.11.2026). A word
 * the engine dropped from an Absatz the annex leaves out passed wherever the
 * same word stands in any changed row — „der", „und", „für" always do —, and
 * a word it put in passed wherever the annex prints it anywhere: fault class
 * „Ungedruckt" got 35 % of dropped words and 76 % of inserted ones past the
 * oracle. A „jeweils" replacement carried into one Absatz too many is that
 * shape exactly: every word of it is in the annex, only not there.
 *
 * **In place means two things.** Every changed word stands in the annex
 * inside a window of `PLACE_WINDOW` consecutive words of the text around it —
 * fewer only where a printed stretch begins or ends, or the text does, and
 * two at least unless the window is a stretch whole; and every run of
 * changed words is tied at one side to the unchanged words beside it, or
 * begins or ends where a printed stretch does (an omission mark, a row of
 * its own). Words, not a run, are covered, because one run often spans two
 * rows — two new Ziffern on the table path, a struck Absatz and the next
 * one; the anchor keeps a whole sentence set one place off from passing on
 * its own words. Four words, because one is a coincidence: „der Behörde"
 * stands in every other annex. The anchor is tried wherever the diff could
 * equally have put the run — an LCS chooses between equal words by chance,
 * and „bestimmten X bestimmten" is the same change one word to the left.
 *
 * **And under both of the LCS's tie-breaks** (`unplacedEitherWay`): sliding
 * reaches a run that the LCS shifted, not one it cut. A new Absatz that
 * repeats words of the next one („… ist das Gericht zuständig, an dessen
 * Sitz …" before „Für das Hauptverfahren ist das Gericht zuständig …", StPO
 * § 36) comes out of the forward LCS in pieces whose ends belong to the old
 * text, and seventeen correct results of the corpus read as changed out of
 * place. The diff of the reversed texts takes the last equal words instead
 * of the first; a change is reported only where neither diff places it.
 */
function unplacedChange(segments: readonly { type: string; text: string }[], rows: readonly ComparisonRow[]): string | null {
  const pairs = rows.filter((r) => r.kind === 'pair' && !r.elided)
  // Each cell twice: cut at its marks as checks 1 and 2 cut it, and cut at
  // the marks alone. The first cut takes the designations that announce a
  // mark with it, and a citation's last number can go too — „S. 66. (3) und
  // (4) …", „WAG 2018. 11. bis 17. …" ended their stretch without the 66 or
  // the 2018, and a correct result read as changed there.
  const keysOf = (cells: readonly string[]): string[] => {
    const own = cells.map((c) => c.replace(GLUED_ELLIPSIS_RE, ''))
    return [...own.flatMap((c) => printedStretches(markedOmissions(c))), ...own.flatMap((c) => normalizeText(c).split(/\s*(?:\[…\]|…|\.{3,})\s*/))].map(placeKey).filter((k) => k !== '')
  }
  // The proposed column of every row, as check 3's bag reads it; the
  // geltende column of the changed ones only — an unchanged row says its
  // words stay.
  const proposed = keysOf(pairs.map((r) => r.proposed).filter(Boolean))
  const current = keysOf(pairs.filter((r) => r.change !== 'unchanged').map((r) => r.current).filter(Boolean))
  const got: { word: string; changed: boolean }[] = []
  const was: { word: string; changed: boolean }[] = []
  // Per change — the removed and inserted segments between two equal ones —
  // the words it removes and puts back alike are no change at all: a
  // punctuation mark moved („(§ 56)." → „(§ 56), …" where a Ziffer is
  // appended) or a word the LCS took out and put back beside an insertion,
  // which check 3's bags cancel the same way (`bagMinus`).
  for (let i = 0; i < segments.length;) {
    if (segments[i]!.type === 'equal') {
      for (const word of segments[i]!.text.split(' ').filter(Boolean)) {
        got.push({ word, changed: false })
        was.push({ word, changed: false })
      }
      i++
      continue
    }
    const removed: string[] = []
    const inserted: string[] = []
    for (; i < segments.length && segments[i]!.type !== 'equal'; i++) (segments[i]!.type === 'removed' ? removed : inserted).push(...segments[i]!.text.split(' ').filter(Boolean))
    const back = new Map<string, number>()
    for (const w of inserted) back.set(placeKey(w), (back.get(placeKey(w)) ?? 0) + 1)
    const gone = new Map<string, number>()
    for (const w of removed) gone.set(placeKey(w), (gone.get(placeKey(w)) ?? 0) + 1)
    const take = (counts: Map<string, number>, w: string): boolean => {
      const n = counts.get(placeKey(w)) ?? 0
      if (n > 0) counts.set(placeKey(w), n - 1)
      return n > 0
    }
    for (const word of removed) was.push({ word, changed: !take(back, word) })
    for (const word of inserted) got.push({ word, changed: !take(gone, word) })
  }
  const inserted = unplacedRun(got, proposed)
  if (inserted !== null) return `eingefügt „${inserted}"`
  const removed = unplacedRun(was, current)
  return removed === null ? null : `entfernt „${removed}"`
}

/**
 * Check 3 in place compares words, not their punctuation: check 2 has held
 * every printed stretch against the result character for character, and a
 * copy that ends a Ziffer without its „;" (AWG § 68) is no change in place.
 */
function placeKey(t: string): string {
  return key(t.replace(GLUED_ELLIPSIS_RE, '')).replace(/[.,;:!?()[\]]/g, '')
}
/**
 * „des …gesetzes", „Fachkolloquium…": a placeholder of the text, glued to its
 * word — no omission mark. Read as one, it cut the stretch in two, and the
 * new Absatz around it stood nowhere whole (Sektenfragen-Gesetz § 14, a new
 * § 57k of the Prüfungsordnung, 19.11.2026).
 */
const GLUED_ELLIPSIS_RE = /(?<=\p{L})…|…(?=\p{L})/gu

function unplacedRun(stream: readonly { word: string; changed: boolean }[], keys: readonly string[]): string | null {
  const words = stream.map((t) => t.word)
  const n = words.length
  const seen = new Map<string, { any: boolean; edge: boolean; whole: boolean }>()
  /** Where the words [x, y) stand in the annex: anywhere, at a stretch's edge, as a stretch whole. */
  const found = (x: number, y: number): { any: boolean; edge: boolean; whole: boolean } => {
    const id = `${x}:${y}`
    let f = seen.get(id)
    if (!f) {
      const k = placeKey(words.slice(x, y).join(' '))
      f = { any: k === '', edge: k === '', whole: k === '' }
      if (k !== '') {
        for (const stretch of keys) {
          if (!stretch.includes(k)) continue
          f.any = true
          if (stretch.startsWith(k) || stretch.endsWith(k)) f.edge = true
          if (stretch === k) f.whole = true
        }
      }
      seen.set(id, f)
    }
    return f
  }
  /** A window that places the words in it: `PLACE_WINDOW` of them anywhere, two or more at a stretch's or the text's edge, or a stretch whole. */
  const places = (x: number, y: number): boolean => {
    if (x < 0 || y > n || y - x < 1) return false
    const f = found(x, y)
    if (!f.any) return false
    return y - x >= PLACE_WINDOW || f.whole || (y - x >= 2 && (f.edge || x === 0 || y === n))
  }
  const covered = (i: number): boolean => {
    for (let size = PLACE_WINDOW; size >= 1; size--) {
      for (let x = i - size + 1; x <= i; x++) if (places(x, x + size)) return true
    }
    return false
  }
  /** One side of the run tied to the words beside it, or its end at a stretch's edge. */
  const anchored = (a: number, b: number): boolean => {
    // A run that is a printed stretch whole — a row of its own — is placed by being one.
    if (a === 0 || b === n || found(a, b).whole) return true
    for (let size = PLACE_WINDOW; size >= 2; size--) {
      for (let x = a - size + 1; x <= a - 1; x++) if (places(x, x + size)) return true
      for (let x = b - size + 1; x <= b - 1; x++) if (places(x, x + size)) return true
    }
    for (let y = a + 2; y <= Math.min(b, a + PLACE_WINDOW); y++) if (found(a, y).edge && places(a, y)) return true
    for (let x = Math.max(a, b - PLACE_WINDOW); x <= b - 2; x++) if (found(x, b).edge && places(x, b)) return true
    return false
  }
  for (let a = 0; a < n;) {
    if (!stream[a]!.changed) {
      a++
      continue
    }
    let b = a
    while (b < n && stream[b]!.changed) b++
    // Every place the same run could stand: slid over words equal to its
    // own last (to the left) or first (to the right) — an LCS chooses
    // between equal words by chance, and which words it marks changed with
    // them.
    const spots: [number, number][] = [[a, b]]
    for (let s = a, e = b; s > 0 && words[s - 1] === words[e - 1] && spots.length < 12;) spots.push([--s, --e])
    for (let s = a, e = b; e < n && words[s] === words[e] && spots.length < 24;) spots.push([++s, ++e])
    const placedAt = ([s, e]: [number, number]): boolean => {
      for (let i = s; i < e; i++) if (!covered(i)) return false
      return anchored(s, e)
    }
    if (!spots.some(placedAt)) return words.slice(a, b).join(' ').slice(0, 60)
    a = b
  }
  return null
}

/**
 * `unplacedChange` under the LCS's other tie-break as well: the same diff of
 * both texts read backwards, which pairs equal words from the end. Null where
 * either reading places every change.
 */
function unplacedEitherWay(before: string, got: string, forward: readonly { type: string; text: string }[], rows: readonly ComparisonRow[]): string | null {
  const unplaced = unplacedChange(forward, rows)
  if (unplaced === null) return null
  const reversed = (t: string): string => t.split(/\s+/).filter(Boolean).reverse().join(' ')
  const backward = diffTokens(reversed(before), reversed(got), { beyondCeiling: true }).segments
  if (backward === null) return unplaced
  return unplacedChange(backward.reverse().map((g) => ({ type: g.type, text: g.text.split(' ').reverse().join(' ') })), rows) === null ? null : unplaced
}

/**
 * A pure deletion inside a printed stretch, read where the LCS could equally
 * have put it (`keptDeletion`): `left`, the words it strikes once moved to
 * the stretch's start — where its struck words end with the words from that
 * start to it —, `right` the same at the stretch's end. Null for a side it
 * cannot move to, and for a region that also inserts or spans the current
 * column's own marks: moved, those would be another change.
 */
function slidToEdge(region: Region, proposed: readonly string[], inserted: boolean): { left: string[] | null; right: string[] | null } {
  if (inserted || region.pieces.length !== 1) return { left: null, right: null }
  const struck = region.pieces[0]!
  let s0 = region.from
  while (s0 > 0 && proposed[s0 - 1] !== ELISION) s0--
  let e0 = region.to
  while (e0 < proposed.length && proposed[e0] !== ELISION) e0++
  const before = proposed.slice(s0, region.from)
  const after = proposed.slice(region.to, e0)
  const left = before.length < struck.length && before.every((w, i) => struck[struck.length - before.length + i] === w)
  const right = after.length < struck.length && after.every((w, i) => struck[i] === w)
  return {
    left: left ? [...before, ...struck.slice(0, struck.length - before.length)] : null,
    right: right ? [...struck.slice(after.length), ...after] : null,
  }
}

/** How check 2 reports a row that stands in the result, but before the row the annex prints above it. */
export const ROW_ORDER_NOTE = 'Vorgeschlagene Fassung steht im Ergebnis an anderer Stelle'

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
  const text = ownPart(markedOmissions(cell), own)
  for (const m of text.matchAll(ABSATZ_RUN_RE)) {
    // „(2) Aufgehoben." is the annex's way of saying the Absatz is gone, and
    // RIS prints nothing in its place (`REPEALED_RE`), „(2) (entfällt)" too.
    if (/^\s*(?:Aufgehoben|\((?:aufgehoben|entfällt)\)|entfällt)/i.test(text.slice(m.index! + m[0].length))) continue
    for (const n of m[0].matchAll(/\((\d{1,3}[a-z]?)\)/g)) out.push(n[1]!)
  }
  return out
}
/** The cell from its own § symbol on — `own` null or not printed: the whole cell. */
function ownPart(cell: string, own: string | null): string {
  const symbol = own ? new RegExp(`§+\\s*${own.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.\\s`).exec(cell) : null
  return symbol ? cell.slice(symbol.index) : cell
}

/**
 * A marker where one can stand, and the chain „bis"/„und" may hang on it —
 * or a dash („(1) - (41) …"), and the chain's „…" may be glued to its last
 * marker („(1) bis (8)… (9a)"). Both stood in 50 of the fault injection's
 * 1,538 „Fehlt" sites on 21.11.2026, the Absatz dropped from the result in
 * each and confirmed: check 5 read neither shape as a chain.
 */
const ABSATZ_RUN_RE = /(?:^|(?<=[.:;…]\s*)|(?<=\.\.\.\s*))\(\d{1,3}[a-z]?\)(?:\s+(?:bis|und|-|–)\s+\(\d{1,3}[a-z]?\))*(?=\s|$|…|\.\.\.)/g

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
 *
 * **And the reverse, since 19.11.2026:** an Absatz the annex strikes —
 * printed with its words on the left, on the right nowhere — must not stand
 * in the result. The text checks miss it where the struck Absatz opens like
 * the next one (`keptDeletion`); its marker does not.
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
  // The other direction (19.11.2026): an Absatz the geltende column prints
  // with its words, that no proposed column prints or chains over, struck —
  // and still in the result. „(8) Der Auftraggeber hat die Vergabe … (9) Der
  // Auftraggeber hat über …" against „(8) Der Auftraggeber hat über …":
  // check 4 found no edge for the struck (8), and check 2 found the proposed
  // stretch whole in the old (9) (BVergGVS § 30). A row that proposes
  // nothing strikes even the Absätze it abbreviates („§ 20. (1) ... (2) …
  // (3) …" against an empty column, IESG § 20); a row that proposes text
  // speaks only for the markers its words follow — an omission or a chain
  // („(1) …", „(1) bis (3) …") is printed on one side only as often as not.
  const covered: [string, string][] = []
  const struck: string[] = []
  for (const row of rows) {
    if (row.kind !== 'pair') continue
    if (row.proposed) covered.push(...markerRuns(row.proposed))
    if (row.current) struck.push(...(row.proposed ? markersOpeningText(row.current, own) : absatzMarkers(row.current, own)))
  }
  for (const m of struck) {
    if (!resultAbsaetze.includes(m) || covered.some(([a, b]) => absatzAtMost(a, m) && absatzAtMost(m, b))) continue
    return { note: `(${m}) steht noch im Ergebnis`, foreign: false }
  }
  return null
}

/**
 * Every Absatz marker a cell prints, anywhere, as [first, last] — „(4) bis
 * (7)" as one run. Lenient on purpose, because it only ever excuses: „(3)…"
 * glued to its mark and „[…] (5)" are markers the strict reader
 * (`ABSATZ_RUN_RE`) does not take, and read strictly they made a struck
 * Absatz out of one the right column merely abbreviates.
 */
function markerRuns(cell: string): [string, string][] {
  const out: [string, string][] = []
  for (const m of normalizeText(cell).matchAll(/\((\d{1,3}[a-z]?)\)(?:\s*(bis|und)\s*\((\d{1,3}[a-z]?)\))?/g)) {
    if (m[2] === 'bis') out.push([m[1]!, m[3]!])
    else {
      out.push([m[1]!, m[1]!])
      if (m[3]) out.push([m[3], m[3]])
    }
  }
  return out
}

/** The Absatz markers a cell prints where one can stand AND its words follow — not a chain, not an omission, not „Aufgehoben". */
function markersOpeningText(cell: string, own: string | null): string[] {
  const text = ownPart(markedOmissions(cell), own)
  const out: string[] = []
  for (const m of text.matchAll(ABSATZ_RUN_RE)) {
    if (/\s(?:bis|und|-|–)\s/.test(m[0])) continue
    const rest = text.slice(m.index! + m[0].length)
    if (!/^\s*\p{L}/u.test(rest) || /^\s*(?:Aufgehoben|\(aufgehoben\)|entfällt|bis|und)(?!\p{L})/iu.test(rest)) continue
    out.push(/\((\d{1,3}[a-z]?)\)/.exec(m[0])![1]!)
  }
  return out
}

/** „2a" ≤ „3", „2" ≤ „2a": Absatz designations in their order. */
function absatzAtMost(a: string, b: string): boolean {
  const [, na = '0', la = ''] = /^(\d+)([a-z]*)$/.exec(a) ?? []
  const [, nb = '0', lb = ''] = /^(\d+)([a-z]*)$/.exec(b) ?? []
  return Number(na) < Number(nb) || (Number(na) === Number(nb) && la <= lb)
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
 * The units a standing § counts at its top level, with the words each opens
 * with — its numbered Absätze, or, where the § is one unnumbered Absatz over
 * Ziffern (the Wasserstraßen-Verkehrsordnung writes every § „§ 1.02 … 1. …
 * 4. …"), those Ziffern. Null for anything else: a § whose top level a marker
 * cannot name has no omission a marker could leave out.
 */
export interface StandingUnits {
  style: 'abs' | 'z'
  units: readonly { id: string; opening: string }[]
}

export function standingUnitsOf(node: LawNode): StandingUnits | null {
  const abs = node.children.filter((c) => c.level === 'abs')
  const of = (style: 'abs' | 'z', units: readonly LawNode[]): StandingUnits | null =>
    units.length > 1 && units.every((u) => u.id) ? { style, units: units.map((u) => ({ id: u.id, opening: key(u.text.split(/\s+/).slice(0, OPENING_WORDS).join(' ')) })) } : null
  if (abs.length > 0 && abs.every((a) => a.id)) return of('abs', abs)
  const host = abs.length === 1 && !abs[0]!.id ? abs[0]! : abs.length === 0 ? node : null
  return host ? of('z', host.children.filter((c) => c.level === 'z')) : null
}

/** The most words a § heading in front of the first marker may have — `NEXT_HEADING_RE`'s bound. */
const MAX_HEAD_WORDS = 14

/** How many of a unit's first words have to follow its marker in the geltende column before the marker counts as that unit's. */
const OPENING_WORDS = 3

/**
 * A unit's marker where a cell can print one, by style: „(4)" anywhere, „4."
 * only before a capital, never behind a designator („Abs. 4." is a citation)
 * and never in front of a group („2. Abschnitt" is a heading).
 */
const MARKER_RE: Record<StandingUnits['style'], RegExp> = {
  abs: /(?<![\p{L}\p{N}])\((\d{1,3}[a-z]?)\)(?=\s)/gu,
  z: /(?<![\p{L}\p{N}.§]|(?:Abs\.|Z|Nr\.|Art\.|lit\.|Anlage|Anhang|§)\s*)(\d{1,3}[a-z]?)\.(?=\s+\p{Lu})(?!\s+(?:Teil|Hauptst(?:ü|ue)ck|Abschnitt|Unterabschnitt|Kapitel|Titel)\b)/gu,
}

/**
 * An omission the annex makes without its „…" — the units between two of
 * its markers left out, with nothing to say so (14.11.2026).
 *
 * 707EA278 (Wasserstraßen-Verkehrsordnung) prints § 1.02 as „1. … 4. …" in
 * both columns: Z 2 and 3 are unchanged and simply not there. Check 1 holds
 * the geltende column against the standing text stretch by stretch, cut at
 * the omission marks, and with no mark the stretch „… besitzt. 4. Der
 * Schiffsführer …" stands in no standing text: the § came out `fremd`, the
 * annex starting from another text, and so did 14 more §§ of that draft
 * printed the same way. (The draft's other `fremd` §§ are other shapes:
 * group headings stacked over the §, letter-spaced headings, Anlagen.)
 *
 * Read as the omission it is, and only where the standing § proves it: both
 * columns of the row jump from the same unit to the same later one, the
 * standing § carries exactly the units the two numbers count between them
 * (1 → 4: Z 2 and 3, no more, no fewer) and neither column prints them, and
 * in the geltende column each of the two markers is followed by its unit's
 * own first words (`OPENING_WORDS`) — a date („4. Juli") or a citation is no
 * marker. Then the units in between are written into both columns as the
 * chain the annex would have printed („2. bis 3. …"), and every check reads
 * it as it reads that chain: check 1 and 2 piecewise, check 5 as markers.
 *
 * **Why the standing § decides, and what that keeps.** An annex whose base
 * text lacks the units — the 126/ME shape, where another Artikel was to
 * insert them first — jumps the same way, and must stay `fremd`. With a unit
 * of the count missing from the standing text the jump is not read, check 1
 * sees the stretch whole, and finds it in a standing text only where that
 * text lacks every unit in between. That last case — RIS without the one
 * unit a jump skips — no check can tell from a unit repealed long ago, since
 * the annex names nothing there; it was confirmed before this reading and
 * still is. A unit the engine drops from its result is still missing from
 * the result: check 3 counts its words as removed, and for Absätze check 5
 * names it. Fault injection classes „Lücke" and „Lücke-beide" measure both
 * (`harness/faultInjection.ts`).
 */
// --- Measured surface: exported for tests and harness scripts, not for the app. ---
export function silentOmissions(rows: readonly ComparisonRow[], standing: StandingUnits | null): { rows: ComparisonRow[]; skipped: string[] } {
  if (!standing) return { rows: [...rows], skipped: [] }
  const index = new Map(standing.units.map((u, i) => [u.id, i] as const))
  const skipped: string[] = []
  const out = rows.map((row) => {
    if (row.kind !== 'pair' || !row.current || !row.proposed) return row
    const current = normalizeText(row.current)
    const proposed = normalizeText(row.proposed)
    // In the geltende column a marker counts only before its unit's own
    // words: that column is the standing text, so a real marker always is.
    const inCurrent = markersOf(current, standing.style, index).filter((m) => opensWith(current, m, standing.units[index.get(m.id)!]!.opening))
    const inProposed = markersOf(proposed, standing.style, index)
    let [cur, pro] = [current, proposed]
    // Right to left, so an insertion leaves the positions before it valid.
    for (let k = inCurrent.length - 1; k > 0; k--) {
      const [a, b] = [inCurrent[k - 1]!, inCurrent[k]!]
      const [ia, ib] = [index.get(a.id)!, index.get(b.id)!]
      if (ib <= ia + 1) continue
      if (/\.\.\.|…/.test(current.slice(a.end, b.at))) continue
      const j = inProposed.findIndex((m, i) => i > 0 && m.id === b.id && inProposed[i - 1]!.id === a.id)
      if (j < 0 || /\.\.\.|…/.test(proposed.slice(inProposed[j - 1]!.end, inProposed[j]!.at))) continue
      // Every number between the two, and nothing else: a standing § with a
      // hole there (RIS without its Abs. 4) or a unit in between that the
      // count does not name (an Abs. 2a) is no proof of what the annex left
      // out — the jump stays unread, as before.
      const gap = standing.units.slice(ia + 1, ib).map((u) => u.id)
      const counted = expandRange(a.id, b.id)?.slice(0, -1) ?? null
      if (counted === null || counted.join('|') !== gap.join('|')) continue
      const label = (id: string): string => (standing.style === 'abs' ? `(${id})` : `${id}.`)
      const chain = `${gap.length === 1 ? label(gap[0]!) : `${label(gap[0]!)} bis ${label(gap[gap.length - 1]!)}`} … `
      cur = cur.slice(0, b.at) + chain + cur.slice(b.at)
      const at = inProposed[j]!.at
      pro = pro.slice(0, at) + chain + pro.slice(at)
      skipped.push(...gap)
    }
    // The same at the head of the §: „§ 2.02 Kennzeichen der Kleinfahrzeuge
    // 2. Das amtliche Kennzeichen …" leaves Z 1 out with nothing before the
    // first marker but the § and its heading. Counted from the first unit,
    // and only in a cell that opens the § — its designation in front of the
    // marker, around it nothing but a heading (no sentence of its own, at
    // most `MAX_HEAD_WORDS` words). A cell of the table path holds one unit
    // and opens nothing: its „(3)" is that Absatz, not a jump from a § head,
    // and read as one it withdrew 256 confirmations in the first run.
    const [f, g] = [inCurrent[0], inProposed[0]]
    const iF = f ? index.get(f.id)! : 0
    if (f && g && g.id === f.id && iF > 0) {
      const gap = standing.units.slice(0, iF).map((u) => u.id)
      const counted = gap[0] === '1' ? ['1', ...(expandRange('1', f.id)?.slice(0, -1) ?? [])] : null
      const isHead = (head: string): boolean => {
        if (!/§\s*\d/.test(head)) return false
        const words = head.replace(/§+\s*\S+/g, ' ').trim()
        return !/[.;:!?…]/.test(words) && words.split(/\s+/).filter(Boolean).length <= MAX_HEAD_WORDS
      }
      if (counted?.join('|') === gap.join('|') && isHead(current.slice(0, f.at)) && isHead(proposed.slice(0, g.at))) {
        const label = (id: string): string => (standing.style === 'abs' ? `(${id})` : `${id}.`)
        const chain = `${gap.length === 1 ? label(gap[0]!) : `${label(gap[0]!)} bis ${label(gap[gap.length - 1]!)}`} … `
        // Into the strings already widened at later jumps: the head stands
        // before all of them, so its position is unchanged.
        cur = cur.slice(0, f.at) + chain + cur.slice(f.at)
        pro = pro.slice(0, g.at) + chain + pro.slice(g.at)
        skipped.push(...gap)
      }
    }
    return cur === current ? row : { ...row, current: cur, proposed: pro }
  })
  return { rows: out, skipped }
}

/** The markers of a cell that name a unit of the standing §, in order — the others are text. */
function markersOf(cell: string, style: StandingUnits['style'], index: ReadonlyMap<string, number>): { id: string; at: number; end: number }[] {
  const out: { id: string; at: number; end: number }[] = []
  for (const m of cell.matchAll(MARKER_RE[style])) if (index.has(m[1]!)) out.push({ id: m[1]!, at: m.index!, end: m.index! + m[0].length })
  return out
}

function opensWith(cell: string, marker: { end: number }, opening: string): boolean {
  return opening !== '' && key(cell.slice(marker.end, marker.end + 200)).startsWith(opening)
}

/**
 * A unit of the result with a label — an Absatz, a Ziffer, a Litera —, its
 * label and its own text, without its children's (`designatedUnitsOf`), for
 * check 6 (`labelBroken`).
 */
export interface DesignatedUnit {
  level: 'abs' | 'z' | 'lit'
  marker: string
  text: string
}

/** How many of a unit's first words check 6 looks for at least, more where these stand twice in the result. */
const LABEL_OPENING_WORDS = 6
/** …and how long their comparison form has to be to be a unit's words and not a stray phrase. */
const MIN_LABEL_OPENING = 12

/** The labelled units of a result, in order, with their labels and their own text. */
export function designatedUnitsOf(node: LawNode): DesignatedUnit[] {
  const out: DesignatedUnit[] = []
  const walk = (n: LawNode): void => {
    for (const c of n.children) {
      if ((c.level === 'abs' || c.level === 'z' || c.level === 'lit') && c.marker.trim() && c.text.trim()) out.push({ level: c.level, marker: c.marker.replace(/\s+/g, ''), text: c.text.trim() })
      walk(c)
    }
  }
  walk(node)
  return out
}

/** How check 6's report opens. */
export const LABEL_NOTE = 'Bezeichnung der Beilage nicht im Ergebnis'

/** A unit's label printed directly before its words, „(2)", „3." or „b)", as the last thing of a stretch's head. */
const LABEL_BEFORE_RE = /(?:^|\s)(\(\d+[a-z]*\)|\d+[a-z]*\.|[a-z]{1,3}\))\s*$/

/** „(2)" an Absatz's label, „3." a Ziffer's, „b)" a Litera's. */
function labelKind(label: string): DesignatedUnit['level'] {
  return label.startsWith('(') ? 'abs' : /^\d/.test(label) ? 'z' : 'lit'
}

/**
 * Check 6 (21.11.2026): where the annex's proposed column prints a unit of
 * the result with its label, it is the same label. The first that is not,
 * or null.
 *
 * **Checks 1 to 4 cannot see a label at all, and check 5 only an Absatz
 * out of order.** They compare the text without its designations
 * (`stripMarkers`), so a result whose Ziffer carries the wrong number was
 * confirmed: fault class „Bezeichnung" (`harness/faultInjection.ts`) got
 * 510 of 510 past the oracle on the PDF path and 349 of 349 on the table
 * path. Its mirror image, an annex column that prints a wrong label
 * („Spalte-Bezeichnung"), passed wherever the label was a Ziffer's or a
 * Litera's, and where an Absatz's „(1)" read „(2)" with a (2) still to come.
 *
 * For each unit, the shortest run of its first words (at least
 * `LABEL_OPENING_WORDS`) that stands exactly once in the result; where that
 * run stands exactly once in the stretches a changed row prints
 * (`printedStretches`) too, what the column prints directly before it is
 * read. Where that is a label of the unit's kind and not the unit's own, the
 * § is contradicted. **No statement wherever the check cannot know**: the
 * column abbreviates the unit away or prints its words without a label;
 * the words stand twice, or too few of them to be the unit's
 * (`MIN_LABEL_OPENING`); the label is one of two of its kind in a row (a
 * renumbering printed with the old label beside the new), or a citation's
 * number ending a sentence („nach Abs. 2."); the label is of another kind.
 * A label glued to its word is unglued before (`unglued`).
 */
// --- Measured surface: exported for tests and harness scripts, not for the app. ---
export function labelBroken(rows: readonly ComparisonRow[], units: readonly DesignatedUnit[], gotKey: string): string | null {
  const stretches = rows
    .filter((r) => r.kind === 'pair' && !r.elided && r.change !== 'unchanged' && r.proposed)
    .flatMap((r) => printedStretches(normalizeText(r.proposed)))
  if (stretches.length === 0) return null
  const hay = stretches.map(key).join('\u0000')
  for (const unit of units) {
    const all = normalizeText(unit.text).split(/\s+/).filter(Boolean)
    let words: string[] | null = null
    for (let n = Math.min(LABEL_OPENING_WORDS, all.length); n <= all.length; n++) {
      const opening = key(all.slice(0, n).join(' '))
      if (opening.length < MIN_LABEL_OPENING) continue
      if (occurrences(gotKey, opening) === 1) {
        words = occurrences(hay, opening) === 1 ? all.slice(0, n) : null
        break
      }
    }
    if (!words) continue
    const pattern = new RegExp(`(?<![\\p{L}\\d])${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+')}`, 'gu')
    const places = stretches.flatMap((s) => [...s.matchAll(pattern)].map((m) => ({ head: s.slice(0, m.index) })))
    if (places.length !== 1) continue
    const { head } = places[0]!
    const label = LABEL_BEFORE_RE.exec(head)
    if (!label) continue
    const printed = label[1]!
    if (labelKind(printed) !== unit.level) continue
    const prior = head.slice(0, label.index)
    // A citation's number ending a sentence („nach Abs. 2."), and the old
    // label printed beside the new one („4. 5.") — not a citation's number
    // in front of the label („… ABl. Nr. L 208 S. 22. 10. Richtlinie …").
    const citation = (before: string): boolean => /(?:(?<!\p{L})(?:Abs|Art|lit|Nr|Z|Ziff|Pkt|S)\.?|§+)\s*$/u.test(before)
    if (citation(prior)) continue
    const other = LABEL_BEFORE_RE.exec(prior)
    if (other && labelKind(other[1]!) === labelKind(printed) && !citation(prior.slice(0, other.index))) continue
    if (printed === unit.marker) continue
    return `„${printed}" vor „${unit.text.slice(0, 40)}", im Ergebnis „${unit.marker}"`
  }
  return null
}

/**
 * The oracle's verdict on one §: `before` and `got` as `plainText` gives
 * them (`before` null for a § the draft creates), `rows` the annex rows of
 * that §, and `resultAbsaetze` the result's `absatzSequence` for check 5
 * (`absatzOrderBroken`) — left out by a caller that has no tree, which then
 * gets checks 1 to 4 only. `standingAbsaetze`, the standing §'s, tells an
 * Absatz the engine lost from one the annex assumes and RIS never had.
 * `standingUnits` (`standingUnitsOf` of the standing §) lets the oracle read
 * an omission the annex makes without its „…" (`silentOmissions`); left out,
 * such a row is read as before. `resultUnits` (`designatedUnitsOf` of the
 * result) are the labels check 6 holds the annex's against
 * (`labelBroken`); left out, check 6 is not made.
 */
export function oracleVerdict(id: string, before: string | null, got: string, rows: readonly ComparisonRow[], resultAbsaetze?: readonly string[], standingAbsaetze?: readonly string[] | null, standingUnits: StandingUnits | null = null, resultUnits: readonly DesignatedUnit[] | null = null): OracleReport {
  // An omission without its „…", written out where the standing § proves it
  // (`silentOmissions`) — every check below then reads it as an omission.
  rows = withoutHeldGroupTitle(withoutNextGroup(silentOmissions(rows, standingUnits).rows), before)
  // The transcript's glued markers, in the cells only (`unglued`).
  rows = rows.map((r) => (r.kind === 'pair' ? { ...r, current: unglued(r.current), proposed: unglued(r.proposed) } : r))
  const substantive = rows.filter((r) => r.kind === 'pair' && !r.elided && r.change !== 'unchanged')
  if (substantive.length === 0) return { para: id, verdict: 'stumm', rows: rows.length, note: null }

  const beforeKey = key(before ?? '')
  const gotKey = key(got)
  // The row that opens the § and prints its heading: words ahead of the §
  // symbol (the PDF path), or a heading row of its own (the table path).
  // Its first stretch is where the result begins (`unaccountedStretch`).
  const opener = rows.find((r) => r.kind === 'pair')
  const opensWithHeading = (row: ComparisonRow): boolean =>
    row === opener && (headingOf(row.proposed).some((w) => /\p{L}/u.test(w)) || (!row.gld && isHeadingRow(row, rows.slice(rows.indexOf(row) + 1).find((r) => r.kind === 'pair'))))
  // ß and ss alike in the left column only (20.11.2026): the ressort copies
  // the standing text in today's spelling, „Kostenzuschuss" for RIS's
  // „Kostenzuschuß". Held against the result, a „daß" the draft turns into
  // „dass" still has to be there.
  const sharpS = (t: string) => t.replace(/ß/g, 'ss')
  for (const row of substantive) {
    const missing = row.current ? unaccountedStretch(sharpS(beforeKey), sharpS(row.current)) : null
    if (missing !== null) {
      return { para: id, verdict: 'fremd', rows: rows.length, note: `Geltende Fassung der Gegenüberstellung nicht im Ausgangstext: "${missing.slice(0, 60)}"` }
    }
  }
  /** Where the last changed row's proposed column ended in the result — check 2 reads the rows in order. */
  let rowsEnd = 0
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
    const anchor = opensWithHeading(row) ? headingAnchor(row.current, beforeKey, gotKey) : null
    const heading: HeadingPlacement | null = row === opener ? { required: groupStretchCarriesHeading(row.current, beforeKey), stackOk: stackOkFor(row.current) } : null
    const placed = placedStretches(gotKey, row.proposed, rowsEnd, anchor, heading)
    if (placed.missing !== null) {
      // In the result, but before the row above: the annex prints the rows of
      // a § in its order, and on the table path each Ziffer is a row of its
      // own, so two of them swapped read like the right order wherever every
      // row was looked up from the start (19.11.2026).
      const elsewhere = rowsEnd > 0 && placedStretches(gotKey, row.proposed, 0, anchor, heading && { ...heading, required: false }).missing === null
      return { para: id, verdict: 'widersprochen', rows: rows.length, note: elsewhere ? `${ROW_ORDER_NOTE}: "${placed.missing.slice(0, 60)}"` : `Vorgeschlagene Fassung nicht im Ergebnis: "${placed.missing.slice(0, 60)}"` }
    }
    rowsEnd = placed.end
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
  //
  // Past the matrix's ceiling too (`beyondCeiling`, 20.11.2026): the bags
  // read the same words whichever path aligned them, and above the ceiling a
  // long § with a small change was „widersprochen" for its length alone.
  const { segments } = diffTokens(stripMarkers(before ?? ''), stripMarkers(got), { beyondCeiling: true })
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
  // Only a row that changes can account for words that go. An unchanged row
  // says its words stay; counted here, it excused the very loss it rules out —
  // an engine that dropped part of an unchanged sentence passed, since check 2
  // reads only changed rows (AC8FD757 § 3c, 26.10.2026).
  const dropped = new Set(pairs.filter((r) => r.change !== 'unchanged').flatMap((r) => cellWords(r.current)))
  const unshownRemoved = removed.filter((w) => !dropped.has(w))
  if (unshownRemoved.length > 0) {
    return { para: id, verdict: 'widersprochen', rows: rows.length, note: `Engine entfernte, was die Gegenüberstellung nicht zeigt: ${unshownRemoved.slice(0, 6).join(' ')}` }
  }
  // Check 3 in place (19.11.2026): the bags above ask whether a word stands
  // anywhere in the annex; this asks whether each change stands there WHERE
  // the engine made it (`unplacedChange`).
  // Not for a § the draft brings in new: every word is a change there, check
  // 2 already pins each proposed stretch, and the lookup costs about half a
  // second for a large new Anlage on the request path (branch review,
  // 19.11.2026).
  const unplaced = before === null ? null : unplacedEitherWay(stripMarkers(before), stripMarkers(got), segments, rows)
  if (unplaced !== null) {
    return { para: id, verdict: 'widersprochen', rows: rows.length, note: `${PLACE_NOTE}: ${unplaced}` }
  }
  // Check 4, last on purpose: every § it speaks on passed the other three,
  // so its alarms are exactly the confirmations it withdraws (`keptDeletion`).
  const kept = keptDeletion(got, rows)
  if (kept === ROW_TOO_LONG) return { para: id, verdict: 'widersprochen', rows: rows.length, note: 'Wortdiff zu groß für den Abgleich' }
  if (kept !== null) {
    return { para: id, verdict: 'widersprochen', rows: rows.length, note: `${KEPT_DELETION_NOTE}: "${kept.slice(0, 60)}"` }
  }
  // Check 5, last for the same reason: its alarms are the confirmations it
  // withdraws.
  const broken = resultAbsaetze ? absatzOrderBroken(rows, resultAbsaetze, standingAbsaetze ?? null, id) : null
  if (broken !== null) {
    return { para: id, verdict: broken.foreign ? 'fremd' : 'widersprochen', rows: rows.length, note: `${ABSATZ_ORDER_NOTE}: ${broken.note}` }
  }
  // Check 6, last for the same reason.
  const label = resultUnits ? labelBroken(rows, resultUnits, gotKey) : null
  if (label !== null) return { para: id, verdict: 'widersprochen', rows: rows.length, note: `${LABEL_NOTE}: ${label}` }
  return { para: id, verdict: 'bestätigt', rows: rows.length, note: null }
}

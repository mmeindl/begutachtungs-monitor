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
 * the tree does not carry, so the comparison is not text equality but three
 * containments over the rows of one §:
 *
 *   1. every changed row's *current* text is in the standing § — the annex
 *      talks about the same law version the engine started from;
 *   2. every changed row's *proposed* text is in the engine's result, and a
 *      row that proposes nothing — the annex's way of writing a deletion —
 *      is gone from it: the engine did what the ministry says the draft does;
 *   3. every word the engine inserted is one the annex's proposed column
 *      shows, and every word it removed one the geltende column shows — the
 *      engine did nothing the ministry does not show.
 *
 * A § the annex does not mention, or mentions only in elided rows, gets no
 * verdict: the oracle is silent, not positive.
 */
import { diffTokens } from '../diff/wordDiff'
import { normalizeText } from '../lawtext/normalize'
import type { ComparisonRow } from '../annex/comparisonRows'
import { printedStretches } from '../annex/elision'
import { punctuationTokens } from '../text/punctuationTokens'
import { isSchedule, unitKey } from '../text/designation'

export type OracleVerdict =
  /** All three containments hold */
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
  const t = normalizeText(gld ?? '')
  const m = /^§+\s*(\d+[a-z]*)\b/.exec(t)
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
 * Keyed by **law and designation**, because a Sammelnovelle's next law starts
 * its own § 1 and 15,1 % of § designations in the multi-law annexes recur in
 * another law of the same package. The key was a running counter over the
 * annex's article rows, which drifted in 26 of 36 packages — every heading
 * advanced it, whether or not it opened a law — and the caller then asked for
 * the bare designation and silently got the *first* law's § 5 (2026-09-09).
 */
export function rowsByParagraph(rows: readonly ComparisonRow[]): Map<string, ComparisonRow[]> {
  const out = new Map<string, ComparisonRow[]>()
  let current: string | null = null
  for (const [i, row] of rows.entries()) {
    if (row.kind === 'article') {
      current = null
      continue
    }
    let id = paraIdOfGld(row.gld)
    // A § heading is printed as its own row *above* the row that carries the
    // § symbol. Read in order it landed in the § before — "Tabakfreie
    // Nikotinerzeugnisse" was checked against § 10g and contradicted a
    // correct result (Tabakgesetz, 2026-09-09). A short row without gld and
    // without a closing full stop, right before a row that opens a §, is
    // that §'s heading.
    const next = rows[i + 1]
    if (!id && next && next.kind === 'pair' && paraIdOfGld(next.gld) && isHeadingRow(row)) id = paraIdOfGld(next.gld)
    if (id) current = paragraphKey(id, row.law)
    if (!current) continue
    const list = out.get(current) ?? []
    list.push(row)
    out.set(current, list)
  }
  return out
}

/** The key `rowsByParagraph` files a § under. */
export function paragraphKey(id: string, law: string | null): string {
  return `${law ?? ''}#${id}`
}

/**
 * The annex rows of one § — of a named law where the annex divides its laws.
 *
 * A caller that does not know which law of a package it means may only ask
 * when there is exactly one candidate. Answering anyway is what the running
 * counter did, and it held the engine's § 5 against another law's § 5.
 */
export function paragraphRows(byParagraph: ReadonlyMap<string, ComparisonRow[]>, id: string, law?: string | null): ComparisonRow[] {
  // „Anl." is an instruction saying „the schedule", and the annex writes the
  // number („Anlage 1"). They are the same unit wherever the map holds
  // exactly one schedule; where it holds several the instruction named none
  // and nothing here may choose for it.
  const key = id === 'Anl.' ? soleSchedule(byParagraph, law) ?? id : id
  if (law !== undefined) return byParagraph.get(paragraphKey(key, law)) ?? []
  const hits = rowsById(byParagraph).get(key) ?? []
  return hits.length === 1 ? hits[0]! : []
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
  const cells = [row.current, row.proposed].filter(Boolean)
  return cells.length > 0 && cells.every((c) => c.length <= 120 && !/[.;:]$/.test(c))
}

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
      .replace(/§+\s*\d+[a-z]*\.\s*/g, ' ')
      .replace(/(^|\s)\(\d+[a-z]*\)(?=\s|$)/g, '$1')
      .replace(/(^|\s)\d+[a-z]*\.(?=\s)/g, '$1')
      .replace(/(^|\s)[a-z]{1,2}\)(?=\s)/g, '$1'),
  )
}

/**
 * Whitespace- and quote-free form for containment: the two sources break
 * lines differently, and the annex sometimes quotes a citation the law does
 * not ("die Einhaltung der „§§ 4 bis 6 …“", Tabakgesetz § 14, 2026-09-09).
 */
function key(t: string): string {
  return stripMarkers(t).replace(/[\s"'„“‚‘]/g, '')
}

/** Words without punctuation — "36," and "36" are the same word. */
function words(t: string): string[] {
  return punctuationTokens(stripMarkers(t))
}

/**
 * How much of the standing text's beginning has to reappear in the cell
 * before a prefix counts as a heading stack. Long enough that the §'s own
 * Überschrift is what was found and not a stray word, short enough that a
 * ressort's hyphen or footnote mark inside the heading does not defeat it.
 */
const HEAD_PROBE = 24
/** „3. Abschnitt", „1. Hauptstück", „II. Teil" — a group heading opens with its unit. */
const STACK_HEAD_RE = /^(?:\d+[a-z]*\.|[IVXLCDM]+\.)?(?:Teil|Hauptst(?:ü|ue)ck|Abschnitt|Unterabschnitt|Kapitel|Titel)/i
/** The dots that belong to a designation rather than to a sentence. */
const DESIGNATION_DOT_RE = /(?:\d+[a-z]*|[IVXLCDM]+)\./g

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
 * dropped has to *open with a group unit* and contain no sentence punctuation
 * of its own, and what remains has to be the standing text's own beginning.
 * Without the first half the previous §'s last words would be dropped too —
 * „beträgt 75 000 € je Förderwerber Ausmaß der Förderung" — and a row
 * carrying foreign text would pass a check whose whole purpose is to catch
 * it. That is not a hypothetical: over 60 drafts the guard refuses exactly 5
 * such rows while admitting 24 true stacks.
 */
function withoutHeadingStack(piece: string, text: string): string | null {
  const head = text.slice(0, HEAD_PROBE)
  if (head.length < HEAD_PROBE) return null
  const at = piece.indexOf(head)
  if (at <= 0) return null
  const dropped = piece.slice(0, at)
  if (!STACK_HEAD_RE.test(dropped)) return null
  if (/[.;:!?]/.test(dropped.replace(DESIGNATION_DOT_RE, ''))) return null
  return piece.slice(at)
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
  for (const stretch of printedStretches(cell)) {
    let piece = key(stretch)
    // A stretch that is nothing but markers — "§ 5." alone at the head of a
    // PDF row — keys to the empty string and says nothing either way.
    if (piece === '') continue
    let found = text.indexOf(piece, at)
    // Only the first stretch of a cell can carry the heading stack: it is
    // what stands above the § itself.
    if (found < 0 && first) {
      const rescued = withoutHeadingStack(piece, text)
      const retry = rescued === null ? -1 : text.indexOf(rescued, at)
      if (retry >= 0) {
        piece = rescued!
        found = retry
      }
    }
    if (found < 0) return stretch
    at = found + piece.length
    first = false
  }
  return null
}

/**
 * The oracle's verdict on one §: `before` and `got` as `plainText` gives
 * them (`before` null for a § the draft creates), `rows` the annex rows of
 * that §.
 */
export function oracleVerdict(id: string, before: string | null, got: string, rows: readonly ComparisonRow[]): OracleReport {
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
      if (row.current && unaccountedStretch(gotKey, row.current) === null) {
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
  const inserted = segments.filter((s) => s.type === 'inserted').flatMap((s) => words(s.text))
  const shown = new Set(pairs.flatMap((r) => words(r.proposed)))
  const unshown = inserted.filter((w) => !shown.has(w))
  if (unshown.length > 0) {
    return { para: id, verdict: 'widersprochen', rows: rows.length, note: `Engine fügte ein, was die Gegenüberstellung nicht zeigt: ${unshown.slice(0, 6).join(' ')}` }
  }
  const removed = segments.filter((s) => s.type === 'removed').flatMap((s) => words(s.text))
  const dropped = new Set(pairs.flatMap((r) => words(r.current)))
  const unshownRemoved = removed.filter((w) => !dropped.has(w))
  if (unshownRemoved.length > 0) {
    return { para: id, verdict: 'widersprochen', rows: rows.length, note: `Engine entfernte, was die Gegenüberstellung nicht zeigt: ${unshownRemoved.slice(0, 6).join(' ')}` }
  }
  return { para: id, verdict: 'bestätigt', rows: rows.length, note: null }
}

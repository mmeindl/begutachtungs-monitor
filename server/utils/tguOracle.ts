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
 *   2. every changed row's *proposed* text is in the engine's result — the
 *      engine did what the ministry says the draft does;
 *   3. every word the engine inserted or removed is one the annex inserts
 *      or removes too — the engine did nothing the ministry does not show.
 *
 * A § the annex does not mention, or mentions only in elided rows, gets no
 * verdict: the oracle is silent, not positive.
 */
import { diffTokens } from './lawDiff'
import { normalizeText } from './lawText'
import type { ComparisonRow } from './textComparison'

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

/** "§ 5." → "5", "§ 12a." → "12a"; null for anything else. */
export function paraIdOfGld(gld: string | null): string | null {
  const m = /^§+\s*(\d+[a-z]*)\b/.exec(normalizeText(gld ?? ''))
  return m ? m[1]! : null
}

/**
 * The annex's rows grouped by the § they belong to: a row opens a § with its
 * `gld`, every following row without one continues it. Article rows reset
 * the grouping (a Sammelnovelle's next law starts its own § 1).
 */
export function rowsByParagraph(rows: readonly ComparisonRow[]): Map<string, ComparisonRow[]> {
  const out = new Map<string, ComparisonRow[]>()
  let current: string | null = null
  // The first law's §§ are keyed by bare id; a Sammelnovelle's further laws
  // get "5@2", "5@3" — so their § 5 never merges into the first one's, and a
  // single-law caller can still ask for "5".
  let article = 0
  let seenRows = false
  for (const [i, row] of rows.entries()) {
    if (row.kind === 'article') {
      if (seenRows) article++
      seenRows = false
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
    if (id) current = article === 0 ? id : `${id}@${article + 1}`
    if (!current) continue
    seenRows = true
    const list = out.get(current) ?? []
    list.push(row)
    out.set(current, list)
  }
  return out
}

function isHeadingRow(row: ComparisonRow): boolean {
  const cells = [row.current, row.proposed].filter(Boolean)
  return cells.length > 0 && cells.every((c) => c.length <= 120 && !/[.;:]$/.test(c))
}

/**
 * Comparison form of annex text: markers the tree does not carry are
 * dropped, whitespace and quotes normalised the way `plainText` does.
 */
export function stripMarkers(t: string): string {
  return normalizeText(
    normalizeText(t)
      .replace(/^§+\s*\d+[a-z]*\.\s*/, '')
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
  return stripMarkers(t)
    .split(/\s+/)
    .map((w) => w.replace(/^[„"'(\[]+|["'),.;:\]]+$/g, ''))
    .filter(Boolean)
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
    if (row.current && !beforeKey.includes(key(row.current))) {
      return { para: id, verdict: 'fremd', rows: rows.length, note: `Geltende Fassung der Gegenüberstellung nicht im Ausgangstext: "${row.current.slice(0, 60)}"` }
    }
  }
  for (const row of substantive) {
    if (row.proposed && !gotKey.includes(key(row.proposed))) {
      return { para: id, verdict: 'widersprochen', rows: rows.length, note: `Vorgeschlagene Fassung nicht im Ergebnis: "${row.proposed.slice(0, 60)}"` }
    }
  }
  // Everything the engine inserted must be a word the annex's proposed
  // column contains somewhere in this §. A bag test, not a diff against the
  // annex text: the annex elides unchanged stretches, and an LCS diff
  // against that partial text called words the engine placed correctly
  // "invented" (2026-09-09). Weaker than a diff, but it cannot be fooled by
  // what the annex leaves out, and check 2 already pins every changed row.
  const { segments } = diffTokens(stripMarkers(before ?? ''), stripMarkers(got))
  if (segments === null) return { para: id, verdict: 'widersprochen', rows: rows.length, note: 'Wortdiff zu groß für den Abgleich' }
  const inserted = segments.filter((s) => s.type === 'inserted').flatMap((s) => words(s.text))
  const shown = new Set(rows.filter((r) => r.kind === 'pair').flatMap((r) => words(r.proposed)))
  const unshown = inserted.filter((w) => !shown.has(w))
  if (unshown.length > 0) {
    return { para: id, verdict: 'widersprochen', rows: rows.length, note: `Engine fügte ein, was die Gegenüberstellung nicht zeigt: ${unshown.slice(0, 6).join(' ')}` }
  }
  return { para: id, verdict: 'bestätigt', rows: rows.length, note: null }
}

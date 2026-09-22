import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseAnnexPdf, type AnnexPage } from '../server/utils/annex/annexPdf'
import type { DraftArticle } from '../server/utils/lawtext/draftArticles'
import { draftArticle } from './helpers/builders'
import { parseTextComparison, type ComparisonRow } from '../server/utils/annex/comparisonRows'

/**
 * Two real annexes, frozen.
 *
 * Every other test in this file's neighbourhood is synthetic, and synthetic
 * fixtures only ever contain what was already understood: in two days the
 * corpus produced a table of contents read as law, a content table read as a
 * comparison, an annex whose pages are turned, one that omits the mandated
 * heading and one whose Anhang splits its columns differently from its own
 * header. None of those shapes would have been invented at a desk. So two
 * documents are checked in as they are, with the numbers they produce.
 *
 * Both are RIS open data, CC-BY 4.0 (data.bka.gv.at), quoted verbatim:
 *
 * - `annex-vkrg.xml` — Textgegenüberstellung of the Verbraucherkreditrechts-
 *   Änderungsgesetz 2026, GP XXVIII, RIS-Begut BEGUT_A93F21DF_4EC7_4B57_B449_
 *   E72C303E7D6E, document `Materialien_0002_B29AE200_9698_4B1A_9FF6_2EFABCE198DA`
 *   (https://ogd.ris.bka.gv.at/Dokumente/Begut/BEGUT_A93F21DF_4EC7_4B57_B449_E72C303E7D6E/Materialien_0002_B29AE200_9698_4B1A_9FF6_2EFABCE198DA.xml).
 *   A five-Artikel package, so it exercises the law boundaries as well.
 * - `annex-uwg-pages.json` — `pagesOf` output for the Textgegenüberstellung of
 *   the UWG-Novelle, GP XXVIII, RIS-Begut BEGUT_297DBC0E_ABF7_4F3F_9AA5_
 *   CC122D6680B5, document `Materialien_0002_E25736EE_ABD1_42AD_B703_05293842C897`
 *   (https://ogd.ris.bka.gv.at/Dokumente/Begut/BEGUT_297DBC0E_ABF7_4F3F_9AA5_CC122D6680B5/Materialien_0002_E25736EE_ABD1_42AD_B703_05293842C897.pdf).
 *   The geometry rather than the PDF, so the test needs no pdf.js: this annex
 *   sets its text matrix to a quarter turn, and the runs are what
 *   `annexPdfPages.ts` makes of that. Runs whose text is blank are left out —
 *   `linesFromPage` and `columnBoundary` both skip them — and the coordinates
 *   are rounded to two decimals; the parse is identical either way, and the
 *   dump goes from 146 kB to 61 kB.
 *
 *   Each page carries the `geometry` `uprightRuns` reported for it — how many
 *   runs it holds, how many disagree with the quarter turn it was read in, how
 *   many are skewed — because `parseAnnexPdf` refuses a page that cannot say
 *   (2026-09-10). All nine pages of this annex agree on their turn and none is
 *   skewed, so the gate drops none of them and every number below is the one
 *   the fixture produced before the field existed. Regenerated from the PDF
 *   above; runs and page widths came out identical to the byte.
 */
const fixture = (name: string): string => readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), 'utf8')

/** Positional, because the two drafts below are read off a real document in order. */
const article = (index: number, numeral: string | null, title: string, amends: boolean): DraftArticle =>
  draftArticle({ index, number: numeral ? `Artikel ${numeral}` : null, numeral, title, key: title, amends, bgbl: null })

/** `draftArticles` of the draft each annex belongs to, as the service passes it in. */
const VKRG_DRAFT: DraftArticle[] = [
  article(0, null, 'Bundesgesetz, mit dem das Verbraucherkreditgesetz aufgehoben wird, das Verbraucherkreditgesetz 2026 erlassen wird, das Maklergesetz, das Konsumentenschutzgesetz und das Verbraucherbehördenkooperationsgesetz geändert werden (Verbraucherkreditrechts-Änderungsgesetz 2026 - VerKRÄG 2026)', false),
  article(1, '1', 'Aufhebung des Verbraucherkreditgesetzes', false),
  article(2, '2', 'Bundesgesetz über Verbraucherkreditverträge und andere Formen der Kreditierung zu Gunsten von Verbrauchern 2026 (Verbraucherkreditgesetz 2026 - VKrG 2026)', false),
  article(3, '3', 'Änderung des Maklergesetzes', true),
  article(4, '4', 'Änderung des Konsumentenschutzgesetzes', true),
  article(5, '5', 'Änderung des Verbraucherbehördenkooperationsgesetzes', true),
]
const UWG_DRAFT: DraftArticle[] = [article(0, null, 'Bundesgesetz, mit dem das Bundesgesetz gegen den unlauteren Wettbewerb 1984 geändert wird', true)]

/** What every parse has to satisfy, whichever document and whichever path. */
function invariants(rows: readonly ComparisonRow[]): void {
  const pairs = rows.filter((r) => r.kind === 'pair')
  // An elided row is dropped by the UI and skipped by the RIS check, so a
  // change hidden in one leaves no trace anywhere.
  expect(pairs.filter((r) => r.elided && r.change !== 'unchanged')).toEqual([])
  // "geändert" over a text beginning "(4) Weitergehende …" says nothing
  // unless the row can say which § that is.
  expect(pairs.filter((r) => r.change !== 'unchanged' && !r.elided && r.para === null)).toEqual([])
  // A word diff exists exactly where two sides differ and both carry text.
  for (const row of pairs) {
    if (row.change === 'changed' && !row.elided) expect(row.segments, row.current.slice(0, 60)).not.toBeNull()
    else expect(row.segments, row.current.slice(0, 60)).toBeNull()
  }
  // No row may claim a change it cannot show: an inserted row has no current
  // text, a removed row no proposed text.
  for (const row of pairs) {
    if (row.change === 'inserted') expect(row.current).toBe('')
    if (row.change === 'removed') expect(row.proposed).toBe('')
    if (row.change === 'unchanged') expect(row.current).toBe(row.proposed)
  }
}

const counted = (rows: readonly ComparisonRow[]) => {
  const pairs = rows.filter((r) => r.kind === 'pair')
  return {
    article: rows.length - pairs.length,
    unchanged: pairs.filter((r) => r.change === 'unchanged').length,
    changed: pairs.filter((r) => r.change === 'changed').length,
    inserted: pairs.filter((r) => r.change === 'inserted').length,
    removed: pairs.filter((r) => r.change === 'removed').length,
    elided: pairs.filter((r) => r.elided).length,
  }
}

describe('the XML annex of the Verbraucherkreditrechts-Änderungsgesetz 2026', () => {
  const rows = parseTextComparison(fixture('annex-vkrg.xml'), VKRG_DRAFT).rows

  it('reads the whole document', () => {
    expect(rows).toHaveLength(39)
    expect(counted(rows)).toEqual({ article: 3, unchanged: 23, changed: 9, inserted: 3, removed: 1, elided: 15 })
    invariants(rows)
  })

  it('attributes every row to one of the draft’s laws', () => {
    // The annex marks three of the package's five Artikel — the two that
    // create law rather than amend it have nothing to compare.
    expect(rows.filter((r) => r.kind === 'article').map((r) => r.heading)).toEqual([
      'Artikel 3 — Änderung des Maklergesetzes',
      'Artikel 4 — Änderung des Konsumentenschutzgesetzes',
      'Artikel 5 — Änderung des Verbraucherbehördenkooperationsgesetzes',
    ])
    expect(rows.every((r) => r.law !== null)).toBe(true)
  })

  it('keeps the § each row belongs to, over rows that open none', () => {
    expect(rows.map((r) => r.gld)).toEqual([
      null, '§ 34.', null, null, null, null, '§ 39.', null, null, null, '§ 41.', null,
      null, '§ 13a.', null, null, null, null, null, null, '§ 41a.', null,
      null, '§ 14.', null, null, null, null, null, null, null, null, null, null, null, null, null, null, null,
    ])
    // Two rows in three open no paragraph of their own and inherit one.
    expect(rows[4]).toMatchObject({ gld: null, para: '§ 34.', change: 'changed' })
    expect(rows[11]).toMatchObject({ gld: null, para: '§ 41.', change: 'inserted' })
  })

  // The last Artikel ends with § 14 and then prints the Anhang. Until
  // 2026-09-10 the fourteen rows of that Anhang inherited "§ 14." — the RIS
  // check looked them up as § 14 of the Verbraucherbehördenkooperations-
  // gesetz, found the standing text does not carry them, and withheld them
  // with "der geltende Text dieser Stelle steht so nicht im RIS": true of
  // § 14, and false about the annex, which never claimed they were § 14. An
  // Anlage leaves the paragraph sequence rather than subdividing it, so the
  // schedule is now the designation those rows carry — its own, and one RIS
  // itself can be asked about ("Anl. 1").
  it('files the Anhang under itself, not under the last § before it', () => {
    expect(rows.map((r) => r.para)).toEqual([
      null, '§ 34.', '§ 34.', '§ 34.', '§ 34.', '§ 34.', '§ 39.', '§ 39.', '§ 39.', '§ 39.', '§ 41.', '§ 41.',
      null, '§ 13a.', '§ 13a.', '§ 13a.', '§ 13a.', '§ 13a.', '§ 13a.', '§ 13a.', '§ 41a.', '§ 41a.',
      null, '§ 14.', '§ 14.',
      'Anhang', 'Anhang', 'Anhang', 'Anhang', 'Anhang', 'Anhang', 'Anhang', 'Anhang', 'Anhang', 'Anhang', 'Anhang', 'Anhang', 'Anhang', 'Anhang',
    ])
    // The line that opens it is printed in both columns and stays the pair
    // row it is; it opens no paragraph, so `gld` stays null.
    expect(rows[25]).toMatchObject({ gld: null, para: 'Anhang', current: 'Anhang', change: 'unchanged' })
  })

  it('shows the substantive change to § 34 Abs. 2 Z 2 of the Maklergesetz', () => {
    // Read off the document: the citation moves from § 9 Abs. 2 Z 4, 7 und 8
    // VKrG to § 20 Abs. 2 Z 3, 7 und 8 of the new Verbraucherkreditgesetz 2026.
    expect(rows[4]!.current).toContain('die in § 9 Abs. 2 Z 4, 7 und 8 VKrG angeführten Angaben')
    expect(rows[4]!.proposed).toContain('die in § 20 Abs. 2 Z 3, 7 und 8 Verbraucherkreditgesetz 2026 (VKrG 2026) angeführten Angaben')
  })

  // The annex heads its table `colspan="5"` against `colspan="1"` and then
  // typesets its Anhang `4` against `3` and `3` against `4`. Assigning cells
  // by the header's split put both cells of eleven rows under "Geltende
  // Fassung" and reported them as entfällt — including this one, which the
  // annex prints identically in both columns.
  it('splits a row that does not follow the header’s column widths', () => {
    const anhang = rows.find((r) => r.current.startsWith('3. Richtlinien und Verordnungen gemäß § 3 Abs. 1 Z 3:'))!
    expect(anhang.change).toBe('unchanged')
    expect(anhang.proposed).toBe('3. Richtlinien und Verordnungen gemäß § 3 Abs. 1 Z 3:')
  })
})

describe('the PDF annex of the UWG-Novelle, whose pages are turned', () => {
  const pages = JSON.parse(fixture('annex-uwg-pages.json')) as AnnexPage[]
  const parsed = parseAnnexPdf(pages, UWG_DRAFT)

  it('reads seven provisions out of nine turned pages', () => {
    // Before the page frame was uprighted this annex produced two rows of
    // shuffled words shown as new law ("mit Zeit eine nicht oder bzw. Bilder,
    // der Etiketten, Recht Text, Marken", 2026-09-10).
    expect(parsed.rows).toHaveLength(7)
    expect(parsed.rows.map((r) => r.gld)).toEqual(['§ 1.', '§ 1a.', '§ 2.', '§ 7a.', '§ 33a.', '§ 44.', '§ 45.'])
    expect(counted(parsed.rows)).toEqual({ article: 0, unchanged: 0, changed: 6, inserted: 1, removed: 0, elided: 0 })
    invariants(parsed.rows)
  })

  it('leaves the front matter out instead of showing it as new law', () => {
    // The Langtitel and the table of contents pair with nothing, and the
    // proposed side alone would read as an insertion.
    expect(parsed.unplaced).toBe(2)
    expect(parsed.rows.some((r) => r.proposed.includes('StF: BGBl. Nr. 448/1984'))).toBe(false)
  })

  it('shows the two changes the draft makes to the Anhang references', () => {
    // Read off the document: the aggressive practices run to Z 31a instead of
    // Z 31, the misleading ones to Z 23j instead of Z 23c.
    expect(parsed.rows[1]!.current).toBe('Aggressive Geschäftspraktiken § 1a. (3) Jedenfalls als aggressiv gelten die im Anhang unter Z 24 bis 31 angeführten Geschäftspraktiken.')
    expect(parsed.rows[1]!.proposed).toBe('Aggressive Geschäftspraktiken § 1a. (3) Jedenfalls als aggressiv gelten die im Anhang unter Z 24 bis 31a angeführten Geschäftspraktiken.')
    expect(parsed.rows[2]!.current).toContain('unter Z 1 bis 23c angeführten Geschäftspraktiken')
    expect(parsed.rows[2]!.proposed).toContain('unter Z 1 bis 23j angeführten Geschäftspraktiken')
  })

  it('reads the new § 7a as an insertion, with nothing on the standing side', () => {
    const inserted = parsed.rows.find((r) => r.gld === '§ 7a.')!
    expect(inserted.change).toBe('inserted')
    expect(inserted.current).toBe('')
    expect(inserted.proposed).toContain('Rechtsmissbräuchliche Abmahnung § 7a. (1) Wer eine rechtsmissbräuchliche Abmahnung vornimmt')
  })
})

/**
 * The ministry's own Textgegenüberstellung (docs/api-exploration.md §2c).
 *
 * PURE MODULE — relative imports only, so vitest runs it directly.
 *
 * A Ministerialentwurf routinely carries an annex that already does what the
 * amendment engine tries to compute: the standing law and the proposed law
 * side by side, written and marked by the ressort itself. It is regulated by
 * a BKA Rundschreiben of 27.03.2002 — two columns headed "Geltende Fassung"
 * and "Vorgeschlagene Fassung", unchanged stretches abbreviated as a
 * designation plus three dots.
 *
 * Where it exists, it is a better source than anything derived: official,
 * paragraph-paired, and incapable of inventing law text. RIS publishes it as
 * XML; Parliament only as PDF, so this reads RIS.
 *
 * **This module reads the XML table only.** Where RIS rasterised the annex
 * into `<binary datatype="gif">` — 114 of the 240 GP-XXVIII annexes — the
 * same document's PDF still carries a full text layer, and `annexPdf.ts`
 * reads it from the page geometry. `isScanned` tells the two apart and the
 * caller picks the path (`annex/textComparisonService.ts`); this one returns an
 * empty list for a rasterised document, which must be read as "not
 * available", never as "nothing changed". Both parsers emit `ComparisonRow`,
 * so everything downstream is the same for both (api-exploration §2c).
 */

import { candidateOf, headingOf, resolveBoundaries, type BoundaryCandidate } from './annexBoundaries'
import { diffTokens, isEditorialChange } from '../diff/wordDiff'
import type { DraftArticle } from '../lawtext/draftArticles'
import type { LawDiffSegment } from '../../../shared/types'
import { elisionOpens, isElidedPair } from './elision'
import { cellText, headingOnly, paraHeading, stripGld, stripParaHeading, HEADER_CURRENT_RE, HEADER_PROPOSED_RE } from './tableCells'
import { COLSPAN_RE, columnSpans, columnsOf, coversTheWidth, itemsInOrder, liftTables, outermost, type ComparisonItem } from './tableElements'

/** How one row of the comparison differs. */
export type ComparisonChange = 'unchanged' | 'changed' | 'inserted' | 'removed'

export interface ComparisonRow {
  /** An Artikel heading spanning both columns, or a paired row of law text */
  kind: 'article' | 'pair'
  /**
   * Which law of the package the row belongs to — `segmentUnits`' article key,
   * so it joins onto the diff units and onto `promulgationByArticle`. Null
   * when the draft amends one law only, and null when the annex does not mark
   * its boundaries at all: § 5 of the second law is a different provision
   * from § 5 of the first, and guessing which is worse than not saying.
   */
  law: string | null
  /** Text of an article row */
  heading: string | null
  /** "§ 5." when the row *opens* a paragraph; null for a row that continues one */
  gld: string | null
  /**
   * The § the row belongs to — its own designation, or the one inherited from
   * the row that opened the paragraph.
   *
   * The annex prints one row per Absatz, so two thirds of the rows open no
   * paragraph of their own: 66 of 100 in one annex, 37 of them carrying a
   * change. Those read as "geändert" over a text beginning "(26) Für das
   * Inkrafttreten …", with nothing to say which § that is. `gld` cannot carry
   * it — "does this row open a paragraph" is a different question, and the
   * oracle's heading detection depends on the difference.
   */
  para: string | null
  current: string
  proposed: string
  change: ComparisonChange
  /**
   * "2. bis 26b. …" — unchanged text the annex deliberately leaves out, per
   * the Rundschreiben. Not a gap in the parse, and not something to diff.
   */
  elided: boolean
  /** Word-level diff for a changed row; null when unchanged, one-sided or too long */
  segments: LawDiffSegment[] | null
  /**
   * Changed, but only in citations, numbers, dates or punctuation — the same
   * filter the ME→RV comparison uses, so both sections mean the same thing by
   * "geändert".
   */
  editorial: boolean
}

/**
 * Removed before anything is read — deliberately not `lawtext/risXml`'s list,
 * which reads a draft rather than an annex and keeps the table of contents.
 *
 * `<inhaltsvz>` is the law's **table of contents**, and RIS names it as such.
 * Annexes reprint it, and it is a two-column table of its own — "Paragraf" and
 * "Gegenstand". Flattened into the comparison, those two columns landed under
 * "Geltende Fassung" and "Vorgeschlagene Fassung", so the page reported that
 * the draft changes "§ 21." into "Registrierungs- und Meldepflichten für
 * Abfälle": 222 rows across 23 of the 65 readable annexes, every one of them
 * marked "geändert" (measured 2026-09-09). Not a display problem — an invented
 * change, in the one section whose whole justification is that it cannot
 * invent law text. The Inhaltsverzeichnis is its own RIS document and no part
 * of any comparison.
 */
const STRIP = [
  /<kzinhalt[\s\S]*?<\/kzinhalt>/g,
  /<fzinhalt[\s\S]*?<\/fzinhalt>/g,
  /<layoutdaten[\s\S]*?<\/layoutdaten>/g,
  /<inhaltsvz[\s\S]*?<\/inhaltsvz>/g,
]
/**
 * The row's designation is the **Gliederungssymbol** only. `<symbol>` is the
 * marker of a list item, and reading it as the row's designation printed
 * "geändert 1." where 1. is a Ziffer inside a running Absatz — it reads like
 * a paragraph and is none. A row that opens with a Ziffer carries no
 * designation of its own, and saying nothing is right.
 *
 * **One Gliederungssymbol, two spellings.** RIS types it `<gldsym>`; the
 * Parliament copy of the *same* ressort annex is the Word legistic template
 * and types it `<span class=991GldSymbol>&sect;&nbsp;1.</span>` — unquoted
 * attribute, entities and all. `lawtext/parliamentHtml.ts` has known the
 * second form since it learned to read Parliament HTML; this module did not,
 * so every row of a Parliament annex came back without a designation and the
 * oracle was silent on every § (18.09.2026, docs/architecture.md §12.12).
 * Same shape of bug as `<schlussteil>` against `<schluss typ="…">`: two names
 * for one thing, one of them unknown to one of the two modules that need it.
 */
const GLD_RE = /<gldsym\b[^>]*>([\s\S]*?)<\/gldsym>|<span\s+class=["']?991GldSymbol["']?[^>]*>([\s\S]*?)<\/span>/

/**
 * A structural division of the law — "3. Abschnitt", "Abschnitt XI",
 * "2. Hauptstück", "7. Teil", with or without its title on the same line.
 *
 * Keyed on the vocabulary, and deliberately not on the shape of the line.
 * The obvious test — short, and without a closing full stop — matches 2.100
 * of the mirrored rows in GP XXVIII, and most of those are law text: an
 * Absatz that introduces a list ends in "dass", a Ziffer in a comma, a
 * litera in nothing at all. Lifting those out of the comparison would
 * delete law text from it, which is worse than the misfiling it fixes. The
 * vocabulary matches 210 rows, and every one is a division.
 *
 * The numeral is what makes it a division rather than a sentence that opens
 * with the same word: it stands either before the keyword ("3. Abschnitt")
 * or after it ("Abschnitt XI"), never neither. Without that test, "Teil der
 * Anlage ist die Beschreibung der Verfahren" reads as a heading and its text
 * leaves the comparison. The length cap is the same guard once more.
 */
const DIVISION_WORD = '(?:Abschnitt|Unterabschnitt|Hauptstück|Teil|Kapitel)'
const DIVISION_RE = new RegExp(`^(?:\\d+[a-z]*\\.\\s*${DIVISION_WORD}\\b|${DIVISION_WORD}\\s+(?:[IVXL]+|\\d+[a-z]*)\\b)`, 'i')
const DIVISION_MAX = 60

/**
 * Where an Anlage or Anhang begins — the one division that ends the paragraph
 * sequence instead of subdividing it.
 *
 * A § continues across an Abschnitt or a Hauptstück, so those leave the open
 * designation alone. A schedule does not: what stands under "Anhang" is
 * addressed as the Anlage, and everything the annex prints there carries no §
 * of its own. The rows inherited the last § before the schedule all the same
 * — in the VerKRÄG annex fourteen rows of the Anhang went out as § 14 of the
 * Verbraucherbehördenkooperationsgesetz, which the RIS check then withheld
 * with "der geltende Text dieser Stelle steht so nicht im RIS": true of § 14,
 * and false about the annex, which never claimed they were § 14. Measured
 * 2026-09-10 over the 400 most recent RIS-Begut records (126 readable XML
 * annexes): 951 rows in 61 schedules, 230 of them shown as a change.
 *
 * The schedule's own line becomes the designation rather than null, and that
 * is the point of doing it here: 213 of those 230 rows now carry a
 * designation RIS can be asked about ("Anlage 1" → `Anl. 1`), where before
 * they were scored against the § in front of the schedule. Where the line
 * names no numeral ("Anhang"), `designationKey` reads nothing and the rows
 * stay unchecked — which is what they were owed.
 *
 * Two tests, because both occur. `typ="anlage"` is RIS's own markup and says
 * it outright; it also sits on the subtitle lines beneath such a heading, and
 * resetting on those is harmless because the schedule is already open. The
 * wording is the fallback for the twelve rows in that window that open a
 * schedule without the markup ("Anlage 1", "ANHANG I"), and it carries the
 * same length cap as the division rule: a provision that merely starts with
 * the word "Anhang" is longer than a heading.
 */
const ANLAGE_TYP_RE = /<ueberschrift\b[^>]*\btyp="anlage"/i
const ANLAGE_TEXT_RE = /^(?:Anlage|Anhang)\b/i

function opensAnlage(text: string, html: string): boolean {
  if (ANLAGE_TYP_RE.test(html)) return true
  return text.length <= DIVISION_MAX && ANLAGE_TEXT_RE.test(text)
}

export interface ComparisonParse {
  rows: ComparisonRow[]
  /**
   * Why the package's laws could not be told apart, in words fit to show a
   * reader; null when they could. The comparison is still worth showing —
   * it just carries no law of its own.
   */
  refusal: string | null
  /**
   * Why the document could not be read as a comparison at all. `rows` is then
   * empty, which the caller already treats as "not readable" — this only says
   * which of the ways it failed, for the harnesses and the log.
   */
  unreadable?: string
}

/** What a heading or row does in the document, decided before any is emitted. */
interface Parsed {
  item: ComparisonItem
  /** Heading text, for a heading row or a document-level heading */
  heading: string | null
  /** Set when the row is a pair row printing the same text in both columns */
  mirrored: string | null
  cells: { html: string; span: number }[]
}

/**
 * One Textgegenüberstellung XML → its rows, in printed order.
 *
 * `articles` is the draft's own Artikel list (`draftArticles`). Every law
 * boundary the annex prints has to be one of them: the annex sets an internal
 * Roman division, a provision of a law organised in Artikel, and a real law
 * boundary in the same shape, and § 5 of the second law of a package is a
 * different provision from § 5 of the first. Passing an empty list says "no
 * draft to check against", and the annex is then read as one undivided law.
 */
export function parseTextComparison(xml: string, articles: readonly DraftArticle[] = []): ComparisonParse {
  let body = xml
  for (const re of STRIP) body = body.replace(re, '')

  const items = itemsInOrder(body)
  const span = columnSpans(items.filter((i): i is Extract<ComparisonItem, { kind: 'row' }> => i.kind === 'row'))
  if (span === null) return { rows: [], refusal: null, unreadable: 'Das Dokument ist keine zweispaltige Gegenüberstellung.' }

  // Pass 1: what each item is.
  const parsed: Parsed[] = []
  for (const item of items) {
    if (item.kind === 'heading') {
      parsed.push({ item, heading: item.text, mirrored: null, cells: [] })
      continue
    }
    const own = outermost(item.inner, 'td')
    const wide = coversTheWidth(own)
    const cells = own.map((c, i) => ({ html: liftTables(c.inner, wide[i]!).text, span: Number(COLSPAN_RE.exec(c.attrs)?.[1] ?? 1) }))
    if (cells.length === 0) continue
    // A heading occupies the whole width. Anything narrower is a pair row,
    // however many columns each of its cells happens to span.
    const firstFilled = cells.find((c) => cellText(c.html) !== '') ?? cells[0]!
    if (cells.length === 1 || firstFilled.span >= span.left + span.right) {
      const heading = cellText(firstFilled.html)
      if (heading) parsed.push({ item, heading, mirrored: null, cells })
      continue
    }
    const { currentHtml, proposedHtml } = columnsOf(cells, span)
    const current = cellText(currentHtml)
    const proposed = cellText(proposedHtml)
    // The mandated column headings repeat on every page; they are chrome.
    if (HEADER_CURRENT_RE.test(current) && HEADER_PROPOSED_RE.test(proposed)) continue
    if (!current && !proposed) continue
    // An Artikel line is often printed once per column rather than across
    // both, and read as an ordinary pair row it left the boundary invisible.
    parsed.push({ item, heading: null, mirrored: current && current === proposed ? current : null, cells })
  }

  // Pass 2: which of the heading-shaped lines open a law.
  const candidates: BoundaryCandidate[] = []
  /** Index in `parsed` → index in `candidates`, and whether the line was a heading row. */
  const candidateAt = new Map<number, { at: number; fromHeading: boolean }>()
  const titleOf = new Map<number, number>()
  for (const [i, p] of parsed.entries()) {
    if (candidateAt.has(i) || titleOf.has(i)) continue
    const text = p.heading ?? p.mirrored
    if (!text) continue
    const candidate = candidateOf(text)
    if (!candidate) continue
    const at = candidates.length
    // The law's name sits on the line below its Artikel number.
    if (candidate.numeral !== null && !candidate.title) {
      for (let j = i + 1; j < parsed.length; j++) {
        const next = parsed[j]!.heading ?? parsed[j]!.mirrored
        if (!next) break
        if (/^[§(]/.test(next) || candidateOf(next)?.numeral) break
        candidate.title = next
        titleOf.set(j, at)
        break
      }
    }
    candidates.push(candidate)
    candidateAt.set(i, { at, fromHeading: p.heading !== null })
  }
  const resolution = resolveBoundaries(candidates, articles)

  // Pass 3: emit.
  const rows: ComparisonRow[] = []
  let law = resolution.whole?.key ?? null
  /** The § currently open — a new law restarts the numbering. */
  let openPara: string | null = null
  let pendingHeading: string[] = []
  /**
   * One-sided heading rows waiting for the row below to say which § they are.
   *
   * A row is emitted in printed order, so they are flushed before the next row
   * is pushed and never outlive their law.
   */
  let heldHeadings: ComparisonRow[] = []
  const releaseHeadings = (): void => {
    for (const row of heldHeadings) rows.push({ ...row, para: openPara })
    heldHeadings = []
  }
  /**
   * Two-sided heading rows waiting to learn whether a § opens below them.
   *
   * `lift` reads the §'s **own** heading and nothing else — RIS types that one
   * `typ="para"` — so every heading a level up stayed an ordinary pair row and,
   * printed identically in both columns, was filed under the § **above** it.
   *
   * Measured over the 126 readable GP-XXVIII annexes (2026-09-11): **507 such
   * rows**, every one marked `<ueberschrift>` and none recognisable from its
   * wording, of which **331 are followed by a row that opens a §**. Those 331
   * stop being rows and become the `heading` of the § below, exactly as `lift`
   * does one level down; the other 176 open nothing below them and stay the
   * row they are, because where the corpus says nothing the answer is the one
   * that shipped. **Rejected variant:** filing them under the § below without
   * making them its heading leaves them text that claims to be the provision,
   * and RIS's own § documents mostly carry no group headings to hold that text
   * against (docs/architecture.md §12.13).
   *
   * **Only where both columns print it.** A heading printed on one side is the
   * change itself and stays a row (`heldHeadings`); a heading that *differs*
   * between the columns is „samt Überschrift" and stays inside the compared
   * text — 119 rows of GP XXVIII, none of them touched here.
   */
  let heldTwoSided: ComparisonRow[] = []
  const releaseTwoSided = (): void => {
    for (const row of heldTwoSided) rows.push({ ...row, para: openPara })
    heldTwoSided = []
  }
  for (const [i, p] of parsed.entries()) {
    const mark = candidateAt.get(i)
    if (mark) {
      const article = resolution.accepted.get(mark.at)
      if (article) {
        // Still under the old law and the old §: there is no row below them
        // inside this Artikel to take them.
        releaseTwoSided()
        releaseHeadings()
        law = article.key
        openPara = null
        rows.push({ kind: 'article', law, heading: headingOf(article), gld: null, para: null, current: '', proposed: '', change: 'unchanged', elided: false, segments: null, editorial: false })
        pendingHeading = []
        continue
      }
      // A candidate the draft does not confirm is an internal heading. One
      // printed across the width is context for the rows below it; one printed
      // in both columns is law text and stays the pair row it is.
      if (mark.fromHeading) {
        pendingHeading.push(p.heading!)
        continue
      }
    }
    if (titleOf.has(i)) {
      if (!resolution.accepted.has(titleOf.get(i)!)) pendingHeading.push((p.heading ?? p.mirrored)!)
      continue
    }
    // Every other heading across both columns — Abschnitt, Hauptstück, a
    // heading over a group of §§ — is context for the provision beneath it,
    // not a group of its own.
    if (p.heading !== null) {
      if (opensAnlage(p.heading, p.item.kind === 'heading' ? p.item.html : p.item.inner)) openPara = p.heading
      pendingHeading.push(p.heading)
      continue
    }
    // The same, for a division the ressort typeset as an ordinary row in
    // both columns rather than as a heading. It reached the comparison as a
    // mirrored pair row and was filed under whichever § stood open above it
    // — "9b. Abschnitt" under § 2, "10. Abschnitt" under § 54j.
    if (p.mirrored !== null && p.mirrored.length <= DIVISION_MAX && DIVISION_RE.test(p.mirrored)) {
      pendingHeading.push(p.mirrored)
      continue
    }
    // An Anlage or Anhang ends the paragraph sequence rather than dividing it
    // (`opensAnlage`), so it becomes the designation the rows beneath it
    // inherit — its own, not the § before it. The line stays the pair row it
    // is: the annex prints it in both columns, and it is part of what changed
    // or did not.
    if (p.mirrored !== null && opensAnlage(p.mirrored, p.item.kind === 'row' ? p.item.inner : '')) openPara = p.mirrored

    const raw = columnsOf(p.cells, span)
    // The § heading sits in the *same* cell as the Absatz, above it — that is
    // how the ressort typesets it, so the cell's text really does read
    // "Wiederholung von Teilprüfungen … § 40. (1) Wurden …". Faithful, and
    // unreadable: it belongs over the row, not inside its text.
    //
    // Only lifted when both columns carry the same heading. One that differs
    // between them, or stands on one side only, is a change the draft makes
    // ("samt Überschrift") and has to stay where the word diff can see it.
    const ownHeading = paraHeading(raw.currentHtml)
    const lift = ownHeading !== null && ownHeading === paraHeading(raw.proposedHtml)
    const currentHtml = lift ? stripParaHeading(raw.currentHtml) : raw.currentHtml
    const proposedHtml = lift ? stripParaHeading(raw.proposedHtml) : raw.proposedHtml
    const gldMatch = GLD_RE.exec(currentHtml) ?? GLD_RE.exec(proposedHtml)
    // Group 1 is RIS's `<gldsym>`, group 2 the Word template's span; exactly
    // one of them is set. Reading group 1 alone gave `undefined` for every
    // Parliament annex — the branch fired and its capture was dropped.
    const gld = gldMatch ? cellText(gldMatch[1] ?? gldMatch[2] ?? '') : null
    if (gld) openPara = gld
    // The two-sided headings held above this row were waiting for exactly this:
    // the row opens a §, so they are its heading and stop being rows of their
    // own (`heldTwoSided`). `unshift`, because a heading stands above whatever
    // `pendingHeading` collected after it.
    if (gld !== null && heldTwoSided.length > 0) {
      pendingHeading.unshift(...heldTwoSided.map((held) => [held.heading, held.current].filter(Boolean).join(' ')))
      heldTwoSided = []
    }
    // The designation is a `<gldsym>` element of its own, so it is data rather
    // than prose — and it is already carried in `gld`. Left in the text as
    // well, 1.183 of the 1.198 rows that have one printed it twice: "§ 40."
    // beside the badge and "§ 40. (1) Wurden …" underneath it. A consumer that
    // wants the provision as printed joins `gld` and `current`. A designation
    // the row does *not* carry stays in the text (`stripGld`).
    const current = cellText(stripGld(currentHtml, gld))
    const proposed = cellText(stripGld(proposedHtml, gld))
    if (lift && !current && !proposed) {
      // The heading had a row of its own. It belongs to the § *below* it —
      // read in printed order it landed in the § before, which once put
      // another §'s title onto a provision.
      pendingHeading.push(ownHeading)
      continue
    }
    // A row that prints nothing but the designation is a marker, not a
    // comparison; the § it opens is remembered and the next row inherits it.
    if (!current && !proposed) continue
    const elided = isElidedPair(current, proposed)
    // An elision line that names its § opens it (`elisionOpens`) — the row is
    // that §'s, and so are the rows below it until the next designation.
    if (elided && gld === null) openPara = elisionOpens(current, proposed) ?? openPara
    const change = classify(current, proposed)
    // The ressort's yellow marking is reliable where present but incomplete:
    // of 8.430 row pairs, 1.395 differ in text without being marked, while
    // only 3 are marked without differing (measured 2026-09-08). So the word
    // diff decides what is shown, and the marking is not read at all.
    const segments = change === 'changed' && !elided ? diffTokens(current, proposed).segments : null
    const row: ComparisonRow = {
      kind: 'pair',
      law,
      heading: [pendingHeading.join(' '), lift ? ownHeading : ''].filter(Boolean).join(' · ') || null,
      gld,
      para: openPara,
      current,
      proposed,
      change,
      elided,
      segments,
      editorial: isEditorialChange(segments),
    }
    pendingHeading = []
    // A heading the annex prints in **both** columns, in a row of its own and
    // above the § it heads. Whose it is cannot be known yet — it is the § the
    // *next* row opens, if one does — so it waits (`heldTwoSided`), and the
    // schedule heading is the same exception as below: an Anlage opens its own
    // unit rather than waiting for a § that never comes, and the row stays the
    // pair row it is.
    if (gld === null && !elided && current === proposed && headingOnly(currentHtml) && headingOnly(proposedHtml) && !opensAnlage(current, currentHtml)) {
      heldTwoSided.push(row)
      continue
    }
    // A heading the annex prints in **one** column only belongs to the unit
    // below it, exactly as a two-sided one does — the draft inserts a § with
    // its heading, or repeals one, and the column where it does not yet (or no
    // longer) exist is empty. `lift` never sees those: it needs the heading in
    // both columns, so the row went out as an ordinary insertion or deletion
    // and inherited the § *above*. SchOG § 129 carried the heading of § 130d,
    // the Blutspenderverordnung § 7 that of § 8, the AWG § 72a that of the
    // repealed § 72b.
    //
    // It may not vanish into `pendingHeading` the way a two-sided heading
    // does. One printed on both sides is unchanged by definition; a one-sided
    // heading *is* the change, and making a shown change disappear is the
    // mistake the old elision rule made over 919 rows. So the row stays a row
    // and only its § moves.
    //
    // Which § that is cannot be known yet: it is the one the *next* row opens.
    // Held until then, the row takes whatever § is open when the row below is
    // emitted — the new § where the row below opens one, and the § above where
    // it does not, so where the corpus says nothing the answer is the one that
    // shipped.
    //
    // Measured over the 126 readable GP-XXVIII annexes (2026-09-11): 297 rows
    // of this shape out of 11.448, 244 printed right and 53 left. 236 are
    // followed by a row that opens a §; the other 61 open nothing and keep the
    // § above. RIS types every one of the 297 as `<ueberschrift>` — none has to
    // be recognised from its wording (`headingOnly`).
    if (gld === null && (current === '') !== (proposed === '') && headingOnly(current === '' ? proposedHtml : currentHtml)) {
      const only = current || proposed
      // Unless it is a schedule heading, which is a designation and not a
      // title: what stands under "Anhang" is addressed as the Anlage, so the
      // line opens its own unit rather than waiting for a § that never comes
      // (`opensAnlage`, which the two-sided and the full-width heading already
      // ask). Seven rows of GP XXVIII, and they were filed under the *previous*
      // schedule — the Bäderhygieneverordnung showed its new Anlage 11 under
      // Anlage 10, the Medizinproduktebetreiberverordnung its repealed Anhang 5
      // under Anhang 2.
      if (opensAnlage(only, current === '' ? proposedHtml : currentHtml)) {
        // Before the schedule opens, so a two-sided heading held above it keeps
        // the § above and stands where the annex printed it. No annex of
        // GP XXVIII holds one across this branch, which is why it is written
        // down rather than left to the next one that does.
        releaseTwoSided()
        openPara = only
        releaseHeadings()
        rows.push({ ...row, para: openPara })
        continue
      }
      heldHeadings.push(row)
      continue
    }
    // Two-sided first: where both stacks are open at once — twice in GP XXVIII
    // — the two-sided rows are the ones the annex printed first.
    releaseTwoSided()
    releaseHeadings()
    rows.push(row)
  }
  releaseTwoSided()
  releaseHeadings()
  return { rows, refusal: resolution.refusal }
}

export function classify(current: string, proposed: string): ComparisonChange {
  if (!current && proposed) return 'inserted'
  if (current && !proposed) return 'removed'
  return current === proposed ? 'unchanged' : 'changed'
}

export interface ComparisonStats {
  total: number
  changed: number
  editorial: number
  inserted: number
  removed: number
  unchanged: number
}

export function summarizeComparison(rows: readonly ComparisonRow[]): ComparisonStats {
  const pairs = rows.filter((r) => r.kind === 'pair')
  const count = (change: ComparisonChange) => pairs.filter((r) => r.change === change).length
  return {
    total: pairs.length,
    changed: count('changed'),
    editorial: pairs.filter((r) => r.editorial).length,
    inserted: count('inserted'),
    removed: count('removed'),
    unchanged: count('unchanged'),
  }
}

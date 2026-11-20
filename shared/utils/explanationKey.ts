/**
 * The key under which an Erläuterungen passage and a row of the
 * Textgegenüberstellung mean the same Paragraph.
 *
 * Shared, because both sides have to build it: the server when it resolves
 * the passages (`server/utils/explanations/explanationsJoin.ts`) and the page
 * when it looks them up against the rendered § group. Two versions of one key
 * would be two chances for them to drift — and the result would not be an
 * error but a reasoning that stays silent.
 *
 * NAMES OF THEIR OWN, on purpose. Two components of the same shape already
 * exist: `paragraphKey(id, law)` in `server/utils/kons/tguOracle.ts` and
 * `annexParagraphKey(law, para)` in `server/utils/annex/verdict.ts` — two
 * functions of one name and one shape whose arguments are in reverse order
 * are exactly what a Nitro auto-import resolves silently and wrongly. So
 * these are named differently again, law first, like the younger of the two.
 */
import { PARAGRAPH_NUMBER } from './paragraphNumber'
import { scheduleNumber } from './scheduleNumber'

/**
 * „§ 6.01a" at the start of a designation, its number read as every reader
 * reads it (`PARAGRAPH_NUMBER`) — and „§. 39.", the full stop after the sign
 * with which RIS prints the §§ of the ZPO and the Jurisdiktionsnorm.
 *
 * ONE READER FOR BOTH SIDES OF THE ANNEX (20.11.2026). The oracle files an
 * annex row under its § through this function (`paraIdOf` in
 * `server/utils/kons/tguOracle.ts`), and the page finds the outcome for a §
 * block through it (`annexUnitId`). Until then each had its own pattern, and
 * the oracle learnt „§. 39." alone: JN § 39, Notariatsordnung § 154 and ZPO
 * §§ 320, 517, 518 (18/ME and 116/ME XXVIII) were confirmed and stood at the
 * end of their law, away from the rows that confirmed them.
 */
const DESIGNATION_RE = new RegExp(String.raw`^\s*§+\.?\s*(${PARAGRAPH_NUMBER})`, 'i')
/** Characters no reader sees (the soft hyphen, bidi controls) — `normalizeText` drops them on the server's side. */
const FORMAT_CHARS_RE = /\p{Cf}/gu

/**
 * Designation → number: „§ 54c." from the annex's Gliederungssymbol and
 * „§ 54c" from a passage heading both give „54c".
 *
 * The oracle's `paraIdOfGld` (`server/utils/kons/tguOracle.ts`) reads a §
 * through this very function, so the annex's two sides cannot read a
 * designation two ways (20.11.2026). Null where no Paragraph
 * stands — an Anlage heading („Anlage 1 zu § 6 …") is not a Paragraph
 * designation and carries a „§" of all things, which is why the anchor at the
 * start is the whole rule.
 */
export function explanationParaId(designation: string | null): string | null {
  // Case-insensitive and lowercased afterwards: both sides of the lookup go
  // through this function, so it decides the spelling for both — „§ 54c." and
  // „§ 54C" must not be two different Paragraphen.
  //
  // „§ 8.03." whole, as the server keys it (`unitKey`): a Verordnung that
  // numbers its §§ by Kapitel read as „8", its outcomes met no § block, and
  // 60 blocks of 707EA278 said „Anweisung nicht gefunden" (26.10.2026). The
  // full stop of a plain „§ 5." is no part of it: only a digit behind the
  // point continues the number. „§ 6.01a" and „§ 365m1" whole, as every
  // reader reads it (`PARAGRAPH_NUMBER`).
  const m = DESIGNATION_RE.exec((designation ?? '').replace(FORMAT_CHARS_RE, ''))
  return m ? m[1]!.toLowerCase() : null
}

/** „Artikel 53.", „Art. 52a" — an Artikel as the unit itself, with its number, and nothing beside it. */
const ARTICLE_UNIT_RE = /^\s*Art(?:ikel|\.)\s*(\d+[a-z]*)\.?\s*$/i

/**
 * „Artikel 53." → „53": the number an Artikel carries as the unit itself, as
 * the engine names the unit of a law divided into Artikel (the B-VG). Null
 * for anything else — „Artikel 2 — Änderung des GmbH-Gesetzes", the heading
 * of a package's Artikel, carries more than its number.
 *
 * Only a unit in a law whose units ARE Artikel (`articleUnitLaws`); the
 * caller decides that, never this function.
 */
export function articleUnitId(designation: string | null): string | null {
  const m = ARTICLE_UNIT_RE.exec((designation ?? '').replace(FORMAT_CHARS_RE, '').replace(/\s+/g, ' '))
  return m ? m[1]!.toLowerCase() : null
}

/** What `articleUnitLaws` reads of an annex row — the server's and the page's rows both carry it. */
export interface DesignatedRow {
  kind: string
  law: string | null
  gld: string | null
  para: string | null
}

/**
 * The laws of an annex whose units are Artikel (20.11.2026): rows designated
 * „Artikel 52." and not one row of that law designated as a §. The B-VG is
 * divided so. A law that carries §§ inside its Artikel („Art. 1 § 3") keeps
 * them apart: there „Artikel 1." is no unit the engine addresses.
 *
 * Decided here for the oracle (`rowsByParagraph`) and the page
 * (`placeAtParagraphs`) alike: the oracle alone read it, and 127/ME
 * XXVIII's Art. 53, 92, 134 and 147 and 82/ME's Art. 10, 11, 102 and 151
 * were confirmed against rows the page then could not find. Keyed by the
 * law as the rows name it, the empty string for none.
 */
export function articleUnitLaws(rows: readonly DesignatedRow[]): Set<string> {
  const articles = new Set<string>()
  const paragraphs = new Set<string>()
  for (const row of rows) {
    if (row.kind !== 'pair') continue
    const law = row.law ?? ''
    for (const gld of [row.gld, row.para]) {
      if (!gld) continue
      if (explanationParaId(gld) !== null) paragraphs.add(law)
      else if (articleUnitId(gld) !== null) articles.add(law)
    }
  }
  return new Set([...articles].filter((law) => !paragraphs.has(law)))
}

/**
 * Designation → the number a § carries, or an Artikel in a law whose units
 * are Artikel (`articleUnits`, decided by `articleUnitLaws`): „§ 54c." →
 * „54c", „Artikel 94a." → „94a". Never a schedule's.
 *
 * What the page compares where it asks whether a block's unit changes its
 * number („Artikel 90a." left, „Artikel 94a." right). Asked through
 * `explanationParaId` alone, both sides of an Artikel read as nothing and
 * therefore as equal: no Artikel was ever renumbered (20.11.2026).
 */
export function numberedUnitId(designation: string | null, articleUnits = false): string | null {
  return explanationParaId(designation) ?? (articleUnits ? articleUnitId(designation) : null)
}

/**
 * Designation → the unit a § block of the annex and an outcome of the
 * Lesefassung both stand for: „§ 54c." → „54c", „Anlage 1 (zu § 6)" →
 * „anl. 1", „Anhang" → „anl.". Lowercased, as `explanationParaId`.
 *
 * The Lesefassung's own reading, apart from `explanationParaId`, because the
 * two answer for a schedule differently: a Begründung passage is keyed by
 * Paragraph only, while the engine keys a schedule as a unit of its own
 * (`unitKey` in `server/utils/text/designation.ts` — kind and its own
 * number, `scheduleNumber`: „Anhang XIV" → „anl. 14", as the engine and RIS
 * key it). Looked up through `explanationParaId`, every confirmed schedule
 * found no § block and was never rendered (26.10.2026). Anchored at the
 * start like the oracle's `paraIdOfGld`: a row that merely mentions an
 * Anlage opens none.
 *
 * `articleUnits`: whether the block's law counts its units as Artikel
 * (`articleUnitLaws`) — then „Artikel 53." is the unit „53", as the oracle
 * keys its rows.
 */
export function annexUnitId(designation: string | null, articleUnits = false): string | null {
  const t = (designation ?? '').trim()
  const numbered = numberedUnitId(t, articleUnits)
  if (numbered) return numbered
  if (!/^(?:Anlage|Anhang|Anl\.?)(?!\p{L})/iu.test(t)) return null
  const n = scheduleNumber(t)
  return n ? `anl. ${n.toLowerCase()}` : 'anl.'
}

/** Law and Paragraph as one key. The empty law is a real value. */
export function explanationKey(law: string | null, paraId: string): string {
  return `${law ?? ''}#${paraId}`
}

/**
 * The second key, for a § number two Artikel of one draft share: the
 * Artikel as `leadingArticleKey` writes it
 * („2"), then the § key above. Both sides of the Begründungsvergleich build it
 * here, so the passage and the unit cannot be keyed two ways.
 */
export function articleParagraphKey(article: string, paragraphId: string): string {
  return `${article}|${paragraphId}`
}

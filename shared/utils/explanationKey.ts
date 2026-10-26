/**
 * The key under which an Erläuterungen passage and a row of the
 * Textgegenüberstellung mean the same Paragraph (docs/architecture.md
 * §12.30).
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

/**
 * Designation → number: „§ 54c." from the annex's Gliederungssymbol and
 * „§ 54c" from a passage heading both give „54c".
 *
 * The same shape as `paraIdOfGld` in `server/utils/kons/tguOracle.ts`, which
 * does the same on the annex's other side; that one lives under
 * `server/utils` and the page cannot reach it. Null where no Paragraph
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
  // point continues the number.
  const m = /^\s*§+\s*(\d+[a-z]*(?:\.\d+)?)\b/i.exec(designation ?? '')
  return m ? m[1]!.toLowerCase() : null
}

/**
 * Designation → the unit a § block of the annex and an outcome of the
 * Lesefassung both stand for: „§ 54c." → „54c", „Anlage 1 (zu § 6)" →
 * „anl. 1", „Anhang" → „anl.". Lowercased, as `explanationParaId`.
 *
 * The Lesefassung's own reading, apart from `explanationParaId`, because the
 * two answer for a schedule differently: a Begründung passage is keyed by
 * Paragraph only, while the engine keys a schedule as a unit of its own
 * (`unitKey` in `server/utils/text/designation.ts` — kind and first number).
 * Looked up through `explanationParaId`, every confirmed schedule found no §
 * block and was never rendered (26.10.2026). Anchored at the start like the
 * oracle's `paraIdOfGld`: a row that merely mentions an Anlage opens none.
 */
export function annexUnitId(designation: string | null): string | null {
  const t = (designation ?? '').trim()
  const para = explanationParaId(t)
  if (para) return para
  if (!/^(?:Anlage|Anhang|Anl\.?)(?!\p{L})/iu.test(t)) return null
  const n = /(\d+[a-z]*(?:\.\d+)?)/i.exec(t)
  return n ? `anl. ${n[1]!.toLowerCase()}` : 'anl.'
}

/** Law and Paragraph as one key. The empty law is a real value. */
export function explanationKey(law: string | null, paraId: string): string {
  return `${law ?? ''}#${paraId}`
}

/**
 * The second key, for a § number two Artikel of one draft share
 * (docs/architecture.md §12.10b): the Artikel as `leadingArticleKey` writes it
 * („2"), then the § key above. Both sides of the Begründungsvergleich build it
 * here, so the passage and the unit cannot be keyed two ways.
 */
export function articleParagraphKey(article: string, paragraphId: string): string {
  return `${article}|${paragraphId}`
}

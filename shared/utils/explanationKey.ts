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
  const m = /^\s*§+\s*(\d+[a-z]*)\b/i.exec(designation ?? '')
  return m ? m[1]!.toLowerCase() : null
}

/** Law and Paragraph as one key. The empty law is a real value. */
export function explanationKey(law: string | null, paraId: string): string {
  return `${law ?? ''}#${paraId}`
}

/**
 * What the Textgegenüberstellung says about itself: what the RIS check found,
 * what it withheld and why, which pages could not be read, and which law
 * looks doubtful.
 *
 * All of it is a function of the response and nothing else, which is why it
 * lives here: these are German sentences about how far a comparison can be
 * relied on, and a sentence that says „ein Paragraph wird nicht gezeigt" for
 * three of them is worse than no sentence at all. Here they can be held
 * against a small response object.
 *
 * Framing rule (docs/architecture.md §4): every one of them states what was found, never a
 * verdict on the ministry — and where the finding may be OUR reading, it says
 * so first.
 */
import type { AnnexWithheldCause, TextComparisonResponse } from '#shared/types'

type ReadFrom = TextComparisonResponse['readFrom']

/**
 * Why a law's „nicht geprüft" §§ went unchecked — the line under its pill,
 * or null where the group has none.
 *
 * **Per law since 03.10.2026.** Until then one sentence stood above the whole
 * comparison, „Nicht gegen das geltende Recht im RIS geprüft: …", with every
 * reason the check had collected anywhere in the draft joined by semicolons —
 * so one law carried the reasons of another, and the reader met them before
 * knowing which §§ they were about. The reasons now travel with the rows
 * (`uncheckedReason`), and each group names its own where its pill is.
 *
 * Before that (until 02.10.2026) a status line stood over every comparison;
 * what it said moved into the group pills, the credit line's
 * „Zeilenzuordnung" and the withheld blocks.
 *
 * Silence where no reason was recorded is safe: the pill still counts the
 * §§, so the page never reads as „checked, nothing to report". The reasons
 * are the server's fragments (`REASON_*` in `server/utils/annex/verdict.ts`),
 * written to follow a colon; first seen first.
 */
export function annexUncheckedNote(reasons: readonly string[]): string | null {
  return reasons.length ? `Nicht geprüft: ${reasons.join('; ')}.` : null
}

/**
 * What a withheld block says it found, and who might be at fault for it.
 *
 * Three findings, and the sentence has to name the one that applies to *this*
 * § — a single sentence for all three would tell the reader something untrue
 * about two of them.
 *
 * The second half is the attribution, and it depends on where the rows came
 * from. On the PDF path we inferred the pairing from the page geometry
 * ourselves, so every one of the three is at least as likely to be our
 * reading as the ministry's document: a left column that "does not match" may
 * be our pairing, a stretch that "already stands" may be our left column
 * losing a line, and text "not in the draft" may be our right column catching
 * a neighbour's. Handing the ministry the blame for our own reading would be
 * both wrong and against the framing of this project.
 *
 * These tables are the only place the causes are worded client-side.
 */
const WITHHELD_FINDING: Record<AnnexWithheldCause, string> = {
  standing: 'der geltende Text dieser Stelle steht so nicht im RIS.',
  alreadyStanding: 'die vorgeschlagene Fassung zeigt Text als neu, der im RIS schon gilt.',
  notInDraft: 'die vorgeschlagene Fassung enthält Text, den der Entwurf für diesen Paragraphen nicht anordnet.',
}
/* SHORT SINCE 30.09.2026 — one clause of attribution, not the list of
 * causes. The PDF variants ran to two or three „Das kann daran liegen,
 * dass …" alternatives at every withheld block; the alternatives stand once
 * on /so-funktionierts#gegenueberstellung, and the block links there. What
 * must stay at the block is the attribution itself: on the PDF path our own
 * reading is named first, so the finding never reads as the ministry's
 * fault. */
const WITHHELD_FROM_PDF = 'Das kann an unserer Lesung des PDF liegen.'
const WITHHELD_FROM_TABLE: Record<AnnexWithheldCause, string | null> = {
  standing: null,
  alreadyStanding: 'Die Beilage dürfte einen anderen Stand des Gesetzes zugrunde legen.',
  notInDraft: 'Das kann auch an unserer Zuordnung zum Paragraphen liegen.',
}

export function annexWithheldText(cause: AnnexWithheldCause | null): string {
  // No cause recorded is the state every withholding had before 2026-09-10.
  return WITHHELD_FINDING[cause ?? 'standing']
}

export function annexWithheldBlame(cause: AnnexWithheldCause | null, readFrom: ReadFrom): string | null {
  const key = cause ?? 'standing'
  return readFrom === 'pdf' ? WITHHELD_FROM_PDF : WITHHELD_FROM_TABLE[key]
}

/**
 * Pages of the PDF the parser refused, said as a gap and not as a defect.
 *
 * A page set differently from the rest of the document — another width, a
 * skewed run, runs disagreeing about which way the page is turned — is not
 * read differently but wrongly: the column boundary is one coordinate for the
 * whole document, so the words would be real and only their arrangement ours
 * (`annexPdf.ts`). The parser therefore leaves such a page unread, and that
 * is a hole in what the reader sees. Silence about it would be the worse
 * answer: the comparison would simply be missing a provision, with nothing
 * on the page to say so.
 *
 * Null for the table path and for every PDF read whole — which is all 114
 * GP-XXVIII annexes today. The sentence exists for the first one that is not.
 */
export function annexDroppedPagesNote(n: number): string | null {
  if (n === 0) return null
  return n === 1
    ? 'Eine Seite des PDF war anders gesetzt als die übrigen und wurde nicht gelesen; was auf ihr steht, fehlt hier.'
    : `${n} Seiten des PDF waren anders gesetzt als die übrigen und wurden nicht gelesen; was auf ihnen steht, fehlt hier.`
}

/**
 * A law whose §§ fail in a cluster. Named, and the cause named honestly with
 * it — which depends on where the rows came from.
 *
 * On the ressort's XML table the pairing is the ressort's own, so a cluster
 * points at the annex quoting an older version of the law than RIS holds for
 * the first day of the consultation. On the PDF path we inferred the rows
 * from the page geometry ourselves, and a cluster is at least as likely to
 * be our reading — 21 of the 24 clusters in GP XXVIII are on that path. It
 * would be both wrong and against the framing of this project to hand the
 * ministry the blame for our own row pairing.
 *
 * The §§ that did verify are shown either way: they verified against the
 * standing text.
 */
export function annexDoubtfulNote(laws: readonly string[], readFrom: ReadFrom): string | null {
  if (laws.length === 0) return null
  const named = laws.length === 1 ? `„${laws[0]}“` : laws.map((l) => `„${l}“`).join(', ')
  return `Auffällig viele Stellen weichen vom geltenden Text ab bei ${named} – ${doubtfulCause(readFrom)}.`
}

// One clause since 30.09.2026, as at the withheld blocks.
const doubtfulCause = (readFrom: ReadFrom) =>
  readFrom === 'pdf'
    ? 'das kann an unserer Lesung des PDF liegen'
    : 'die Beilage dürfte dort einen anderen Stand des Gesetzes zugrunde legen'

/**
 * The same finding inside the law's own group (since 03.10.2026), where it
 * needs no name: it stood above the whole comparison before and named the
 * law, so a reader met it before knowing which §§ it was about — the move
 * the „nicht geprüft" reasons made the same day. `annexDoubtfulNote` stays
 * for a law no group carries.
 */
export function annexDoubtfulGroupNote(readFrom: ReadFrom): string {
  return `Auffällig viele Stellen dieses Gesetzes weichen vom geltenden Text ab – ${doubtfulCause(readFrom)}.`
}

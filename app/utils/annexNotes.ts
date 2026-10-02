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

type Verification = TextComparisonResponse['verification']
type ReadFrom = TextComparisonResponse['readFrom']

/**
 * The one thing about the check that has to stand above the comparison: that
 * it did not run, and why — or null.
 *
 * **No status line since 02.10.2026.** Until then one stood over every
 * comparison: the result in counts, „n nicht gezeigt", „n nicht geprüft",
 * the rows without a §, and the PDF caveat. What moved where:
 *
 * - **The counts** are pills in each law's header (`DiffGroup`), in §§, and
 *   visible while the group is collapsed. „39 von 46 Paragraphen bestätigt"
 *   was the shown §§ minus the withheld ones, and beside the pills it
 *   invited a sum that could not work: the 46 leaves out the new §§, which
 *   owe no check (115/ME and 32/ME XXVIII).
 * - **The rows without a §** count into their law's „nicht geprüft".
 * - **The PDF caveat** is the credit line's „Zeilenzuordnung:
 *   Begutachtungs-Monitor" (`SectionCredits`), in the grammar of its
 *   „Markierung"; its long form stands at every withheld block, in the
 *   doubtful note and on /so-funktionierts. 48 of 120 annexes of GP XXVIII
 *   are read from the PDF — a rare-warning box would have stood on four in
 *   ten drafts.
 * - **The causes** stood at each withheld block before (`annexWithheldText`),
 *   the Stichtag on /so-funktionierts.
 *
 * **Why silence is safe now.** The line had to be „never empty": silence
 * reads as „checked, nothing to report" — 21 drafts of GP XXVIII until
 * 2026-09-10. A check that did not run now marks every § that owed one as
 * „nicht geprüft" in its header (measured 02.10.2026 over GP XXVIII: 28,
 * 34, 40, 44, 75, 80, 90, 92/ME), so the page is not silent. What the pills
 * cannot say is why, and that is draft-specific and rare: this caveat.
 * Only where a check was owed — an annex of new §§ alone (57, 91/ME) has
 * nothing to check and nothing to report.
 *
 * `notRunReason` is the server's own fragment (`REASON_*` in
 * `server/utils/annex/verdict.ts`), written to follow a colon.
 */
export function annexNotRunNote(v: Verification): string | null {
  // Null verification with `available: true` is not a state the server
  // produces; if it ever did, the honest reading is "no check happened".
  if (!v) return 'Nicht gegen das geltende Recht im RIS geprüft.'
  if (v.judged > 0 || v.uncheckedParagraphs + v.rowsWithoutParagraph === 0) return null
  return v.notRunReason ? `Nicht gegen das geltende Recht im RIS geprüft: ${v.notRunReason}.` : 'Nicht gegen das geltende Recht im RIS geprüft.'
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
  // One clause since 30.09.2026, as at the withheld blocks.
  const cause =
    readFrom === 'pdf'
      ? 'das kann an unserer Lesung des PDF liegen'
      : 'die Beilage dürfte dort einen anderen Stand des Gesetzes zugrunde legen'
  return `Auffällig viele Stellen weichen vom geltenden Text ab bei ${named} – ${cause}.`
}

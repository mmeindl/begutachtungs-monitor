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
 * What the check found, as one status line above the comparison — counts
 * only, joined by „ · ".
 *
 * **Short since 30.09.2026.** Until then this was a sentence of up to five
 * clauses: the Stichtag, every withheld § with its cause, and — beside it —
 * a PDF caveat and a paragraph announcing the Lesefassung. Four paragraphs
 * stood between the heading and the diff. What moved where:
 *
 * - **The causes** stand at each withheld block (`annexWithheldText`,
 *   `annexWithheldBlame`), which is the only place a cause means anything.
 *   The count stays here: in a collapsed group that block is not visible, and
 *   the top line is then the only place the reader learns something is
 *   missing.
 * - **The Stichtag** is provenance — which version of the law was measured
 *   against — and sits in the section's credits since then.
 * - **The PDF caveat** shrinks to a fragment. It stays at the top, because it
 *   says what follows may be our misreading; the long form of whose reading
 *   it may be stands at every withheld block and on /so-funktionierts.
 *
 * The nouns are the ones /so-funktionierts#gegenueberstellung explains:
 * „nicht gezeigt" and „nicht geprüft".
 *
 * **Never empty while the comparison is shown.** Silence on a page that
 * otherwise reports its checks reads as „checked, nothing to report" — 21
 * drafts of GP XXVIII until 2026-09-10. `notRunReason` is the server's own
 * fragment for that case (`REASON_*` in `server/utils/annex/verdict.ts`),
 * written to follow a colon.
 *
 * `rowsWithoutParagraph` is the only quantity that counts rows, not §§:
 * changes the annex attributes to no § at all, so no verdict can reach them.
 * Printed only when there are any — a clause about an empty set is noise.
 */
export function annexCheckNote(v: Verification, readFrom: ReadFrom = null): string {
  const parts: string[] = []
  // Null verification with `available: true` is not a state the server
  // produces; if it ever did, the honest reading is "no check happened".
  if (!v || v.judged === 0) {
    const why = v?.notRunReason
    parts.push(why ? `Nicht gegen das geltende Recht im RIS geprüft: ${why}` : 'Nicht gegen das geltende Recht im RIS geprüft')
  } else {
    parts.push(`${v.verified} von ${v.judged} geprüften Paragraphen halten dem geltenden Recht im RIS stand`)
  }
  // Also where nothing could be judged: an annex that only inserts §§ can
  // still put text into one the draft never wrote, and a right-column rule
  // withholds it. „Nicht geprüft" while quietly dropping a § would be the
  // silence this line exists to end.
  if (v && v.withheldParagraphs > 0) parts.push(`${v.withheldParagraphs} nicht gezeigt`)
  if (v && v.judged > 0 && v.uncheckedParagraphs > 0) parts.push(`${v.uncheckedParagraphs} nicht geprüft`)
  if (v && v.rowsWithoutParagraph > 0) {
    parts.push(`${v.rowsWithoutParagraph} ${v.rowsWithoutParagraph === 1 ? 'Änderung' : 'Änderungen'} ohne Paragraphenangabe, nicht geprüft`)
  }
  if (readFrom === 'pdf') parts.push('Zeilenzuordnung aus dem PDF erschlossen, ohne Gewähr')
  return parts.join(' · ')
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
 * The three tables are the only place the causes are worded client-side.
 */
const WITHHELD_FINDING: Record<AnnexWithheldCause, string> = {
  standing: 'der geltende Text dieser Stelle steht so nicht im RIS.',
  alreadyStanding: 'die vorgeschlagene Fassung zeigt Text als neu, der im RIS schon gilt.',
  notInDraft: 'die vorgeschlagene Fassung enthält Text, den der Entwurf für diesen Paragraphen nicht anordnet.',
}
const WITHHELD_FROM_PDF: Record<AnnexWithheldCause, string> = {
  standing: 'Das kann daran liegen, dass wir die Zeilen des PDF falsch einander zugeordnet haben, oder daran, dass die Beilage einen anderen Stand des Gesetzes zugrunde legt.',
  alreadyStanding: 'Das kann daran liegen, dass unsere Lesung der linken Spalte hier Text verloren hat, oder daran, dass die Beilage einen anderen Stand des Gesetzes zugrunde legt.',
  notInDraft: 'Das kann daran liegen, dass wir beim Lesen des PDF Text aus einer Nachbarzeile in die rechte Spalte gezogen haben, dass der Entwurf diese Änderung an einer anderen Stelle anordnet, oder dass die Beilage nicht zu seinem Gesetzestext passt.',
}
const WITHHELD_FROM_TABLE: Record<AnnexWithheldCause, string | null> = {
  standing: null,
  alreadyStanding: 'In der linken Spalte der Beilage fehlt dieser Text; sie dürfte dort einen anderen Stand des Gesetzes zugrunde legen als das RIS zum Beginn der Begutachtung.',
  notInDraft: 'Entweder ordnet der Entwurf diese Änderung an einer anderen Stelle an, oder die Beilage ist älter als sein Gesetzestext, oder wir haben die Stelle dem falschen Paragraphen zugeordnet.',
}

export function annexWithheldText(cause: AnnexWithheldCause | null): string {
  // No cause recorded is the state every withholding had before 2026-09-10.
  return WITHHELD_FINDING[cause ?? 'standing']
}

export function annexWithheldBlame(cause: AnnexWithheldCause | null, readFrom: ReadFrom): string | null {
  const key = cause ?? 'standing'
  return readFrom === 'pdf' ? WITHHELD_FROM_PDF[key] : WITHHELD_FROM_TABLE[key]
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
  const cause =
    readFrom === 'pdf'
      ? 'Das kann daran liegen, dass wir die Zeilen des PDF falsch einander zugeordnet haben, oder daran, dass die Beilage einen anderen Stand des Gesetzes zugrunde legt.'
      : 'Die Beilage dürfte dort einen anderen Stand des Gesetzes zugrunde legen als das RIS zum Beginn der Begutachtung.'
  return `Auffällig viele Stellen weichen vom geltenden Text ab bei ${named}. ${cause}`
}

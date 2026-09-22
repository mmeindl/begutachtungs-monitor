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
 * Framing rule (CLAUDE.md): every one of them states what was found, never a
 * verdict on the ministry — and where the finding may be OUR reading, it says
 * so first.
 */
import type { AnnexWithheldCause, TextComparisonResponse } from '../../shared/types'
import { formatDateDe } from '../../shared/utils/format'

type Verification = TextComparisonResponse['verification']
type ReadFrom = TextComparisonResponse['readFrom']

/** "bei einem", "bei 3" — the subject of each clause stays singular either way. */
function atCount(n: number): string {
  return n === 1 ? 'bei einem' : `bei ${n}`
}

/**
 * "3 Paragraphen werden nicht gezeigt: bei einem …, bei zwei …" — the total
 * and what stands behind it.
 *
 * The withheld count is split by cause, because "the current version is not
 * in RIS like that" and "it shows text as new that already applies" are two
 * different findings and only the first is about the left column. The split
 * sums to the total by construction (`checkAnnexRows`), and a cause with a
 * count of zero gets no clause.
 */
export function annexWithheldClause(total: number, by: Record<AnnexWithheldCause, number>): string {
  const head = total === 1 ? 'ein Paragraph wird nicht gezeigt' : `${total} Paragraphen werden nicht gezeigt`
  const causes: string[] = []
  if (by.standing > 0) causes.push(`${atCount(by.standing)} steht die geltende Fassung so nicht im RIS`)
  if (by.alreadyStanding > 0) causes.push(`${atCount(by.alreadyStanding)} zeigt die vorgeschlagene Fassung Text als neu, der schon gilt`)
  if (by.notInDraft > 0) {
    // "sie" only where the clause before it named the vorgeschlagene Fassung.
    const subject = by.alreadyStanding > 0 ? 'sie' : 'die vorgeschlagene Fassung'
    causes.push(`${atCount(by.notInDraft)} enthält ${subject} Text, den der Entwurf für diese Paragraphen nicht anordnet`)
  }
  return causes.length > 0 ? `${head}: ${causes.join(', ')}` : head
}

/**
 * What the check found, in two sentences — and, where it found nothing, that
 * it found nothing.
 *
 * **Both columns are held to something (2026-09-10).** The left one claims to
 * be the law in force and RIS holds that text independently; the right one
 * must not show as new what already stands in the §, and what it does show as
 * new has to occur in the draft's own Gesetzestext
 * (`server/utils/annex/verdict.ts`). Saying
 * so is not a disclaimer — it is the difference between a comparison the
 * reader can rely on and one they cannot, and the count of what was withheld
 * is the honest part of it.
 *
 * **Never empty while the comparison is shown.** Until 2026-09-10 this fell
 * silent whenever no § could be judged — 21 drafts of GP XXVIII — and silence
 * on a page that otherwise reports its checks reads as "checked, nothing to
 * report". `notRunReason` is the server's own fragment for that case
 * (`REASON_*` in `server/utils/annex/verdict.ts`, lower-case, joined by
 * "; "), written to follow a colon.
 *
 * **Units, twice over.** `withheldParagraphs` and `uncheckedParagraphs` count
 * §§; the notice inside a block counts rows ("2 Änderungen hier nicht
 * gezeigt"). Both nouns therefore appear here explicitly — "3 Paragraphen
 * werden nicht gezeigt" against "2 Änderungen" — rather than the earlier
 * "Stellen", which read as rows and counted §§. `rowsWithoutParagraph` is the
 * third quantity and the only one that really is rows: changes the annex
 * attributes to no § at all, so no verdict can reach them. It is named as
 * changes, and printed only when there are any — for most drafts it is zero,
 * and a clause about an empty set is noise.
 *
 * §§ that could not be checked are counted, never as a fault: a draft
 * creating new law has no standing text to check against, and only §§ that
 * actually show a change are counted at all (`checkAnnexRows`).
 */
export function annexCheckNote(v: Verification): string {
  // Null verification with `available: true` is not a state the server
  // produces; if it ever did, the honest reading is "no check happened".
  if (!v || v.judged === 0) {
    const why = v?.notRunReason
    const head = why
      ? `Nichts an dieser Gegenüberstellung konnte gegen den geltenden Text im RIS geprüft werden: ${why}`
      : 'Diese Gegenüberstellung wurde nicht gegen den geltenden Text im RIS geprüft'
    // Rare but reachable: no left column was judgeable, and a right-column
    // rule withheld a § all the same — an annex that only inserts §§ and puts
    // text into one that the draft never wrote. Saying "nothing could be
    // checked" while quietly dropping a § would be the silence this sentence
    // exists to end.
    const withheld = v && v.withheldParagraphs > 0 ? `; ${annexWithheldClause(v.withheldParagraphs, v.withheldByCause)}` : ''
    return `${head}${withheld}.`
  }
  /* THE RESULT ONLY, since 18.09.2026 — no longer the method.
   *
   * The sentence „Geprüft wird beides: die geltende Fassung gegen das RIS
   * Bundesrecht …" stood here word for word on every draft page, above the
   * very thing the reader had come for, and it stands in more detail on
   * /so-funktionierts#gegenueberstellung anyway. The link „Wie wir prüfen"
   * has always closed this paragraph and leads exactly there.
   *
   * The Stichtag stays: it is not a method but a statement about THIS check
   * — which version of the law was measured against. */
  const asOf = v.asOf ? ` (Stand ${formatDateDe(v.asOf)}, dem Beginn der Begutachtungsfrist)` : ''
  const parts = [`${v.verified} von ${v.judged} geprüften Paragraphen halten dem geltenden Recht im RIS stand${asOf}`]
  if (v.withheldParagraphs > 0) parts.push(annexWithheldClause(v.withheldParagraphs, v.withheldByCause))
  if (v.uncheckedParagraphs > 0) {
    parts.push(`${v.uncheckedParagraphs} ${v.uncheckedParagraphs === 1 ? 'Paragraph mit Änderungen ließ' : 'Paragraphen mit Änderungen ließen'} sich nicht prüfen`)
  }
  if (v.rowsWithoutParagraph > 0) {
    parts.push(`dazu ${v.rowsWithoutParagraph} ${v.rowsWithoutParagraph === 1 ? 'gezeigte Änderung ohne Paragraphenangabe' : 'gezeigte Änderungen ohne Paragraphenangabe'}, ebenfalls ungeprüft`)
  }
  return `${parts.join('; ')}.`
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

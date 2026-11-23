import { gapDe } from './gaps'

/**
 * What a law text says where the document sets an image: „[Abbildung]".
 *
 * Both readers of the § comparison write it — RIS's `<binary>` (whose
 * `<src>` is a text node, so the file path used to arrive as the law's
 * words) and Parliament's `<img>` (which used to vanish) — so the two
 * sides of a comparison carry the same mark at the same place, and the
 * page can say that the comparison covers the words and not the image
 * (`DiffBody`). Bare, without an `alt` text: the two sources describe an
 * image differently or not at all, and two descriptions of one image would
 * read as a change of the law. The annex's cells name the `alt` text (`annex/tableCells.ts`)
 * and no check there counts the mark (`annex/annexText.ts`).
 */
export const FIGURE_MARK = '[Abbildung]'

/**
 * Said under a change whose text carries the mark: the comparison read the
 * words around the image and not the image, so „unverändert" or a marked
 * word can never be a claim about what the image shows.
 */
export const FIGURE_NOT_COMPARED_DE = gapDe('outOfScope', `Abbildungen vergleicht der Monitor nicht. „${FIGURE_MARK}“ steht, wo das Dokument eine setzt; verglichen sind die Wörter daneben.`)

/**
 * Said under a unit whose text came from a table, in either version
 * (21.11.2026): both readers take a table's cells as paragraphs in the order
 * the document sets them (`risXml.ts`, `parliamentHtml.ts`), so the
 * comparison sees a run of words and not rows and columns. A value that moved
 * to another cell reads as words changed; a row split or joined with the
 * words in the same order reads as nothing.
 */
export const TABLE_AS_TEXT_DE = gapDe('outOfScope', 'Tabellen vergleicht der Monitor als Text, Zelle für Zelle der Reihe nach; Zeilen und Spalten zeigt der Vergleich nicht.')

/**
 * The same two facts at a new law's §, where nothing is compared
 * (23.11.2026). A table prints in its rows and columns (`EnactedTable`); this
 * sentence stands only over one whose grid could not be confirmed against the
 * parse, whose cells then run one after the other. The words stay; the
 * sentence says what they lost and where the original stands.
 */
export const TABLE_IN_LAW_TEXT_DE = gapDe('unreadable', 'Zeilen und Spalten dieser Tabelle ließen sich nicht lesen. Der Monitor zeigt ihre Zellen der Reihe nach; die Tabelle steht im Gesetzestext des Ministeriums.')
export const FIGURE_IN_LAW_TEXT_DE = gapDe('outOfScope', `Abbildungen zeigt der Monitor nicht. „${FIGURE_MARK}“ steht, wo der Gesetzestext des Ministeriums eine setzt.`)

/** The mark, bare or with the annex's `alt` text („[Abbildung: Kamerasymbol]", `annex/tableCells.ts`). */
const FIGURE_MARK_RE = /\[Abbildung(?::[^\]]*)?\]/

/** Whether a text carries the mark. */
export function hasFigure(text: string | null | undefined): boolean {
  return Boolean(text && FIGURE_MARK_RE.test(text))
}

/**
 * The text with every mark taken out — the form a verdict is decided on
 * (19.11.2026). The mark says where an image stands, and the image is not
 * compared, so it must not decide „geändert" either: a Land's draft read
 * from PDF carries no mark where the Landesgesetzblatt from RIS sets one,
 * and Salzburg's units came out „geändert" by „+[Abbildung]" alone, under
 * the note that only the words around it were compared (`compareKey`,
 * `isEditorialChange`).
 */
export function withoutFigures(text: string): string {
  return text.replace(FIGURE_MARKS_RE, ' ')
}

const FIGURE_MARKS_RE = new RegExp(FIGURE_MARK_RE.source, 'g')

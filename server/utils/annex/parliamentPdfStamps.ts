/**
 * Parliament's three margin stamps, taken off the pages of its PDF copy of an
 * annex before the geometry reads them.
 *
 * Parliament sets on every page of a document it publishes, turned against
 * the text and at the outer edge: the page count („3 von 26"), the item
 * („10 der Beilagen XXVIII. GP - Regierungsvorlage - Textgegenüberstellung")
 * and its address. RIS's copy of a ministry's annex carries none of them,
 * which is why the reader never had to know them. Read as text they land in
 * the columns, as words of the law, and being turned they count against the
 * page's frame: a short page holds so few runs that three of them exceed the
 * share `isProven` allows (`annexPdf.ts`), and the whole page was refused.
 *
 * A run goes only if BOTH hold: its text is exactly a stamp's, and it stands
 * in the outer margin. The count of runs that disagree with the page's frame
 * shrinks by the runs taken, so that gate still judges what is left.
 *
 * PURE MODULE — no Nitro, so the corpus script runs the same step.
 */
import type { AnnexPage } from './annexPdf'

/** The three stamps, whole: a law's text can say „3 von 26", never at the page's edge. */
const STAMP_RE = /^(?:\d+ von \d+|\d+ der Beilagen\b.*\bGP\b.*|www\.parlament\.gv\.at)$/

/** How far from the page's edge a stamp stands; the columns start further in. */
const MARGIN_PT = 45

export function withoutParliamentStamps(pages: readonly AnnexPage[]): AnnexPage[] {
  return pages.map((page) => {
    const items = page.items.filter((item) => !((item.x < MARGIN_PT || item.x > page.width - MARGIN_PT) && STAMP_RE.test(item.text.trim())))
    const removed = page.items.length - items.length
    if (removed === 0) return page
    return {
      ...page,
      items,
      geometry: {
        ...page.geometry,
        runs: page.geometry.runs - removed,
        offTurn: Math.max(0, page.geometry.offTurn - removed),
      },
    }
  })
}

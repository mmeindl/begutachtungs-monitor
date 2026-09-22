/**
 * An annex PDF's bytes → its positioned text runs (docs/api-exploration.md §2c).
 *
 * The one place pdf.js is called. `annexPdf.ts` deliberately never opens a
 * file — it reads the geometry, which is what makes it testable without a
 * fixture binary — so this is the seam between the two, and it is shared by
 * the request path and both harnesses rather than copied into each.
 *
 * No Nitro globals here on purpose: `vite-node` has to be able to import it
 * for the harnesses. The caching sits one layer up, in `annexPdfService.ts`.
 *
 * **pdf.js is imported dynamically**, and that is a memory decision rather
 * than a style one. It is 1,7 MB of the 7 MB server bundle, and only 44 of
 * the 132 GP-XXVIII drafts need it — a static import would parse and hold it
 * for every request to every page, on a one-gigabyte VPS whose warm baseline
 * is 90 MB.
 *
 * **The page is uprighted here, not downstream.** `uprightRuns` is exported
 * and pure so the rotation can be tested without a fixture binary.
 */
import type { AnnexItem, AnnexPage } from './annexPdf'

/* eslint-disable @typescript-eslint/no-explicit-any */

/** pdf.js's affine matrix, [a, b, c, d, e, f] — x' = ax + cy + e, y' = bx + dy + f. */
type Matrix = readonly [number, number, number, number, number, number]

function compose(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ]
}

/** One text run as pdf.js hands it over. */
export interface RawRun {
  transform: readonly number[]
  width: number
  text: string
}

/** The page box pdf.js reports, with the transform that puts /Rotate into it. */
interface RawViewport {
  transform: readonly number[]
  width: number
  height: number
}

const QUARTER = Math.PI / 2
/**
 * A baseline further off a quarter turn than this is skewed rather than
 * turned. Over the 3.213 pages of the 114 GP-XXVIII annexes not one run is
 * skewed at all, so the number decides nothing today; it exists because a
 * skewed page is read wrong *silently* — the words are real and only their
 * arrangement is ours — and the parse has to be able to refuse it.
 */
const SKEW_TOLERANCE = Math.PI / 180

/**
 * pdf.js's runs for one page → upright runs, y growing upward.
 *
 * **Two things rotate a page, and only one of them is `/Rotate`.** The UWG
 * annex of GP XXVIII sets `/Rotate 0` and rotates the *text matrix* instead:
 * every run reads `[0, 9.96, -9.96, 0, x, y]`, so the baseline runs along the
 * y axis and the two columns come out stacked — "Geltende Fassung" at
 * (121, 215) and "Vorgeschlagene Fassung" at (121, 537) sit on one line, not
 * in two columns. Taking `transform[4]`/`[5]` raw turned that annex into a
 * stack of nonsense lines and two rows of shuffled words shown as new law
 * ("mit Zeit eine nicht oder bzw. Bilder, der Etiketten, Recht Text, Marken",
 * 2026-09-10). So the run's own baseline direction decides the frame, and
 * `viewport.transform` — which carries `/Rotate` — is composed in first, so
 * both causes are handled by the same arithmetic.
 *
 * **The frame is PDF user space: origin bottom-left, y upward.** Viewport
 * space runs y downward; `annexPdf.ts` sorts baselines with `b.y - a.y` and
 * every fixture in `annexPdf.test.ts` places text with y upward, so the flip
 * is undone here and the convention is stated once, in `AnnexItem`.
 *
 * Only quarter turns are handled: the angle is rounded to the nearest 90°,
 * and a page whose runs disagree keeps the majority's frame. That decision is
 * **reported rather than swallowed**: how many runs the page carries, how many
 * disagreed with the frame it was read in, and how many are skewed off any
 * quarter turn go onto the page as `geometry`, so `parseAnnexPdf` can refuse a
 * page instead of reading it wrong. A page read in the wrong frame produces
 * real words in an arrangement of ours, and nothing downstream would notice.
 *
 * The run's `width` is its advance *along the baseline*, so a quarter turn at
 * scale 1 leaves it unchanged; it is carried over as it is.
 */
export function uprightRuns(runs: readonly RawRun[], viewport: RawViewport): AnnexPage {
  const vp = viewport.transform as Matrix
  const placed = runs.map((run) => ({ m: compose(vp, run.transform as Matrix), width: run.width, text: run.text }))

  const turns = new Map<number, number>()
  let withText = 0
  let skewed = 0
  for (const run of placed) {
    if (!run.text.trim()) continue
    withText++
    const angle = Math.atan2(run.m[1], run.m[0])
    const nearest = Math.round(angle / QUARTER)
    if (Math.abs(angle - nearest * QUARTER) > SKEW_TOLERANCE) skewed++
    const quarter = (((nearest % 4) + 4) % 4)
    turns.set(quarter, (turns.get(quarter) ?? 0) + 1)
  }
  const majority = [...turns].sort((a, b) => b[1] - a[1])[0] ?? [0, 0]
  const quarter = majority[0]
  const cos = Math.round(Math.cos(quarter * QUARTER))
  const sin = Math.round(Math.sin(quarter * QUARTER))
  // Rotate by -θ so the reading direction becomes +x, then flip y so the page
  // reads bottom-up like PDF user space.
  const place = (x: number, y: number): { x: number; y: number } => ({ x: x * cos + y * sin, y: x * sin - y * cos })

  // The page box, through the same mapping, so the content lands back inside
  // [0, width] however the page was turned.
  const corners = [place(0, 0), place(viewport.width, 0), place(viewport.width, viewport.height), place(0, viewport.height)]
  const minX = Math.min(...corners.map((c) => c.x))
  const minY = Math.min(...corners.map((c) => c.y))
  const width = Math.max(...corners.map((c) => c.x)) - minX

  const items: AnnexItem[] = placed.map((run) => {
    const at = place(run.m[4], run.m[5])
    return { x: at.x - minX, y: at.y - minY, width: run.width, text: run.text }
  })
  return { width, items, geometry: { runs: withText, offTurn: withText - majority[1], skewed } }
}

/**
 * Every text run of every page, upright, in PDF user space.
 *
 * A run without a string `str` is a marked-content marker, not text.
 */
export async function pagesOf(bytes: Uint8Array): Promise<AnnexPage[]> {
  const { getDocumentProxy } = await import('unpdf')
  const doc = await getDocumentProxy(bytes)
  const pages: AnnexPage[] = []
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n)
    const viewport = page.getViewport({ scale: 1 })
    const content = await page.getTextContent()
    const runs: RawRun[] = content.items
      .filter((i: any) => typeof i.str === 'string')
      .map((i: any) => ({ transform: i.transform, width: i.width ?? 0, text: i.str }))
    pages.push(uprightRuns(runs, { transform: viewport.transform, width: viewport.width, height: viewport.height }))
  }
  return pages
}

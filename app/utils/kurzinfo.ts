/**
 * Parliament's Kurzinformation of a Ministerialentwurf, as the draft page
 * renders it under „Worum geht es?".
 */
import type { DescriptionBlock } from '#shared/types'

const MAIN_POINTS_RE = /^Hauptgesichtspunkte\b/

/**
 * The Kurzinformation without its „Hauptgesichtspunkte" section — from that
 * heading up to the next one.
 *
 * On most drafts that section is the Allgemeiner Teil of the Erläuterungen
 * in shorter words, and that part stands in „Was das Ressort begründet"
 * further down, from the ministry's own document. Two versions of one text
 * on one page (30.09.2026), so the page drops it where the Erläuterungen are
 * there to carry it — a decision the CALLER makes; this only cuts. Ziele and
 * Inhalt stay as the quick overview.
 */
export function withoutMainPoints(blocks: readonly DescriptionBlock[]): DescriptionBlock[] {
  const out: DescriptionBlock[] = []
  let skipping = false
  for (const block of blocks) {
    if (block.kind === 'heading') skipping = MAIN_POINTS_RE.test(block.text)
    if (!skipping) out.push(block)
  }
  return out
}

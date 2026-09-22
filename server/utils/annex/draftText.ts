/**
 * How the draft's own Gesetzestext is read as one string.
 *
 * PURE MODULE — relative imports only, so vitest runs it directly.
 *
 * `LawUnit.text` drops the Gliederungssymbole — it is the ME→RV comparison's
 * text, where a renumbered § has to compare equal. Here the marker IS text:
 * the annex prints „§ 5a." in the column it shows as new, so the draft has to
 * be allowed to have written it.
 *
 * One function for both readers, and that is the point rather than the
 * saving: `annexCheck` reads the whole draft with it, `annexDraft` one unit,
 * and only because they read identically is every per-§ bag a *subset* of the
 * whole-draft bag — which is what makes the narrower reference strictly
 * stronger and never differently wrong (`annexDraft.ts`).
 */
import type { TextBlock } from '../lawtext/lawUnits'

/** The blocks as one string, `gld` included. */
export function draftTextOf(blocks: readonly TextBlock[]): string {
  return blocks.map((b) => `${b.gld ?? ''} ${b.text}`).join(' ')
}

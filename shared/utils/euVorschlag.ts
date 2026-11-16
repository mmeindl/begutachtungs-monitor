/**
 * Where a proposal of the Commission stands, and what its address answers
 * — decided from what the Cellar records (step 3 of the EU cycle,
 * 15.11.2026). No words here: the page's are in `app/utils/euVorschlag.ts`.
 *
 * WHICH FLAGS DECIDE (docs/decisions.md, „The stand of a proposal"). The
 * Cellar sets three flags on a proposal's dossier — pending, withdrawn,
 * adopted — and they contradict each other in one dossier since 2019. So
 * no flag decides alone: an act needs the adopted flag AND an act the
 * dossier produced; a withdrawal with a day needs the Commission's dated
 * step; a flag alone counts only where it is the ONLY one set. Missing or
 * contradicting flags claim no stand beyond the steps. The Cellar's
 * separate „file-status" is not read at all (`cellarVorschlag.ts`).
 *
 * Pure module: auto-imported in `app/`, imported relatively by vitest and
 * the server.
 */
import type { EuProposalRecord, EuProposalStand } from '../types/eu'

/** The day of the last step the Cellar dates on any of the proposal's dossiers; null where none is dated. */
export function euProposalLastStep(r: EuProposalRecord): string | null {
  return r.dossiers.map((d) => d.lastStep).filter((d): d is string => d !== null).sort().at(-1) ?? null
}

/** Every act the proposal's dossiers produced, ascending, each once. */
export function euProposalActs(r: EuProposalRecord): string[] {
  return [...new Set(r.dossiers.flatMap((d) => d.acts))].sort()
}

/**
 * The stand, by these rules in this order (`EuProposalStand`):
 *
 * 1. the adopted flag on a dossier, and at least one act produced → `rechtsakt`;
 * 2. the Commission's withdrawal with a day → `zurueckgezogen`;
 * 3. the withdrawn flag as the only flag set, no dated step → `zurueckgezogen-undatiert`;
 * 4. the pending flag as the only flag set → `anhaengig`, with the last step's day;
 * 5. anything else — no flag, or two at once → `unklar`.
 *
 * With several dossiers the flags are taken together: a flag is set where
 * any dossier sets it.
 */
export function euProposalStandOf(r: EuProposalRecord): EuProposalStand {
  if (!r.dossiers.length) return { kind: 'ohne-verfahren' }
  const acts = euProposalActs(r)
  const lastStep = euProposalLastStep(r)
  const set = (k: 'pending' | 'withdrawn' | 'adopted') => r.dossiers.some((d) => d.flags[k] === true)
  const adopted = set('adopted')
  const withdrawn = set('withdrawn')
  const pending = set('pending')
  if (adopted && acts.length) return { kind: 'rechtsakt', acts }
  const withdrawal = r.dossiers.map((d) => d.withdrawn).filter((d): d is string => d !== null).sort().at(-1)
  if (withdrawal) return { kind: 'zurueckgezogen', date: withdrawal }
  const only = [adopted, withdrawn, pending].filter(Boolean).length === 1
  if (only && withdrawn) return { kind: 'zurueckgezogen-undatiert' }
  if (only && pending) return { kind: 'anhaengig', lastStep }
  return { kind: 'unklar', lastStep, acts }
}

/**
 * The act's page a proposal's address answers 301 to (the plan's „The
 * addresses": a weaker address answers 301 to the stronger one on a
 * verified join). The join is the dossier's own link to the act it
 * produced; it is verified only where it names exactly ONE act and the
 * monitor has a page for it. Several acts (COM(2023) 148 → a directive and
 * a regulation): the proposal's page stays and links each. Null otherwise.
 */
export function euProposalRedirect(acts: readonly { celex: string; path: string | null }[]): string | null {
  return acts.length === 1 ? acts[0]!.path : null
}

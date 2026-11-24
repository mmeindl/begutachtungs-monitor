/**
 * The first-sight record (24.11.2026, `kons.ts --erstsicht`,
 * `scripts/harness/firstSight.json`): what the page composed for a draft the
 * first time a round met the law that came of it, kept as it was, and held
 * against RIS in every round after.
 *
 * WHY. The bench scores every law of the period against RIS, and every fault
 * it finds is fixed. After the fix, the law that showed the fault passes, so
 * the figures on `/genauigkeit` are figures after the fixes: 681 of 684 on
 * the draft path in the round of 24.11.2026, on laws the engine had been
 * corrected on. How often the page is right on a law nobody corrected it on
 * says how far a reader can trust a draft in its Begutachtung, and it cannot
 * be measured afterwards: once a round has compared a law and its fault is
 * fixed, the law is no longer unseen. Freezing the rules under a tag
 * (proposed 23.11.2026, dropped 24.11.2026) would measure a version of the
 * code nobody runs; this keeps the output of the code that ran.
 *
 * WHAT IS KEPT. The page's text, never a verdict: each § the page showed, as
 * its segments, with the commit that composed it. Every round scores the
 * kept text with the round's own measurement. A fix to the measurement (which
 * RIS version is the answer, which § is comparable) therefore applies to it;
 * a fix to the engine does not, and a § the engine got wrong at first sight
 * stays wrong here.
 *
 * WHEN. A draft is kept by the first round that joins it to a law. The join
 * runs through RIS's amendment history (`loadOracle`), so that is after RIS
 * has consolidated the law, and it is the first comparison with RIS: the text
 * is composed before anyone could correct the engine on it. That holds only
 * while no one runs the bench on a law newer than the last round outside a
 * round. Only drafts all of whose laws were published on or after `since`
 * are kept; every law before is in the figures after the fixes.
 *
 * NEVER EDITED BY HAND. The builder (`scripts/harness/genauigkeit.ts`) appends
 * what a round kept, and only after the round passed. A draft leaves only
 * through `removed`, with why (a draft joined to the wrong law, say), and is
 * never kept again.
 *
 * Pure, so it is held by `tests/firstSight.test.ts`.
 */
import type { LawDiffSegment } from '../../shared/types/common'
import type { ConsolidatedParagraph } from '../../shared/types/annex'
import type { DraftPathRecord } from './konsDraftPath'

/** A segment as kept: „=" in both texts, „-" removed, „+" inserted. */
export type KeptSegment = ['=' | '-' | '+', string]

/** One § the page showed for the draft. */
export interface KeptParagraph {
  /** `annexLaw`: the annex's law line, null where the draft amends one law. */
  law: string | null
  id: string
  heading: KeptSegment[] | null
  text: KeptSegment[]
}

/** One draft as the page composed it at first sight. */
export interface KeptDraft {
  /** The RIS Begut record. */
  record: string
  /** „123/ME" */
  me: string
  /** The Bundesgesetzblätter the draft was joined to in that round, „110/2026". */
  bgbl: string[]
  /** The day of the round that kept it. */
  seen: string
  /** The commit that composed it. */
  commit: string
  /** Why the page could not compose the draft; it then has no paragraphs, and counts as failed. */
  failed?: string
  paragraphs: KeptParagraph[]
}

export interface FirstSightFile {
  /** Drafts whose laws were all published on or after this day. */
  since: string
  drafts: KeptDraft[]
  removed: { record: string; why: string }[]
}

/** What `kons.ts --erstsicht` writes into its record, under `firstSight`. */
export interface FirstSightRound {
  since: string
  /** The drafts the file held when the round read it. */
  held: string[]
  /** Held drafts the round could not join to a law again: no score for them. */
  unscored: string[]
  /** The held drafts and the ones kept in this round, scored with their kept text. */
  scored: DraftPathRecord
  /** Drafts met for the first time in this round. */
  captured: KeptDraft[]
}

const CODE = { equal: '=', removed: '-', inserted: '+' } as const
const TYPE = { '=': 'equal', '-': 'removed', '+': 'inserted' } as const

export function keptParagraph(p: Pick<ConsolidatedParagraph, 'id' | 'annexLaw' | 'segments' | 'headingSegments'>): KeptParagraph {
  const pack = (segments: readonly LawDiffSegment[]): KeptSegment[] => segments.map((s) => [CODE[s.type], s.text])
  return { law: p.annexLaw, id: p.id, heading: p.headingSegments ? pack(p.headingSegments) : null, text: pack(p.segments) }
}

/** The kept § in the shape the draft path scores. */
export function shownParagraph(p: KeptParagraph): Pick<ConsolidatedParagraph, 'id' | 'annexLaw' | 'segments' | 'headingSegments'> {
  const unpack = (kept: readonly KeptSegment[]): LawDiffSegment[] => kept.map(([code, text]) => ({ type: TYPE[code], text }))
  return { id: p.id, annexLaw: p.law, segments: unpack(p.text), headingSegments: p.heading ? unpack(p.heading) : null }
}

/**
 * Whether this round keeps the draft: joined to at least one law, every one
 * published on or after `since`, and never kept or removed before. A draft
 * with a law from before `since` was scored before, and is not unseen.
 */
export function isFirstSight(record: string, published: readonly string[], file: FirstSightFile): boolean {
  if (published.length === 0) return false
  if (file.drafts.some((d) => d.record === record) || file.removed.some((r) => r.record === record)) return false
  return published.every((day) => day >= file.since)
}

/**
 * The file with this round's drafts appended, or every reason the round may
 * not touch it. Running the builder twice on one round appends once.
 */
export function fileAfterRound(file: FirstSightFile, round: FirstSightRound | undefined): { file: FirstSightFile } | { refusals: string[] } {
  if (!round) return { refusals: ['kons.json carries no first-sight record (no "firstSight"): run kons.ts with --erstsicht'] }
  const refusals: string[] = []
  if (!/^\d{4}-\d{2}-\d{2}$/.test(file.since)) refusals.push(`the first-sight file starts on „${file.since}", not a day`)
  if (round.since !== file.since) refusals.push(`kons.json read a first-sight record from ${round.since}, the file starts ${file.since}`)
  const kept = new Map<string, KeptDraft>()
  for (const d of file.drafts) {
    if (kept.has(d.record)) refusals.push(`the first-sight file keeps draft ${d.me} twice`)
    kept.set(d.record, d)
  }
  const removed = new Set(file.removed.map((r) => r.record))
  for (const r of file.removed) if (kept.has(r.record)) refusals.push(`the first-sight file keeps draft ${kept.get(r.record)!.me} and names it removed`)
  const held = new Set(round.held)
  const captured = new Map(round.captured.map((d) => [d.record, d]))
  for (const [record, d] of kept) if (!held.has(record) && !captured.has(record)) refusals.push(`the first-sight file keeps draft ${d.me}, which the round did not read: the file changed after the round`)
  for (const record of held) if (!kept.has(record) && !removed.has(record)) refusals.push(`the round read draft ${record}, which the first-sight file neither keeps nor names removed`)
  for (const record of round.unscored) refusals.push(`first sight: draft ${kept.get(record)?.me ?? record} is kept, but the round could not join it to its law again: read why, then fix the join or remove it with a reason`)
  const appended: KeptDraft[] = []
  for (const d of round.captured) {
    if (removed.has(d.record)) refusals.push(`first sight: draft ${d.me} was removed and is never kept again`)
    else if (kept.has(d.record)) {
      if (JSON.stringify(kept.get(d.record)) !== JSON.stringify(d)) refusals.push(`first sight: draft ${d.me} is kept already with another text; a first sight is kept once`)
    } else appended.push(d)
  }
  if (refusals.length) return { refusals }
  return { file: { ...file, drafts: [...file.drafts, ...appended] } }
}

/** One segment per line, so the diff a reader checks before committing shows each kept text as it reads. */
export function formatFirstSight(file: FirstSightFile): string {
  const json = JSON.stringify(file, null, 1).replace(/\[\n\s*"([=+-])",\n\s*("(?:[^"\\]|\\.)*")\n\s*\]/g, '["$1", $2]')
  return `${json}\n`
}

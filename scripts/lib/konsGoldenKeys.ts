/**
 * The format a recorded Lesefassung run is written and replayed in
 * (`ci/konsGoldenRecord.ts`, `tests/konsGolden.test.ts`) — shared for the
 * reason `gateGoldenKeys.ts` gives: recorder and replay must agree on what
 * identifies a question and how an answer is stored.
 */
import type { ConsolidatedTextResponse } from '../../shared/types'
import type { ComparisonRow } from '../../server/utils/annex/comparisonRows'
import type { DraftRendition } from '../../server/utils/kons/draftWitness'
import type { ClauseName } from '../../server/utils/lawtext/draftArticles'
import type { KonsLawAtDate, KonsParagraphRef } from '../../server/utils/ris/konsLaw'
import { compactLaw, expandLaw, type RecordedLaw } from './gateGoldenKeys'

export const lawKey = (organ: string, nummer: string, date: string, title: string, clause: ClauseName | null): string =>
  `${organ}|${nummer}|${date}|${title}|${clause ? `${clause.name}|${clause.abbreviation ?? ''}` : ''}`

/**
 * A resolved law as `RecordedLaw` keeps it, with the §§ `standingOnDay`
 * replaced. A ref the run never fetched comes back with an XML address no
 * recording holds, so `consolidate` asks for it and the replay throws —
 * `expandLaw`'s stub carries none, and `consolidate` would skip such a §
 * as one RIS gives no XML for, silently. A ref without XML in RIS is kept
 * whole for the same reason.
 */
export interface RecordedKonsLaw extends RecordedLaw {
  superseded?: KonsLawAtDate['superseded']
}

export const UNRECORDED_XML = 'nicht-aufgezeichnet'

export function compactKonsLaw(law: KonsLawAtDate, fetched: (ref: KonsParagraphRef) => boolean): RecordedKonsLaw {
  return { ...compactLaw(law, (ref) => !ref.xmlUrl || fetched(ref)), ...(law.superseded ? { superseded: law.superseded } : {}) }
}

export function expandKonsLaw(rec: RecordedKonsLaw): KonsLawAtDate {
  const law = expandLaw(rec)
  for (const label of rec.labels) if (!rec.refs[label]) law.paragraphs[label]!.xmlUrl = UNRECORDED_XML
  return rec.superseded ? { ...law, superseded: rec.superseded } : law
}

export interface KonsFixture {
  cite: string
  path: 'xml' | 'pdf'
  asOf: string
  draftXml: string
  recorded: {
    resolveLaw: Record<string, RecordedKonsLaw | null>
    /** One § document's XML, by its Normdokumentnummer. */
    paragraphXml: Record<string, string>
    annexRows: ComparisonRow[] | null
    /** Absent where no § came to the second witness. */
    rendition?: DraftRendition | null
  }
  expected: Outcomes
}

/**
 * What the page shows of a run: every § with its outcome — „gezeigt", „vom
 * Zeugen gezeigt" (`draftWitness`) or the cause it is withheld for — and
 * the text of every shown §, heading and body as the reader gets them.
 */
export interface Outcomes {
  notRun: string | null
  touched: number
  outcomes: Record<string, string>
  texts: Record<string, string>
}

const resultText = (segments: readonly { type: string; text: string }[] | null): string =>
  (segments ?? []).filter((s) => s.type !== 'removed').map((s) => s.text).join('').replace(/\s+/g, ' ').trim()

export function outcomesOf(r: ConsolidatedTextResponse): Outcomes {
  const key = (u: { id: string; annexLaw: string | null }): string => `${u.annexLaw ?? '—'} | § ${u.id}`
  const outcomes: Record<string, string> = {}
  const texts: Record<string, string> = {}
  for (const p of r.paragraphs) {
    outcomes[key(p)] = p.draftWitness ? 'vom Zeugen gezeigt' : 'gezeigt'
    texts[key(p)] = [resultText(p.headingSegments), resultText(p.segments)].filter(Boolean).join(' ¶ ')
  }
  for (const w of r.withheld) outcomes[key(w)] = w.cause
  return { notRun: r.notRun, touched: r.touched, outcomes, texts }
}

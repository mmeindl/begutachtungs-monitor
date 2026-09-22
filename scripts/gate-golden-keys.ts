/**
 * The format a recorded gate run is written and replayed in
 * (`gate-golden-record.ts`, `tests/annexGateGolden.test.ts`).
 *
 * Shared rather than written twice: recorder and replay have to agree on what
 * identifies a question and how an answer is stored, and two copies of that
 * rule drift on the day one of them learns a new field.
 */
import type { KonsLawAtDate, KonsParagraphRef } from '../server/utils/risKons'

/**
 * A § is keyed by its Normdokumentnummer and printed label, never by the whole
 * `KonsParagraphRef`. The ref also carries `inkrafttreten` and the amendment
 * that produced the version — fields the gate passes through but never reads,
 * and keying on them would make the fixture fail the day RIS reprints one.
 */
export const resolveKey = (organ: string, nummer: string, date: string, title: string): string => `${organ}|${nummer}|${date}|${title}`
export const standingKey = (ref: KonsParagraphRef): string => `${ref.nor}|${ref.label}`

/**
 * A resolved law, with full refs only for the §§ the run actually asked about.
 *
 * The whole index is what RIS answers, and for the ABGB that is thousands of
 * refs against the handful a draft touches — 646 kB of fixture for one § of
 * drift. But it cannot simply be dropped to the consulted ones either: the
 * gate reads a missing label as "das RIS Bundesrecht führt diese Paragraphen
 * nicht" (`REASON_NO_SUCH_PARAGRAPH`), so a trimmed index would quietly turn
 * a §§ into an unchecked one and the fixture would agree with it.
 *
 * So every label is kept, in the order RIS returned it — `indexOf` is
 * first-wins over `designationKey`, and two labels do collide on one key — and
 * only the refs are thinned. A ref that was never consulted comes back with
 * `STUB_NOR`, so the moment a changed gate asks for it, `standingKey` misses
 * the recording and the replay throws instead of answering.
 */
export interface RecordedLaw {
  gesetzesnummer: string
  kurztitel: string
  /** Every label RIS returned, in its order. */
  labels: string[]
  /** Full refs, by label, for the §§ this run looked up. */
  refs: Record<string, KonsParagraphRef>
}

/** The Normdokumentnummer no recording holds — see `RecordedLaw`. */
export const STUB_NOR = 'nicht-aufgezeichnet'

export function compactLaw(law: KonsLawAtDate, consulted: (ref: KonsParagraphRef) => boolean): RecordedLaw {
  const refs: Record<string, KonsParagraphRef> = {}
  for (const [label, ref] of Object.entries(law.paragraphs)) if (consulted(ref)) refs[label] = ref
  return { gesetzesnummer: law.gesetzesnummer, kurztitel: law.kurztitel, labels: Object.keys(law.paragraphs), refs }
}

export function expandLaw(rec: RecordedLaw): KonsLawAtDate {
  const paragraphs: Record<string, KonsParagraphRef> = {}
  for (const label of rec.labels) {
    paragraphs[label] = rec.refs[label] ?? {
      nor: STUB_NOR,
      label,
      id: '',
      inkrafttreten: null,
      ausserkrafttreten: null,
      kundmachungsorgan: null,
      stammnorm: null,
      gesetzesnummer: rec.gesetzesnummer,
      xmlUrl: null,
    }
  }
  return { gesetzesnummer: rec.gesetzesnummer, kurztitel: rec.kurztitel, paragraphs }
}

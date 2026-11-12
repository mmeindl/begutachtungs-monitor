/**
 * Which federal laws of one Gesetzgebungsperiode reached the
 * Bundesgesetzblatt without a Begutachtung — the rows behind the chip „Ohne
 * Begutachtung" on `/entwuerfe` (,
 * docs/begutachtung-uebersprungen.md).
 *
 * PURE MODULE — relative imports only, so vitest and the measurement script
 * (`scripts/corpus/ohneBegutachtung.ts`) run the same classification.
 *
 * THE UNIT IS THE BGBl I NUMBER, read from RIS, not from Parliament's detail
 * records. RIS keys every Teil-I law by its period and the items it enacts
 * (`BgblAuth.Gesetzgebungsperiode`, `Regierungsvorlage`, `Initiativantrag`),
 * so one period's laws are a filter over the Jahrgang pages the Verordnung
 * join already caches — no detail call per Gegenstand, which is what the
 * offline memo paid (≈ 280 for GP XXVIII). A law reachable from two items
 * (a Vorlage whose Ausschuss absorbed an Antrag) is one record and one row.
 *
 * FOUR CLASSES, decided in this order — and every doubt falls towards
 * saying nothing:
 *
 *  - `consulted` — a Ministerialentwurf stands behind it: one of its
 *    Vorlagen is linked from a draft's stage record (any period's draft —
 *    a carry-over names the next period's Vorlage), its number is the one a
 *    draft's chain reached, or one of its Anträge carries a consulted
 *    draft's text (`ANTRAG_PATHS`, any `draftShare`: being in the table at
 *    all means a consulted text stands in the Antrag). Wins over everything
 *    when a record names several items.
 *  - `exempt` — the budget procedure (`shared/utils/budgetExempt.ts`): the
 *    hand-kept table, plus one title rule for the years nobody curated.
 *  - `unknown` — none of the above, and the claim cannot be carried: an
 *    Antrag in which a part of a consulted draft's text stands
 *    (`ANTRAG_PARTIAL`, below the table's „belegt" step), a
 *    plausible preceding draft by title (`findPrecedingDraft`, the open
 *    Vorlagen' check), a check that could not run (a list unread, an item
 *    Parliament's list does not hold), or no carrying item at all. Says
 *    nothing, counts nowhere.
 *  - `none` — everything else. Only these become rows, and only these are
 *    counted.
 *
 * WHAT THE LABEL CAN CLAIM: that no Ministerialentwurf we can find preceded
 * the law — a procedural fact, never a reproach. There is no legal duty to
 * hold a Begutachtung, and Stellungnahmen to the Nationalrat stay possible
 * on every Vorlage and Antrag (§ 23b GOG-NR). WHAT IT CANNOT: a draft whose
 * title changed beyond the threshold and whose text took a route the stage
 * records do not link (roughly one in ten such histories, the calibration in
 * `precedingDraft.ts`), or a draft of the period before that the title check
 * does not see.
 */
import type { AntragPath, CommitteeConsultation, DraftSummary } from '../../../shared/types'
import { budgetExemptReason } from '../../../shared/utils/budgetExempt'
import { GP_STARTS, gpEndedOn } from '../../../shared/utils/gp'
import { findPrecedingDraft } from '../parliament/precedingDraft'
import type { BgblRecord } from './bgblJoin'

/**
 * The Jahrgänge a period's laws can be issued in: from the year it convened
 * to the year after it ended (a Beschluss of its last weeks is promulgated
 * in the next period), never past the running one. Null where the calendar
 * has no row for the period.
 */
export function yearsOfPeriod(gp: string, today: string): number[] | null {
  const start = GP_STARTS[gp]
  if (!start) return null
  const now = Number(today.slice(0, 4))
  const end = gpEndedOn(gp)
  const last = Math.min(now, end ? Number(end.slice(0, 4)) + 1 : now)
  const out: number[] = []
  for (let y = Number(start.slice(0, 4)); y <= last; y++) out.push(y)
  return out
}

/** One item of list 101 as the check reads it — a Vorlage or an Antrag. */
export interface ParliamentItem {
  inr: number
  /** „253 d.B.", „408/A". */
  citation: string
  title: string
  /** Einlangen, ISO; '' when upstream has no sortable date. */
  date: string
}

/** What the classification reads, gathered by the caller. */
export interface SkippedLawsInput {
  gp: string
  /** Teil-I records of every Jahrgang the period can reach; filtered here. */
  records: readonly BgblRecord[]
  /**
   * The drafts' chains of every period that can point into `gp` — its own
   * and the one before (carry-over). What is read: the Vorlagen each stage
   * record links (`rvLinks`) and the Kundmachung the chain reached.
   */
  chains: readonly { rvLinks?: readonly { gp: string; inr: number }[]; bgblNumber?: string | null }[]
  /** `ANTRAG_PATHS` — by draft period, then draft number. */
  antragPaths: Readonly<Record<string, Readonly<Record<number, AntragPath>>>>
  /**
   * `ANTRAG_PARTIAL` — by the Antrag's period: Anträge in which a part of a
   * consulted draft's text stands, below the „belegt" step. A doubt, so
   * such a law says nothing (`partial-text`). Optional: absent means none.
   */
  antragPartial?: Readonly<Record<string, readonly number[]>>
  /** List 101's Regierungsvorlagen of `gp`; null where the list could not be read. */
  vorlagen: readonly ParliamentItem[] | null
  /** List 101's selbständige Anträge of `gp`; null where unread. */
  antraege: readonly ParliamentItem[] | null
  /** List 81 of `gp`; null where unread. */
  drafts: readonly DraftSummary[] | null
}

/** The item a row is about — the one whose page it links. */
export interface CarryingItem {
  kind: 'rv' | 'antrag'
  inr: number
  citation: string
}

export type UnknownReason = 'preceding-draft' | 'partial-text' | 'unchecked' | 'no-item' | 'mentions'

export type SkippedClass =
  | { kind: 'consulted'; via: 'vorlage' | 'bgbl' | 'antrag' }
  | { kind: 'exempt'; reason: string }
  | { kind: 'unknown'; reason: UnknownReason }
  | { kind: 'none'; item: CarryingItem; title: string }
  /** No draft either — but the Nationalrat's committee itself invited written
   *  Stellungnahmen (Ausschussbegutachtung, `readCommitteeConsultation`). */
  | { kind: 'committee'; item: CarryingItem; title: string; consultation: CommitteeConsultation }

export interface ClassifiedLaw {
  record: BgblRecord
  class: SkippedClass
}

/** „BGBl. I Nr. 14/2026" and „Bundesgesetzblatt I Nr. 14/2026" → „I 14/2026"; null for anything else. */
export function bgblIKey(nummer: string | null | undefined): string | null {
  const m = /\bI\s+Nr\.\s*(\d+)\s*\/\s*(\d{4})/.exec(nummer ?? '')
  return m ? `I ${m[1]}/${m[2]}` : null
}

/** Is this record a federal law of period `gp`? The corpus, before anything is classified. */
export function isLawOfPeriod(r: BgblRecord, gp: string): boolean {
  return r.teil === 'Teil1' && r.typ === 'Bundesgesetz' && r.gp === gp
}

/** The signals that say a draft stands behind a law, prepared once per period. */
interface ConsultedIndex {
  vorlagen: Set<string>
  bgbl: Set<string>
  antraegeOfPeriod: Set<number>
  antragBgbl: Set<string>
}

function consultedIndex(input: SkippedLawsInput): ConsultedIndex {
  const vorlagen = new Set<string>()
  const bgbl = new Set<string>()
  for (const chain of input.chains) {
    for (const link of chain.rvLinks ?? []) vorlagen.add(`${link.gp}/${link.inr}`)
    const key = bgblIKey(chain.bgblNumber)
    if (key) bgbl.add(key)
  }
  const antraegeOfPeriod = new Set(Object.values(input.antragPaths[input.gp] ?? {}).map((p) => p.antrag.inr))
  // The table is keyed by the DRAFT's period; an Antrag of the next one is
  // still recognised by the Kundmachung it names.
  const antragBgbl = new Set<string>()
  for (const byDraft of Object.values(input.antragPaths)) {
    for (const path of Object.values(byDraft)) {
      const key = bgblIKey(path.antrag.bgblNumber)
      if (key) antragBgbl.add(key)
    }
  }
  return { vorlagen, bgbl, antraegeOfPeriod, antragBgbl }
}

function consultedVia(r: BgblRecord, gp: string, idx: ConsultedIndex): 'vorlage' | 'bgbl' | 'antrag' | null {
  if (r.regierungsvorlagen.some((inr) => idx.vorlagen.has(`${gp}/${inr}`))) return 'vorlage'
  const key = bgblIKey(r.nummer)
  if (key && idx.bgbl.has(key)) return 'bgbl'
  if (r.initiativantraege.some((inr) => idx.antraegeOfPeriod.has(inr))) return 'antrag'
  if (r.initiativantraege.length && key && idx.antragBgbl.has(key)) return 'antrag'
  return null
}

/**
 * One law's class. `idx` and the maps are the period's, built once by
 * `classifySkippedLaws`; exported for nothing else.
 */
function classifyOne(
  r: BgblRecord,
  input: SkippedLawsInput,
  idx: ConsultedIndex,
  vorlagen: Map<number, ParliamentItem> | null,
  antraege: Map<number, ParliamentItem> | null,
): SkippedClass {
  const { gp } = input
  const via = consultedVia(r, gp, idx)
  if (via) return { kind: 'consulted', via }

  const items = [
    ...r.regierungsvorlagen.map((inr) => ({ ityp: 'I' as const, inr })),
    ...r.initiativantraege.map((inr) => ({ ityp: 'A' as const, inr })),
  ]
  const own = items.map((i) => (i.ityp === 'I' ? vorlagen : antraege)?.get(i.inr) ?? null)
  const exempt = budgetExemptReason(gp, items, [r.kurztitel, r.titel, ...own.map((o) => o?.title)])
  if (exempt) return { kind: 'exempt', reason: exempt }

  // A third of a consulted draft's text in the Antrag (09.11.2026): too
  // little to call it consulted, too much to call it „ohne Begutachtung".
  const partial = new Set(input.antragPartial?.[gp] ?? [])
  if (r.initiativantraege.some((inr) => partial.has(inr))) return { kind: 'unknown', reason: 'partial-text' }

  // No item, no page to link and no title to check — a law from an
  // Ausschussantrag, or a record RIS keyed incompletely. Nothing to say.
  if (!items.length) return { kind: 'unknown', reason: 'no-item' }
  // Every item has to be checked: a missing list or a row the list does not
  // hold is a check that did not run, and that never becomes the claim.
  if (!input.drafts || own.some((o) => o === null)) return { kind: 'unknown', reason: 'unchecked' }
  const parliament = own as ParliamentItem[]
  if (parliament.some((o) => findPrecedingDraft(o, input.drafts as DraftSummary[]) !== null)) {
    return { kind: 'unknown', reason: 'preceding-draft' }
  }

  // The row is about the Vorlage where there is one: the government's text,
  // and the item a reader looks for under the law's name.
  const first = items[0]!
  const carrying = parliament[0]!
  return {
    kind: 'none',
    item: { kind: first.ityp === 'I' ? 'rv' : 'antrag', inr: first.inr, citation: carrying.citation },
    title: carrying.title,
  }
}

/** Every federal law of `input.gp` with its class, oldest issue first. */
export function classifySkippedLaws(input: SkippedLawsInput): ClassifiedLaw[] {
  const idx = consultedIndex(input)
  const vorlagen = input.vorlagen ? new Map(input.vorlagen.map((v) => [v.inr, v])) : null
  const antraege = input.antraege ? new Map(input.antraege.map((a) => [a.inr, a])) : null
  const seen = new Set<string>()
  const out: ClassifiedLaw[] = []
  for (const r of input.records) {
    if (!isLawOfPeriod(r, input.gp) || seen.has(r.id)) continue
    seen.add(r.id)
    out.push({ record: r, class: classifyOne(r, input, idx, vorlagen, antraege) })
  }
  return out.sort((a, b) => a.record.datum.localeCompare(b.record.datum) || a.record.nummer.localeCompare(b.record.nummer))
}

/**
 * The documents a mention is looked for in (12.11.2026): every HTML
 * document of the carrying item but its Gesetzestext and its
 * Textgegenüberstellung — the Erläuterungen of a Vorlage, the Antrag with
 * its Begründung. Pure.
 */
export function mentionDocuments(documents: readonly { title: string; formats: readonly { type: string; url: string }[] }[]): string[] {
  return documents
    .filter((d) => !/Gesetzestext|TGÜ|Textgegenüberstellung/i.test(d.title))
    .flatMap((d) => d.formats.filter((f) => f.type === 'html').map((f) => f.url))
}

/** Whether a document's text refers to a Begutachtung at all — any form of the word. Pure. */
export function mentionsBegutachtung(text: string): boolean {
  return /Begutacht/i.test(text)
}

/**
 * The third look at every `none` (12.11.2026): its own text. Where the
 * Erläuterungen or the Antrag mention a Begutachtung(sverfahren), the text
 * itself refers to one — a consulted predecessor, or another law's — and
 * the law says nothing (`unknown`/`mentions`). Measured on GP XXVIII: 2 of
 * 59 (15/A, „im Begutachtungsverfahren geäußerte Bedenken"; 607/A, another
 * law's Begutachtung). `mentionOf` answers `undefined` where a document
 * could not be read: the check did not run, and the law says nothing.
 */
export function refineByMention(
  classified: readonly ClassifiedLaw[],
  mentionOf: (item: CarryingItem) => boolean | undefined,
): ClassifiedLaw[] {
  return classified.map((law) => {
    const c = law.class
    if (c.kind !== 'none') return law
    const mentions = mentionOf(c.item)
    if (mentions === undefined) return { record: law.record, class: { kind: 'unknown', reason: 'unchecked' } }
    return mentions ? { record: law.record, class: { kind: 'unknown', reason: 'mentions' } } : law
  })
}

/**
 * The second look at every `none` (10.11.2026): its carrying item's own
 * Verlauf. A committee that decided to invite written Stellungnahmen ran an
 * Ausschussbegutachtung — a Begutachtung, if not the ministry's — so the law
 * moves to `committee`. `consultationOf` answers `null` where the record
 * shows none and `undefined` where it could not be read: then the check did
 * not run, and the law says nothing (`unknown`/`unchecked`).
 */
export function refineByCommittee(
  classified: readonly ClassifiedLaw[],
  consultationOf: (item: CarryingItem) => CommitteeConsultation | null | undefined,
): ClassifiedLaw[] {
  return classified.map((law) => {
    const c = law.class
    if (c.kind !== 'none') return law
    const consultation = consultationOf(c.item)
    if (consultation === undefined) return { record: law.record, class: { kind: 'unknown', reason: 'unchecked' } }
    if (consultation === null) return law
    return { record: law.record, class: { kind: 'committee', item: c.item, title: c.title, consultation } }
  })
}

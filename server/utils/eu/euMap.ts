/**
 * The EU map: every draft of a period's window whose fact names an EU act,
 * joined with the lists for its dates and its stand — and the three views
 * the routes serve from it (docs/architecture.md §12.66, Nachtrag 3).
 *
 * The facts come from the store (`euMapStore.ts`), the dates and the stand
 * from the CURRENT lists: a Frist that moves, a law that gets promulgated,
 * shows on the next assembly without reading a single document again.
 *
 * Two dates and a stand, never a verdict (rule D6): a row carries when its
 * Begutachtung ran and where its procedure stands, and nothing that ranks
 * one against the deadline.
 *
 * PURE MODULE — relative imports only, no Nitro globals; vitest runs it.
 */
import type {
  BgblOutcome,
  DraftChain,
  EuActDraft,
  EuActHead,
  EuActResponse,
  EuActSummary,
  EuMarker,
  EuPublisher,
  EuRelatedAct,
  EuStand,
  LandCode,
  LandConsultation,
  LandStage,
  RisConsultation,
} from '../../../shared/types'
import { euActPath } from '../../../shared/utils/eu'
import { LAND_CODES, landDraftPath } from '../../../shared/utils/laender'
import { landKey, meKey, risKey, type EuStoreFile } from './euMapStore'

/** One act as one draft names it — the D4 verdict and the base flag are the draft's own. */
export interface EuMapAct {
  celex: string
  isNew: boolean | null
  base: boolean
}

/** One draft in the map: the row of an act page, plus every act the draft names. */
export interface EuMapDraft extends Omit<EuActDraft, 'isNew'> {
  acts: EuMapAct[]
}

/** A period's map, as the derived cache holds it. */
export interface EuMap {
  gp: string
  window: { from: string; to: string | null }
  builtAt: string
  drafts: EuMapDraft[]
  /** Every act a draft of the map names, by CELEX. */
  acts: Record<string, EuActHead>
  /**
   * Publishers the last build could not read whole, plus the Länder whose
   * list could not be read for this assembly — their drafts are missing.
   */
  incomplete: EuPublisher[]
}

/** A Ministerialentwurf as the map joins it: list 81's row, folded. */
export interface MeListing {
  gp: string
  inr: number
  citation: string
  title: string
  arrivedAt: string
  deadline: string | null
}

export interface EuMapInputs {
  gp: string
  window: { from: string; to: string | null }
  store: EuStoreFile
  me: readonly MeListing[]
  /**
   * The station map, where it could be read in time AND the period may be
   * spoken about (`mayClaimOutcome`); null otherwise — then every
   * Ministerialentwurf's stand is unknown, never „Heute".
   */
  chains: Record<number, DraftChain> | null
  ris: readonly RisConsultation[]
  /** The Bundesgesetzblatt outcomes of the RIS half; null where they did not arrive in time. */
  outcomes: Record<string, BgblOutcome> | null
  laender: readonly LandConsultation[]
  /** Länder whose list could not be read for this assembly. */
  unavailableLands: readonly LandCode[]
  /** ISO day, the stand „Heute". */
  today: string
}

/** An act the draft adds — rule D4 true or unknown, and not only the base text of an amendment (D4a). */
export function isImplementing(act: Pick<EuMapAct, 'isNew' | 'base'>): boolean {
  return act.isNew !== false && !act.base
}

/**
 * Where a Ministerialentwurf stands, as its page computes it: the
 * Kundmachung's day; else, once the houses are past the Vorlage, the
 * Bundesrat's or the Nationalrat's Beschluss; else today. Null where the
 * station map was not at hand or does not know the draft — „Heute" for a
 * law that may long be promulgated would be a false statement.
 */
export function standOfMe(chain: DraftChain | undefined, chainsRead: boolean, today: string): EuStand | null {
  if (!chainsRead || !chain) return null
  if (chain.bgblDate) return { date: chain.bgblDate, label: 'Bundesgesetzblatt' }
  const beschluss = chain.bundesratDecidedAt ?? chain.decidedAt ?? null
  if (beschluss && (chain.bgblNumber || chain.station === 'parlament' || chain.station === 'bgbl')) {
    return { date: beschluss, label: 'Beschluss' }
  }
  return { date: today, label: 'Heute' }
}

/** Where a RIS record stands: the Bundesgesetzblatt where its Kundmachung is dated, else today; null without the outcomes. */
export function standOfRis(outcome: BgblOutcome | undefined, outcomesRead: boolean, today: string): EuStand | null {
  if (!outcomesRead) return null
  if (outcome?.state === 'kundgemacht' && outcome.datum) return { date: outcome.datum, label: 'Bundesgesetzblatt' }
  return { date: today, label: 'Heute' }
}

/**
 * Where a Land's draft stands: the Landesgesetzblatt, the Landtag's
 * Beschluss where its stage dates one, else today. Null where the Land's
 * stage could not be read (`'unknown'`).
 */
export function standOfLand(stage: LandStage | null | 'unknown' | undefined, today: string): EuStand | null {
  if (stage === 'unknown') return null
  if (stage?.station === 'bgbl' && stage.date) return { date: stage.date, label: 'Landesgesetzblatt' }
  if (stage?.station === 'parlament' && stage.date) return { date: stage.date, label: 'Beschluss' }
  return { date: today, label: 'Heute' }
}

/**
 * The map: every listed draft whose stored fact is available and carries a
 * marker. A draft without a stored fact is simply absent; the lists still
 * say „read, nothing" for it (`markerOf`).
 */
export function assembleEuMap(inputs: EuMapInputs): EuMap {
  const { store, today } = inputs
  const drafts: EuMapDraft[] = []
  const acts: Record<string, EuActHead> = {}

  const add = (key: string, row: Omit<EuMapDraft, 'key' | 'marker' | 'acts'>): void => {
    const fact = store.entries[key]?.fact
    if (!fact?.available || !fact.marker) return
    const named: EuMapAct[] = []
    for (const a of fact.acts) {
      const path = euActPath(a.celex)
      if (!path) continue
      named.push({ celex: a.celex, isNew: a.isNew, base: a.base })
      const known = acts[a.celex]
      // The first reading wins, unless a later one knows a date the first did not.
      if (!known || (!known.transposition && a.transposition) || (!known.adopted && a.adopted)) {
        acts[a.celex] = {
          celex: a.celex,
          kind: a.kind,
          label: known?.label ?? a.label,
          eurLexUrl: a.eurLexUrl,
          path,
          adopted: known?.adopted ?? a.adopted,
          transposition: known?.transposition ?? a.transposition,
        }
      }
    }
    drafts.push({ key, marker: fact.marker, acts: named, ...row })
  }

  const chainsRead = inputs.chains !== null
  for (const d of inputs.me) {
    add(meKey(d.gp, d.inr), {
      publisher: 'bund',
      path: `/entwuerfe/${d.gp}/${d.inr}`,
      title: d.title,
      citation: d.citation,
      kind: 'gesetz',
      begutachtung: { start: d.arrivedAt || null, end: d.deadline },
      stand: standOfMe(inputs.chains?.[d.inr], chainsRead, today),
    })
  }
  const outcomesRead = inputs.outcomes !== null
  for (const r of inputs.ris) {
    add(risKey(r.id), {
      publisher: 'bund',
      path: `/entwuerfe/${r.id}`,
      title: r.title,
      citation: null,
      kind: r.kind,
      begutachtung: { start: r.startedAt, end: r.deadline },
      stand: standOfRis(inputs.outcomes?.[r.id], outcomesRead, today),
    })
  }
  for (const l of inputs.laender) {
    add(landKey(l.land, landNumberOf(l.id)), {
      publisher: l.land,
      path: landDraftPath(l.land, l.id),
      title: l.title,
      citation: null,
      kind: l.kind,
      begutachtung: { start: l.startedAt, end: l.deadline },
      stand: standOfLand(l.stage, today),
    })
  }

  const incomplete = new Set<EuPublisher>([...store.incomplete, ...inputs.unavailableLands])
  return {
    gp: inputs.gp,
    window: inputs.window,
    builtAt: store.builtAt ?? today,
    drafts,
    acts,
    incomplete: (['bund', ...LAND_CODES] as EuPublisher[]).filter((p) => incomplete.has(p)),
  }
}

/** A Land's own number from its list id (`ooe-2026-16120` → `2026-16120`), as `landDraftPath` cuts it. */
export function landNumberOf(id: string): string {
  return id.slice(id.indexOf('-') + 1)
}

/** The marker of every draft in the map, for the lists' token; a listed draft not in it is `null`. */
export function markersOf(map: EuMap): Map<string, EuMarker> {
  return new Map(map.drafts.map((d) => [d.key, d.marker]))
}

const PUBLISHER_ORDER: readonly EuPublisher[] = ['bund', ...LAND_CODES]

/** Bund first, then the Länder in display order; within a publisher the latest Begutachtung first, undated last. */
function byPublisherThenStart(a: EuActDraft, b: EuActDraft): number {
  const p = PUBLISHER_ORDER.indexOf(a.publisher) - PUBLISHER_ORDER.indexOf(b.publisher)
  if (p) return p
  const sa = a.begutachtung.start
  const sb = b.begutachtung.start
  if (sa !== sb) {
    if (!sa) return 1
    if (!sb) return -1
    return sb.localeCompare(sa)
  }
  return a.key.localeCompare(b.key)
}

/** One act's page: who implements it, who only restates it, which Länder name it nowhere. Null for an act not in the map. */
export function actPageOf(map: EuMap, celex: string): Pick<EuActResponse, 'act' | 'implementing' | 'restating' | 'landsWithout'> | null {
  const act = map.acts[celex]
  if (!act) return null
  const implementing: EuActDraft[] = []
  const restating: EuActDraft[] = []
  const naming = new Set<EuPublisher>()
  for (const d of map.drafts) {
    const own = d.acts.find((a) => a.celex === celex)
    if (!own) continue
    naming.add(d.publisher)
    const { acts: _acts, ...row } = d
    const entry: EuActDraft = { ...row, isNew: own.isNew }
    if (isImplementing(own)) implementing.push(entry)
    else restating.push(entry)
  }
  return {
    act,
    implementing: implementing.sort(byPublisherThenStart),
    restating: restating.sort(byPublisherThenStart),
    landsWithout: LAND_CODES.filter((l) => !naming.has(l)),
  }
}

/**
 * The overview: every act a draft of the window implements, the latest
 * deadline first, acts without one after them by label; counts and Länder
 * from the implementing drafts.
 */
export function actSummariesOf(map: EuMap): EuActSummary[] {
  const counts = new Map<string, { bund: number; laender: number; lands: Set<LandCode> }>()
  for (const d of map.drafts) {
    for (const a of d.acts) {
      if (!isImplementing(a)) continue
      const c = counts.get(a.celex) ?? { bund: 0, laender: 0, lands: new Set<LandCode>() }
      if (d.publisher === 'bund') c.bund++
      else {
        c.laender++
        c.lands.add(d.publisher)
      }
      counts.set(a.celex, c)
    }
  }
  const out: EuActSummary[] = []
  for (const [celex, c] of counts) {
    const act = map.acts[celex]
    if (!act) continue
    out.push({ ...act, counts: { bund: c.bund, laender: c.laender }, lands: LAND_CODES.filter((l) => c.lands.has(l)) })
  }
  return out.sort((a, b) => {
    const da = a.transposition?.deadline ?? null
    const db = b.transposition?.deadline ?? null
    if (da !== db) {
      if (!da) return 1
      if (!db) return -1
      return db.localeCompare(da)
    }
    return a.label.localeCompare(b.label, 'de') || a.celex.localeCompare(b.celex)
  })
}

/**
 * For a draft's own fact: per act it names, the OTHER drafts of the map
 * that implement that act, by publisher. Acts no other draft implements are
 * left out.
 */
export function relatedActsOf(map: EuMap, key: string, celexes: readonly string[]): EuRelatedAct[] {
  const out: EuRelatedAct[] = []
  for (const celex of new Set(celexes)) {
    const act = map.acts[celex]
    if (!act) continue
    const others = { bund: 0, laender: 0 }
    for (const d of map.drafts) {
      if (d.key === key) continue
      const own = d.acts.find((a) => a.celex === celex)
      if (!own || !isImplementing(own)) continue
      if (d.publisher === 'bund') others.bund++
      else others.laender++
    }
    if (others.bund + others.laender > 0) out.push({ celex, path: act.path, others })
  }
  return out
}

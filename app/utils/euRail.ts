/**
 * The rail of an EU act (15.11.2026): the stations of the ACT's life as the
 * Cellar records them — the Commission's proposal, who decided, the Official
 * Journal, and what the act does after it (transposed by the Member States,
 * or in force and applying). A rail of its own on the act's page, not a
 * sixth station of the national one (docs/decisions.md, „Routes to a norm").
 *
 * DATES ONLY, NO VERDICT (rule D6): no duration between two steps, no „it
 * took", no word on whether a deadline has passed. A station that cannot be
 * shown says so in a sentence with its reason; it is never left empty.
 *
 * All German copy of the rail and of the section „Das Verfahren" lives in
 * this one file, so a second language replaces it here. Pure: no Vue; the
 * component places what this returns, the tests read it without one.
 */
import type { EuActResponse, EuProcedure, EuProcedureEvent } from '#shared/types'
import { euOjCiteDe } from '#shared/utils/citations'
import { EU_EVENTS, EU_PROCEDURE_TYPES, type EuEventRole } from '#shared/utils/euEvents'
import { formatDateDe } from '#shared/utils/format'

export type EuRailStationId = 'vorschlag' | 'beschluss' | 'amtsblatt' | 'wirkung'

export interface EuRailStation {
  id: EuRailStationId
  /** „Vorschlag", „Parlament und Rat", „Amtsblatt", „Umsetzung" … */
  name: string
  /** The station the act is on: for an adopted act the last one. Carries the one yellow mark. */
  current: boolean
  /** What the Cellar records at this station, each a fact of the line (`FactLine`). */
  facts: string[]
  /** Why the station cannot be shown (in full or in part), as a sentence; null where nothing is missing. */
  gap: string | null
  /**
   * The section of the page that holds this station, `#eu-verfahren`;
   * null where the page renders no such section — a link never promises
   * a section that is not there.
   */
  anchor: string | null
  /** The station's own record off this site (EUR-Lex, the Legislative Observatory); linked, never fetched. */
  source: { href: string; label: string } | null
}

/** One dated step of the section „Das Verfahren". */
export interface EuRailProcedureRow {
  /** „27.02.2024". */
  date: string
  /** „2024-02-27", for `<time datetime>`. */
  iso: string
  /** The Cellar's own label of the step (`EU_EVENTS`). */
  label: string
}

export interface EuRailProcedureView {
  /** „Das Verfahren" — the section's h2. */
  heading: string
  /** The line over the steps: the procedure number and the type's name, each where the Cellar has it. */
  facts: string[]
  /** The steps the monitor reads, ascending, one row per (label, day). */
  rows: EuRailProcedureRow[]
  /** „Der Cellar verzeichnet 17 weitere Schritte …" — the steps not shown, counted; null where there are none. */
  other: string | null
  /** „2022/0117(COD)"; null where the dossier has no number. */
  reference: string | null
  /** „Ordentliches Gesetzgebungsverfahren"; null where the type is unknown to `EU_PROCEDURE_TYPES`. */
  typeLabel: string | null
  /** The procedure in the Legislative Observatory, with the link's words; null without one. */
  observatory: { href: string; label: string } | null
  /** The credit line's items: the lead word, then the source. */
  credits: string[]
}

export interface EuRailView {
  /** „Der Rechtsakt im Verfahren" — the card's heading and the list's accessible name. */
  heading: string
  stations: EuRailStation[]
  /** The sentence for an act of the Commission, which has no procedure between the institutions; null otherwise. */
  note: string | null
  /** The section „Das Verfahren"; null where there is no procedure or no step to show — then the page renders no section. */
  procedure: EuRailProcedureView | null
  /**
   * „Für einzelne Bestimmungen nennt der Cellar einen eigenen Geltungsbeginn: …"; null without such
   * days. Not „eigene Tage": the word reads as a count of days (rule D6).
   */
  partial: string | null
}

/* ------------------------------------------------------------------ *
 * The words
 * ------------------------------------------------------------------ */

const DE = {
  heading: 'Der Rechtsakt im Verfahren',
  procedureHeading: 'Das Verfahren',
  name: {
    vorschlag: 'Vorschlag',
    'parlament-rat': 'Parlament und Rat',
    rat: 'Rat',
    unbekannt: 'Verfahren',
    amtsblatt: 'Amtsblatt',
    umsetzung: 'Umsetzung',
    geltung: 'Geltung',
  },
  note: 'Rechtsakt der Kommission. Der Cellar verzeichnet dazu kein Verfahren zwischen den Organen.',
  gap: {
    unread: 'Das Verfahren konnte nicht gelesen werden: Der Cellar des Amts für Veröffentlichungen hat nicht geantwortet.',
    unlinkedProposal: 'Der Cellar verknüpft diesen Rechtsakt mit keinem Verfahren; der Vorschlag kann hier nicht gezeigt werden.',
    unlinkedSteps: 'Der Cellar verknüpft diesen Rechtsakt mit keinem Verfahren; die Schritte können hier nicht gezeigt werden.',
    noProposal: 'Der Cellar nennt zu diesem Verfahren keinen Vorschlag der Kommission.',
    proposalBare: 'Der Cellar nennt zum Vorschlag der Kommission weder Nummer noch Datum.',
    noDecision: 'Der Cellar nennt zu diesem Verfahren keinen Beschluss von Parlament oder Rat, den der Monitor liest.',
    noOj: 'Die Fundstelle im Amtsblatt konnte nicht gelesen werden.',
    noDeadline: (kind: 'richtlinie' | 'rahmenbeschluss') => `Der Cellar nennt für ${kind === 'richtlinie' ? 'diese Richtlinie' : 'diesen Rahmenbeschluss'} keine Umsetzungsfrist.`,
    deadlineUnread: 'Die Umsetzungsfrist konnte nicht gelesen werden.',
    inForceUnread: 'Das Inkrafttreten konnte nicht gelesen werden.',
    noInForce: 'Der Cellar nennt kein Datum des Inkrafttretens.',
  },
  proposal: (reference: string, date: string | null) => (date ? `${reference} vom ${date}` : reference),
  parliament: (date: string) => `Parlament ${date}`,
  council: (date: string) => `Rat ${date}`,
  signed: (date: string) => `unterzeichnet ${date}`,
  deadline: (date: string) => `Umsetzungsfrist ${date}`,
  inForce: (date: string) => `in Kraft seit ${date}`,
  appliesSince: (date: string) => `gilt seit ${date}`,
  appliesFrom: (date: string) => `gilt ab ${date}`,
  direct: 'gilt unmittelbar in jedem Mitgliedstaat',
  drafts: (n: number) => (n === 1 ? '1 Entwurf im Monitor' : `${n} Entwürfe im Monitor`),
  other: (n: number) => (n === 1
    ? 'Der Cellar verzeichnet 1 weiteren Schritt dieses Verfahrens, den der Monitor nicht einzeln zeigt.'
    : `Der Cellar verzeichnet ${n} weitere Schritte dieses Verfahrens, die der Monitor nicht einzeln zeigt.`),
  partial: (dates: string[]) => `Für einzelne Bestimmungen nennt der Cellar einen eigenen Geltungsbeginn: ${dates.join(', ')}.`,
  source: {
    proposal: 'Vorschlag auf EUR-Lex',
    observatory: 'Verfahren im Legislative Observatory',
    act: 'Rechtsakt auf EUR-Lex',
  },
  credits: ['Quelle:', 'Cellar des Amts für Veröffentlichungen der Europäischen Union (Metadaten)'],
} as const

/** The section the rail's last station links to: the drafts that implement the act. */
const DRAFTS_ANCHOR = '#eu-umsetzung-heading'
/** The section „Das Verfahren". */
const PROCEDURE_ANCHOR = '#eu-verfahren'

/* ------------------------------------------------------------------ *
 * The builder
 * ------------------------------------------------------------------ */

function roleOf(e: EuProcedureEvent): EuEventRole | null {
  return EU_EVENTS[e.code]?.role ?? null
}

function lastOf(events: readonly EuProcedureEvent[], role: EuEventRole): EuProcedureEvent | null {
  const found = events.filter((e) => roleOf(e) === role)
  return found.length ? found[found.length - 1]! : null
}

/**
 * The section „Das Verfahren": the steps without the Official Journal (its
 * own station) and, for an act of the Commission, without its own adoption
 * (no „Vorschlag" there). Two codes share one label — Parliament's
 * first-reading position in the old and the new vocabulary — so a row is
 * one (label, day).
 */
function procedureViewOf(p: EuProcedure, commission: boolean): EuRailProcedureView | null {
  const seen = new Set<string>()
  const rows: EuRailProcedureRow[] = []
  const sorted = [...p.events].sort((a, b) => a.date.localeCompare(b.date))
  for (const e of sorted) {
    const role = roleOf(e)
    if (!role || role === 'publication') continue
    if (commission && (role === 'proposal' || role === 'amended-proposal')) continue
    const label = EU_EVENTS[e.code]!.label
    const key = `${label}|${e.date}`
    if (seen.has(key)) continue
    seen.add(key)
    rows.push({ date: formatDateDe(e.date), iso: e.date, label })
  }
  if (!rows.length) return null
  const typeLabel = p.type ? EU_PROCEDURE_TYPES[p.type] ?? null : null
  return {
    heading: DE.procedureHeading,
    facts: [p.reference, typeLabel].filter((x): x is string => !!x),
    rows,
    other: p.otherEvents > 0 ? DE.other(p.otherEvents) : null,
    reference: p.reference,
    typeLabel,
    observatory: p.observatoryUrl ? { href: p.observatoryUrl, label: DE.source.observatory } : null,
    credits: [...DE.credits],
  }
}

/**
 * „Vorschlag": each proposal as „COM(2022) 177 vom 27.04.2022", one fact per
 * proposal so two proposals cannot be misread as one number and another's
 * date. A proposal without its own date takes the day of the first adoption
 * step of the Commission — the first proposal only: with two dossiers that
 * step belongs to the earlier one, and a second proposal would borrow a day
 * that is not its own.
 */
function proposalStation(r: EuActResponse, anchor: string | null): EuRailStation {
  const base = { id: 'vorschlag' as const, name: DE.name.vorschlag, current: false, anchor, source: null }
  const rail = r.rail
  if (!rail) return { ...base, facts: [], gap: DE.gap.unread }
  const p = rail.procedure
  if (!p) return { ...base, facts: [], gap: DE.gap.unlinkedProposal }
  const firstProposalEvent = p.events.find((e) => roleOf(e) === 'proposal') ?? null
  if (!p.proposals.length) {
    if (!firstProposalEvent) return { ...base, facts: [], gap: DE.gap.noProposal }
    return { ...base, facts: [formatDateDe(firstProposalEvent.date)], gap: null }
  }
  const facts = p.proposals.flatMap((prop, i) => {
    const iso = prop.date ?? (i === 0 ? firstProposalEvent?.date ?? null : null)
    const date = iso ? formatDateDe(iso) : null
    if (prop.reference) return [DE.proposal(prop.reference, date)]
    return date ? [date] : []
  })
  const href = p.proposals[0]!.eurLexUrl
  return {
    ...base,
    facts,
    gap: facts.length ? null : DE.gap.proposalBare,
    source: href ? { href, label: DE.source.proposal } : null,
  }
}

/** Station 2: who decided, named from the act's authors (`EuAdoptedBy`). */
function decisionStation(r: EuActResponse, anchor: string | null): EuRailStation {
  const rail = r.rail
  const adoptedBy = rail?.adoptedBy ?? 'unbekannt'
  const name = adoptedBy === 'parlament-rat' ? DE.name['parlament-rat'] : adoptedBy === 'rat' ? DE.name.rat : DE.name.unbekannt
  const base = { id: 'beschluss' as const, name, current: false, anchor, source: null }
  if (!rail) return { ...base, facts: [], gap: DE.gap.unread }
  const p = rail.procedure
  if (!p) return { ...base, facts: [], gap: DE.gap.unlinkedSteps }
  const parliament = adoptedBy === 'parlament-rat' ? lastOf(p.events, 'parliament') : null
  const council = lastOf(p.events, 'council')
  const signed = lastOf(p.events, 'signature')
  const facts = [
    ...(parliament ? [DE.parliament(formatDateDe(parliament.date))] : []),
    ...(council ? [DE.council(formatDateDe(council.date))] : []),
    ...(signed ? [DE.signed(formatDateDe(signed.date))] : []),
    ...(p.reference ? [p.reference] : []),
  ]
  return {
    ...base,
    facts,
    gap: parliament || council ? null : DE.gap.noDecision,
    source: p.observatoryUrl ? { href: p.observatoryUrl, label: DE.source.observatory } : null,
  }
}

function journalStation(r: EuActResponse): EuRailStation {
  return {
    id: 'amtsblatt',
    name: DE.name.amtsblatt,
    current: false,
    facts: r.oj ? [euOjCiteDe(r.oj)] : [],
    gap: r.oj ? null : DE.gap.noOj,
    anchor: null,
    source: { href: r.act.eurLexUrl, label: DE.source.act },
  }
}

/**
 * The last station: „Umsetzung" for what the Member States must transpose,
 * „Geltung" for what applies by itself. The deadline is a date, never
 * „passed" or „open" (rule D6). A missing deadline is the Cellar's answer
 * only where the Cellar answered this request (`rail`); without that
 * answer the page claims no absence.
 */
function effectStation(r: EuActResponse, today: string): EuRailStation {
  const kind = r.act.kind
  const n = r.implementing.length
  const drafts = n > 0 ? [DE.drafts(n)] : []
  const base = { id: 'wirkung' as const, current: false, anchor: DRAFTS_ANCHOR, source: null }

  if (kind === 'richtlinie' || kind === 'rahmenbeschluss') {
    const deadline = r.act.transposition?.deadline ?? null
    return {
      ...base,
      name: DE.name.umsetzung,
      facts: [...(deadline ? [DE.deadline(formatDateDe(deadline))] : []), ...drafts],
      gap: deadline ? null : r.rail ? DE.gap.noDeadline(kind) : DE.gap.deadlineUnread,
    }
  }

  const rail = r.rail
  const inForce = rail?.inForce ?? null
  const applies = rail?.applies ?? null
  const facts = [
    ...(inForce ? [DE.inForce(formatDateDe(inForce))] : []),
    ...(applies && applies !== inForce ? [applies <= today ? DE.appliesSince(formatDateDe(applies)) : DE.appliesFrom(formatDateDe(applies))] : []),
    // Art. 288 AEUV: a regulation applies directly; a decision binds only whom it names.
    ...(kind === 'verordnung' ? [DE.direct] : []),
    ...drafts,
  ]
  return {
    ...base,
    name: DE.name.geltung,
    facts,
    gap: !rail ? DE.gap.inForceUnread : inForce ? null : DE.gap.noInForce,
  }
}

/**
 * The act's rail and the section „Das Verfahren", as words. `today` (ISO)
 * decides only between „gilt ab" and „gilt seit".
 */
export function euRailView(r: EuActResponse, today: string): EuRailView {
  const rail = r.rail
  const commission = rail?.adoptedBy === 'kommission'
  const procedure = rail?.procedure ? procedureViewOf(rail.procedure, commission) : null
  const anchor = procedure ? PROCEDURE_ANCHOR : null

  const stations = [
    ...(commission ? [] : [proposalStation(r, anchor), decisionStation(r, anchor)]),
    journalStation(r),
    effectStation(r, today),
  ]
  stations[stations.length - 1]!.current = true

  const partialDates = rail?.partialApplication ?? []
  return {
    heading: DE.heading,
    stations,
    note: commission ? DE.note : null,
    procedure,
    partial: partialDates.length ? DE.partial(partialDates.map((d) => formatDateDe(d))) : null,
  }
}

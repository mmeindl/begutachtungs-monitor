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
 * A SECTION PER STATION, UNDER THE STATION'S NAME (15.11.2026). As on a
 * draft's page, every station of the rail leads to a section of the page
 * with the same heading, and what leaves the site (EUR-Lex, the Legislative
 * Observatory) stands in the section, not in the rail. A section exists
 * for every station, also where it holds one line today: the later steps
 * of the EU cycle (the consultation, the proposals still pending, the
 * directives nobody transposes yet) fill a place that is already there.
 * No section is empty — it says what the Cellar has, or why it has nothing.
 *
 * All German copy of the rail and of its sections lives in
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
  /** The station's section on the page, „#eu-vorschlag": every station has one. */
  anchor: string
}

/** One dated step in a station's section. */
export interface EuRailProcedureRow {
  /** „27.02.2024". */
  date: string
  /** „2024-02-27", for `<time datetime>`. */
  iso: string
  /** The Cellar's own label of the step (`EU_EVENTS`). */
  label: string
}

/** The section of one station: same id, same name, in the rail's words. */
export interface EuRailSection {
  id: EuRailStationId
  /** The section element's id, „eu-vorschlag"; the station links to it. */
  elementId: string
  /** The station's name, word for word. */
  heading: string
  /** The line under the heading (`FactLine`); empty where the rows say it. */
  facts: string[]
  /** Dated steps, ascending, one row per (label, day); empty for a station without steps. */
  rows: EuRailProcedureRow[]
  /** Sentences: what cannot be shown and why, the steps not shown, the days of single provisions. */
  notes: string[]
  /** The station's own record off this site (EUR-Lex, the Legislative Observatory); linked, never fetched. */
  links: { href: string; label: string }[]
  /** The credit line's items; empty where the page's own credit line covers the section. */
  credits: string[]
}

export interface EuRailView {
  /** „Der Rechtsakt im Verfahren" — the card's heading and the list's accessible name. */
  heading: string
  stations: EuRailStation[]
  /** The sentence for an act of the Commission, which has no procedure between the institutions; null otherwise. */
  note: string | null
  /** One section per station, in the rail's order. */
  sections: EuRailSection[]
}

/* ------------------------------------------------------------------ *
 * The words
 * ------------------------------------------------------------------ */

const DE = {
  heading: 'Der Rechtsakt im Verfahren',
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
  proposalRow: (reference: string | null) => (reference ? `Vorschlag der Kommission ${reference}` : 'Vorschlag der Kommission'),
  parliament: (date: string) => `Parlament ${date}`,
  council: (date: string) => `Rat ${date}`,
  signed: (date: string) => `unterzeichnet ${date}`,
  deadline: (date: string) => `Umsetzungsfrist ${date}`,
  inForceSince: (date: string) => `in Kraft seit ${date}`,
  inForceFrom: (date: string) => `in Kraft ab ${date}`,
  effectiveSince: (date: string) => `wirksam seit ${date}`,
  effectiveFrom: (date: string) => `wirksam ab ${date}`,
  appliesSince: (date: string) => `gilt seit ${date}`,
  appliesFrom: (date: string) => `gilt ab ${date}`,
  direct: 'gilt unmittelbar in jedem Mitgliedstaat',
  drafts: (n: number) => (n === 1 ? '1 Entwurf im Monitor' : `${n} Entwürfe im Monitor`),
  other: (n: number) => (n === 1
    ? 'Der Cellar verzeichnet 1 weiteren Schritt dieses Verfahrens, den der Monitor nicht einzeln zeigt.'
    : `Der Cellar verzeichnet ${n} weitere Schritte dieses Verfahrens, die der Monitor nicht einzeln zeigt.`),
  // Not „eigene Tage": the word reads as a count of days (rule D6).
  partial: (dates: string[]) => `Für einzelne Bestimmungen nennt der Cellar einen eigenen Geltungsbeginn: ${dates.join(', ')}.`,
  source: {
    proposal: (reference: string | null) => (reference ? `${reference} auf EUR-Lex` : 'Vorschlag auf EUR-Lex'),
    observatory: 'Verfahren im Legislative Observatory (englisch)',
    act: 'Rechtsakt auf EUR-Lex',
  },
  credits: ['Quelle:', 'Cellar des Amts für Veröffentlichungen der Europäischen Union (Metadaten)'],
} as const

/** A station's section element: „eu-vorschlag", „eu-beschluss", „eu-amtsblatt", „eu-wirkung". */
const elementIdOf = (id: EuRailStationId) => `eu-${id}`
const anchorOf = (id: EuRailStationId) => `#${elementIdOf(id)}`

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
 * The dated steps of the two stations of the procedure, each in its
 * section: the proposals and amended proposals under „Vorschlag", what
 * Parliament, the Council and the bodies the Treaties ask decided under the
 * station that carries the decision. Without the Official Journal (its
 * own station) and, for an act of the Commission, without its own adoption
 * (no „Vorschlag" there). Two codes share one label — Parliament's
 * first-reading position in the old and the new vocabulary — so a row is
 * one (label, day).
 *
 * THE PROPOSAL BY ITS DOCUMENT'S DAY (15.11.2026). „Vorschlag" lists
 * each dated proposal („Vorschlag der Kommission COM(2022) 177"), on the
 * day the proposal itself carries — the day the Commission and the
 * Legislative Observatory cite, and the day the rail's station „Vorschlag"
 * shows. The Cellar's adoption step is dated apart from it (a day later for
 * Richtlinie (EU) 2024/1069), so showing both put two days for one proposal
 * on one page, unexplained. Where a proposal is dated, the steps of role
 * `proposal` therefore stand aside; where none is (old dossiers such as
 * 31976L0207, or a step without a proposal record), they stay, in the
 * Cellar's words. An amended proposal is a step of its own and always
 * stays. Ascending by day, a proposal before a step of the same day.
 */
function procedureRowsOf(p: EuProcedure, commission: boolean): { proposal: EuRailProcedureRow[]; decision: EuRailProcedureRow[] } {
  const seen = new Set<string>()
  const proposal: EuRailProcedureRow[] = []
  const decision: EuRailProcedureRow[] = []
  const add = (iso: string, label: string, rows: EuRailProcedureRow[] = proposal) => {
    const key = `${label}|${iso}`
    if (seen.has(key)) return
    seen.add(key)
    rows.push({ date: formatDateDe(iso), iso, label })
  }
  const dated = commission ? [] : p.proposals.filter((prop): prop is typeof prop & { date: string } => !!prop.date)
  const proposalRows = [...dated].sort((a, b) => a.date.localeCompare(b.date))
  const sorted = [...p.events].sort((a, b) => a.date.localeCompare(b.date))
  let next = 0
  for (const e of sorted) {
    const role = roleOf(e)
    if (!role || role === 'publication') continue
    if (commission && (role === 'proposal' || role === 'amended-proposal')) continue
    if (role === 'proposal' && dated.length) continue
    // A proposal sorts before a step of the same day.
    while (next < proposalRows.length && proposalRows[next]!.date <= e.date) {
      add(proposalRows[next]!.date, DE.proposalRow(proposalRows[next]!.reference))
      next++
    }
    add(e.date, EU_EVENTS[e.code]!.label, role === 'proposal' || role === 'amended-proposal' ? proposal : decision)
  }
  for (; next < proposalRows.length; next++) add(proposalRows[next]!.date, DE.proposalRow(proposalRows[next]!.reference))
  return { proposal, decision }
}

/**
 * „Vorschlag": each proposal as „COM(2022) 177 vom 27.04.2022", one fact per
 * proposal so two proposals cannot be misread as one number and another's
 * date. A proposal without its own date takes the day of the first adoption
 * step of the Commission — the first proposal only: with two dossiers that
 * step belongs to the earlier one, and a second proposal would borrow a day
 * that is not its own.
 */
function proposalStation(r: EuActResponse): EuRailStation {
  const base = { id: 'vorschlag' as const, name: DE.name.vorschlag, current: false, anchor: anchorOf('vorschlag') }
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
  return { ...base, facts, gap: facts.length ? null : DE.gap.proposalBare }
}

/** Station 2: who decided, named from the act's authors (`EuAdoptedBy`). */
function decisionStation(r: EuActResponse): EuRailStation {
  const rail = r.rail
  const adoptedBy = rail?.adoptedBy ?? 'unbekannt'
  const name = adoptedBy === 'parlament-rat' ? DE.name['parlament-rat'] : adoptedBy === 'rat' ? DE.name.rat : DE.name.unbekannt
  const base = { id: 'beschluss' as const, name, current: false, anchor: anchorOf('beschluss') }
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
  return { ...base, facts, gap: parliament || council ? null : DE.gap.noDecision }
}

function journalStation(r: EuActResponse): EuRailStation {
  return {
    id: 'amtsblatt',
    name: DE.name.amtsblatt,
    current: false,
    facts: r.oj ? [euOjCiteDe(r.oj)] : [],
    gap: r.oj ? null : DE.gap.noOj,
    anchor: anchorOf('amtsblatt'),
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
  const base = { id: 'wirkung' as const, current: false, anchor: anchorOf('wirkung') }

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
  // A Beschluss addressed to someone takes effect („PE") instead of entering
  // into force; shown only where no entry into force is typed.
  const effective = inForce ? null : rail?.effective ?? null
  const applies = rail?.applies ?? null
  const facts = [
    ...(inForce ? [inForce <= today ? DE.inForceSince(formatDateDe(inForce)) : DE.inForceFrom(formatDateDe(inForce))] : []),
    ...(effective ? [effective <= today ? DE.effectiveSince(formatDateDe(effective)) : DE.effectiveFrom(formatDateDe(effective))] : []),
    ...(applies && applies !== inForce ? [applies <= today ? DE.appliesSince(formatDateDe(applies)) : DE.appliesFrom(formatDateDe(applies))] : []),
    // Art. 288 AEUV: a regulation applies directly; a decision binds only whom it names.
    ...(kind === 'verordnung' ? [DE.direct] : []),
    ...drafts,
  ]
  return {
    ...base,
    name: DE.name.geltung,
    facts,
    gap: !rail ? DE.gap.inForceUnread : inForce || effective ? null : DE.gap.noInForce,
  }
}

/**
 * The section of a station. What the station says in one line the section
 * says in full: the dated steps where there are any (then the line is not
 * repeated above them), the sentences, and the record at its source.
 */
function sectionOf(st: EuRailStation, r: EuActResponse, rows: ReturnType<typeof procedureRowsOf> | null): EuRailSection {
  const base = { id: st.id, elementId: elementIdOf(st.id), heading: st.name, credits: [...DE.credits] }
  const gap = st.gap ? [st.gap] : []
  const p = r.rail?.procedure ?? null
  if (st.id === 'vorschlag') {
    const own = rows?.proposal ?? []
    // The station's line is repeated only where the rows do not say it all:
    // a proposal without its own day is no row („COM(…)" would be lost).
    const allDated = (p?.proposals ?? []).every((prop) => prop.date)
    return {
      ...base,
      facts: own.length && allDated ? [] : st.facts,
      rows: own,
      notes: gap,
      links: (p?.proposals ?? []).flatMap((prop) => (prop.eurLexUrl ? [{ href: prop.eurLexUrl, label: DE.source.proposal(prop.reference) }] : [])),
    }
  }
  if (st.id === 'beschluss') {
    const typeLabel = p?.type ? EU_PROCEDURE_TYPES[p.type] ?? null : null
    return {
      ...base,
      facts: [p?.reference, typeLabel].filter((x): x is string => !!x),
      rows: rows?.decision ?? [],
      notes: [...gap, ...(p && p.otherEvents > 0 ? [DE.other(p.otherEvents)] : [])],
      links: p?.observatoryUrl ? [{ href: p.observatoryUrl, label: DE.source.observatory }] : [],
    }
  }
  if (st.id === 'amtsblatt') {
    return { ...base, facts: st.facts, rows: [], notes: gap, links: [{ href: r.act.eurLexUrl, label: DE.source.act }] }
  }
  // „Umsetzung" / „Geltung": the drafts stand in the section themselves, so
  // their count is not said again; the page's credit line covers it.
  const n = r.implementing.length
  const partial = r.rail?.partialApplication ?? []
  return {
    ...base,
    facts: st.facts.filter((f) => n === 0 || f !== DE.drafts(n)),
    rows: [],
    notes: [...gap, ...(partial.length ? [DE.partial(partial.map((d) => formatDateDe(d)))] : [])],
    links: [],
    credits: [],
  }
}

/**
 * The act's rail and the section of each station, as words. `today` (ISO)
 * decides only between „ab" and „seit" (in Kraft, wirksam, gilt).
 */
export function euRailView(r: EuActResponse, today: string): EuRailView {
  const rail = r.rail
  const commission = rail?.adoptedBy === 'kommission'
  const rows = rail?.procedure ? procedureRowsOf(rail.procedure, commission) : null

  const stations = [
    ...(commission ? [] : [proposalStation(r), decisionStation(r)]),
    journalStation(r),
    effectStation(r, today),
  ]
  stations[stations.length - 1]!.current = true

  return {
    heading: DE.heading,
    stations,
    note: commission ? DE.note : null,
    sections: stations.map((st) => sectionOf(st, r, rows)),
  }
}

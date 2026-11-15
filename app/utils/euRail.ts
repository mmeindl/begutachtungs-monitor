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
 * THE SECTIONS SPEAK THE DRAFT PAGES' GRAMMAR (15.11.2026), so an act's
 * page and a draft's read as one site: a section opens with a frame of
 * facts (`FactList` — a name, the fact under it, the link inside the
 * fact); the dated record stands folded under it in a list box, as „Alle
 * Schritte im Landtag" does; what limits the reading is a short paragraph
 * under the frame; the credit line closes it. Every later step of the EU
 * cycle fills these four places and adds no fifth.
 *
 * All German copy of the rail and of its sections lives in
 * this one file, so a second language replaces it here. Pure: no Vue; the
 * component places what this returns, the tests read it without one.
 */
import type { EuActResponse, EuProcedure, EuProcedureEvent } from '#shared/types'
import { euOjCiteDe } from '#shared/utils/citations'
import { EU_MEMBER_STATE_NAME_DE } from '#shared/utils/eu'
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

/** One dated row of a section's record: a step of the procedure, or a notified measure. */
export interface EuRailProcedureRow {
  /** „27.02.2024"; „–" for a measure without a day of notification. */
  date: string
  /** „2024-02-27", for `<time datetime>`; empty without a day. */
  iso: string
  /** The Cellar's own label of the step (`EU_EVENTS`), or the measure's title as notified. */
  label: string
  /** A measure only: its kind and where it was promulgated, „Bundesgesetz · BGBl. I Nr. 65/2018 vom 20.08.2018". */
  detail?: string | null
  /** A measure only: the measure at its national source, where the address is public. */
  href?: string | null
}

/** A link off this site inside a fact: the record at its source, never fetched. */
export interface EuFactLink {
  href: string
  label: string
}

/** One fact of a section's frame (`FactList`): a name, and under it the fact. */
export interface EuSectionFact {
  key: string
  /** The name over the fact, in the station style; null for the one sentence that says why nothing can be shown. */
  title: string | null
  /** The fact, in order: plain words and links, set apart by commas. */
  parts: (string | EuFactLink)[]
  /** The fact is the act's citation: „Zitieren" stands beside it. */
  cite: boolean
}

/** The dated record folded under a section's frame, as „Alle Schritte im Landtag". */
export interface EuSectionRecord {
  /** „Alle gelesenen Schritte des Verfahrens (6)". */
  heading: string
  rows: EuRailProcedureRow[]
  /** What the record leaves out, counted; null where it leaves nothing out. */
  note: string | null
}

/** The section of one station: same id, same name, in the draft pages' grammar. */
export interface EuRailSection {
  id: EuRailStationId
  /** The section element's id, „eu-vorschlag"; the station links to it. */
  elementId: string
  /** The station's name, word for word. */
  heading: string
  /** The frame the section opens with; never empty. */
  facts: EuSectionFact[]
  /** The dated record under the frame; null for a station without one. */
  record: EuSectionRecord | null
  /** Short paragraphs under the frame: what limits the reading. */
  notes: string[]
  /** The credit line's items under the frame. */
  credits: string[]
}

export interface EuRailView {
  /** „Der Rechtsakt im Verfahren" — the list's accessible name; the card's heading where no stand can be said. */
  heading: string
  /**
   * The card's heading: where the act stands, as the draft's card says
   * „Gesetz geworden" (`ProcedureCard`) — „Umzusetzen bis 07.05.2027",
   * „Gilt seit 01.01.2023". A date and what it is, never a verdict (rule
   * D6): a passed deadline is „Umsetzungsfrist war der …", not „abgelaufen"
   * and not „nicht umgesetzt" — whether the Member State transposed in
   * time is nothing the monitor can see. Null where no date is known; the
   * card then keeps its name.
   */
  status: string | null
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
  status: {
    transposeBy: (d: string) => `Umzusetzen bis ${d}`,
    transposedBy: (d: string) => `Umsetzungsfrist war der ${d}`,
    applies: (d: string, past: boolean) => (past ? `Gilt seit ${d}` : `Gilt ab ${d}`),
    inForce: (d: string, past: boolean) => (past ? `In Kraft seit ${d}` : `In Kraft ab ${d}`),
    inForceApplies: (f: string, fPast: boolean, a: string) => `${fPast ? 'In Kraft seit' : 'In Kraft ab'} ${f}, gilt ab ${a}`,
    effective: (d: string, past: boolean) => (past ? `Wirksam seit ${d}` : `Wirksam ab ${d}`),
    published: 'Im Amtsblatt veröffentlicht',
  },
  furtherDates: 'Weitere Fristen für einzelne Bestimmungen',
  fact: {
    proposal: 'Vorschlag der Kommission',
    procedure: 'Verfahren',
    parliament: 'Parlament',
    council: 'Rat',
    signature: 'Unterzeichnung',
    reference: 'Fundstelle',
    act: 'Rechtsakt',
    deadline: 'Umsetzungsfrist',
    inForce: 'In Kraft',
    effective: 'Wirksam',
    applies: 'Gilt',
    direct: 'Gilt unmittelbar',
    directText: 'in jedem Mitgliedstaat',
  },
  since: (date: string) => `seit ${date}`,
  from: (date: string) => `ab ${date}`,
  record: (n: number) => `Alle gelesenen Schritte des Verfahrens (${n})`,
  notified: {
    fact: 'Der Kommission gemeldet',
    unknown: 'Die Meldungen an die Kommission konnten nicht gelesen werden.',
    none: `${EU_MEMBER_STATE_NAME_DE} hat der Kommission bisher keine Maßnahme gemeldet.`,
    some: (n: number) => (n === 1 ? '1 Maßnahme' : `${n} Maßnahmen`),
    record: (n: number) => `Gemeldete Maßnahmen (${n}), nach dem Tag der Meldung`,
    untitled: 'Maßnahme ohne Titel',
    note: `Gemeldet ist, was ${EU_MEMBER_STATE_NAME_DE} der Kommission als Umsetzung genannt hat – auch Gesetze, die älter sind als die Richtlinie. Ob die Richtlinie damit vollständig umgesetzt ist, steht in diesen Daten nicht.`,
    gazette: (number: string | null, date: string | null) => [number, date ? `vom ${date}` : null].filter(Boolean).join(' '),
  },
  // Not „eigene Tage": the word reads as a count of days (rule D6).
  partial: (dates: string[]) => `Für einzelne Bestimmungen nennt der Cellar einen eigenen Geltungsbeginn: ${dates.join(', ')}.`,
  source: {
    proposal: 'Vorschlag auf EUR-Lex',
    observatory: 'im Legislative Observatory (englisch)',
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

const fact = (key: string, title: string | null, parts: (string | EuFactLink)[], cite = false): EuSectionFact => ({ key, title, parts, cite })

/** The one sentence that says why a station has nothing to show, as the frame's only row. */
const gapFact = (gap: string): EuSectionFact => fact('luecke', null, [gap])

/**
 * A section's frame and what stands under it. Where the station has facts,
 * a gap is a paragraph under the frame; where it has none, the gap IS the
 * frame — a section never opens empty.
 */
function framed(facts: EuSectionFact[], gap: string | null, notes: string[] = []): Pick<EuRailSection, 'facts' | 'notes'> {
  if (!facts.length) return { facts: [gapFact(gap ?? DE.gap.unread)], notes }
  return { facts, notes: [...(gap ? [gap] : []), ...notes] }
}

/**
 * „Vorschlag": each proposal a fact — its number linked to EUR-Lex, then
 * its day, the same day the station shows; an amended proposal under the
 * Cellar's own name for the step.
 */
function proposalFacts(st: EuRailStation, p: EuProcedure | null): EuSectionFact[] {
  if (!p) return []
  const firstProposalEvent = p.events.find((e) => roleOf(e) === 'proposal') ?? null
  const facts: EuSectionFact[] = []
  p.proposals.forEach((prop, i) => {
    const iso = prop.date ?? (i === 0 ? firstProposalEvent?.date ?? null : null)
    const date = iso ? [formatDateDe(iso)] : []
    if (prop.reference) {
      facts.push(fact(`vorschlag-${i}`, DE.fact.proposal, [prop.eurLexUrl ? { href: prop.eurLexUrl, label: prop.reference } : prop.reference, ...date]))
    } else if (date.length) {
      facts.push(fact(`vorschlag-${i}`, DE.fact.proposal, [...date, ...(prop.eurLexUrl ? [{ href: prop.eurLexUrl, label: DE.source.proposal }] : [])]))
    }
  })
  if (!p.proposals.length && firstProposalEvent) facts.push(fact('vorschlag-0', DE.fact.proposal, [formatDateDe(firstProposalEvent.date)]))
  // Only where the station shows a proposal at all: an amended proposal alone is no „Vorschlag" shown.
  if (st.facts.length) {
    p.events.filter((e) => roleOf(e) === 'amended-proposal').forEach((e, i) => {
      facts.push(fact(`geaendert-${i}`, EU_EVENTS[e.code]!.label, [formatDateDe(e.date)]))
    })
  }
  return facts
}

/**
 * The deciding station: the procedure's number and kind with the way to
 * the Legislative Observatory, then what the station's line says — the
 * last decision of Parliament and of the Council in the Cellar's words,
 * and the signature. Everything else the monitor reads stands in the record.
 */
function decisionFacts(r: EuActResponse, p: EuProcedure | null): EuSectionFact[] {
  if (!p) return []
  const typeLabel = p.type ? EU_PROCEDURE_TYPES[p.type] ?? null : null
  const observatory: EuFactLink | null = p.observatoryUrl ? { href: p.observatoryUrl, label: DE.source.observatory } : null
  const candidates: (string | EuFactLink | null)[] = [p.reference, typeLabel, observatory]
  const procedure = candidates.filter((x): x is string | EuFactLink => !!x)
  const parliament = r.rail?.adoptedBy === 'parlament-rat' ? lastOf(p.events, 'parliament') : null
  const council = lastOf(p.events, 'council')
  const signed = lastOf(p.events, 'signature')
  return [
    ...(procedure.length ? [fact('verfahren', DE.fact.procedure, procedure)] : []),
    ...(parliament ? [fact('parlament', DE.fact.parliament, [EU_EVENTS[parliament.code]!.label, formatDateDe(parliament.date)])] : []),
    ...(council ? [fact('rat', DE.fact.council, [EU_EVENTS[council.code]!.label, formatDateDe(council.date)])] : []),
    ...(signed ? [fact('unterzeichnung', DE.fact.signature, [formatDateDe(signed.date)])] : []),
  ]
}

/** „Umsetzung": the deadline. „Geltung": since or from when, each day a fact of its own. */
function effectFacts(r: EuActResponse, today: string): EuSectionFact[] {
  const kind = r.act.kind
  if (kind === 'richtlinie' || kind === 'rahmenbeschluss') {
    const t = r.act.transposition
    return t
      ? [
          fact('frist', DE.fact.deadline, [formatDateDe(t.deadline)]),
          // Rule D3: the latest date is the deadline, the earlier ones are named beside it.
          ...(t.otherDates.length ? [fact('weitere-fristen', DE.furtherDates, t.otherDates.map((d) => formatDateDe(d)))] : []),
        ]
      : []
  }
  const rail = r.rail
  const when = (iso: string) => (iso <= today ? DE.since(formatDateDe(iso)) : DE.from(formatDateDe(iso)))
  const inForce = rail?.inForce ?? null
  const effective = inForce ? null : rail?.effective ?? null
  const applies = rail?.applies ?? null
  return [
    ...(inForce ? [fact('in-kraft', DE.fact.inForce, [when(inForce)])] : []),
    ...(effective ? [fact('wirksam', DE.fact.effective, [when(effective)])] : []),
    ...(applies && applies !== inForce ? [fact('gilt', DE.fact.applies, [when(applies)])] : []),
    ...(kind === 'verordnung' ? [fact('unmittelbar', DE.fact.direct, [DE.fact.directText])] : []),
  ]
}

/** The card's heading (`EuRailView.status`). `today` decides between what was and what is to come. */
function statusOf(r: EuActResponse, today: string): string | null {
  const kind = r.act.kind
  if (kind === 'richtlinie' || kind === 'rahmenbeschluss') {
    const deadline = r.act.transposition?.deadline ?? null
    if (deadline) return deadline >= today ? DE.status.transposeBy(formatDateDe(deadline)) : DE.status.transposedBy(formatDateDe(deadline))
    return r.oj ? DE.status.published : null
  }
  const rail = r.rail
  const inForce = rail?.inForce ?? null
  const effective = inForce ? null : rail?.effective ?? null
  const applies = rail?.applies && rail.applies !== inForce ? rail.applies : null
  if (applies && applies <= today) return DE.status.applies(formatDateDe(applies), true)
  if (applies && inForce) return DE.status.inForceApplies(formatDateDe(inForce), inForce <= today, formatDateDe(applies))
  if (applies) return DE.status.applies(formatDateDe(applies), false)
  if (inForce) return DE.status.inForce(formatDateDe(inForce), inForce <= today)
  if (effective) return DE.status.effective(formatDateDe(effective), effective <= today)
  return r.oj ? DE.status.published : null
}

/** The section of a station, in the draft pages' grammar (see the head of this file). */
function sectionOf(st: EuRailStation, r: EuActResponse, rows: ReturnType<typeof procedureRowsOf> | null, today: string): EuRailSection {
  const base = { id: st.id, elementId: elementIdOf(st.id), heading: st.name, record: null, credits: [...DE.credits] }
  const p = r.rail?.procedure ?? null
  if (st.id === 'vorschlag') return { ...base, ...framed(proposalFacts(st, p), st.gap) }
  if (st.id === 'beschluss') {
    // The whole record of the procedure the monitor reads, the proposal with it, by day.
    const all = rows ? [...rows.proposal, ...rows.decision].sort((x, y) => x.iso.localeCompare(y.iso)) : []
    return {
      ...base,
      ...framed(decisionFacts(r, p), st.gap),
      record: all.length ? { heading: DE.record(all.length), rows: all, note: p && p.otherEvents > 0 ? DE.other(p.otherEvents) : null } : null,
    }
  }
  if (st.id === 'amtsblatt') {
    const facts = r.oj
      ? [fact('fundstelle', DE.fact.reference, [{ href: r.act.eurLexUrl, label: euOjCiteDe(r.oj) }], true)]
      : [gapFact(st.gap ?? DE.gap.noOj), fact('rechtsakt', DE.fact.act, [{ href: r.act.eurLexUrl, label: DE.source.act }])]
    return { ...base, facts, notes: [] }
  }
  // „Umsetzung" / „Geltung": the drafts follow in the section itself.
  const partial = r.rail?.partialApplication ?? []
  const notified = notifiedOf(r)
  return {
    ...base,
    ...framed([...effectFacts(r, today), ...notified.facts], st.gap, partial.length ? [DE.partial(partial.map((d) => formatDateDe(d)))] : []),
    record: notified.record,
  }
}

/**
 * A directive only: what the Member State notified to the Commission — a
 * fact of the frame (how many, or that it notified none, or that the
 * notifications could not be read: three different sentences), and the
 * measures themselves as the section's folded record, by day of
 * notification. „Gemeldet", never „umgesetzt": the record's note says what
 * a notification is.
 */
function notifiedOf(r: EuActResponse): { facts: EuSectionFact[]; record: EuSectionRecord | null } {
  if (!r.memberState) return { facts: [], record: null }
  const m = r.measures
  if (m === null) return { facts: [fact('gemeldet', DE.notified.fact, [DE.notified.unknown])], record: null }
  if (!m.length) return { facts: [fact('gemeldet', DE.notified.fact, [DE.notified.none])], record: null }
  return {
    facts: [fact('gemeldet', DE.notified.fact, [DE.notified.some(m.length)])],
    record: {
      heading: DE.notified.record(m.length),
      rows: m.map((x) => ({
        date: x.notified ? formatDateDe(x.notified) : '–',
        iso: x.notified ?? '',
        label: x.title ?? DE.notified.untitled,
        detail: [x.kind, DE.notified.gazette(x.gazette.number ?? x.gazette.name, x.gazette.date ? formatDateDe(x.gazette.date) : null)].filter(Boolean).join(' · ') || null,
        href: x.url,
      })),
      note: DE.notified.note,
    },
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
    status: statusOf(r, today),
    stations,
    note: commission ? DE.note : null,
    sections: stations.map((st) => sectionOf(st, r, rows, today)),
  }
}

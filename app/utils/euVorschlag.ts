/**
 * The page of one proposal of the Commission that left the Commission
 * (step 3 of the EU cycle, 15.11.2026), as words: `/eu-recht/vorschlag/
 * 2026/780`, by its COM number, with the procedure as far as the Cellar
 * records it and the consultation behind it from the Commission's portal.
 *
 * THE INITIATIVE PAGE'S GRAMMAR. A header card whose heading states the
 * stand, the rail (`EuRail`), a section per station in the rail's order
 * (`EuStationSection`). The stations' and the portal's words are the act
 * page's (`EU_RAIL_DE`), and so are its builders — the consultation, the
 * feedback period on the proposal, the procedure's facts and its folded
 * record — so a proposal reads like the act it may become.
 *
 * THE STAND IS THE CELLAR'S (`euProposalStandOf`): „Rechtsakt geworden",
 * „Zurückgezogen am …", „Anhängig laut EUR-Lex" with the day of the last
 * recorded step, or the sentence that the Cellar gives no clear stand.
 * Statements about the record, never about the world: „verzeichnet keinen
 * Beschluss", not „hat nicht beschlossen". Dates, no durations (rule D6):
 * no „seit N Tagen", no „überfällig".
 *
 * THE THIRD STATION'S NAME COMES FROM THE PROCEDURE TYPE. An act's page
 * names it from the act's authors; a pending proposal has none yet. The
 * types map onto the act page's names as the 27 acts of the Council alone
 * did (docs/decisions.md): the ordinary procedure (OLP, COD) → „Parlament
 * und Rat"; consultation, consent and non-legislative procedures (CNS, APP,
 * NLE) → „Rat"; any other → „Verfahren", naming the type.
 *
 * ONE BLUE ELEMENT: while the portal holds an open feedback period on THIS
 * proposal (the publication that carries its COM number), the same action
 * as on an initiative's page (`EuWindowAction`).
 *
 * All German copy of the page lives here. Pure: no Vue.
 */
import type { EuConsultation, EuProcedure, EuProcedureEvent, EuProposalAct, EuProposalStand, EuVorschlagResponse } from '#shared/types'
import { EU_PAGE_TITLE_DE } from '#shared/utils/eu'
import { EU_EVENTS, EU_PROCEDURE_TYPES } from '#shared/utils/euEvents'
import { euProposalStandOf } from '#shared/utils/euVorschlag'
import { formatDateDe } from '#shared/utils/format'
import { gapDe } from '#shared/utils/gaps'
import { EU_INITIATIVE_DE, isOpen, type EuWindowActionView } from './euInitiative'
import {
  EU_RAIL_DE,
  anchorOf,
  consultationFacts,
  consultationStation,
  elementIdOf,
  fact,
  framed,
  gapFact,
  lastOf,
  periodParts,
  procedureFacts,
  procedureRowsOf,
  proposalFeedbackOf,
  roleOf,
  type EuFactLink,
  type EuRailSection,
  type EuRailStation,
  type EuRailStationId,
  type EuSectionFact,
} from './euRail'

/** Who decides on the proposal, by its procedure type. */
export type EuDecisionBody = 'parlament-rat' | 'rat' | 'andere'

const DE = {
  identity: 'Vorschlag der Europäischen Kommission',
  heading: 'Der Vorschlag im Verfahren',
  untitled: (reference: string) => `Vorschlag ${reference}`,
  englishTitle: 'EUR-Lex führt den Titel bisher nur auf Englisch',
  source: 'Auf EUR-Lex ansehen',
  name: {
    beides: 'Umsetzung und Geltung',
    offen: 'Umsetzung oder Geltung',
  },
  status: {
    act: (n: number) => (n === 1 ? 'Rechtsakt geworden' : `${n} Rechtsakte geworden`),
    actNote: (labels: string[]) => `Laut EUR-Lex: ${labels.join(', ')}.`,
    withdrawn: (d: string) => `Zurückgezogen am ${d}`,
    withdrawnUndated: 'Der Cellar führt den Vorschlag als zurückgezogen',
    // The heading is the stand alone, as a draft's card says „Gesetz geworden"; the day of the last step is the line under it.
    pending: 'Anhängig laut EUR-Lex',
    lastStep: (d: string) => `Letzter verzeichneter Schritt am ${d}.`,
    unclear: (d: string | null) => (d
      ? `Der Cellar gibt für diesen Vorschlag keinen eindeutigen Stand an. Letzter verzeichneter Schritt am ${d}.`
      : 'Der Cellar gibt für diesen Vorschlag keinen eindeutigen Stand an.'),
    noProcedure: 'Der Cellar verzeichnet zu diesem Vorschlag kein Verfahren zwischen den Organen.',
    unread: gapDe('unavailable', 'Der Cellar des Amts für Veröffentlichungen hat nicht geantwortet; wo der Vorschlag steht, kann hier nicht gezeigt werden.'),
  },
  withdrawnFact: (d: string) => `zurückgezogen am ${d}`,
  procedureType: 'Verfahrensart',
  noDecisionYet: 'Der Cellar verzeichnet zu diesem Vorschlag bisher keinen Beschluss von Parlament oder Rat, den der Monitor liest.',
  noDecision: 'Der Cellar verzeichnet zu diesem Vorschlag keinen Beschluss von Parlament oder Rat, den der Monitor liest.',
  unreadProcedure: gapDe('unavailable', 'Der Cellar des Amts für Veröffentlichungen hat nicht geantwortet; das Verfahren kann hier nicht gezeigt werden.'),
  acts: (n: number) => (n === 1 ? 'Rechtsakt' : 'Rechtsakte'),
  actsOnTheirPages: 'Was aus einem Rechtsakt folgt – Umsetzungsfrist, Inkrafttreten, Geltung –, steht beim Rechtsakt selbst.',
  noActYet: 'Der Cellar verzeichnet zu diesem Vorschlag noch keinen Rechtsakt.',
  noAct: 'Der Cellar verzeichnet zu diesem Vorschlag keinen Rechtsakt.',
  withdrawnRail: 'Zurückgezogen; laut Cellar wurde daraus kein Rechtsakt.',
  withdrawnNoAct: 'Die Kommission hat den Vorschlag zurückgezogen. Der Cellar verzeichnet keinen Rechtsakt, der daraus hervorgegangen ist.',
  withdrawnUndatedNoAct: 'Der Cellar führt den Vorschlag als zurückgezogen und verzeichnet keinen Rechtsakt, der daraus hervorgegangen ist.',
  ahead: {
    umsetzung: 'Umzusetzen ist erst ein Rechtsakt, der im Amtsblatt steht.',
    geltung: 'Gelten kann erst ein Rechtsakt, der im Amtsblatt steht.',
    offen: 'Umzusetzen ist oder gilt erst ein Rechtsakt, der im Amtsblatt steht.',
  },
  unknown: (reference: string) => `Im Cellar des Amts für Veröffentlichungen gibt es keinen Vorschlag ${reference}.`,
  unknownDescription: 'Der Cellar hat auf die Frage nach dieser Nummer geantwortet, dass er sie nicht kennt.',
  back: EU_PAGE_TITLE_DE,
  loading: 'Vorschlag wird geladen …',
  seo: {
    fallbackTitle: 'Vorschlag der Europäischen Kommission',
    description: (reference: string, status: string) => `Ein Vorschlag der Europäischen Kommission, ${reference}: ${status}. Wo Rückmeldungen möglich sind oder waren und wie weit das Verfahren laut EUR-Lex ist, Station für Station.`,
    fallbackDescription: 'Ein Vorschlag der Europäischen Kommission: wo Rückmeldungen möglich sind oder waren und wie weit das Verfahren laut EUR-Lex ist.',
  },
} as const

export const EU_VORSCHLAG_DE = DE

export interface EuVorschlagView {
  title: string
  /** „EUR-Lex führt den Titel bisher nur auf Englisch" where the German title is missing; null otherwise. */
  titleNote: string | null
  /** „Vorschlag der Europäischen Kommission · COM(2026) 780". */
  identity: string
  /** The card's heading: the stand. */
  status: string
  /** A sentence under the heading: the acts, or why no stand can be said; may be a gap sentence. Null where the heading says it all. */
  statusNote: string | null
  /** The one blue element: only while a feedback period on this proposal is open. */
  action: EuWindowActionView | null
  heading: string
  stations: EuRailStation[]
  sections: EuRailSection[]
  eurLexUrl: string
}

/** Procedure types whose decision rests with Parliament and Council together, and with the Council (the act page's names, decision 13). */
const JOINT = new Set(['OLP', 'COD'])
const COUNCIL = new Set(['CNS', 'APP', 'NLE'])

/**
 * Who decides, from the dossier's type (`OLP`, `CNS` …) or, where it names
 * none, the suffix of the procedure number („2026/0307(COD)").
 */
export function decisionBodyOf(p: Pick<EuProcedure, 'type' | 'reference'> | null): EuDecisionBody {
  const suffix = p?.reference ? /\(([A-Z]{2,4})\)$/.exec(p.reference)?.[1] ?? null : null
  for (const code of [p?.type ?? null, suffix]) {
    if (code && JOINT.has(code)) return 'parlament-rat'
    if (code && COUNCIL.has(code)) return 'rat'
  }
  return 'andere'
}

const BODY_NAME: Record<EuDecisionBody, string> = {
  'parlament-rat': EU_RAIL_DE.name['parlament-rat'],
  rat: EU_RAIL_DE.name.rat,
  andere: EU_RAIL_DE.name.unbekannt,
}

/**
 * What the act will be, for the last station's name: the kind the title
 * names right after „Vorschlag für eine …" / „Proposal for a …" (a
 * regulation „zur Änderung der Richtlinie …" is a regulation); without a
 * title the kind the portal foresees; else unknown, and the station says
 * both words rather than guess one.
 */
export function effectKindOf(title: string | null, consultation: EuConsultation): 'umsetzung' | 'geltung' | null {
  const word = title ? /^(?:Vorschlag für eine[nr]?|Proposal for an?)\s+(?:COUNCIL\s+)?(\S+)/i.exec(title.trim())?.[1]?.toUpperCase() ?? null : null
  if (word && /^(RICHTLINIE|DIRECTIVE|RAHMENBESCHLUSS)$/.test(word)) return 'umsetzung'
  if (word && /^(VERORDNUNG|REGULATION|BESCHLUSS|DECISION)$/.test(word)) return 'geltung'
  const actType = consultation.state === 'gefunden' ? consultation.initiative.actType ?? null : null
  if (actType === 'PROP_DIR') return 'umsetzung'
  if (actType === 'PROP_REG' || actType === 'PROP_DEC') return 'geltung'
  return null
}

/**
 * One procedure from the proposal's dossiers: number, type and the
 * Observatory's page of the most recent one (the dossiers come sorted), the
 * steps of all, each (code, day) once.
 */
function procedureOfAll(r: EuVorschlagResponse): EuProcedure | null {
  const ds = r.proposal?.dossiers ?? []
  if (!ds.length) return null
  const last = ds[ds.length - 1]!.procedure
  const events = new Map<string, EuProcedureEvent>()
  for (const d of ds) for (const e of d.procedure.events) events.set(`${e.date}|${e.code}`, e)
  return {
    ...last,
    proposals: ds[0]!.procedure.proposals,
    events: [...events.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.code < b.code ? -1 : a.code > b.code ? 1 : 0)),
    otherEvents: ds.reduce((n, d) => n + d.procedure.otherEvents, 0),
  }
}

/** An act as a link: to the monitor's page where it has one, otherwise to EUR-Lex. */
const actLink = (a: EuProposalAct): EuFactLink => (a.path ? { href: a.path, label: a.label, internal: true } : { href: a.eurLexUrl, label: a.label })

const station = (id: EuRailStationId, name: string, facts: string[], gap: string | null, ahead = false): EuRailStation =>
  ({ id, name, current: false, facts, gap, anchor: anchorOf(id), ...(ahead ? { ahead: true } : {}) })

const CELLAR_CREDITS = [...EU_RAIL_DE.credits]

const section = (st: EuRailStation, parts: Pick<EuRailSection, 'facts' | 'notes'>, credits: string[] = CELLAR_CREDITS, record: EuRailSection['record'] = null): EuRailSection =>
  ({ id: st.id, elementId: elementIdOf(st.id), heading: st.name, record, credits: [...credits], ...parts })

function statusOf(stand: EuProposalStand | null, acts: readonly EuProposalAct[]): { status: string; note: string | null } {
  if (!stand) return { status: DE.heading, note: DE.status.unread }
  switch (stand.kind) {
    case 'rechtsakt':
      return { status: DE.status.act(acts.length), note: acts.length ? DE.status.actNote(acts.map((a) => a.label)) : null }
    case 'zurueckgezogen':
      return { status: DE.status.withdrawn(formatDateDe(stand.date)), note: null }
    case 'zurueckgezogen-undatiert':
      return { status: DE.status.withdrawnUndated, note: null }
    case 'anhaengig':
      return { status: DE.status.pending, note: stand.lastStep ? DE.status.lastStep(formatDateDe(stand.lastStep)) : null }
    case 'unklar':
      return { status: DE.heading, note: DE.status.unclear(stand.lastStep ? formatDateDe(stand.lastStep) : null) }
    case 'ohne-verfahren':
      return { status: DE.heading, note: DE.status.noProcedure }
  }
}

/**
 * The page of one proposal as words. `today` (ISO, Vienna) decides whether
 * the feedback period on the proposal is still open.
 */
export function euVorschlagView(r: EuVorschlagResponse, today: string): EuVorschlagView {
  const record = r.proposal
  const stand = record ? euProposalStandOf(record) : null
  const p = procedureOfAll(r)
  const body = decisionBodyOf(p)
  const withdrawn = stand?.kind === 'zurueckgezogen' || stand?.kind === 'zurueckgezogen-undatiert'
  const ended = withdrawn || stand?.kind === 'rechtsakt'
  const acts = r.acts
  const c = r.consultation

  const stations: EuRailStation[] = []
  const sections: EuRailSection[] = []

  // „Konsultation": from the portal, exactly as on an act's page.
  const konsultation = consultationStation(c)
  stations.push(konsultation)
  sections.push(section(konsultation, framed(consultationFacts(c), konsultation.gap), [EU_RAIL_DE.credits[0], EU_RAIL_DE.portal.credit]))

  // „Vorschlag": the COM number and its day, the Commission's amended
  // proposals and its withdrawal, and the feedback period on THIS proposal.
  const dateIso = record?.date ?? null
  const date = dateIso ? formatDateDe(dateIso) : null
  // Only the period on THIS proposal: the consultation must have been asked by its number.
  const feedback = c.state === 'gefunden' && c.reference === r.reference.replace(/\s+/g, '') ? proposalFeedbackOf(c) : null
  const withdrawal = stand?.kind === 'zurueckgezogen' ? formatDateDe(stand.date) : null
  const vorschlag = station('vorschlag', EU_RAIL_DE.name.vorschlag, [
    EU_RAIL_DE.proposal(r.reference, date),
    ...(feedback ? [EU_RAIL_DE.portal.until(EU_RAIL_DE.portal.proposalFeedback, formatDateDe(feedback.feedbackEnd!))] : []),
    ...(withdrawal ? [DE.withdrawnFact(withdrawal)] : []),
  ], null)
  stations.push(vorschlag)
  const amended = (p?.events ?? []).filter((e) => roleOf(e) === 'amended-proposal')
  const withdrawalEvent = p ? lastOf(p.events, 'withdrawal') : null
  const proposalFacts: EuSectionFact[] = [
    fact('vorschlag', EU_RAIL_DE.fact.proposal, [{ href: r.eurLexUrl, label: r.reference }, ...(date ? [date] : [])]),
    ...amended.map((e, n) => fact(`geaendert-${n}`, EU_EVENTS[e.code]!.label, [formatDateDe(e.date)])),
    ...(withdrawalEvent ? [fact('ruecknahme', EU_EVENTS[withdrawalEvent.code]!.label, [formatDateDe(withdrawalEvent.date)])] : []),
    ...(feedback && c.state === 'gefunden'
      ? [fact('rueckmeldungen', EU_RAIL_DE.portal.proposalFeedback, [...periodParts(feedback), { href: c.initiative.url, label: EU_RAIL_DE.portal.link }])]
      : []),
  ]
  sections.push(section(vorschlag, framed(proposalFacts, null), feedback ? ['Quellen:', EU_RAIL_DE.credits[1], EU_RAIL_DE.portal.credit] : CELLAR_CREDITS))

  // The deciding station, named by the procedure type.
  const parliament = p && body === 'parlament-rat' ? lastOf(p.events, 'parliament') : null
  const council = p ? lastOf(p.events, 'council') : null
  const signed = p ? lastOf(p.events, 'signature') : null
  const decided = !!(parliament || council)
  const decisionGap = !record ? DE.unreadProcedure : !p ? DE.status.noProcedure : decided ? null : ended ? DE.noDecision : DE.noDecisionYet
  const beschluss = station('beschluss', BODY_NAME[body], [
    ...(parliament ? [EU_RAIL_DE.parliament(formatDateDe(parliament.date))] : []),
    ...(council ? [EU_RAIL_DE.council(formatDateDe(council.date))] : []),
    ...(signed ? [EU_RAIL_DE.signed(formatDateDe(signed.date))] : []),
    ...(p?.reference ? [p.reference] : []),
  ], decisionGap, !p)
  stations.push(beschluss)
  const typeFact = body === 'andere' && p?.type && !EU_PROCEDURE_TYPES[p.type] ? [fact('verfahrensart', DE.procedureType, [p.type])] : []
  const rows = p ? procedureRowsOf(p, false) : null
  const all = rows ? [...rows.proposal, ...rows.decision].sort((x, y) => (x.iso < y.iso ? -1 : x.iso > y.iso ? 1 : 0)) : []
  sections.push(section(
    beschluss,
    framed([...procedureFacts(p, body === 'parlament-rat'), ...typeFact], decisionGap, ended ? [] : [EU_INITIATIVE_DE.noChannel]),
    CELLAR_CREDITS,
    all.length ? { heading: EU_RAIL_DE.record(all.length), rows: all, note: p && p.otherEvents > 0 ? EU_RAIL_DE.other(p.otherEvents) : null } : null,
  ))

  // „Amtsblatt" and the last station: reached where the Cellar names acts,
  // otherwise not (yet) — and for a withdrawn proposal the sentence that no
  // act came of it.
  const withActs = acts.length > 0 && (stand?.kind === 'rechtsakt' || stand?.kind === 'unklar')
  const kind = withActs
    ? (acts.every((a) => a.celex[5] === 'L') ? 'umsetzung' : acts.some((a) => a.celex[5] === 'L') ? 'beides' : 'geltung')
    : effectKindOf(record?.title ?? null, c)
  const effectName = kind === 'umsetzung' ? EU_RAIL_DE.name.umsetzung : kind === 'geltung' ? EU_RAIL_DE.name.geltung : kind === 'beides' ? DE.name.beides : DE.name.offen
  const withdrawnSentence = stand?.kind === 'zurueckgezogen' ? DE.withdrawnNoAct : DE.withdrawnUndatedNoAct
  const noActSentence = !record ? DE.unreadProcedure : withdrawn ? withdrawnSentence : stand?.kind === 'anhaengig' ? DE.noActYet : DE.noAct

  if (withActs) {
    const links = fact('rechtsakte', DE.acts(acts.length), acts.map(actLink))
    const amtsblatt = station('amtsblatt', EU_RAIL_DE.name.amtsblatt, acts.map((a) => a.label), null)
    const wirkung = station('wirkung', effectName, [], null)
    stations.push(amtsblatt, wirkung)
    sections.push(section(amtsblatt, framed([links], null)))
    sections.push(section(wirkung, framed([links], null, [DE.actsOnTheirPages])))
  } else {
    const aheadSentence = kind === 'umsetzung' ? DE.ahead.umsetzung : kind === 'geltung' ? DE.ahead.geltung : DE.ahead.offen
    const amtsblatt = station('amtsblatt', EU_RAIL_DE.name.amtsblatt, [], withdrawn ? DE.withdrawnRail : null, true)
    const wirkung = station('wirkung', effectName, [], null, true)
    stations.push(amtsblatt, wirkung)
    sections.push(section(amtsblatt, framed([gapFact(noActSentence)], null)))
    sections.push(section(wirkung, framed([gapFact(withdrawn || !record ? noActSentence : aheadSentence)], null)))
  }

  // The station the proposal is on: the last one reached that shows something.
  const reached = stations.filter((s) => !s.ahead)
  const current = [...reached].reverse().find((s) => s.facts.length > 0) ?? reached[reached.length - 1] ?? stations[0]!
  current.current = true

  // A withdrawn proposal takes no feedback, whatever the portal's status still says.
  const open = feedback && isOpen(feedback, today) && c.state === 'gefunden' && !withdrawn
  const { status, note } = statusOf(stand, acts)
  return {
    title: record?.title ?? DE.untitled(r.reference),
    titleNote: record?.title && !record.titleIsGerman ? DE.englishTitle : null,
    identity: `${DE.identity} · ${r.reference}`,
    status,
    statusNote: note,
    action: open ? { end: feedback.feedbackEnd, heading: null, href: c.initiative.url, label: EU_INITIATIVE_DE.action.label, note: EU_INITIATIVE_DE.action.note(formatDateDe(feedback.feedbackEnd!)) } : null,
    heading: DE.heading,
    stations,
    sections,
    eurLexUrl: r.eurLexUrl,
  }
}

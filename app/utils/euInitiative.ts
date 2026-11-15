/**
 * The page of one initiative of the Commission's portal „Ihre Meinung
 * zählt" (step 3 of the EU cycle, 15.11.2026), as words: an initiative
 * before a proposal, or a draft act of the Commission, by the portal's own
 * number (`/eu-recht/initiative/13192`).
 *
 * THE ACT PAGE'S GRAMMAR. A header card whose heading says where the
 * initiative stands, the rail of its stations, a section per station in
 * the rail's order (`EuStationSection`). The words of the portal and of
 * the stations are the act page's (`EU_RAIL_DE`), and so are its builders
 * of a period's facts (`periodFacts`, `initiativeFact`, `framed`): an
 * initiative's consultation reads the same on both pages.
 *
 * THE STATIONS AS FAR AS THE PORTAL SHOWS THEM: „Konsultation" (what the
 * Commission asked before it proposed anything) and the Commission's own
 * station — „Vorschlag" for a legislative proposal, „Rechtsakt der
 * Kommission" for a delegated or implementing act, „Annahme durch die
 * Kommission" for anything else. After the Commission the monitor does
 * not follow an initiative yet: the stations a legal act would still pass
 * stand in the rail, not reached, and each section says so in a gap
 * sentence („Nicht im Monitor") — unless a publication of the initiative
 * carries a COM number: then the monitor follows the proposal on a page of
 * its own (`euProposalPath`), the Commission's station links it, and the
 * later stations point there instead of saying „Nicht im Monitor". No
 * redirect from the initiative to the proposal: an initiative can hold
 * several proposals (102 adoption publications in 87 initiatives,
 * 15.11.2026).
 *
 * ONE BLUE ELEMENT: at an open window the way to the portal's page of the
 * initiative, where the contribution is made, with the day the window
 * closes. Dates, no durations (rule D6): no „noch N Tage".
 *
 * All German copy of the page lives here. Pure: no Vue.
 */
import type { EuInitiative, EuPortalPublication } from '#shared/types'
import { EU_MEMBER_STATE_NAME_DE, euProposalPathOfReference } from '#shared/utils/eu'
import { formatDateDe } from '#shared/utils/format'
import { gapDe } from '#shared/utils/gaps'
import { actTypeDe } from '#shared/utils/euPortal'
import { EU_RAIL_DE, anchorOf, elementIdOf, fact, framed, gapFact, initiativeFact, periodFacts, periodParts, stageDe, type EuRailSection, type EuRailStation, type EuRailStationId, type EuSectionFact } from './euRail'

/** What kind of act the Commission foresees decides the stations after it. */
type Track = 'gesetz' | 'kommission' | 'sonstiges'

const COMMISSION_ACTS = new Set(['REG_DEL', 'REG_IMPL', 'DIR_DEL', 'DIR_IMPL', 'DEC_DEL', 'DEC_IMPL', 'REG', 'DIR', 'DEC'])

function trackOf(actType: string | null | undefined): Track {
  if (actType?.startsWith('PROP_')) return 'gesetz'
  if (actType && COMMISSION_ACTS.has(actType)) return 'kommission'
  return 'sonstiges'
}

/** A directive needs a national act; anything else applies by itself or binds whom it names. */
const isDirective = (actType: string | null | undefined) => actType === 'PROP_DIR' || actType === 'DIR' || actType === 'DIR_DEL' || actType === 'DIR_IMPL'

/** The stages of „Konsultation": before the Commission proposes or drafts anything. */
const CONSULTATION_STAGES = new Set(['INIT_PLANNED', 'ROADMAP', 'PLANNING_WORKFLOW', 'OPC_LAUNCHED'])
/** The stages of the Commission's own station: its draft act, its adopted proposal or act. */
const COMMISSION_STAGES = new Set(['ISC_WORKFLOW', 'ADOPTION_WORKFLOW'])

const DE = {
  identity: 'Vorhaben der Europäischen Kommission',
  heading: 'Das Vorhaben im Verfahren',
  untitled: (id: number) => `Vorhaben Nr. ${id}`,
  englishTitle: 'Titel im Portal nur auf Englisch',
  actType: (words: string) => `Vorgesehen: ${words}`,
  source: 'Im Portal „Ihre Meinung zählt“ ansehen',
  name: {
    vorschlag: EU_RAIL_DE.name.vorschlag,
    kommission: 'Rechtsakt der Kommission',
    sonstiges: EU_RAIL_DE.portal.stage.ADOPTION_WORKFLOW!,
  },
  status: {
    open: (end: string) => `Rückmeldung möglich bis ${end}`,
    openNoEnd: 'Rückmeldung möglich',
    // The card's heading while a window is open: the stage that runs. Until when, and where to answer, is the door card's below it — as a draft's card says „In Begutachtung" and its door the Frist.
    running: (stage: string) => `${stage} läuft`,
    runningOnProposal: 'Rückmeldungen zum Vorschlag laufen',
    runningOnDraft: 'Rückmeldungen zum Entwurf eines Rechtsakts laufen',
    lastUntil: (stage: string, end: string) => `Zuletzt: ${stage}, Rückmeldungen bis ${end}`,
    lastPublished: (stage: string, day: string) => `Zuletzt: ${stage}, veröffentlicht am ${day}`,
    last: (stage: string) => `Zuletzt: ${stage}`,
  },
  action: {
    label: 'Rückmeldung im Portal der Kommission geben',
    note: (end: string | null) => (end
      ? `Rückmeldungen nimmt die Kommission bis ${end} in ihrem Portal „Ihre Meinung zählt“ entgegen. Der Link führt zur Seite des Vorhabens dort.`
      : 'Rückmeldungen nimmt die Kommission in ihrem Portal „Ihre Meinung zählt“ entgegen. Der Link führt zur Seite des Vorhabens dort.'),
  },
  published: 'Veröffentlicht',
  reference: 'Nummer',
  noProposalYet: 'Das Portal verzeichnet zu diesem Vorhaben noch keinen Vorschlag.',
  noDraftYet: 'Das Portal verzeichnet zu diesem Vorhaben noch keinen Entwurf eines Rechtsakts.',
  noAdoptionYet: 'Das Portal verzeichnet zu diesem Vorhaben noch keine Annahme durch die Kommission.',
  noConsultation: 'Das Portal verzeichnet zu diesem Vorhaben vor dem Entwurf keine Frist für Rückmeldungen.',
  notFollowedRail: gapDe('outOfScope', 'Über die Kommission hinaus verfolgt der Monitor dieses Vorhaben noch nicht.'),
  notFollowed: {
    beschluss: gapDe('outOfScope', 'Was Parlament und Rat aus einem Vorschlag dieses Vorhabens machen, verfolgt der Monitor noch nicht.'),
    amtsblatt: gapDe('outOfScope', 'Ob daraus ein Rechtsakt im Amtsblatt der Europäischen Union wird, verfolgt der Monitor bei diesem Vorhaben noch nicht.'),
    umsetzung: gapDe('outOfScope', `Die Umsetzung in ${EU_MEMBER_STATE_NAME_DE} verfolgt der Monitor bei diesem Vorhaben noch nicht.`),
    geltung: gapDe('outOfScope', 'Ab wann ein Rechtsakt daraus gilt, verfolgt der Monitor bei diesem Vorhaben noch nicht.'),
  },
  pointer: {
    title: 'Verfahren',
    label: (reference: string) => `Verfahren zu ${reference} im Monitor`,
    rail: (n: number) => (n === 1 ? 'Wie es weitergeht, zeigt die Seite des Vorschlags.' : 'Wie es weitergeht, zeigen die Seiten der Vorschläge.'),
  },
  noChannel: 'Bei Parlament und Rat sieht das Verfahren keinen Weg vor, auf dem sich Einzelne zu einem Vorschlag äußern können.',
  unread: 'Das Vorhaben konnte nicht gelesen werden: Das Portal „Ihre Meinung zählt“ der Kommission hat nicht rechtzeitig oder nicht lesbar geantwortet.',
  unreadLink: 'Das Vorhaben im Portal ansehen',
  unknown: (id: number) => `Im Portal „Ihre Meinung zählt“ gibt es kein Vorhaben mit der Nummer ${id}.`,
  unknownDescription: 'Das Portal hat auf die Frage nach dieser Nummer geantwortet, dass es sie nicht kennt.',
  back: 'Alle offenen Fristen',
  loading: 'Vorhaben wird geladen …',
  seo: {
    fallbackTitle: 'Vorhaben der Europäischen Kommission',
    description: (status: string) => `Ein Vorhaben der Europäischen Kommission im Portal „Ihre Meinung zählt“: ${status}. Wo und bis wann Rückmeldungen möglich sind oder waren, Station für Station.`,
    fallbackDescription: 'Ein Vorhaben der Europäischen Kommission im Portal „Ihre Meinung zählt“: wo und bis wann Rückmeldungen möglich sind oder waren.',
  },
  credits: ['Quelle:', EU_RAIL_DE.portal.credit] as string[],
} as const

export const EU_INITIATIVE_DE = DE

/** The door card of an EU page: its heading (until when), the sentence under it, the button. */
export interface EuWindowActionView { heading: string; href: string; label: string; note: string }

export interface EuInitiativeView {
  title: string
  /** „Titel im Portal nur auf Englisch" where the German title is missing; null otherwise. */
  titleNote: string | null
  /** „Vorgesehen: Delegierte Verordnung"; null where the portal names no kind. */
  actType: string | null
  /** The card's heading: where the initiative stands. */
  status: string
  /** The one blue element, a card of its own under the header card: only while a window is open. */
  action: EuWindowActionView | null
  heading: string
  stations: EuRailStation[]
  sections: EuRailSection[]
  /** The initiative on the portal, for the header's source link. */
  url: string
}

/** A window is open on a day: the portal says so and its last day has not passed. Shared with a proposal's page. */
export const isOpen = (p: EuPortalPublication, today: string) => p.feedbackStatus === 'OPEN' && (p.feedbackEnd === null || p.feedbackEnd >= today)

const withPeriod = (p: EuPortalPublication) => p.feedbackEnd !== null

/**
 * Whether a publication has HAPPENED. The portal lists what the Commission
 * plans beside what it did: an initiative with only a call for evidence
 * open carries its adoption already, without a day and with feedback
 * „UPCOMING" (18953 on 15.11.2026). Such a row is a plan — it is no station
 * reached and never printed as „veröffentlicht".
 */
const happened = (p: EuPortalPublication) => p.published !== null || p.feedbackEnd !== null

/** The feedback period on an adopted proposal is named as that — the adoption is a day, not a period. */
const isProposalFeedback = (p: EuPortalPublication) => p.stage === 'ADOPTION_WORKFLOW' && withPeriod(p)

/**
 * A publication of the Commission's own station as a fact: with a period,
 * its period and count (`periodFacts`); without one, the day it was
 * published; a COM number beside it, where the publication carries one.
 */
function commissionFacts(pubs: readonly EuPortalPublication[]): EuSectionFact[] {
  return pubs.flatMap((p, i) => {
    const com = p.reference && /^COM\(/.test(p.reference) ? [fact(`nummer-${i}`, DE.reference, [p.reference])] : []
    if (isProposalFeedback(p)) {
      return [
        ...(p.published ? [fact(`kommission-${i}`, stageDe(p), [`${DE.published.toLowerCase()} am ${formatDateDe(p.published)}`])] : []),
        ...com,
        fact(`rueckmeldungen-${i}`, EU_RAIL_DE.portal.proposalFeedback, periodParts(p)),
      ]
    }
    if (withPeriod(p)) return [...periodFacts([p], `kommission-${i}`), ...com]
    return [fact(`kommission-${i}`, stageDe(p), p.published ? [`${DE.published.toLowerCase()} am ${formatDateDe(p.published)}`] : [DE.published]), ...com]
  })
}

function statusOf(i: EuInitiative, today: string): string {
  const open = i.publications.filter((p) => isOpen(p, today))
  if (open.length) {
    const words = open.map((p) => (p.stage === 'ADOPTION_WORKFLOW' ? DE.status.runningOnProposal : p.stage === 'ISC_WORKFLOW' ? DE.status.runningOnDraft : DE.status.running(stageDe(p))))
    return [...new Set(words)].join(' · ')
  }
  const last = i.publications.filter(happened).at(-1)
  if (!last) return DE.identity
  if (last.feedbackEnd) return DE.status.lastUntil(stageDe(last), formatDateDe(last.feedbackEnd))
  if (last.published) return DE.status.lastPublished(stageDe(last), formatDateDe(last.published))
  return DE.status.last(stageDe(last))
}

const station = (id: EuRailStationId, name: string, facts: string[], gap: string | null, ahead = false): EuRailStation =>
  ({ id, name, current: false, facts, gap, anchor: anchorOf(id), ...(ahead ? { ahead: true } : {}) })

const section = (st: EuRailStation, facts: EuSectionFact[], gap: string | null, notes: string[] = []): EuRailSection =>
  ({ id: st.id, elementId: elementIdOf(st.id), heading: st.name, record: null, credits: [...DE.credits], ...framed(facts, gap, notes) })

/**
 * The proposals of the initiative the monitor has a page for: every
 * publication whose reference is a COM number („COM(2026)780"), each once,
 * in the portal's order — as the join to the Cellar is made, by the number
 * the publication carries and nothing looser.
 */
export function proposalsOf(i: EuInitiative): { reference: string; path: string }[] {
  const out: { reference: string; path: string }[] = []
  for (const p of i.publications) {
    const path = euProposalPathOfReference(p.reference)
    if (path && !out.some((o) => o.path === path)) out.push({ reference: p.reference!.trim(), path })
  }
  return out
}

/** The way to each proposal's page, as facts. */
const pointerFacts = (proposals: readonly { reference: string; path: string }[]): EuSectionFact[] =>
  proposals.map((p, n) => fact(`verfahren-${n}`, DE.pointer.title, [{ href: p.path, label: DE.pointer.label(p.reference), internal: true }]))

/**
 * The page of one initiative as words. `today` (ISO, Vienna) decides
 * whether a window is still open — the portal's status alone may be a day
 * old in the cache.
 */
export function euInitiativeView(i: EuInitiative, today: string): EuInitiativeView {
  const track = trackOf(i.actType)
  const consulted = i.publications.filter((p) => CONSULTATION_STAGES.has(p.stage) && withPeriod(p))
  const own = i.publications.filter((p) => COMMISSION_STAGES.has(p.stage) && happened(p))
  // Anything the monitor has no stage word for still stands, under the Commission's station.
  const other = i.publications.filter((p) => !CONSULTATION_STAGES.has(p.stage) && !COMMISSION_STAGES.has(p.stage) && withPeriod(p))

  const stations: EuRailStation[] = []
  const sections: EuRailSection[] = []

  // „Konsultation": always for a legislative proposal (the act page shows it there too); for any other kind only where the portal holds a period before the draft.
  const showConsultation = track === 'gesetz' || consulted.length > 0
  if (showConsultation) {
    const gap = consulted.length ? null : track === 'gesetz' ? EU_RAIL_DE.portal.noPeriod : DE.noConsultation
    const st = station('konsultation', EU_RAIL_DE.name.konsultation, consulted.map((p) => EU_RAIL_DE.portal.until(stageDe(p), formatDateDe(p.feedbackEnd!))), gap)
    stations.push(st)
    sections.push(section(st, [...periodFacts(consulted), initiativeFact(i)], gap))
  }

  const name = track === 'gesetz' ? DE.name.vorschlag : track === 'kommission' ? DE.name.kommission : DE.name.sonstiges
  const ownPubs = [...own, ...other]
  const ownGap = ownPubs.length ? null : track === 'gesetz' ? DE.noProposalYet : track === 'kommission' ? DE.noDraftYet : DE.noAdoptionYet
  const ownStation = station('vorschlag', name, ownPubs.map((p) => (p.feedbackEnd
    ? EU_RAIL_DE.portal.until(isProposalFeedback(p) ? EU_RAIL_DE.portal.proposalFeedback : stageDe(p), formatDateDe(p.feedbackEnd))
    : p.published ? `${stageDe(p)} ${formatDateDe(p.published)}` : stageDe(p))), ownGap, showConsultation && ownPubs.length === 0)
  stations.push(ownStation)
  const proposals = proposalsOf(i)
  sections.push(section(ownStation, [...commissionFacts(ownPubs), ...pointerFacts(proposals), ...(showConsultation ? [] : [initiativeFact(i)])], ownGap))

  // After the Commission: only a legal act passes these, and the monitor does not follow it there yet.
  if (track !== 'sonstiges') {
    const after: { id: EuRailStationId; name: string; gap: string; notes: string[] }[] = [
      ...(track === 'gesetz' ? [{ id: 'beschluss' as const, name: EU_RAIL_DE.name['parlament-rat'], gap: DE.notFollowed.beschluss, notes: [DE.noChannel] }] : []),
      { id: 'amtsblatt', name: EU_RAIL_DE.name.amtsblatt, gap: DE.notFollowed.amtsblatt, notes: [] },
      isDirective(i.actType)
        ? { id: 'wirkung', name: EU_RAIL_DE.name.umsetzung, gap: DE.notFollowed.umsetzung, notes: [] }
        : { id: 'wirkung', name: EU_RAIL_DE.name.geltung, gap: DE.notFollowed.geltung, notes: [] },
    ]
    after.forEach((a, n) => {
      // As on a draft's rail, only the first station not reached says anything; the sections below say it each.
      // Where the monitor follows a proposal of the initiative, they point to its page instead.
      const railLine = proposals.length ? DE.pointer.rail(proposals.length) : DE.notFollowedRail
      const st = station(a.id, a.name, [], n === 0 && !ownStation.ahead ? railLine : null, true)
      stations.push(st)
      sections.push(section(st, proposals.length ? pointerFacts(proposals) : [gapFact(a.gap)], null, a.notes))
    })
  }

  // The station the initiative is on: the last one the portal shows something at.
  const reached = stations.filter((s) => !s.ahead)
  const current = [...reached].reverse().find((s) => s.facts.length > 0) ?? reached[reached.length - 1] ?? stations[0]!
  current.current = true

  const open = i.publications.filter((p) => isOpen(p, today))
  const end = open.map((p) => p.feedbackEnd).filter((e): e is string => e !== null).sort()[0] ?? null
  return {
    title: i.titleDe ?? i.title ?? DE.untitled(i.id),
    titleNote: !i.titleDe && i.title ? DE.englishTitle : null,
    actType: actTypeDe(i.actType) ? DE.actType(actTypeDe(i.actType)!) : null,
    status: statusOf(i, today),
    // The soonest closing day: two windows open at once closed on the same day in every case of 15.11.2026; where they differ, each section names its own.
    action: open.length ? { heading: end ? DE.status.open(formatDateDe(end)) : DE.status.openNoEnd, href: i.url, label: DE.action.label, note: DE.action.note(end ? formatDateDe(end) : null) } : null,
    heading: DE.heading,
    stations,
    sections,
    url: i.url,
  }
}

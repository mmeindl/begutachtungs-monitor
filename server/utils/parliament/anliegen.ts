/**
 * The course of an Anliegen an das Parlament — a Petition, a
 * parlamentarische Bürgerinitiative or a Volksbegehren in the Nationalrat,
 * a Petition an den Bundesrat — read from its Verlauf, and the rest of its page from the detail JSON (step 1 of
 * `docs/research/umsetzungsplan-petitionen-volksbegehren.md`).
 *
 * PURE MODULE — no Nuxt auto-imports, only relative imports, so vitest and
 * `scripts/corpus/anliegen.ts` run the same reading as the endpoint.
 *
 * THE COURSE COMES FROM THE STAGES, NEVER FROM THE STATUS. `status.number` 5
 * stands on 76 Petitionen and 16 Bürgerinitiativen without an ending, and
 * `status.description` is only the last stage on 37 of 58 items still in
 * deliberation (step 0, 15.11.2026). Every pattern below is anchored on
 * Parliament's wording as counted there; a stage none of them recognises is
 * counted in `unreadStages` and its text goes nowhere.
 *
 * NO NAME OF A PRIVATE PERSON LEAVES THIS MODULE.
 *  - `names[]`: only „Petition überreicht von" entries are kept, and of
 *    them only the club (`frak_code`): the page states who handed a Petition
 *    in by club, as an Initiativantrag's movers (decision 6 of the plan), so
 *    no member's name is read or cached either. The Erstunterzeichner of a
 *    Bürgerinitiative is a private person on all 36 of GP XXVIII; the
 *    function text decides, not the kind (one Bürgerinitiative carries a
 *    „Petition überreicht von" entry).
 *  - A committee's request for a statement keeps its date and whether it was
 *    adopted, never whom it asks: 222 of 1,796 addressees carry a person
 *    behind a „;", others behind a „*", and some requests go to a person
 *    alone.
 *  - No stage text is returned at all, only the typed facts read off it.
 */
import type {
  AnliegenClubVote,
  AnliegenCommittee,
  AnliegenCounts,
  AnliegenCourse,
  AnliegenDetail,
  AnliegenDisposal,
  AnliegenDuties,
  AnliegenEnd,
  AnliegenKind,
  AnliegenParticipation,
  AnliegenPeriodRef,
  AnliegenPlenary,
  AnliegenPresenter,
  AnliegenReportRef,
  AnliegenResolution,
  AnliegenRoot,
  AnliegenSitting,
  AnliegenStatementRequest,
  AnliegenSubjectCommittee,
  AnliegenTransmission,
} from '../../../shared/types'
import {
  BUNDESRAT_PETITION_CITATION_RE,
  anliegenCitation,
  anliegenIsBundesrat,
  anliegenParliamentUrl,
  anliegenRootOfHref,
} from '../../../shared/utils/anliegen'
import { romanToInt } from '../../../shared/utils/gp'
import { parliamentPathname } from '../../../shared/utils/safeExternalUrl'
import { parseGermanDate, parseIsoDate } from './dates'
import { isFilingOpen, mapDocuments, type RawDocumentGroup } from './detailJson'
import { extractLinks, stripHtmlToText } from './htmlText'

// ---------------------------------------------------------------------------
// Raw shapes (loosely typed — upstream is not contractual)
// ---------------------------------------------------------------------------

export interface RawAnliegenStage {
  date?: string | null
  text?: string | null
}

export interface RawAnliegenPhase {
  name?: string | null
  stages?: RawAnliegenStage[] | null
}

export interface RawAnliegenName {
  funktext?: string | null
  name?: string | null
  frak_code?: string | null
}

/** As much of an Anliegen's detail JSON as this module reads. */
export interface AnliegenContent {
  ityp?: string | null
  doktyp?: string | null
  title?: string | null
  zitation?: string | null
  einlangen?: string | null
  statementsstate?: unknown
  approvalstate?: unknown
  status?: { number?: number | string | null; description?: string | null } | null
  phase?: RawAnliegenPhase[] | null
  documents?: RawDocumentGroup[] | null
  names?: RawAnliegenName[] | null
  reference?: { text?: string | null; url?: string | null; zitation?: string | null }[] | null
}

// ---------------------------------------------------------------------------
// Identity and the reduced record
// ---------------------------------------------------------------------------

/**
 * Whether the record is the item the address asked for. The detail endpoint
 * has answered with another item of the same number (`volksbegehren.md`
 * §5.1), so every read asserts the type: `PET`, `BI`, and for a Volksbegehren
 * the document type `VOLKBG` (its item type `I` is every Beilage's).
 */
export function assertAnliegenContent(content: AnliegenContent | null | undefined, root: AnliegenRoot): boolean {
  if (!content) return false
  switch (root.kind) {
    case 'petition': return (content.ityp ?? '').trim() === 'PET'
    case 'buergerinitiative': return (content.ityp ?? '').trim() === 'BI'
    case 'volksbegehren': return (content.doktyp ?? '').trim() === 'VOLKBG'
    case 'petition-bundesrat': return (content.ityp ?? '').trim() === 'PET-BR'
  }
}

/**
 * The first period from which a Volksbegehren's page is true. Step 0
 * (15.11.2026, all 85 rows): 15 carry a single „Einlangen" stage (GP X to
 * XVIII) and 6 a committee report with no plenary step found (GP XX, XXI);
 * from GP XXII on the record carries the course. Before it, the address
 * answers with Parliament's link (and `NotFollowedData.anliegenFrom`).
 */
export const VOLKSBEGEHREN_FIRST_GP = 'XXII'

/**
 * Whether the monitor has a page for the item: every Petition and
 * Bürgerinitiative, a Volksbegehren from `VOLKSBEGEHREN_FIRST_GP` on. Pure,
 * so the refusal comes before any upstream read.
 */
export function anliegenIsFollowed(root: AnliegenRoot): boolean {
  // Every Petition an den Bundesrat: all 42 records carry their course (15.11.2026).
  if (root.kind !== 'volksbegehren') return true
  const gp = romanToInt(root.gp)
  const first = romanToInt(VOLKSBEGEHREN_FIRST_GP)
  return gp !== null && first !== null && gp >= first
}

/**
 * Where the old address of a Volksbegehren leads — `/entwuerfe/<gp>/vorlage/<nr>`,
 * which reads it as a Beilage of type `I` — and whether it leads anywhere.
 *
 *  - `followed`: its page `/anliegen/<gp>/volksbegehren/<nr>`; the address
 *    301s there, as an Einspruch's leads to its law (`requireVorlageItem`).
 *  - `before-first-gp`: a Volksbegehren before `VOLKSBEGEHREN_FIRST_GP`;
 *    the refusal with Parliament's address stays, and says from which
 *    period on Volksbegehren are followed.
 *  - null: no Volksbegehren (`pageKindOf` keeps `VOLKBG` without a page of
 *    its own among the Vorlagen, so only the document type decides here).
 */
export function volksbegehrenOfVorlage(
  gp: string,
  ityp: string,
  inr: number,
  doktyp: string | null | undefined,
): { root: AnliegenRoot; followed: boolean } | null {
  if (ityp !== 'I' || (doktyp ?? '').trim() !== 'VOLKBG') return null
  const root: AnliegenRoot = { gp, kind: 'volksbegehren', inr }
  return { root, followed: anliegenIsFollowed(root) }
}

/** The one function text whose entries are kept — members of the Nationalrat or the Bundesrat, by club only (41 of 42 Petitionen an den Bundesrat; the 42nd says „Eingebracht von" and is dropped). */
export const PRESENTER_FUNKTEXT = 'Petition überreicht von'

/** content.names[] → the clubs of the members who handed a Petition in; every other entry, and every name, is dropped. */
export function presentersOf(names: readonly RawAnliegenName[] | null | undefined): AnliegenPresenter[] {
  if (!Array.isArray(names)) return []
  const out: AnliegenPresenter[] = []
  for (const n of names) {
    if (n?.funktext !== PRESENTER_FUNKTEXT) continue
    out.push({ club: (n.frak_code ?? '').trim() || null })
  }
  return out
}

const REQUEST_STAGE = /^Antrag auf Einholung einer Stellungnahme von\b/
const REQUEST_ADOPTED = /-\s*angenommen\s*$/
/** A Petition an den Bundesrat's plenary stages that name members: the Berichterstatter, and the movers of an Entschließungsantrag. */
const BR_REPORTER_STAGE = /^(\d+\. Sitzung)\s*:\s*Berichterstattung durch\b/
const BR_RESOLUTION_STAGE = /^Unselbständiger Entschließungsantrag der Bundesr(?:ä|a)t/
const BR_RESOLUTION_ADOPTED = /\bangenommen\s*\((\d+\/E-BR\/\d+)\)/

/**
 * A stage cut to what may be kept: the addressee of a request for a
 * statement, a Bundesrat's Berichterstatter and the movers of an
 * Entschließungsantrag are replaced, keeping only what the reader reads
 * off the line (adopted or not, the Entschließung's number).
 */
function reduceStageText(text: string): string {
  const plain = stripHtmlToText(text)
  if (REQUEST_STAGE.test(plain)) {
    const adopted = REQUEST_ADOPTED.test(plain)
    return `Antrag auf Einholung einer Stellungnahme von (gekürzt)${adopted ? ' - <b>angenommen</b>' : ''}`
  }
  const reporter = BR_REPORTER_STAGE.exec(plain)
  if (reporter?.[1]) return `${reporter[1]}: Berichterstattung durch (gekürzt)`
  if (BR_RESOLUTION_STAGE.test(plain)) {
    const adopted = BR_RESOLUTION_ADOPTED.exec(plain)
    return `Unselbständiger Entschließungsantrag der Bundesräte (gekürzt)${adopted?.[1] ? `<br>angenommen (${adopted[1]})` : ''}`
  }
  return text
}

/**
 * The record as it may be kept: the keys this module reads, `names[]`
 * reduced to the presenters' function text and club (no name), every stage cut to its date and text (the
 * speakers' table and the protocol anchors beside it go), and the addressee
 * of every request for a statement, a Bundesrat's Berichterstatter and the
 * movers of an Entschließungsantrag replaced (`reduceStageText`) — so no
 * name reaches a cache, whatever reads the record next.
 */
export function reduceAnliegenContent(content: AnliegenContent | null | undefined): AnliegenContent | null {
  if (!content) return null
  const phase = (Array.isArray(content.phase) ? content.phase : []).map((p) => ({
    name: p?.name ?? null,
    stages: (Array.isArray(p?.stages) ? p.stages : []).map((s) => ({ date: s?.date ?? null, text: reduceStageText(s?.text ?? '') })),
  }))
  return {
    ityp: content.ityp ?? null,
    doktyp: content.doktyp ?? null,
    title: content.title ?? null,
    zitation: content.zitation ?? null,
    einlangen: content.einlangen ?? null,
    statementsstate: content.statementsstate ?? null,
    approvalstate: content.approvalstate ?? null,
    status: content.status ? { number: content.status.number ?? null, description: content.status.description ?? null } : null,
    phase,
    documents: content.documents ?? null,
    names: presentersOf(content.names).map((p) => ({ funktext: PRESENTER_FUNKTEXT, frak_code: p.club })),
    reference: (content.reference ?? []).map((r) => ({ text: r?.text ?? null, url: r?.url ?? null, zitation: r?.zitation ?? null })),
  }
}

// ---------------------------------------------------------------------------
// Participation
// ---------------------------------------------------------------------------

/**
 * The two doors, from the item's own flags. Statements: `statementsstate`
 * read as `isFilingOpen` reads it. Unterstützung: `approvalstate` „1" open,
 * „9 …" impossible (every Volksbegehren: „9 Keine Zustimmung bei dem Doktyp
 * "VOLKBG" möglich"), anything else closed. The flags never differed on one
 * item in 616 (step 0), but each door reads its own.
 */
export function participationOf(content: Pick<AnliegenContent, 'statementsstate' | 'approvalstate'> | null | undefined): AnliegenParticipation {
  const approval = content?.approvalstate
  const support = approval === '1' || approval === 1
    ? 'open'
    : (typeof approval === 'string' && /^9/.test(approval.trim())) || approval === 9
        ? 'impossible'
        : 'closed'
  return { statements: isFilingOpen(content) ? 'open' : 'closed', support }
}

// ---------------------------------------------------------------------------
// Votes
// ---------------------------------------------------------------------------

/** A club code as the vote lines spell them: letters, a hyphen, a space — never a digit. */
const CLUB_TOKEN = /^[A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß -]{0,29}$/
const CLUB_VOTE = /\bDafür:\s*(.+?),\s*dagegen:\s*(.*)$/

/**
 * The vote on a step. Only the shape „Dafür: A, B, dagegen: C" is read into
 * clubs. Anything else that records a split — „mehrstimmig ( dafür S, V; …
 * )" of GP XXV, or the first shape with a remark after it („(dafür teilweise
 * …)", „( nicht anwesend … )": 21 stages of the Petitionen and
 * Bürgerinitiativen of GP XXV–XXVIII, 12 of the Volksbegehren) — says no more
 * than that a majority carried it: a club named „dagegen" that partly voted
 * for would be our misreading. „Einstimmig" alone is neither.
 */
export function readClubVote(text: string): { vote: AnliegenClubVote | null; majorityOnly: boolean } {
  const m = CLUB_VOTE.exec(text)
  if (m?.[1] !== undefined && m[2] !== undefined) {
    const forRaw = m[1]
    const againstRaw = m[2].trim()
    const remark = /[(;)]/.test(forRaw) || /[(;)]/.test(againstRaw)
    const forClubs = forRaw.split(',').map((c) => c.trim())
    const againstClubs = againstRaw === '-' ? [] : againstRaw.split(',').map((c) => c.trim())
    if (!remark && [...forClubs, ...againstClubs].every((c) => CLUB_TOKEN.test(c))) {
      return { vote: { for: forClubs, against: againstClubs }, majorityOnly: false }
    }
    return { vote: null, majorityOnly: true }
  }
  return { vote: null, majorityOnly: /\bmehrstimmig\b/i.test(text) }
}

// ---------------------------------------------------------------------------
// The stages, one by one
// ---------------------------------------------------------------------------

/** One stage, recognised. `known` carries no fact; `unread` matched nothing. */
type StageEvent =
  | { t: 'known' }
  | { t: 'unread' }
  | { t: 'arrival' }
  | { t: 'request'; adopted: boolean }
  | { t: 'assign'; name: string; frist: string | null }
  | { t: 'sitting'; committee: string; adjourned: boolean }
  | { t: 'entry'; committee: string }
  | { t: 'disposal'; kind: 'kenntnisnahme' | 'zuweisung'; to: string | null; vote: AnliegenClubVote | null; majorityOnly: boolean }
  | { t: 'sammelbericht'; ref: AnliegenReportRef }
  | { t: 'report'; committee: string; ref: AnliegenReportRef }
  | { t: 'plenary'; kind: 'bericht-zur-kenntnis' | 'kenntnisnahme'; vote: AnliegenClubVote | null; majorityOnly: boolean }
  | { t: 'first-reading' }
  | { t: 'duty'; which: 'deliberationBy' | 'reportBy'; day: string }
  | { t: 'resolution'; ref: string; adopted: boolean }
  | { t: 'carried-to'; to: AnliegenPeriodRef | null }

const SESSION_PREFIX = /^\d+\.\s*Sitzung des Nationalrates\s*:\s*/
/** „Verfassungsausschuss:", „Unterausschuss des Unterrichtsausschusses :", „Besonderer Ausschuß zur …:". */
const COMMITTEE_PREFIX = /^([^:]*?(?:ausschu(?:ss|ß)|Ausschu(?:ss|ß))[^:]*?)\s*:\s*/
const SUBCOMMITTEE = /^Unterausschuss de[rs]\b/

// Lines that are known and carry no fact the course keeps (step 0's
// vocabulary). Anchored on the whole line: a known line with something
// after it — „Auf der Tagesordnung der 12. Sitzung des Nationalrates
// Miterledigung" — is not this line and stays unread.
const IGNORED_WHOLE: readonly RegExp[] = [
  /^Verhandlungsgegenstand gem\. § 21 Abs\. 1a GOG$/,
  /^Vorgesehen für den .+$/,
  /^Auf der Tagesordnung der \d+\. Sitzung des Nationalrates$/,
  /^Wortmeldungen in der Debatte$/,
  /^Antrag auf Ausschussbegutachtung der Vorlage \(\d+\/AUA\)$/,
  /^Übermittlung des Beschlusses an .+$/,
  /^Auszugsweise Darstellung betreffend .+$/,
  /^Livestream zur Sitzung \(\d+\/VER\)$/,
  /^Mitteilung der auf Ersuchen des Ausschusses für Petitionen und Bürgerinitiativen erfolgten Zuweisung an den .+$/,
]
// After „N. Sitzung des Nationalrates:".
const IGNORED_IN_SESSION: readonly RegExp[] = [
  /^Mitteilung des Einlangens(?: und der Zuweisung(?: an den .+)?)?$/,
  /^Mitteilung der auf Ersuchen des Ausschusses für Petitionen und Bürgerinitiativen erfolgten Zuweisung an den .+$/,
  /^Debatte$/,
  // The members' procedural motions (erste Lesung, besonderer Ausschuss,
  // Fristsetzung, Rückverweisung) and their Entschließungsanträge in the
  // debate: steps of the members, not of the item; their names are not read.
  /^Antrag de[rs] Abgeordneten\b.*\(\s*\d+\/GO\s*\)/,
  /^Unselbständiger Entschließungsantrag der Abgeordneten\b/i,
  /^Wahl des besonderen Ausschusses\b/i,
]
// After „<Ausschuss>:".
const IGNORED_IN_COMMITTEE: readonly RegExp[] = [
  /^$/,
  /^Beschlussfassung auf Einholung schriftlicher Stellungnahmen im Rahmen eine[sr] "?Ausschussbegutachtung/,
]
// After „<Ausschuss>:" — a stage of that committee that is no sitting and no report.
const COMMITTEE_ENTRY: readonly RegExp[] = [
  /^Unterausschuss eingesetzt\b/,
  /^Zuweisung an einen bereits eingesetzten Unterausschuss\b/,
  /^Vorbehandlung abgeschlossen$/,
]

const ASSIGN = /^Zuweisung an den (.+?)(?:\s*\(Frist:\s*(\d{2}\.\d{2}\.\d{4})\))?$/
const SITTING = /^auf Tagesordnung in der \d+\. Sitzung des Ausschusses$/
const SUB_SITTING = /^Vorbehandlung in der\b/
const ADJOURNED = /\bvertagt\b/
const RESUMED = /\bWiederaufnahme der am\b/
const DISPOSAL_KENNTNIS = /^Antrag, die (?:Petition|parlamentarische Bürgerinitiative) durch Kenntnisnahme im Ausschuss zu erledigen(?:\s|$)/
// „den Präsidenten" and „die Präsidentin" (GP XXV): a reader anchored on the
// first missed every Zuweisung of GP XXV and counted 55 forwarded items as
// „plenary only" (step 0).
const DISPOSAL_ZUWEISUNG = /^Ersuchen an (?:den Präsidenten|die Präsidentin) um Zuweisung an den (.+?)(?:\s+(?:mehrstimmig|einstimmig|Einstimmig)\b.*)?$/
const SAMMELBERICHT = /^Sammelbericht des Ausschusses für Petitionen und Bürgerinitiativen \((\d+\s*d\.B\.)\)$/
const COMMITTEE_REPORT = /^(?:Miterledigt mit )?Bericht (\d+\s*d\.B\.)(?:\s+und Zu \d+\s*d\.B\.)?$/
const PLENARY_REPORT = /^(?:Abstimmung:\s*)?Antrag, den (?:ablehnenden )?Ausschussbericht zur Kenntnis zu nehmen[,:]? angenommen\b/
const PLENARY_REPORT_OLD = /^Antrag auf Kenntnisnahme angenommen\b/
const PLENARY_KENNTNIS = /^Kenntnisnahme$/
const FIRST_READING = /^Erste Lesung$/
const DUTY_DELIBERATION = /^Frist für die Aufnahme der Vorberatung:\s*(\d{2}\.\d{2}\.\d{4})/
const DUTY_REPORT = /^Fristsetzung für Berichterstattung:\s*(\d{2}\.\d{2}\.\d{4})/
const RESOLUTION = /^Abstimmung über die dem Aus\w*bericht beigedruckten Entschließung (\d+\/AEA)\b/
const CARRY_OUT = /^Verhandlungsgegenstand der nächstfolgenden GP gem\. § 21 Abs\. 1a GOG\b/
const REPORT_LINK = /^\/gegenstand\/[IVXLC]+\/I\/\d+(?:\/|$)/

/** The Beilage a report stage links, else its citation alone. */
function reportRef(citation: string, html: string): AnliegenReportRef {
  const link = extractLinks(html).find((l) => REPORT_LINK.test(parliamentPathname(l.url) ?? ''))
  return { citation: citation.replace(/\s+/g, ' '), url: link?.url ?? null }
}

/** The successor a carry-over line or status names: its link first, else the citation in brackets. */
export function carriedToOf(html: string | null | undefined): AnliegenPeriodRef | null {
  const source = html ?? ''
  for (const link of extractLinks(source)) {
    const root = anliegenRootOfHref(parliamentPathname(link.url))
    if (root) return { gp: root.gp, inr: root.inr }
  }
  const cited = /\(([^()]*\.\s*GP)\)\s*$/.exec(stripHtmlToText(source))
  const root = cited?.[1] ? anliegenRootOfHref(cited[1]) : null
  return root ? { gp: root.gp, inr: root.inr } : null
}

/** One stage → what it says. Pure; no text leaves it. */
function classifyStage(html: string): StageEvent {
  const lines = html.split(/<br\s*\/?>/i).map((l) => stripHtmlToText(l)).filter(Boolean)
  const full = stripHtmlToText(html)
  const head = lines[0] ?? ''
  const tail = lines.slice(1).join(' ')

  if (REQUEST_STAGE.test(full)) return { t: 'request', adopted: REQUEST_ADOPTED.test(full) }
  if (full === 'Einlangen im Nationalrat') return { t: 'arrival' }
  if (CARRY_OUT.test(full)) return { t: 'carried-to', to: carriedToOf(html) }
  if (IGNORED_WHOLE.some((re) => re.test(full))) return { t: 'known' }

  const session = SESSION_PREFIX.exec(head)
  if (session) {
    const body = head.slice(session[0].length)
    if (IGNORED_IN_SESSION.some((re) => re.test(body))) return { t: 'known' }
    if (PLENARY_REPORT.test(body) || PLENARY_REPORT_OLD.test(body)) return { t: 'plenary', kind: 'bericht-zur-kenntnis', ...readClubVote(full) }
    if (PLENARY_KENNTNIS.test(body)) return { t: 'plenary', kind: 'kenntnisnahme', ...readClubVote(full) }
    if (FIRST_READING.test(body)) return { t: 'first-reading' }
    const resolution = RESOLUTION.exec(body)
    if (resolution?.[1]) return { t: 'resolution', ref: resolution[1], adopted: /\bangenommen\b/.test(full) && !/\babgelehnt\b/.test(full) }
    const assign = ASSIGN.exec(body)
    if (assign?.[1] && !tail) return { t: 'assign', name: assign[1].trim(), frist: parseGermanDate(assign[2]) }
    return { t: 'unread' }
  }

  // Before the committee prefix: „Zuweisung an den Gesundheitsausschuss
  // (Frist: 23.03.2022)" has a colon of its own.
  const assign = ASSIGN.exec(head)
  if (assign?.[1] && !tail) return { t: 'assign', name: assign[1].trim(), frist: parseGermanDate(assign[2]) }

  const committee = COMMITTEE_PREFIX.exec(head)
  if (committee?.[1]) {
    const name = committee[1].trim()
    const body = head.slice(committee[0].length)
    if (IGNORED_IN_COMMITTEE.some((re) => re.test(body)) && !tail) return { t: 'known' }
    if (SITTING.test(body)) return { t: 'sitting', committee: name, adjourned: ADJOURNED.test(tail) && !RESUMED.test(tail) }
    if (SUBCOMMITTEE.test(name) && SUB_SITTING.test(body)) return { t: 'sitting', committee: name, adjourned: ADJOURNED.test(full) && !RESUMED.test(full) }
    if (COMMITTEE_ENTRY.some((re) => re.test(body))) return { t: 'entry', committee: name }
    if (DISPOSAL_KENNTNIS.test(body)) return { t: 'disposal', kind: 'kenntnisnahme', to: null, ...readClubVote(full) }
    const zuweisung = DISPOSAL_ZUWEISUNG.exec(body)
    if (zuweisung?.[1]) return { t: 'disposal', kind: 'zuweisung', to: zuweisung[1].trim(), ...readClubVote(full) }
    const sammel = SAMMELBERICHT.exec(body)
    if (sammel?.[1] && !tail) return { t: 'sammelbericht', ref: reportRef(sammel[1], html) }
    const report = COMMITTEE_REPORT.exec(body)
    if (report?.[1] && !tail) return { t: 'report', committee: name, ref: reportRef(report[1], html) }
    const deliberation = DUTY_DELIBERATION.exec(body)
    if (deliberation?.[1]) return { t: 'duty', which: 'deliberationBy', day: deliberation[1] }
    const reportBy = DUTY_REPORT.exec(body)
    if (reportBy?.[1]) return { t: 'duty', which: 'reportBy', day: reportBy[1] }
    return { t: 'unread' }
  }

  return { t: 'unread' }
}

// ---------------------------------------------------------------------------
// The course
// ---------------------------------------------------------------------------

interface DatedStage {
  date: string | null
  html: string
}

/**
 * Every stage of every phase, sorted by date — STABLE, so stages of one day
 * keep Parliament's order. The stages come phase by phase, not in order of
 * time: the plenary's „Mitteilung des Einlangens" of December stands after
 * the committee's sitting of February (step 0). Undated stages go last.
 */
export function stagesByDate(phases: readonly RawAnliegenPhase[] | null | undefined): DatedStage[] {
  const all: DatedStage[] = []
  for (const p of Array.isArray(phases) ? phases : []) {
    for (const s of Array.isArray(p?.stages) ? p.stages : []) {
      all.push({ date: parseGermanDate(s?.date) ?? parseIsoDate(s?.date), html: s?.text ?? '' })
    }
  }
  return all
    .map((s, i) => ({ s, i }))
    .sort((a, b) => {
      if (a.s.date === b.s.date) return a.i - b.i
      if (a.s.date === null) return 1
      if (b.s.date === null) return -1
      return a.s.date < b.s.date ? -1 : 1
    })
    .map(({ s }) => s)
}

/** The date of the latest stage, ISO — the list's „last step" — or null. */
export function lastStageDate(phases: readonly RawAnliegenPhase[] | null | undefined): string | null {
  let last: string | null = null
  for (const s of stagesByDate(phases)) if (s.date && (!last || s.date > last)) last = s.date
  return last
}

/** Committee names compared as Parliament spells them in both orthographies („Verfassungsausschuß"). */
function sameCommittee(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false
  const norm = (s: string) => s.replace(/ß/g, 'ss').replace(/\s+/g, ' ').trim().toLowerCase()
  return norm(a) === norm(b)
}

const PREDECESSOR_REFERENCE = /^Neuverteilung gem\. § 21 Abs\. 1a GOG\b/

/** The predecessor in the previous period, from `reference[]`. */
export function carriedFromOf(reference: AnliegenContent['reference']): AnliegenPeriodRef | null {
  for (const r of reference ?? []) {
    if (!PREDECESSOR_REFERENCE.test((r?.text ?? '').trim())) continue
    const root = anliegenRootOfHref(r?.url)
    if (root) return { gp: root.gp, inr: root.inr }
  }
  return null
}

/** `end`: carried over, else the plenary, else the committee's disposal, else open. */
function endOf(course: Omit<AnliegenCourse, 'end'>): AnliegenEnd {
  if (course.carriedTo) return 'uebernommen'
  if (course.plenary) return 'plenum'
  if (course.disposal?.kind === 'kenntnisnahme') return 'kenntnisnahme-ausschuss'
  if (course.disposal?.kind === 'zuweisung') return 'zuweisung'
  return 'offen'
}

/**
 * The course of one item. `kind` decides which facts it may carry: a
 * Volksbegehren has no disposal by the Petitionen committee, a Petition no
 * erste Lesung — a stage of the other kind's vocabulary counts as unread.
 */
export function readAnliegenCourse(content: AnliegenContent | null | undefined, kind: AnliegenKind): AnliegenCourse {
  return foldCourse(content, kind).course
}

// --- Measured surface: exported for `scripts/corpus/anliegen.ts`, not for the app. ---
/**
 * The positions, in `stagesByDate(content.phase)`, of the stages the course
 * counted as unread — positions only, so the corpus script masks the text
 * itself (`shape()`) and no stage text leaves this module.
 */
export function unreadStagePositions(content: AnliegenContent | null | undefined, kind: AnliegenKind): number[] {
  return foldCourse(content, kind).unreadAt
}

function foldCourse(content: AnliegenContent | null | undefined, kind: AnliegenKind): { course: AnliegenCourse; unreadAt: number[] } {
  if (anliegenIsBundesrat(kind)) return foldBundesratCourse(content)
  const vb = kind === 'volksbegehren'
  const stages = stagesByDate(content?.phase)
  const events = stages.map((s, i) => ({ date: s.date, e: classifyStage(s.html), i }))
  // The subject committee's name is known from the disposal before its own
  // Zuweisung stage is read (XXV/BI/1: Ersuchen 25.03.2014, Zuweisung 26.03.).
  const forwardedTo = vb ? null : [...events].reverse().find((x) => x.e.t === 'disposal' && x.e.kind === 'zuweisung')
  const subjectName = forwardedTo?.e.t === 'disposal' ? forwardedTo.e.to : null

  let arrivedAt: string | null = parseIsoDate(content?.einlangen)
  let carriedTo: AnliegenPeriodRef | null = carriedToOf(
    CARRY_OUT.test(stripHtmlToText(content?.status?.description ?? '')) ? content?.status?.description : null,
  )
  let committee: AnliegenCommittee | null = null
  let disposal: AnliegenDisposal | null = null
  let plenary: AnliegenPlenary | null = null
  let firstReading: string | null = null
  const duties: AnliegenDuties = { deliberationBy: null, reportBy: null }
  let committeeReport: AnliegenReportRef | null = null
  let sammelbericht: AnliegenReportRef | null = null
  const resolutions: AnliegenResolution[] = []
  const subject = { assignedAt: null as string | null, report: null as AnliegenReportRef | null, entries: 0, sittings: [] as AnliegenSitting[] }
  const unreadAt: number[] = []
  const requestAt: number[] = []

  for (const { date, e, i } of events) {
    const unread = () => unreadAt.push(i)
    if (e.t === 'known') continue
    if (e.t === 'carried-to') {
      carriedTo ??= e.to
      continue
    }
    // An undated stage cannot be placed in the course; it counts like one not understood.
    if (e.t === 'unread' || !date) {
      unread()
      continue
    }
    switch (e.t) {
      case 'arrival':
        arrivedAt ??= date
        break
      case 'request':
        // A request names no committee; it is the first committee's.
        committee = ensureCommittee(committee, '', null)
        committee.statementRequests.push({ date, adopted: e.adopted } satisfies AnliegenStatementRequest)
        requestAt.push(i)
        break
      case 'assign':
        if (!committee?.name) {
          committee = ensureCommittee(committee, e.name, date)
          committee.name = e.name
          committee.assignedAt ??= date
          // „Zuweisung an den Gesundheitsausschuss (Frist: 23.03.2022)": the
          // older spelling of the same Frist für die Aufnahme der Vorberatung.
          if (vb && e.frist) duties.deliberationBy ??= e.frist
        } else if (subjectName && sameCommittee(e.name, subjectName)) {
          subject.assignedAt ??= date
        } else if (!sameCommittee(e.name, committee.name)) {
          unread()
        }
        break
      case 'sitting':
      case 'entry':
      case 'report': {
        const named = committee?.name ?? ''
        const own = named !== '' && (sameCommittee(e.committee, named) || (vb && SUBCOMMITTEE.test(e.committee)))
        const theirs = !own && subjectName !== null && (sameCommittee(e.committee, subjectName) || SUBCOMMITTEE.test(e.committee))
        if (theirs) {
          subject.entries++
          if (e.t === 'sitting') subject.sittings.push({ date, adjourned: e.adjourned })
          if (e.t === 'report') subject.report = e.ref
        } else if (own || named === '') {
          committee = ensureCommittee(committee, e.committee, null)
          committee.name ||= e.committee
          if (e.t === 'sitting') committee.sittings.push({ date, adjourned: e.adjourned })
          else if (e.t === 'report' && vb) committeeReport = e.ref
          else if (e.t === 'report') unread()
        } else {
          unread()
        }
        break
      }
      case 'disposal':
        if (vb) unread()
        else disposal = { kind: e.kind, date, to: e.to, vote: e.vote, majorityOnly: e.majorityOnly, report: null }
        break
      case 'sammelbericht':
        if (vb) {
          unread()
        } else {
          sammelbericht = e.ref
          if (disposal && !disposal.report) disposal.report = e.ref
        }
        break
      case 'plenary':
        if (!vb && e.kind === 'kenntnisnahme') unread()
        else plenary = { date, kind: e.kind, report: vb ? committeeReport : sammelbericht, vote: e.vote, majorityOnly: e.majorityOnly }
        break
      case 'first-reading':
        if (vb) firstReading ??= date
        else unread()
        break
      case 'duty':
        if (vb) duties[e.which] ??= parseGermanDate(e.day)
        else unread()
        break
      case 'resolution':
        if (!vb) unread()
        else if (e.adopted) resolutions.push({ date, ref: e.ref })
        break
    }
  }

  // Requests with no committee named anywhere in the record leave a
  // committee without a name: no committee the page can name, and the
  // requests are counted as unread rather than dropped in silence.
  if (committee && !committee.name) {
    committee = null
    unreadAt.push(...requestAt)
    unreadAt.sort((a, b) => a - b)
  }

  let subjectCommittee: AnliegenSubjectCommittee | null = null
  if (subjectName) {
    const last = subject.sittings.at(-1)
    subjectCommittee = {
      name: subjectName,
      assignedAt: subject.assignedAt,
      report: subject.report,
      lastSitting: last?.date ?? null,
      adjourned: last?.adjourned ?? false,
      noEntry: subject.entries === 0,
    }
  }

  const course: Omit<AnliegenCourse, 'end'> = {
    arrivedAt,
    carriedFrom: carriedFromOf(content?.reference),
    carriedTo,
    committee,
    disposal: vb ? null : disposal,
    subjectCommittee: vb ? null : subjectCommittee,
    plenary,
    firstReading: vb ? firstReading : null,
    duties: vb ? duties : null,
    committeeReport: vb ? committeeReport : null,
    resolutions: vb ? resolutions : [],
    transmission: null,
    withdrawnAt: null,
    documentsWithheld: false,
    unreadStages: unreadAt.length,
  }
  return { course: { ...course, end: endOf(course) }, unreadAt }
}

function ensureCommittee(c: AnliegenCommittee | null, name: string, assignedAt: string | null): AnliegenCommittee {
  return c ?? { name, assignedAt, reassignedFrom: null, sittings: [], statementRequests: [] }
}

// ---------------------------------------------------------------------------
// A Petition an den Bundesrat
// ---------------------------------------------------------------------------

/*
 * The closed vocabulary, counted over all 42 records on 15.11.2026 (stage
 * shapes with numbers and dates masked; first count stages, second items):
 *
 *   42 42  Einlangen im Bundesrat (Frist: D)                        arrival
 *   40 40  N. Sitzung: Mitteilung des Einlangens                    known
 *   31 31  N. Sitzung: Mitteilung des Einlanges und der Zuweisung … known
 *   36+12+1  <Ausschuss> des Bundesrates: auf Tagesordnung in der N. Sitzung des Ausschusses   sitting
 *   37 29  Vertagung im Ausschuss                                   the sitting of that day adjourned
 *   41 41  Zuweisung an den <Ausschuss> des Bundesrates              assign (32 BürgerInnenrechte und
 *                                                                     Petitionen, 4 BürgerInnenrechte, 5 a subject committee)
 *    1  1  Neu zugewiesen an den <Ausschuss> des Bundesrates          reassign
 *   31 31  Übermittlung der Petition an …                            transmission (1 with no addressee)
 *   10 10  [<Ausschuss> des Bundesrates:] Bericht N/BR [und Zu N/BR] d.B.   committee report
 *   10 10  Kenntnisnahme des Berichts angenommen [mehrstimmig | Einhellig]   plenary
 *   10 10  Auf der Tagesordnung der N. Sitzung; N. Sitzung: Debatte; Wortmeldungen in der Debatte   known
 *   13 13  N. Sitzung: Berichterstattung durch …                      known (the member is never read)
 *    1  1  Unselbständiger Entschließungsantrag der Bundesräte … angenommen (N/E-BR/N)   resolution
 *    1  1  Gilt gemäß § 16 Abs. 5 GO-BR als zurückgezogen             withdrawn
 *   14 14  Keine Veröffentlichung der Dokumente                       documents withheld (no step: dated
 *                                                                     28.08.2014 on all, an archive mark)
 *
 * Nothing else occurs; anything else is counted unread.
 */
const BR_ARRIVAL = /^Einlangen im Bundesrat(?:\s*\(Frist:\s*\d{2}\.\d{2}\.\d{4}\))?$/
const BR_KNOWN: readonly RegExp[] = [
  // „Einlangens" and „Einlanges", both spellings stand; the stripped link leaves a space before the colon.
  /^\d+\. Sitzung\s*:\s*Mitteilung des Einlang(?:en|e)s(?: und der Zuweisung(?: an den .+ des Bundesrates)?)?$/,
  /^\d+\. Sitzung\s*:\s*Debatte$/,
  /^\d+\. Sitzung\s*:\s*Berichterstattung durch\b.*$/,
  /^Auf der Tagesordnung der \d+\. Sitzung$/,
  /^Wortmeldungen in der Debatte$/,
]
/** A committee of the Bundesrat by the name it carries in the record. */
const BR_COMMITTEE = '((?:Ausschuss für [^:]+?|[A-ZÄÖÜ][a-zäöüß]+ausschuss) des Bundesrates)'
const BR_ASSIGN = new RegExp(`^Zuweisung an den ${BR_COMMITTEE}$`)
const BR_REASSIGN = new RegExp(`^Neu zugewiesen an den ${BR_COMMITTEE}$`)
const BR_SITTING = new RegExp(`^${BR_COMMITTEE}\\s*:\\s*auf Tagesordnung in der \\d+\\. Sitzung des Ausschusses$`)
const BR_ADJOURNED = /^Vertagung im Ausschuss$/
const BR_REPORT = new RegExp(`^(?:${BR_COMMITTEE}\\s*:\\s*)?Bericht (\\d+\\/BR(?: und Zu \\d+\\/BR)? d\\.B\\.)$`)
const BR_REPORT_LINK = /^\/gegenstand\/BR\/I-BR\/\d+(?:\/|$)/
const BR_TRANSMISSION = /^Übermittlung der Petition an\b\s*(.*)$/
const BR_PLENARY = /^Kenntnisnahme des Berichts angenommen\b/
const BR_WITHDRAWN = /^Gilt gemäß § 16 Abs\. 5 GO-BR als zurückgezogen$/
const BR_WITHHELD = /^Keine Veröffentlichung der Dokumente$/

/**
 * One addressee as Parliament may name it: „das Bundeskanzleramt" or „das
 * Bundesministerium für" followed by capitalised words joined by „, " and
 * „ und " — nothing else passes, so no free text reaches the page.
 */
const INSTITUTION = /^das (?:Bundeskanzleramt|Bundesministerium für [A-ZÄÖÜ][A-Za-zÄÖÜäöüß]*-?(?:(?:, | und )[A-ZÄÖÜ][A-Za-zÄÖÜäöüß]*-?)*)$/

/**
 * The addressees of a transmission, each matched against `INSTITUTION`, in
 * Parliament's order („das Bundesministerium für Justiz, das
 * Bundesministerium für Inneres und das Bundesministerium für Verkehr,
 * Innovation und Technologie"); null where any part fails or none is named.
 */
export function transmissionAddressees(text: string): string[] | null {
  const t = text.trim()
  if (!t) return null
  const parts = t.split(/, (?=das )| und (?=das )/)
  return parts.every((p) => INSTITUTION.test(p)) ? parts : null
}

/** The Beilage a Bundesrat report stage links, else its citation alone. */
function bundesratReportRef(citation: string, html: string): AnliegenReportRef {
  const link = extractLinks(html).find((l) => BR_REPORT_LINK.test(parliamentPathname(l.url) ?? ''))
  return { citation: citation.replace(/\s+/g, ' '), url: link?.url ?? null }
}

/**
 * The course of a Petition an den Bundesrat: Eingebracht · its committee ·
 * Erledigung (Übermittlung an die Verwaltung, or a report) · the Bundesrat
 * (took note of the report). Typed facts only, from the vocabulary above.
 */
function foldBundesratCourse(content: AnliegenContent | null | undefined): { course: AnliegenCourse; unreadAt: number[] } {
  const stages = stagesByDate(content?.phase)
  let arrivedAt: string | null = parseIsoDate(content?.einlangen)
  let committee: AnliegenCommittee | null = null
  let committeeReport: AnliegenReportRef | null = null
  let transmission: AnliegenTransmission | null = null
  let plenary: AnliegenPlenary | null = null
  let withdrawnAt: string | null = null
  let documentsWithheld = false
  const resolutions: AnliegenResolution[] = []
  const unreadAt: number[] = []

  stages.forEach(({ date, html }, i) => {
    const lines = html.split(/<br\s*\/?>/i).map((l) => stripHtmlToText(l)).filter(Boolean)
    const head = lines[0] ?? ''
    const full = stripHtmlToText(html)
    const unread = () => unreadAt.push(i)
    // An archive mark, not a step: it is read whatever its date.
    if (BR_WITHHELD.test(full)) {
      documentsWithheld = true
      return
    }
    if (BR_KNOWN.some((re) => re.test(head)) && lines.length === 1) return
    if (!date) return unread()

    if (BR_ARRIVAL.test(full)) {
      arrivedAt ??= date
      return
    }
    const assign = BR_ASSIGN.exec(full)
    if (assign?.[1]) {
      if (!committee) committee = ensureCommittee(null, assign[1], date)
      else if (!sameCommittee(committee.name, assign[1])) unread()
      return
    }
    const reassign = BR_REASSIGN.exec(full)
    if (reassign?.[1]) {
      // The earlier committee's sittings are not the new one's.
      committee = { name: reassign[1], assignedAt: date, reassignedFrom: committee?.name ?? null, sittings: [], statementRequests: [] }
      return
    }
    const sitting = BR_SITTING.exec(full)
    if (sitting?.[1]) {
      if (committee && sameCommittee(committee.name, sitting[1])) committee.sittings.push({ date, adjourned: false })
      else unread()
      return
    }
    if (BR_ADJOURNED.test(full)) {
      const last = committee?.sittings.at(-1)
      if (last && last.date === date) last.adjourned = true
      else unread()
      return
    }
    const report = BR_REPORT.exec(full)
    if (report?.[2]) {
      if (report[1] && committee && !sameCommittee(committee.name, report[1])) return unread()
      // The same report stands twice on some records, with and without the committee's name.
      committeeReport ??= bundesratReportRef(report[2], html)
      return
    }
    const sent = BR_TRANSMISSION.exec(full)
    if (sent) {
      transmission ??= { date, to: transmissionAddressees(sent[1] ?? '') }
      return
    }
    if (BR_PLENARY.test(head)) {
      plenary = { date, kind: 'bericht-zur-kenntnis', report: committeeReport, ...readClubVote(full) }
      return
    }
    // The raw line and the reduced one („… der Bundesräte (gekürzt)") read alike; only the E number is kept.
    if (BR_RESOLUTION_STAGE.test(head)) {
      const adopted = BR_RESOLUTION_ADOPTED.exec(full)
      if (adopted?.[1]) resolutions.push({ date, ref: adopted[1] })
      return
    }
    if (BR_WITHDRAWN.test(full)) {
      withdrawnAt ??= date
      return
    }
    unread()
  })

  const end: AnliegenEnd = withdrawnAt ? 'zurueckgezogen' : plenary ? 'plenum' : transmission ? 'uebermittlung' : 'offen'
  return {
    course: {
      arrivedAt,
      carriedFrom: null,
      carriedTo: null,
      committee,
      disposal: null,
      subjectCommittee: null,
      plenary,
      firstReading: null,
      duties: null,
      committeeReport,
      resolutions,
      transmission,
      withdrawnAt,
      documentsWithheld,
      unreadStages: unreadAt.length,
      end,
    },
    unreadAt,
  }
}

/**
 * The date of the item's last step, ISO — the list's „last step". The
 * Bundesrat's „Keine Veröffentlichung der Dokumente" is an archive mark
 * dated 28.08.2014 on all 14 records that carry it, no step: it would date a
 * petition of 1997 as touched in 2014.
 */
export function lastStepDate(content: AnliegenContent | null | undefined, kind: AnliegenKind): string | null {
  if (!anliegenIsBundesrat(kind)) return lastStageDate(content?.phase)
  const phase = (content?.phase ?? []).map((p) => ({
    ...p,
    stages: (p?.stages ?? []).filter((st) => !BR_WITHHELD.test(stripHtmlToText(st?.text ?? ''))),
  }))
  return lastStageDate(phase)
}

/**
 * Whether an item that is still `offen` ended with its period. Not in the
 * course: it needs the running period. A Petition is never carried over —
 * 22, 21 and 15 simply stop at the ends of XXV, XXVI and XXVII with a last
 * stage that says nothing (step 0) — so this is said from the period.
 */
export function endedWithPeriod(course: Pick<AnliegenCourse, 'end'>, itemGp: string, currentGp: string | null | undefined): boolean {
  if (course.end !== 'offen' || !currentGp) return false
  const item = romanToInt(itemGp)
  const current = romanToInt(currentGp)
  return item !== null && current !== null && item < current
}

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------

/**
 * The page of one Anliegen from its record and the counts of list 143 — the
 * pure half of `getAnliegenDetail`. `names[]` is reduced here as well, so a
 * record that was not reduced before still lets no private name through.
 */
export function assembleAnliegenDetail(root: AnliegenRoot, content: AnliegenContent, counts: AnliegenCounts): AnliegenDetail {
  const course = readAnliegenCourse(content, root.kind)
  return {
    root,
    title: stripHtmlToText(content.title ?? ''),
    citation: citationOf(root, content.zitation),
    parliamentUrl: anliegenParliamentUrl(root),
    course,
    participation: participationOf(content),
    presenters: presentersOf(content.names),
    // „Keine Veröffentlichung der Dokumente": none shown, whatever the record lists.
    documents: course.documentsWithheld ? [] : mapDocuments(content.documents),
    counts,
  }
}

/** The record's `zitation` — for a Petition an den Bundesrat only in Parliament's shape („56/PET-BR/2024") —, else `anliegenCitation`. */
export function citationOf(root: AnliegenRoot, zitation: string | null | undefined): string {
  const z = (zitation ?? '').trim()
  if (!z) return anliegenCitation(root)
  if (anliegenIsBundesrat(root.kind)) return BUNDESRAT_PETITION_CITATION_RE.test(z) && z.startsWith(`${root.inr}/`) ? z : anliegenCitation(root)
  return z
}

// ---------------------------------------------------------------------------
// List 101 rows of the three kinds
// ---------------------------------------------------------------------------

/** List 101, 0-based (`docs/api-exploration.md` §101): GP, ITYP, INR, …, DOKTYP. */
const L101_GP = 0
const L101_ITYP = 1
const L101_DOKTYP = 11

/**
 * The list-101 and list-143 reads: per period `{ GP_CODE, ITYP }`, and
 * `DOKTYP` for the Volksbegehren; the Petitionen an den Bundesrat once,
 * `{ ITYP: ['PET-BR'] }`, whatever the period (`bundesratRowOf`).
 */
export const ANLIEGEN_FILTERS: Readonly<Record<AnliegenKind, { ityp: 'PET' | 'BI' | 'I' | 'PET-BR'; doktyp: string | null }>> = {
  petition: { ityp: 'PET', doktyp: null },
  buergerinitiative: { ityp: 'BI', doktyp: null },
  volksbegehren: { ityp: 'I', doktyp: 'VOLKBG' },
  'petition-bundesrat': { ityp: 'PET-BR', doktyp: 'PET-BR' },
}

/** Whether a row of list 101 or 143 is of the period and kind asked for (both lists keep GP, ITYP and DOKTYP in columns 0, 1 and 11). */
export function rowIsAnliegen(row: unknown, gp: string, kind: AnliegenKind): boolean {
  if (!Array.isArray(row)) return false
  const f = ANLIEGEN_FILTERS[kind]
  return row[L101_GP] === gp && row[L101_ITYP] === f.ityp && (f.doktyp === null || row[L101_DOKTYP] === f.doktyp)
}

/** List 101, 0-based: column 7 „Nummer", column 14 `HIS_URL`. */
const L101_NUMMER = 7
const L101_HIS_URL = 14

/**
 * A row of list 101's `{ ITYP: ['PET-BR'] }` read, checked: type and
 * document type `PET-BR`, and its own address `HIS_URL`
 * „/gegenstand/BR/PET-BR/<INR>" — the period column says XX to XXVII
 * (15.11.2026) and is no address; Parliament files every one under „BR".
 * Null for a row that does not hold.
 */
export function bundesratRowOf(row: unknown): { inr: number; citation: string | null } | null {
  if (!Array.isArray(row) || row[L101_ITYP] !== 'PET-BR' || row[L101_DOKTYP] !== 'PET-BR') return null
  const inr = Number(row[2])
  if (!Number.isSafeInteger(inr) || inr < 1) return null
  if (row[L101_HIS_URL] !== `/gegenstand/BR/PET-BR/${inr}`) return null
  const nummer = typeof row[L101_NUMMER] === 'string' ? row[L101_NUMMER].trim() : ''
  return { inr, citation: BUNDESRAT_PETITION_CITATION_RE.test(nummer) && nummer.startsWith(`${inr}/`) ? nummer : null }
}

/** A row of list 143's `{ ITYP: ['PET-BR'] }` read: period column „BR", type `PET-BR` (15.11.2026, 42 rows). */
export function rowIsBundesratParticipation(row: unknown): boolean {
  return Array.isArray(row) && row[L101_GP] === 'BR' && row[L101_ITYP] === 'PET-BR'
}

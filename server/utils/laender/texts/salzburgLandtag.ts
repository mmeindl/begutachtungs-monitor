/**
 * Salzburg's Landtag, read off the Landesgesetzblatt a draft became
 * (23.10.2026): RIS links each one to its Regierungsvorlage and the
 * committee's report, and the report says the rest in its own sentences —
 *
 *   „Bericht des Verfassungs- und Verwaltungsausschusses zur Vorlage der
 *    Landesregierung (Nr. 148 der Beilagen) … hat sich in der Sitzung vom
 *    14. Dezember 2022 mit der Vorlage befasst. …
 *    Beschluss des Salzburger Landtages vom 14. Dezember 2022: Der Antrag
 *    wurde einstimmig zum Beschluss erhoben."
 *
 * — the facts Oberösterreich's Landtag record gives (`LandLandtag`), in the
 * same shape, so the page shows both alike. The report itself carries no
 * law text: what the Landtag changed is read against the Kundmachung
 * (`rv → lgbl`).
 *
 * PURE except `salzburgLandtag`, which fetches the report.
 */
import type { LandLandtag, LandProcedureStep } from '#shared/types'
import type { LgblRecord } from '../lgblIndex'
import { pdfPages } from './read'

const MONTHS = ['jänner', 'februar', 'märz', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'dezember']

/** „14. Dezember 2022" → „2022-12-14"; null for anything else. */
export function germanDate(text: string): string | null {
  const m = /(\d{1,2})\.\s*(Jänner|Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\s+(\d{4})/i.exec(text)
  if (!m) return null
  const month = MONTHS.indexOf(m[2]!.toLowerCase().replace('januar', 'jänner')) + 1
  return `${m[3]}-${String(month).padStart(2, '0')}-${m[1]!.padStart(2, '0')}`
}

export interface ReportFacts {
  committee: string | null
  sitting: string | null
  vote: string | null
  decided: string | null
  /** The Abänderungs- and Zusatzanträge the report records, in its order (`reportMotions`). */
  motions: ReportMotion[]
}

/**
 * A motion to change the text, as the report records it (23.10.2026): moved
 * in the committee, or in the Landtag's sitting — the plenary's are in the
 * note of the Beschluss at the report's end. Read over the 44 reports of
 * 2025–2026: four committee motions in two reports, a plenary one in two
 * others. Entschließungsanträge are not here: they ask the government for
 * something and change no text — Oberösterreich's frame leaves them out the
 * same way (`ooeLandtagOf`).
 */
export interface ReportMotion {
  where: 'ausschuss' | 'landtag'
  /** „Abänderungsantrag", „Abänderungsanträge", „Zusatzantrag" — the report's word. */
  kind: string
  /** The party, where the report names one („ÖVP-Abänderungsantrag", „von der FPÖ", „für die GRÜNEN"); never the person who moved it. */
  party: string | null
  outcome: 'angenommen' | 'abgelehnt' | null
  /** „Einstimmig", „Mehrstimmig, mit den Stimmen von …" (`voteOf`). */
  vote: string | null
  /** Several motions, voted on one by one with the same result: „Diese Abänderungsanträge werden jeweils …". */
  each: boolean
}

/**
 * The vote in the Beschluss's own words: „Einstimmig", or „Mehrstimmig, mit
 * den Stimmen von ÖVP und FPÖ gegen die Stimmen von SPÖ, KPÖ PLUS und
 * GRÜNEN". The report writes the second as „Der Antrag wurde mit den Stimmen
 * von … gegen die Stimmen … – sohin mehrstimmig – zum Beschluss erhoben" —
 * read over 44 reports of 2025–2026, 20 of them so (23.10.2026); until then
 * only „einstimmig" was read, and every split vote went unsaid.
 */
export function voteOf(sentence: string): string | null {
  if (/\beinstimmig\b/.test(sentence)) return 'Einstimmig'
  const split = /(mit (?:den )?Stimmen (?:von |der |des )?.{2,160}?gegen die Stimmen? (?:von |der |des )?.{2,120}?)\s*[–-]\s*sohin\s+mehrstimmig/.exec(sentence)
  if (split) return `Mehrstimmig, ${split[1]!.trim()}`
  return /\bmehrstimmig\b/.test(sentence) ? 'Mehrstimmig' : null
}

const PARTIES: readonly [RegExp, string][] = [[/^ÖVP/, 'ÖVP'], [/^FPÖ/, 'FPÖ'], [/^SPÖ/, 'SPÖ'], [/^GRÜNE/, 'GRÜNE'], [/^KPÖ/, 'KPÖ PLUS'], [/^NEOS/, 'NEOS']]
/** The party a report names, in one spelling: „GRÜNEN" and „GRÜNE" are one, „FPÖP" a typo for „FPÖ" (r41). */
function partyOf(raw: string | undefined): string | null {
  return raw ? PARTIES.find(([re]) => re.test(raw))?.[1] ?? null : null
}

/** The sentence a match ends in, from its last sentence boundary: a full stop or colon before a capital. */
function sentenceBefore(text: string, end: number, reach = 400): string {
  const window = text.slice(Math.max(0, end - reach), end)
  const starts = [...window.matchAll(/[.:]\s+(?=\p{Lu})/gu)]
  return starts.length ? window.slice(starts.at(-1)!.index! + starts.at(-1)![0].length) : window
}

const MOTION_KIND = '((?:Abänderungs|Zusatz)(?:antrag|anträge))'
/* „… bringt folgenden Abänderungsantrag ein", „… bringt zu Art. 1 folgenden …", „… bringt folgende Abänderungsanträge ein". */
const COMMITTEE_MOTION_RE = new RegExp(`\\bbring(?:t|en)\\s+([^:]{0,80}?\\s+)?(?:folgenden?|einen|weitere)\\s+${MOTION_KIND}\\s+ein\\b`, 'g')
/* „für die GRÜNEN", „namens der FPÖ" — where the report says whose motion it is. */
const ON_BEHALF_RE = /\b(?:für|namens)\s+(?:die|der|den)\s+(\S+)/
/* „Dieser Abänderungsantrag wird mit den Stimmen … abgelehnt", „Diese Abänderungsanträge werden jeweils …" — within its sentence. */
const MOTION_OUTCOME_RE = /(?:Diese[rs]?|Der|Die)\s+(?:Abänderungs|Zusatz)(?:antrag|anträge)\b[^.]{0,40}?\s+(?:wird|werden|wurde|wurden)\s+(jeweils\s+)?([^.]{0,260}?)\s*(angenommen|abgelehnt)\b/
/* „Die Vorlage … wird in der durch den Abänderungsantrag modifizierten Fassung mit den Stimmen … angenommen" (r37). */
const ADOPTED_AS_AMENDED_RE = /in der durch den Abänderungsantrag (?:modifizierten|geänderten) Fassung([^.]{0,260}?)(angenommen|abgelehnt)\b/
/* „In der Sitzung wurde von der FPÖ folgender Abänderungsantrag eingebracht", „… folgender ÖVP-Abänderungsantrag eingebracht". */
const PLENARY_MOTION_RE = new RegExp(`(?:von\\s+(?:der|den)\\s+(\\S+)\\s+)?folgender\\s+(?:(\\S+?)-)?${MOTION_KIND}\\s+eingebracht`, 'g')

/**
 * The motions to change the text a report records (`ReportMotion`): those
 * of the committee in its body, those of the plenary in the Beschluss at its
 * end (`beschlussAt`). An outcome the report words otherwise stays open —
 * the motion stands, without one.
 */
export function reportMotions(t: string, beschlussAt: number): ReportMotion[] {
  const out: ReportMotion[] = []
  const body = beschlussAt >= 0 ? t.slice(0, beschlussAt) : t
  const intros = [...body.matchAll(COMMITTEE_MOTION_RE)]
  intros.forEach((m, i) => {
    const after = body.slice(m.index! + m[0].length, intros[i + 1]?.index ?? body.length)
    const said = MOTION_OUTCOME_RE.exec(after)
    const amended = said ? null : ADOPTED_AS_AMENDED_RE.exec(after)
    const outcome = (said?.[3] ?? amended?.[2] ?? null) as ReportMotion['outcome']
    out.push({
      where: 'ausschuss',
      kind: m[2]!,
      party: partyOf(m[1] ? ON_BEHALF_RE.exec(m[1])?.[1] : undefined),
      outcome,
      vote: said ? voteOf(`${said[2]} `) : amended ? voteOf(`${amended[1]} `) : null,
      each: !!said?.[1],
    })
  })
  if (beschlussAt >= 0) {
    const note = t.slice(beschlussAt, beschlussAt + 3000)
    for (const m of note.matchAll(PLENARY_MOTION_RE)) {
      // Adopted where the note says „zum Beschluss erhoben" after it, in a
      // sentence that carries the vote — the same one („…, welche in der
      // Folge mit den Stimmen … zum Beschluss erhoben wurde") or a later
      // („Der Abänderungsantrag wurde mit den Stimmen … zum Beschluss erhoben").
      const from = m.index! + m[0].length
      let vote: string | null = null
      let adopted = false
      for (const e of note.slice(from).matchAll(/zum Beschluss erhoben/g)) {
        adopted = true
        vote = voteOf(sentenceBefore(note, from + e.index!))
        if (vote) break
      }
      out.push({ where: 'landtag', kind: m[3]!, party: partyOf(m[1] ?? m[2]), outcome: adopted ? 'angenommen' : null, vote, each: false })
    }
  }
  return out
}

/** The committee, its sitting, the motions, and the Landtag's Beschluss with its vote, from the report's text. */
export function reportFacts(text: string): ReportFacts {
  // A line-break hyphen closes the word — „Ausschus- ses" — but not before
  // „und": „Verfassungs- und Verwaltungsausschuss".
  const t = text.replace(/\s+/g, ' ').replace(/(\p{L})-\s(?!und\b|oder\b|bzw\.|sowie\b)(?=\p{Ll})/gu, '$1')
  const committee = /Bericht de[rs] (.{3,120}?(?:ausschuss(?:es)?|Ausschuss(?:es)?))\b/u.exec(t)?.[1]?.replace(/ausschusses$/i, 'ausschuss').replace(/^(.)/, (c) => c.toUpperCase()) ?? null
  const sitting = germanDate(/in (?:seiner|der) Sitzung vom (.{6,30}?\d{4})/.exec(t)?.[1] ?? '')
  // The Beschluss and its vote: the first „zum Beschluss erhoben" after it
  // whose sentence carries one — with or without the full stop the report
  // sometimes leaves off, and past a plenary amendment's text, whose own
  // „mit folgender Änderung zum Beschluss erhoben" carries none (r41).
  const head = /Beschluss des Salzburger Landtages vom ([^:]{6,30}\d{4}):\s*/.exec(t)
  let vote: string | null = null
  if (head) {
    const from = head.index + head[0].length
    const note = t.slice(from, from + 2000)
    for (const e of note.matchAll(/zum Beschluss erhoben/g)) {
      vote = voteOf(sentenceBefore(note, e.index!))
      if (vote) break
    }
  }
  return {
    committee,
    sitting,
    vote,
    decided: head ? germanDate(head[1]!) : null,
    motions: reportMotions(t, head ? head.index : -1),
  }
}

/**
 * A motion as a step of the procedure, in the report's terms: „Abänderungs-
 * antrag der FPÖ im Landtag, mehrstimmig angenommen – mit den Stimmen von
 * ÖVP und FPÖ gegen die Stimmen von SPÖ, KPÖ PLUS und GRÜNEN". Oberösterreich's
 * record words its motions alike („Abänderungsantrag Beilage 1430/2026
 * mehrstimmig abgelehnt - Dagegen: …"), so both read the same in the frame.
 */
export function motionStep(m: ReportMotion, date: string | null): LandProcedureStep {
  const party = m.party ? ` der ${m.party === 'GRÜNE' ? 'GRÜNEN' : m.party}` : ''
  const vote = m.vote ? /^(Einstimmig|Mehrstimmig)(?:, (.+))?$/.exec(m.vote) : null
  const outcome = !m.outcome
    ? ''
    : vote
      ? `, ${m.each ? 'jeweils ' : ''}${vote[1]!.toLowerCase()} ${m.outcome}${vote[2] ? ` – ${vote[2]}` : ''}`
      : `, ${m.outcome}`
  return { date, label: `${m.kind}${party} im ${m.where === 'ausschuss' ? 'Ausschuss' : 'Landtag'}${outcome}`, url: null }
}

/** „Nr 148 der Beilagen (6. Session der 16. GP)". */
function beilage(nr: string | null, record: LgblRecord): string {
  const where = record.session && record.periode ? ` (${record.session}. Session der ${record.periode.replace(/\.$/, '')}. GP)` : ''
  return nr ? `Nr ${nr} der Beilagen${where}` : ''
}

/**
 * The procedure and the Landtag's facts, where the Landesgesetzblatt names a
 * Regierungsvorlage. A report that cannot be read leaves its facts out and
 * says so in `reads` — the procedure stands, held only as long as a failed
 * read is (`texts/kundmachung.ts`).
 */
export async function salzburgLandtag(record: LgblRecord, reads?: { complete: boolean }): Promise<{ procedure: LandProcedureStep[]; landtag: LandLandtag | null } | null> {
  if (!record.vorlageUrl) return null
  const pages = record.ausschussUrl
    ? await pdfPages(record.ausschussUrl).catch(() => {
        if (reads) reads.complete = false
        return [] as string[]
      })
    : []
  const facts = record.ausschussUrl ? reportFacts(pages.join(' ')) : null
  const report: LandProcedureStep | null = record.ausschussUrl
    ? { date: facts?.sitting ?? null, label: `Ausschussbericht, ${beilage(record.ausschussNr, record)}`, url: record.ausschussUrl, linkText: beilage(record.ausschussNr, record) }
    : null
  const decided = facts?.decided ?? record.beschluss
  // The committee's motions in its sitting, the plenary's on the day of the Beschluss.
  const motions = (facts?.motions ?? []).map((m) => motionStep(m, m.where === 'ausschuss' ? facts!.sitting : decided))
  const procedure: LandProcedureStep[] = [
    { date: null, label: `Regierungsvorlage, ${beilage(record.vorlageNr, record)}`, url: record.vorlageUrl, station: 'rv' },
    ...(report ? [report] : []),
    ...motions,
    // The Beschluss is the station „Parlament", as in Oberösterreich's record (`ooeStationSteps`).
    ...(decided ? [{ date: decided, label: `Beschluss des Salzburger Landtages${facts?.vote ? `, ${facts.vote.replace(/^./, (c) => c.toLowerCase())}` : ''}`, url: null, station: 'parlament' as const }] : []),
    ...(record.datum ? [{ date: record.datum, label: `Kundmachung, ${record.nr}`, url: record.url, station: 'bgbl' as const }] : []),
  ]
  return {
    procedure,
    landtag: {
      committee: facts?.committee ?? null,
      subcommittee: false,
      report,
      motions,
      decision: decided ? { date: decided, vote: facts?.vote ?? null } : null,
    },
  }
}

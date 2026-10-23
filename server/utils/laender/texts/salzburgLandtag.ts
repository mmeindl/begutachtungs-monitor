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

/** The committee, its sitting, and the Landtag's Beschluss with its vote, from the report's text. */
export function reportFacts(text: string): ReportFacts {
  // A line-break hyphen closes the word — „Ausschus- ses" — but not before
  // „und": „Verfassungs- und Verwaltungsausschuss".
  const t = text.replace(/\s+/g, ' ').replace(/(\p{L})-\s(?!und\b|oder\b|bzw\.|sowie\b)(?=\p{Ll})/gu, '$1')
  const committee = /Bericht de[rs] (.{3,120}?(?:ausschuss(?:es)?|Ausschuss(?:es)?))\b/u.exec(t)?.[1]?.replace(/ausschusses$/i, 'ausschuss').replace(/^(.)/, (c) => c.toUpperCase()) ?? null
  const sitting = germanDate(/in (?:seiner|der) Sitzung vom (.{6,30}?\d{4})/.exec(t)?.[1] ?? '')
  // The Beschluss and its sentence, up to „zum Beschluss erhoben" — with or
  // without the full stop the report sometimes leaves off. A sentence that
  // does not get there within a few lines says no vote.
  const head = /Beschluss des Salzburger Landtages vom ([^:]{6,30}\d{4}):\s*/.exec(t)
  const rest = head ? t.slice(head.index + head[0].length, head.index + head[0].length + 400) : ''
  const sentence = /^(.*?)zum Beschluss erhoben/.exec(rest)?.[1] ?? null
  return { committee, sitting, vote: sentence ? voteOf(sentence) : null, decided: head ? germanDate(head[1]!) : null }
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
  const procedure: LandProcedureStep[] = [
    { date: null, label: `Regierungsvorlage, ${beilage(record.vorlageNr, record)}`, url: record.vorlageUrl, station: 'rv' },
    ...(report ? [report] : []),
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
      motions: [],
      decision: decided ? { date: decided, vote: facts?.vote ?? null } : null,
    },
  }
}

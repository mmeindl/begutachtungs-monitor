/**
 * What the page of a Regierungsvorlage or Antrag without a Begutachtung says,
 * once its record has arrived (docs/architecture.md §12.69) — the assembly
 * step of `getVorlageDetail`.
 *
 * PURE MODULE — no Nuxt auto-imports, only relative imports, so vitest can
 * execute it directly, like `draftDetailAssembly.ts` beside it.
 */
import type { DraftDocument, EnactmentInfo, ProcedureRoot, VorlageDetail } from '../../../shared/types'
import { gpHasEnded } from '../../../shared/utils/gp'
import { parliamentItemUrl, rootCitation } from '../../../shared/utils/procedureRoot'
import { mapDocuments, mapTextEvolution, type RawDocumentGroup } from './detailJson'
import { groupVersionsByStation } from './draftDetailAssembly'
import { stripHtmlToText } from './htmlText'

/** As much of the item's detail JSON as the page reads. */
export interface VorlageContent {
  doktyp?: string | null
  title?: string | null
  description?: string | null
  einlangen?: string | null
  documents?: RawDocumentGroup[] | null
  statements?: { documents?: RawDocumentGroup[] | null } | null
  names?: { funktext?: string | null; frak_code?: string | null; ltext?: string | null }[] | null
  vote?: { result?: { code?: unknown; text?: unknown }[] | null } | null
  preconst?: { ityp?: string | null; gp_code?: string | null; inr?: number | string | null }[] | null
}

/**
 * Which items get the page: a Regierungsvorlage (`doktyp` RV) and a
 * selbständiger Antrag on a law (`A`). Same item types, other documents —
 * an Ausschussbericht is `I` with `AUB`, an Entschließungsantrag `A` with
 * `A(E)` (read 09.11.2026) — answer 404, there is no law to follow.
 */
export function isPageItem(ityp: 'I' | 'A', doktyp: string | null | undefined): boolean {
  return (doktyp ?? '').trim() === (ityp === 'I' ? 'RV' : 'A')
}

/** The Ministerialentwurf a Vorlage's record names as its predecessor, or null. */
export function draftOfPreconst(preconst: VorlageContent['preconst']): { gp: string; inr: number } | null {
  for (const p of preconst ?? []) {
    const inr = Number(p?.inr)
    if (p?.ityp === 'ME' && p.gp_code && Number.isInteger(inr) && inr > 0) return { gp: String(p.gp_code), inr }
  }
  return null
}

/** The submitting Ressort, as the record names the member of the government's office. */
export function ministryOf(names: VorlageContent['names']): string | null {
  const entry = (names ?? []).find((n) => n?.funktext === 'Mitglied der Bundesregierung' && n.ltext?.trim())
  return entry?.ltext?.trim() ?? null
}

/**
 * The club codes of this period and the one before, by upstream's own names —
 * the pairs the vote record itself carries (`vote.result[].code` and `.text`,
 * read on every GP-XXVIII law of this page's population). Only the fallback:
 * where the item's own vote names its clubs, those names win; an Antrag
 * decided by namentliche Abstimmung has no club list to read them from
 * (XXVIII 372/A).
 */
const CLUB_NAMES: Readonly<Record<string, string>> = { V: 'ÖVP', S: 'SPÖ', F: 'FPÖ', N: 'NEOS', G: 'GRÜNE' }

/**
 * The Klubs of an Antrag's movers, once each, in upstream order — or null
 * where any mover's code cannot be named (a club this table does not know):
 * then the byline names no clubs rather than some of them. The movers
 * themselves are never named; the page states who brought the bill in by
 * club, as the vote does.
 */
export function moverClubsOf(names: VorlageContent['names'], vote: VorlageContent['vote']): string[] | null {
  const fromVote = new Map<string, string>()
  for (const club of vote?.result ?? []) {
    if (typeof club?.code === 'string' && typeof club.text === 'string' && club.text.trim()) fromVote.set(club.code, club.text.trim())
  }
  const codes = (names ?? []).filter((n) => n?.funktext === 'Eingebracht von').map((n) => n.frak_code ?? '')
  if (codes.length === 0) return null
  const clubs: string[] = []
  for (const code of codes) {
    const name = fromVote.get(code) ?? CLUB_NAMES[code]
    if (!name) return null
    if (!clubs.includes(name)) clubs.push(name)
  }
  return clubs
}

/**
 * The bill's official title. A Vorlage's `description` is that title. An
 * Antrag's opens with its movers' names („Antrag der Abgeordneten …,
 * Kolleginnen und Kollegen betreffend ein Bundesgesetz, mit dem …"), so only
 * what follows „betreffend" is taken, and only where it is a Bundesgesetz —
 * the page names no deputy.
 */
export function officialTitleOf(ityp: 'I' | 'A', description: string | null | undefined): string | null {
  const text = stripHtmlToText(description ?? '').trim()
  if (!text) return null
  if (ityp === 'I') return text
  const m = /\bbetreffend\s+(?:ein\s+|eine\s+)?(Bundes(?:verfassungs)?gesetz\b.*)$/s.exec(text)
  return m?.[1] ? m[1].trim() : null
}

/**
 * The Erläuterungen group of a document list — the title starts with the
 * word, because a Vorlage of several parts names them „Erläuterungen
 * Sozialabgaben" (311 d.B. XXVIII); an exact match read that Vorlage as one
 * without Erläuterungen. The first such group, as Parliament orders them.
 */
export function explanationsGroup(documents: readonly DraftDocument[]): DraftDocument | null {
  return documents.find((d) => /^Erläuterungen\b/i.test(d.title.trim())) ?? null
}

/** The item's first text as one PDF link — `enactment.rvTextUrl`. */
function firstTextPdf(ityp: 'I' | 'A', documents: readonly DraftDocument[]): string | null {
  // The titles `findLawStations` reads (`server/utils/diff/stationDocuments.ts`),
  // repeated here because this module may not import a Nitro-aliased one.
  const title = ityp === 'I' ? 'Gesetzestext' : 'Gesetzestext (Arbeitsdokument ParlDion)'
  const doc = documents.find((d) => d.title.trim() === title)
  return doc?.formats.find((f) => f.type === 'pdf')?.url ?? doc?.formats[0]?.url ?? null
}

export interface VorlageDetailInputs {
  root: ProcedureRoot & { ityp: 'I' | 'A' }
  content: VorlageContent
  enactment: EnactmentInfo
  currentGp: string
  withoutBegutachtung: boolean
}

export function assembleVorlageDetail(input: VorlageDetailInputs): VorlageDetail {
  const { root, content, currentGp } = input
  const documents = mapDocuments(content.documents)
  const enactment: EnactmentInfo = { ...input.enactment, rvTextUrl: firstTextPdf(root.ityp, documents) }
  const draft = root.ityp === 'I' ? draftOfPreconst(content.preconst) : null
  return {
    gp: root.gp,
    ityp: root.ityp,
    inr: root.inr,
    citation: rootCitation(root),
    title: stripHtmlToText(content.title ?? '').trim() || rootCitation(root),
    officialTitle: officialTitleOf(root.ityp, content.description),
    parliamentUrl: parliamentItemUrl(root),
    arrivedAt: content.einlangen ? content.einlangen.slice(0, 10) : null,
    ministry: root.ityp === 'I' ? ministryOf(content.names) : null,
    moverClubs: root.ityp === 'A' ? moverClubsOf(content.names, content.vote) : null,
    documents,
    // Parliament's own versions only: the list opens with the item's text,
    // which `documents` already carries.
    textEvolution: groupVersionsByStation(
      mapTextEvolution(content.statements?.documents).filter((v) => v.stationId === 'ausschuss' || v.stationId === 'plenum'),
    ),
    enactment,
    withoutBegutachtung: input.withoutBegutachtung,
    gpEnded: gpHasEnded(root.gp, currentGp),
    draftPath: draft ? `/entwuerfe/${draft.gp}/${draft.inr}` : null,
  }
}

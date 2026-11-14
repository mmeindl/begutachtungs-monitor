/**
 * What the page of a Regierungsvorlage or Antrag without a Begutachtung says,
 * once its record has arrived — the assembly
 * step of `getVorlageDetail`.
 *
 * PURE MODULE — no Nuxt auto-imports, only relative imports, so vitest can
 * execute it directly, like `draftDetailAssembly.ts` beside it.
 */
import type { BundesratMotionVariant, DraftDocument, EnactmentInfo, ProcedureItemKind, ProcedureRoot, RelatedItem, TreatyKind, VorlageDetail } from '../../../shared/types'
import { gpHasEnded } from '../../../shared/utils/gp'
import { parliamentItemUrl, rootCitation } from '../../../shared/utils/procedureRoot'
import { mapDocuments, mapTextEvolution, readCommitteeConsultation, type RawDocumentGroup, type RawPhase } from './detailJson'
import { groupVersionsByStation } from './draftDetailAssembly'
import { parliamentPathname } from '../../../shared/utils/safeExternalUrl'
import { absolutizeUrl, stripHtmlToText } from './htmlText'

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
  phase?: RawPhase[] | null
  /** „Bezug zu" and its kin: `{ text, subject, zitation, url }`. */
  reference?: { text?: string | null; subject?: string | null; zitation?: string | null; url?: string | null }[] | null
}

/** The document types of `I` that start a law's way through the Nationalrat, by kind. */
const KIND_OF_I_DOKTYP: Readonly<Record<string, ProcedureItemKind>> = {
  RV: 'regierungsvorlage',
  BUA: 'ausschussantrag',
  GABR: 'bundesratsantrag',
  GABR13: 'bundesratsantrag',
  RVS: 'staatsvertrag',
}

/** The document type of a treaty's Vorlage — a Staatsvertrag and an
 *  Art.-15a-Vereinbarung alike (Parliament's type „Regierungsvorlage:
 *  Staatsvertrag", 119 and 388 d.B. XXVIII, read 14.11.2026). */
export const TREATY_DOKTYP = 'RVS'

/**
 * The stage that marks an Art.-15a-Vereinbarung in the record's Verlauf: in
 * the phase „Einlangen NR", beside „Einlangen im Nationalrat", the stage
 * „Vereinbarung gemäß Artikel 15a B-VG" (388 d.B. XXVIII, read 14.11.2026).
 * The detail JSON carries no `VHG`; list 101 does („RVS15"), and the stage
 * agreed with it on every treaty of XXVII and XXVIII
 * (`pnpm corpus:staatsvertraege`). Never the title.
 */
const AGREEMENT_15A_STAGE = /^Vereinbarung\s+gem(?:ä|ae)ß\s+Art(?:ikel|\.)\s*15\s?a\s+B-VG\b/i
const EINLANGEN_NR_PHASE = /^Einlangen NR$/i

/**
 * What a treaty's Vorlage is — `vereinbarung-15a` where its Verlauf carries
 * the Art.-15a stage, `staatsvertrag` otherwise; null for every item that
 * is no treaty (`TREATY_DOKTYP`). „Einspruch der Republik Österreich gegen
 * …" in a title is a treaty's subject, not an Einspruch, and no title is
 * read here.
 */
export function treatyKindOf(content: Pick<VorlageContent, 'doktyp' | 'phase'> | null | undefined): TreatyKind | null {
  if ((content?.doktyp ?? '').trim() !== TREATY_DOKTYP) return null
  for (const p of content?.phase ?? []) {
    if (!EINLANGEN_NR_PHASE.test((p?.name ?? '').trim())) continue
    for (const s of p.stages ?? []) {
      if (AGREEMENT_15A_STAGE.test(stripHtmlToText(s?.text ?? '').trim())) return 'vereinbarung-15a'
    }
  }
  return 'staatsvertrag'
}

/**
 * Which items get the page, and as what: a Regierungsvorlage (`doktyp` RV),
 * a selbständiger Antrag on a law (`A`) and, since 14.11.2026, a committee's
 * own motion (`I` with `BUA`, „Bericht und Antrag"), a motion of the
 * Bundesrat (`GABR`, or `GABR13` from a third of its members) and a treaty's
 * Vorlage (`RVS`: a Staatsvertrag or an Art.-15a-Vereinbarung,
 * `treatyKindOf`). Same item types, other documents — an Ausschussbericht
 * is `I` with `AUB`, an Entschließungsantrag `A` with `A(E)` (read
 * 09.11.2026) — answer null: there is no law to follow, or (an Einspruch
 * `EBR`) not on a page of its own.
 */
export function pageKindOf(ityp: 'I' | 'A', doktyp: string | null | undefined): ProcedureItemKind | null {
  const d = (doktyp ?? '').trim()
  if (ityp === 'A') return d === 'A' ? 'initiativantrag' : null
  return KIND_OF_I_DOKTYP[d] ?? null
}

/**
 * Who moved a motion of the Bundesrat, from its document type: `GABR` is
 * the Bundesrat's own Gesetzesantrag (Art. 41 Abs. 1 B-VG), `GABR13` the
 * motion of a third of its members (§ 21 Abs. 6 GO-BR) — Parliament's type
 * reads „Gesetzesantrag von einem Drittel der Mitglieder des Bundesrates"
 * (1940 d.B. XXVII, read 14.11.2026). Null for every other type.
 */
export function bundesratVariantOf(doktyp: string | null | undefined): BundesratMotionVariant | null {
  const d = (doktyp ?? '').trim()
  return d === 'GABR' ? 'bundesrat' : d === 'GABR13' ? 'drittel' : null
}

/**
 * The committee that moved a committee's motion, in the nominative, from
 * the record's description — or null. The description names it in the
 * genitive, as read on 14.11.2026:
 *
 *   „Bericht und Antrag des Budgetausschusses über den Entwurf eines
 *   Bundesgesetzes, mit dem das Bundesbezügegesetz geändert wird" (14 d.B.)
 *   „Bericht und Antrag des Ausschusses für Wirtschaft, Industrie und
 *   Energie über den Entwurf …" (365 d.B.)
 *   „Bericht und Antrag des Verfassungsausschusses über den Entwurf …" (683 d.B.)
 *
 * Only a name whose first word is a „…ausschusses" is turned back into its
 * nominative (the -es off that word, the rest as written); anything else —
 * an adjective in front („des Ständigen Unterausschusses"), another shape of
 * the sentence — is null, and the byline says „von einem Ausschuss".
 */
export function committeeOfDescription(description: string | null | undefined): string | null {
  const text = stripHtmlToText(description ?? '').replace(/\s+/g, ' ').trim()
  const m = /^Bericht und Antrag des (\S*[Aa]usschusses)\b(.*?) über den Entwurf\b/.exec(text)
  if (!m?.[1]) return null
  return `${m[1].slice(0, -2)}${m[2] ?? ''}`.trim()
}

/**
 * The items a record names under „Bezug zu", in upstream order — those with
 * an address of the form `/gegenstand/<GP>/<type>/<nr>` only. `kind` and
 * `path` stay null here: whether the monitor has a page for one needs its
 * own record (`getVorlageDetail`).
 */
export function relatedItemsOf(reference: VorlageContent['reference']): RelatedItem[] {
  const items: RelatedItem[] = []
  for (const r of reference ?? []) {
    if ((r?.text ?? '').trim() !== 'Bezug zu') continue
    const m = /^\/gegenstand\/([IVXLC]+)\/([A-Z0-9-]+)\/(\d+)(?:\/|$)/.exec(parliamentPathname(absolutizeUrl(r.url ?? '') ?? '') ?? '')
    if (!m?.[1] || !m[2] || !m[3]) continue
    const gp = m[1]
    const ityp = m[2]
    const inr = Number(m[3])
    const title = stripHtmlToText(r.subject ?? '').trim() || null
    const citation = stripHtmlToText(r.zitation ?? '').trim() || `${inr}/${ityp}`
    items.push({ gp, ityp, inr, citation, title, kind: null, path: null, consultedDraft: null })
  }
  return items
}

/** The Ministerialentwurf a Vorlage's record names as its predecessor, or null. */
export function draftOfPreconst(preconst: VorlageContent['preconst']): { gp: string; inr: number } | null {
  for (const p of preconst ?? []) {
    const inr = Number(p?.inr)
    if (p?.ityp === 'ME' && p.gp_code && Number.isInteger(inr) && inr > 0) return { gp: String(p.gp_code), inr }
  }
  return null
}

/**
 * Whether an item's own record shows a Begutachtung behind it: it names its
 * Ministerialentwurf (`preconst`), or its committee invited written
 * Stellungnahmen (`readCommitteeConsultation`) — the reading of a committee
 * motion's „Bezug zu" parent (`skippedLaws.relatedReason`, 14.11.2026).
 */
export function parentConsulted(content: Pick<VorlageContent, 'preconst' | 'phase'>): boolean {
  return draftOfPreconst(content.preconst) !== null || readCommitteeConsultation(content.phase) !== null
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
  // A committee's motion: „Bericht und Antrag des … über den Entwurf eines
  // Bundesgesetzes, mit dem …" — the bill's title is the draft it names,
  // back in the nominative; nothing where the sentence has another shape.
  if (ityp === 'I' && /^Bericht und Antrag\b/.test(text)) {
    const bua = /\süber den Entwurf eines (Bundes(?:verfassungs)?gesetz)es\b(.*)$/s.exec(text)
    return bua?.[1] ? `${bua[1]}${bua[2] ?? ''}`.trim() : null
  }
  // A motion of the Bundesrat reads like an Antrag: „Gesetzesantrag des
  // Bundesrates vom … betreffend ein Bundesgesetz, mit dem …" (21 d.B.
  // XXVII), and a third's names its members before „betreffend" („… der
  // Bundesrätinnen und Bundesräte …, Kolleginnen und Kollegen vom …", 1940
  // d.B. XXVII) — only what follows „betreffend" is taken, never the rest.
  if (ityp === 'I' && !/^Gesetzesantrag\b/.test(text)) return text
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
  /** What the item is (`pageKindOf`); read off the record where not given. */
  itemKind?: ProcedureItemKind
  content: VorlageContent
  /** `relatedItemsOf(content.reference)`, with the pages the monitor has
   *  for them; that list itself where none were looked up. */
  relatedItems?: RelatedItem[]
  enactment: EnactmentInfo
  currentGp: string
  withoutBegutachtung: boolean
}

export function assembleVorlageDetail(input: VorlageDetailInputs): VorlageDetail {
  const { root, content, currentGp } = input
  const documents = mapDocuments(content.documents)
  const enactment: EnactmentInfo = { ...input.enactment, rvTextUrl: firstTextPdf(root.ityp, documents) }
  const kind = input.itemKind ?? pageKindOf(root.ityp, content.doktyp) ?? (root.ityp === 'I' ? 'regierungsvorlage' : 'initiativantrag')
  // A treaty's Vorlage can name its Ministerialentwurf too (331 and 383
  // d.B. XXVI, Art.-15a-Vereinbarungen out of 79 and 97/ME): then the
  // draft's page tells its story, as for a Regierungsvorlage.
  const draft = kind === 'regierungsvorlage' || kind === 'staatsvertrag' ? draftOfPreconst(content.preconst) : null
  const treatyKind = kind === 'staatsvertrag' ? treatyKindOf(content) ?? 'staatsvertrag' : null
  const committeeConsultation = readCommitteeConsultation(content.phase)
  return {
    gp: root.gp,
    ityp: root.ityp,
    inr: root.inr,
    itemKind: kind,
    citation: rootCitation(root),
    title: stripHtmlToText(content.title ?? '').trim() || rootCitation(root),
    officialTitle: officialTitleOf(root.ityp, content.description),
    parliamentUrl: parliamentItemUrl(root),
    arrivedAt: content.einlangen ? content.einlangen.slice(0, 10) : null,
    // A treaty's Vorlage is a Regierungsvorlage too (Parliament's type
    // „Regierungsvorlage: Staatsvertrag"), submitted by a member of the
    // government (119 d.B. XXVIII: the BMEIA; 388 d.B.: the BMF).
    ministry: kind === 'regierungsvorlage' || kind === 'staatsvertrag' ? ministryOf(content.names) : null,
    committee: kind === 'ausschussantrag' ? committeeOfDescription(content.description) : null,
    variant: kind === 'bundesratsantrag' ? bundesratVariantOf(content.doktyp) : null,
    treatyKind,
    // Parliament refuses Stellungnahmen on a treaty's Vorlage (its record:
    // `statementsstate` „9 …", on every one measured); no other kind is
    // refused here — a motion of the Bundesrat's „9" is an open question
    // (§ 23b GOG-NR), on which no copy claims anything.
    filing: kind === 'staatsvertrag' ? { possible: false, reason: 'treaty' } : { possible: true },
    relatedItems: input.relatedItems ?? relatedItemsOf(content.reference),
    moverClubs: kind === 'initiativantrag' ? moverClubsOf(content.names, content.vote) : null,
    documents,
    // Parliament's own versions only: the list opens with the item's text,
    // which `documents` already carries.
    textEvolution: groupVersionsByStation(
      mapTextEvolution(content.statements?.documents).filter((v) => v.stationId === 'ausschuss' || v.stationId === 'plenum'),
    ),
    enactment,
    // The item's own record outranks the list: a committee consultation is a
    // Begutachtung, so „ohne Begutachtung" is never said beside it.
    withoutBegutachtung: input.withoutBegutachtung && committeeConsultation === null,
    committeeConsultation,
    gpEnded: gpHasEnded(root.gp, currentGp),
    draftPath: draft ? `/entwuerfe/${draft.gp}/${draft.inr}` : null,
  }
}

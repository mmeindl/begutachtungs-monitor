/**
 * The Gegenstand detail JSON → shared/types: stages, documents, text
 * evolution, short info, RV/BGBl.
 *
 * PURE MODULE — no Nuxt auto-imports, only relative imports,
 * so vitest can execute the module directly.
 */
import type {
  CommitteeConsultation,
  DraftDocument,
  DescriptionBlock,
  DocumentFormat,
  Handoff,
  HouseVote,
  LawStationId,
  PlenaryAmendments,
  TextVersion,
  TraceLink,
  TraceStep,
} from '../../../shared/types'
import { gpHasEnded } from '../../../shared/utils/gp'
import { lawStationOf } from '../../../shared/utils/lawStations'
import { parseGermanDate, parseIsoDate } from './dates'
import { absolutizeUrl, extractLinks, stripHtmlToText } from './htmlText'

// ---------------------------------------------------------------------------
// Raw shapes of the detail JSONs (loosely typed — upstream is not contractual)
// ---------------------------------------------------------------------------

export interface RawStage {
  date?: string | null
  text?: string | null
}

export interface RawDocumentGroup {
  title?: string | null
  documents?: { link?: string | null; type?: string | null }[] | null
}

/**
 * Whether an item currently takes Stellungnahmen, from its detail JSON:
 * `statementsstate` is "1" while the form is open and "0" afterwards — on a
 * Ministerialentwurf while the Frist runs, on a Regierungsvorlage while the
 * Nationalrat has the text (verified 2026-09-15 on 132/ME with a running
 * Frist, the six newest GP-XXVIII Vorlagen and the enacted 2238 d.B.).
 * `statements.new` mirrors it as 1/0. Anything else reads as closed.
 */
export function isFilingOpen(content: { statementsstate?: unknown } | null | undefined): boolean {
  const state = content?.statementsstate
  return state === '1' || state === 1
}

/**
 * Whether a Regierungsvorlage's Gesetzgebungsperiode is over — the calendar
 * every statement about the VORLAGE is judged by: its open form below, the
 * station map's „Ohne Beschluss – GP beendet" row, and the detail page's
 * headline and rail (`EnactmentInfo.rvGpEnded`). ONE function for all three,
 * so the list row and the page cannot read a carry-over differently.
 *
 * `rvGp` is the period the Vorlage's own link names, never the draft's: a
 * carry-over (XXVII/352/ME → 127 d.B./XXVIII. GP) lives in the next period,
 * and judged by the draft's calendar it would read as lapsed while the house
 * still has it (docs/architecture.md §12.14, 01.10. and 02.10.2026). Where a
 * draft has no Vorlage, the draft's own period is the boundary
 * (`DraftDetail.gpEnded`, §12.10 Nr. 10) — that statement is about the draft.
 */
export function isVorlageGpEnded(rvGp: string, currentGp: string | null | undefined): boolean {
  return gpHasEnded(rvGp, currentGp)
}

/**
 * Whether a Regierungsvorlage takes Stellungnahmen — the zweite Runde, as
 * the detail page's door and the station map's row both state it. ONE
 * function for both, because they once disagreed: the flag counts only
 * while the VORLAGE's period runs, a Vorlage that lapsed with it takes
 * nothing, whatever a stale flag says.
 *
 * `rvGp` is the period the Vorlage's own link names, never the draft's:
 * a carry-over (XXVII/352/ME → 127 d.B./XXVIII. GP) lives in the next
 * period, and judged by the draft's calendar its open window would read as
 * closed (docs/architecture.md §12.14, 01.10.2026).
 */
export function isVorlageFilingOpen(
  content: { statementsstate?: unknown } | null | undefined,
  rvGp: string,
  currentGp: string | null | undefined,
): boolean {
  return isFilingOpen(content) && !isVorlageGpEnded(rvGp, currentGp)
}

export interface RawName {
  funktext?: string | null
  name?: string | null
}

export interface RawShortinfo {
  teil1?: string | null
  teil2?: string | null
}

export interface RawBgblLink {
  title?: string | null
  link?: string | null
}

/** content.stages[] → TraceSteps (HTML stripped, links extracted + absolutized). */
export function parseStages(stages: RawStage[] | null | undefined): TraceStep[] {
  if (!Array.isArray(stages)) return []
  return stages.map((stage) => {
    const html = stage?.text ?? ''
    return {
      date: parseGermanDate(stage?.date) ?? parseIsoDate(stage?.date),
      text: stripHtmlToText(html),
      links: extractLinks(html),
    }
  })
}

/** One phase of a Gegenstand's Verlauf („Einlangen NR", „Ausschussberatungen NR", …). */
export interface RawPhase {
  name?: string | null
  stages?: RawStage[] | null
}

const CONSULTATION_DECIDED = /Beschlussfassung auf Einholung schriftlicher Stellungnahmen/i
const CONSULTATION_ADDRESSEE = /Antrag auf Einholung einer Stellungnahme von .+ - angenommen\s*$/i

/**
 * The Ausschussbegutachtung of a Vorlage, read from its Verlauf — or null.
 *
 * STRUCTURED, unlike the oral hearing (docs/architecture.md §12.14, counted
 * 26.09.2026): one stage „…: Beschlussfassung auf Einholung schriftlicher
 * Stellungnahmen im Rahmen einer Ausschussbegutachtung" and one stage per
 * addressee, „Antrag auf Einholung einer Stellungnahme von <Institution> -
 * angenommen". Field and report prose agreed on 8 of 8 Vorlagen of GP XXVIII.
 * A rejected motion for a consultation leaves no decision stage, so it is not
 * read as one.
 */
export function readCommitteeConsultation(phases: RawPhase[] | null | undefined): CommitteeConsultation | null {
  if (!Array.isArray(phases)) return null
  const stages = phases.flatMap((p) => (Array.isArray(p?.stages) ? p.stages : []))
  const decided = stages.find((s) => CONSULTATION_DECIDED.test(stripHtmlToText(s?.text ?? '')))
  if (!decided) return null
  const text = stripHtmlToText(decided.text ?? '')
  const colon = text.indexOf(':')
  return {
    committee: colon > 0 ? text.slice(0, colon).trim() : null,
    date: parseGermanDate(decided.date) ?? parseIsoDate(decided.date),
    invited: stages.filter((s) => CONSULTATION_ADDRESSEE.test(stripHtmlToText(s?.text ?? ''))).length,
  }
}

const NR_COMMITTEE_PHASE = /^Ausschussberatungen NR$/i
const COMMITTEE_REPORT_STAGE = /:\s*Bericht\b/
const NR_REPORT_LINK = /\/gegenstand\/[IVXLC]+\/I\/\d+(?:[/?#]|$)/

/**
 * The Nationalrat committee's report on a Vorlage (Ausschussbericht, „11
 * d.B."), read from its Verlauf — or null.
 *
 * One stage „<Ausschuss>: Bericht <a href="/gegenstand/XXVIII/I/11">11
 * d.B.</a>" in the phase „Ausschussberatungen NR"; 12 of 13 sampled GP-XXVIII
 * Vorlagen carried exactly one (02.10.2026), the 13th none. The Bundesrat's
 * report („…des Bundesrates: Bericht 11666/BR d.B.") stands in a phase of its
 * own and is not this one. Should a Vorlage be reported twice, the last
 * report is the one behind the committee's text.
 */
export function findCommitteeReport(phases: RawPhase[] | null | undefined): TraceLink | null {
  if (!Array.isArray(phases)) return null
  let report: TraceLink | null = null
  for (const phase of phases) {
    if (!NR_COMMITTEE_PHASE.test((phase?.name ?? '').trim()) || !Array.isArray(phase.stages)) continue
    for (const stage of phase.stages) {
      const html = stage?.text ?? ''
      if (!COMMITTEE_REPORT_STAGE.test(stripHtmlToText(html))) continue
      report = extractLinks(html).find((link) => NR_REPORT_LINK.test(link.url)) ?? report
    }
  }
  return report
}

const NR_PLENARY_PHASE = /^Plenarberatungen NR$/i
const NR_SESSION_LINK = /\/gegenstand\/[IVXLC]+\/NRSITZ\/\d+(?:[/?#]|$)/
const AMENDMENT_LINK = /\/gegenstand\/[IVXLC]+\/AA\/\d+(?:[/?#]|$)/
const OUTCOME = /\b(angenommen|abgelehnt)\b/
const THIRD_READING = /\bdritter Lesung\b/

/**
 * The Abänderungsanträge the Nationalrat adopted on a Vorlage in plenary,
 * and the session that adopted them, read from its Verlauf — or null when
 * the Verlauf has no plenary phase.
 *
 * Each motion is a stage of its own in „Plenarberatungen NR", „35. Sitzung
 * des Nationalrates: Abänderungsantrag der Abgeordneten … (<a
 * href="/gegenstand/XXVIII/AA/19">AA-19</a>)<br><b>angenommen</b>"; the
 * session is linked from the stage that put the Vorlage on its agenda. Same
 * shape in GP XXVII and XXVIII (02.10.2026). Where a Vorlage was debated in
 * more than one session, the one that adopted the last motion — or, without
 * one, held the third reading — is the session behind the Plenarfassung.
 * Only the motion's number travels, never who tabled it.
 */
export function findPlenaryAmendments(phases: RawPhase[] | null | undefined): PlenaryAmendments | null {
  if (!Array.isArray(phases)) return null
  const sessions: TraceLink[] = []
  const adopted: { session: string; motion: TraceLink }[] = []
  let thirdReadingIn: string | null = null
  let seen = false
  for (const phase of phases) {
    if (!NR_PLENARY_PHASE.test((phase?.name ?? '').trim()) || !Array.isArray(phase.stages)) continue
    seen = true
    for (const stage of phase.stages) {
      const html = stage?.text ?? ''
      const text = stripHtmlToText(html)
      const colon = text.indexOf(':')
      const sessionName = colon > 0 ? text.slice(0, colon).trim() : null
      const links = extractLinks(html)
      for (const link of links) {
        if (NR_SESSION_LINK.test(link.url) && !sessions.some((s) => s.url === link.url)) sessions.push(link)
      }
      if (sessionName && THIRD_READING.test(text)) thirdReadingIn = sessionName
      const motion = links.find((link) => AMENDMENT_LINK.test(link.url))
      if (!motion || !sessionName) continue
      // The outcome follows the motion's own number; the names before it are not read.
      const after = text.slice(text.indexOf(motion.label) + motion.label.length)
      if (OUTCOME.exec(after)?.[1] === 'angenommen') adopted.push({ session: sessionName, motion })
    }
  }
  if (!seen) return null
  const decidedIn = adopted.at(-1)?.session ?? thirdReadingIn
  return {
    session: sessions.find((s) => s.label === decidedIn) ?? sessions.at(-1) ?? null,
    amendments: adopted.filter((a) => a.session === decidedIn).map((a) => a.motion),
  }
}

export interface RvLink {
  gp: string
  inr: number
  label: string
  url: string
  /** Date of the stage carrying the link, null when that stage is undated */
  date: string | null
}

/**
 * Every /gegenstand/{gp}/I/{nr} link in the process history, in stage order
 * = the Regierungsvorlagen this draft produced (ME→RV is 1:n,
 * docs/architecture.md §5). Each carries the date of the stage it sits in —
 * the RV station's date in the SpineRail, available nowhere else.
 */
export function findRvLinks(trace: TraceStep[]): RvLink[] {
  const found: RvLink[] = []
  for (const step of trace) {
    for (const link of step.links) {
      const m = /\/gegenstand\/([IVXLC]+)\/I\/(\d+)(?:[/?#]|$)/.exec(link.url)
      if (m?.[1] && m[2]) {
        found.push({
          gp: m[1],
          inr: Number(m[2]),
          label: link.label || `${m[2]} d.B.`,
          url: link.url,
          date: step.date,
        })
      }
    }
  }
  return found
}

/** The latest RV — the one the outcome hangs off. */
export function findLastRvLink(trace: TraceStep[]): RvLink | null {
  return findRvLinks(trace).at(-1) ?? null
}

/**
 * The RV a comparison stands on: the one whose Gesetzestext the draft's own
 * text-evolution list carries (`rvTextUrl`, the `rv` station of
 * `findLawStations`), else the latest.
 *
 * ME→RV 1:n is a split, not a choice between versions: in the four drafts
 * of XXVI–XXVIII where the two readings disagree, every Vorlage is a
 * different law and each was kundgemacht (26/ME XXVIII → 128, 130 and
 * 129 d.B., three Bundesgesetzblätter; read 28.09.2026). Parliament attaches one of those texts to the draft.
 * The § comparison reads that text, so the Erläuterungen and the
 * Kundmachung compared beside it have to come from the same Vorlage — by
 * stage order alone, 26/ME compared the Bildungsdirektionen-Einrichtungsgesetz
 * against the Erläuterungen and the Bundesgesetzblatt of the
 * Informationsfreiheits-Anpassungsgesetz (docs/architecture.md §13.4).
 */
export function findComparisonRvLink(trace: TraceStep[], rvTextUrl: string | null | undefined): RvLink | null {
  const links = findRvLinks(trace)
  const m = rvTextUrl ? /\/dokument\/([IVXLC]+)\/I\/(\d+)\//.exec(rvTextUrl) : null
  const own = m ? links.find((l) => l.gp === m[1] && l.inr === Number(m[2])) : undefined
  return own ?? links.at(-1) ?? null
}

/**
 * Does this Regierungsvorlage bundle the draft with OTHER
 * Ministerialentwürfe? Read off the Vorlage's `preconst[]`
 * (docs/architecture.md §12.33, 30.09.2026).
 *
 * The question behind it is whose laws the later texts carry. A Vorlage can
 * hold more laws than its draft for two reasons, and the page must treat them
 * differently: the Ressort added a law of its own after the Begutachtung
 * (1/ME XXVIII: the Tilgungsgesetz 1972 beside the new RKEG) — then that law
 * is part of THIS Vorlage, and what the committee did to it belongs in the
 * committee's comparison —, or the government merged several ministries'
 * drafts into one Sammelgesetz (129 d.B.: twelve drafts, 138 Artikel) — then
 * all but a few Artikel are someone else's. The laws alone cannot tell the
 * two apart; Parliament's record can, because the Vorlage names every draft
 * it absorbed.
 *
 * `null` where the record says nothing: `preconst` is not a universal field
 * (32 of 117 Vorlagen of GP XXVIII carry none, `precedingDraft.ts`), and a
 * missing list proves no bundling in either direction.
 */
export function bundlesOtherDrafts(
  preconst: { gp_code?: string | null; ityp?: string | null; inr?: number | string | null }[] | null | undefined,
  gp: string,
  inr: number,
): boolean | null {
  const drafts = (preconst ?? []).filter((p) => p?.ityp === 'ME' && p.gp_code && p.inr != null)
  if (!drafts.length) return null
  return drafts.some((p) => String(p.gp_code) !== gp || Number(p.inr) !== inr)
}

/**
 * The Übermittlung stage → who received the Stellungnahmen and when. Text
 * is ministries' free wording behind a fixed prefix ("Übermittlung an das
 * Bundesministerium für …", "… an das Bundeskanzleramt"), so match the
 * prefix and pass the rest through verbatim; no match → no claim.
 */
const HANDOFF_RE = /^Übermittlung an\s+(.+?)\s*$/

export function findHandoff(trace: TraceStep[]): Handoff | null {
  for (const step of trace) {
    const m = HANDOFF_RE.exec(step.text)
    if (m?.[1]) return { date: step.date, recipient: m[1] }
  }
  return null
}

/** content.documents[] → draft documents with pdf/html formats. */
export function mapDocuments(groups: RawDocumentGroup[] | null | undefined): DraftDocument[] {
  if (!Array.isArray(groups)) return []
  const result: DraftDocument[] = []
  for (const group of groups) {
    const formats: DocumentFormat[] = []
    for (const doc of group?.documents ?? []) {
      const link = doc?.link ?? ''
      const type = (doc?.type ?? '').toUpperCase()
      if (!link) continue
      if (type === 'PDF') formats.push({ type: 'pdf', url: absolutizeUrl(link) })
      else if (type === 'HTML') formats.push({ type: 'html', url: absolutizeUrl(link) })
    }
    if (formats.length > 0) {
      result.push({ title: stripHtmlToText(group?.title ?? '') || 'Dokument', formats })
    }
  }
  return result
}

/**
 * Upstream titles the stations by the document, not by the station. The
 * first entry is the Regierungsvorlage's text but is called "Gesetzestext"
 * — the same word the Ministerialentwurf's own text carries in the document
 * list on the same page, pointing at a different PDF. Rename to the station;
 * the later two already name theirs.
 */
export const RV_STATION = 'Regierungsvorlage'

const STATION_TITLES: Record<string, string> = {
  Gesetzestext: RV_STATION,
}

/**
 * content.statements.documents[] (misleading key!) → the law text at the
 * stations AFTER the Ministerialentwurf: Regierungsvorlage → geändert im
 * Ausschuss → geändert im Plenum.
 *
 * The field is "the text as it stands now", not "the text after the
 * Begutachtung": while no Regierungsvorlage exists it simply repeats the
 * draft's own Gesetzestext — in the XXVIII corpus for exactly the 42 of 132
 * consultations without an RV, byte-identical URLs, no exceptions. Those are
 * not a further version, so `excludeUrls` (the ME's own document URLs) drops
 * them and the section disappears instead of relisting the same PDF under a
 * heading that promises evolution.
 */
export function mapTextEvolution(
  groups: RawDocumentGroup[] | null | undefined,
  excludeUrls: ReadonlySet<string> = new Set(),
): TextVersion[] {
  const versions: TextVersion[] = []
  for (const doc of mapDocuments(groups)) {
    const station = STATION_TITLES[doc.title.trim()] ?? doc.title
    // Upstream's title stays the label; the id is what the comparison may
    // select. Null for the documents that share this list without being a
    // version of the law text — a Verhältnismäßigkeitsprüfung (3 drafts in
    // GP XXVI–XXVIII), a Vertragstext (2). They keep their row in the
    // document list and are never offered as a side to compare.
    const stationId = lawStationOf(station)
    for (const format of doc.formats) {
      if (excludeUrls.has(format.url)) continue
      versions.push({
        station,
        stationId,
        label: `${station} (${format.type.toUpperCase()})`,
        url: format.url,
      })
    }
  }
  return versions
}

/**
 * Block-level scanner for shortinfo HTML. Alternation groups:
 * 1 = heading level, 2 = heading body, 3 = ul|ol, 4 = list body, 5 = <p> body.
 */
const SHORTINFO_BLOCK_RE =
  /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1\s*>|<(ul|ol)\b[^>]*>([\s\S]*?)<\/\3\s*>|<p\b[^>]*>([\s\S]*?)<\/p\s*>/gi

const LIST_ITEM_RE = /<li\b[^>]*>([\s\S]*?)<\/li\s*>/gi

/** Ministries use <br> as a paragraph break inside one <p> — split on it. */
function paragraphBlocks(html: string): DescriptionBlock[] {
  return html
    .split(/<\s*br\s*\/?\s*>/i)
    .map((chunk) => stripHtmlToText(chunk))
    .filter((text) => text.length > 0)
    .map((text) => ({ kind: 'paragraph', text }))
}

/**
 * content.shortinfo (teil1 + teil2) → typed blocks.
 *
 * Headings and lists come from the upstream TAGS, never from matching words
 * like "Ziel"/"Inhalt": the section names are ministries' free text (8/ME alone
 * adds "Hauptgesichtspunkte des Entwurfs", and writes `Inhalt&nbsp;`), the same
 * trap documented for document names in docs/api-exploration.md §1.
 * Text outside a recognised block tag is kept as loose paragraphs, not dropped.
 */
export function parseShortinfo(
  shortinfo: RawShortinfo | null | undefined,
): DescriptionBlock[] {
  if (!shortinfo) return []
  const html = [shortinfo.teil1, shortinfo.teil2].filter(Boolean).join('\n')

  const blocks: DescriptionBlock[] = []
  let cursor = 0
  SHORTINFO_BLOCK_RE.lastIndex = 0

  let match: RegExpExecArray | null
  while ((match = SHORTINFO_BLOCK_RE.exec(html)) !== null) {
    blocks.push(...paragraphBlocks(html.slice(cursor, match.index)))
    cursor = match.index + match[0].length

    if (match[2] !== undefined) {
      const text = stripHtmlToText(match[2])
      if (text) blocks.push({ kind: 'heading', text })
    } else if (match[4] !== undefined) {
      const items: string[] = []
      LIST_ITEM_RE.lastIndex = 0
      let item: RegExpExecArray | null
      while ((item = LIST_ITEM_RE.exec(match[4])) !== null) {
        const text = stripHtmlToText(item[1] ?? '')
        if (text) items.push(text)
      }
      if (items.length) blocks.push({ kind: 'list', items })
    } else {
      blocks.push(...paragraphBlocks(match[5] ?? ''))
    }
  }
  blocks.push(...paragraphBlocks(html.slice(cursor)))

  return blocks
}

/** content.names[] → minister with funktext "Übermittelt von" (submitted by). */
export function mapInvitedBy(names: RawName[] | null | undefined): string | null {
  if (!Array.isArray(names)) return null
  const entry = names.find((n) => n?.funktext === 'Übermittelt von')
  const name = entry?.name?.trim()
  return name || null
}

/**
 * The Dokumentnummer inside a BgblAuth link — `BGBLA_2024_I_42` = Teil I,
 * Nr. 42 of 2024. Structured, in a way the title beside it is not.
 */
const BGBL_DOKUMENTNUMMER_RE = /\bDokumentnummer=BGBLA_(\d{4})_(I{1,3})_(\d+)\b/i

/** The same three facts as upstream words them in the title, when it does. */
const BGBL_TITLE_RE = /\b(I{1,3})\s+Nr\.\s*(\d+)\/(\d{4})\b/

/**
 * The citation, read from the link rather than from the title beside it.
 *
 * Both name the same Kundmachung, but only one of them is a structured
 * field. 2446 d.B. (XXVII, out of 300/ME) titles its entry
 * „Bundesgesetzblatt Nr. 42/2024" — the Teil is simply missing — while its
 * link says `BGBLA_2024_I_42`. One typo, and three things downstream broke
 * at once: `bgblOrderKey` refuses a citation without a Teil, so the law fell
 * out of „Zuletzt Gesetz geworden"; `bgblShort` printed „BGBl. Nr. 42/2024";
 * and the RIS lookup, which searches by exactly that short form, found
 * nothing.
 *
 * So the link decides, and the title is kept only where it already says the
 * same three things — a Ressort's own spelling of a correct citation is
 * worth keeping, a wrong one is not.
 */
function bgblNumberOf(entry: RawBgblLink): string | null {
  const title = entry.title?.trim() || null
  const m = BGBL_DOKUMENTNUMMER_RE.exec(entry.link ?? '')
  if (!m) return title
  const [, year, teil, nr] = m
  const t = title ? BGBL_TITLE_RE.exec(title) : null
  if (t && t[1] === teil && t[2] === nr && t[3] === year) return title
  return `Bundesgesetzblatt ${teil} Nr. ${nr}/${year}`
}

/**
 * content.status.bgbllinks[] of the RV → BGBl entry.
 * Selected via `Abfrage=BgblAuth` in the link — NEVER blindly [0]
 * (a "Kunsttext" entry exists alongside it).
 */
export function extractBgblLink(
  bgbllinks: RawBgblLink[] | null | undefined,
): { number: string | null; url: string } | null {
  if (!Array.isArray(bgbllinks)) return null
  const entry = bgbllinks.find((l) => (l?.link ?? '').includes('Abfrage=BgblAuth'))
  if (!entry?.link) return null
  return { number: bgblNumberOf(entry), url: entry.link }
}

/** In procedural order, so the answer does not depend on upstream's ordering. */
const PARLIAMENT_LAW_STATIONS: readonly LawStationId[] = ['ausschuss', 'plenum']

/**
 * The parliamentary stations at which a **Regierungsvorlage** published a
 * changed text, read from its OWN document list.
 *
 * Why not from the Ministerialentwurf's copy of the same list, which is what
 * the detail page renders: ME→RV is 1:n (§13.4), and the mirror on the draft
 * belongs to exactly one of the Vorlagen. XXVIII/26/ME links three, filed the
 * same day (128, 130, 129 d.B.); its mirror carries 130 d.B.'s Gesetzestext
 * alone, while 129 d.B. — the one whose BGBl number the page states — lists
 * „Geändert im Ausschuss" and „Geändert im Plenum". Read from the mirror, the
 * page said „Text unverändert beschlossen" about a text both chambers changed
 * (verified live 23.09.2026, 27/ME the same).
 *
 * Only the two parliamentary stations: the list's first entry is the
 * Vorlage's own Gesetzestext, which is the text those two are changes TO.
 */
export function amendedStationsOf(
  groups: RawDocumentGroup[] | null | undefined,
): LawStationId[] {
  const seen = new Set<LawStationId>()
  for (const version of mapTextEvolution(groups)) {
    if (version.stationId === 'ausschuss' || version.stationId === 'plenum') {
      seen.add(version.stationId)
    }
  }
  return PARLIAMENT_LAW_STATIONS.filter((id) => seen.has(id))
}

export interface RawVote {
  result?: { text?: unknown; infavor?: unknown }[] | null
  infavor?: unknown
  code?: unknown
  text?: unknown
  comment?: unknown
}

/**
 * content.vote of a Regierungsvorlage → who voted how in the third reading.
 *
 * Upstream ships TWO shapes under the same key, and only the first is a
 * record of clubs:
 *
 * 1. `result[]` with one entry per Klub (`text`, `infavor`, plus a seat
 *    count and a colour we do not read) — the club-level vote.
 * 2. `result: []` with a controlled word in `text` instead („Namentliche
 *    Abstimmung", „mehrstimmig", „Einstimmig"; the `code` starts with an
 *    underscore). Upstream has no club record for those, and the `comment`
 *    beside them is free prose in shifting formats („abgegebene Stimmen:
 *    176; davon Ja-Stimmen: 105 …", „dafür: V, F, N, tlw. P", and in GP XXV
 *    once „abgegene Stimmen"). Reading clubs out of that would be our
 *    parse of a sentence, not a record, so shape 2 answers null.
 *
 * Measured 24.09.2026 over the Regierungsvorlagen of nine periods (list 101,
 * columns 31–35 carry the same values): of the Vorlagen that were voted on,
 * shape 1 covers 108 of 110 in GP XXVIII, 360 of 361 in XXVII, and 398 of
 * 423 as far back as GP XX. The residue is shape 2, almost all of it
 * namentliche Abstimmungen and old „mehrstimmig" rows. `vote` itself is null
 * until the third reading happens: all 13 GP-XXVIII Vorlagen without one
 * were still in Behandlung.
 *
 * We do not compute vote COUNTS from the seat numbers upstream also ships.
 * They are the clubs' mandates, not the deputies in the room — the
 * namentliche Abstimmungen record 176 and 163 votes cast out of 183 seats —
 * so a total added up here would be our arithmetic wearing the authority of
 * a count.
 */
export function parseVote(vote: RawVote | null | undefined): HouseVote | null {
  const result = vote?.result
  if (!Array.isArray(result) || result.length === 0) return null
  const infavor: string[] = []
  const against: string[] = []
  for (const club of result) {
    const name = typeof club?.text === 'string' ? club.text.trim() : ''
    if (!name) continue
    // Anything that is not an explicit `true` counts as not in favour —
    // upstream's own two-way flag, and there is no third state in it.
    ;(club.infavor === true ? infavor : against).push(name)
  }
  if (infavor.length === 0 && against.length === 0) return null
  return { infavor, against, passed: vote?.infavor === true }
}

/**
 * Publication order of a Bundesgesetzblatt citation as upstream words it
 * ("Bundesgesetzblatt I Nr. 65/2026"), or null for anything that is not
 * Teil I.
 *
 * WHY THE NUMBER AND NOT A DATE: within a year BGBl numbers are handed out
 * in publication order, and no date of promulgation reaches us — the
 * Parliament record carries the BGBl link without one, and every date column
 * of list 101 is the Einlangen date (`docs/api-exploration.md` §101).
 * Measured 2026-09-18 over the 30 most recently finished Vorlagen of GP
 * XXVIII: the decision dates do NOT order the promulgations (443 d.B. was
 * decided on 03.06. and published as 81/2026, after laws decided on 16.07.
 * that went out as 62–78/2026), so ordering by the number is not a
 * convenience — it is the only correct order available.
 *
 * Teil I only, deliberately: Teil III carries Staatsverträge, whose numbers
 * run in their own series, and comparing the two would interleave two
 * sequences into one wrong order. "Gesetz geworden" is Teil I anyway.
 */
export function bgblOrderKey(number: string | null | undefined): number | null {
  if (!number) return null
  const m = /\bNr\.\s*(\d+)\/(\d{4})\b/.exec(number)
  if (!m) return null
  // "Bundesgesetzblatt I Nr. …" — the part sits between the word and "Nr.".
  if (!/\bBundesgesetzblatt\s+I\s+Nr\./.test(number) && !/\bBGBl\.\s*I\s*Nr\./.test(number)) {
    return null
  }
  return Number(m[2]) * 100_000 + Number(m[1])
}

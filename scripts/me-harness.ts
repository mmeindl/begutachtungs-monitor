#!/usr/bin/env vite-node
/**
 * The amendment engine on the input the *site* would give it: the
 * Novellierungsanordnungen of a Ministerialentwurf (docs/architecture.md
 * §12.12).
 *
 * Usage:  npx vite-node scripts/me-harness.ts --discover=40 [--cache] [--quiet]
 *         npx vite-node scripts/me-harness.ts BEGUT_COO_2026_… [--oracle-debug]
 *
 * **Why a second harness.** `kons-harness.ts` measures BGBl → BrKons: the
 * enacted instructions of a promulgated Novelle, applied to the version RIS
 * says they were applied to, scored against the version RIS says came out.
 * That is the only path with a ground truth, and it is not the path the
 * product runs on. A consultation page shows a *draft*: instructions written
 * months earlier, against the law as it stands on the first day of the
 * Begutachtung, with no enacted version to check them against — and 59 % of
 * the drafts are packages, which the BGBl harness could not score at all
 * until the per-Artikel split (2026-09-18).
 *
 * So this script answers the questions the other one cannot:
 *
 *   1. *Does the join even work from this end?* The BGBl harness starts from
 *      a Bundesgesetzblatt and can fall back on its Kundmachungsorgan; a
 *      draft has only its Promulgationsklausel and the date its consultation
 *      opened. Every law it cannot resolve is a consultation page that would
 *      show no consolidated text whatever the engine can do.
 *   2. *Do draft instructions read like enacted ones?* They are written in
 *      the same legistic XML, but nothing has ever measured that — the
 *      grammar corpus (`novao-corpus.ts`) harvested draft instructions and
 *      only ever counted them, never applied one.
 *   3. *What would a gate actually publish?* Refusal and plausibility are
 *      knowable at draft time; the RIS truth is not. The only second opinion
 *      available on the day is the ressort's own Textgegenüberstellung, and
 *      here it belongs to the very draft being applied — not, as in the BGBl
 *      harness, to the draft a later Regierungsvorlage was built from.
 *
 * There is deliberately **no correctness percentage** in the output. Nothing
 * here can produce one: at draft time the law that comes out does not exist.
 * What the oracle confirms is confirmed, what it does not is unknown, and a
 * number that blurred the two would be the harness reporting its own
 * coverage as accuracy.
 */
import { applyNovelle, instructionsFromUnits, type StandingLaw } from '../server/utils/lawApply'
import { plainText, type LawNode } from '../server/utils/lawStructure'
import { parseRisXml, segmentUnits, type TextBlock } from '../server/utils/lawText'
import { articleBlocks, draftArticles, type DraftArticle } from '../server/utils/lawTitles'
import { fetchLawAsOf, fetchParagraphTree, getText, resolveGesetzesnummer, resolveLawByBgbl, type KonsParagraphRef } from '../server/utils/risKons'
import { guardParagraph, type GuardFlag } from '../server/utils/applyGuard'
import { isScanned, parseTextComparison } from '../server/utils/textComparison'
import { oracleVerdict, paragraphRows, rowsByParagraph, type OracleVerdict } from '../server/utils/tguOracle'
import { dedupeMeRows, joinRisToMe, type MeListRow, type RisBegutRecord } from '../server/utils/risJoin'
import { parseExplanations } from '../server/utils/explanations'
import { explanationsByParagraph } from '../server/utils/explanationsJoin'
import { explanationKey, explanationParaId } from '../shared/utils/explanations'
import { installFetchCache } from './harness-cache'
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'

const RIS = 'https://data.bka.gv.at/ris/api/v2.6/Bundesrecht'
const UA = { 'User-Agent': 'begutachtungs-monitor/0.1 (+https://begutachtungs-monitor.at)', Accept: 'application/json' }
const TGU_NAME = /gegen.?über|^TG(Ü|G|UE)$/i
/** Dieselbe lose Schreibweise wie in `risRecord.ts`. */
const ERL_NAME = /erl(ä|ae|a)uterung/i

/**
 * `--annex=parlament` reads the ressort's Textgegenüberstellung from
 * Parliament instead of from RIS.
 *
 * It is the *same document*, published twice. Measured over all 135
 * GP-XXVIII Ministerialentwürfe on 18.09.2026, Parliament is the better of
 * the two copies: 74 drafts carry it as HTML against 62 with readable RIS
 * XML, 8 (up to 13) of them where RIS has no annex at all, and exactly one
 * case the other way round. Coverage is the binding constraint on
 * publishable consolidated text — 41 % of paragraphs where an annex can be
 * read, 0 % where it cannot — so ten points of it is worth more than any
 * engine fix currently on the list.
 *
 * The default stays `ris`, so every number measured before this flag existed
 * is still reproducible by leaving it off.
 */
const annexSource = (process.argv.find((a) => a.startsWith('--annex='))?.slice('--annex='.length) ?? 'ris') as 'ris' | 'parlament'
/**
 * `--erl` hängt an jeden ausgegebenen Paragraphen die Passage des Besonderen
 * Teils der Erläuterungen, die ihn erklärt.
 *
 * Die Frage dahinter ist die teuerste offene des Pakets: Gibt es ein zweites,
 * von der Textgegenüberstellung unabhängiges Signal? Die Deckung des Tors ist
 * heute die Deckung des Anhangs (41 % der §§ mit Anhang, 0 % ohne), und die
 * Hälfte der Entwürfe hat keinen. Der Besondere Teil ist der nächstliegende
 * Kandidat: Er adressiert seine Passagen mit derselben Adresse
 * („Zu Z 4 (§ 54c Abs. 1a und 1b):"), die das Werkzeug ohnehin berechnet
 * (§12.30, Deckung 77,8 %), und er stammt vom Ressort, nicht von uns.
 *
 * Gemessen wird hier NICHTS entschieden: Das Skript legt die Passagen neben
 * das Urteil des Anhangs, damit sich auswerten lässt, ob sie dieselbe Aussage
 * tragen. Erst wenn das gemessen ist, gehört eine Regel in `server/utils`.
 */
const withExplanations = process.argv.includes('--erl')
const verbose = !process.argv.includes('--quiet')
const dumpFile = process.argv.find((a) => a.startsWith('--dump='))?.slice('--dump='.length) ?? null
if (dumpFile) writeFileSync(dumpFile, '')
if (process.argv.includes('--cache')) installFetchCache(process.env.HARNESS_CACHE ?? '.harness-cache')

/* eslint-disable @typescript-eslint/no-explicit-any */
async function risJson(params: Record<string, string>): Promise<any> {
  const url = `${RIS}?${new URLSearchParams(params)}`
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(30_000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return await res.json()
}

function asArray<T>(x: T | T[] | null | undefined): T[] {
  return x === null || x === undefined ? [] : Array.isArray(x) ? x : [x]
}

interface Draft {
  id: string
  titel: string
  /** First day of the consultation — the date the standing law is read as of */
  beginn: string
  mainXml: string | null
  annexXml: string | null
  /** An annex that exists but only as a PDF or a scan, which is not the same as none */
  annexNote: string | null
  /** Die Erläuterungen als eigenes RIS-Dokument (`--erl`) */
  erlXml: string | null
}

function draftOf(ref: any): Draft | null {
  const meta = ref?.Data?.Metadaten
  const id = meta?.Technisch?.ID
  const beginn = String(meta?.Bundesrecht?.Begut?.BeginnBegutachtungsfrist ?? '').slice(0, 10)
  if (!id || !beginn) return null
  const contents = asArray<any>(ref?.Data?.Dokumentliste?.ContentReference)
  const xmlOf = (c: any): string | null => asArray<any>(c?.Urls?.ContentUrl).find((u) => u?.DataType === 'Xml')?.Url ?? null
  const annex = contents.find((c) => TGU_NAME.test(String(c?.Name ?? '').trim()))
  return {
    id,
    titel: String(meta?.Bundesrecht?.Kurztitel ?? meta?.Bundesrecht?.Titel ?? '').replace(/<br\/>[\s\S]*/, '').trim(),
    beginn,
    mainXml: xmlOf(contents.find((c) => c?.ContentType === 'MainDocument')),
    annexXml: annex ? xmlOf(annex) : null,
    annexNote: !annex ? 'ohne Textgegenüberstellung' : xmlOf(annex) ? null : 'Textgegenüberstellung nur als PDF',
    erlXml: xmlOf(contents.find((c) => ERL_NAME.test(String(c?.Name ?? '').trim()))),
  }
}

/** The N newest Begutachtungen RIS holds, in the order it returns them. */
async function discover(count: number): Promise<Draft[]> {
  const out: Draft[] = []
  for (let page = 1; page <= 40 && out.length < count; page++) {
    const body = await risJson({ Applikation: 'Begut', DokumenteProSeite: 'OneHundred', Seitennummer: String(page) })
    const refs = asArray<any>(body?.OgdSearchResult?.OgdDocumentResults?.OgdDocumentReference)
    if (refs.length === 0) break
    for (const ref of refs) {
      const draft = draftOf(ref)
      if (draft && out.length < count) out.push(draft)
    }
  }
  return out
}

async function fetchDraft(id: string): Promise<Draft | null> {
  const body = await risJson({ Applikation: 'Begut', Suchworte: id, DokumenteProSeite: 'Ten' })
  const ref = asArray<any>(body?.OgdSearchResult?.OgdDocumentResults?.OgdDocumentReference).find((r) => r?.Data?.Metadaten?.Technisch?.ID === id)
  return ref ? draftOf(ref) : null
}

/**
 * RIS Begut id → the Ministerialentwurf Parliament files it under.
 *
 * Built from the committed GP-XXVIII fixtures through the production join
 * (`risJoin.ts`, 99 % precision on the GP-XXVII corpus test, `docs/ris-join.md`),
 * so this costs no requests and is reproducible offline. The fixtures were
 * taken on 07.09.2026: drafts published after that have no entry and fall
 * back to the RIS annex, which is the safe direction — a missing join reads
 * as "no Parliament copy", never as a wrong one.
 */
let meByRisId: Map<string, { gp: string; inr: number }> | null = null
function parliamentMeFor(risId: string): { gp: string; inr: number } | null {
  if (!meByRisId) {
    meByRisId = new Map()
    const fixture = <T,>(f: string): T => JSON.parse(readFileSync(new URL(`../tests/fixtures/${f}`, import.meta.url), 'utf8')) as T
    for (const gp of ['gp27', 'gp28']) {
      const ris = fixture<RisBegutRecord[]>(`ris-begut-${gp}.json`)
      const mes = dedupeMeRows(fixture<MeListRow[]>(`me-${gp}.json`))
      for (const row of joinRisToMe(mes, ris)) {
        // A weak (tier C) match is title-blind and one draft wide; it is not
        // good enough to hang another ressort's annex on.
        if (row.status !== 'matched' || !row.risId) continue
        meByRisId.set(row.risId, { gp: mes.find((m) => m.inr === row.inr)?.gp ?? 'XXVIII', inr: row.inr })
      }
    }
  }
  return meByRisId.get(risId) ?? null
}

/** The annex HTML Parliament publishes for this draft, or null. */
async function parliamentAnnexHtml(risId: string): Promise<string | null> {
  const me = parliamentMeFor(risId)
  if (!me) return null
  const detail: any = await (await fetch(`https://www.parlament.gv.at/gegenstand/${me.gp}/ME/${me.inr}?json=True`, { headers: UA, signal: AbortSignal.timeout(30_000) })).json()
  const group = asArray<any>(detail?.content?.documents).find((d) => TGU_NAME.test(String(d?.title ?? '').trim()))
  const link = asArray<any>(group?.documents).find((d) => d?.type === 'HTML')?.link
  if (!link) return null
  return await getText(link.startsWith('http') ? link : `https://www.parlament.gv.at${link}`)
}

/** "§ 5" → "5", the id `parseKonsParagraph` gives a paragraph. */
function paraId(label: string): string | null {
  return /(\d+[a-z]*(?:\.\d+)?)/.exec(label)?.[1] ?? null
}

/** RIS prints an Anlage as "Anl. 2"; an instruction says "Anlage 2" (or "Anhang 2"). */
function labelKey(label: string): string {
  return label.replace(/\s+/g, ' ').trim().replace(/^(?:Anlage|Anhang)\b/, 'Anl.')
}

interface LawResult {
  draft: string
  begut: string
  article: string | null
  law: string
  instructions: number
  read: number
  applied: number
  /** §§ the engine produced a text for */
  produced: number
  refusedParas: number
  plausible: number
  /** Unrefused, plausible and confirmed by the draft's own Gegenüberstellung */
  gated: number
  note: string | null
}

const joinNotes = new Map<string, number>()
const annexNotes = new Map<string, number>()
const oracleTally = new Map<string, number>()
const tally = (map: Map<string, number>, key: string): void => {
  map.set(key, (map.get(key) ?? 0) + 1)
}

/**
 * Every law one Ministerialentwurf amends, applied and — where the draft
 * carries a Textgegenüberstellung — held against it.
 */
async function verifyDraft(draft: Draft): Promise<LawResult[]> {
  const blank = (note: string, article: DraftArticle | null = null, isPackage = false): LawResult => ({
    draft: draft.titel,
    begut: draft.id,
    article: isPackage ? (article?.number ?? null) : null,
    law: article?.title ?? draft.titel,
    instructions: 0,
    read: 0,
    applied: 0,
    produced: 0,
    refusedParas: 0,
    plausible: 0,
    gated: 0,
    note,
  })
  if (!draft.mainXml) return [blank('kein XML')]
  const blocks = parseRisXml(await getText(draft.mainXml))
  const parts = articleBlocks(blocks).filter((p) => p.article.amends)
  if (parts.length === 0) return [blank('keine Promulgationsklausel — Stammgesetz oder Verordnung ohne Novellierung')]

  // The annex belongs to *this* draft, so it is read once and shared by the
  // Artikel; `rowsByParagraph` keys its rows by law, which is the only thing
  // that keeps § 5 of Artikel 3 apart from § 5 of Artikel 7.
  let rows: ReturnType<typeof rowsByParagraph> | null = null
  {
    // Parliament first where asked for, RIS as the fallback — the union of
    // the two is strictly larger than either, and the fallback also covers
    // every draft the join fixtures are too old to know.
    const parl = annexSource === 'parlament' ? await parliamentAnnexHtml(draft.id).catch(() => null) : null
    const ris = draft.annexXml ? await getText(draft.annexXml).catch(() => null) : null
    const candidates: { markup: string; from: string }[] = []
    if (parl) candidates.push({ markup: parl, from: 'Parlament' })
    if (ris && !isScanned(ris)) candidates.push({ markup: ris, from: 'RIS' })
    let note = draft.annexNote ?? (ris && isScanned(ris) ? 'Textgegenüberstellung ist ein Scan' : 'ohne Textgegenüberstellung')
    for (const c of candidates) {
      const parsed = parseTextComparison(c.markup, draftArticles(blocks)).rows
      if (parsed.length === 0) {
        note = `Textgegenüberstellung nicht lesbar (${c.from})`
        continue
      }
      rows = rowsByParagraph(parsed)
      note = `Gegenüberstellung gelesen (${c.from})`
      break
    }
    tally(annexNotes, note)
  }

  // Die Passagen des Besonderen Teils, unter demselben Schlüssel wie die
  // Zeilen der Beilage (`explanationKey`): Gesetz des Pakets plus §-Nummer.
  let passages: Map<string, string[]> | null = null
  if (withExplanations && draft.erlXml) {
    const xml = await getText(draft.erlXml).catch(() => null)
    if (xml) {
      passages = new Map()
      for (const p of explanationsByParagraph(parseExplanations(xml), draftArticles(blocks))) {
        const key = explanationKey(p.law, p.para)
        passages.set(key, [...(passages.get(key) ?? []), ...p.text])
      }
    }
  }

  const out: LawResult[] = []
  for (const { blocks: part, article } of parts) {
    out.push(await verifyLaw(draft, part, article, parts.length > 1, rows, passages))
  }
  return out
}

async function verifyLaw(
  draft: Draft,
  blocks: readonly TextBlock[],
  article: DraftArticle,
  isPackage: boolean,
  rows: ReturnType<typeof rowsByParagraph> | null,
  passages: Map<string, string[]> | null,
): Promise<LawResult> {
  const result: LawResult = {
    draft: draft.titel,
    begut: draft.id,
    article: isPackage ? article.number : null,
    law: article.title ?? draft.titel,
    instructions: 0,
    read: 0,
    applied: 0,
    produced: 0,
    refusedParas: 0,
    plausible: 0,
    gated: 0,
    note: null,
  }

  const units = segmentUnits(blocks).filter((u) => u.blocks.some((b) => b.kind === 'novao'))
  const { instructions, refused } = instructionsFromUnits(units)
  result.instructions = instructions.length + refused.length
  result.read = instructions.length
  if (result.instructions === 0) {
    result.note = 'keine Novellierungsanordnungen'
    return result
  }

  // The standing law as of the first day of the consultation. No date
  // arithmetic is possible here and none is needed: unlike an enacted
  // Novelle, a draft has not taken effect, so "the law the drafter was
  // looking at" is simply the version in force when the draft was published.
  const resolved = await resolveLaw(article, draft.beginn)
  if (typeof resolved === 'string') {
    tally(joinNotes, resolved)
    result.note = resolved
    return result
  }
  tally(joinNotes, 'Gesetz gefunden')
  result.law = resolved.kurztitel || result.law

  const wanted = new Set<string>()
  let wholeText = false
  for (const { op } of instructions) {
    const address = 'target' in op ? op.target : 'anchor' in op ? op.anchor : null
    if (!address) continue
    if (address.level === 'document') wholeText = true
    if (address.para) wanted.add(labelKey(address.para))
  }
  const paragraphs: LawNode[] = []
  for (const [label, ref] of Object.entries(resolved.paragraphs)) {
    if (!wholeText && !wanted.has(labelKey(label))) continue
    const tree = await fetchParagraphTree(ref as KonsParagraphRef)
    if (tree) paragraphs.push(tree)
  }
  const law: StandingLaw = { paragraphs }
  const { law: after, results, unresolved } = applyNovelle(law, instructions)
  result.applied = results.filter((r) => r.applied).length

  const refusedIds = new Set([...unresolved].map((p) => /(\d+[a-z]*)/.exec(p)?.[1] ?? p))
  for (const r of refused) {
    const m = /§+\s*(\d+[a-z]*)/.exec(r.line)
    if (m) refusedIds.add(m[1]!)
  }

  if (verbose) {
    console.log(`\n${draft.id}${article.number ? ` ${article.number}` : ''} — ${result.law} (Begutachtung ab ${draft.beginn})`)
    console.log(`  ${result.instructions} Anweisungen, ${result.read} gelesen, ${result.applied} angewendet; ${paragraphs.length} Paragraphen geladen`)
    for (const r of refused) console.log(`    ✗ [Grammatik] ${r.reason} — ${r.line.slice(0, 100)}`)
    for (const r of results) if (!r.applied) console.log(`    ✗ [Anwendung] ${r.reason} — ${r.line.slice(0, 100)}`)
  }

  // Every § an instruction named or created — the set a page would show.
  const touched = new Set<string>()
  for (const { op, payload } of instructions) {
    const address = 'target' in op ? op.target : 'anchor' in op ? op.anchor : null
    if (address?.para) {
      const id = paraId(address.para)
      if (id) touched.add(id)
    }
    if ((op.kind === 'insertAfter' || op.kind === 'append') && op.child === 'para') for (const p of payload) if (p.id) touched.add(p.id)
  }

  // A package whose annex marks no law boundaries cannot be asked about a
  // single Artikel: 15,1 % of § designations recur in another law of the
  // same package (`tguOracle.ts`). Asking without a key would answer from
  // whichever law happened to come first.
  const lawKey = isPackage ? article.key : undefined

  for (const id of [...touched].sort()) {
    const node = after.paragraphs.find((p) => p.id === id)
    if (!node) continue
    result.produced++
    const beforeNode = law.paragraphs.find((p) => p.id === id) ?? null
    const touching = instructions
      .map((instruction, i) => ({ instruction, result: results[i]! }))
      .filter(({ instruction: { op, payload } }) => {
        const address = 'target' in op ? op.target : 'anchor' in op ? op.anchor : null
        if (address?.level === 'document') return true
        if (address?.para && paraId(address.para) === id) return true
        if ((op.kind === 'insertAfter' || op.kind === 'append') && op.child === 'para') return payload.some((p) => p.id === id)
        return false
      })
    const guard = guardParagraph(id, law, beforeNode, node, touching)
    const flags = new Set<GuardFlag>(guard.flags)
    const isRefused = refusedIds.has(id)
    if (isRefused) {
      flags.add('verweigert')
      result.refusedParas++
    }
    const plausible = !isRefused && guard.plausible
    if (plausible) result.plausible++
    const report = rows ? oracleVerdict(id, beforeNode ? plainText(beforeNode) : null, plainText(node), paragraphRows(rows, id, lawKey)) : null
    const verdict: OracleVerdict | 'kein Anhang' = report?.verdict ?? 'kein Anhang'
    tally(oracleTally, `${plausible ? 'plausibel' : 'unplausibel'}|${verdict}`)
    if (plausible && verdict === 'bestätigt') result.gated++
    if (verbose && report && report.verdict !== 'stumm' && report.verdict !== 'bestätigt') {
      console.log(`    ↳ § ${id}: Orakel ${report.verdict}${plausible ? '' : ' (ohnehin unplausibel)'} — ${report.note ?? ''}`)
    }
    if (dumpFile) {
      // Der Besondere Teil führt seinen Paragraphen unter dem Gesetz des
      // Pakets; ein Entwurf mit genau einem benannten Artikel führt ihn
      // ebenfalls dort, und nur ein Entwurf ganz ohne Artikel unter null.
      const erlId = explanationParaId(`§ ${id}`)
      const erl = passages && erlId
        ? passages.get(explanationKey(article.key ?? null, erlId)) ?? passages.get(explanationKey(null, erlId)) ?? []
        : []
      appendFileSync(
        dumpFile,
        `${JSON.stringify({ begut: draft.id, law: result.law, article: article.number, id, refused: isRefused, plausible, flags: [...flags], oracle: verdict, before: beforeNode ? plainText(beforeNode) : null, got: plainText(node), erl })}\n`,
      )
    }
  }
  return result
}

/**
 * The law an amending Artikel names, as it stood when the consultation opened.
 *
 * The Stammnorm is the join, and the Artikel's own heading separates the laws
 * one BGBl created in the same breath. The Kurztitel lookup is the fallback
 * for a law whose Stammnorm is not a Bundesgesetzblatt at all — the ABGB is
 * JGS Nr. 946/1811, the ZPO RGBl. Nr. 113/1895 — and it fails for exactly
 * those laws, because RIS carries them under their abbreviation ("ZPO") while
 * the Artikel says "Änderung der Zivilprozessordnung". Measured and left
 * failing on purpose: a name the lookup cannot confirm must not become a
 * confident wrong law.
 */
async function resolveLaw(article: DraftArticle, date: string): Promise<{ gesetzesnummer: string; kurztitel: string; paragraphs: Record<string, KonsParagraphRef> } | string> {
  if (article.bgbl) {
    const law = await resolveLawByBgbl(article.bgbl, date, article.title)
    if (law) return law
  }
  // "Änderung des Glücksspielgesetzes" → "Glücksspielgesetz": the heading is
  // a sentence about the Artikel, the lookup wants the law's own name.
  const name = article.title?.replace(/^Änderungen?\s+(?:des|der|der\s+)?\s*/i, '').replace(/(?<=.{5})(?:es|s)$/, '').trim()
  if (name) {
    const gesetzesnummer = await resolveGesetzesnummer(name)
    if (gesetzesnummer) {
      const law = await fetchLawAsOf(gesetzesnummer, date)
      const paragraphs: Record<string, KonsParagraphRef> = {}
      for (const p of law.paragraphs) paragraphs[p.label] ??= p
      if (Object.keys(paragraphs).length > 0) return { gesetzesnummer, kurztitel: law.kurztitel || name, paragraphs }
    }
  }
  return article.bgbl ? 'Stammnorm zitiert, im BrKons nicht auflösbar' : 'Promulgationsklausel ohne BGBl-Stammnorm'
}

// --- CLI ----------------------------------------------------------------------
const discoverArg = process.argv.find((a) => a.startsWith('--discover='))
// Split each argv entry before matching: run through `npx vite-node … -- a b c`
// the trailing arguments arrive as *one* space-joined string, so a plain
// filter found the ids when there was one and none when there were forty
// (18.09.2026). The whole argv rather than `slice(2)`, for the same reason
// the flags above are read that way — vite-node does not pass the script path.
const ids = process.argv.flatMap((a) => a.split(/\s+/)).filter((a) => /^BEGUT_[0-9A-F_]+$/i.test(a))
const drafts: Draft[] = discoverArg
  ? await discover(Number(discoverArg.split('=')[1] ?? 20))
  : (await Promise.all(ids.map(fetchDraft))).filter((d): d is Draft => d !== null)

if (drafts.length === 0) {
  console.error('Usage: npx vite-node scripts/me-harness.ts --discover=N [--cache] | <BEGUT-ID> …')
  process.exit(1)
}

const results: LawResult[] = []
for (const draft of drafts) {
  try {
    results.push(...(await verifyDraft(draft)))
  } catch (err) {
    console.log(`\n${draft.id}: ${String(err)}`)
  }
}

const scored = results.filter((r) => r.note === null)
const sum = (pick: (r: LawResult) => number) => scored.reduce((n, r) => n + pick(r), 0)
const pct = (n: number, of: number) => (of === 0 ? '—' : `${((n / of) * 100).toFixed(1)} %`)
const dates = drafts.map((d) => d.beginn).sort()
console.log(`\n${'='.repeat(78)}`)
console.log(`ME-Prüfstand über ${drafts.length} Entwürfe (${dates[0]} bis ${dates[dates.length - 1]}), ${results.length} geänderte Gesetze, ${scored.length} davon auflösbar`)
console.log(`  Anweisungen            : ${results.reduce((n, r) => n + r.instructions, 0)} (in den auflösbaren: ${sum((r) => r.instructions)})`)
console.log(`  grammatikalisch gelesen: ${sum((r) => r.read)} (${pct(sum((r) => r.read), sum((r) => r.instructions))})`)
console.log(`  angewendet             : ${sum((r) => r.applied)} (${pct(sum((r) => r.applied), sum((r) => r.instructions))})`)
console.log(`  Paragraphen mit Text   : ${sum((r) => r.produced)}`)
console.log(`    ohne Verweigerung und plausibel: ${sum((r) => r.plausible)} (${pct(sum((r) => r.plausible), sum((r) => r.produced))})`)
console.log(`    davon vom Anhang bestätigt     : ${sum((r) => r.gated)} (${pct(sum((r) => r.gated), sum((r) => r.produced))})  — das, was heute anzeigbar wäre`)
{
  const notes = new Map<string, number>()
  for (const r of results) if (r.note) notes.set(r.note, (notes.get(r.note) ?? 0) + 1)
  if (notes.size > 0) {
    console.log(`\n  Nicht ausgewertet (${results.length - scored.length} von ${results.length} Gesetzen):`)
    for (const [note, n] of [...notes].sort((a, b) => b[1] - a[1])) console.log(`    ${String(n).padStart(4)}× ${note}`)
  }
}
console.log(`\n  Join „welches Gesetz ändert dieser Artikel?" (nur Artikel mit Anweisungen):`)
for (const [note, n] of [...joinNotes].sort((a, b) => b[1] - a[1])) console.log(`    ${String(n).padStart(4)}× ${note}`)
console.log(`\n  Textgegenüberstellung je Entwurf (${drafts.length}):`)
for (const [note, n] of [...annexNotes].sort((a, b) => b[1] - a[1])) console.log(`    ${String(n).padStart(4)}× ${note}`)
console.log(`\n  Paragraphen: Plausibilität × Orakel:`)
for (const [key, n] of [...oracleTally].sort((a, b) => b[1] - a[1])) console.log(`    ${String(n).padStart(4)}× ${key.replace('|', ', Orakel ')}`)

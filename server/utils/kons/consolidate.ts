/**
 * The engine run behind the page's Lesefassung: a draft's blocks and the day
 * the law is read at in, one outcome for every § the draft amends out.
 *
 * NO NITRO IN HERE — explicit imports only. The page reaches this through
 * `kons/konsService.ts`, which adds the caches and hands in the sources; the
 * corpus Prüfstand (`scripts/harness/accounting.ts`) and the tests hand in
 * sources of their own (`KonsSources`). That is the reason for the cut
 * (26.10.2026): what is measured is the function the page runs, not a
 * harness's copy of its glue. Every Prüfstand before kept a copy, and a copy
 * drifts — the ME-Prüfstand keyed schedules differently from the page for a
 * month (`touchedKey`).
 *
 * EVERY § IT COUNTS, IT ACCOUNTS FOR. `touched` has always counted every §
 * the draft amends, and `paragraphs` carried the ones the gate let through;
 * the rest ended in a bare `continue` at eight different places — the law
 * RIS did not know, the ceiling, the § RIS holds as a table, the refusal,
 * the annex's silence — and the page could not tell one from another, or
 * any of them from „not looked at". Now each of them is a `withheld` entry
 * with its cause, and `paragraphs` + `withheld` = `touched` is a property
 * the Prüfstand holds every draft to (`consolidationBalance`).
 */
import type {
  ConsolidatedLaterAmendment,
  ConsolidatedNotRun,
  ConsolidatedParagraph,
  ConsolidatedTextResponse,
  ConsolidatedWithheld,
  ConsolidatedWithheldCause,
  LawDiffSegment,
} from '../../../shared/types'
import type { DraftIdentity } from '../ris/draftIdentity'
import { guardParagraph } from './applyGuard'
import { addressedLabels, addressedParagraphs, byParagraphOrder, gateParagraph, inPrintedOrder, refusedUnits, unitsByKey } from './konsGate'
import { anlageLabelKey, bareParaId, isSchedule, kapitelLabelWithoutPoint, unitKey } from '../text/designation'
import { konsLawUrl, type KonsLawAtDate, type KonsParagraphRef } from '../ris/konsLaw'
import { diffTokens } from '../diff/wordDiff'
import { applyNovelle, instructionsFromUnits, renamedOrigins, type Instruction, type RefusedInstruction, type StandingLaw } from './lawApply'
import { bodyText, parseKonsParagraph, plainText, type LawNode } from '../lawtext/konsTree'
import { segmentUnits, type TextBlock } from '../lawtext/lawUnits'
import { articleBlocks, draftArticles, type ClauseName, type DraftArticle } from '../lawtext/draftArticles'
import { addressesWholeText, createdParagraphs, createdUnits, opAddress } from './novao'
import { mapWithConcurrency } from '../pool'
import type { ComparisonRow } from '../annex/comparisonRows'
import { absatzSequence, standingUnitsOf, annexChangedUnits, oracleVerdict, paragraphRows, rowsByParagraph, someDrawers } from './tguOracle'
import { witnessVerdict, type DraftRendition } from './draftWitness'

/**
 * A ceiling, not a budget: the value the neighbour that reads the same
 * documents already uses — `MAX_PARAGRAPHS` in `annex/verdict.ts`, whose
 * annex check fetches the very § documents this module does, out of the same
 * cache (`fetchParagraphXml`). Until 06.10.2026 it stood at 80 and cut off
 * the eleven largest drafts of GP XXVIII: 815 of 3.914 changed §§ were never
 * looked at, for no reason but the ceiling. What raising it costs is CPU on
 * the first request of the day, not RIS calls — the Gegenüberstellung above
 * has fetched those documents already — and this section is fetched lazily,
 * so the page never waits for it. Exported under a name of its own, for the
 * Prüfstand: two auto-imports of one name resolve to one of them silently.
 *
 * **No ceiling on laws** (19.11.2026). A second one, 40 laws, stood here
 * beside it, said to mirror `lawtext/amendedLawsService.ts` — which bounds
 * the cold lookups of the law list, not a fetch of § documents. It withheld
 * 139 of the 289 §§ of 116/ME XXVIII, Artikel 42 onward, under the page's
 * sentence for this ceiling („mehr Paragraphen, als wir für eine Seite
 * laden"), which was false: 289 §§ fit the budget. The annex check reads the
 * same laws with no law ceiling; the 25 more law lookups are cached RIS
 * calls it has made already. 49 of the 139 now pass the gate, the other 90
 * carry the engine's or the gate's own cause. `nicht-geladen` is this budget
 * alone, and the Prüfstand holds it to that (`obergrenze`).
 */
export const KONS_MAX_PARAGRAPHS = 500
const CONCURRENCY = 4

/**
 * Where the page's Lesefassung gets what it reads — the two RIS lookups and
 * the ressort's annex. The page passes the cached functions
 * (`kons/konsCache.ts`, `annex/annexSource.ts`), the Prüfstand its disk
 * cache.
 *
 * **A failure throws, an answer returns** — for all three, the rule
 * `kons/konsCache.ts` states for `resolveKonsLaw`. A RIS that does not answer
 * is no statement about a law or a §, and an error caught into null here
 * would be an outage reported as a cause on the page.
 */
export interface KonsSources {
  /**
   * The law a Stammnorm names on a date — null where RIS knows none or cannot
   * tell two apart. Asked with an empty `organ` and `nummer` where the clause
   * cites no Stammnorm we can read: then the law is the one the clause names
   * (`resolveLawByName` in `ris/konsLaw.ts`).
   */
  resolveLaw(organ: string, nummer: string, date: string, title: string, clause: ClauseName | null): Promise<KonsLawAtDate | null>
  /** One § document's XML (called only for a ref that carries an XML URL). */
  paragraphXml(ref: KonsParagraphRef): Promise<string>
  /**
   * The annex's rows, read through the same source choice as the section
   * above it — null where the draft carries no readable annex. The section's
   * own answer is useless here: it carries the rows whose check failed with
   * their text emptied.
   */
  annexRows(articles: readonly DraftArticle[]): Promise<readonly ComparisonRow[] | null>
  /**
   * The draft's second rendition, its PDF (`kons/draftRendition.ts`) — asked
   * only once a § is about to be withheld for a contradiction, and at most
   * once a run. Null, or not handed in, and no § is shown on it
   * (`kons/draftWitness.ts`).
   */
  draftRendition?(): Promise<DraftRendition | null>
}

/**
 * Nothing to show and nothing to account for: the draft's §§ could not even
 * be read — and why, because an empty Lesefassung without a reason reads as
 * a draft that changes nothing (`notRun`).
 */
export function emptyConsolidated(who: DraftIdentity, notRun: ConsolidatedNotRun): ConsolidatedTextResponse {
  return { ...who, paragraphs: [], withheld: [], touched: 0, notRun }
}

/**
 * How much of the budget this Artikel gets — computed purely and called in
 * input order, so the allotment stays the same even where the Artikel are
 * fetched side by side. Which §§ the limit cuts off is a statement on the
 * page and must not depend on who finishes first.
 *
 * Keyed by the label RIS prints, as `wanted` asks for it (`anlageLabelKey`):
 * the ref's bare id said „1" for „Anlage 1" and never met the § it stood for.
 */
function allotBudget(refs: readonly KonsParagraphRef[], budget: { left: number }): { queue: KonsParagraphRef[]; skipped: Set<string> } {
  const queue = refs.slice(0, Math.max(0, budget.left))
  budget.left -= queue.length
  return { queue, skipped: new Set(refs.slice(queue.length).map((r) => anlageLabelKey(r.label))) }
}

/**
 * The § documents this Artikel addresses, as trees — in the order of
 * `queue`, which the caller puts into the order the law prints them
 * (`inPrintedOrder`).
 *
 * **The fetch stands outside the try, the parse inside it**, exactly as in
 * `annex/annexGuardService.ts` and for the same reason: a RIS that does not
 * answer is no statement about this §, so the error has to leave and nothing
 * may be cached. A document we *do* get and cannot read is the opposite: a
 * stable property of that document (RIS carries some §§ as a table), and null
 * is the right answer for it.
 */
async function standingParagraphs(queue: readonly KonsParagraphRef[], sources: KonsSources, joined: ReadonlyMap<string, string> = new Map()): Promise<LawNode[]> {
  // Built from the result, which keeps the input order. Until 22.10.2026 the
  // callback pushed each tree as its fetch finished, and the stock came out
  // in the order of completion.
  const trees = await mapWithConcurrency(queue, CONCURRENCY, async (ref) => {
    if (!ref.xmlUrl) return null
    const xml = await sources.paragraphXml(ref)
    try {
      const tree = parseKonsParagraph(xml)
      // Found under a Kapitel label without its point (`kapitelLabelWithoutPoint`):
      // taken only where the document's own Gliederungssymbol, which the tree
      // keeps as its marker, reads the number with the point — and then under it.
      const id = joined.get(anlageLabelKey(ref.label))
      if (tree && id !== undefined) return bareParaId(tree.marker) === id ? { ...tree, id } : null
      return tree
    } catch {
      // A document that is no § — 27 of 3.110 in the BGBl corpus.
      return null
    }
  })
  return trees.filter((tree): tree is LawNode => tree !== null)
}

/** The annex rows an Artikel is checked against, and the law they are asked under (`paragraphRows`). */
interface AnnexOf {
  rows: ReadonlyMap<string, ComparisonRow[]>
  /** The Artikel's key; `undefined` asks by the bare number. */
  law: string | null | undefined
}

/** One Artikel of the draft, read purely: what it instructs and which §§ it addresses. */
interface ArticleWork {
  article: DraftArticle
  instructions: Instruction[]
  refused: RefusedInstruction[]
  addressed: string[]
  /** The RIS label of every addressed § but the doubled ones (`addressedLabels`). */
  labels: Map<string, string>
  /** Numbers the Artikel names under two labels: withheld as `nummer-doppelt`, nothing fetched for them. */
  doubled: ReadonlySet<string>
  /** §§ a refused line on the whole text reaches, by the annex (`wholeTextParagraphs`). */
  locked: Set<string>
}

/**
 * „Im gesamten Gesetzestext wird jeweils … ersetzt" names no §, and so the
 * denominator counted none of the §§ it changes: the annex showed them
 * changing, nothing on our side accounted for them, and the page said
 * „Anweisung nicht gefunden" at each — 40 §§ of 145/ME XXVIII (26.10.2026).
 *
 * The annex is the one document that lists them, so they join from there:
 * every § it shows changing in this Artikel's law that no instruction names.
 * They are fetched and run like any other § — the instruction reaches them
 * through `touching` (`document`) and the gate decides — and where the line on
 * the whole text was refused, they are locked as every § a refused line
 * names (`locked`). Without an annex they stay uncounted, and there is no
 * block to say anything at either.
 *
 * Not for a law divided into Artikel: which Artikel an annex row means is not
 * in the row, and its RIS label needs it (`addressedLabels`).
 */
function wholeTextParagraphs(w: ArticleWork, annex: AnnexOf): void {
  const read = w.instructions.some(({ op }) => opAddress(op)?.level === 'document')
  const refused = w.refused.some((r) => addressesWholeText(r.line))
  if (!read && !refused) return
  const labels = w.labels
  if (w.doubled.size > 0 || [...labels.values()].some((label) => /^Art\./.test(label))) return
  const added = annexChangedUnits(annex.rows, annex.law, w.article.key).filter((id) => !w.addressed.includes(id))
  if (added.length === 0) return
  for (const id of added) labels.set(id, isSchedule(id) ? id : `§ ${id}`)
  w.addressed = [...w.addressed, ...added].sort(byParagraphOrder)
  if (refused) for (const id of added) w.locked.add(id)
}

/**
 * A law the draft enacts anew instead of amending it — the „Anti-Doping-
 * Bundesgesetz 2027" of 144/ME XXVIII beside one Novelle — has no
 * instructions, and where the annex sets it against the law it replaces,
 * every § of it stood there as „Anweisung nicht gefunden" (39 §§ in 144/ME,
 * 57/ME and 147/ME XXVIII, 26.10.2026). There is nothing to consolidate: the
 * draft prints the whole new text itself. Each § the annex shows changing
 * gets that as its cause (`neu-erlassen`), under the law the annex files it
 * under, and is counted like every other § the page says something about.
 *
 * A draft that enacts one law and amends none never gets here: it does not
 * run at all (`keine-novelle`), and the page says so once.
 */
function enactedParagraphs(blocks: readonly TextBlock[], byParagraph: ReadonlyMap<string, ComparisonRow[]>): ConsolidatedWithheld[] {
  const out: ConsolidatedWithheld[] = []
  for (const { article } of articleBlocks(blocks)) {
    if (article.amends || article.number === null || article.key === null) continue
    for (const id of annexChangedUnits(byParagraph, article.key)) out.push({ id, annexLaw: article.key, cause: 'neu-erlassen' })
  }
  return out
}

/**
 * Draft blocks + the day the law is read at → every § the draft amends,
 * shown or withheld with its cause.
 *
 * Everything from here down is common to both halves of the corpus; the
 * caller has already decided who the draft is and where its annex comes
 * from.
 */
export async function consolidate(
  who: DraftIdentity,
  blocks: readonly TextBlock[],
  asOf: string,
  sources: KonsSources,
): Promise<ConsolidatedTextResponse> {
  const parts = articleBlocks(blocks).filter((p) => p.article.amends)
  // A draft that creates a law instead of amending one has no version „davor".
  if (parts.length === 0) return emptyConsolidated(who, 'keine-novelle')

  const isPackage = parts.length > 1
  /** The laws the annex files rows under, once it is read (`annexOf`). */
  let filedLaws: ReadonlySet<string> = new Set()
  /**
   * The key the annex is asked with, and the page looks the § up under: the
   * Artikel's in a package, and in a single Novelle where the annex files
   * rows under it — the condition `annexOf` asks by (19.11.2026). Null
   * there, the page could not tell which of the annex's groups the
   * Novelle's §§ belong to: 144/ME XXVIII enacts a law beside its one
   * Novelle, and the BSFG §§ the annex printed without designations were
   * listed under „Gesetzestext" after the new law's group, not under the
   * BSFG's own.
   */
  const annexLawOf = (w: ArticleWork): string | null => (isPackage || (w.article.key !== null && filedLaws.has(w.article.key)) ? w.article.key : null)

  // ALL Artikel are counted, those the budget cuts off included: the
  // denominator on the page is „wie viele Paragraphen ändert dieser
  // Entwurf", not "how many did we look at".
  //
  // THREE STEPS, and their order is the reason for the cut: first read
  // purely what each Artikel addresses, then allot the budget in INPUT
  // ORDER, and only last fetch side by side. Which §§ the limit cuts off is
  // a statement on the page; it must not depend on which Artikel finishes
  // first.
  const works = parts.flatMap(({ blocks: part, article }): ArticleWork[] => {
    const units = segmentUnits(part).filter((u) => u.blocks.some((b) => b.kind === 'novao'))
    const { instructions, refused } = instructionsFromUnits(units)
    if (instructions.length + refused.length === 0) return []
    // The denominator, counted before anything can fail — pure and tested
    // in `kons/konsGate.ts`, because a number that stands on the page is a
    // statement and not an intermediate result. The refusals go in whole,
    // with the container a refused sub-instruction stands under.
    // The RIS labels beside the denominator, and from the same pure step:
    // a law divided into Artikel files its § 3 as „Art. 2 § 3", and a
    // number addressed under two labels has none (`doubled`).
    const { labels, doubled } = addressedLabels(instructions, refused)
    return [{ article, instructions, refused, addressed: addressedParagraphs(instructions, refused), labels, doubled, locked: new Set<string>() }]
  })
  /**
   * The §§ of a law the draft enacts anew that the annex shows changing
   * (`enactedParagraphs`) — counted and accounted for like the rest.
   */
  const enacted: ConsolidatedWithheld[] = []

  /** Per Artikel, in input order — flattened at the end, so the order never depends on who finished first. */
  const shownBy = new Map<ArticleWork, ConsolidatedParagraph[]>()
  const withheldBy = new Map<ArticleWork, ConsolidatedWithheld[]>()
  const withhold = (w: ArticleWork, ids: Iterable<string>, cause: ConsolidatedWithheldCause): void => {
    const list = withheldBy.get(w) ?? []
    for (const id of ids) list.push({ id, annexLaw: annexLawOf(w), cause })
    withheldBy.set(w, list)
  }
  const result = (): ConsolidatedTextResponse => ({
    ...who,
    // An empty list is not an error but the normal case: in half of the
    // drafts the annex confirms not a single paragraph.
    paragraphs: works.flatMap((w) => shownBy.get(w) ?? []),
    withheld: [...works.flatMap((w) => withheldBy.get(w) ?? []), ...enacted],
    // Summed at the end: an instruction on the whole text adds the §§ the
    // annex shows to its Artikel once the annex is read (`wholeTextParagraphs`).
    touched: works.reduce((n, w) => n + w.addressed.length, 0) + enacted.length,
    notRun: null,
  })
  if (works.length === 0) return result()

  // The same source as the section above, out of the same function: RIS
  // first, Parliament as the fallback (`annex/textComparisonService.ts`).
  // Read a second time, because the Gegenüberstellung's answer carries the
  // checked rows with their **text emptied** — right for the display, fatal
  // for an oracle that would read empty text as „sagt nichts dazu".
  //
  // With EVERY Artikel of the draft, as the section reads it — not the
  // amending ones only. The annex files its rows under the Artikel it can
  // match its headings to, and handed the amending ones alone, the rows of a
  // law the draft enacts anew had no Artikel of their own and fell under
  // their neighbour's (or under none): the gate held the Novelle's § 3
  // against the new law's § 3, and the page, which reads the annex with all
  // of them, found the outcomes under another key than its blocks
  // (144/ME XXVIII, 26.10.2026).
  const rows = await sources.annexRows(draftArticles(blocks))
  const byParagraph = rows ? rowsByParagraph(rows) : null
  /** The second rendition, read once and only where a § needs it (`KonsSources.draftRendition`). */
  let rendition: Promise<DraftRendition | null> | null = null
  const draftRendition = (): Promise<DraftRendition | null> => (rendition ??= sources.draftRendition?.() ?? Promise.resolve(null))

  // Without an annex nothing confirms anything, and then every RIS call is
  // wasted: half the drafts have none, and for those this function fetched
  // dozens of § documents only to show nothing afterwards. The §§ are still
  // accounted for — that costs no call, they are in the draft's own text.
  if (!byParagraph) {
    for (const w of works) withhold(w, w.addressed, 'kein-anhang')
    return result()
  }
  // An annex with no § in it says nothing about any § — the same outcome
  // the oracle would reach for each of them, without the calls.
  if (byParagraph.size === 0) {
    for (const w of works) withhold(w, w.addressed, 'anhang-schweigt')
    return result()
  }
  // A package whose annex marks no law boundaries: every row is filed under
  // no law, and the gate asks by law (`paragraphRows`), because 15,1 % of the
  // designations in a package recur in another of its laws. So nothing of
  // such a package can be confirmed — said as what it is, not as the annex
  // being silent about each § (`boundaryNote` says the same above the rows).
  const undivided = isPackage && [...byParagraph.keys()].every((key) => key.startsWith('#'))
  // Where an Artikel's rows are looked up (`AnnexOf`): under its own key in a
  // package, and also in a single Novelle where the annex files rows under
  // that key — it does where the draft enacts a law beside it. Otherwise by
  // the bare number, as ever, but never in the rows the annex files under
  // ANOTHER Artikel of the draft: the one Novelle of 144/ME XXVIII has no
  // rows of its own, and its § 1 and § 26 were held against the § 1 and
  // § 26 of the law the draft enacts anew (`anhang-fremd`, 26.10.2026).
  filedLaws = new Set([...byParagraph.keys()].map((key) => key.slice(0, key.lastIndexOf('#'))))
  const articleKeys = new Set(draftArticles(blocks).flatMap((a) => (a.key === null ? [] : [a.key])))
  const annexes = new Map<DraftArticle, AnnexOf>()
  const annexOf = (article: DraftArticle): AnnexOf => {
    let found = annexes.get(article)
    if (found) return found
    if (isPackage || (article.key !== null && filedLaws.has(article.key))) found = { rows: byParagraph, law: article.key }
    else {
      const foreign = (key: string): boolean => {
        const law = key.slice(0, key.lastIndexOf('#'))
        return law !== '' && law !== article.key && articleKeys.has(law)
      }
      found = { rows: [...byParagraph.keys()].some(foreign) ? someDrawers(byParagraph, (key) => !foreign(key)) : byParagraph, law: undefined }
    }
    annexes.set(article, found)
    return found
  }

  // What the draft changes without naming it § by § — only the annex lists
  // those §§, so they join here and not in the pure count above.
  if (!undivided) {
    for (const w of works) wholeTextParagraphs(w, annexOf(w.article))
    enacted.push(...enactedParagraphs(blocks, byParagraph))
  }

  const workable: ArticleWork[] = []
  for (const w of works) {
    if (undivided && w.article.key !== null) withhold(w, w.addressed, 'anhang-ungeteilt')
    else workable.push(w)
  }

  const resolved = await mapWithConcurrency(workable, CONCURRENCY, async (w) => {
    const { article } = w
    // NO `.catch` here. `resolveLaw` returns null where RIS does not know the
    // law or cannot tell two apart — an answer that holds for a day — and it
    // *throws* where RIS is unreachable. An error caught into null would be
    // an outage cached as a verdict about the draft; that is exactly what
    // `annex/annexGuardService.ts` cost once already.
    // A clause that names its law and cites no Stammnorm we can read
    // („zuletzt geändert durch … BGBl. I Nr. 21/2026" alone, „BGBl I
    // 2013/105", „29/200") is looked up by that name (20.11.2026).
    const law = article.bgbl
      ? await sources.resolveLaw(article.bgbl.organ, article.bgbl.nummer, asOf, article.title ?? '', article.clause)
      : article.clause ? await sources.resolveLaw('', '', asOf, article.title ?? '', article.clause) : null
    if (!law) return { kind: 'failed' as const, w, cause: 'gesetz-unbekannt' as const }
    // Two §§ of this Artikel share a number under different Artikel of the
    // standing law. The stock is held by bare id, so one of them would
    // answer for the other: that number is fetched for neither and withheld
    // (`doubled`), the rest of the Artikel runs.
    const labels = w.labels
    const fetched = w.addressed.filter((id) => !w.doubled.has(id))

    // Where the budget bites, it should bite the §§ that could show
    // nothing anyway.
    //
    // The gate shows nothing without a second opinion: where the Beilage is
    // silent about a §, its outcome is settled before any document is
    // fetched. So those are fetched last — **but they are fetched**.
    // Leaving them out entirely was the first attempt (19.09.2026) and
    // backfired: `applyNovelle` applies the instructions to the WHOLE
    // loaded stock, and an instruction whose anchor § is missing fails. On
    // 100/ME „Anweisung ließ sich nicht sicher anwenden" rose from 8 to 11
    // that way and the display lost two §§. The order changes nothing about
    // the stock as long as the budget suffices — the engine gets it back in
    // printed order (`inPrintedOrder`); only when the budget does not
    // suffice does this order decide what is missing.
    const covered = (id: string): boolean =>
      paragraphRows(annexOf(article).rows, id, annexOf(article).law).length > 0
    // Asked for under the label RIS prints, not under the bare designation:
    // in a law divided into Artikel there is no document called „§ 3", and
    // a lookup without the Artikel comes back empty rather than wide.
    const labelOf = new Map(fetched.map((id) => [id, anlageLabelKey(labels.get(id) ?? `§ ${id}`)]))
    // „Anl." without a number is an instruction saying „the schedule",
    // which only a law with exactly one can mean („Z 1 lit. n des
    // Anhangs"). Here the law's labels are known, so this is the place that
    // answers it — and it answers nothing where the law has several.
    const schedules = Object.keys(law.paragraphs).filter((label) => isSchedule(label))
    if (labelOf.get('Anl.') === 'Anl.' && schedules.length === 1) labelOf.set('Anl.', anlageLabelKey(schedules[0]!))
    // A Verordnung numbered by Kapitel is filed without the point („§ 601a"
    // for § 6.01a, 707EA278): asked for under its own label, none of its §§
    // had a standing text, and every instruction on them was refused.
    const inRis = new Set(Object.keys(law.paragraphs).map(anlageLabelKey))
    const joined = new Map<string, string>()
    for (const [id, label] of labelOf) {
      const dotless = inRis.has(label) ? null : kapitelLabelWithoutPoint(label)
      if (dotless === null || !inRis.has(dotless) || [...labelOf.values()].includes(dotless)) continue
      labelOf.set(id, dotless)
      joined.set(dotless, id)
    }
    // A law RIS files by Artikel answers a bare „§ 99" under „Art. 1 § 99"
    // (Finanzstrafgesetz, Datenschutzgesetz, Arbeitslosenversicherungsgesetz
    // 1977), and the drafts cite it without the Artikel. Joined only where
    // exactly one Artikel of the law holds that number (`artikelLabelOf`).
    for (const [id, label] of labelOf) {
      const artikel = inRis.has(label) ? null : artikelLabelOf(label, inRis)
      if (artikel === null || [...labelOf.values()].includes(artikel)) continue
      labelOf.set(id, artikel)
    }
    const wanted = new Map(fetched.map((id) => [labelOf.get(id)!, covered(id)]))
    const refs = Object.entries(law.paragraphs)
      .filter(([label]) => wanted.has(anlageLabelKey(label)))
      .sort(([a], [b]) => Number(wanted.get(anlageLabelKey(b))) - Number(wanted.get(anlageLabelKey(a))))
      .map(([, ref]) => ref)
    return { kind: 'resolved' as const, w, law, refs, labelOf, inRis, joined }
  })

  // The allotment, pure and in order — before the fetching, not inside it.
  const budget = { left: KONS_MAX_PARAGRAPHS }
  const jobs = resolved.flatMap((r) => {
    if (r.kind === 'failed') {
      withhold(r.w, r.w.addressed, r.cause)
      return []
    }
    return [{ ...r, ...allotBudget(r.refs, budget) }]
  })

  // TWO ARTIKEL AMENDING ONE LAW ARE ONE CHAIN (26.10.2026). „Änderung des
  // Staatsanwaltschaftsgesetzes" and „… (Teil II)" in 126/ME: the second
  // amends the law as the first leaves it — usually with a later
  // Inkrafttreten — and each was applied to the untouched RIS text. The
  // Teil-II § 42 lacked the (26) Teil I inserts, and the oracle, reading
  // text without markers, confirmed it. So the Artikel of one law run in
  // their printed order, each starting from what the one before produced;
  // different laws still run side by side. 2 of the GP-XXVIII drafts.
  const chains = new Map<string, typeof jobs>()
  for (const job of jobs) chains.set(job.law.gesetzesnummer, [...(chains.get(job.law.gesetzesnummer) ?? []), job])

  await mapWithConcurrency([...chains.values()], CONCURRENCY, async (chain) => {
    /** What the Artikel before left of each unit, under the key the stock is held by (`unitsByKey`). */
    const carried = new Map<string, LawNode>()
    /**
     * The units an Artikel before refused or locked (20.11.2026): what it left
     * of them lacks a change the draft makes, so no later Artikel composes
     * them either. Until then each Artikel locked only its own, and a Teil II
     * built on a § whose Teil I instruction was refused could be shown.
     */
    const refusedBefore = new Set<string>()
    for (const job of chain) {
      const { w, law, queue, skipped, labelOf, inRis, joined } = job
      const { instructions, refused, addressed } = w
      // The budget chose WHICH §§ (the covered ones first); the engine reads
      // them in the order the law prints them, or a range replacement fails
      // on a stock whose §§ came back out of turn (`inPrintedOrder`).
      const loaded = await standingParagraphs(inPrintedOrder(queue, Object.keys(law.paragraphs)), sources, joined)
      // A unit the Artikel before changed is read as it left it, and one it
      // created — in no RIS document yet — joins the stock where this Artikel
      // addresses it.
      const stock = loaded.map((tree) => carried.get(stockKey(tree)) ?? tree)
      const present = new Set(stock.map(stockKey))
      for (const id of addressed) {
        const earlier = carried.get(id)
        if (earlier && !present.has(id)) stock.push(earlier)
      }
      const standing: StandingLaw = { paragraphs: stock }
      const { law: after, results, unresolved, renamed, touches } = applyNovelle(standing, instructions)
      // Which standing § each § of the result came from: where the draft
      // renumbers, the result's § 9f is the old § 7a, and its § 7a a new
      // provision in the vacated number (118/ME XXVIII). Paired by id alone,
      // the new § 7a was held against the old one's text, and failed.
      const originOf = renamedOrigins(renamed)
      for (const [key, node] of unitsByKey(after.paragraphs)) carried.set(key, node)

      const refusedIds = refusedUnits(unresolved, refused, unitKey)
      for (const id of w.locked) refusedIds.add(id)
      for (const id of refusedBefore) refusedIds.add(id)
      for (const id of refusedIds) refusedBefore.add(id)

      // Read once instead of once per §: the designation every instruction
      // addresses, and the §§ its payload inserts (80 §§ × 500 instructions).
      const analysed = instructions.map((instruction, i) => {
        const { op, payload, line } = instruction
        const address = opAddress(op)
        return {
          touching: { instruction, result: results[i]! },
          document: address?.level === 'document',
          // The §§ it brings into being, as the denominator counts them
          // (`createdParagraphs`, `createdUnits`): an insertion's payload, a
          // replacement run's, a renumbering's new numbers.
          created: new Set([...createdParagraphs(op, payload, line), ...createdUnits(line)].map((p) => unitKey(p)).filter((id): id is string => !!id)),
        }
      })
      // Held under the unit key, not the bare number (`unitsByKey`).
      const afterById = unitsByKey(after.paragraphs)
      const beforeById = unitsByKey(standing.paragraphs)

      const found: ConsolidatedParagraph[] = []
      const held: ConsolidatedWithheld[] = []
      // A § whose standing text is not RIS's answer for the day
      // (`standingOnDay`): said at it, shown or withheld, wherever that text
      // was read — not for a § never fetched (`nicht-geladen`, `nummer-doppelt`).
      const later = laterAmendments(law, asOf)
      const laterOf = (id: string): { laterAmendment?: ConsolidatedLaterAmendment } => {
        const hit = later.get(labelOf.get(id) ?? '')
        return hit ? { laterAmendment: hit } : {}
      }
      const hold = (id: string, cause: ConsolidatedWithheldCause): void => {
        held.push({ id, annexLaw: annexLawOf(w), cause, ...(cause === 'nicht-geladen' || cause === 'nummer-doppelt' ? {} : laterOf(id)) })
      }
      for (const id of addressed) {
        if (w.doubled.has(id)) {
          hold(id, 'nummer-doppelt')
          continue
        }
        // Our own ceiling first: a document we never fetched is not a refusal
        // of the engine.
        if (skipped.has(labelOf.get(id)!)) {
          hold(id, 'nicht-geladen')
          continue
        }
        const node = afterById.get(id)
        // No text produced. The engine's own word first, as the gate orders
        // its causes: an instruction on the § failed. Then a § that stood in
        // the stock and is gone — the draft repeals it or moves it to another
        // number, and nothing stands under this one any more. Otherwise RIS
        // either carries the § in a form we cannot read (a table, no XML), or
        // not at all — and the draft does not create it.
        // A § an instruction brings into being and the run did not: that
        // instruction was not carried out as written, whatever it reported —
        // not a § RIS lacks (`nicht-im-ris`), which is what the draft does
        // NOT create.
        //
        // A repeal is held against the annex like any result (19.11.2026):
        // where the Beilage shows the unit still standing (`annexKeepsUnit`),
        // our result is the one that differs, and the page says so. Until
        // then a vanished unit was `entfaellt` on the engine's word alone,
        // and the page, which prints no line at a repeal, stood silent beside
        // the annex rows of an Anlage the engine had dropped whole for
        // „entfallen die Zeilen betreffend …" (8CA8E8B1, C3F4E0AD).
        if (!node) {
          const created = analysed.some((a) => a.created.has(id))
          const annex = annexOf(w.article)
          const gone = (): ConsolidatedWithheldCause => (annexKeepsUnit(paragraphRows(annex.rows, id, annex.law)) ? 'anhang-widerspricht' : 'entfaellt')
          hold(id, refusedIds.has(id) || created ? 'verweigert' : beforeById.has(id) ? gone() : inRis.has(labelOf.get(id)!) ? 'nicht-lesbar' : 'nicht-im-ris')
          continue
        }
        const origin = originOf(id)
        const beforeNode = origin === null ? null : (beforeById.get(origin) ?? null)
        // What acted on THIS § (`ApplyReport.touches`), whatever number it
        // carried then. Matched by number — the §, the one it came from, the
        // ones a line creates — the guard of BGBl. I Nr. 24/2026 § 23, the old
        // § 15, was charged with „§ 15 (neu) lautet", which the line after
        // the renumbering means for the § that is § 15 now (26.10.2026).
        const touching = analysed.filter((a, i) => a.document || touches(i, node)).map((a) => a.touching)
        const guard = guardParagraph(id, standing, beforeNode, node, touching)
        const before = beforeNode ? plainText(beforeNode) : null
        const got = plainText(node)
        // DISPLAY FORM for what stands on the page — with „(1)", „3." and
        // „b)" (`bodyText`). The two lines above stay the comparison form:
        // the oracle holds our result against the Beilage, and the Beilage
        // sets its markers differently. Both forms out of the same tree, but
        // never the same function — until 19.09.2026 the display ran through
        // the comparison form, and a § without Absatz numbers read as if half
        // of it were missing.
        //
        // Heading and body kept apart, because the heading has a word diff of
        // its own on the page; in running text it stuck to the first
        // sentence otherwise.
        const bodyBefore = beforeNode ? bodyText(beforeNode) : null
        const bodyAfter = bodyText(node)
        // A package whose Beilage carries no law boundaries must not be
        // asked about a single Artikel: 15,1 % of the § designations recur in
        // another law of the same package.
        // With the Absätze as the page displays them, so check 5 can hold the
        // annex's markers against them (`absatzOrderBroken`, 26.10.2026).
        const annex = annexOf(w.article)
        const report = oracleVerdict(id, before, got, paragraphRows(annex.rows, id, annex.law, origin), absatzSequence(node), beforeNode ? (absatzSequence(beforeNode) ?? null) : null, beforeNode ? standingUnitsOf(beforeNode) : null)
        const gate = gateParagraph({
          refused: refusedIds.has(id),
          plausible: guard.plausible,
          oracle: report.verdict,
        })
        // A § the annex contradicts may still be shown where the draft's own
        // Gesetzestext, read a second time from its PDF, settles every place
        // where the two part (`kons/draftWitness.ts`, 20.11.2026). It then
        // carries those places, and is never counted as confirmed.
        const witness = gate.cause === 'anhang-widerspricht' && sources.draftRendition
          ? witnessVerdict(id, before, got, paragraphRows(annex.rows, id, annex.law, origin), touching.map(({ instruction }) => ({ op: instruction.op, line: instruction.line, payload: instruction.payload.map((p) => plainText(p)) })), await draftRendition(), absatzSequence(node), beforeNode ? (absatzSequence(beforeNode) ?? null) : null, beforeNode ? standingUnitsOf(beforeNode) : null)
          : null
        if (!gate.show && !witness?.released) {
          hold(id, gate.cause!)
          continue
        }
        // `diffTokens` returns null where the comparison is too long to
        // compute, past `MAX_LINEAR_CELLS` since guard, oracle and this
        // display go past the matrix's ceiling (20.11.2026). Barely reachable
        // here — the guard sets „unprüfbar" in the same case and the gate has
        // closed above already — but a § without markings would be a claim
        // without evidence. Five §§ of GP XXVIII stood here as „zu-lang"
        // while the matrix was the only path: guard and oracle diff the text
        // without its markers (`plainText`), this display with them, and the
        // two fell on either side of the ceiling (2.40–2.47 against 2.53–2.67
        // million token pairs).
        const segments: LawDiffSegment[] | null = bodyBefore === null ? [{ type: 'inserted', text: bodyAfter }] : diffTokens(bodyBefore, bodyAfter, { beyondCeiling: true }).segments
        if (!segments) {
          hold(id, 'zu-lang')
          continue
        }
        const headingBefore = beforeNode?.heading ?? ''
        const headingAfter = node.heading ?? ''
        const headingSegments: LawDiffSegment[] | null = headingAfter || headingBefore
          ? (headingBefore ? diffTokens(headingBefore, headingAfter, { beyondCeiling: true }).segments : [{ type: 'inserted', text: headingAfter }])
          : null
        found.push({
          id,
          segments,
          headingSegments,
          risUrl: konsLawUrl(law.gesetzesnummer, asOf),
          // The same value `paragraphRows` asked the annex with above — not
          // `law.kurztitel` but the Beilage's own law line. The page hangs
          // the § under exactly the § group it was checked against.
          annexLaw: annexLawOf(w),
          // A renumbered § was composed from the one it came from.
          ...laterOf(origin !== null && labelOf.has(origin) ? origin : id),
          ...(witness?.released ? { draftWitness: witness.places } : {}),
        })
      }
      shownBy.set(w, found)
      withheldBy.set(w, [...(withheldBy.get(w) ?? []), ...held])
    }
  })

  return result()
}

/** `KonsLawAtDate.superseded` under the key `labelOf` asks with (`anlageLabelKey`), each with the day the law was read at. */
function laterAmendments(law: KonsLawAtDate, asOf: string): Map<string, ConsolidatedLaterAmendment> {
  return new Map(Object.entries(law.superseded ?? {}).map(([label, { cite, issued }]) => [anlageLabelKey(label), { cite, issued, asOf }]))
}

/**
 * „§ 63. (entfällt)", „Verwaltungsübertretungen § 60. (entfällt)",
 * „Ersatzlos gestrichen." — a proposed column that says the unit goes: an
 * optional heading, an optional designation, an optional heading, then the
 * word, and nothing after it. The words are the ones the corpus prints at a
 * repealed unit (141/ME XXVIII, C4F11447) and RIS's own „aufgehoben".
 *
 * And the spellings a ressort may set instead (19.11.2026): in square
 * brackets or between dashes („[entfällt]", „– entfällt –"), the plural, „gestrichen",
 * „weggefallen". None stands in GP XXVIII's annexes (census of every unit
 * whose proposed column is short and holds a repeal word: one match, and
 * eleven misses that are standing text with RIS's „(Anm.: aufgehoben
 * durch …)"), but a miss here is a false „Unser Ergebnis weicht von der
 * Beilage ab", and a unit whose whole new text is such a word stands no
 * longer.
 */
const REPEAL_ONLY_RE = /^(?:[^.()[\]]{0,80}?\s)?(?:(?:§+\s*[\w.]+|(?:Anlage|Anhang|Anl\.)(?:\s+[\w/]+)?)\.?\s*)?(?:[^.()[\]]{0,80}?\s)?[([–—-]?\s*(?:entfällt|entfallen|aufgehoben|weggefallen|(?:ersatzlos\s+)?gestrichen)\s*\.?\s*[)\]–—-]?\.?$/iu

/**
 * Whether the annex shows a unit still standing after the draft: some row of
 * it that the annex does not strike (`paraAfter`, `designateAfter` in
 * `annex/comparisonRows.ts`) carries text in its right column, and that text
 * is more than the unit's designation and a repeal word („(entfällt)").
 * An elision („[...]", „…") is text that stands. Rows with their text
 * emptied (a withheld row on the page) say nothing either way.
 *
 * Asked of a unit the engine's result no longer carries (`entfaellt`): a
 * repeal the annex contradicts is our result against the Beilage, not a
 * repeal. The engine read „In der Anlage 2 entfallen die Zeilen betreffend
 * …" as the whole Anlage going (8CA8E8B1, C3F4E0AD), and the page, which
 * prints no line at a repealed unit because its struck rows say it, stood
 * silent beside the annex showing the Anlage still there (19.11.2026).
 * Shared with the Prüfstand (`scripts/harness/accounting.ts`), which holds
 * the page to it.
 */
export function annexKeepsUnit(rows: readonly Pick<ComparisonRow, 'proposed' | 'paraAfter'>[]): boolean {
  const text = rows.filter((r) => r.paraAfter !== null).map((r) => r.proposed).join(' ').replace(/\s+/g, ' ').trim()
  return text !== '' && !REPEAL_ONLY_RE.test(text)
}

/**
 * The label a law RIS files by Artikel carries a bare „§ 99" under — „Art. 1
 * § 99" — or null (20.11.2026).
 *
 * The drafts cite such a law's §§ without its Artikel („In § 99 Abs. 3a
 * lautet …", 97/ME XXVIII on the Finanzstrafgesetz), and under „§ 99" RIS
 * holds no document there: the stock came out without the §, and every line
 * on it was refused — 52 §§ of GP XXVIII's drafts in the FinStrG, the GGG,
 * the BEinstG, the AlVG, the DSG, the PreisG and the NBG. Taken only where
 * exactly one Artikel of the law holds the number: the DSG's „§ 1" is
 * „Art. 1 § 1" because Art. 2 starts at § 4, and where two Artikel hold
 * „§ 1" (Lebensmittelbewirtschaftungsgesetz Art. II § 1 beside Art. I) the
 * bare number names neither and is refused as before.
 */
export function artikelLabelOf(label: string, inRis: ReadonlySet<string>): string | null {
  const m = /^§ (\S+)$/.exec(label)
  if (!m) return null
  const found = [...inRis].filter((l) => {
    const art = /^Art\. \S+ § (\S+)$/.exec(l)
    return art !== null && art[1] === m[1]
  })
  return found.length === 1 ? found[0]! : null
}

/** The key `unitsByKey` holds a node under — a schedule as „Anl. 1", a § by its number. */
function stockKey(node: LawNode): string {
  return isSchedule(node.marker) ? (unitKey(node.marker) ?? node.id) : node.id
}

/**
 * Whether a Lesefassung accounts for every § it counts: shown and withheld
 * add up to `touched`, and no § of one law stands twice.
 *
 * The property the corpus Prüfstand holds every draft to, and a test holds
 * `consolidate` to. A § that fell out of both lists is the old bare
 * `continue` come back; one that stands twice is two outcomes for one §, of
 * which the page would show the first it finds.
 */
export function consolidationBalance(r: Pick<ConsolidatedTextResponse, 'paragraphs' | 'withheld' | 'touched'>): { balanced: boolean; missing: number; twice: string[] } {
  const seen = new Set<string>()
  const twice: string[] = []
  for (const { id, annexLaw } of [...r.paragraphs, ...r.withheld]) {
    const key = `${annexLaw ?? ''}#${id}`
    if (seen.has(key)) twice.push(key)
    seen.add(key)
  }
  const missing = r.touched - r.paragraphs.length - r.withheld.length
  return { balanced: missing === 0 && twice.length === 0, missing, twice }
}

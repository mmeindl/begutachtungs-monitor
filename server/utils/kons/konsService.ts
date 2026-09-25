/**
 * „So läse sich das Gesetz nach dem Entwurf" — our own konsolidierte
 * Lesefassung of a Ministerialentwurf (docs/architecture.md §12.12, §12.12a).
 *
 * Nuxt glue around the pure modules: `kons/novao.ts` reads the
 * Novellierungsanordnungen, `ris/konsLaw.ts` and `kons/konsCache.ts` fetch the
 * standing text, `kons/lawApply.ts` applies, `kons/applyGuard.ts` and
 * `kons/tguOracle.ts` judge, `kons/konsGate.ts` decides. Nothing is computed
 * here; this module fetches the documents and keeps the order.
 *
 * WHAT THIS SECTION ADDS OVER THE GEGENÜBERSTELLUNG, and why it nevertheless
 * stands below it. The ressort's Beilage shows what changes — but in excerpts:
 * it prints the Absatz it amends and leaves the rest of the § out. This
 * section shows the **whole §** as it would then read, from the authentic RIS
 * text rather than from the ressort's transcript. That is a gain for the
 * reader, but a small one — the real question („was ändert sich?") is answered
 * by the Beilage, and it answers it for more §§ than this gate ever will. So
 * the Beilage stands above and this below it.
 *
 * THE REFERENCE DATE IS THE FIRST DAY OF THE BEGUTACHTUNGSFRIST, neither
 * today nor the Einlangen: it is the day the ressort wrote its Beilage, and
 * the oracle may judge against that version only
 * (`annex/annexGuardService.ts` keeps the same day).
 *
 * THE BEILAGE IS READ A SECOND TIME HERE, deliberately, but through the same
 * source choice as the section above (`annexSourceFor`): RIS first, Parliament
 * as the fallback. The answer of `getTextComparison` itself is useless as an
 * oracle — it carries the rows whose check failed with their **text emptied**.
 */
import type { ConsolidatedParagraph, ConsolidatedTextResponse, LawDiffSegment } from '#shared/types'
import { guardParagraph } from './applyGuard'
import { addressedLabels, addressedParagraphs, gateParagraph } from './konsGate'
import { anlageLabelKey, bareParaId } from '../text/designation'
import { fetchParagraphXml, resolveKonsLaw } from './konsCache'
import { konsLawUrl } from '../lawtext/amendedLawsService'
import { diffTokens } from '../diff/wordDiff'
import { applyNovelle, instructionsFromUnits, type StandingLaw } from './lawApply'
import { bodyText, parseKonsParagraph, plainText, type LawNode } from '../lawtext/konsTree'
import { segmentUnits } from '../lawtext/lawUnits'
import { articleBlocks } from '../lawtext/draftArticles'
import { getDraftArticles } from '../lawtext/draftArticlesService'
import { opAddress } from './novao'
import { getRisMapForGp } from '../ris/begutCorpus'
import { mapWithConcurrency } from '../pool'
import type { KonsParagraphRef } from '../ris/konsLaw'
import { annexSourceFor } from '../annex/annexSource'
import { DERIVED_ANALYSIS_TTL_S } from '../cache/ttl'
import { oracleVerdict, paragraphRows, rowsByParagraph } from './tguOracle'

/** A Sammelgesetz names dozens; the display needs not all of them, the page needs an answer. */
const MAX_LAWS = 12
/** Ceiling on § documents per draft — the same worry as `MAX_HEADINGS` in `diff/paraTitleService.ts`. */
const MAX_PARAGRAPHS = 80
const CONCURRENCY = 4

/**
 * How much of the budget this Artikel gets — computed purely and called in
 * input order, so the allotment stays the same even where the Artikel are
 * fetched side by side. Which §§ the limit cuts off is a statement on the
 * page and must not depend on who finishes first.
 */
function allotBudget(refs: readonly KonsParagraphRef[], budget: { left: number }): { queue: KonsParagraphRef[]; skipped: Set<string> } {
  const queue = refs.slice(0, Math.max(0, budget.left))
  budget.left -= queue.length
  return { queue, skipped: new Set(refs.slice(queue.length).map((r) => r.id)) }
}

/**
 * The § documents this Artikel addresses, as trees.
 *
 * **The fetch stands outside the try, the parse inside it**, exactly as in
 * `annex/annexGuardService.ts` and for the same reason: a RIS that does not
 * answer is no statement about this §, so the error has to leave and nothing
 * may be cached. A document we *do* get and cannot read is the opposite: a
 * stable property of that document (RIS carries some §§ as a table), and null
 * is the right answer for it.
 */
async function standingParagraphs(queue: readonly KonsParagraphRef[]): Promise<LawNode[]> {
  // `trees` is filled in the callback rather than built from the result: the
  // order is the order of completion, and it always was.
  const trees: LawNode[] = []
  await mapWithConcurrency(queue, CONCURRENCY, async (ref) => {
    if (!ref.xmlUrl) return
    const xml = await fetchParagraphXml(ref.nor, ref.xmlUrl)
    try {
      const tree = parseKonsParagraph(xml)
      if (tree) trees.push(tree)
    } catch {
      // A document that is no § — 27 of 3.110 in the BGBl corpus.
    }
  })
  return trees
}

export const getConsolidatedText = defineCachedFunction(
  async (gp: string, inr: number): Promise<ConsolidatedTextResponse> => {
    const empty = (): ConsolidatedTextResponse => ({ gp, inr, paragraphs: [], touched: 0 })

    const row = (await getRisMapForGp(gp)).rows.find((r) => r.inr === inr) ?? null
    // The same rule as for the Gegenüberstellung: a weak join is dates and
    // ministry without the title, and the standing text of *another* draft
    // reads exactly as credibly as the right one.
    if (!row?.risId || row.status !== 'matched') return empty()
    // Without the first day of the consultation period we do not know which
    // version of the law the draft was written against.
    const asOf = row.risBeginn ?? null
    if (!asOf) return empty()
    // The instructions are read from the XML only.
    const xmlUrl = row.risDocument?.xml
    if (!xmlUrl) return empty()

    const { blocks } = await getDraftArticles(gp, inr, 'ris-xml')
    const parts = articleBlocks(blocks).filter((p) => p.article.amends)
    // A draft that creates a law instead of amending one has no version „davor".
    if (parts.length === 0) return empty()

    // The same source as the section above, out of the same function: RIS
    // first, Parliament as the fallback (`annex/textComparisonService.ts`).
    // Read a second time, because the Gegenüberstellung's answer carries the
    // checked rows with their **text emptied** — right for the display, fatal
    // for an oracle that would read empty text as „sagt nichts dazu".
    //
    // WHAT THE SECOND READ COSTS, two paths and two answers: the XML path
    // goes through `getDraftArticles` and is the same cache hit — since
    // 22.09.2026 for the PARSE too, not only for the bytes. The PDF path was
    // NOT — its byte cache is deliberately off in production
    // (`annex/annexPdfService.ts`), so `/konsolidiert` and
    // `/gegenueberstellung` each fetched and parsed the same Beilage once.
    // Since 22.09.2026 the PARSE lives in a derived cache
    // (`annex-pdf-parse`), so this path too is paid once per draft per day.
    const articles = parts.map((p) => p.article)
    const annex = await annexSourceFor(gp, inr, row.textComparison ?? null, articles)
    const byParagraph = typeof annex === 'string' ? null : rowsByParagraph(annex.parsed.rows)
    const isPackage = parts.length > 1

    let touched = 0
    const budget = { left: MAX_PARAGRAPHS }

    // ALL Artikel are counted, those beyond `MAX_LAWS` included: the
    // denominator on the page is „wie viele Paragraphen ändert dieser
    // Entwurf", not "how many did we look at". The first twelve are worked.
    //
    // THREE STEPS, and their order is the reason for the cut: first read
    // purely what each Artikel addresses, then allot the budget in INPUT
    // ORDER, and only last fetch side by side. Which §§ the limit cuts off is
    // a statement on the page; it must not depend on which Artikel finishes
    // first.
    const perArticle = parts.map(({ blocks: part, article }, index) => {
      const units = segmentUnits(part).filter((u) => u.blocks.some((b) => b.kind === 'novao'))
      const { instructions, refused } = instructionsFromUnits(units)
      if (instructions.length + refused.length === 0) return null
      // The denominator, counted before anything can fail — pure and tested
      // in `kons/konsGate.ts`, because a number that stands on the page is a
      // statement and not an intermediate result.
      const refusedLines = refused.map((r) => r.line)
      // The RIS labels beside the denominator, and from the same pure step:
      // a law divided into Artikel files its § 3 as „Art. 2 § 3", and null
      // here means two addressed §§ would collide under one id (§12.12a).
      return { index, article, instructions, refused, addressed: addressedParagraphs(instructions, refusedLines), labels: addressedLabels(instructions, refusedLines) }
    })
    for (const w of perArticle) if (w) touched += w.addressed.length

    // Without an annex nothing confirms anything, and then every RIS call is
    // wasted: half the drafts have none, and for those this function fetched
    // dozens of § documents only to show nothing afterwards. The number of
    // changed §§ still stands there — it costs no call, it is in the draft's
    // own text.
    if (!byParagraph) return { gp, inr, paragraphs: [], touched }

    const workable = perArticle.flatMap((w) => (w && w.index < MAX_LAWS ? [w] : []))

    const resolved = await mapWithConcurrency(workable, CONCURRENCY, async (w) => {
      const { article } = w
      // NO `.catch` here. `resolveKonsLaw` returns null where RIS does not
      // know the law or cannot tell two apart — an answer that holds for a
      // day — and it *throws* where RIS is unreachable. An error caught into
      // null would be an outage cached as a verdict about the draft; that is
      // exactly what `annex/annexGuardService.ts` cost once already.
      const law = article.bgbl ? await resolveKonsLaw(article.bgbl.organ, article.bgbl.nummer, asOf, article.title ?? '') : null
      if (!law) return null
      // Two §§ of this Artikel share a number under different Artikel of the
      // standing law. The stock is held by bare id, so one of them would
      // answer for the other; nothing is shown rather than the wrong text.
      const labels = w.labels
      if (!labels) return null

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
      // the stock as long as the budget suffices; only when it does not does
      // the order decide what is missing.
      const covered = (id: string): boolean =>
        paragraphRows(byParagraph, id, isPackage ? article.key : undefined).length > 0
      // Asked for under the label RIS prints, not under the bare designation:
      // in a law divided into Artikel there is no document called „§ 3", and
      // a lookup without the Artikel comes back empty rather than wide.
      const wanted = new Map([...w.addressed].map((id) => [anlageLabelKey(labels.get(id) ?? `§ ${id}`), covered(id)]))
      const refs = Object.entries(law.paragraphs)
        .filter(([label]) => wanted.has(anlageLabelKey(label)))
        .sort(([a], [b]) => Number(wanted.get(anlageLabelKey(b))) - Number(wanted.get(anlageLabelKey(a))))
        .map(([, ref]) => ref)
      return { ...w, law, refs }
    })

    // The allotment, pure and in order — before the fetching, not inside it.
    const jobs = resolved.flatMap((r) => (r ? [{ ...r, ...allotBudget(r.refs, budget) }] : []))

    const shownPerArticle = await mapWithConcurrency(jobs, CONCURRENCY, async (job) => {
      const { article, instructions, refused, addressed, law, queue, skipped } = job
      const standing: StandingLaw = { paragraphs: await standingParagraphs(queue) }
      const { law: after, results, unresolved } = applyNovelle(standing, instructions)

      const refusedIds = new Set([...unresolved].map((p) => /(\d+[a-z]*)/.exec(p)?.[1] ?? p))
      for (const r of refused) {
        const id = /§+\s*(\d+[a-z]*)/.exec(r.line)?.[1]
        if (id) refusedIds.add(id)
      }

      // Read once instead of once per §: the designation every instruction
      // addresses, and the §§ its payload inserts. The condition below is
      // unchanged — it is only computed 80 times less often (80 §§ × 500
      // instructions, `docs/refactor-plan.md` §6.8).
      const analysed = instructions.map((instruction, i) => {
        const { op, payload } = instruction
        const address = opAddress(op)
        const insertsParagraphs = (op.kind === 'insertAfter' || op.kind === 'append') && op.child === 'para'
        return {
          touching: { instruction, result: results[i]! },
          document: address?.level === 'document',
          para: address?.para ? bareParaId(address.para) : null,
          payloadIds: insertsParagraphs ? new Set(payload.map((pl) => pl.id).filter((id) => !!id)) : null,
        }
      })
      const nodeById = (nodes: readonly LawNode[]): Map<string, LawNode> => {
        const out = new Map<string, LawNode>()
        // First occurrence wins, exactly as `find` decided.
        for (const node of nodes) if (!out.has(node.id)) out.set(node.id, node)
        return out
      }
      const afterById = nodeById(after.paragraphs)
      const beforeById = nodeById(standing.paragraphs)

      const found: ConsolidatedParagraph[] = []
      for (const id of addressed) {
        // Our own ceiling first: a document we never fetched is not a refusal
        // of the engine.
        if (skipped.has(id)) continue
        const node = afterById.get(id)
        // No text produced: the § was not in the standing stock, or no
        // instruction on it could be carried out.
        if (!node) continue
        const beforeNode = beforeById.get(id) ?? null
        const touching = analysed
          .filter((a) => a.document || a.para === id || (a.payloadIds?.has(id) ?? false))
          .map((a) => a.touching)
        const guard = guardParagraph(id, standing, beforeNode, node, touching)
        const before = beforeNode ? plainText(beforeNode) : null
        const got = plainText(node)
        // DISPLAY FORM for what stands on the page — with „(1)", „3." and
        // „b)" (`bodyText`). The two lines above stay the comparison form:
        // the oracle holds our result against the Beilage, and the Beilage
        // sets its markers differently. Both forms out of the same tree, but
        // never the same function — until 19.09.2026 the display ran through
        // the comparison form, and a § without Absatz numbers read as if half
        // of it were missing (§12.12a).
        //
        // Heading and body kept apart, because the heading has a word diff of
        // its own on the page; in running text it stuck to the first
        // sentence otherwise.
        const bodyBefore = beforeNode ? bodyText(beforeNode) : null
        const bodyAfter = bodyText(node)
        // A package whose Beilage carries no law boundaries must not be
        // asked about a single Artikel: 15,1 % of the § designations recur in
        // another law of the same package.
        const report = oracleVerdict(id, before, got, paragraphRows(byParagraph, id, isPackage ? article.key : undefined))
        const gate = gateParagraph({
          refused: refusedIds.has(id),
          plausible: guard.plausible,
          oracle: report.verdict,
        })
        if (!gate.show) continue
        // `diffTokens` returns null where the comparison is too long to
        // compute. Barely reachable here — the guard sets „unprüfbar" in the
        // same case and the gate has closed above already — but a § without
        // markings would be a claim without evidence.
        const segments: LawDiffSegment[] | null = bodyBefore === null ? [{ type: 'inserted', text: bodyAfter }] : diffTokens(bodyBefore, bodyAfter).segments
        if (!segments) continue
        const headingBefore = beforeNode?.heading ?? ''
        const headingAfter = node.heading ?? ''
        const headingSegments: LawDiffSegment[] | null = headingAfter || headingBefore
          ? (headingBefore ? diffTokens(headingBefore, headingAfter).segments : [{ type: 'inserted', text: headingAfter }])
          : null
        found.push({
          id,
          segments,
          headingSegments,
          risUrl: konsLawUrl(law.gesetzesnummer, asOf),
          // The same value `paragraphRows` asked the annex with above — not
          // `law.kurztitel` but the Beilage's own law line. The page hangs
          // the § under exactly the § group it was checked against (§12.12a).
          annexLaw: isPackage ? article.key : null,
        })
      }
      return found
    })
    const shown = shownPerArticle.flat()

    return {
      gp,
      inr,
      // An empty list is not an error but the normal case: in half of the
      // drafts the annex confirms not a single paragraph (§12.12).
      paragraphs: shown,
      touched,
    }
  },
  { name: 'kons-text', base: DERIVED_CACHE, getKey: (gp: string, inr: number) => `${gp}-${inr}`, maxAge: DERIVED_ANALYSIS_TTL_S, swr: false },
)

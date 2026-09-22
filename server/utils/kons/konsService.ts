/**
 * „So läse sich das Gesetz nach dem Entwurf" — die eigene konsolidierte
 * Lesefassung eines Ministerialentwurfs (docs/architecture.md §12.12).
 *
 * Nuxt-Glue um die reinen Module: `novao.ts` liest die
 * Novellierungsanordnungen, `risKons.ts`/`konsCache.ts` holen den geltenden
 * Text, `lawApply.ts` wendet an, `applyGuard.ts` und `tguOracle.ts` urteilen,
 * `konsGate.ts` entscheidet. Gerechnet wird hier nichts; dieses Modul holt
 * die Dokumente und hält die Reihenfolge ein.
 *
 * WAS DIESE SEKTION GEGENÜBER DER GEGENÜBERSTELLUNG HINZUFÜGT, und warum sie
 * trotzdem unter ihr steht. Die Beilage des Ressorts zeigt, was sich ändert —
 * aber in Ausschnitten: Sie druckt den Absatz, den sie ändert, und lässt den
 * Rest des Paragraphen weg. Diese Sektion zeigt den **ganzen Paragraphen**,
 * wie er danach lautete, aus dem authentischen Text des RIS und nicht aus der
 * Abschrift des Ressorts. Das ist ein Zugewinn für den Leser, aber ein
 * kleiner — die eigentliche Frage („was ändert sich?") beantwortet die
 * Beilage, und sie beantwortet sie für mehr Paragraphen als dieses Tor je
 * wird. Deshalb steht sie oben und diese hier darunter.
 *
 * DER STICHTAG IST DER ERSTE TAG DER BEGUTACHTUNGSFRIST, nicht heute und
 * nicht das Einlangen: Es ist der Tag, an dem das Ressort seine Beilage
 * geschrieben hat, und nur gegen diese Fassung darf das Orakel urteilen
 * (`annexGuardService.ts` hält denselben Tag).
 *
 * DIE BEILAGE WIRD HIER EIN ZWEITES MAL GELESEN, absichtlich, aber durch
 * dieselbe Quellenwahl wie der Abschnitt darüber (`annexSourceFor`): RIS
 * zuerst, Parlament als Rückfall. Die Antwort von `getTextComparison` selbst
 * ist als Orakel unbrauchbar — sie trägt die Zeilen, deren Prüfung
 * fehlgeschlagen ist, mit **geleertem Text**.
 */
import type { ConsolidatedParagraph, ConsolidatedTextResponse, LawDiffSegment } from '#shared/types'
import { guardParagraph } from './applyGuard'
import { addressedParagraphs, gateParagraph } from './konsGate'
import { anlageLabelKey, bareParaId } from '../text/designation'
import { fetchParagraphXml, resolveKonsLaw } from './konsCache'
import { konsLawUrl } from '../amendedLawsService'
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

/** Ein Sammelgesetz nennt Dutzende; die Anzeige braucht nicht alle, die Seite braucht eine Antwort. */
const MAX_LAWS = 12
/** Obergrenze der §-Dokumente je Entwurf — dieselbe Sorge wie `paraTitleService.MAX_HEADINGS`. */
const MAX_PARAGRAPHS = 80
const CONCURRENCY = 4

/**
 * Die §-Dokumente, die dieser Artikel adressiert — und die, für die das
 * Budget nicht mehr reichte.
 *
 * **Der Abruf steht außerhalb des try, der Parse darin**, genau wie in
 * `annexGuardService.ts` und aus demselben Grund: Ein RIS, das nicht
 * antwortet, ist keine Aussage über diesen Paragraphen — der Fehler muss
 * heraus, damit nichts zwischengespeichert wird. Ein Dokument, das wir
 * *bekommen* und nicht lesen können, ist das Gegenteil: eine stabile
 * Eigenschaft dieses Dokuments (RIS führt manche Paragraphen als Tabelle),
 * und null ist dafür die richtige Antwort.
 */
/**
 * Wie viel vom Budget dieser Artikel bekommt — rein gerechnet und in
 * Eingabereihenfolge aufgerufen, damit die Zuteilung dieselbe bleibt, auch
 * wenn die Artikel nebeneinander geholt werden. Welche §§ die Grenze abschneidet,
 * ist eine Aussage auf der Seite und darf nicht davon abhängen, wer zuerst
 * fertig wird.
 */
function allotBudget(refs: readonly KonsParagraphRef[], budget: { left: number }): { queue: KonsParagraphRef[]; skipped: Set<string> } {
  const queue = refs.slice(0, Math.max(0, budget.left))
  budget.left -= queue.length
  return { queue, skipped: new Set(refs.slice(queue.length).map((r) => r.id)) }
}

async function standingParagraphs(queue: readonly KonsParagraphRef[]): Promise<LawNode[]> {
  // `trees` wird im Rückruf gefüllt, nicht aus dem Ergebnis gebaut: Die
  // Reihenfolge ist die der Fertigstellung, und das war sie immer.
  const trees: LawNode[] = []
  await mapWithConcurrency(queue, CONCURRENCY, async (ref) => {
    if (!ref.xmlUrl) return
    const xml = await fetchParagraphXml(ref.nor, ref.xmlUrl)
    try {
      const tree = parseKonsParagraph(xml)
      if (tree) trees.push(tree)
    } catch {
      // Ein Dokument, das kein Paragraph ist — im BGBl-Korpus 27 von 3.110.
    }
  })
  return trees
}

export const getConsolidatedText = defineCachedFunction(
  async (gp: string, inr: number): Promise<ConsolidatedTextResponse> => {
    const empty = (): ConsolidatedTextResponse => ({ gp, inr, paragraphs: [], touched: 0 })

    const row = (await getRisMapForGp(gp)).rows.find((r) => r.inr === inr) ?? null
    // Dieselbe Regel wie bei der Gegenüberstellung: Ein schwacher Join ist
    // Fristen und Ressort ohne Titel, und der geltende Text eines *anderen*
    // Entwurfs liest sich genauso glaubwürdig wie der richtige.
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

    // Dieselbe Quelle wie der Abschnitt darüber, aus derselben Funktion:
    // RIS zuerst, Parlament als Rückfall (`textComparisonService.ts`). Ein
    // zweites Mal gelesen, weil die Antwort der Gegenüberstellung die
    // geprüften Zeilen mit **geleertem Text** trägt — richtig für die
    // Anzeige, tödlich für ein Orakel, das aus leerem Text „sagt nichts
    // dazu" schlösse.
    //
    // WAS DAS ZWEITE LESEN KOSTET, zwei Wege, zwei Antworten: Der XML-Weg
    // geht durch `getDraftArticles` und ist derselbe Cache-Treffer — seit
    // 22.09.2026 auch für den PARSE, nicht nur für die Bytes. Der PDF-Weg
    // war es NICHT — dessen Byte-Cache ist in der Produktion bewusst
    // abgeschaltet (`annexPdfService.ts`), also holten und parsten
    // `/konsolidiert` und `/gegenueberstellung` dieselbe Beilage je einmal.
    // Seit 22.09.2026 liegt der PARSE in einem abgeleiteten Cache
    // (`annex-pdf-parse`), womit auch dieser Weg einmal je Entwurf und Tag
    // bezahlt wird.
    const articles = parts.map((p) => p.article)
    const annex = await annexSourceFor(gp, inr, row.textComparison ?? null, articles)
    const byParagraph = typeof annex === 'string' ? null : rowsByParagraph(annex.parsed.rows)
    const isPackage = parts.length > 1

    let touched = 0
    const budget = { left: MAX_PARAGRAPHS }

    // ALLE Artikel werden gezählt, auch die jenseits von `MAX_LAWS`: Der
    // Nenner auf der Seite ist „wie viele Paragraphen ändert dieser Entwurf",
    // nicht „wie viele haben wir angesehen". Bearbeitet werden die ersten
    // zwölf.
    //
    // DREI SCHRITTE, und ihre Reihenfolge ist der Grund für den Zuschnitt:
    // erst rein lesen, was jeder Artikel adressiert, dann das Budget in
    // EINGABEREIHENFOLGE zuteilen, und erst zuletzt nebeneinander holen.
    // Welche §§ die Grenze abschneidet, ist eine Aussage auf der Seite; sie
    // darf nicht davon abhängen, welcher Artikel zuerst fertig wird.
    const perArticle = parts.map(({ blocks: part, article }, index) => {
      const units = segmentUnits(part).filter((u) => u.blocks.some((b) => b.kind === 'novao'))
      const { instructions, refused } = instructionsFromUnits(units)
      if (instructions.length + refused.length === 0) return null
      // Der Nenner, gezählt bevor irgendetwas scheitern kann — rein und
      // getestet in `konsGate.ts`, weil eine Zahl, die auf der Seite steht,
      // eine Aussage ist und keine Zwischenrechnung.
      return { index, article, instructions, refused, addressed: addressedParagraphs(instructions, refused.map((r) => r.line)) }
    })
    for (const w of perArticle) if (w) touched += w.addressed.length

    // Ohne Anhang bestätigt nichts irgendetwas, und dann ist jeder
    // RIS-Abruf für die Katz: Die Hälfte der Entwürfe hat keinen, und für
    // die holte diese Funktion Dutzende §-Dokumente, um anschließend nichts
    // zu zeigen. Die Zahl der geänderten Paragraphen steht trotzdem da —
    // sie kostet keinen Abruf, sie steht im Entwurfstext.
    if (!byParagraph) return { gp, inr, paragraphs: [], touched }

    const workable = perArticle.flatMap((w) => (w && w.index < MAX_LAWS ? [w] : []))

    const resolved = await mapWithConcurrency(workable, CONCURRENCY, async (w) => {
      const { article } = w
      // KEIN `.catch` hier. `resolveKonsLaw` gibt null zurück, wenn das RIS
      // das Gesetz nicht kennt oder zwei nicht auseinanderhält — eine
      // Antwort, die einen Tag lang gilt —, und es *wirft*, wenn das RIS
      // nicht erreichbar ist. Ein in null gefangener Fehler wäre ein
      // Ausfall, der als Urteil über den Entwurf zwischengespeichert wird;
      // genau das hat `annexGuardService.ts` schon einmal gekostet.
      const law = article.bgbl ? await resolveKonsLaw(article.bgbl.organ, article.bgbl.nummer, asOf, article.title ?? '') : null
      if (!law) return null

      // Wenn das Budget beißt, soll es bei den Paragraphen beißen, die
      // ohnehin nichts zeigen könnten.
      //
      // Das Tor zeigt nichts ohne zweite Meinung: Schweigt die Beilage zu
      // einem §, steht sein Ausgang fest, bevor ein Dokument geholt ist. Die
      // holen wir deshalb zuletzt — **aber wir holen sie**. Sie ganz
      // wegzulassen war der erste Versuch (19.09.2026) und ging nach hinten
      // los: `applyNovelle` wendet die Anweisungen auf den GESAMTEN geladenen
      // Bestand an, und eine Anweisung, deren Anker-§ fehlt, scheitert. An
      // 100/ME stieg „Anweisung ließ sich nicht sicher anwenden" damit von 8
      // auf 11 und die Anzeige verlor zwei Paragraphen. Die Reihenfolge
      // ändert nichts am Bestand, solange das Budget reicht; erst wenn es
      // nicht reicht, entscheidet sie, was fehlt.
      const covered = (id: string): boolean =>
        paragraphRows(byParagraph, id, isPackage ? article.key : undefined).length > 0
      const wanted = new Map([...w.addressed].map((id) => [anlageLabelKey(`§ ${id}`), covered(id)]))
      const refs = Object.entries(law.paragraphs)
        .filter(([label]) => wanted.has(anlageLabelKey(label)))
        .sort(([a], [b]) => Number(wanted.get(anlageLabelKey(b))) - Number(wanted.get(anlageLabelKey(a))))
        .map(([, ref]) => ref)
      return { ...w, law, refs }
    })

    // Die Zuteilung, rein und der Reihe nach — vor dem Holen, nicht darin.
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

      // Einmal gelesen statt einmal je Paragraph: die Bezeichnung, die jede
      // Anweisung adressiert, und die §§, die ihre Nutzlast einfügt. Die
      // Bedingung darunter ist unverändert — nur gerechnet wird sie jetzt
      // 80-mal seltener (80 §§ × 500 Anweisungen, §6.8).
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
        // Kein Text erzeugt: Der § stand nicht im geltenden Bestand, oder
        // keine Anweisung an ihm ließ sich ausführen.
        if (!node) continue
        const beforeNode = beforeById.get(id) ?? null
        const touching = analysed
          .filter((a) => a.document || a.para === id || (a.payloadIds?.has(id) ?? false))
          .map((a) => a.touching)
        const guard = guardParagraph(id, standing, beforeNode, node, touching)
        const before = beforeNode ? plainText(beforeNode) : null
        const got = plainText(node)
        // ANZEIGEFORM für das, was auf der Seite steht — mit „(1)", „3." und
        // „b)" (`bodyText`). Die beiden Zeilen darüber bleiben die
        // Vergleichsform: Das Orakel hält unser Ergebnis gegen die Beilage,
        // und die setzt ihre Marker anders. Beide Formen aus demselben Baum,
        // aber nie dieselbe Funktion — bis 19.09.2026 lief die Anzeige über
        // die Vergleichsform, und ein § ohne Absatznummern las sich, als
        // fehle die Hälfte (§12.12a).
        //
        // Überschrift und Rumpf getrennt, weil die Überschrift auf der Seite
        // ihren eigenen Wortdiff hat; im Fließtext klebte sie sonst am ersten
        // Satz.
        const bodyBefore = beforeNode ? bodyText(beforeNode) : null
        const bodyAfter = bodyText(node)
        // Ein Paket ohne Gesetzesgrenzen in der Beilage darf nicht nach einem
        // einzelnen Artikel gefragt werden: 15,1 % der §-Bezeichnungen
        // wiederholen sich in einem anderen Gesetz desselben Pakets.
        const report = oracleVerdict(id, before, got, paragraphRows(byParagraph, id, isPackage ? article.key : undefined))
        const gate = gateParagraph({
          refused: refusedIds.has(id),
          plausible: guard.plausible,
          oracle: report.verdict,
        })
        if (!gate.show) continue
        // `diffTokens` gibt null zurück, wenn der Vergleich zu lang zum
        // Rechnen ist. Erreichbar ist das hier kaum — der Guard setzt in
        // demselben Fall „unprüfbar" und das Tor hat oben schon zugemacht —,
        // aber ein Paragraph ohne Markierung wäre eine Behauptung ohne Beleg.
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
          // Derselbe Wert, mit dem oben `paragraphRows` den Anhang befragt
          // hat — nicht `law.kurztitel`, sondern die Gesetzeszeile der
          // Beilage. Die Seite hängt den § damit unter genau die
          // §-Gruppe, gegen die er geprüft wurde (§12.12a).
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

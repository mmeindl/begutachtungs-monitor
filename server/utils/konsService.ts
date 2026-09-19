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
import { addressedParagraphs, gateParagraph, paraId, withheldSummary, type WithholdCause } from './konsGate'
import { fetchParagraphXml, resolveKonsLaw } from './konsCache'
import { konsLawUrl } from './amendedLawsService'
import { diffTokens } from './lawDiff'
import { fetchLawHtml } from './lawDiffService'
import { applyNovelle, instructionsFromUnits, type Instruction, type StandingLaw } from './lawApply'
import { bodyText, parseKonsParagraph, plainText, renderNode, type LawNode } from './lawStructure'
import { parseRisXml, segmentUnits } from './lawText'
import { articleBlocks, type DraftArticle } from './lawTitles'
import { getRisMapForGp } from './ris'
import type { KonsParagraphRef } from './risKons'
import { annexSourceFor } from './textComparisonService'
import { oracleVerdict, paragraphRows, rowsByParagraph } from './tguOracle'

const TTL_S = 60 * 60 * 24
/** Ein Sammelgesetz nennt Dutzende; die Anzeige braucht nicht alle, die Seite braucht eine Antwort. */
const MAX_LAWS = 12
/** Obergrenze der §-Dokumente je Entwurf — dieselbe Sorge wie `paraTitleService.MAX_HEADINGS`. */
const MAX_PARAGRAPHS = 80
const CONCURRENCY = 4

/** RIS druckt eine Anlage als „Anl. 2", eine Anweisung sagt „Anlage 2". */
function labelKey(label: string): string {
  return label.replace(/\s+/g, ' ').trim().replace(/^(?:Anlage|Anhang)\b/, 'Anl.')
}

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
async function standingParagraphs(
  refs: readonly KonsParagraphRef[],
  budget: { left: number },
): Promise<{ trees: LawNode[]; skipped: Set<string> }> {
  const queue = refs.slice(0, Math.max(0, budget.left))
  const skipped = new Set(refs.slice(queue.length).map((r) => r.id))
  budget.left -= queue.length
  const trees: LawNode[] = []
  const worker = async (): Promise<void> => {
    for (;;) {
      const ref = queue.shift()
      if (!ref) return
      if (!ref.xmlUrl) continue
      const xml = await fetchParagraphXml(ref.nor, ref.xmlUrl)
      try {
        const tree = parseKonsParagraph(xml)
        if (tree) trees.push(tree)
      } catch {
        // Ein Dokument, das kein Paragraph ist — im BGBl-Korpus 27 von 3.110.
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  return { trees, skipped }
}

export const getConsolidatedText = defineCachedFunction(
  async (gp: string, inr: number): Promise<ConsolidatedTextResponse> => {
    const empty = (reason: string | null, asOf: string | null = null): ConsolidatedTextResponse => ({
      gp,
      inr,
      available: false,
      unavailableReason: reason,
      asOf,
      paragraphs: [],
      touched: 0,
      withheld: [],
    })

    const row = (await getRisMapForGp(gp)).rows.find((r) => r.inr === inr) ?? null
    // Dieselbe Regel wie bei der Gegenüberstellung: Ein schwacher Join ist
    // Fristen und Ressort ohne Titel, und der geltende Text eines *anderen*
    // Entwurfs liest sich genauso glaubwürdig wie der richtige.
    if (!row?.risId || row.status !== 'matched') {
      return empty('Der Entwurf ließ sich keinem RIS-Datensatz sicher zuordnen — von dort kommt der geltende Gesetzestext.')
    }
    const asOf = row.risBeginn ?? null
    if (!asOf) return empty('Ohne den Beginn der Begutachtungsfrist wissen wir nicht, welche Fassung des Gesetzes der Entwurf vor sich hatte.')
    const xmlUrl = row.risDocument?.xml
    if (!xmlUrl) return empty('Der Entwurfstext liegt im RIS nicht als XML vor; die Anweisungen lesen wir nur von dort.', asOf)

    const blocks = parseRisXml(await fetchLawHtml(xmlUrl))
    const parts = articleBlocks(blocks).filter((p) => p.article.amends)
    if (parts.length === 0) {
      return empty('Dieser Entwurf ändert kein geltendes Gesetz, sondern schafft eines — dann gibt es keine Fassung „davor".', asOf)
    }

    // Dieselbe Quelle wie der Abschnitt darüber, aus derselben Funktion:
    // RIS zuerst, Parlament als Rückfall (`textComparisonService.ts`). Ein
    // zweites Mal gelesen, weil die Antwort der Gegenüberstellung die
    // geprüften Zeilen mit **geleertem Text** trägt — richtig für die
    // Anzeige, tödlich für ein Orakel, das aus leerem Text „sagt nichts
    // dazu" schlösse. Beide Wege gehen durch `fetchLawHtml`, sind also
    // derselbe Cache-Treffer.
    const articles = parts.map((p) => p.article)
    const annex = await annexSourceFor(gp, inr, row.textComparison ?? null, articles)
    const byParagraph = typeof annex === 'string' ? null : rowsByParagraph(annex.parsed.rows)
    const isPackage = parts.length > 1

    const shown: ConsolidatedParagraph[] = []
    const causes: WithholdCause[] = []
    let touched = 0
    const budget = { left: MAX_PARAGRAPHS }

    // ALLE Artikel werden gezählt, auch die jenseits von `MAX_LAWS`: Der
    // Nenner auf der Seite ist „wie viele Paragraphen ändert dieser Entwurf",
    // nicht „wie viele haben wir angesehen". Bearbeitet werden die ersten
    // zwölf; die übrigen tragen ihren eigenen Grund.
    for (const [index, { blocks: part, article }] of parts.entries()) {
      const units = segmentUnits(part).filter((u) => u.blocks.some((b) => b.kind === 'novao'))
      const { instructions, refused } = instructionsFromUnits(units)
      if (instructions.length + refused.length === 0) continue

      // Der Nenner, gezählt bevor irgendetwas scheitern kann — rein und
      // getestet in `konsGate.ts`, weil eine Zahl, die auf der Seite steht,
      // eine Aussage ist und keine Zwischenrechnung.
      const addressed = addressedParagraphs(instructions, refused.map((r) => r.line))
      touched += addressed.length
      const withhold = (cause: WithholdCause): void => {
        for (let i = 0; i < addressed.length; i++) causes.push(cause)
      }

      if (index >= MAX_LAWS) {
        withhold('nicht-geladen')
        continue
      }

      // Ohne Anhang bestätigt nichts irgendetwas, und dann ist jeder
      // RIS-Abruf für die Katz: Die Hälfte der Entwürfe hat keinen, und für
      // die holte diese Funktion Dutzende §-Dokumente, um anschließend nichts
      // zu zeigen. Die Zahl der geänderten Paragraphen steht trotzdem da —
      // sie kostet keinen Abruf, sie steht im Entwurfstext.
      if (!byParagraph) {
        withhold('kein-anhang')
        continue
      }

      // KEIN `.catch` hier. `resolveKonsLaw` gibt null zurück, wenn das RIS
      // das Gesetz nicht kennt oder zwei nicht auseinanderhält — eine
      // Antwort, die einen Tag lang gilt —, und es *wirft*, wenn das RIS
      // nicht erreichbar ist. Ein in null gefangener Fehler wäre ein
      // Ausfall, der als Urteil über den Entwurf zwischengespeichert wird;
      // genau das hat `annexGuardService.ts` schon einmal gekostet.
      const law = article.bgbl ? await resolveKonsLaw(article.bgbl.organ, article.bgbl.nummer, asOf, article.title ?? '') : null
      if (!law) {
        // Kein eigener Grund in der Liste: „Wir kennen das Gesetz nicht" ist
        // für den Leser dasselbe Ergebnis wie eine Verweigerung, und eine
        // weitere Zeile in der Aufzählung erklärt weniger als sie kostet.
        withhold('verweigert')
        continue
      }

      const wanted = new Set([...addressed].map((id) => labelKey(`§ ${id}`)))
      const refs = Object.entries(law.paragraphs)
        .filter(([label]) => wanted.has(labelKey(label)))
        .map(([, ref]) => ref)
      const { trees, skipped } = await standingParagraphs(refs, budget)
      const standing: StandingLaw = { paragraphs: trees }
      const { law: after, results, unresolved } = applyNovelle(standing, instructions)

      const refusedIds = new Set([...unresolved].map((p) => /(\d+[a-z]*)/.exec(p)?.[1] ?? p))
      for (const r of refused) {
        const id = /§+\s*(\d+[a-z]*)/.exec(r.line)?.[1]
        if (id) refusedIds.add(id)
      }

      for (const id of addressed) {
        // Unsere Obergrenze zuerst, und als eigener Grund: Dass wir ein
        // Dokument gar nicht geholt haben, ist keine Verweigerung der Engine.
        if (skipped.has(id)) {
          causes.push('nicht-geladen')
          continue
        }
        const node = after.paragraphs.find((p) => p.id === id)
        // Kein Text erzeugt: Der § stand nicht im geltenden Bestand, oder
        // keine Anweisung an ihm ließ sich ausführen.
        if (!node) {
          causes.push('verweigert')
          continue
        }
        const beforeNode = standing.paragraphs.find((p) => p.id === id) ?? null
        const touching: { instruction: Instruction; result: (typeof results)[number] }[] = instructions
          .map((instruction, i) => ({ instruction, result: results[i]! }))
          .filter(({ instruction: { op, payload } }) => {
            const address = 'target' in op ? op.target : 'anchor' in op ? op.anchor : null
            if (address?.level === 'document') return true
            if (address?.para && paraId(address.para) === id) return true
            if ((op.kind === 'insertAfter' || op.kind === 'append') && op.child === 'para') return payload.some((p) => p.id === id)
            return false
          })
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
        const report = byParagraph ? oracleVerdict(id, before, got, paragraphRows(byParagraph, id, isPackage ? article.key : undefined)) : null
        const gate = gateParagraph({
          refused: refusedIds.has(id),
          plausible: guard.plausible,
          oracle: report?.verdict ?? 'kein Anhang',
        })
        if (!gate.show) {
          causes.push(gate.cause!)
          continue
        }
        // `diffTokens` gibt null zurück, wenn der Vergleich zu lang zum
        // Rechnen ist. Erreichbar ist das hier kaum — der Guard setzt in
        // demselben Fall „unprüfbar" und das Tor hat oben schon zugemacht —,
        // aber ein Paragraph ohne Markierung wäre eine Behauptung ohne Beleg.
        const segments: LawDiffSegment[] | null = bodyBefore === null ? [{ type: 'inserted', text: bodyAfter }] : diffTokens(bodyBefore, bodyAfter).segments
        if (!segments) {
          causes.push('unplausibel')
          continue
        }
        const headingBefore = beforeNode?.heading ?? ''
        const headingAfter = node.heading ?? ''
        const headingSegments: LawDiffSegment[] | null = headingAfter || headingBefore
          ? (headingBefore ? diffTokens(headingBefore, headingAfter).segments : [{ type: 'inserted', text: headingAfter }])
          : null
        shown.push({
          law: isPackage ? law.kurztitel || article.title : null,
          article: isPackage ? article.number : null,
          id,
          label: node.marker?.replace(/\.$/, '') || `§ ${id}`,
          heading: node.heading || null,
          // Die gedruckte Form, wie der Kommentar am Feld sie verspricht —
          // nicht die Vergleichsform der beiden Zeilen weiter oben.
          before: beforeNode ? renderNode(beforeNode) : '',
          after: renderNode(node),
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
    }

    return {
      gp,
      inr,
      available: shown.length > 0,
      // Kein Fehler, sondern der Normalfall: In der Hälfte der Entwürfe
      // bestätigt die Beilage keinen einzigen Paragraphen (§12.12).
      unavailableReason: shown.length > 0
        ? null
        : byParagraph
          ? 'Für keinen Paragraphen dieses Entwurfs stimmt unser Ergebnis nachweislich mit der Textgegenüberstellung des Ressorts überein. Ohne diese zweite Meinung zeigen wir keinen Gesetzestext.'
          : 'Dieser Entwurf trägt keine maschinenlesbare Textgegenüberstellung. Sie ist das einzige unabhängige Dokument, an dem wir unsere Lesefassung prüfen könnten — ohne sie zeigen wir keine.',
      asOf,
      paragraphs: shown,
      touched,
      withheld: withheldSummary(causes),
    }
  },
  { name: 'kons-text', base: DERIVED_CACHE, getKey: (gp: string, inr: number) => `${gp}-${inr}`, maxAge: TTL_S, swr: false },
)

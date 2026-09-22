/**
 * „Hat sich die Begründung geändert?" — die Erläuterungen des Ressorts vom
 * Entwurf zur Regierungsvorlage, Paragraph für Paragraph
 * (docs/architecture.md §12.10b).
 *
 * Nuxt-Glue um `explanationsHtml.ts`. Gemessen, bevor es das hier gab: über
 * 64 auswertbare Paare der XXVIII. GP stehen 1.515 Paragraphen auf beiden
 * Seiten, und bei **728 davon (48 %)** ist die Begründung eine andere. Der
 * Vergleich zeigt bisher, wie sich der Gesetzestext ändert; das hier ist die
 * zweite Hälfte derselben Frage — was das Ressort dazu sagt, und ob es das
 * nach der Begutachtung anders sagt als davor.
 *
 * BEIDE SEITEN VOM PARLAMENT, mit demselben Parser. Die Erläuterungen des
 * Entwurfs lägen auch im RIS als typisiertes XML, die der Regierungsvorlage
 * nicht. Ein Vergleich XML gegen Word-HTML misst zuerst die Konverter
 * (§12.12, sechste Messung), also liest `parseParliamentHtml` beide.
 *
 * NACH `unitKey` GESCHLÜSSELT wie die §-Namen (`paraTitleService.ts`), aus
 * demselben Grund: Die Einheiten des Vergleichs tragen die Nummerierung der
 * Regierungsvorlage, und ein zweiter, selbst gebauter Schlüssel wäre die
 * zweite Gelegenheit, eine Begründung an die falsche Änderung zu hängen.
 *
 * Die Regel selbst — ein Vergleich je Paragraph, mehrdeutige Nummern bleiben
 * weg — steht in `reasoningDiff.ts` und wird dort getestet.
 *
 * NUR ENTWURF → REGIERUNGSVORLAGE. Die späteren Stationen haben eigene
 * Berichte, keine fortgeschriebenen Erläuterungen; für sie gibt dieser
 * Dienst nichts zurück, statt etwas Ähnliches zu vergleichen.
 */
import type { LawStationId, ReasoningDiffResponse, TraceLink } from '#shared/types'
import { parseExplanationsHtml, passagesByParagraph, type HtmlPassage } from './explanationsHtml'
import { fetchLawHtml, getLawDiff } from './lawDiffService'
import { findLastRvLink, mapDocuments, parseStages } from './parliament/detailJson'
import { getGegenstand } from './parliament/drafts'
import { compareReasoning } from './reasoningDiff'
import { DERIVED_ANALYSIS_TTL_S } from './cache/ttl'

/** Das Erläuterungen-Dokument eines Gegenstands, als HTML — oder nichts. */
async function explanationsDocument(gp: string, ityp: string, inr: number): Promise<TraceLink | null> {
  const detail = await getGegenstand(gp, ityp, inr)
  const group = mapDocuments(detail.content?.documents).find((d) => /^Erläuterungen$/i.test(d.title.trim()))
  const url = group?.formats.find((f) => f.type === 'html')?.url
  return url ? { label: `Erläuterungen (${ityp === 'ME' ? 'Entwurf' : 'Regierungsvorlage'})`, url } : null
}

/** Die Passagen eines Dokuments als Text je Paragraphennummer. */
function passageTexts(byParagraph: Map<string, HtmlPassage[]>): Map<string, string> {
  return new Map([...byParagraph].map(([id, passages]) => [id, passages.flatMap((p) => p.text).join(' ')]))
}

/** Die Antwort ohne Vergleich, mit dem Satz, der sagt warum — oder ohne. */
function empty(gp: string, inr: number, reason: string | null, sources: TraceLink[] = []): ReasoningDiffResponse {
  return {
    gp,
    inr,
    available: false,
    unavailableReason: reason,
    sources,
    units: {},
    paragraphs: {},
    stats: { compared: 0, changed: 0 },
  }
}

/**
 * Nur Entwurf → Regierungsvorlage, und die Prüfung steht VOR der gecachten
 * Funktion: Jede andere Strecke bekommt dieselbe leere Antwort, und ein Cache
 * dahinter legte für jede von ihnen einen Eintrag an, der nie etwas anderes
 * enthalten kann. Kein Satz für den Leser — die Seite fragt für diese
 * Strecken gar nicht erst (siehe Kopf).
 */
export function getReasoningDiff(gp: string, inr: number, from: LawStationId, to: LawStationId): Promise<ReasoningDiffResponse> {
  if (from !== 'me' || to !== 'rv') return Promise.resolve(empty(gp, inr, null))
  return compareMeToRv(gp, inr)
}

const compareMeToRv = defineCachedFunction(
  async (gp: string, inr: number): Promise<ReasoningDiffResponse> => {
    const detail = await getGegenstand(gp, 'ME', inr)
    const rv = findLastRvLink(parseStages(detail.content?.stages))
    if (!rv) return empty(gp, inr, 'Zu diesem Entwurf gibt es noch keine Regierungsvorlage.')

    const [meDoc, rvDoc] = await Promise.all([
      explanationsDocument(gp, 'ME', inr),
      explanationsDocument(rv.gp, 'I', rv.inr),
    ])
    if (!meDoc || !rvDoc) {
      return empty(
        gp,
        inr,
        meDoc
          ? 'Die Regierungsvorlage veröffentlicht ihre Erläuterungen nicht als HTML; verglichen haben wir sie deshalb nicht.'
          : 'Der Entwurf veröffentlicht seine Erläuterungen nicht als HTML; verglichen haben wir sie deshalb nicht.',
        [meDoc, rvDoc].filter((d): d is TraceLink => d !== null),
      )
    }

    const [meHtml, rvHtml] = await Promise.all([fetchLawHtml(meDoc.url), fetchLawHtml(rvDoc.url)])
    const before = passageTexts(passagesByParagraph(parseExplanationsHtml(meHtml)))
    const after = passageTexts(passagesByParagraph(parseExplanationsHtml(rvHtml)))
    const sources = [meDoc, rvDoc]
    if (before.size === 0 && after.size === 0) {
      return empty(gp, inr, 'Die Erläuterungen dieses Entwurfs sind nicht nach Paragraphen gegliedert; ein Vergleich am Paragraphen ginge daneben.', sources)
    }

    const diff = await getLawDiff(gp, inr, 'me', 'rv')
    if (!diff.available) return empty(gp, inr, null, sources)

    const { units, paragraphs, stats } = compareReasoning(diff.units, before, after)
    return {
      gp,
      inr,
      available: stats.compared > 0,
      unavailableReason: stats.compared > 0 ? null : 'Zu den geänderten Bestimmungen führen beide Dokumente keine gemeinsame Begründung.',
      sources,
      units,
      paragraphs,
      stats,
    }
  },
  {
    name: 'reasoning-diff',
    base: DERIVED_CACHE,
    getKey: (gp: string, inr: number) => `${gp}-${inr}`,
    maxAge: DERIVED_ANALYSIS_TTL_S,
    swr: false,
  },
)

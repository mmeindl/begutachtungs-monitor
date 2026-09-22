/**
 * Which document each station of a draft's law text publishes, and what to
 * say about a station that publishes none.
 *
 * Named apart from `shared/utils/lawStations.ts`, which holds the station
 * vocabulary both runtimes share; this one resolves the documents.
 */
import type { DraftDocument, LawStationId } from '#shared/types'
import { meTextTitleRank } from '#shared/utils/lawStations'
import { mapDocuments, mapTextEvolution, type RawDocumentGroup } from '../parliament/detailJson'

/** One station's published law text, as the comparison can use it. */
interface ResolvedLawStation {
  id: LawStationId
  /** The HTML export `parseLawUnits` needs; null when upstream offers only a PDF. */
  html: string | null
  /**
   * Legistisches RIS-XML, gelesen von `parseLawUnitsFromRis`.
   *
   * Zwei Stationen kommen so daher, und aus verschiedenen Gründen: der
   * Entwurf, wenn das Parlament ihn nur als PDF führt (der alte Rückfall),
   * und die Kundmachung, die es beim Parlament überhaupt nicht gibt
   * (§12.33). Deshalb steht das Feld an der Station und nicht mehr als
   * Sondervariable neben `me`.
   */
  xml: string | null
  /** What to link when there is no HTML, so the reader still reaches the text. */
  fallbackUrl: string | null
}

/**
 * Every station this Gegenstand publishes a law text for.
 *
 * The draft's own text comes from its document list, the later ones from
 * `mapTextEvolution` — the same call the detail page makes, so the selector
 * can never offer a station the page does not list. Both sides go through
 * the measured title whitelist in `shared/utils/lawStations.ts` rather than
 * matching words, because upstream types these titles by hand: three
 * GP-XXVI drafts publish "Gesetzestext, Vorblatt und Erläuterungen" as one
 * file, and a prefix match would feed the Erläuterungen to a § parser.
 */
export function findLawStations(content: {
  documents?: RawDocumentGroup[] | null
  statements?: { documents?: RawDocumentGroup[] | null } | null
}): Map<LawStationId, ResolvedLawStation> {
  const out = new Map<LawStationId, ResolvedLawStation>()
  const documents = mapDocuments(content.documents)

  let best: { rank: number; formats: DraftDocument['formats'] } | null = null
  for (const doc of documents) {
    const rank = meTextTitleRank(doc.title)
    if (rank < 0) continue
    if (!best || rank < best.rank) best = { rank, formats: doc.formats }
  }
  if (best) {
    out.set('me', {
      id: 'me',
      html: best.formats.find((f) => f.type === 'html')?.url ?? null,
      xml: null,
      fallbackUrl: best.formats.find((f) => f.type === 'pdf')?.url ?? null,
    })
  }

  // The draft's own document URLs are what upstream repeats while no
  // Regierungsvorlage exists; excluded, so only real later versions survive.
  const meUrls = new Set(documents.flatMap((d) => d.formats.map((f) => f.url)))
  for (const v of mapTextEvolution(content.statements?.documents, meUrls)) {
    if (!v.stationId) continue
    const station = out.get(v.stationId) ?? { id: v.stationId, html: null, xml: null, fallbackUrl: null }
    if (v.url.endsWith('.html')) station.html ??= v.url
    else station.fallbackUrl ??= v.url
    out.set(v.stationId, station)
  }
  return out
}

/**
 * Why a station carries nothing to compare — absent and PDF-only are two
 * different answers, and a reader who is told "only a PDF" knows there is a
 * text to open.
 */
export const MISSING_STATION_REASON: Record<LawStationId, string> = {
  me: 'Zu diesem Entwurf ist kein Gesetzestext als eigenes Dokument veröffentlicht.',
  rv: 'Es liegt noch keine Regierungsvorlage vor, mit der sich der Entwurf vergleichen ließe.',
  ausschuss: 'Der Ausschuss hat keine geänderte Fassung des Gesetzestexts veröffentlicht.',
  plenum: 'Im Plenum wurde keine geänderte Fassung des Gesetzestexts veröffentlicht.',
  bgbl: 'Dieser Entwurf ist bisher nicht als Gesetz kundgemacht worden.',
}

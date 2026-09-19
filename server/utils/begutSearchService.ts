/**
 * Volltextsuche über die laufenden Begutachtungen
 * (docs/architecture.md §12.31).
 *
 * Nuxt-aware glue um das reine Modul `begutSearch.ts`. Drei Schritte, und
 * keiner davon baut einen Index:
 *
 *  1. **Das RIS sucht.** `Suchworte` durchsucht den Volltext aller Dokumente
 *     eines Begut-Satzes — gemessen am 18.09.2026: „Wolf" liefert 13 Sätze,
 *     bei keinem einzigen steht das Wort in den Metadaten. Zusammen mit
 *     `InBegutachtungAm` ist das genau die Frage dieser Seite, in einem
 *     Aufruf, in ~165 ms.
 *  2. **Wir lösen den Treffer auf.** Die Antwort des RIS ist eine
 *     Dokumentnummer. Welche Seite dieses Monitors sie meint, weiß der
 *     Korpus samt Join (`ris.ts`): gehört der Satz zu einem
 *     Ministerialentwurf, führt der Treffer auf dessen Seite mit Frist,
 *     Stellungnahmen und Stationen — sonst auf die Seite des RIS-Satzes.
 *  3. **Wir zeigen die Fundstelle** (`begutSearch.ts`), weil das RIS keine
 *     mitliefert und eine Trefferliste ohne sie das Falsche behauptet.
 *
 * WAS DABEI GEMESSEN WURDE UND EINE ANNAHME WIDERLEGT HAT (18.09.2026): Das
 * RIS findet MEHR als das Wort. „Klimaschutz" liefert das
 * Industriestrompreisgesetz, in dessen Dokumenten das Wort nirgends steht —
 * die Erläuterungen schreiben „Leitlinien für staatliche Klima-,
 * Umweltschutz- und Energiebeihilfen", und das RIS trifft über die
 * Wortbestandteile. Die erste Fassung dieses Abschnitts hätte deshalb „steht
 * in einer Anlage oder einem PDF" gesagt, was schlicht falsch gewesen wäre.
 * Ein Treffer ohne benannte Stelle sagt jetzt, was geprüft wurde — und er
 * steht unten, weil ein belegter Treffer der stärkere ist.
 *
 * WARUM NUR DIE LAUFENDEN. Es ist Steinhammers Frage, nicht eine kleinere
 * Fassung davon: Ist einer der Entwürfe, die JETZT offen sind, ein Vehikel
 * für ein Anliegen meiner Organisation? Über den ganzen Korpus zu suchen ist
 * eine andere Frage („kam das schon einmal vor?") mit anderer Auflösung —
 * die Treffer verteilen sich dann über ein Dutzend Gesetzgebungsperioden,
 * und der Join oben kennt jeweils nur eine. Steht als eigener Punkt im TODO.
 *
 * NICHT GECACHT, mit Absicht. Der Schlüssel wäre die Eingabe des Lesers,
 * also unbegrenzt viele Schlüssel in einem Speicher, den die Produktion im
 * RAM hält (`cacheBase.ts`). Das RIS antwortet in Sekundenbruchteilen, und
 * die Dokumente darunter liegen ohnehin im dauerhaften Layer — gecacht wird
 * das Teure, nicht das Beliebige.
 */
import type {
  BegutSearchHit,
  BegutSearchResponse,
  RisConsultation,
  RisConsultationDetail,
} from '#shared/types'
import { parseSearchQuery, locateInBlocks, searchQueryString, type SearchTerm } from './begutSearch'
import { parseRisXml } from './lawText'
import { getDraftsForGp, getCurrentGp, reconcileActive } from './parliament'
import { getRisBegutCorpus, getRisMapForGp, RIS_API_BASE } from './ris'
import { getRisConsultation } from './risOnly'
import { asArray, isOpenOn } from './risRecord'

const USER_AGENT = 'begutachtungs-monitor/0.1 (+https://begutachtungs-monitor.at)'
const SEARCH_TIMEOUT_MS = 20_000
/**
 * Ein Dokument des Ressorts wird einmal veröffentlicht und nie überarbeitet
 * — ein korrigierter Entwurf bekommt einen neuen Satz. Dieselbe Frist wie in
 * `explanationsService.ts`, aus demselben Grund.
 */
const DOCUMENT_TTL_S = 60 * 60 * 24 * 30
/**
 * So viele Treffer bekommen eine Fundstelle. Über die laufenden
 * Begutachtungen ist das nie bindend — es waren 7 offene Sätze am
 * 18.09.2026, 22 am 15.06. —, aber ein Stichwort wie „Verordnung" darf auch
 * dann nicht 25 Dokumentsätze nachladen.
 */
const LOCATE_CAP = 12
/** Gleichzeitige Dokumentabrufe. Höflich gegenüber dem RIS, schnell genug. */
const LOCATE_CONCURRENCY = 4

/**
 * Die Dokumente eines Satzes in der Reihenfolge, in der sie als Fundstelle
 * taugen — und das ist eine Rangfolge der Aussage, keine der Bequemlichkeit.
 *
 * Steht das Wort im Entwurfstext, ist das die Antwort: dort steht, was
 * gelten soll. Steht es nur in den Erläuterungen, ist die Antwort eine
 * andere und gehört auch anders gelesen — das Ressort erwähnt das Thema,
 * der Gesetzestext sagt es nicht. Die Suche hört deshalb beim ersten Treffer
 * dieser Liste auf: sie nennt die stärkste Fundstelle, nicht alle.
 */
/** Die Dokumentfelder eines Satzes — genau die, die `RisConsultationDetail` führt. */
type DocumentKey = 'mainDocument' | 'explanations' | 'textComparison' | 'coverLetter'

const DOCUMENT_ORDER: readonly { key: DocumentKey; label: string }[] = [
  { key: 'mainDocument', label: 'im Entwurfstext' },
  { key: 'explanations', label: 'in den Erläuterungen' },
  { key: 'textComparison', label: 'in der Textgegenüberstellung' },
  { key: 'coverLetter', label: 'im Begleitschreiben' },
]

/** Ein Begut-Dokument als XML, wie das RIS es sendet — gelesen wird es frisch. */
const fetchBegutDocument = defineCachedFunction(
  async (url: string): Promise<string> => {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS) })
    if (!res.ok) throw new Error(`HTTP ${res.status} für ${url}`)
    return res.text()
  },
  { name: 'begut-dokument-xml', getKey: (url: string) => url, maxAge: DOCUMENT_TTL_S, swr: false },
)

/**
 * Die Dokumentnummern, die das RIS zu diesen Wörtern hat — heute offen.
 *
 * Ungecacht (siehe Kopf) und ohne Wiederholungsversuche: Diese Anfrage
 * hängt an einer Seite, auf der jemand wartet. Fällt das RIS aus, ist das
 * ein 502 mit einem Satz, keine leere Trefferliste — **ein Fehler ist keine
 * Antwort** (§12.13), und „zu ‚Klimaschutz' gibt es nichts" wäre hier die
 * teuerste Lüge des Produkts.
 */
async function searchRisIds(terms: readonly SearchTerm[], day: string): Promise<string[]> {
  const params = new URLSearchParams({
    Applikation: 'Begut',
    Suchworte: searchQueryString(terms),
    InBegutachtungAm: day,
    DokumenteProSeite: 'OneHundred',
    Seitennummer: '1',
  })
  let body: unknown
  try {
    const res = await fetch(`${RIS_API_BASE}?${params}`, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    })
    if (!res.ok) throw new Error(`RIS ${res.status}`)
    body = await res.json()
  } catch (cause) {
    throw createError({ statusCode: 502, statusMessage: 'Die Suche im RIS ist gerade nicht erreichbar', cause })
  }
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const result = (body as any)?.OgdSearchResult
  if (!result || result.Error) {
    throw createError({ statusCode: 502, statusMessage: 'Die Suche im RIS hat einen Fehler gemeldet' })
  }
  const refs = asArray<any>(result.OgdDocumentResults?.OgdDocumentReference)
  return refs.map((r) => String(r?.Data?.Metadaten?.Technisch?.ID ?? '')).filter(Boolean)
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

/** Wie viele Begutachtungen an diesem Tag offen sind — unsere eigene Zahl, aus dem Korpus. */
async function runningCount(day: string): Promise<number> {
  const corpus = await getRisBegutCorpus()
  return corpus.records.filter((r) => isOpenOn(r, day)).length
}

/**
 * Die Fundstelle in einem Satz: das erste Dokument der Rangfolge, das die
 * Wörter zeigt.
 *
 * ZWEI DURCHGÄNGE ÜBER ALLE DOKUMENTE, nicht zwei Regeln je Dokument. Der
 * zweite ist die Teilstringsuche, und liefe sie innerhalb eines Dokuments
 * gleich nach der strengen, dann gewänne ein Entwurfstext, in dem nur
 * „Klimaschutzgesetz" steht, gegen die Erläuterungen, in denen „Klimaschutz"
 * wirklich steht — die Rangfolge der Dokumente würde die Genauigkeit der
 * Regel schlagen. So gewinnt erst die Regel, dann die Rangfolge.
 *
 * Die Dokumente werden dabei höchstens einmal geladen: der zweite Durchgang
 * liest, was der erste in den Cache gelegt hat.
 */
async function locate(
  documents: Pick<RisConsultationDetail, DocumentKey>,
  terms: readonly SearchTerm[],
): Promise<Pick<BegutSearchHit, 'place' | 'designation' | 'snippet'>> {
  for (const loose of [false, true]) {
    for (const { key, label } of DOCUMENT_ORDER) {
      const url = documents[key]?.xml
      if (!url) continue
      let blocks
      try {
        blocks = parseRisXml(await fetchBegutDocument(url))
      } catch {
        // Ein Dokument, das sich nicht laden lässt, macht den Treffer nicht
        // falsch — das RIS hat das Wort gefunden. Weiter zum nächsten.
        continue
      }
      const hit = locateInBlocks(blocks, terms, loose)
      if (hit) return { place: label, designation: hit.designation, snippet: hit.snippet }
    }
  }
  return { place: null, designation: null, snippet: null }
}

/** Die Felder, die eine Zeile braucht — der Detailsatz trägt mehr, als über die Leitung muss. */
function toConsultationView(d: RisConsultation): RisConsultation {
  return {
    id: d.id,
    kind: d.kind,
    title: d.title,
    longTitle: d.longTitle,
    ministryCode: d.ministryCode,
    ministryName: d.ministryName,
    startedAt: d.startedAt,
    deadline: d.deadline,
    active: d.active,
    risUrl: d.risUrl,
    // Die Suche sagt nichts über den Ausgang: Sie sucht in den LAUFENDEN
    // Begutachtungen, und dort gibt es keinen.
    outcome: null,
  }
}

/**
 * Was zu diesen Wörtern in den laufenden Begutachtungen steht.
 *
 * Die leere Trefferliste ist hier ein Ergebnis, kein Defekt, und trägt
 * deshalb `corpusSize` mit sich: „in den 7 laufenden Begutachtungen kommt
 * das Wort nicht vor" ist eine Auskunft, „keine Treffer" ist keine.
 */
export async function searchRunningBegut(raw: string): Promise<BegutSearchResponse> {
  const terms = parseSearchQuery(raw)
  const day = new Date().toISOString().slice(0, 10)
  if (!terms.length) {
    return { query: raw.trim(), terms: [], corpusSize: await runningCount(day), total: 0, hits: [], located: 0 }
  }

  const [ids, corpusSize, gp] = await Promise.all([searchRisIds(terms, day), runningCount(day), getCurrentGp()])

  // Der Join der laufenden Periode: jeder heute offene Satz ist in ihr
  // begonnen worden, also reicht genau eine Karte. Fällt sie aus, bleibt die
  // Suche brauchbar — die Treffer zeigen dann auf ihre RIS-Seite.
  const [map, drafts] = await Promise.all([
    getRisMapForGp(gp).catch(() => null),
    getDraftsForGp(gp).catch(() => null),
  ])
  const inrOf = new Map<string, number>()
  for (const row of map?.rows ?? []) if (row.risId) inrOf.set(row.risId, row.inr)

  const hits: BegutSearchHit[] = []
  let located = 0
  for (let i = 0; i < ids.length; i += LOCATE_CONCURRENCY) {
    const batch = ids.slice(i, i + LOCATE_CONCURRENCY)
    const resolved = await Promise.all(
      batch.map(async (id) => {
        const detail = await getRisConsultation(id)
        // Ein Satz, den unser Korpus noch nicht kennt (er ist bis zu 20 h
        // alt): lieber auslassen als eine Zeile ohne Ziel zeigen.
        if (!detail) return null
        const evidence =
          hits.length + batch.length <= LOCATE_CAP
            ? await locate(detail, terms)
            : { place: null, designation: null, snippet: null }
        const inr = inrOf.get(id)
        const draft = inr !== undefined ? drafts?.items.find((d) => d.inr === inr) : undefined
        const hit: BegutSearchHit = {
          entry: draft
            ? { kind: 'draft', draft: reconcileActive(draft) }
            : { kind: 'ris', consultation: toConsultationView(detail) },
          ...evidence,
        }
        return hit
      }),
    )
    for (const hit of resolved) {
      if (!hit) continue
      hits.push(hit)
      if (hit.place) located++
    }
  }

  // Belegte Treffer zuerst, die Reihenfolge des RIS innerhalb der beiden
  // Hälften erhalten: Wo wir den Satz zeigen können, ist der Treffer geprüft;
  // wo nicht, kann er auch eine Wortbestandteil-Fundstelle des RIS sein.
  const ranked = [...hits.filter((h) => h.place), ...hits.filter((h) => !h.place)]
  return {
    // Die Eingabe des Lesers zurück, nicht unsere normalisierte Fassung:
    // „3 von 7 führen ‚strom'" las sich wie ein Tippfehler des Werkzeugs.
    // Was wirklich ans RIS ging, steht daneben in `terms`.
    query: raw.trim(),
    terms: terms.map((t) => t.text),
    corpusSize,
    total: ids.length,
    hits: ranked,
    located,
  }
}

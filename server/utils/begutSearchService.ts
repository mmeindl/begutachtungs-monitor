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
 * RAM hält (`cache/base.ts`). Das RIS antwortet in Sekundenbruchteilen, und
 * die Dokumente darunter liegen ohnehin im dauerhaften Layer — gecacht wird
 * das Teure, nicht das Beliebige.
 */
import type {
  BegutSearchHit,
  BegutSearchResponse,
  RisConsultation,
  RisConsultationDetail,
  RisDocumentFormats,
} from '#shared/types'
import {
  blocksFromPlainText,
  locateInBlocks,
  parseSearchQuery,
  searchQueryString,
  withoutMinistryMentions,
  type SearchTerm,
} from './begutSearch'
import { DERIVED_CACHE } from './cache/base'
import { PUBLISHED_DOCUMENT_TTL_S } from './cache/ttl'
import { parseRisXml, type TextBlock } from './lawText'
import { ministryTokens, type MinistryToken } from './searchHaystack'
import { getDraftsForGp, getCurrentGp, reconcileActive } from './parliament'
import { getRisBegutCorpus, getRisMapForGp } from './ris'
import { mapWithConcurrency } from './pool'
import { getRisConsultation } from './risOnly'
import { asArray, isOpenOn } from './risRecord'
import {
  RIS_API_BASE,
  RisEnvelopeError,
  risJson,
  upstreamBytes,
  upstreamText,
  type UpstreamPolicy,
} from './upstream/fetch'

const SEARCH_TIMEOUT_MS = 20_000
/**
 * Ohne Wiederholungsversuch — wie vor dem gemeinsamen Client, und aus dem
 * Grund, der unter `searchRisIds` steht: An dieser Anfrage wartet jemand.
 */
const SEARCH_POLICY: UpstreamPolicy = { timeoutMs: SEARCH_TIMEOUT_MS, retries: 0 }
/**
 * So viele Sätze bekommen eine Fundstelle — die ersten dieser Zahl in der
 * Reihenfolge, in der das RIS sie nennt. Über die laufenden Begutachtungen
 * ist das nie bindend — es waren 7 offene Sätze am 18.09.2026, 22 am
 * 15.06. —, aber ein Stichwort wie „Verordnung" darf auch dann nicht 25
 * Dokumentsätze nachladen.
 */
const LOCATE_CAP = 12
/** Gleichzeitige Dokumentabrufe. Höflich gegenüber dem RIS, schnell genug. */
const LOCATE_CONCURRENCY = 4
/**
 * So viele PDFs darf EINE Suche nachladen.
 *
 * Das PDF ist der zweite Anlauf, nicht der erste (siehe `locate`): Es wird
 * nur geholt, wo das XML nichts hergibt. Das ist selten genug, um es zu
 * tun, und teuer genug, um es zu deckeln — pdf.js hält ein Dokument samt
 * dekodierten Strömen im Speicher, und an einer Suche wartet jemand.
 *
 * 16 WAREN ZU WENIG, gemessen am 22.09.2026: Seit die Suche ALLE Dokumente
 * eines Satzes liest (`documentsOf`), fiel die Benennungsquote über zwölf
 * Stichwörter auf 91,4 % — nicht weil etwas fehlte, sondern weil das Budget
 * mitten in der Trefferliste ausging. Ohne Deckel sind es 100 % bei
 * unveränderten 0,2–2,1 s, also ist die Zahl hier kein Zeitbudget, sondern
 * eine Reißleine gegen den pathologischen Satz: 48 deckt zwölf Treffer mit
 * je vier PDFs, und die zwölf gemessenen Suchen brauchten nie mehr als
 * rund zwanzig.
 */
const PDF_BUDGET = 48
/** Wie bei den Beilagen: ein Dokument, das größer ist, lesen wir nicht. */
const PDF_MAX_BYTES = 16 * 1024 * 1024

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

/** Ein Dokument, wie diese Suche es sieht: ein Etikett und ein paar URLs. */
interface SearchDocument {
  label: string
  formats: RisDocumentFormats | null
}

const DOCUMENT_ORDER: readonly { key: DocumentKey; label: string }[] = [
  { key: 'mainDocument', label: 'im Entwurfstext' },
  { key: 'explanations', label: 'in den Erläuterungen' },
  { key: 'textComparison', label: 'in der Textgegenüberstellung' },
  { key: 'coverLetter', label: 'im Begleitschreiben' },
]

/**
 * Alle Dokumente eines Satzes, in der Rangfolge der Aussage.
 *
 * DIE VIER BENANNTEN ZUERST, weil ihr Etikett etwas bedeutet: „im
 * Entwurfstext" heißt, dass dort steht, was gelten soll; „in den
 * Erläuterungen" heißt, dass das Ressort das Thema erwähnt. Danach der
 * Rest, den der Satz führt — und zwar seit 22.09.2026 überhaupt erst.
 *
 * WAS VORHER FEHLTE, ist gemessen: Die 8 laufenden Sätze führen 41
 * Textdokumente, die vier Felder greifen 25. Ein Treffer, der nur im WFA
 * oder im Digicheck steht, endete deshalb bei „wir konnten nichts
 * benennen" — geprüft an allen drei unbenannten „datenschutz"-Treffern,
 * die genau dort standen.
 *
 * DER NAME DES RESSORTS IST DAS ETIKETT („in „WFA UVP-G-Novelle 2026""),
 * weil wir ihn nicht besser deuten können als das Ressort ihn gewählt hat.
 * Das ist zugleich die billige Hälfte einer anderen Lücke: `SAG_TGÜ` und
 * `Entwurf EB Klimagesetz` sind eine Gegenüberstellung und Erläuterungen,
 * die unsere Namensregeln nicht erkennen (`risRecord.ts`). Die Suche liest
 * sie jetzt — als „weiteres Dokument", ohne die Regeln anzufassen, an denen
 * die Anlagen-Maschine und der Erläuterungen-Abschnitt hängen.
 */
function documentsOf(detail: Pick<RisConsultationDetail, DocumentKey | 'otherDocuments'>): SearchDocument[] {
  return [
    ...DOCUMENT_ORDER.map(({ key, label }) => ({ label, formats: detail[key] })),
    ...detail.otherDocuments.map((d) => ({ label: `in „${d.name}“`, formats: d.formats })),
  ]
}

/**
 * Die Bytes eines Begut-PDFs, base64 — wie die Beilage nebenan
 * (`annexPdfService.ts`), und aus denselben Gründen: Ein gecachter Wert wird
 * als JSON serialisiert, und ein `Uint8Array` überlebt das als Objekt mit den
 * Schlüsseln „0", „1", „2".
 *
 * NUR IM DEV persistent. Ein PDF ist die teure und die große Hälfte; in der
 * Produktion liegt der Cache im RAM, und dort gehört der ausgelesene TEXT hin
 * (die Funktion darunter), nicht das Dokument, aus dem er stammt.
 */
const fetchBegutPdf = defineCachedFunction(
  async (url: string): Promise<string> => {
    const { bytes } = await upstreamBytes(url, { ...SEARCH_POLICY, maxBytes: PDF_MAX_BYTES })
    return Buffer.from(bytes).toString('base64')
  },
  {
    name: 'begut-dokument-pdf',
    getKey: (url: string) => url,
    maxAge: PUBLISHED_DOCUMENT_TTL_S,
    swr: false,
    shouldBypassCache: () => !import.meta.dev,
  },
)

/**
 * Derselbe PDF als reiner Text — abgeleitet, also in der anderen Schicht
 * (`cache/base.ts`).
 *
 * Getrennt vom Abruf, weil eine Funktion, die holt UND auswertet, in keine
 * der beiden Schichten gehört: Jede Invalidierung, die den Parser trifft,
 * würde das Dokument mitwerfen. Und gecacht wird das Ergebnis, weil `locate`
 * bis zu viermal über dasselbe Dokument geht — pdf.js soll dabei einmal
 * arbeiten, nicht viermal.
 */
const begutPdfText = defineCachedFunction(
  async (url: string): Promise<string> => {
    const bytes = new Uint8Array(Buffer.from(await fetchBegutPdf(url), 'base64'))
    const { extractText, getDocumentProxy } = await import('unpdf')
    const { text } = await extractText(await getDocumentProxy(bytes), { mergePages: true })
    return typeof text === 'string' ? text : (text as string[]).join('\n')
  },
  {
    name: 'begut-dokument-pdf-text',
    base: DERIVED_CACHE,
    getKey: (url: string) => url,
    maxAge: PUBLISHED_DOCUMENT_TTL_S,
    swr: false,
  },
)

/** Ein Begut-Dokument als XML, wie das RIS es sendet — gelesen wird es frisch. */
const fetchBegutDocument = defineCachedFunction(
  async (url: string): Promise<string> => {
    return upstreamText(url, SEARCH_POLICY)
  },
  { name: 'begut-dokument-xml', getKey: (url: string) => url, maxAge: PUBLISHED_DOCUMENT_TTL_S, swr: false },
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
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let result: any
  try {
    result = await risJson<any>(`${RIS_API_BASE}?${params}`, { ...SEARCH_POLICY, accept: 'application/json' })
  } catch (cause) {
    if (cause instanceof RisEnvelopeError) {
      throw createError({ statusCode: 502, statusMessage: 'Die Suche im RIS hat einen Fehler gemeldet' })
    }
    throw createError({ statusCode: 502, statusMessage: 'Die Suche im RIS ist gerade nicht erreichbar', cause })
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

/** Was eine Suche an PDF-Abrufen noch übrig hat. */
interface PdfBudget { left: number }

/** Ein Dokument als Blöcke, im gefragten Format. Null, wenn es das nicht gibt. */
async function blocksOf(
  doc: RisDocumentFormats | null,
  format: 'xml' | 'pdf',
  budget: PdfBudget,
): Promise<TextBlock[] | null> {
  const url = doc?.[format]
  if (!url) return null
  try {
    if (format === 'xml') return parseRisXml(await fetchBegutDocument(url))
    if (budget.left <= 0) return null
    budget.left--
    return blocksFromPlainText(await begutPdfText(url))
  } catch {
    // Ein Dokument, das sich nicht laden lässt, macht den Treffer nicht
    // falsch — das RIS hat das Wort gefunden. Weiter zum nächsten.
    return null
  }
}

/**
 * Ein Durchgang über alle Dokumente eines Satzes, in einem Format.
 *
 * ZWEIMAL ÜBER ALLE DOKUMENTE, nicht zwei Regeln je Dokument. Der zweite
 * Durchgang ist die Teilstringsuche, und liefe sie innerhalb eines Dokuments
 * gleich nach der strengen, dann gewänne ein Entwurfstext, in dem nur
 * „Klimaschutzgesetz" steht, gegen die Erläuterungen, in denen „Klimaschutz"
 * wirklich steht — die Rangfolge der Dokumente würde die Genauigkeit der
 * Regel schlagen. So gewinnt erst die Regel, dann die Rangfolge.
 *
 * `tokens` null heißt: mit den Ressortnennungen suchen. Das ist der letzte
 * Durchgang und er beantwortet eine andere Frage — nicht „wovon handelt der
 * Entwurf", sondern „warum hat das RIS ihn überhaupt geliefert".
 */
async function scan(
  documents: readonly SearchDocument[],
  terms: readonly SearchTerm[],
  format: 'xml' | 'pdf',
  tokens: readonly MinistryToken[] | null,
  budget: PdfBudget,
): Promise<Pick<BegutSearchHit, 'place' | 'designation' | 'snippet'> | null> {
  for (const loose of [false, true]) {
    for (const { label, formats } of documents) {
      const raw = await blocksOf(formats, format, budget)
      if (!raw) continue
      const blocks = tokens ? withoutMinistryMentions(raw, tokens) : raw
      const hit = locateInBlocks(blocks, terms, loose)
      if (hit) return { place: label, designation: hit.designation, snippet: hit.snippet }
    }
  }
  return null
}

/**
 * Die Fundstelle in einem Satz — in drei Stufen, und die dritte ist die
 * interessanteste.
 *
 *  1. **XML ohne Ressortnennungen.** Der Normalfall, und billig.
 *  2. **PDF ohne Ressortnennungen.** Weil das XML lügt, wo es kürzt: Das
 *     Begleitschreiben des DGAV-Entwurfs hat im XML 943 Zeichen und im PDF
 *     12.223 — der Verteiler, auf den das RIS getroffen hatte, stand nur
 *     dort. Vorher endete so ein Treffer bei „wir konnten nichts benennen".
 *  3. **Noch einmal, MIT den Ressortnennungen.** Findet dieser Durchgang
 *     etwas, das die ersten beiden nicht fanden, dann steht das Wort
 *     ausschließlich in einem Ministeriumsnamen — im Verteiler, in der
 *     Unterschriftszeile. Das ist kein Sachtreffer, und die Zeile sagt es
 *     (`ministryOnly`), statt ihn zu verschweigen: Das RIS hat den Satz
 *     geliefert, das Urteil gehört dem Leser. Gemessen am 21.09.2026: 3 von
 *     7 Treffern zu „klima" sind von dieser Art.
 */
async function locate(
  detail: Pick<RisConsultationDetail, DocumentKey | 'otherDocuments'>,
  terms: readonly SearchTerm[],
  tokens: readonly MinistryToken[],
  budget: PdfBudget,
): Promise<Pick<BegutSearchHit, 'place' | 'designation' | 'snippet' | 'ministryOnly'>> {
  const documents = documentsOf(detail)
  for (const format of ['xml', 'pdf'] as const) {
    const found = await scan(documents, terms, format, tokens, budget)
    if (found) return { ...found, ministryOnly: false }
  }
  for (const format of ['xml', 'pdf'] as const) {
    const found = await scan(documents, terms, format, null, budget)
    if (found) return { ...found, ministryOnly: true }
  }
  return { place: null, designation: null, snippet: null, ministryOnly: false }
}

/** Das Ressortvokabular des Korpus — historische Namen eingeschlossen. */
async function ministryVocabulary(): Promise<MinistryToken[]> {
  const corpus = await getRisBegutCorpus()
  return ministryTokens(corpus.records.map((r) => r.stelle ?? ''))
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
    return { query: raw.trim(), corpusSize: await runningCount(day), total: 0, hits: [] }
  }

  const [ids, corpusSize, gp, tokens] = await Promise.all([
    searchRisIds(terms, day),
    runningCount(day),
    getCurrentGp(),
    ministryVocabulary(),
  ])
  const budget: PdfBudget = { left: PDF_BUDGET }

  // Der Join der laufenden Periode: jeder heute offene Satz ist in ihr
  // begonnen worden, also reicht genau eine Karte. Fällt sie aus, bleibt die
  // Suche brauchbar — die Treffer zeigen dann auf ihre RIS-Seite.
  const [map, drafts] = await Promise.all([
    getRisMapForGp(gp).catch(() => null),
    getDraftsForGp(gp).catch(() => null),
  ])
  const inrOf = new Map<string, number>()
  for (const row of map?.rows ?? []) if (row.risId) inrOf.set(row.risId, row.inr)

  const resolved = await mapWithConcurrency(ids, LOCATE_CONCURRENCY, async (id, index) => {
    const detail = await getRisConsultation(id)
    // Ein Satz, den unser Korpus noch nicht kennt (er ist bis zu 20 h
    // alt): lieber auslassen als eine Zeile ohne Ziel zeigen.
    if (!detail) return null
    // Der Deckel hängt am Platz in der Trefferliste, nicht mehr an der
    // Stapelgrenze: Vorher entschied `hits.length + batch.length`, also die
    // Frage, wie viele Sätze ein Stapel zufällig ausließ, wer eine
    // Fundstelle bekam — bei vier je Stapel konnten das acht statt zwölf
    // sein. Jetzt sind es die ersten LOCATE_CAP in Eingabereihenfolge.
    const evidence =
      index < LOCATE_CAP
        ? await locate(detail, terms, tokens, budget)
        : { place: null, designation: null, snippet: null, ministryOnly: false }
    const inr = inrOf.get(id)
    const draft = inr !== undefined ? drafts?.items.find((d) => d.inr === inr) : undefined
    const hit: BegutSearchHit = {
      entry: draft
        ? { kind: 'draft', draft: reconcileActive(draft) }
        : { kind: 'ris', consultation: toConsultationView(detail) },
      ...evidence,
    }
    return hit
  })
  const hits: BegutSearchHit[] = resolved.filter((h) => h !== null)

  /*
   * Drei Klassen, und die Reihenfolge ist ein Werturteil über die AUSKUNFT,
   * nicht über den Entwurf:
   *
   *  1. **Belegt.** Wir zeigen den Satz, in dem das Wort steht.
   *  2. **Unbelegt.** Wir haben es in keinem lesbaren Dokument gefunden —
   *     offen, ob es in einer Anlage steht oder ob das RIS über
   *     Wortbestandteile getroffen hat. Offen ist mehr wert als
   *     ausgeschlossen, deshalb vor der dritten Klasse.
   *  3. **Nur in der Ressortnennung.** Der einzige Fund steht im Verteiler
   *     oder in einer Unterschriftszeile. Geprüft und entkräftet — also
   *     zuletzt, aber sichtbar: Wegwerfen hieße, dem Leser das Urteil
   *     abzunehmen, und bei der UVP-G-Novelle wäre es das falsche gewesen
   *     (dort IST der Ressortname der Gegenstand).
   */
  const ranked = [
    ...hits.filter((h) => h.place && !h.ministryOnly),
    ...hits.filter((h) => !h.place),
    ...hits.filter((h) => h.place && h.ministryOnly),
  ]
  return {
    // Die Eingabe des Lesers zurück, nicht unsere normalisierte Fassung:
    // „3 von 7 führen ‚strom'" las sich wie ein Tippfehler des Werkzeugs.
    query: raw.trim(),
    corpusSize,
    total: ids.length,
    hits: ranked,
  }
}

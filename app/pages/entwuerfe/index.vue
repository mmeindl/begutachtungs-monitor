<script setup lang="ts">
import type {
  BegutSearchHit,
  BegutSearchResponse,
  DashboardSecondRound,
  DraftStation,
  DraftStatus,
  DraftSummary,
  DraftsResponse,
  OpenVorlage,
  RisConsultation,
  RisConsultationsResponse,
} from '#shared/types'
import { DRAFT_STATION_LABEL, DRAFT_STATION_ORDER } from '#shared/utils/draftStations'
import { compareDrafts, draftOrderKey, type OrderedDraft } from '#shared/utils/draftOrder'
import { viewOfDraft, viewOfRis, viewOfVorlage } from '~/utils/entryView'
import { romanToInt } from '#shared/utils/gp'
import { matchesQuery } from '#shared/utils/textMatch'
import { SECOND_ROUND_WINDOW } from '~/utils/spine'

/**
 * Every Begutachtung of a period, in ONE list — Ministerialentwürfe and the
 * Begutachtungen Parliament has no Gegenstand for (docs/architecture.md
 * §12.19).
 *
 * This was two pages until 17.09.2026, and the split had a real argument
 * behind it: merging would change what "Alle Entwürfe", the GP totals and
 * the Stellungnahmen sums count, and two thirds of the rows lack exactly the
 * participation data those numbers are built from. That objection was to
 * POOLING THE NUMBERS, not to sharing a page — and applied to the page it
 * cost more than it bought:
 *
 *  - the second list had **no way in**. The navigation is capped at four
 *    items by design and its labels are already too wide at 320px, so a
 *    fifth entry was never available; the page hung off one homepage
 *    section.
 *  - it forced a **name that says nothing**. "Weitere Entwürfe" is
 *    relational — further than what? — and it reads as "less important"
 *    about two thirds of the corpus.
 *  - and it answered the reader's question in two places. Someone asking
 *    "what is open right now?" had to visit two pages and add up, which is
 *    the very coverage gap that produced this half of the data in the first
 *    place.
 *
 * So: one list, one filter, two row shapes — and never a single pooled
 * total. The count line states each kind separately, because a headline
 * "336 Entwürfe" would imply the Stellungnahmen figures cover all of them.
 */
useSeoMeta({
  title: 'Entwürfe',
  description:
    'Alle Begutachtungen: Ministerialentwürfe mit Gegenstand im Parlament und Verordnungsentwürfe, die nur im RIS erscheinen – filterbar nach Art, Status, Gesetzgebungsperiode und Ministerium.',
})

const route = useRoute()
const router = useRouter()

/**
 * Zwei Achsen, nicht eine (§12.26).
 *
 * **Wo steht es** ist die Station: Begutachtung, Regierungsvorlage,
 * Parlament, Bundesgesetzblatt — dasselbe Vokabular wie die Zeitleiste der
 * Detailseite. **Was kann ich tun** ist der Status daneben, und der läuft
 * quer über die Stationen: „Stellungnahme möglich" heißt laufende Frist
 * ODER offenes Formular zur Regierungsvorlage.
 *
 * Warum „Zweite Runde" kein eigener Chip neben „Regierungsvorlage" ist: sie
 * wäre keine Station, sondern eine Eigenschaft von einer — wer den Chip
 * wählte, bekäme sonst auch alle längst beschlossenen Vorlagen dazu. Als
 * Schnitt aus beiden Achsen ist sie exakt benennbar und bleibt teilbar:
 * `?status=open&station=rv`.
 */
const statusOptions: { value: DraftStatus; label: string }[] = [
  { value: 'all', label: 'Alle' },
  { value: 'open', label: 'Stellungnahme möglich' },
  { value: 'closed', label: 'Abgeschlossen' },
]

const stationOptions: { value: DraftStation; label: string }[] = DRAFT_STATION_ORDER.map((value) => ({
  value,
  label: DRAFT_STATION_LABEL[value],
}))

function parseStations(v: unknown): DraftStation[] {
  const raw = firstQueryValue(v) ?? ''
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is DraftStation => (DRAFT_STATION_ORDER as readonly string[]).includes(s))
}

/**
 * The filter is by WHERE a draft stands in the procedure, not by the type
 * word on its title — that is the distinction the two halves actually differ
 * in, and the only one the data supports without a classifier.
 *
 * `verordnung` therefore selects all 201 records without a Gegenstand, of
 * which 198 are Verordnungen and the rest are drafts that likewise never
 * reached Parliament. The label admits that rather than pretending, and
 * each row carries its own type word. The value is spelled `verordnung`
 * because that is the word a reader would type, and `/weitere-entwuerfe`
 * redirects onto it.
 *
 * ONE noun, used by the option and by the count line under the filters
 * (`countLabel`). They named the same set two ways until 18.09.2026 —
 * „Verordnungsentwürfe u. a." here, „ohne Gegenstand im Parlament" there —
 * and a reader comparing the two had no way to know it was one set. Written
 * out rather than „u. a.", which a screen reader reads as „u a".
 */
const ART_VERORDNUNG_NOUN = 'Verordnungsentwürfe und andere'

type ArtFilter = '' | 'ministerialentwurf' | 'verordnung'
const artOptions: { value: ArtFilter; label: string }[] = [
  { value: '', label: 'Alle Arten' },
  { value: 'ministerialentwurf', label: 'Ministerialentwürfe' },
  { value: 'verordnung', label: ART_VERORDNUNG_NOUN },
]

/**
 * Two orders, because the homepage has two questions (§12.24).
 *
 * „Frist" is the list's own order and the default everywhere: open first,
 * nearest deadline on top (`compareDrafts`). „Meiste Stellungnahmen" exists
 * because the homepage's ranking („Wo am meisten mitgeredet wurde") had
 * nowhere to send anyone — its five rows are a window onto an order this
 * page could not produce, so the link would have pointed at the pool
 * instead of at the list. It is the same comparator the ranking uses
 * (`rankByStatements`), so the first five rows here ARE those five rows.
 *
 * The slot for „zuletzt dazugekommen" (TODO, §12.22) is this select.
 */
type SortKey = 'frist' | 'stellungnahmen'
const sortOptions: { value: SortKey; label: string }[] = [
  { value: 'frist', label: 'Nach Frist' },
  { value: 'stellungnahmen', label: 'Meiste Stellungnahmen' },
]

function parseSort(v: unknown): SortKey {
  return firstQueryValue(v) === 'stellungnahmen' ? 'stellungnahmen' : 'frist'
}

function parseStatus(v: unknown): DraftStatus {
  const s = firstQueryValue(v)
  return s === 'open' || s === 'closed' ? s : 'all'
}
function parseArt(v: unknown): ArtFilter {
  const s = firstQueryValue(v)
  return s === 'ministerialentwurf' || s === 'verordnung' ? s : ''
}

// Filter state, initialized from the URL so links are shareable.
const statusFilter = ref<DraftStatus>(parseStatus(route.query.status))
const art = ref<ArtFilter>(parseArt(route.query.art))
const gp = ref(firstQueryValue(route.query.gp) ?? '')
const ministry = ref(firstQueryValue(route.query.ministry) ?? '')
const q = ref(firstQueryValue(route.query.q) ?? '')
const qDebounced = ref(q.value)
/* Client-side, unlike the filters above: both endpoints already ship the
 * whole filtered set, so reordering it costs no request — and the merge of
 * the two halves happens here anyway (`rows`). */
const sort = ref<SortKey>(parseSort(route.query.sort))
const stations = ref<DraftStation[]>(parseStations(route.query.station))

/* Ein Chip an/aus. Leere Auswahl heißt „alle Stationen" und steht nicht in
 * der URL — ein Filter, der nichts ausschließt, gehört nicht in einen Link,
 * den jemand weitergibt. */
function toggleStation(value: DraftStation): void {
  stations.value = stations.value.includes(value)
    ? stations.value.filter((s) => s !== value)
    : [...stations.value, value]
}

/**
 * Die Eingrenzung faltet sich auf dem Telefon zusammen — und nur dort.
 *
 * Gemessen am 18.09.2026: die Leiste war bei 390 px **432 px hoch**, die
 * erste Zeile der Liste begann bei y = 880, das erste Bildschirmfenster
 * eines 390 × 844-Geräts zeigte also **keine einzige Zeile**. Auf 896 px
 * sind es 156 px und sechs Zeilen; dort ist nichts zu retten, dort war nur
 * der Umbruch zufällig. Der Umbau ist deshalb einer fürs Telefon.
 *
 * Sichtbar bleiben die Frage, mit der jemand ankommt („was kann ich tun"),
 * und die Suche. Die Stationschips wandern mit den drei Selects hinter den
 * Schalter: sie kosten 96 der 432 px und sind das, wonach beim Scrollen am
 * seltensten gegriffen wird. Das ist der Preis dieser Entscheidung und er
 * ist echt — die Stationen sind das Vokabular, das Liste und Zeitleiste
 * teilen (§12.26), und wer die Liste zum ersten Mal sieht, lernt es hier
 * nicht mehr nebenbei.
 *
 * Zwei Sicherungen: aufgeklappt, sobald einer dieser Filter in der URL
 * steht — ein geteilter Link darf nie einen aktiven Filter verstecken —,
 * und die Zahl am Schalter steht nur im zugeklappten Zustand, weil sie sonst
 * über den Bedienelementen stünde, die sie zählt.
 *
 * Warum eine Checkbox und kein <details>, gegen das Hausmuster (vier
 * Vorkommen, kein einziger geskripteter Toggle): ein zugeklapptes <details>
 * lässt sich per CSS nicht ab einem Breakpoint öffnen. Geprüft am
 * 18.09.2026 in Chrome 152 — `details:not([open]) > .body { display:block }`
 * unter `@media (min-width:768px)` blendet den Inhalt NICHT ein (die
 * Messung über `getBoundingClientRect` meldet dabei irreführend eine Höhe;
 * der Screenshot zeigt nichts). Ohne das müsste dieselbe Leiste zweimal im
 * Markup stehen, mit kollidierenden `for`/`id`-Paaren. Checkbox plus `peer`
 * bleibt CSS-only, SSR-fest und ohne JS bedienbar.
 */
const moreFilters = computed(
  () => Number(stations.value.length > 0) + Number(art.value !== '') + Number(gp.value !== '') + Number(ministry.value !== ''),
)
const filtersOpen = ref(moreFilters.value > 0)

const { webcalUrl, googleCalUrl } = useFeedUrls()

let qTimer: ReturnType<typeof setTimeout> | undefined
watch(q, (value) => {
  clearTimeout(qTimer)
  qTimer = setTimeout(() => {
    qDebounced.value = value.trim()
  }, 300)
})
onUnmounted(() => clearTimeout(qTimer))

const query = computed(() => ({
  status: statusFilter.value,
  station: stations.value.length ? stations.value.join(',') : undefined,
  gp: gp.value || undefined,
  ministry: ministry.value || undefined,
  q: qDebounced.value || undefined,
}))

const { data, error, refresh, status } = await useFetch<DraftsResponse>('/api/drafts', { query })

/**
 * The other half, and it is the OPTIONAL one.
 *
 * Its rows come from the RIS Begut corpus — 46 paged requests with a pause
 * between them when the cache is cold, measured at 46 s right after a
 * restart against 0,22 s warm. The Ministerialentwürfe must never wait for
 * that, so this fetch carries a budget and the page renders without it: the
 * same rule as everywhere else here, enrichment is never a fact the page
 * depends on. A failure is stated, not swallowed — the count line must not
 * report "0 ohne Gegenstand" when the truth is "we could not look".
 */
const { data: risData, error: risError } = await useFetch<RisConsultationsResponse>(
  '/api/ris-drafts',
  { query, timeout: 8000 },
)

/**
 * Das zweite offene Fenster — und seit 18.09.2026 sind es Zeilen, kein
 * Abschnitt (§12.26).
 *
 * Wer unter „Stellungnahme möglich" hier landet, fragt, wo er jetzt etwas
 * sagen kann. Zu einer Regierungsvorlage geht das im Nationalrat genauso.
 * Der Entwurf dahinter ist dafür längst eine Zeile — Station
 * „Regierungsvorlage", Chip „Zweite Runde". Was dieser Abruf noch beiträgt,
 * sind die Vorlagen, hinter denen KEIN Entwurf steht (rund ein Viertel,
 * `docs/begutachtung-uebersprungen.md`): sie haben keine Zeile, die sie
 * tragen könnte, und werden deshalb selbst eine (`vorlageRows`).
 *
 * Zwei Anläufe standen vorher hier, beide als eigener Abschnitt unter der
 * Liste, und beide sind an derselben Sache gescheitert: die Startseite zeigt
 * sechs offene Vorlagen, der Abschnitt zeigte danach eine — „sechs dort,
 * eine hier" liest sich als Defekt, ganz gleich, wie die Überschrift lautet.
 * Eine Liste, die beantwortet „wo kann ich etwas sagen", darf die Antwort
 * nicht auf zwei Orte verteilen.
 *
 * Clientseitig und lazy: nichts über diesem Abruf hängt von ihm ab, ein
 * leeres Ergebnis ist der Normalfall, und was fehlen kann, darf den ersten
 * Paint nicht halten.
 */
const { data: secondRound } = await useFetch<DashboardSecondRound>(
  '/api/dashboard/zweite-runde',
  { lazy: true, server: false },
)

const selectedGp = computed({
  get: () => gp.value || data.value?.gp || risData.value?.gp || '',
  set: (value: string) => {
    gp.value = value
  },
})

/**
 * Both halves know the periods and the ressorts; the union is the menu.
 *
 * Newest period first, by the NUMBER the Roman code stands for — comparing
 * the strings would put XXVIII before XXX, and the table reaches far enough
 * that this stops being hypothetical.
 */
const availableGps = computed(() => {
  const all = new Set([...(data.value?.availableGps ?? []), ...(risData.value?.availableGps ?? [])])
  return [...all].sort((a, b) => (romanToInt(b) ?? 0) - (romanToInt(a) ?? 0))
})
const ministries = computed(() => {
  const byCode = new Map<string, string>()
  for (const m of [...(data.value?.ministries ?? []), ...(risData.value?.ministries ?? [])]) {
    if (!byCode.has(m.code) || (!byCode.get(m.code) && m.name)) byCode.set(m.code, m.name)
  }
  return [...byCode].map(([code, name]) => ({ code, name })).sort((a, b) => a.code.localeCompare(b.code, 'de-AT'))
})

// Keep the URL in sync with the filters (defaults stay out of the URL).
watch([query, art, sort], () => {
  const urlQuery: Record<string, string> = {}
  if (statusFilter.value !== 'all') urlQuery.status = statusFilter.value
  if (stations.value.length) urlQuery.station = stations.value.join(',')
  if (art.value) urlQuery.art = art.value
  if (gp.value) urlQuery.gp = gp.value
  if (ministry.value) urlQuery.ministry = ministry.value
  if (qDebounced.value) urlQuery.q = qDebounced.value
  if (sort.value !== 'frist') urlQuery.sort = sort.value
  router.replace({ query: urlQuery })
})

/**
 * One row type per kind, interleaved by the shared comparator.
 *
 * Not a common row shape: a Ministerialentwurf has a Geschäftszahl and a
 * Stellungnahmen count, a record without a Gegenstand has neither and cannot
 * ever have them. Flattening both into one shape would mean inventing empty
 * fields, and an empty Stellungnahmen count reads as "nobody cared" where
 * the truth is "nobody counts". So each kind keeps its own card and row, and
 * only the ORDER is shared (`shared/utils/draftOrder.ts`).
 */
type Row =
  | { kind: 'me'; key: string; draft: DraftSummary }
  | { kind: 'ris'; key: string; item: RisConsultation }
  | { kind: 'vorlage'; key: string; vorlage: OpenVorlage }

/**
 * Die dritte Zeilenart, seit 18.09.2026: eine Regierungsvorlage, zu der es
 * nie eine Begutachtung gab.
 *
 * Sie stand bis dahin in einem eigenen Abschnitt unter der Liste, und das
 * war der Fehler, den Manu zweimal gemeldet hat: die Startseite zeigt sechs
 * offene Vorlagen, die Liste zeigte fünf davon als Zeile und eine im
 * Abschnitt darunter. „Sechs dort, eine hier" liest sich als Defekt, egal
 * wie der Abschnitt heißt — und die Überschrift war schon zweimal die
 * falsche Antwort auf die Frage.
 *
 * Also gehört sie in dieselbe Liste. Das ist keine Aufweichung von §12.19
 * („zwei Zeilenformen, nie eine gepoolte Summe"), sondern dieselbe Regel ein
 * drittes Mal: eigene Zeilenform, eigener Zählterm, gemeinsame Ordnung.
 * Fachlich ist sie hier richtig, weil diese Liste unter „Stellungnahme
 * möglich" beantwortet, wo jemand etwas sagen kann — und das kann er hier.
 */
function orderOf(row: Row): OrderedDraft {
  if (row.kind === 'me') return draftOrderKey(row.draft)
  if (row.kind === 'ris') return row.item
  /* Keine Frist, die laufen könnte — das Formular schließt mit der
   * Abstimmung. Also `active: false` mit dem Einlangen als Datum: die Zeile
   * ordnet sich unter die laufenden Fristen und zwischen die zweite Runde,
   * wo sie hingehört, statt eine Dringlichkeit zu behaupten, die sie nicht
   * datieren kann. */
  return { active: false, deadline: null, startedAt: row.vorlage.date || null, title: row.vorlage.title }
}

/**
 * Most Stellungnahmen first — and the half that cannot be ranked stays a
 * block, it does not get interleaved at zero.
 *
 * A record without a Gegenstand carries no Stellungnahmen count and never
 * will (nobody publishes who filed one, §12.16). Sorting it in at 0 would
 * read as "nobody cared" about two thirds of the corpus, which is the one
 * misreading this page is built to prevent — so those rows follow all the
 * ranked ones, in the list's own Frist order, and the line above the list
 * says so.
 *
 * The ME comparison is `rankByStatements`' one, tie-break included, because
 * the homepage's five rows must be the first five here.
 */
function compareByStatements(a: Row, b: Row): number {
  if (a.kind !== b.kind) return a.kind === 'me' ? -1 : 1
  if (a.kind === 'me' && b.kind === 'me') {
    return b.draft.statementCount - a.draft.statementCount || b.draft.inr - a.draft.inr
  }
  return compareDrafts(orderOf(a), orderOf(b))
}

/**
 * Die Vorlagen ohne Begutachtung als Zeilen — unter denselben Bedienelementen
 * wie alles andere, soweit sie greifen.
 *
 * Status: nur wo „Stellungnahme möglich" gefragt ist oder gar nicht gefiltert
 * wird; unter „Abgeschlossen" hat ein offenes Fenster nichts verloren.
 * Station: sie stehen bei der Regierungsvorlage. Art: sie sind keine
 * Verordnungsentwürfe. Ressort: `OpenVorlage` trägt keines, also tritt die
 * Zeile zurück, sobald danach gefiltert wird — dieselbe Regel wie zuvor im
 * Abschnitt. Suche: dieselbe Wortregel wie oben (`matchesQuery`).
 */
const vorlageRows = computed<Row[]>(() => {
  const list = secondRound.value
  if (!list || statusFilter.value === 'closed' || art.value === 'verordnung' || ministry.value) return []
  if (stations.value.length && !stations.value.includes('rv')) return []
  if (selectedGp.value && selectedGp.value !== list.gp) return []
  return list.items
    .filter((v) => v.consultation.kind !== 'draft')
    .filter((v) => matchesQuery(`${v.title} ${v.citation}`, qDebounced.value))
    .map((v) => ({ kind: 'vorlage' as const, key: `rv-${v.citation}`, vorlage: v }))
})

const rows = computed<Row[]>(() => {
  const out: Row[] = []
  if (art.value !== 'verordnung') {
    for (const d of data.value?.items ?? []) out.push({ kind: 'me', key: `me-${d.gp}-${d.inr}`, draft: d })
  }
  if (art.value !== 'ministerialentwurf') {
    for (const c of risData.value?.items ?? []) out.push({ kind: 'ris', key: `ris-${c.id}`, item: c })
  }
  out.push(...vorlageRows.value)
  return out.sort((a, b) =>
    sort.value === 'stellungnahmen' ? compareByStatements(a, b) : compareDrafts(orderOf(a), orderOf(b)),
  )
})

/**
 * Die geordneten Zeilen, durch die eine Anatomie geschickt (§12.28).
 *
 * Die Trennung ist Absicht und sie ist die Lehre aus den sechs
 * Komponenten, die das hier ersetzt: `rows` entscheidet, WAS in welcher
 * Reihenfolge dasteht — mit drei Zeilenarten, die ihre eigenen Typen
 * behalten (§12.19) —, und der Adapter entscheidet, WIE jede Art auf die
 * vier Zonen fällt. Vorher lag beides in je zwei Komponenten pro Art, und
 * deshalb konnte dieselbe Zahl in einer Liste an sechs Stellen stehen.
 */
const entries = computed(() =>
  rows.value.map((row) =>
    row.kind === 'me'
      ? viewOfDraft(row.draft)
      : row.kind === 'ris'
        ? viewOfRis(row.item)
        : viewOfVorlage(row.vorlage),
  ),
)

/* ------------------------------------------------------------------ *
 * Die zweite Hälfte der Suche: der Volltext (§12.31)
 * ------------------------------------------------------------------ */

/**
 * EIN FELD, ZWEI ANTWORTEN — seit 21.09.2026, und die zweite verhindert den
 * Fehlschluss, den das Feld allein erzeugt.
 *
 * Das Feld durchsucht Titel, Zitat, Debattennamen und das Ressortkürzel
 * (den Ressort-NAMEN seit 21.09.2026 nicht mehr — er trug das ganze
 * Portfolio und traf unsichtbar, siehe `server/utils/search/searchHaystack.ts`). Ein Titel
 * sagt aber nicht, was ein Sammelgesetz alles ändert: Wer „Klimaschutz"
 * eingibt und zwei Zeilen bekommt, schließt „mehr ist es nicht" — und sieht
 * nicht, dass ein dritter, offener Entwurf das Wort in seinem § 6 führt.
 * Ein falsches Negativ, das der Leser nicht bemerken kann.
 *
 * Bis dahin hing dafür ein Link auf `/suche` an dieser Seite, und das war
 * dieselbe Sache zweimal an zwei Orten — genau das Argument, mit dem am
 * 17.09. die zwei Listen eine wurden (§12.19). Erst ging der Link, am
 * 22.09. die Seite: Eine zweite Adresse für dieselbe Frage ist das, was
 * hier abgeschafft wurde, also durfte sie auch nicht unverlinkt
 * weiterlaufen. `/suche` 301t seither hierher.
 *
 * WAS NICHT VERSCHMILZT, ist die Regel und die Menge:
 *
 *  - **Andere Regel.** Die Liste sucht als Teilstring über Metadaten, das
 *    RIS ganze Wörter mit UND und `*` über die Dokumente. „Klimaschutz"
 *    trifft den TITEL „Klimaschutzgesetz" und denselben Wortstamm im TEXT
 *    nur mit Stern. Dieselbe Eingabe, zwei Regeln — also zwei benannte
 *    Antworten, nie eine gepoolte Liste.
 *  - **Andere Menge.** Die Liste führt eine ganze Gesetzgebungsperiode,
 *    offen wie abgeschlossen; der Volltext kennt nur, was HEUTE offen ist
 *    (7 bis 25 Sätze). Deshalb steht er unter der Liste und heißt
 *    „außerdem", nicht „auch".
 *  - **Anderer Preis.** Der Listenfilter kostet nichts und antwortet
 *    sofort; der Volltext kostet einen RIS-Aufruf (0,2–2,1 s) plus die
 *    Dokumente für die Fundstelle. Also eigene, längere Verzögerung, eine
 *    Mindestlänge, clientseitig und lazy — er hält die Liste nie auf.
 */
const FULLTEXT_MIN_LEN = 3
const FULLTEXT_DEBOUNCE_MS = 700

/** Die laufende Periode ist die neueste, die die Filter kennen. */
const currentGp = computed(() => availableGps.value[0] ?? '')

/**
 * Kann der Volltext unter diesen Filtern überhaupt etwas sagen?
 *
 * Er kennt nur die laufenden Begutachtungen. Unter „Abgeschlossen", in
 * einer alten Periode und unter einer Station NACH der Begutachtung gibt es
 * nichts, wonach er suchen könnte — und ein Block laufender Verfahren würde
 * dort dem Filter widersprechen, den der Leser gesetzt hat. Statt dessen
 * sagt eine Zeile über der Liste, dass hier nur die Titel durchsucht sind.
 *
 * Art und Ressort stehen NICHT in dieser Bedingung: Sie schließen keine
 * Suche aus, sie schneiden die Treffer (`fullTextHits`).
 */
const fullTextApplies = computed(() => {
  if (statusFilter.value === 'closed') return false
  if (gp.value && currentGp.value && gp.value !== currentGp.value) return false
  if (stations.value.length && !stations.value.includes('begutachtung')) return false
  return true
})

/**
 * Der Begriff, der ans RIS geht — mit eigener Verzögerung.
 *
 * 700 ms statt der 300 der Liste, und erst ab drei Zeichen: Jeder Wert hier
 * ist ein Aufruf ans RIS samt bis zu zwölf nachgeladenen Dokumentsätzen.
 * Die Liste filtert unterdessen weiter bei jedem Tastendruck.
 */
const fullTextTerm = ref('')
let fullTextTimer: ReturnType<typeof setTimeout> | undefined

function scheduleFullText(delay = FULLTEXT_DEBOUNCE_MS): void {
  clearTimeout(fullTextTimer)
  const term = q.value.trim()
  if (!fullTextApplies.value || term.length < FULLTEXT_MIN_LEN) {
    fullTextTerm.value = ''
    return
  }
  if (term === fullTextTerm.value) return
  fullTextTimer = setTimeout(() => {
    fullTextTerm.value = term
  }, delay)
}

watch([q, fullTextApplies], () => scheduleFullText())
/* Ein geteilter Link bringt den Begriff in der URL mit — der hat keine
 * Tipppause, auf die man warten müsste. */
onMounted(() => scheduleFullText(0))
onUnmounted(() => clearTimeout(fullTextTimer))

/**
 * Clientseitig, lazy und von Hand ausgelöst.
 *
 * `watch: false` plus `execute()`: sonst liefe bei jedem geleerten Feld eine
 * leere Suche ans RIS. `execute()` bricht die laufende Anfrage ab, wer also
 * weitertippt, wartet nie auf die vorige Antwort.
 */
const {
  data: fullText,
  status: fullTextStatus,
  error: fullTextError,
  execute: runFullText,
  clear: clearFullText,
} = await useFetch<BegutSearchResponse>('/api/suche', {
  query: { q: fullTextTerm },
  server: false,
  lazy: true,
  immediate: false,
  watch: false,
})

watch(fullTextTerm, (term) => {
  if (term) runFullText()
  else clearFullText()
})

/** Ob unter der Liste überhaupt eine Volltext-Antwort steht. */
const fullTextActive = computed(
  () => fullTextApplies.value && qDebounced.value.length >= FULLTEXT_MIN_LEN,
)
/**
 * Zwischen der Listen-Verzögerung und der eigenen liegen 400 ms, in denen
 * die Antwort von vorhin noch dasteht. Sie gehört zu einem anderen Wort,
 * also ist sie hier „wird gesucht", nicht „gefunden".
 */
const fullTextPending = computed(
  () =>
    fullTextActive.value &&
    (fullTextTerm.value !== qDebounced.value || fullTextStatus.value === 'pending'),
)

/** Die Treffer, die die aktiven Filter überstehen — Art und Ressort. */
const fullTextHits = computed<BegutSearchHit[]>(() =>
  (fullText.value?.hits ?? []).filter((hit) => {
    if (art.value === 'verordnung' && hit.entry.kind === 'draft') return false
    if (art.value === 'ministerialentwurf' && hit.entry.kind === 'ris') return false
    if (ministry.value) {
      const code =
        hit.entry.kind === 'draft' ? hit.entry.draft.ministryCode : hit.entry.consultation.ministryCode
      if ((code ?? '').toUpperCase() !== ministry.value.toUpperCase()) return false
    }
    return true
  }),
)

const fullTextViews = computed(() =>
  fullTextHits.value.map((hit) => ({
    hit,
    view: hit.entry.kind === 'draft' ? viewOfDraft(hit.entry.draft) : viewOfRis(hit.entry.consultation),
  })),
)

/**
 * Ein Entwurf, zweimal getroffen, steht EINMAL da.
 *
 * Wer den Titeltreffer und den Volltexttreffer als zwei Zeilen zeigt, hat
 * aus einer Auskunft einen Dublettenverdacht gemacht. Also: Was die Liste
 * schon führt, bekommt den Beleg an seiner Zeile — dort ist er der Zugewinn
 * („das Wort steht in § 6") —, und nur der Rest wird zur eigenen Liste
 * darunter. Der Schlüssel kommt aus demselben Adapter wie die Zeile
 * (`entryView`), damit die beiden Hälften nie auseinanderlaufen.
 */
const listedKeys = computed(() => new Set(entries.value.map((e) => e.key)))
/** Ein Schlüssel, ein Beleg — für beide Listen dieselbe Karte. */
const hitByKey = computed(() => new Map(fullTextViews.value.map((v) => [v.view.key, v.hit])))
const fullTextExtra = computed(() => fullTextViews.value.filter((v) => !listedKeys.value.has(v.view.key)))
/** Die Zeilen der zweiten Liste — als Computed, nicht als `.map()` im Prop:
 *  Ein Array, das die Vorlage baut, ist bei jedem Rendern ein neues. */
const fullTextExtraEntries = computed(() => fullTextExtra.value.map((v) => v.view))
const fullTextInList = computed(() => fullTextViews.value.length - fullTextExtra.value.length)
/**
 * WAS DIE FILTER WEGGENOMMEN HABEN, und warum das eine eigene Zahl ist.
 *
 * Gemessen beim Fahren der Seite am 21.09.2026: Unter „Verordnungsentwürfe"
 * sagte dieser Block „‚Klimaschutz' kommt in den Dokumenten der 9 laufenden
 * Begutachtungen nicht vor" — und das Wort kam in dreien vor, der Art-Filter
 * hatte sie entfernt. Eine Aussage über den Korpus, wo der Leser nur seinen
 * eigenen Filter gesehen hat: genau die Sorte Satz, die dieses Produkt nie
 * erfinden darf (§12.13). Also wird beides getrennt gezählt und getrennt
 * gesagt — samt dem Weg zurück.
 */
const fullTextFilteredOut = computed(
  () => (fullText.value?.hits.length ?? 0) - fullTextHits.value.length,
)

/**
 * Wie viele Begutachtungen durchsucht wurden, im Genitiv. „Kommt in DIE 7
 * Begutachtungen nicht vor" stand einmal da, bis die gerenderte Seite es
 * zeigte: Ein Werkzeug, das über Gesetzestexte spricht, darf seinen eigenen
 * Satz nicht falsch beugen.
 */
const fullTextCorpus = computed(() => {
  const n = fullText.value?.corpusSize ?? 0
  return n === 1 ? 'der einen laufenden Begutachtung' : `der ${n} laufenden Begutachtungen`
})

/**
 * Each kind counted on its own, never summed.
 *
 * A single "336 Entwürfe" would put the Stellungnahmen figures of a third of
 * the rows over all of them. The search placeholder does name the total,
 * because there it is a statement about the search scope rather than about
 * the corpus.
 */
const meTotal = computed(() => data.value?.total ?? 0)
const risTotal = computed(() => risData.value?.total ?? 0)
const visibleTotal = computed(
  () => (art.value === 'verordnung' ? 0 : meTotal.value) + (art.value === 'ministerialentwurf' ? 0 : risTotal.value),
)
/* Die Stationskarte kostet beim kalten Bau hunderte Abrufe und kann
 * ausfallen (`server/utils/parliament/stationMap.ts`). Dann steht hier, dass nicht
 * gefiltert wurde — eine Liste, die unter einem aktiven Filter ungefiltert
 * dasteht, ist die eine Variante, die niemand bemerkt. */
/* Stationen und „Verordnungsentwürfe" schließen einander aus: die einen
 * haben keinen Gegenstand im Parlament, die anderen sind die Frage danach.
 * Statt „Keine Entwürfe gefunden" — was nach einem zu engen Suchbegriff
 * klingt — sagt die Seite in diesem Fall, dass die Kombination selbst leer
 * ist, und bietet den Weg hinaus an. */
/* Wie viele Zeilen der Liste gerade die zweite Runde sind — die Entwürfe mit
 * offenem Vorlagen-Formular plus die Vorlagen ohne Begutachtung. Gezählt, um
 * es über der Liste sagen zu können: wer von der Startseite kommt, hat dort
 * „Zweite Runde" als Abschnitt gesehen und sucht ihn hier. Er ist nicht weg,
 * er ist einsortiert. */
const secondRoundRowCount = computed(
  () =>
    (data.value?.items ?? []).filter((d) => d.chain?.filingOpen).length + vorlageRows.value.length,
)

/* Eine Station NACH der Begutachtung schließt die Verordnungsentwürfe aus:
 * ohne Gegenstand im Parlament gibt es keine Regierungsvorlage. Unter
 * „Begutachtung" ist die Kombination dagegen sinnvoll — dort stehen sie. */
/**
 * Nur Stationen gewählt, die ein Satz OHNE Gegenstand im Parlament nicht
 * erreichen kann — und das sind seit 19.09.2026 nur noch zwei.
 *
 * „Alles außer Begutachtung" war die Regel, solange die Verordnungshälfte
 * nach der Frist nirgends mehr auftauchte. Sie wird aber kundgemacht, in
 * Teil II des Bundesgesetzblatts (§12.32), und unter „Bundesgesetzblatt"
 * stehen jetzt 159 Zeilen der laufenden Periode. Der Hinweis „Diese Auswahl
 * passt nicht zu Verordnungsentwürfen" stand eine Version lang ÜBER genau
 * diesen Zeilen.
 *
 * `rv` und `parlament` bleiben unerreichbar, und das ist kein Datenmangel,
 * sondern das Verfahren.
 */
const laterStationsOnly = computed(
  () =>
    stations.value.length > 0 &&
    !stations.value.includes('begutachtung') &&
    !stations.value.includes('bgbl'),
)
const stationConflict = computed(() => laterStationsOnly.value && art.value === 'verordnung')

/* Zwei Gründe, warum an den Zeilen keine Station steht, und sie sagen
 * Grundverschiedenes: die Karte war gerade nicht abrufbar (vorübergehend,
 * liegt an uns) – oder die Periode verknüpft ihre Entwürfe gar nicht erst
 * mit Vorlagen (dauerhaft, liegt am Archiv, §12.27). Nur der zweite Fall
 * braucht die Erklärung auch ohne aktiven Stationsfilter, weil dort sonst
 * eine ganze Spalte wortlos verschwindet. */
const chainUnlinkedPeriod = computed(() => data.value?.chainCoverage === 'unlinked')

const stationsUnavailable = computed(
  () =>
    data.value !== null &&
    data.value?.stationsAvailable === false &&
    !chainUnlinkedPeriod.value &&
    stations.value.length > 0,
)

const countLabel = computed(() => {
  const parts: string[] = []
  if (art.value !== 'verordnung') {
    parts.push(countLabelDe(meTotal.value, 'Ministerialentwurf', 'Ministerialentwürfe'))
  }
  /* Dritter Term, nie addiert (§12.19): eine Regierungsvorlage ohne
   * Begutachtung ist weder ein Ministerialentwurf noch ein Verordnungsentwurf
   * — wer sie in eine der beiden Zahlen schlüge, behauptete über sie, was für
   * die andere Hälfte gilt. Steht vor dem Stationsfilter-Ausstieg, weil diese
   * Zeilen unter „Regierungsvorlage" sehr wohl mitkommen. */
  /* Der Zusatz „ohne Begutachtung" nur, wenn er für JEDE gezählte Zeile
   * belegt ist. Er ist die Summenform derselben Aussage, die in der Zeile
   * steht, und darf deshalb auch nicht weiter reichen: sobald eine Vorlage
   * dabei ist, deren Vorgeschichte nur unbelegt ist (`unknown`), zählt die
   * Zahl die Zeilen und behauptet nichts über sie. */
  if (vorlageRows.value.length) {
    const count = countLabelDe(vorlageRows.value.length, 'Regierungsvorlage', 'Regierungsvorlagen')
    const allChecked = vorlageRows.value.every(
      (row) => row.kind === 'vorlage' && row.vorlage.consultation.kind === 'none',
    )
    parts.push(allChecked ? `${count} ohne Begutachtung` : count)
  }
  /* Unter einem Stationsfilter zählt die Verordnungs-Hälfte nicht mit — weder
   * als „0" noch als „gerade nicht abrufbar". Beides wäre eine Antwort auf
   * eine Frage, die gar nicht gestellt wurde: sie ist nicht leer und auch
   * nicht kaputt, sie gehört zu dieser Achse nicht dazu. Der Satz über der
   * Liste sagt, warum. */
  if (laterStationsOnly.value) return parts.join(' · ')
  /* Dasselbe Substantiv wie im Art-Filter, und zwar damit die beiden
   * Zahlen auf der Seite nicht zweierlei zählen können. „ohne Gegenstand im
   * Parlament" war die Kategorie der Parlamentsseite, nicht die dieser
   * Liste — und sie stand neben einem Kasten, der eine Join-Statistik
   * unter demselben Wort führte. */
  if (art.value !== 'ministerialentwurf') {
    parts.push(
      risError.value
        ? 'die Verordnungsentwürfe sind gerade nicht abrufbar'
        : `${formatNumberDe(risTotal.value)} ${ART_VERORDNUNG_NOUN}`,
    )
  }
  return parts.join(' · ')
})

/* Selects are TokenSelect (native <select> in token styling with the
 * page-wide chevron) — see that component for why not USelect. */
</script>

<template>
  <div class="mx-auto w-full max-w-4xl">
    <header>
      <h1 class="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
        Entwürfe
      </h1>
      <p class="mt-2 max-w-prose text-ink-secondary">
        Alle Begutachtungen einer Gesetzgebungsperiode – in Begutachtung und
        abgeschlossen, Gesetzes- wie Verordnungsentwürfe.
      </p>
      <!-- HIER STAND BIS 21.09.2026 DER WEG ZUR SUCHE — ein Link auf
           `/suche` samt zwei Sätzen darüber, was dort anders ist als im
           Feld weiter unten. Er ist weg, weil das Feld weiter unten seither
           beides tut (§12.31): Ein Hinweis, der erklärt, welche der zwei
           Suchen dieser Seite man gerade benutzt, ist die Bedienungsanleitung
           für eine Trennung, die es nicht mehr geben muss. -->
    </header>

    <div v-if="status === 'pending' && !data" class="mt-10">
      <LoadingState label="Entwürfe werden geladen …" />
    </div>
    <div v-else-if="error" class="mt-10">
      <ErrorState @retry="refresh()" />
    </div>
    <template v-else-if="data">
      <!-- KEIN Erklärkasten mehr, seit 18.09.2026. Er stand zwischen der
           Überschrift und den Filtern — auf 390 px acht Zeilen Prosa über
           die Herkunft der Daten, bevor irgendeine Zeile der Liste zu sehen
           war —, und er erklärte, was die Zeilen inzwischen selbst sagen:
           jede trägt ihr Typwort und, wo es keine Stellungnahmen gibt,
           warum („nicht gezählt", §12.28).
           Das Verfahren dahinter steht auf /so-funktionierts.

           Seine Zahlen mussten ohnehin weg. „201 Entwürfe ohne Gegenstand
           gegen 134 mit einem" las sich als Korpuszahl, war aber eine
           Join-Statistik: `withGegenstand` zählt RIS-Sätze, denen ein
           Ministerialentwurf zugeordnet werden konnte, die Zeile 40 px
           darunter zählt Ministerialentwürfe der Liste 81 — am 18.09.2026
           134 gegen 135. Beide Zahlen stimmen, die Differenz ist der
           dokumentierte Fall eines ME ohne RIS-Satz (`docs/ris-join.md`
           §2). Richtig hinschreiben ließe sich das nur mit einem Nebensatz,
           den niemand liest. -->

      <!-- Die Stationsleiste steht ÜBER der Statusleiste und damit zuerst:
           „wo steht es" ist die gröbere Frage, „was kann ich tun" schneidet
           quer hinein. Mehrfachauswahl, weil zwei Stationen nebeneinander
           eine sinnvolle Frage sind („Vorlage oder schon Gesetz?") und weil
           nichts auswählen bereits „alle" heißt — ein Chip „Alle" wäre ein
           vierter Zustand für etwas, das der leere Zustand schon sagt. -->
      <!-- Weg, wo die Periode die Frage nicht beantworten kann (§12.27):
           ein Chip, der nichts filtern kann, ist kein Bedienelement, sondern
           ein Versprechen. Der Satz über den Zeilen sagt, warum. -->
      <!-- Zwei Zonen, und die Grenze ist eine Regel, keine Optik: alles, was
           die MENGE festlegt, steht über der Zählzeile; was nur bestimmt, WIE
           sie gelesen wird — die Sortierung —, steht bei der Liste. Die Regel
           dahinter ist die schärfere Fassung von „nichts über dem
           Bedienelement ändern": jede Zahl auf der Seite beschreibt die
           Menge, die die Bedienelemente ÜBER ihr definieren. Deshalb bleibt
           die Suche das letzte Element dieser Zone — ihr Platzhalter nennt
           die Korpusgröße, und eine Zahl, die von Reglern unter ihr abhinge,
           wäre falsch, sobald jemand sie benutzt. -->
      <div class="group mt-6">
        <!-- `sr-only`, nicht `hidden`: die Checkbox muss ein Element bleiben,
             das `:checked` treffen kann — `peer-checked` am Panel und
             `group-has-[:checked]` an der Zahl hängen daran. Ab md entscheidet
             ohnehin `md:block` am Panel, und der Schalter verschwindet dort
             mit seinem Label. -->
        <input
          id="filter-more"
          v-model="filtersOpen"
          type="checkbox"
          class="peer sr-only md:hidden"
          aria-controls="filter-more-panel"
        >
        <label
          for="filter-more"
          class="tap-target inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-hairline bg-surface px-3 text-sm text-ink hover:border-baseline md:hidden"
        >
          <UIcon
            name="i-lucide-sliders-horizontal"
            class="size-4 text-ink-muted"
            aria-hidden="true"
          />
          Weitere Filter
          <!-- Nur zugeklappt: aufgeklappt sagen die Chips und die Selects
               selbst, was an ist, und die Zahl stünde dann über den
               Bedienelementen, die sie zählt.
               `group-has-*` statt `peer-checked`, weil die Zahl im Label
               steckt und damit kein Geschwister der Checkbox ist — `peer-*`
               erreicht nur Geschwister, `group-*` erreicht Nachfahren
               (dasselbe Muster wie `group-open` an den <details>-Blöcken der
               Seite).
               Und `[input:checked]` statt des kurzen `group-has-checked`:
               `:checked` trifft auch die ausgewählte `<option>` — und drei
               <select> im Panel haben immer eine. Mit `:has(:checked)` galt
               die Gruppe deshalb IMMER als aufgeklappt und die Zahl war nie
               zu sehen; am 18.09.2026 so gemessen, bevor sie je jemand
               bemerkt hätte. -->
          <span
            v-if="moreFilters"
            class="rounded-full bg-accent-deep px-2 py-0.5 text-xs font-medium text-white group-has-[input:checked]:hidden"
          >{{ moreFilters }}</span>
        </label>

        <div id="filter-more-panel" class="mt-3 hidden space-y-3 peer-checked:block md:mt-0 md:block">
          <!-- Die Stationsleiste steht zuerst: „wo steht es" ist die gröbere
               Frage, „was kann ich tun" schneidet quer hinein (§12.26).
               Mehrfachauswahl, weil zwei Stationen nebeneinander eine
               sinnvolle Frage sind („Vorlage oder schon Gesetz?") und weil
               nichts auswählen bereits „alle" heißt — ein Chip „Alle" wäre
               ein vierter Zustand für etwas, das der leere Zustand schon
               sagt.
               Weg, wo die Periode die Frage nicht beantworten kann (§12.27):
               ein Chip, der nichts filtern kann, ist kein Bedienelement,
               sondern ein Versprechen. Der Satz über den Zeilen sagt, warum. -->
          <!-- Kein sichtbares „Wo steht es:" mehr vor den Chips (18.09.2026).
               Die vier Wörter sind die Stationen selbst — wer „Begutachtung ·
               Regierungsvorlage · Parlament · Bundesgesetzblatt" nebeneinander
               sieht, liest die Achse aus ihren Werten. Der Name bleibt als
               `aria-label` an der Gruppe: für ein Vorleseprogramm sind die
               Chips sonst vier Knöpfe ohne Zusammenhang. -->
          <div
            v-if="!chainUnlinkedPeriod"
            role="group"
            aria-label="Wo steht es"
            class="flex flex-wrap items-center gap-2"
          >
            <UButton
              v-for="opt in stationOptions"
              :key="opt.value"
              size="sm"
              :color="stations.includes(opt.value) ? 'primary' : 'neutral'"
              :variant="stations.includes(opt.value) ? 'subtle' : 'outline'"
              :aria-pressed="stations.includes(opt.value)"
              class="rounded-full"
              @click="toggleStation(opt.value)"
            >
              {{ opt.label }}
            </UButton>
            <UButton
              v-if="stations.length"
              size="sm"
              color="neutral"
              variant="ghost"
              class="rounded-full"
              @click="stations = []"
            >
              Alle Stationen
            </UButton>
          </div>

          <!-- Feste Spuren statt `flex-wrap`, und `block` an jedem Select.
               Ein natives <select> misst sich an seiner LÄNGSTEN Option: „Alle
               Arten" stand 267 px breit da, weil „Verordnungsentwürfe und
               andere" darunter in der Liste steht, „Nach Frist" 202 px wegen
               „Meiste Stellungnahmen". Zusammen beanspruchten die vier
               Selects 837 von 896 px, und wo die Leiste umbrach, entschied
               der Zufall des Fensters statt der Entwurf. Jetzt entscheidet
               das Raster: 272 + 112 + 256 px plus 24 px Lücken = 664 von
               896. -->
          <div class="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,17rem)_minmax(0,7rem)_minmax(0,16rem)]">
            <div class="min-w-0">
              <label for="filter-art" class="sr-only">Art des Entwurfs</label>
              <TokenSelect id="filter-art" v-model="art" block>
                <option v-for="opt in artOptions" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </option>
              </TokenSelect>
            </div>

            <div class="min-w-0">
              <label for="filter-gp" class="sr-only">Gesetzgebungsperiode</label>
              <TokenSelect id="filter-gp" v-model="selectedGp" block>
                <option v-for="g in availableGps" :key="g" :value="g">
                  GP {{ g }}
                </option>
              </TokenSelect>
            </div>

            <div class="min-w-0">
              <label for="filter-ministry" class="sr-only">Ministerium</label>
              <TokenSelect id="filter-ministry" v-model="ministry" block>
                <option value="">Alle Ministerien</option>
                <option v-for="m in ministries" :key="m.code" :value="m.code">
                  {{ m.name || m.code }}
                </option>
              </TokenSelect>
            </div>
          </div>
        </div>

        <!-- Die zweite Achse, und sie bleibt auf dem Telefon sichtbar: „wo
             kann ich jetzt etwas sagen" ist die Frage, mit der jemand
             ankommt (§12.26). Ihre drei Optionen erklären sich selbst; der
             Achsenname steht nur noch als `aria-label` da.
             Sie teilt sich die Zeile mit der Suche, und das ist kein Rückfall
             in die alte Leiste: die Suche steht rechts von ihr, also in der
             Lesereihenfolge NACH ihr, und ihr Platzhalter darf weiter die
             Menge zählen, die die Regler darüber und links von ihr übrig
             gelassen haben. Unter md brechen beide untereinander — das
             Segment misst 338 px, die Zeile 358.
             `mt-5` gegen die `space-y-3` INNERHALB des Panels: hier verläuft
             eine Gruppengrenze — Eingrenzung oben, die zweite Achse und die
             Suche unten —, und mit denselben 12 px wie zwischen Chips und
             Selects klebte das Segment am Schalter „Weitere Filter". -->
        <div class="mt-5 flex flex-wrap items-center gap-3">
          <UFieldGroup role="group" aria-label="Was kann ich tun" class="shrink-0">
            <UButton
              v-for="opt in statusOptions"
              :key="opt.value"
              :color="statusFilter === opt.value ? 'primary' : 'neutral'"
              :variant="statusFilter === opt.value ? 'subtle' : 'outline'"
              :aria-pressed="statusFilter === opt.value"
              @click="statusFilter = opt.value"
            >
              {{ opt.label }}
            </UButton>
          </UFieldGroup>

          <!-- Zuletzt in dieser Zone, und das ist die Regel, nicht der
               Geschmack: der Platzhalter nennt die Korpusgröße (Vertrauens-
               signal nach kleineAnfragen) und zählt damit, was die Regler
               DARÜBER übrig gelassen haben. Über sie gestellt, stünde dort
               eine Zahl, die von Bedienelementen unter ihr abhängt.
               Sie bekommt jetzt den ganzen Rest der Zeile statt eines
               Streifens: das Feld SCHRUMPFTE bisher, je breiter das Fenster
               wurde — 720 px bei 768, 366 px bei 896 —, weil es sich dort
               eine Zeile mit Ressort und Sortierung teilte. Beide stehen
               nicht mehr hier.
               `min-w-80` und nicht `min-w-48`: mit 192 px Mindestbreite passt
               das Feld schon bei 640 px neben das 338 px breite Segment und
               stand dort dann 242 px schmal da — schmaler als bei 430 px, wo
               es die ganze Zeile hat. Das ist dieselbe Krankheit wie vorher,
               nur an einer neuen Stelle. Mit 320 px umbricht es stattdessen,
               bis wirklich Platz ist (ab ~700 px), und wird von da an nur
               noch breiter. -->
          <UInput
            v-model="q"
            type="search"
            icon="i-lucide-search"
            :placeholder="`In ${countLabelDe(visibleTotal, 'Entwurf', 'Entwürfen')} suchen …`"
            aria-label="Entwürfe durchsuchen"
            class="min-w-80 flex-1"
            :ui="{ base: 'min-h-11' }"
          />
        </div>
      </div>

      <!-- Die Zählzeile und die Sortierung auf einer Höhe, und das ist die
           Grenze zwischen den beiden Zonen: darüber steht, was die Menge
           FESTLEGT, hier steht, wie sie GELESEN wird.
           Die Sortierung stand bis 18.09.2026 zwischen Ressort und Suche,
           mit derselben Token-Optik wie die drei Filter daneben — nichts
           unterschied dort das Bedienelement, das etwas wegnimmt, von dem,
           das nur umreiht. Sie gehört zur Liste: „Bedienelemente, die
           ändern, WIE das Ergebnis gelesen wird, gehören zu der Liste, die
           sie filtern" (§12.26 / die Regel aus dem Stationswähler). Sie
           nimmt nichts weg, also ändert sie die Zählzeile daneben auch
           nicht — der Satz über die Verordnungsentwürfe, den sie auslöst,
           steht unter ihr.
           `aria-live` bleibt allein an der Zahl: läge der Wähler in der
           Region, läse ein Screenreader bei jeder Sortierung die Zahl neu
           vor, die sich gar nicht geändert hat. -->
      <div class="mt-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p class="text-sm text-ink-muted" aria-live="polite">
          {{ countLabel }}
        </p>
        <div class="flex min-w-0 items-center gap-2">
          <label for="filter-sort" class="shrink-0 text-sm text-ink-secondary">Sortieren</label>
          <TokenSelect id="filter-sort" v-model="sort">
            <option v-for="opt in sortOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </TokenSelect>
        </div>
      </div>

      <!-- Abonnieren steht hier, nicht mehr im Footer, und bewusst AUSSERHALB
           der Live-Region darüber: sonst liest ein Screenreader die Einladung
           bei jedem Tastendruck in der Suche mit vor. Zwei Angebote, nach
           dem, was die Filterleiste gerade sagt — der Ressort-Filter ist der
           Moment, in dem jemand entscheidet „dieses Ressort verfolge ich“. -->
      <p class="mt-1 text-sm text-ink-muted">
        <template v-if="ministry">
          <a
            :href="`/feed.xml?ressort=${ministry}`"
            class="tap-target rounded font-medium text-accent-deep underline underline-offset-2 hover:no-underline"
          >RSS-Feed für dieses Ministerium</a>
          ·
        </template>
        <a
          :href="webcalUrl"
          class="tap-target rounded font-medium text-accent-deep underline underline-offset-2 hover:no-underline"
        >Fristen-Kalender abonnieren</a>
        (Apple/Outlook) ·
        <ExternalLink
          :href="googleCalUrl"
          class="tap-target rounded font-medium text-accent-deep underline underline-offset-2 hover:no-underline"
        >Google Kalender</ExternalLink>
        ·
        <a
          href="/feed.xml"
          class="tap-target rounded font-medium text-accent-deep underline underline-offset-2 hover:no-underline"
        >RSS</a>
        – ohne Konto, ohne Tracking.
      </p>

      <h2 class="sr-only">Ergebnisse</h2>
      <!-- Wie die Sortier-Einschränkung darunter: eine Aussage darüber, was
           die Liste gerade NICHT tut, steht über den Zeilen — hinterher
           gelesen ist sie wertlos. -->
      <p v-if="stationsUnavailable" class="mt-3 max-w-prose text-sm text-ink-muted">
        Wo die Entwürfe stehen, lässt sich gerade nicht abrufen – die Liste
        ist deshalb <span class="font-medium text-ink">nicht</span> nach
        Station gefiltert.
      </p>
      <!-- Die Lücke wird benannt, statt sie als Befund auszugeben: ohne
           diesen Satz läse eine Liste ohne Stationen sich, als wäre aus
           keinem dieser Entwürfe je etwas geworden (§12.27). -->
      <p v-if="chainUnlinkedPeriod" class="mt-3 max-w-prose text-sm text-ink-muted">
        Was aus diesen Entwürfen wurde, ist für diese Gesetzgebungsperiode
        nicht erfasst – der Bezug zwischen Ministerialentwurf und
        Regierungsvorlage fehlt im Datenbestand. Die Zeilen zeigen deshalb
        keine Station; dass es keine Regierungsvorlagen gab, folgt daraus
        <span class="font-medium text-ink">nicht</span>.<template v-if="stations.length">
          Nach Station ist hier deshalb auch
          <span class="font-medium text-ink">nicht</span> gefiltert.</template>
      </p>
      <!-- Die Einschränkung gilt nur für die Stationen NACH der Begutachtung:
           dorthin kommt nichts ohne Gegenstand im Parlament. Unter
           „Begutachtung" stehen die Verordnungsentwürfe sehr wohl mit — sie
           dort wegzulassen kostete die Startseiten-Parität (4 statt 7 unter
           „Begutachtung + Stellungnahme möglich") und ließ drei laufende
           Verordnungs-Begutachtungen verschwinden. -->
      <p
        v-else-if="laterStationsOnly && art !== 'ministerialentwurf'"
        class="mt-3 max-w-prose text-sm text-ink-muted"
      >
        <template v-if="stationConflict">
          <span class="font-medium text-ink">Verordnungsentwürfe haben keine
            Station:</span>
          Sie führen keinen Gegenstand im Parlament, also auch keine
          Regierungsvorlage. „Alle Arten" oder
          <button
            type="button"
            class="tap-target rounded font-medium text-accent-deep underline underline-offset-2 hover:no-underline"
            @click="stations = []"
          >alle Stationen</button>
          zeigen wieder Zeilen.
        </template>
        <template v-else>
          Verordnungsentwürfe stehen hier nicht: Ohne Gegenstand im Parlament
          gibt es keine Regierungsvorlage – ihr Weg endet mit der Begutachtung.
        </template>
      </p>
      <!-- Die Antwort auf „wo ist die zweite Runde?" — die Frage, mit der
           jemand von der Startseite kommt, wo sie ein eigener Abschnitt ist.
           Hier ist sie einsortiert, nach Dringlichkeit wie alles andere, und
           jede dieser Zeilen trägt ihren Chip. Nur unter „Stellungnahme
           möglich", weil die Aussage nur dort über die ganze Liste gilt. -->
      <p
        v-if="statusFilter === 'open' && secondRoundRowCount"
        class="mt-3 max-w-prose text-sm text-ink-muted"
      >
        Darunter
        <span class="font-medium text-ink">{{ secondRoundRowCount }} in zweiter Runde</span>:
        Die Begutachtung ist vorbei, im Nationalrat kann zur Regierungsvorlage
        weiter Stellung genommen werden. {{ SECOND_ROUND_WINDOW }}
      </p>
      <!-- Was die Sortierung mit der Hälfte macht, die sie nicht sortieren
           kann — über der Liste, nicht darunter: eine Einschränkung an dem,
           was die Reihenfolge behauptet, muss gelesen sein, bevor die Zeilen
           gelesen sind. -->
      <p
        v-if="sort === 'stellungnahmen' && art !== 'ministerialentwurf'"
        class="mt-3 max-w-prose text-sm text-ink-muted"
      >
        Verordnungsentwürfe und andere führen keine Stellungnahmen – sie
        stehen hinter den gereihten Zeilen, weiter nach Frist geordnet.
      </p>
      <!-- DIE GRENZE DER SUCHE, an der Stelle, an der sie jemanden betrifft:
           Unter diesen Filtern ist NUR nach Titel gesucht, weil der Volltext
           nichts kennt, was nicht gerade läuft. Über der Liste, wie jede
           andere Aussage darüber, was sie gerade nicht tut. -->
      <p
        v-if="qDebounced.length >= FULLTEXT_MIN_LEN && !fullTextApplies"
        class="mt-3 max-w-prose text-sm text-ink-muted"
      >
        Gesucht ist hier nur in Titel, Zitat, Debattennamen und Ressortkürzel. In
        den Dokumenten selbst wird nur gesucht, solange eine Begutachtung
        <span class="font-medium text-ink">läuft</span> – unter diesen Filtern
        also nicht.
      </p>
      <!-- Zwei Dichten und der Spaltenkopf stecken seit 18.09.2026 in
           `EntryList` — dieselbe Liste rendert jetzt auch die Startseite,
           und der Kopf muss mit den Zellen in `EntryItem` auf das Pixel
           fluchten (§12.28). -->
      <EntryList v-if="entries.length" :entries="entries" class="mt-3">
        <!-- Nur die Zeilen, die AUCH im Volltext getroffen wurden, tragen
             einen Beleg: der Zugewinn an einer Zeile, die ohnehin dasteht
             („das Wort steht in § 6"), statt einer zweiten Zeile für
             denselben Entwurf. -->
        <template #evidence="{ entry }">
          <SearchEvidence :hit="hitByKey.get(entry.key)" />
        </template>
      </EntryList>
      <template v-else-if="!stationConflict">
        <!-- LEERE LISTE, ABER NICHT LEERE SEITE: Solange der Volltext unten
             noch antwortet, wäre die große Karte „Keine Entwürfe gefunden"
             eine Behauptung über eine Antwort, die es noch gar nicht gibt.
             Dann sagt eine Zeile, was die Titelsuche ergeben hat, und der
             Block darunter sagt den Rest. -->
        <p v-if="fullTextActive" class="mt-3 max-w-prose text-ink-secondary">
          Kein Titel, kein Zitat, kein Debattenname und kein Ressortkürzel
          trägt „{{ qDebounced }}“.
        </p>
        <!-- Die Beschreibung nennt die vier Felder, statt „Titel" zu sagen:
             „Klimaschutz" liefert hier neun Zeilen, alle über den
             RESSORTNAMEN (BMK), keine über ein Dokument — wer glaubt,
             gesucht werde im Titel, hält das für einen Titeltreffer. -->
        <div v-else class="mt-3">
          <EmptyState
            title="Keine Entwürfe gefunden"
            :description="
              qDebounced
                ? 'Dieses Feld durchsucht Titel, Zitat, Debattennamen und Ressortkürzel. Nach dem Ressort filtert die Auswahl daneben.'
                : 'Andere Filter oder einen anderen Suchbegriff versuchen.'
            "
          />
        </div>
      </template>

      <!-- DIE ZWEITE ANTWORT DESSELBEN FELDES (§12.31). Eigener Abschnitt
           mit eigener Überschrift, nie in die Liste gemischt: Sie sucht in
           einer ganzen Gesetzgebungsperiode nach Titeln, dieser Block in den
           Dokumenten dessen, was heute offen ist. -->
      <section v-if="fullTextActive" class="mt-8">
        <h2 class="text-lg font-semibold text-ink">
          Außerdem im Volltext der laufenden Begutachtungen
        </h2>
        <!-- Der Stern steht hier und nicht am Feld: Er gilt für DIESE
             Hälfte — das RIS sucht ganze Wörter, die Liste oben sucht als
             Teilstring. Ein Bedienhinweis gehört zu dem, was er ändert. -->
        <p class="mt-1 max-w-prose text-sm text-ink-muted">
          Alle Dokumente eines Entwurfs – Text, Erläuterungen,
          Gegenüberstellung, Anhänge. Gesucht werden ganze Wörter,
          <code>Klima*</code> findet auch zusammengesetzte.
        </p>

        <LoadingState v-if="fullTextPending" label="Im Volltext wird gesucht …" />
        <!-- EIN FEHLER IST KEINE ANTWORT (§12.13): „kommt nicht vor" wäre
             hier die teuerste Lüge des Produkts. -->
        <p v-else-if="fullTextError" class="mt-3 max-w-prose text-sm text-ink-secondary">
          Im Volltext konnte gerade nicht gesucht werden – das RIS hat nicht
          geantwortet. Die Liste oben ist davon nicht betroffen.
        </p>
        <template v-else-if="fullText">
          <EntryList v-if="fullTextExtra.length" :entries="fullTextExtraEntries" class="mt-3">
            <template #evidence="{ entry }">
              <SearchEvidence :hit="hitByKey.get(entry.key)" />
            </template>
          </EntryList>
          <p v-else-if="fullTextInList" class="mt-3 max-w-prose text-sm text-ink-secondary">
            Alle Volltext-Treffer stehen schon in der Liste oben – jeder mit
            seiner Fundstelle.
          </p>
          <!-- ZWEI DINGE AUF EINMAL: Die leere Antwort nennt die
               Korpusgröße — „nichts gefunden" heißt etwas anderes bei 9
               offenen Verfahren als bei 700 —, und „kommt nicht vor" ist
               eine Aussage über den Korpus, steht also nur da, wenn das RIS
               wirklich nichts hatte. Was die Filter weggenommen haben, sagt
               die Zeile darunter. -->
          <p
            v-else-if="!fullTextFilteredOut"
            class="mt-3 max-w-prose text-sm text-ink-secondary"
          >
            „{{ qDebounced }}“ kommt in den Dokumenten {{ fullTextCorpus }}
            nicht vor. Das Archiv bis 2004 durchsucht das
            <ExternalLink href="https://www.ris.bka.gv.at/Begut/">RIS selbst</ExternalLink>.
          </p>
          <p v-if="fullTextFilteredOut" class="mt-3 max-w-prose text-sm text-ink-secondary">
            <span class="font-medium text-ink">Ausgeblendet:</span>
            {{ countLabelDe(fullTextFilteredOut, 'laufende Begutachtung', 'laufende Begutachtungen') }},
            die „{{ qDebounced }}“ im Volltext
            {{ fullTextFilteredOut === 1 ? 'führt' : 'führen' }} – Art oder Ressort
            schließen sie aus.
            <button
              type="button"
              class="tap-target rounded font-medium text-accent-deep underline underline-offset-2 hover:no-underline"
              @click="art = ''; ministry = ''"
            >Alle Arten und Ressorts</button>
            zeigen sie.
          </p>
        </template>
      </section>

    </template>
  </div>
</template>

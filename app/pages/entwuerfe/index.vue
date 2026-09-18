<script setup lang="ts">
import type {
  DashboardSecondRound,
  DraftStation,
  DraftStatus,
  DraftSummary,
  DraftsResponse,
  OpenVorlage,
  RisConsultation,
  RisConsultationsResponse,
} from '#shared/types'
import { compareDrafts, draftOrderKey, type OrderedDraft } from '#shared/utils/draftOrder'
import { romanToInt } from '#shared/utils/gp'

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

const stationOptions: { value: DraftStation; label: string }[] = [
  { value: 'begutachtung', label: 'Begutachtung' },
  { value: 'rv', label: 'Regierungsvorlage' },
  { value: 'parlament', label: 'Parlament' },
  { value: 'bgbl', label: 'Bundesgesetzblatt' },
]
const STATION_VALUES = stationOptions.map((o) => o.value)

function parseStations(v: unknown): DraftStation[] {
  const raw = firstQueryValue(v) ?? ''
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is DraftStation => (STATION_VALUES as string[]).includes(s))
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

const { webcalUrl } = useFeedUrls()

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
 * Abschnitt. Suche: dieselbe Substring-Regel wie oben.
 */
const vorlageRows = computed<Row[]>(() => {
  const list = secondRound.value
  if (!list || statusFilter.value === 'closed' || art.value === 'verordnung' || ministry.value) return []
  if (stations.value.length && !stations.value.includes('rv')) return []
  if (selectedGp.value && selectedGp.value !== list.gp) return []
  const needle = qDebounced.value.toLowerCase()
  return list.items
    .filter((v) => !v.draft)
    .filter((v) => !needle || `${v.title} ${v.citation}`.toLowerCase().includes(needle))
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
 * ausfallen (`server/utils/stationMap.ts`). Dann steht hier, dass nicht
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
const laterStationsOnly = computed(
  () => stations.value.length > 0 && !stations.value.includes('begutachtung'),
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
  if (vorlageRows.value.length) {
    parts.push(
      `${countLabelDe(vorlageRows.value.length, 'Regierungsvorlage', 'Regierungsvorlagen')} ohne Begutachtung`,
    )
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
           warum („Stellungnahme direkt ans Ministerium", `risFilingNote`).
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
      <div v-if="!chainUnlinkedPeriod" class="mt-6 flex flex-wrap items-center gap-2">
        <span class="mr-1 text-sm text-ink-secondary">Wo steht es:</span>
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

      <div class="mt-3 flex flex-wrap items-center gap-3">
        <UFieldGroup role="group" aria-label="Status" class="shrink-0">
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

        <div class="min-w-0">
          <label for="filter-art" class="sr-only">Art des Entwurfs</label>
          <TokenSelect id="filter-art" v-model="art">
            <option v-for="opt in artOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </TokenSelect>
        </div>

        <div class="min-w-0">
          <label for="filter-gp" class="sr-only">Gesetzgebungsperiode</label>
          <TokenSelect id="filter-gp" v-model="selectedGp">
            <option v-for="g in availableGps" :key="g" :value="g">
              GP {{ g }}
            </option>
          </TokenSelect>
        </div>

        <div class="min-w-0 max-w-64">
          <label for="filter-ministry" class="sr-only">Ministerium</label>
          <TokenSelect id="filter-ministry" v-model="ministry">
            <option value="">Alle Ministerien</option>
            <option v-for="m in ministries" :key="m.code" :value="m.code">
              {{ m.name || m.code }}
            </option>
          </TokenSelect>
        </div>

        <!-- Die Sortierung steht bei den Filtern, weil sie dasselbe tut:
             sie formt die Liste darunter. Ganz rechts vor der Suche, weil
             sie als einziges Bedienelement hier nichts wegnimmt. -->
        <div class="min-w-0">
          <label for="filter-sort" class="sr-only">Sortierung</label>
          <TokenSelect id="filter-sort" v-model="sort">
            <option v-for="opt in sortOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </TokenSelect>
        </div>

        <!-- The corpus size in the placeholder is the trust signal
             (kleineAnfragen pattern) — and it tracks the active filters,
             which is what q actually searches within. -->
        <UInput
          v-model="q"
          type="search"
          icon="i-lucide-search"
          :placeholder="`In ${countLabelDe(visibleTotal, 'Entwurf', 'Entwürfen')} suchen …`"
          aria-label="Suche"
          class="min-w-48 flex-1"
          :ui="{ base: 'min-h-11' }"
        />
      </div>

      <p class="mt-6 text-sm text-ink-muted" aria-live="polite">
        {{ countLabel }}
      </p>

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
        weiter Stellung genommen werden – ohne veröffentlichte Frist, sie endet
        mit der Abstimmung.
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
      <!-- Two densities, CSS-switched (SSR-safe, no JS): generous cards on
           mobile, a dense divider-list on md+ where scanning 100+ items
           is the job. Each kind keeps its own card and row — the shared
           thing is the order, not the shape. -->
      <ul v-if="rows.length" class="mt-3 space-y-3 md:hidden">
        <li v-for="row in rows" :key="row.key">
          <DraftCard v-if="row.kind === 'me'" :draft="row.draft" />
          <SecondRoundCard v-else-if="row.kind === 'vorlage'" :vorlage="row.vorlage" />
          <RisConsultationCard v-else :consultation="row.item" />
        </li>
      </ul>
      <div
        v-if="rows.length"
        class="mt-3 hidden overflow-hidden rounded-xl border border-hairline bg-surface md:block"
      >
        <ul class="divide-y divide-hairline">
          <li v-for="row in rows" :key="`row-${row.key}`">
            <DraftRow v-if="row.kind === 'me'" :draft="row.draft" />
            <SecondRoundRow v-else-if="row.kind === 'vorlage'" :vorlage="row.vorlage" />
            <RisConsultationRow v-else :consultation="row.item" />
          </li>
        </ul>
      </div>
      <div v-if="!rows.length && !stationConflict" class="mt-3">
        <EmptyState
          title="Keine Entwürfe gefunden"
          description="Andere Filter oder einen anderen Suchbegriff versuchen."
        />
      </div>

    </template>
  </div>
</template>

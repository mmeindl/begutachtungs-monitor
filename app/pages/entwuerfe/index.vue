<script setup lang="ts">
import type {
  DraftStatus,
  DraftSummary,
  DraftsResponse,
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
    'Alle Begutachtungen: Ministerialentwürfe mit Gegenstand im Parlament und Verordnungsentwürfe, die nur im RIS erscheinen – filterbar nach Art, Status, Gesetzgebungsperiode und Ressort.',
})

const route = useRoute()
const router = useRouter()

const statusOptions: { value: DraftStatus; label: string }[] = [
  { value: 'all', label: 'Alle' },
  { value: 'open', label: 'In Begutachtung' },
  { value: 'closed', label: 'Abgeschlossen' },
]

/**
 * The filter is by WHERE a draft stands in the procedure, not by the type
 * word on its title — that is the distinction the two halves actually differ
 * in, and the only one the data supports without a classifier.
 *
 * `verordnung` therefore selects all 201 records without a Gegenstand, of
 * which 198 are Verordnungen and the rest are drafts that likewise never
 * reached Parliament. The label says "u. a." rather than pretending, each
 * row carries its own type word, and the box below states the rule. The
 * value is spelled `verordnung` because that is the word a reader would
 * type, and `/weitere-entwuerfe` redirects onto it.
 */
type ArtFilter = '' | 'ministerialentwurf' | 'verordnung'
const artOptions: { value: ArtFilter; label: string }[] = [
  { value: '', label: 'Alle Arten' },
  { value: 'ministerialentwurf', label: 'Ministerialentwürfe' },
  { value: 'verordnung', label: 'Verordnungsentwürfe u. a.' },
]

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
  '/api/weitere-entwuerfe',
  { query, timeout: 8000 },
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
watch([query, art], () => {
  const urlQuery: Record<string, string> = {}
  if (statusFilter.value !== 'all') urlQuery.status = statusFilter.value
  if (art.value) urlQuery.art = art.value
  if (gp.value) urlQuery.gp = gp.value
  if (ministry.value) urlQuery.ministry = ministry.value
  if (qDebounced.value) urlQuery.q = qDebounced.value
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

function orderOf(row: Row): OrderedDraft {
  return row.kind === 'me' ? draftOrderKey(row.draft) : row.item
}

const rows = computed<Row[]>(() => {
  const out: Row[] = []
  if (art.value !== 'verordnung') {
    for (const d of data.value?.items ?? []) out.push({ kind: 'me', key: `me-${d.gp}-${d.inr}`, draft: d })
  }
  if (art.value !== 'ministerialentwurf') {
    for (const c of risData.value?.items ?? []) out.push({ kind: 'ris', key: `ris-${c.id}`, item: c })
  }
  return out.sort((a, b) => compareDrafts(orderOf(a), orderOf(b)))
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
const countLabel = computed(() => {
  const parts: string[] = []
  if (art.value !== 'verordnung') {
    parts.push(countLabelDe(meTotal.value, 'Ministerialentwurf', 'Ministerialentwürfe'))
  }
  if (art.value !== 'ministerialentwurf') {
    parts.push(
      risError.value
        ? 'die Entwürfe ohne Gegenstand im Parlament sind gerade nicht abrufbar'
        : `${formatNumberDe(risTotal.value)} ohne Gegenstand im Parlament`,
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
      <!-- The one thing a reader has to know to read this list: the rows are
           two kinds, and only one of them can ever carry Stellungnahmen.
           Stated once, here, instead of being implied by an empty column. -->
      <p class="mt-4 max-w-prose rounded-lg border border-hairline bg-surface p-4 text-sm text-ink-secondary">
        Zwei Arten von Zeilen. Zu einem
        <span class="font-medium text-ink">Ministerialentwurf</span> führt das
        Parlament einen Gegenstand – es gibt Stellungnahmen, Einbringer und
        den weiteren Weg bis zum Gesetz. Die übrigen, vor allem
        <span class="font-medium text-ink">Verordnungsentwürfe</span>,
        veröffentlichen die Ministerien nur im Rechtsinformationssystem
        (RIS): dort nennt niemand, wer Stellung genommen hat, und eine
        Stellungnahme geht direkt an das Ressort.
        <template v-if="risData && risData.gpTotal">
          In dieser Periode sind das
          <span class="font-semibold tabular-nums text-ink">{{ formatNumberDe(risData.gpTotal) }}</span>
          Entwürfe ohne Gegenstand gegen
          <span class="font-semibold tabular-nums text-ink">{{ formatNumberDe(risData.withGegenstand) }}</span>
          mit einem.
        </template>
      </p>

      <div class="mt-6 flex flex-wrap items-center gap-3">
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
          <label for="filter-ministry" class="sr-only">Ressort</label>
          <TokenSelect id="filter-ministry" v-model="ministry">
            <option value="">Alle Ressorts</option>
            <option v-for="m in ministries" :key="m.code" :value="m.code">
              {{ m.name || m.code }}
            </option>
          </TokenSelect>
        </div>

        <!-- The corpus size in the placeholder is the trust signal
             (kleineAnfragen pattern) — and it tracks the active filters,
             which is what q actually searches within. -->
        <UInput
          v-model="q"
          type="search"
          :placeholder="`In ${countLabelDe(visibleTotal, 'Entwurf', 'Entwürfen')} suchen …`"
          aria-label="Suche"
          class="min-w-48 flex-1"
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
          >RSS-Feed für dieses Ressort</a>
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
      <!-- Two densities, CSS-switched (SSR-safe, no JS): generous cards on
           mobile, a dense divider-list on md+ where scanning 100+ items
           is the job. Each kind keeps its own card and row — the shared
           thing is the order, not the shape. -->
      <ul v-if="rows.length" class="mt-3 space-y-3 md:hidden">
        <li v-for="row in rows" :key="row.key">
          <DraftCard v-if="row.kind === 'me'" :draft="row.draft" />
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
            <RisConsultationRow v-else :consultation="row.item" />
          </li>
        </ul>
      </div>
      <div v-if="!rows.length" class="mt-3">
        <EmptyState
          title="Keine Entwürfe gefunden"
          description="Andere Filter oder einen anderen Suchbegriff versuchen."
        />
      </div>
    </template>
  </div>
</template>

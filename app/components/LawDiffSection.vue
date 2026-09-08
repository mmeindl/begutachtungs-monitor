<script setup lang="ts">
/**
 * "Was sich nach der Begutachtung geändert hat" — the § comparison between
 * draft and Regierungsvorlage (docs/ris-join.md §6). Framing rule: shows
 * both what moved and what stayed, never a blame counter. Loaded lazily on
 * the client: the first request per consultation fetches and parses two
 * documents, and the page must not wait for that.
 */
import type { LawDiffResponse, LawDiffUnit } from '#shared/types'

const props = defineProps<{ gp: string; inr: number }>()

const { data, status } = await useFetch<LawDiffResponse>(() => `/api/consultations/${props.gp}/${props.inr}/diff`, {
  lazy: true,
  server: false,
})

const open = ref<Set<string>>(new Set())
/** The list can run to 70+ rows; it opens on request, the summary stands alone. */
const listOpen = ref(false)

type Filter = 'alle' | 'geändert' | 'neu' | 'entfallen' | 'unverändert'
const filter = ref<Filter>('alle')
const query = ref('')

const FILTER_CHANGE: Record<Exclude<Filter, 'alle'>, LawDiffUnit['change']> = {
  geändert: 'changed',
  neu: 'inserted',
  entfallen: 'removed',
  unverändert: 'unchanged',
}
const filterOptions = computed<{ value: Filter; label: string; count: number }[]>(() => {
  const s = data.value?.stats
  if (!s) return []
  return [
    { value: 'alle', label: 'alle', count: s.total },
    { value: 'geändert', label: 'geändert', count: s.changed },
    { value: 'neu', label: 'neu', count: s.inserted },
    { value: 'entfallen', label: 'entfallen', count: s.removed },
    { value: 'unverändert', label: 'unverändert', count: s.unchanged },
  ].filter((o) => o.value === 'alle' || o.count > 0) as { value: Filter; label: string; count: number }[]
})

function key(u: LawDiffUnit): string {
  return `${u.article ?? ''}|${u.id}|${u.change}`
}
function toggle(u: LawDiffUnit) {
  const k = key(u)
  const next = new Set(open.value)
  if (next.has(k)) next.delete(k)
  else next.add(k)
  open.value = next
}

const visibleUnits = computed(() => {
  const q = query.value.trim().toLowerCase()
  return (data.value?.units ?? []).filter((u) => {
    if (filter.value !== 'alle' && u.change !== FILTER_CHANGE[filter.value]) return false
    if (!q) return true
    return [u.id, u.meId, u.heading, u.article, u.meText, u.rvText].some((t) => t?.toLowerCase().includes(q))
  })
})

/**
 * One group per Gesetz (article of the package). 32/ME has 330 units in
 * three laws; a flat list is unreadable, so every law folds. A single-law
 * text has no group header and is open.
 */
interface ArticleGroup {
  article: string
  units: LawDiffUnit[]
  /** `changed` excludes editorial units, so the pills add up to the group's total like the rows do */
  counts: Record<LawDiffUnit['change'] | 'editorial', number>
}

type Badge = LawDiffUnit['change'] | 'editorial'

/** One pill style for rows and group summaries alike. */
const BADGE_CLASS: Record<Badge, string> = {
  changed: 'bg-accent-50 text-accent-deep',
  editorial: 'bg-page text-ink-muted',
  unchanged: 'bg-page text-ink-muted',
  inserted: 'bg-mark-wash text-ink',
  removed: 'border border-hairline text-ink-secondary line-through',
}
const BADGE_LABEL: Record<Badge, string> = {
  changed: 'geändert',
  editorial: 'redaktionell',
  unchanged: 'unverändert',
  inserted: 'neu',
  removed: 'entfallen',
}
const BADGE_ORDER: Badge[] = ['changed', 'editorial', 'inserted', 'removed', 'unchanged']

function badgeOf(u: LawDiffUnit): Badge {
  return isMinor(u) ? 'editorial' : u.change
}
const groups = computed<ArticleGroup[]>(() => {
  const out: ArticleGroup[] = []
  const byArticle = new Map<string, ArticleGroup>()
  for (const u of visibleUnits.value) {
    const key = u.article ?? ''
    let g = byArticle.get(key)
    if (!g) {
      g = { article: key, units: [], counts: { unchanged: 0, changed: 0, editorial: 0, inserted: 0, removed: 0 } }
      byArticle.set(key, g)
      out.push(g)
    }
    g.units.push(u)
    g.counts[badgeOf(u)]++
  }
  return out
})
const multiLaw = computed(() => new Set((data.value?.units ?? []).map((u) => u.article ?? '')).size > 1)
const openGroups = ref<Set<string>>(new Set())
function toggleGroup(article: string) {
  const next = new Set(openGroups.value)
  if (next.has(article)) next.delete(article)
  else next.add(article)
  openGroups.value = next
}
function groupOpen(g: ArticleGroup): boolean {
  return !multiLaw.value || openGroups.value.has(g.article) || query.value.trim().length > 0
}
function groupBadges(g: ArticleGroup): { badge: Badge; count: number }[] {
  return BADGE_ORDER.filter((b) => g.counts[b] > 0).map((b) => ({ badge: b, count: g.counts[b] }))
}

/** Server-decided: every changed piece is a citation, number, date or punctuation. */
function isMinor(u: LawDiffUnit): boolean {
  return u.editorial
}

const CHANGE_LABEL: Record<LawDiffUnit['change'], string> = {
  unchanged: 'unverändert',
  changed: 'geändert',
  inserted: 'neu',
  removed: 'entfallen',
}

/** A Novelle has no §§ of its own; its units are the numbered amendment instructions. */
const isNovelle = computed(() => {
  const units = data.value?.units ?? []
  return units.length > 0 && units.every((u) => /^Z\d/.test(u.id))
})
const hasZiffern = computed(() => (data.value?.units ?? []).some((u) => /^Z\d/.test(u.id)))

const summarySentence = computed(() => {
  const s = data.value?.stats
  if (!s) return ''
  const parts: string[] = []
  if (s.changed) parts.push(s.editorial ? `${s.changed} geändert (davon ${s.editorial} nur redaktionell)` : `${s.changed} geändert`)
  if (s.inserted) parts.push(`${s.inserted} neu`)
  if (s.removed) parts.push(`${s.removed} entfallen`)
  if (s.unchanged) parts.push(`${s.unchanged} unverändert`)
  const noun = isNovelle.value ? 'Änderungsanordnungen' : hasZiffern.value ? 'Einheiten' : 'Paragraphen'
  return `${s.total} ${noun}: ${parts.join(', ')}.`
})

/** "§5" → "§ 5", "Z3" → "Z 3" */
function displayId(id: string): string {
  return id.replace(/^§/, '§ ').replace(/^Z(\d)/, 'Z $1')
}

</script>

<template>
  <div class="mt-8">
    <h3 class="text-base font-semibold text-ink">Was sich nach der Begutachtung geändert hat</h3>

    <p v-if="status === 'pending' || status === 'idle'" class="mt-1 text-sm text-ink-secondary">
      Der Gesetzestext des Entwurfs wird mit dem der Regierungsvorlage verglichen …
    </p>

    <p v-else-if="status === 'error' || !data" class="mt-1 text-sm text-ink-secondary">
      Der Vergleich ist gerade nicht verfügbar.
    </p>

    <template v-else-if="!data.available">
      <p class="mt-1 text-sm text-ink-secondary">{{ data.unavailableReason }}</p>
    </template>

    <template v-else>
      <p class="mt-1 text-sm text-ink-secondary">
        <template v-if="isNovelle">
          Dieser Entwurf ändert ein bestehendes Gesetz. Verglichen werden
          deshalb die nummerierten Änderungsanordnungen (Z 1, Z 2 …), jede
          sagt, was an welcher Stelle des geltenden Gesetzes geändert wird.
        </template>
        <template v-else-if="hasZiffern">
          Paragraph für Paragraph, Entwurf gegen Regierungsvorlage. Wo der
          Entwurf ein bestehendes Gesetz ändert, sind die Einheiten die
          nummerierten Änderungsanordnungen (Z 1, Z 2 …).
        </template>
        <template v-else>Paragraph für Paragraph, Entwurf gegen Regierungsvorlage.</template>
        Ob eine Änderung auf eine Stellungnahme zurückgeht, sagt der Text
        nicht; die Erläuterungen der Regierungsvorlage oft schon.
        „Redaktionell“ heißt: Es haben sich nur Verweise, Zahlen, Daten oder
        Satzzeichen geändert, kein einziges Wort.
      </p>
      <p class="mt-2 text-sm text-ink">{{ summarySentence }}</p>

      <div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
        <span>Quellen (CC BY 4.0, Parlament):</span>
        <ExternalLink v-if="data.me" :href="data.me.url" class="text-accent-deep hover:underline">{{ data.me.label }}</ExternalLink>
        <ExternalLink v-if="data.rv" :href="data.rv.url" class="text-accent-deep hover:underline">{{ data.rv.label }}</ExternalLink>
      </div>

      <UButton
        color="neutral"
        variant="outline"
        class="mt-4 min-h-11"
        :trailing-icon="listOpen ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
        :aria-expanded="listOpen"
        @click="listOpen = !listOpen"
      >
        {{ listOpen ? 'Liste ausblenden' : `Alle ${data.stats.total} ${isNovelle ? 'Änderungsanordnungen' : 'Paragraphen'} anzeigen` }}
      </UButton>

      <template v-if="listOpen">
        <!-- Same controls as the Stellungnahmen panel below: one joined
             segmented group, primary-subtle for the active state, and the
             group scrolls sideways on narrow screens instead of wrapping. -->
        <div class="mt-4 flex flex-wrap items-center gap-2">
          <div class="min-w-0 max-w-full overflow-x-auto">
            <UFieldGroup role="group" aria-label="Änderungen nach Art filtern">
              <UButton
                v-for="o in filterOptions"
                :key="o.value"
                :color="filter === o.value ? 'primary' : 'neutral'"
                :variant="filter === o.value ? 'subtle' : 'outline'"
                :aria-pressed="filter === o.value"
                class="min-h-11"
                @click="filter = o.value"
              >
                {{ o.label }} <span class="tabular-nums opacity-70">{{ o.count }}</span>
              </UButton>
            </UFieldGroup>
          </div>
          <UInput
            v-model="query"
            type="search"
            icon="i-lucide-search"
            placeholder="Im Text suchen …"
            aria-label="Im Text suchen"
            class="ml-auto min-w-56 flex-1 sm:flex-none"
            :ui="{ base: 'min-h-11' }"
          />
        </div>

        <div class="mt-3 border-y border-hairline">
          <section v-for="g in groups" :key="g.article" class="border-b border-hairline last:border-b-0">
            <button
              v-if="multiLaw"
              type="button"
              class="flex w-full min-h-11 flex-col gap-2 bg-page px-3 py-3 text-left hover:bg-hairline/40"
              :aria-expanded="groupOpen(g)"
              @click="toggleGroup(g.article)"
            >
              <span class="flex w-full items-start gap-3">
                <span class="min-w-0 flex-1 text-sm font-semibold text-ink">{{ g.article || 'Ohne Titel' }}</span>
                <UIcon
                  name="i-lucide-chevron-down"
                  class="mt-0.5 size-4 shrink-0 text-ink-muted transition-transform"
                  :class="{ 'rotate-180': groupOpen(g) }"
                  aria-hidden="true"
                />
                <span class="sr-only">{{ groupOpen(g) ? 'zuklappen' : 'aufklappen' }}</span>
              </span>
              <span class="flex flex-wrap gap-1.5">
                <span
                  v-for="b in groupBadges(g)"
                  :key="b.badge"
                  class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium tabular-nums"
                  :class="BADGE_CLASS[b.badge]"
                >
                  {{ b.count }} {{ BADGE_LABEL[b.badge] }}
                </span>
              </span>
            </button>
            <ol v-if="groupOpen(g)" class="divide-y divide-hairline" :class="{ 'border-t border-hairline': multiLaw }">
              <li v-for="u in g.units" :key="key(u)">
                <button
                  type="button"
                  class="flex w-full min-h-11 items-start gap-3 px-3 py-2 text-left hover:bg-page"
                  :aria-expanded="open.has(key(u))"
                  @click="toggle(u)"
                >
                  <span
                    class="mt-0.5 inline-flex w-24 shrink-0 justify-center rounded-full px-2 py-0.5 text-xs font-medium"
                    :class="BADGE_CLASS[badgeOf(u)]"
                  >
                    {{ BADGE_LABEL[badgeOf(u)] }}
                  </span>
                  <span class="min-w-0 flex-1 text-sm">
                    <span class="font-medium text-ink">
                      {{ displayId(u.id) }}
                      <span v-if="u.meId && u.meId !== u.id" class="font-normal text-ink-muted">(im Entwurf {{ displayId(u.meId) }})</span>
                    </span>
                    <span v-if="u.heading" class="text-ink-secondary"> {{ u.heading }}</span>
                  </span>
                  <UIcon
                    name="i-lucide-chevron-down"
                    class="mt-0.5 size-4 shrink-0 text-ink-muted transition-transform"
                    :class="{ 'rotate-180': open.has(key(u)) }"
                    aria-hidden="true"
                  />
                  <span class="sr-only">{{ open.has(key(u)) ? 'schließen' : 'ansehen' }}</span>
                </button>

                <div v-if="open.has(key(u))" class="px-3 pb-4 text-sm leading-relaxed">
                  <p v-if="u.change === 'changed' && u.segments" class="hyphens-auto text-ink">
                    <template v-for="(s, i) in u.segments" :key="i">
                      <del v-if="s.type === 'removed'" class="rounded bg-page px-0.5 text-ink-secondary line-through decoration-status-critical/70">{{ s.text }}</del>
                      <ins v-else-if="s.type === 'inserted'" class="rounded bg-mark-wash px-0.5 no-underline">{{ s.text }}</ins>
                      <span v-else>{{ s.text }}</span>
                      {{ ' ' }}
                    </template>
                  </p>
                  <div v-else-if="u.change === 'changed'" class="grid gap-4 sm:grid-cols-2">
                    <div>
                      <p class="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">Entwurf</p>
                      <p class="text-ink-secondary">{{ u.meText }}</p>
                    </div>
                    <div>
                      <p class="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">Regierungsvorlage</p>
                      <p class="text-ink">{{ u.rvText }}</p>
                    </div>
                  </div>
                  <p v-else-if="u.change === 'inserted'" class="text-ink">{{ u.rvText }}</p>
                  <p v-else-if="u.change === 'removed'" class="text-ink-secondary">{{ u.meText }}</p>
                  <p v-else class="text-ink-secondary">{{ u.rvText }}</p>
                </div>
              </li>
            </ol>
          </section>
        </div>
        <p v-if="!visibleUnits.length" class="mt-2 text-sm text-ink-secondary">
          {{ query ? 'Nichts gefunden.' : 'Keine Einträge in dieser Auswahl.' }}
        </p>
      </template>
    </template>
  </div>
</template>

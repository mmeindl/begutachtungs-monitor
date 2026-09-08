<script setup lang="ts">
/**
 * "Was sich nach der Begutachtung geändert hat" — the § comparison between
 * draft and Regierungsvorlage (docs/ris-join.md §6). Framing rule: shows
 * both what moved and what stayed, never a blame counter. Loaded lazily on
 * the client: the first request per consultation fetches and parses two
 * documents, and the page must not wait for that.
 */
import type { LawDiffResponse, LawDiffUnit } from '#shared/types'
import { droppedLawsNote, mergedLawsNote } from '#shared/utils/lawPackage'

const props = defineProps<{ gp: string; inr: number }>()

const { data, status } = await useFetch<LawDiffResponse>(() => `/api/consultations/${props.gp}/${props.inr}/diff`, {
  lazy: true,
  server: false,
})

type Badge = LawDiffUnit['change'] | 'editorial'

/** One pill style for rows and group summaries alike. */
/**
 * Red for what goes, green for what arrives — the diff convention everyone
 * has read on GitHub (Manu, 08.09.2026; the note in main.css follows). Text
 * on a wash is always `text-ink`: ink-secondary drops below 7:1 there, the
 * same reason DeadlineBadge carries full ink.
 *
 * Meaning never rides on colour alone: the pill says the state in words and
 * the gutter repeats it beside the block. The strikethrough is reserved for
 * the word-level diff, where deleted and inserted words share one sentence
 * and the line says which to skip — on a whole removed § it would only make
 * the passage this tool exists to show harder to read, and GitHub does not
 * strike removed lines either.
 */
const BADGE_CLASS: Record<Badge, string> = {
  changed: 'bg-accent-50 text-accent-deep',
  editorial: 'bg-page text-ink-muted',
  unchanged: 'bg-page text-ink-muted',
  inserted: 'bg-status-good/15 text-ink',
  removed: 'bg-status-critical/10 text-ink',
}
const BADGE_LABEL: Record<Badge, string> = {
  changed: 'geändert',
  editorial: 'redaktionell',
  unchanged: 'unverändert',
  inserted: 'neu',
  removed: 'entfallen',
}
/**
 * Strongest event first: whole paragraphs appearing or disappearing, then
 * edits deep before shallow, the unchanged baseline last — the order every
 * diff view has trained readers on. Pills and filter chips share it.
 */
const BADGE_ORDER: Badge[] = ['inserted', 'removed', 'changed', 'editorial', 'unchanged']
/**
 * The gutter repeats the pill's colour, so state reads at a glance down the
 * page: red gone, green new, blue edited, grey formalities. `mark` stays out
 * of it — it is the brand's "what became of the input" ground, and a fifth
 * colour in one row helps nobody.
 */
const GUTTER_CLASS: Record<Badge, string> = {
  changed: 'border-accent-deep/50',
  inserted: 'border-status-good',
  removed: 'border-status-critical',
  editorial: 'border-hairline',
  unchanged: 'border-hairline',
}

function badgeOf(u: LawDiffUnit): Badge {
  return isMinor(u) ? 'editorial' : u.change
}

/** Filter values are the badge kinds plus 'alle'; chips and pills share one order. */
type Filter = 'alle' | Badge
const filter = ref<Filter>('alle')
const query = ref('')

const filterOptions = computed<{ value: Filter; label: string; count: number; optionLabel: string }[]>(() => {
  const s = data.value?.stats
  if (!s) return []
  const counts: Record<Badge, number> = {
    inserted: s.inserted,
    removed: s.removed,
    changed: s.changed - (s.editorial ?? 0),
    editorial: s.editorial ?? 0,
    unchanged: s.unchanged,
  }
  // The verb sits inside the option text so the closed control reads as a
  // sentence ("Alle anzeigen (330)") without a label beside it.
  const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)
  return [
    { value: 'alle' as Filter, label: 'alle', count: s.total, optionLabel: `Alle anzeigen (${s.total})` },
    ...BADGE_ORDER.map((b) => ({ value: b as Filter, label: BADGE_LABEL[b], count: counts[b], optionLabel: `${cap(BADGE_LABEL[b])} anzeigen (${counts[b]})` })),
  ].filter((o) => o.value === 'alle' || o.count > 0)
})

function key(u: LawDiffUnit): string {
  return `${u.article ?? ''}|${u.id}|${u.change}`
}

const visibleUnits = computed(() => {
  const q = query.value.trim().toLowerCase()
  return (data.value?.units ?? []).filter((u) => {
    if (filter.value !== 'alle' && badgeOf(u) !== filter.value) return false
    if (!q) return true
    return [u.id, u.meId, u.heading, u.article, u.meText, u.rvText].some((t) => t?.toLowerCase().includes(q))
  })
})

/**
 * One group per Gesetz (article of the package), folded by default. 32/ME
 * has 330 units in three laws; a flat list is unreadable. A single-law text
 * is one group under its own title, so the page shows the summary pills and
 * one folded header until the reader asks for more.
 */
interface ArticleGroup {
  article: string
  units: LawDiffUnit[]
  /** `changed` excludes editorial units, so the pills add up to the group's total like the rows do */
  counts: Record<LawDiffUnit['change'] | 'editorial', number>
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
/**
 * Always closed, one law included: the header row is the survey (law name
 * plus the count pills), and a single law is no guarantee of a short page —
 * 58/ME is one law with 413 units. Nothing opens unasked.
 *
 * What changed on 08.09.2026 is what ONE click buys: the whole law as
 * flowing text with the changes marked, instead of a row per amendment
 * instruction that had to be opened one by one — user feedback, and the
 * argument behind it: without attribution of a change to an actor (which
 * Austria does not have), splitting the instructions apart buys nothing.
 * A search opens every group, because then the reader has named what they
 * are looking for.
 */
const openGroups = ref<Set<string>>(new Set())
function toggleGroup(article: string) {
  const next = new Set(openGroups.value)
  if (next.has(article)) next.delete(article)
  else next.add(article)
  openGroups.value = next
}
function groupOpen(g: ArticleGroup): boolean {
  return openGroups.value.has(g.article) || query.value.trim().length > 0
}
function groupBadges(g: ArticleGroup): { badge: Badge; count: number }[] {
  return BADGE_ORDER.filter((b) => g.counts[b] > 0).map((b) => ({ badge: b, count: g.counts[b] }))
}

/**
 * Blocks in reading order: every change as flowing text, runs of untouched
 * units folded into one line of context — the way a diff reads on GitHub.
 * Nothing has to be opened to be read.
 */
type Block = { kind: 'unit'; unit: LawDiffUnit } | { kind: 'context'; units: LawDiffUnit[] }

/** Changes rendered before the "show the rest" line. 74/ME has 366 of them. */
const SHOWN_CHANGES = 30

const fullyShown = ref<Set<string>>(new Set())
function showAll(article: string) {
  fullyShown.value = new Set(fullyShown.value).add(article)
}

function blocksOf(units: readonly LawDiffUnit[], article: string): { blocks: Block[]; hidden: number } {
  // Filtering or searching IS the reader asking for specific units — then
  // nothing gets folded away behind a context line.
  const folding = filter.value === 'alle' && !query.value.trim()
  const limit = fullyShown.value.has(article) ? Number.POSITIVE_INFINITY : SHOWN_CHANGES
  const blocks: Block[] = []
  let context: LawDiffUnit[] = []
  let shown = 0
  let hidden = 0
  const flush = () => {
    if (context.length) blocks.push({ kind: 'context', units: context })
    context = []
  }
  for (const u of units) {
    if (folding && badgeOf(u) === 'unchanged') {
      context.push(u)
      continue
    }
    if (shown >= limit) {
      hidden++
      continue
    }
    flush()
    blocks.push({ kind: 'unit', unit: u })
    shown++
  }
  flush()
  return { blocks, hidden }
}

const renderedGroups = computed(() => groups.value.map((g) => ({ ...g, ...blocksOf(g.units, g.article) })))

/** What one unit is called, so a context line can count them. */
function unitNoun(n: number): string {
  if (isNovelle.value) return n === 1 ? 'Änderungsanordnung' : 'Änderungsanordnungen'
  return n === 1 ? 'Paragraf' : 'Paragrafen'
}

/** Server-decided: every changed piece is a citation, number, date or punctuation. */
function isMinor(u: LawDiffUnit): boolean {
  return u.editorial
}

/** A Novelle has no §§ of its own; its units are the numbered amendment instructions. */
const isNovelle = computed(() => {
  const units = data.value?.units ?? []
  return units.length > 0 && units.every((u) => /^Z\d/.test(u.id))
})
const hasZiffern = computed(() => (data.value?.units ?? []).some((u) => /^Z\d/.test(u.id)))

/**
 * The heading, but only where it says something the block does not.
 *
 * For a § of a Stammgesetz it is the § title ("Anwendungsbereich") — real
 * information. For a Novellierungsanordnung it IS the instruction line, cut
 * at the colon or after 100 characters (`novaoHeading`): it exists so that
 * renumbered Ziffern can pair by heading, and it was the row label back when
 * the text sat behind a click. Now that every block shows its text, printing
 * a truncated copy of the same sentence above it is noise.
 */
function extraHeading(u: LawDiffUnit): string | null {
  if (!u.heading) return null
  const norm = (s: string) => s.replace(/\s*…\s*$/, '').replace(/\s+/g, ' ').trim().toLowerCase()
  const heading = norm(u.heading)
  const body = norm((u.change === 'removed' ? u.meText : u.rvText) ?? '')
  return heading && body.startsWith(heading) ? null : u.heading
}

/** "§5" → "§ 5", "Z3" → "Z 3" */
function displayId(id: string): string {
  return id.replace(/^§/, '§ ').replace(/^Z(\d)/, 'Z $1')
}

/**
 * Laws only one document carries are reported as laws, never as their
 * paragraphs: a Regierungsvorlage that merges several drafts would otherwise
 * report hundreds of paragraphs as "neu" and read as a verdict on this draft.
 * The sentences live in shared/utils/lawPackage.ts, where they are tested.
 */
const mergedNote = computed(() => mergedLawsNote(data.value?.lawsOnlyInRv ?? []))
const droppedNote = computed(() => droppedLawsNote(data.value?.lawsOnlyInMe ?? []))

</script>

<template>
  <!-- id: the outcome card above links here ("der Vergleich der beiden Texte"). -->
  <div id="textvergleich" class="mt-8 scroll-mt-24">
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
        Satzzeichen geändert, kein einziges Wort. Unveränderte Stellen sind
        eingeklappt.
      </p>

      <div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
        <span>{{ data.meSource === 'ris' ? 'Quellen (CC BY 4.0, RIS und Parlament):' : 'Quellen (CC BY 4.0, Parlament):' }}</span>
        <ExternalLink v-if="data.me" :href="data.me.url" class="text-accent-deep hover:underline">{{ data.me.label }}</ExternalLink>
        <ExternalLink v-if="data.rv" :href="data.rv.url" class="text-accent-deep hover:underline">{{ data.rv.label }}</ExternalLink>
      </div>

      <div v-if="mergedNote || droppedNote" class="mt-3 border-l-2 border-hairline pl-3 text-xs text-ink-secondary">
        <p v-if="mergedNote">{{ mergedNote }}</p>
        <p v-if="droppedNote" :class="mergedNote ? 'mt-1.5' : ''">{{ droppedNote }}</p>
      </div>

      <template v-if="data.units.length">
        <!-- One compact select instead of six chips (the counts live on the
             law headers anyway). Native <select>, not USelect — same reason
             and same token styling as the list page (Vite 8 + Nuxt UI 4.10
             hydration crash, see pages/begutachtungen/index.vue). -->
        <div class="mt-4 flex flex-wrap items-center gap-3">
          <TokenSelect v-model="filter" aria-label="Welche Paragraphen anzeigen">
            <option v-for="o in filterOptions" :key="o.value" :value="o.value">{{ o.optionLabel }}</option>
          </TokenSelect>
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
          <section v-for="g in renderedGroups" :key="g.article" class="border-b border-hairline last:border-b-0">
            <button
              type="button"
              class="flex w-full min-h-11 flex-col gap-2 bg-page px-3 py-3 text-left hover:bg-hairline/40"
              :aria-expanded="groupOpen(g)"
              @click="toggleGroup(g.article)"
            >
              <span class="flex w-full items-start gap-3">
                <span class="min-w-0 flex-1 text-sm font-semibold text-ink">{{ g.article || 'Gesetzestext' }}</span>
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
            <div v-if="groupOpen(g)" class="border-t border-hairline">
              <template v-for="(b, bi) in g.blocks" :key="bi">
                <details v-if="b.kind === 'context'" class="group border-b border-hairline last:border-b-0">
                  <summary class="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs text-ink-muted hover:bg-page [&::-webkit-details-marker]:hidden">
                    <UIcon name="i-lucide-chevron-down" class="size-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
                    {{ b.units.length }} {{ unitNoun(b.units.length) }} unverändert
                  </summary>
                  <div class="space-y-3 px-3 pb-3 pl-9 text-sm leading-relaxed text-ink-secondary">
                    <p v-for="u in b.units" :key="key(u)" class="hyphens-auto">
                      <span class="font-medium text-ink">{{ displayId(u.id) }}</span>
                      <span v-if="u.quotedHeading" class="font-medium text-ink"> {{ u.quotedHeading }}</span>
                      <span v-else-if="extraHeading(u)"> {{ extraHeading(u) }}</span>
                      <span> — {{ u.rvText }}</span>
                    </p>
                  </div>
                </details>

                <div v-else class="border-b border-hairline px-3 py-3 last:border-b-0">
                  <div class="border-l-2 pl-3" :class="GUTTER_CLASS[badgeOf(b.unit)]">
                    <p class="mb-1 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
                      <span
                        class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                        :class="BADGE_CLASS[badgeOf(b.unit)]"
                      >
                        {{ BADGE_LABEL[badgeOf(b.unit)] }}
                      </span>
                      <span class="font-medium text-ink">
                        {{ displayId(b.unit.id) }}
                        <span v-if="b.unit.meId && b.unit.meId !== b.unit.id" class="font-normal text-ink-muted">(im Entwurf {{ displayId(b.unit.meId) }})</span>
                      </span>
                      <span v-if="b.unit.quotedHeading" class="min-w-0 font-medium text-ink">{{ b.unit.quotedHeading }}</span>
                      <span v-else-if="extraHeading(b.unit)" class="min-w-0 text-ink-secondary">{{ extraHeading(b.unit) }}</span>
                    </p>

                    <p v-if="b.unit.change === 'changed' && b.unit.segments" class="hyphens-auto text-sm leading-relaxed text-ink">
                      <template v-for="(s, i) in b.unit.segments" :key="i">
                        <del v-if="s.type === 'removed'" class="rounded bg-status-critical/10 px-0.5 text-ink line-through decoration-status-critical/70">{{ s.text }}</del>
                        <ins v-else-if="s.type === 'inserted'" class="rounded bg-status-good/15 px-0.5 text-ink no-underline">{{ s.text }}</ins>
                        <span v-else>{{ s.text }}</span>
                        {{ ' ' }}
                      </template>
                    </p>
                    <div v-else-if="b.unit.change === 'changed'" class="grid gap-4 text-sm leading-relaxed sm:grid-cols-2">
                      <div>
                        <p class="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">Entwurf</p>
                        <p class="hyphens-auto text-ink-secondary">{{ b.unit.meText }}</p>
                      </div>
                      <div>
                        <p class="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">Regierungsvorlage</p>
                        <p class="hyphens-auto text-ink">{{ b.unit.rvText }}</p>
                      </div>
                    </div>
                    <p v-else-if="b.unit.change === 'inserted'" class="hyphens-auto rounded bg-status-good/15 px-2 py-1 text-sm leading-relaxed text-ink">{{ b.unit.rvText }}</p>
                    <p v-else-if="b.unit.change === 'removed'" class="hyphens-auto rounded bg-status-critical/10 px-2 py-1 text-sm leading-relaxed text-ink">{{ b.unit.meText }}</p>
                    <p v-else class="hyphens-auto text-sm leading-relaxed text-ink-secondary">{{ b.unit.rvText }}</p>
                  </div>
                </div>
              </template>

              <button
                v-if="g.hidden"
                type="button"
                class="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-accent-deep hover:bg-page"
                @click="showAll(g.article)"
              >
                <UIcon name="i-lucide-chevron-down" class="size-4 shrink-0" aria-hidden="true" />
                {{ g.hidden }} weitere {{ g.hidden === 1 ? 'Änderung' : 'Änderungen' }} anzeigen
              </button>
            </div>
          </section>
        </div>
        <p v-if="!visibleUnits.length" class="mt-2 text-sm text-ink-secondary">
          {{ query ? 'Nichts gefunden.' : 'Keine Einträge in dieser Auswahl.' }}
        </p>
      </template>
    </template>
  </div>
</template>

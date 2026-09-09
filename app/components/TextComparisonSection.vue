<script setup lang="ts">
/**
 * "Was ändert der Entwurf?" — the ressort's own Textgegenüberstellung
 * (docs/api-exploration.md §2c).
 *
 * Different question from LawDiffSection, and available much earlier. That
 * one asks what became of the draft after the Begutachtung and needs a
 * Regierungsvorlage, which arrives months later. This one asks what the
 * draft would do to the law in force, and it is there on day one — while a
 * Stellungnahme can still change something.
 *
 * The source is the ministry's annex, not a computation: no line here is
 * derived law text. Everything visual follows LawDiffSection — same badges,
 * same gutters, same folded groups — because the two sections answer
 * neighbouring questions and a second visual language would suggest a
 * difference that is not there.
 */
import type { TextComparisonResponse, TextComparisonRow } from '#shared/types'

const props = defineProps<{ gp: string; inr: number }>()

const { data, status } = await useFetch<TextComparisonResponse>(() => `/api/consultations/${props.gp}/${props.inr}/gegenueberstellung`, {
  lazy: true,
  server: false,
})

type Badge = TextComparisonRow['change'] | 'editorial'

/** Badges, gutters and order are LawDiffSection's — see the reasoning there. */
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
  removed: 'entfällt',
}
const GUTTER_CLASS: Record<Badge, string> = {
  changed: 'border-accent-deep/50',
  editorial: 'border-hairline',
  unchanged: 'border-hairline',
  inserted: 'border-status-good',
  removed: 'border-status-critical',
}
const BADGE_ORDER: Badge[] = ['inserted', 'removed', 'changed', 'editorial', 'unchanged']

function badgeOf(row: TextComparisonRow): Badge {
  return row.editorial ? 'editorial' : row.change
}

interface Group {
  /** Stable identity for the open/expanded state — the law, not its label */
  key: string
  article: string
  rows: TextComparisonRow[]
  counts: Record<Badge, number>
}

/**
 * One group per **law** of the package, not per heading the annex prints.
 *
 * Grouping by heading made one group per Abschnitt, per Hauptstück and per
 * heading over a group of §§: one draft showed 38 groups for its 5 laws.
 * `row.law` is the law the draft itself names (`annexBoundaries.ts`), so a
 * heading that divides *one* law now stands over its rows instead of
 * splitting the comparison.
 *
 * Rows the ressort abbreviated to "2. bis 26b. …" carry no text and only
 * interrupt the read, so they drop out — the context line already says how
 * much is unchanged.
 */
const groups = computed<Group[]>(() => {
  if (!data.value?.available) return []
  const out: Group[] = []
  const start = (row: TextComparisonRow): Group => {
    const group: Group = { key: row.law ?? `#${out.length}`, article: row.kind === 'article' ? (row.heading ?? '') : '', rows: [], counts: { unchanged: 0, changed: 0, editorial: 0, inserted: 0, removed: 0 } }
    out.push(group)
    return group
  }
  let current: Group | null = null
  for (const row of data.value.rows) {
    if (row.kind === 'article') {
      current = start(row)
      continue
    }
    if (row.elided) continue
    if (!current || (row.law !== null && current.key !== row.law)) current = start(row)
    current.rows.push(row)
    current.counts[badgeOf(row)]++
  }
  return out.filter((g) => g.rows.length > 0)
})

const openGroups = ref<Set<string>>(new Set())
function toggleGroup(key: string) {
  const next = new Set(openGroups.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  openGroups.value = next
}
function groupOpen(g: Group): boolean {
  return openGroups.value.has(g.key)
}
function groupBadges(g: Group): { badge: Badge; count: number }[] {
  return BADGE_ORDER.filter((b) => g.counts[b] > 0).map((b) => ({ badge: b, count: g.counts[b] }))
}

type Block = { kind: 'row'; row: TextComparisonRow } | { kind: 'context'; rows: TextComparisonRow[] }

/** Changes rendered before the "show the rest" line — LawDiffSection's cap. */
const SHOWN_CHANGES = 30

const fullyShown = ref<Set<string>>(new Set())
function showAll(key: string) {
  fullyShown.value = new Set(fullyShown.value).add(key)
}

/**
 * One block per **paragraph**, its Absätze beneath it.
 *
 * The annex prints one row per Absatz, so a § arrives as a run of rows of
 * which only the first carries the designation and the heading. Rendered row
 * by row that put the § heading over a single Absatz, repeated the
 * designation on every row that had one — and printed it twice, because the
 * text began with it as well — and set an inherited designation in a
 * different weight from an own one, which is a distinction about our parse
 * and not about the law. Collected per §, all three questions disappear:
 * designation and title stand once, on one line, the way law is printed.
 */
interface Para {
  /** "§ 40." — null for rows that precede the first designation */
  gld: string | null
  /** The annex's own heading for the paragraph */
  heading: string | null
  blocks: Block[]
}

function parasOf(g: Group): { paras: Para[]; hidden: number } {
  const limit = fullyShown.value.has(g.key) ? Number.POSITIVE_INFINITY : SHOWN_CHANGES
  const paras: Para[] = []
  let current: Para & { key: string } = { key: '\u0000', gld: null, heading: null, blocks: [] }
  let context: TextComparisonRow[] = []
  let shown = 0
  let hidden = 0
  const flush = () => {
    if (context.length) current.blocks.push({ kind: 'context', rows: context })
    context = []
  }
  for (const row of g.rows) {
    const key = row.para ?? ''
    if (current.key !== key) {
      flush()
      current = { key, gld: row.para, heading: null, blocks: [] }
      paras.push(current)
    }
    // The heading belongs to the paragraph, not to the Absatz that carries it.
    current.heading ??= row.heading
    if (row.change === 'unchanged') {
      context.push(row)
      continue
    }
    if (shown >= limit) {
      hidden++
      continue
    }
    flush()
    current.blocks.push({ kind: 'row', row })
    shown++
  }
  flush()
  return { paras: paras.filter((p) => p.blocks.length > 0), hidden }
}

const renderedGroups = computed(() => groups.value.map((g) => ({ ...g, ...parasOf(g) })))
</script>

<template>
  <div class="mt-4">
    <p v-if="status === 'pending' || status === 'idle'" class="text-sm text-ink-secondary">
      Die Textgegenüberstellung wird geladen …
    </p>

    <p v-else-if="status === 'error' || !data" class="text-sm text-ink-secondary">
      Die Gegenüberstellung ist gerade nicht verfügbar.
    </p>

    <template v-else-if="!data.available">
      <p class="text-sm text-ink-secondary">{{ data.unavailableReason }}</p>
      <!-- A scan is unreadable for us but not for a person: still link it. -->
      <p v-if="data.pdf" class="mt-3 text-xs text-ink-muted">
        <ExternalLink :href="data.pdf.url" class="text-accent-deep hover:underline">{{ data.pdf.label }}</ExternalLink>
      </p>
    </template>

    <template v-else>
      <p class="text-sm text-ink-secondary">
        Das Ressort legt dem Entwurf eine Textgegenüberstellung bei. Der Text
        stammt von dort, die Markierung von uns. „Redaktionell“ heißt: nur
        Verweise, Zahlen, Daten oder Satzzeichen.
      </p>

      <!-- Several laws in one draft, and the annex does not say where one
           ends. Shown undivided, and said so: dividing it wrongly would put
           one law's § 5 under another law's name. -->
      <p v-if="data.boundaryNote" class="mt-3 text-sm text-ink-secondary">{{ data.boundaryNote }}</p>

      <div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
        <span>Quelle (CC BY 4.0, RIS):</span>
        <ExternalLink v-if="data.source" :href="data.source.url" class="text-accent-deep hover:underline">{{ data.source.label }}</ExternalLink>
      </div>

      <div class="mt-3 border-y border-hairline">
        <section v-for="g in renderedGroups" :key="g.key" class="border-b border-hairline last:border-b-0">
          <button
            type="button"
            class="flex w-full min-h-11 flex-col gap-2 bg-page px-3 py-3 text-left hover:bg-hairline/40"
            :aria-expanded="groupOpen(g)"
            @click="toggleGroup(g.key)"
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
            <section v-for="(p, pi) in g.paras" :key="pi" class="border-b border-hairline px-3 py-3 last:border-b-0">
              <!-- The paragraph as law prints it: designation and title on one
                   line, once, above its Absätze — and no rule between the two,
                   because the line belongs to what follows it rather than
                   heading a band of its own. LawDiffSection sets a unit's
                   designation and name the same way. -->
              <p v-if="p.gld || p.heading" class="mb-1 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
                <span v-if="p.gld" class="font-medium text-ink">{{ p.gld }}</span>
                <span v-if="p.heading" class="min-w-0 text-ink-secondary">{{ p.heading }}</span>
              </p>

              <div v-for="(b, bi) in p.blocks" :key="bi" :class="bi > 0 ? 'mt-3' : ''">
              <details v-if="b.kind === 'context'" class="group">
                <summary class="flex min-h-11 cursor-pointer list-none items-center gap-2 text-xs text-ink-muted [&::-webkit-details-marker]:hidden">
                  <UIcon name="i-lucide-chevron-down" class="size-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
                  {{ b.rows.length }} {{ b.rows.length === 1 ? 'Stelle' : 'Stellen' }} unverändert
                </summary>
                <div class="mt-2 space-y-3 pl-6 text-sm leading-relaxed text-ink-secondary">
                  <p v-for="(r, ri) in b.rows" :key="ri" class="hyphens-auto">{{ r.current }}</p>
                </div>
              </details>

              <div v-else>
                <div class="border-l-2 pl-3" :class="GUTTER_CLASS[badgeOf(b.row)]">
                  <p class="mb-1 text-sm">
                    <span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium" :class="BADGE_CLASS[badgeOf(b.row)]">
                      {{ BADGE_LABEL[badgeOf(b.row)] }}
                    </span>
                  </p>

                  <p v-if="b.row.segments" class="hyphens-auto text-sm leading-relaxed text-ink">
                    <template v-for="(s, si) in b.row.segments" :key="si">
                      <del v-if="s.type === 'removed'" class="rounded bg-status-critical/10 px-0.5 text-ink line-through decoration-status-critical/70">{{ s.text }}</del>
                      <ins v-else-if="s.type === 'inserted'" class="rounded bg-status-good/15 px-0.5 text-ink no-underline">{{ s.text }}</ins>
                      <span v-else>{{ s.text }}</span>
                      {{ ' ' }}
                    </template>
                  </p>
                  <p v-else-if="b.row.change === 'inserted'" class="hyphens-auto rounded bg-status-good/15 px-2 py-1 text-sm leading-relaxed text-ink">{{ b.row.proposed }}</p>
                  <p v-else-if="b.row.change === 'removed'" class="hyphens-auto rounded bg-status-critical/10 px-2 py-1 text-sm leading-relaxed text-ink">{{ b.row.current }}</p>
                  <!-- Both sides present but the word diff was too long to compute. -->
                  <div v-else class="grid gap-4 text-sm leading-relaxed sm:grid-cols-2">
                    <div>
                      <p class="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">Geltende Fassung</p>
                      <p class="hyphens-auto text-ink-secondary">{{ b.row.current }}</p>
                    </div>
                    <div>
                      <p class="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">Vorgeschlagene Fassung</p>
                      <p class="hyphens-auto text-ink">{{ b.row.proposed }}</p>
                    </div>
                  </div>
                </div>
              </div>
              </div>
            </section>

            <button
              v-if="g.hidden"
              type="button"
              class="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-accent-deep hover:bg-page"
              @click="showAll(g.key)"
            >
              <UIcon name="i-lucide-chevron-down" class="size-4 shrink-0" aria-hidden="true" />
              {{ g.hidden }} weitere {{ g.hidden === 1 ? 'Änderung' : 'Änderungen' }} anzeigen
            </button>
          </div>
        </section>
      </div>
    </template>
  </div>
</template>

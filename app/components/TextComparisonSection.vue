<script setup lang="ts">
/**
 * "Was der Entwurf am geltenden Recht ändert" — the ressort's own
 * Textgegenüberstellung (docs/api-exploration.md §2c).
 *
 * Different question from LawDiffSection, and available much earlier. That
 * one asks what became of the draft after the Begutachtung and needs a
 * Regierungsvorlage, which arrives months later. This one asks what the
 * draft would do to the law in force, and it is there on day one — while a
 * Stellungnahme can still change something. Hence its place above.
 *
 * The source is the ministry's annex, not a computation: no line here is
 * derived law text. Loaded lazily on the client like the other comparison —
 * the first request fetches and parses a document.
 */
import type { TextComparisonResponse, TextComparisonRow } from '#shared/types'

const props = defineProps<{ gp: string; inr: number }>()

const { data, status } = await useFetch<TextComparisonResponse>(() => `/api/consultations/${props.gp}/${props.inr}/gegenueberstellung`, {
  lazy: true,
  server: false,
})

/** Same palette as the ME→RV comparison: red for what goes, green for what arrives. */
const GUTTER_CLASS: Record<TextComparisonRow['change'] | 'editorial', string> = {
  changed: 'border-accent-deep/50',
  editorial: 'border-rule',
  unchanged: 'border-rule',
  inserted: 'border-status-good',
  removed: 'border-status-critical',
}
const BADGE_CLASS: Record<TextComparisonRow['change'] | 'editorial', string> = {
  changed: 'bg-accent-50 text-accent-deep',
  editorial: 'bg-page text-ink-muted',
  unchanged: 'bg-page text-ink-muted',
  inserted: 'bg-status-good/15 text-ink',
  removed: 'bg-status-critical/10 text-ink',
}
const BADGE_LABEL: Record<TextComparisonRow['change'] | 'editorial', string> = {
  changed: 'geändert',
  editorial: 'redaktionell',
  unchanged: 'unverändert',
  inserted: 'neu',
  removed: 'entfällt',
}

function badgeOf(row: TextComparisonRow): TextComparisonRow['change'] | 'editorial' {
  return row.editorial ? 'editorial' : row.change
}

interface Group {
  heading: string | null
  rows: TextComparisonRow[]
  changed: number
}

/**
 * The annex is printed in the order of the law, grouped by Artikel. Rows the
 * ressort abbreviated to "2. bis 26b. …" carry no content and only clutter a
 * flowing read, so they drop out — the fold below already says how much is
 * unchanged.
 */
const groups = computed<Group[]>(() => {
  if (!data.value?.available) return []
  const out: Group[] = []
  let current: Group = { heading: null, rows: [], changed: 0 }
  for (const row of data.value.rows) {
    if (row.kind === 'article') {
      if (current.rows.length) out.push(current)
      current = { heading: row.heading, rows: [], changed: 0 }
      continue
    }
    if (row.elided) continue
    current.rows.push(row)
    if (row.change !== 'unchanged') current.changed++
  }
  if (current.rows.length) out.push(current)
  return out
})

const substantive = computed(() => (data.value?.stats ? data.value.stats.changed - data.value.stats.editorial + data.value.stats.inserted + data.value.stats.removed : 0))

/** Unchanged rows are context; they fold away so the changes carry the page. */
function changedRows(group: Group): TextComparisonRow[] {
  return group.rows.filter((r) => r.change !== 'unchanged')
}
function unchangedCount(group: Group): number {
  return group.rows.length - changedRows(group).length
}
</script>

<template>
  <div class="mt-4">
    <p v-if="status === 'pending' || status === 'idle'" class="mt-1 text-sm text-ink-secondary">
      Die Textgegenüberstellung des Ressorts wird geladen …
    </p>

    <p v-else-if="status === 'error' || !data" class="mt-1 text-sm text-ink-secondary">
      Die Gegenüberstellung ist gerade nicht verfügbar.
    </p>

    <template v-else-if="!data.available">
      <p class="mt-1 text-sm text-ink-secondary">{{ data.unavailableReason }}</p>
      <!-- A scan is unreadable for us but not for a person: still link it. -->
      <p v-if="data.pdf" class="mt-2 text-sm">
        <a class="link" :href="data.pdf.url" target="_blank" rel="noopener">{{ data.pdf.label }}</a>
      </p>
    </template>

    <template v-else>
      <p class="mt-1 text-sm text-ink-secondary">
        Das Ressort legt dem Entwurf eine <em>Textgegenüberstellung</em> bei:
        links das geltende Recht, rechts der Vorschlag. Diese Darstellung
        stammt aus diesem Dokument — <span class="whitespace-nowrap"><span class="rounded bg-status-critical/10 px-1 text-ink">rot</span></span>
        ist die geltende Fassung, <span class="whitespace-nowrap"><span class="rounded bg-status-good/15 px-1 text-ink">grün</span></span>
        die vorgeschlagene. Kein Wort davon ist von uns berechnet.
        „Redaktionell“ heißt: geändert haben sich nur Verweise, Zahlen, Daten
        oder Satzzeichen. Unveränderte Stellen sind eingeklappt.
      </p>

      <p class="mt-2 text-sm text-ink-secondary">
        <strong class="font-semibold text-ink">{{ substantive }}</strong>
        {{ substantive === 1 ? 'inhaltliche Änderung' : 'inhaltliche Änderungen' }}
        <template v-if="data.stats.editorial">
          und {{ data.stats.editorial }} redaktionelle
        </template>
        an {{ data.stats.total }} gegenübergestellten Stellen.
      </p>

      <div class="mt-4 space-y-4">
        <details v-for="(group, gi) in groups" :key="gi" class="rounded border border-rule bg-surface">
          <summary class="cursor-pointer list-none px-3 py-2 text-sm font-medium text-ink marker:content-none">
            <span class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span>{{ group.heading ?? 'Änderungen' }}</span>
              <span class="text-xs font-normal text-ink-muted">
                {{ group.changed }} von {{ group.rows.length }} Stellen geändert
              </span>
            </span>
          </summary>

          <div class="border-t border-rule px-3 py-3">
            <div v-for="(row, ri) in changedRows(group)" :key="ri" class="mb-3 border-l-2 pl-3 last:mb-0" :class="GUTTER_CLASS[badgeOf(row)]">
              <p class="flex flex-wrap items-baseline gap-2">
                <span v-if="row.gld" class="text-sm font-semibold text-ink">{{ row.gld }}</span>
                <span class="rounded px-1.5 py-0.5 text-xs font-medium" :class="BADGE_CLASS[badgeOf(row)]">{{ BADGE_LABEL[badgeOf(row)] }}</span>
              </p>

              <p v-if="row.segments" class="mt-1 hyphens-auto text-sm leading-relaxed text-ink">
                <template v-for="(s, si) in row.segments" :key="si">
                  <del v-if="s.type === 'removed'" class="rounded bg-status-critical/10 px-0.5 text-ink line-through decoration-status-critical/70">{{ s.text }}</del>
                  <ins v-else-if="s.type === 'inserted'" class="rounded bg-status-good/15 px-0.5 text-ink no-underline">{{ s.text }}</ins>
                  <span v-else>{{ s.text }}</span>
                  {{ ' ' }}
                </template>
              </p>
              <p v-else-if="row.change === 'inserted'" class="mt-1 hyphens-auto rounded bg-status-good/15 px-2 py-1 text-sm leading-relaxed text-ink">{{ row.proposed }}</p>
              <p v-else-if="row.change === 'removed'" class="mt-1 hyphens-auto rounded bg-status-critical/10 px-2 py-1 text-sm leading-relaxed text-ink">{{ row.current }}</p>
              <template v-else>
                <p class="mt-1 hyphens-auto text-sm leading-relaxed text-ink-secondary">{{ row.current }}</p>
                <p class="mt-1 hyphens-auto text-sm leading-relaxed text-ink">{{ row.proposed }}</p>
              </template>
            </div>

            <p v-if="unchangedCount(group)" class="mt-3 text-xs text-ink-muted">
              {{ unchangedCount(group) }}
              {{ unchangedCount(group) === 1 ? 'Stelle ist unverändert' : 'Stellen sind unverändert' }} und
              hier nicht abgedruckt.
            </p>
          </div>
        </details>
      </div>

      <p v-if="data.source" class="mt-3 text-xs text-ink-muted">
        Quelle:
        <a class="link" :href="data.source.url" target="_blank" rel="noopener">{{ data.source.label }}</a>,
        veröffentlicht im RIS.
      </p>
    </template>
  </div>
</template>

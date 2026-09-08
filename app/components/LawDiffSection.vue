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
const showUnchanged = ref(false)

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

const visibleUnits = computed(() => (data.value?.units ?? []).filter((u) => showUnchanged.value || u.change !== 'unchanged'))

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

/** Article headings only when the package has more than one law. */
const articleBefore = (idx: number): string | null => {
  const u = visibleUnits.value[idx]
  if (!u?.article) return null
  const prev = visibleUnits.value[idx - 1]
  if (prev && prev.article === u.article) return null
  const distinct = new Set(visibleUnits.value.map((x) => x.article))
  return distinct.size > 1 ? u.article : null
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
        <label class="ml-auto inline-flex min-h-11 cursor-pointer items-center gap-2">
          <input v-model="showUnchanged" type="checkbox" class="size-4 accent-accent" />
          {{ isNovelle ? 'unveränderte Änderungsanordnungen anzeigen' : 'unveränderte Paragraphen anzeigen' }}
        </label>
      </div>

      <ol class="mt-3 divide-y divide-hairline border-y border-hairline">
        <template v-for="(u, idx) in visibleUnits" :key="key(u)">
          <li v-if="articleBefore(idx)" class="bg-page px-3 py-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            {{ articleBefore(idx) }}
          </li>
          <li>
            <button
              type="button"
              class="flex w-full min-h-11 items-start gap-3 px-3 py-2 text-left hover:bg-page"
              :aria-expanded="open.has(key(u))"
              @click="toggle(u)"
            >
              <span
                class="mt-0.5 inline-flex w-20 shrink-0 justify-center rounded-full px-2 py-0.5 text-xs font-medium"
                :class="{
                  'bg-accent-50 text-accent-deep': u.change === 'changed' && !isMinor(u),
                  'bg-page text-ink-muted': u.change === 'unchanged' || isMinor(u),
                  'bg-mark-wash text-ink': u.change === 'inserted',
                  'border border-hairline text-ink-secondary line-through': u.change === 'removed',
                }"
              >
                {{ isMinor(u) ? 'redaktionell' : CHANGE_LABEL[u.change] }}
              </span>
              <span class="min-w-0 flex-1 text-sm">
                <span class="font-medium text-ink">
                  {{ displayId(u.id) }}
                  <span v-if="u.meId && u.meId !== u.id" class="font-normal text-ink-muted">(im Entwurf {{ displayId(u.meId) }})</span>
                </span>
                <span v-if="u.heading" class="text-ink-secondary"> {{ u.heading }}</span>
              </span>
              <span class="shrink-0 text-xs text-ink-muted">{{ open.has(key(u)) ? 'schließen' : 'ansehen' }}</span>
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
        </template>
      </ol>
      <p v-if="!visibleUnits.length" class="mt-2 text-sm text-ink-secondary">
        Kein Paragraph wurde geändert; der Text der Regierungsvorlage entspricht dem Entwurf.
      </p>
    </template>
  </div>
</template>

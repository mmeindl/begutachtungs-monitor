<script setup lang="ts">
/**
 * One group of a comparison section: the law it collects, the summary pills,
 * the chevron that opens it, and — once open — its body. Both sections built
 * this frame character for character; since 30.09.2026 it is one component.
 *
 * A pinned one-line bar with the law's name stood here from 30.09. to
 * 01.10.2026 and was taken out again; why was not recorded.
 *
 * Since 02.10.2026 the header itself sticks while its group is open, so
 * the group can be closed, and its law named, from anywhere inside it. 58/ME is
 * one law with 413 units, and the way back up to the chevron was the whole
 * group. It is the header, not a second bar, and CSS bounds it to its own
 * `<section>`: the next group's header pushes it out. Three things make it
 * work:
 *   - the sheet clips with `overflow-clip`, not `overflow-hidden`: hidden
 *     makes the sheet a scroll container, and the header would stick to the
 *     sheet instead of the window;
 *   - stuck, it shrinks to one line (the name truncated, the pills hidden).
 *     Two or three lines with pills are 100-130 px of a phone. A bottom margin
 *     makes up the difference, so the text under it does not jump when it
 *     shrinks;
 *   - closing it while stuck scrolls the group's top back into view. The
 *     body that goes was everything above the reader, who would otherwise
 *     land far below, in another law.
 *
 * The groups stand on a sheet since 02.10.2026, as the Stellungnahmen do:
 * a list of rows is a white card on this site, and the law text the
 * reader came for is the last thing that should sit on bare paper. The
 * header is white too, a row like any other on a sheet, with the paper tint
 * on hover. A paper band (GitHub's file header) made the collapsed list, the
 * default view, a stack of grey bars, and a different kind of list from
 * the Stellungnahmen. Where an open group starts is marked by the bold law
 * name, the chevron and the hairline under the header.
 */
import { BADGE_CLASS, UNCHECKED_PILL, type DiffBadgeCount } from '~/utils/diffBadges'

const props = defineProps<{
  /** The law or Artikel this group collects; empty where the annex names none. */
  title: string
  badges: DiffBadgeCount[]
  /** §§ the check withheld, and §§ shown that it could not reach — in the
   *  same unit as the pills (Textgegenüberstellung only). */
  withheld?: number
  unchecked?: number
  open: boolean
}>()

const emit = defineEmits<{
  toggle: []
}>()

const section = useTemplateRef<HTMLElement>('section')
const sentinel = useTemplateRef<HTMLElement>('sentinel')
const header = useTemplateRef<HTMLElement>('header')

/* Stuck = the point above the header has left the top of the viewport.
 * It stays true once the whole group has scrolled past, and that is
 * harmless: the header is gone then, and the margin keeps the layout as it was. */
const stuck = ref(false)
const restHeight = ref(0)
const stuckHeight = ref(0)
const shrinkMargin = computed(() =>
  stuck.value && restHeight.value > stuckHeight.value ? `${restHeight.value - stuckHeight.value}px` : undefined,
)

let intersection: IntersectionObserver | null = null

/* Both heights are measured at the switch, before the browser paints: the
 * rest height just before the header shrinks, the stuck one in the tick
 * after. Measured later (a ResizeObserver), the margin would be wrong for a
 * frame and the text under the header would flicker. */
function observe() {
  if (!sentinel.value || typeof IntersectionObserver === 'undefined') return
  intersection = new IntersectionObserver(([entry]) => {
    if (!entry || !header.value) return
    const next = !entry.isIntersecting && entry.boundingClientRect.top < 0
    if (next === stuck.value) return
    if (next) restHeight.value = header.value.getBoundingClientRect().height
    stuck.value = next
    if (next) {
      void nextTick(() => {
        if (header.value) stuckHeight.value = header.value.getBoundingClientRect().height
      })
    }
  })
  intersection.observe(sentinel.value)
}

function unobserve() {
  intersection?.disconnect()
  intersection = null
  stuck.value = false
}

// Only an open group can stick; a closed one is no taller than its header.
watch(() => props.open, async (open) => {
  unobserve()
  if (open) {
    await nextTick()
    observe()
  }
})
onMounted(() => {
  if (props.open) observe()
})
onBeforeUnmount(unobserve)

async function toggle() {
  const wasStuck = stuck.value && props.open
  // Where the group starts in the document; closing it changes nothing above.
  const top = wasStuck && section.value ? section.value.getBoundingClientRect().top + window.scrollY : 0
  emit('toggle')
  if (!wasStuck) return
  await nextTick()
  // Instant: a smooth glide from deep inside a now-missing body would run
  // across the following groups first.
  window.scrollTo({ top, behavior: 'instant' })
}
</script>

<template>
  <!-- `last-of-type`, not `last`: the box's status line follows the last
       group as a <p>, and the last group must still drop its rule. -->
  <section ref="section" class="border-b border-hairline last-of-type:border-b-0">
    <div ref="sentinel" class="h-px -mb-px" aria-hidden="true" />
    <!-- The hairline under a stuck header is a shadow, not a border: a
         border would make it 1px taller each time it sticks. -->
    <button
      ref="header"
      type="button"
      class="flex w-full min-h-target flex-col gap-2 bg-surface px-4 text-left hover:bg-page"
      :class="[
        open && 'sticky top-0 z-10',
        stuck ? 'py-2 shadow-[0_1px_0_var(--color-hairline)]' : 'py-3',
      ]"
      :style="{ marginBottom: shrinkMargin }"
      :aria-expanded="open"
      @click="toggle"
    >
      <span class="flex w-full items-start gap-3">
        <!-- A group without a law name is the law text itself: a single-law
             draft, or an annex that marks no boundaries. -->
        <span class="min-w-0 flex-1 text-sm font-semibold text-ink" :class="stuck && 'truncate'">{{ title || 'Gesetzestext' }}</span>
        <UIcon
          name="i-lucide-chevron-down"
          class="mt-0.5 size-4 shrink-0 text-ink-muted transition-transform"
          :class="{ 'rotate-180': open }"
          aria-hidden="true"
        />
        <!-- NO sr-only „aufklappen/zuklappen": `aria-expanded` on the button
             already states the state, and the screen reader read it twice („…
             zuklappen, Schaltfläche, erweitert"). -->
      </span>
      <span class="flex-wrap gap-1.5" :class="stuck ? 'hidden' : 'flex'">
        <span
          v-for="b in badges"
          :key="b.badge"
          class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium tabular-nums"
          :class="BADGE_CLASS[b.badge]"
        >
          {{ b.count }} {{ b.label }}
        </span>
        <!-- Not changes but states of the check, after the change pills
             (02.10.2026). „nicht gezeigt" is a gap — dashed, the convention
             for something left out; its cause stands at the § itself. „nicht
             geprüft" is shown but unverified — the quiet outline of
             „unverändert", because nothing is missing. -->
        <span
          v-if="withheld"
          class="inline-flex items-center rounded-full border border-dashed border-ink-muted/60 px-2 py-0.5 text-xs font-medium tabular-nums text-ink-muted"
        >
          {{ withheld }} nicht gezeigt
        </span>
        <span v-if="unchecked" :class="UNCHECKED_PILL">
          {{ unchecked }} nicht geprüft
        </span>
      </span>
    </button>

    <div v-if="open" class="border-t border-hairline">
      <slot />
    </div>
  </section>
</template>

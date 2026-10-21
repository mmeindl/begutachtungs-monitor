<script setup lang="ts">
/**
 * „Zitieren" — copies the official citation and the official address in one
 * string (`#shared/utils/citations`), beside the link it cites (21.10.2026).
 * Asked for by people who write Stellungnahmen: they cite drafts, Erläuterungen
 * and the Bundesgesetzblatt in footnotes, and typed the citation by hand.
 *
 * A button, not a link (21.10.2026, it was a `link-quiet` word for an
 * afternoon): a link goes somewhere, this does something on the page. A
 * ghost button, not the outline one (`ListMore`): four outlined buttons in
 * „Ändert 4 Gesetze" outweighed the law names they stood beside, and the
 * citation is a service to the content, never its equal. The copy icon and
 * the hover ground say „control"; the word stays visible beside the icon,
 * because a clipboard glyph alone reads as „copy the link", and what is
 * copied is more than that.
 *
 * The label turns into „Kopiert" for a moment, and the status region says
 * what was copied, so a screen reader hears the result and not only the
 * click. The region is empty when mounted and filled afterwards, the
 * mechanics of the comparison's announcement (`ExplanationsSection`). Where
 * the browser refuses the clipboard (an insecure context, a denied
 * permission) a prompt holds the text, selected, for a manual copy — the
 * citation stays reachable, and no third label widens the fixed columns of
 * `DocumentList`.
 */
const props = defineProps<{
  /** The string that lands on the clipboard. */
  text: string
  /** What is cited, for the accessible name: „Erläuterungen zitieren". */
  subject: string
  /** The icon alone below `sm` — for a column beside long titles
   *  (`DocumentList`), where the word broke the titles mid-word on a phone.
   *  The accessible name keeps the word. */
  compact?: boolean
}>()

const copied = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined

async function copy() {
  try {
    await navigator.clipboard.writeText(props.text)
  } catch {
    window.prompt('Zitat zum Kopieren:', props.text)
    return
  }
  copied.value = true
  clearTimeout(timer)
  timer = setTimeout(() => { copied.value = false }, 2500)
}

onBeforeUnmount(() => clearTimeout(timer))

const announcement = computed(() => (copied.value ? `Zitat kopiert: ${props.text}` : ''))
</script>

<template>
  <!-- `-my-1`, the `tap-target` move: the button is taller than a line of
       text, and beside a link in an `items-center` row it pushed the line
       down, away from its fact label (21.10.2026). Taken out of the flow
       by its overhang, it keeps its hit area and hover ground and moves
       nothing. -->
  <span class="-my-1 inline-flex">
    <UButton
      size="xs"
      color="neutral"
      variant="ghost"
      :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
      class="tabular-nums"
      :aria-label="`${subject} zitieren`"
      :title="text"
      @click="copy"
    >
      <span :class="compact && 'hidden sm:inline'">{{ copied ? 'Kopiert' : 'Zitieren' }}</span>
    </UButton>
    <span class="sr-only" role="status">{{ announcement }}</span>
  </span>
</template>

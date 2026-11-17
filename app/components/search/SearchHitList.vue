<script setup lang="ts">
/**
 * The rows of one answer on `/suche` (`SearchHit`): the row of every list
 * of the site, reduced to what tells hits apart — the title with the term
 * marked, what it is, and where it stands (`EntryState`, the lists' state
 * box). No columns: the list behind the link has them.
 *
 * Links as `EntryItem` makes them, for the same reasons written there:
 * `NuxtLink` as an imported value, an outward row only through
 * `isSafeLinkHref`, in a tab of its own with its host said to a screen
 * reader, and a row without a safe target is no link at all.
 */
import { NuxtLink } from '#components'
import { isSafeLinkHref } from '#shared/utils/safeExternalUrl'
import type { SearchHit } from '~/utils/siteSearch'

const props = defineProps<{
  hits: readonly SearchHit[]
  query: string
  /** The answer's heading is an `h2` or an `h3`; the rows' titles sit one below. */
  headingLevel?: 3 | 4
}>()

function hostOf(href: string): string | null {
  try {
    return new URL(href).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

const rows = computed(() => props.hits.map((hit) => {
  const external = !hit.to && isSafeLinkHref(hit.href) ? hit.href : null
  return {
    hit,
    external,
    host: external ? hostOf(external) : null,
    is: hit.to ? NuxtLink : external ? 'a' : 'div',
    attrs: hit.to ? { to: hit.to } : external ? { href: external, target: '_blank', rel: 'noopener' } : {},
  }
}))
</script>

<template>
  <ul role="list" class="divide-y divide-hairline">
    <li v-for="row in rows" :key="row.hit.key">
      <component
        :is="row.is"
        v-bind="row.attrs"
        :class="{ 'hover:bg-hover': row.is !== 'div' }"
        class="group flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:gap-4"
      >
        <div class="min-w-0 flex-1">
          <component
            :is="headingLevel === 4 ? 'h4' : 'h3'"
            class="font-medium text-ink"
            :class="{ 'group-hover:underline group-hover:decoration-2': row.is !== 'div' }"
          >
            <HighlightedText :text="row.hit.title" :query="query" /><span v-if="row.external" aria-hidden="true">&nbsp;↗</span><span v-if="row.host" class="sr-only"> (auf {{ row.host }}, neues Fenster)</span>
          </component>
          <p v-if="row.hit.detail" class="mt-0.5 text-sm text-ink-secondary">
            {{ row.hit.detail }}
          </p>
        </div>
        <div class="flex sm:entry-col-state sm:justify-end">
          <EntryState :state="row.hit.state" />
        </div>
      </component>
    </li>
  </ul>
</template>

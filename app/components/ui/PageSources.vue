<script setup lang="ts">
/**
 * „Quellen" at the foot of a page: every source the page shows, grouped by
 * what may be claimed about it, each claim once (01.10.2026). The sections
 * name only their publisher (`SectionCredits`); the licence is made here,
 * per document, and CC BY 4.0 § 3 a (2) allows exactly that — the
 * attribution on the same page, in a reasonable form for the medium.
 *
 * Two inputs. `page` is what the page itself knows from its own data — the
 * procedure, the Kurzinformation, the Stellungnahmen — and is rendered on
 * the server. What the sections report (`usePageSources`) joins after
 * mount: the comparisons fetch in the browser, and the Erläuterungen render
 * on the server only after this component already has, so a list that
 * included them in SSR would not match the one the client hydrates.
 *
 * The groups and their order are `groupSources`; the sentences are the
 * Impressum's (§ „Urheberrecht & Lizenzen"), shortened, so the two pages
 * say the same thing in the same words. The last line names the work that
 * is ours — CC BY asks for modifications to be indicated, and a reader for
 * who marked a ministry's text red and green.
 */
import type { Publisher } from '#shared/types'
import { groupSources, type SourceEntry, type SourceTerms } from '#shared/utils/provenance'

const props = defineProps<{ page: readonly SourceEntry[] }>()

const reported = useReportedSources()
const mounted = ref(false)
onMounted(() => { mounted.value = true })

const groups = computed(() => groupSources([...props.page, ...(mounted.value ? reported.value : [])]))

const PUBLISHER_DE: Record<Publisher, string> = {
  ris: 'Rechtsinformationssystem des Bundes (Bundeskanzleramt)',
  parlament: 'Parlamentsdirektion',
}
const TERMS_DE: Record<Exclude<SourceTerms, 'cc-by'>, string> = {
  'freies-werk': 'freie Werke, „ohne Lizenzierung frei nutzbar“',
  'keine-lizenz': 'ohne Open-Data-Lizenz',
}
</script>

<template>
  <section v-if="groups.length" id="quellen" class="page-section scroll-mt-6" aria-labelledby="quellen-heading">
    <h2 id="quellen-heading" class="text-base font-semibold text-ink">Quellen</h2>
    <dl class="mt-3 space-y-2 text-sm leading-relaxed text-ink-secondary">
      <div v-for="g in groups" :key="`${g.publisher}-${g.terms}`">
        <dt class="inline font-medium text-ink">
          {{ PUBLISHER_DE[g.publisher] }},
          <ExternalLink
            v-if="g.terms === 'cc-by'"
            href="https://creativecommons.org/licenses/by/4.0/deed.de"
            class="link-inline"
          >CC BY 4.0</ExternalLink><template v-else>{{ TERMS_DE[g.terms] }}</template>:
        </dt>
        <dd class="inline">{{ g.items.join(', ') }}</dd>
      </div>
    </dl>
    <p class="mt-3 text-sm leading-relaxed text-ink-secondary">
      Gegliedert, verglichen und markiert vom Begutachtungs-Monitor.
      <NuxtLink to="/impressum#imp-license" class="link-inline">Lizenzen im Impressum</NuxtLink>.
    </p>
  </section>
</template>

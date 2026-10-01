/**
 * The sources a page shows, collected for its foot (`PageSources`): each
 * section reports what it read, the page renders the claims once
 * (`#shared/utils/provenance`, 01.10.2026).
 *
 * A section registers in its own setup, not when its credit line mounts:
 * setup runs in the page's order, while the lines mount in the order the
 * fetches return — and the foot must not reshuffle when one comes back
 * first. A section's list is empty until its data is there, and leaves with
 * the section.
 *
 * Without a page that provides the registry a section registers nothing,
 * and its own line still names the publisher.
 */
import type { InjectionKey, Ref } from 'vue'
import type { SourceEntry } from '#shared/utils/provenance'

type Registry = Map<symbol, Readonly<Ref<readonly SourceEntry[]>>>

const KEY: InjectionKey<Registry> = Symbol('pageSources')

/** On the page: a fresh registry for its sections. */
export function providePageSources() {
  const registry: Registry = shallowReactive(new Map())
  provide(KEY, registry)
}

/** In `PageSources`: what the sections have reported. */
export function useReportedSources(): Readonly<Ref<readonly SourceEntry[]>> {
  const registry = inject(KEY, null)
  return computed(() => (registry ? [...registry.values()].flatMap((r) => r.value) : []))
}

/** In a section: report what it shows, for as long as it is mounted. */
export function usePageSources(sources: Readonly<Ref<readonly SourceEntry[]>>) {
  const registry = inject(KEY, null)
  if (!registry) return
  const id = Symbol('section')
  registry.set(id, sources)
  onScopeDispose(() => registry.delete(id))
}

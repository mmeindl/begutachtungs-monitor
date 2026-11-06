/**
 * Bund zu Land on a draft page (docs/architecture.md §12.67), on the
 * pattern of `useEuRecht`: on the server only while it stays fast, after
 * the first paint otherwise. Two addresses: a Land's draft gets its fact
 * (what of the Bund's it carries out), a Ministerialentwurf its line (how
 * many Land drafts carry its Grundsatzgesetz out). `null` means the server
 * did not wait; until the client has it, the card simply has no line —
 * most drafts carry nothing of the Bund's out, and „wird geladen" for a
 * fact they do not have would be noise.
 */
import type { LandBundesrechtResponse, LandCode, MeBundesrechtLine } from '#shared/types'

/** As for the EU fact: the page's own cold render is ~800 ms. */
const SSR_DEADLINE_MS = 800

function deferred<T>(key: () => string, read: () => Promise<T>) {
  const { data, status, refresh } = useAsyncData<T | null>(
    key,
    () => {
      const r = read()
      if (!import.meta.server) return r
      return Promise.race([r, new Promise<null>((resolve) => { setTimeout(() => resolve(null), SSR_DEADLINE_MS) })])
    },
    { lazy: true, dedupe: 'defer' },
  )
  // After hydration, not in `onMounted` (`useEuRecht`).
  onNuxtReady(() => {
    if (status.value === 'success' && data.value === null) refresh()
  })
  return { data, status }
}

/** A Land's draft: the Grundsatzgesetz it carries out, the agreement it implements. */
export function useLandBundesrecht(source: () => { land: LandCode; number: string }) {
  const endpoint = computed(() => `/api/laender/${source().land}/${encodeURIComponent(source().number)}/bundesrecht`)
  return deferred<LandBundesrechtResponse>(() => `bundesrecht:${endpoint.value}`, () => $fetch<LandBundesrechtResponse>(endpoint.value))
}

/** A Ministerialentwurf: its Grundsatzgesetz's Land drafts, once kundgemacht. */
export function useMeBundesrecht(source: () => { gp: string; inr: number }) {
  const endpoint = computed(() => `/api/drafts/${source().gp}/${source().inr}/bundesrecht`)
  const { data, status } = deferred<{ line: MeBundesrechtLine | null }>(() => `bundesrecht:${endpoint.value}`, () => $fetch<{ line: MeBundesrechtLine | null }>(endpoint.value))
  return { line: computed(() => data.value?.line ?? null), status }
}

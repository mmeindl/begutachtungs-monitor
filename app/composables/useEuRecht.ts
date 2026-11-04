/**
 * Whether a draft implements EU law — one fact in the ProcedureCard
 * (docs/architecture.md §12.66), fetched on the pattern of
 * `useExplanations`: on the server only while it stays fast, after the
 * first paint otherwise.
 *
 * SERVER-SIDE, WITH A DEADLINE. The fact is a sentence in the card the page
 * opens with, so it belongs in the delivered HTML where it is ready; but a
 * cold answer reads a Vorblatt PDF, the law in force and EUR-Lex, and may
 * take seconds. `null` therefore means one thing: the server did not wait.
 * The client fetches it after hydration, and until then the card simply
 * has no EU line — nothing that says „wird geladen" for a fact most drafts
 * do not have.
 */
import type { EuRechtResponse } from '#shared/types'

/** As for the Erläuterungen: the page's own cold render is ~800 ms. */
const SSR_DEADLINE_MS = 800

/** @param source The draft's address, as a getter — Ministerialentwurf by GP and number, a RIS-only Begutachtung by its id. */
export function useEuRecht(source: () => { gp?: string; inr?: number; risId?: string }) {
  const endpoint = computed(() => {
    const { gp, inr, risId } = source()
    return risId ? `/api/ris-drafts/${risId}/eu-recht` : `/api/drafts/${gp}/${inr}/eu-recht`
  })

  const { data, status, refresh } = useAsyncData<EuRechtResponse | null>(
    () => `eu-recht:${endpoint.value}`,
    () => {
      const read = $fetch<EuRechtResponse>(endpoint.value)
      if (!import.meta.server) return read
      return Promise.race([read, new Promise<null>((resolve) => { setTimeout(() => resolve(null), SSR_DEADLINE_MS) })])
    },
    { lazy: true, dedupe: 'defer' },
  )

  // After hydration, not in `onMounted`: while hydrating Nuxt answers a
  // refresh from the payload, which holds the very `null` to replace
  // (`useExplanations`, 19.09.2026).
  onNuxtReady(() => {
    if (status.value === 'success' && data.value === null) refresh()
  })

  return { data, status }
}

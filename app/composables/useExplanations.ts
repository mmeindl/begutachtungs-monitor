/**
 * A draft's Erläuterungen: fetched once, read by two sections — and on the
 * server only for as long as it stays fast (docs/architecture.md §12.29).
 *
 * TWO READERS, ONE FETCH. The Allgemeiner Teil above and the Besonderer
 * Teil's passages at the §§ of the Textgegenüberstellung (§12.30) come from
 * one document. That it stays one request used to rest on `useFetch` keying
 * by URL — a property of the library neither section stated. The key stands
 * here now.
 *
 * SERVER-SIDE, WITH A DEADLINE (decided 19.09.2026). The section carries the
 * page's substance and is CC BY, so it belongs in the delivered HTML; against
 * that stands `getText` (`server/utils/ris/konsLaw.ts`), which waits 20 s and
 * retries three times, so a sick upstream could hold a page delivery for
 * nearly a minute. Both work because the deadline may be short: measured
 * 19.09.2026 over ten GP-XXVIII drafts the endpoint took 40–178 ms cold and
 * milliseconds warm, while the detail page itself renders in ~800 ms cold.
 *
 * `null` therefore means exactly one thing: the server missed the deadline.
 * The client fetches it after the first paint, and until then the section
 * shows its loading state — not its error state, because nothing went wrong.
 * Rejected: `useAsyncData`'s `timeout`, which aborts the request instead of
 * only the wait — the same work twice, and an error state that can no longer
 * tell „RIS is gone" from „we did not wait".
 */
import type { ExplanationsResponse } from '#shared/types'

/** See above: measured cold case 40–178 ms, the page's cold render ~800 ms. */
const SSR_DEADLINE_MS = 800

/**
 * @param source The draft's address, as a getter — the two pages reach the
 * same document by different routes (Ministerialentwurf through the RIS↔ME
 * join, a Begutachtung without a Gegenstand through its RIS id), and on a
 * navigation from draft to draft it changes under the component. The key
 * follows it.
 */
export function useExplanations(source: () => { gp?: string; inr?: number; risId?: string }) {
  const endpoint = computed(() => {
    const { gp, inr, risId } = source()
    return risId ? `/api/ris-drafts/${risId}/erlaeuterungen` : `/api/drafts/${gp}/${inr}/erlaeuterungen`
  })

  const { data, status, refresh } = useAsyncData<ExplanationsResponse | null>(
    () => `erlaeuterungen:${endpoint.value}`,
    () => {
      const read = $fetch<ExplanationsResponse>(endpoint.value)
      if (!import.meta.server) return read
      return Promise.race([read, new Promise<null>((resolve) => { setTimeout(() => resolve(null), SSR_DEADLINE_MS) })])
    },
    // `lazy`, so a navigation in the browser does not wait on RIS: the server
    // waits regardless (Nuxt hangs the fetch on `onServerPrefetch`), which is
    // exactly where the deadline above applies.
    //
    // `dedupe: 'defer'`, because the shared key alone does NOT prevent the
    // second request: Nuxt's default is `cancel`, so the second section
    // registering the same key aborts the first one's running fetch and
    // starts its own. Measured 19.09.2026 with a probe in the endpoint: two
    // calls per page build, already before this file. `defer` hands the second
    // one the running fetch.
    { lazy: true, dedupe: 'defer' },
  )

  // AFTER hydration, not in `onMounted`: while hydration runs, Nuxt answers
  // every `refresh` from the page's payload — and that payload holds exactly
  // the `null` we are trying to replace. Not a corner case but the normal
  // one: the section stayed on „wird geladen" until somebody reloaded the
  // page (measured 19.09.2026 with `--dump-dom`, before this line read like
  // this). `onNuxtReady` runs once hydration is through.
  //
  // Both sections call this; the second finds the refetch already `pending`
  // and triggers no second one.
  onNuxtReady(() => {
    if (status.value === 'success' && data.value === null) refresh()
  })

  return { data, status }
}

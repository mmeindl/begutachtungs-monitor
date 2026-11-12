/**
 * A fetch the server's render waits for only up to a deadline — for the
 * blocks of a page that ADD to it, never for the one that carries it.
 *
 * `useExplanations`' pattern (19.09.2026), lifted out of `useDraftHalves`
 * on 12.11.2026 when the homepage needed it too. `lazy` changes nothing on
 * the server: Nuxt awaits every fetch that is not `server: false` before it
 * sends a byte. So one slow optional block held the whole HTML — the
 * homepage measured 7,7 s cold on the live site and 6,1 s on a cold built
 * server, all of it the RIS half's 6 s budget running out.
 *
 * On the server the fetch races the deadline and `null` stands in the
 * payload when it loses, so the browser hydrates into exactly the state the
 * server rendered (the block „noch geladen") and asks again once hydration
 * is through (`onNuxtReady`; earlier, Nuxt would answer the refresh from
 * that very payload). The server's read is not aborted, only no longer
 * waited for: it goes on filling the cache the browser's request then finds.
 * In the browser the block's own budget applies, and a timeout is a
 * failure, stated as one.
 *
 * `null` with no error therefore means „on its way", never „none" — read it
 * through `halfState` (`~/utils/draftFilters`), not through the fetch's
 * `status`, which says `success` for a deadline the server missed.
 */
import type { Ref } from 'vue'

/**
 * How long the server's render waits for a late block (12.11.2026). Warm,
 * every one of them answers in fractions of a second (the RIS half 0,22 s,
 * the homepage's sections 2–15 ms); cold, the RIS corpus needs up to 56 s
 * and a Land's register up to 33 s. Two seconds keep every warm answer in
 * the HTML and no cold one in front of it.
 */
const SSR_DEADLINE_MS = 2000

/**
 * @param query A getter: the key follows it, so a changed query is a new
 * fetch (and a new payload entry) rather than a stale answer under an old key.
 * @param options.wanted Whether the block is asked for at all; `enabled`
 * keeps the request from being made, on the server too. Omitted: always.
 * @param options.key A namespace before the URL. Two pages that ask the same
 * endpoint with the same query would otherwise share one key — and a shared
 * key keeps the first registration's options (budget, `enabled`).
 */
export function useLateFetch<T>(
  url: string,
  query: () => Record<string, unknown>,
  options: { timeout: number; wanted?: Ref<boolean>; key?: string },
) {
  const { wanted } = options
  const fetched = useAsyncData<T | null>(
    () => `${options.key ? `${options.key}:` : ''}${url}:${JSON.stringify(query())}`,
    () => {
      /* Cast, not `$fetch<T>`: over a `string` URL Nitro's route typing
       * stays an unresolved conditional for a generic `T`. */
      const read = $fetch(url, { query: query(), timeout: options.timeout }) as Promise<T>
      if (!import.meta.server) return read
      return Promise.race([read, new Promise<null>((resolve) => { setTimeout(() => resolve(null), SSR_DEADLINE_MS) })])
    },
    wanted ? { lazy: true, enabled: wanted, watch: [wanted] } : { lazy: true },
  )
  onNuxtReady(() => {
    if ((wanted?.value ?? true) && fetched.status.value === 'success' && fetched.data.value === null) void fetched.refresh()
  })
  return fetched
}

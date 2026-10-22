import type { Ref } from 'vue'
import type { LandCode } from '#shared/types'
import { LAND_COOKIE, LAND_COOKIE_MAX_AGE_S, formatLandList, parseLandList } from '#shared/utils/laender'

/**
 * Which Länder the reader has added to the lists (22.10.2026,
 * `shared/utils/laender.ts`).
 *
 * One choice for the whole site: picked on the homepage, it holds in
 * `/entwuerfe` too, and the other way round. Read from `?land=` where the
 * URL says it (a shared link), else from the cookie — which the server
 * reads, so the list renders chosen and nothing moves after hydration.
 * Default: none, the lists as they were before the Länder.
 *
 * A toggle writes both: the cookie for the next visit, the URL so the
 * address shares what is on screen. The URL is written with `replace`: a
 * chip is a view setting, not a place to go Back to.
 */
export function useLandChoice(): { chosen: Ref<LandCode[]>; toggle: (land: LandCode) => void } {
  const route = useRoute()
  const router = useRouter()
  const cookie = useCookie<string | null>(LAND_COOKIE, {
    maxAge: LAND_COOKIE_MAX_AGE_S,
    sameSite: 'lax',
    path: '/',
    // The value is a plain list, never JSON: `sbg,w`.
    decode: (v) => v ?? null,
    encode: (v) => v ?? '',
  })
  const fromRoute = () => parseLandList(typeof route.query.land === 'string' ? route.query.land : null)
  const chosen = useState<LandCode[]>('land-choice', () => fromRoute() ?? parseLandList(cookie.value) ?? [])

  // Back and Forward between two addresses that name different Länder.
  watch(() => route.query.land, () => {
    const next = fromRoute()
    if (next && formatLandList(next) !== formatLandList(chosen.value)) chosen.value = next
  })

  function toggle(land: LandCode): void {
    const next = chosen.value.includes(land) ? chosen.value.filter((l) => l !== land) : [...chosen.value, land]
    chosen.value = parseLandList(formatLandList(next)) ?? []
    // None chosen: the cookie goes, which is what the Datenschutz page promises.
    cookie.value = formatLandList(chosen.value) || null
    router.replace({ query: { ...route.query, land: formatLandList(chosen.value) || undefined } })
  }

  return { chosen, toggle }
}

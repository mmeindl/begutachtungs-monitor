import type { ComputedRef, Ref } from 'vue'
import type { LandCode } from '#shared/types'
import {
  DEFAULT_SOURCES,
  SOURCE_COOKIE,
  SOURCE_COOKIE_MAX_AGE_S,
  SOURCE_PARAM,
  type SourceCode,
  formatSourceList,
  isDefaultSources,
  parseSourceList,
} from '#shared/utils/laender'

/**
 * Where the lists' drafts come from: the Bund, and the Länder the reader
 * added (22.10.2026, `shared/utils/laender.ts`).
 *
 * One choice for the whole site: picked on the homepage, it holds in
 * `/entwuerfe` too, and the other way round. Read from `?quellen=` where the
 * URL says it (a shared link), else from the cookie — which the server
 * reads, so the list renders chosen and nothing moves after hydration.
 * Default: the Bund alone, the lists as they were before the Länder.
 *
 * NEVER EMPTY: a list with no source would read as „nothing open", the one
 * claim this site must never make without checking it. Turning off the last
 * Land therefore brings the Bund back — the default, not a dead end. Only
 * the Bund alone cannot be turned off (`isLocked`): there is nothing to
 * fall back to.
 *
 * A toggle writes both carriers: the cookie for the next visit, the URL so
 * the address shares what is on screen. The default writes neither — the
 * cookie goes, and the address stays clean. `replace`, not `push`: a chip is
 * a view setting, not a place to go Back to.
 */
export function useSourceChoice(): {
  chosen: Ref<SourceCode[]>
  bund: ComputedRef<boolean>
  laender: ComputedRef<LandCode[]>
  isLocked: (code: SourceCode) => boolean
  toggle: (code: SourceCode) => void
  /** `?quellen=…` for a link that should carry the choice; '' for the default. */
  queryValue: ComputedRef<string>
} {
  const route = useRoute()
  const router = useRouter()
  const cookie = useCookie<string | null>(SOURCE_COOKIE, {
    maxAge: SOURCE_COOKIE_MAX_AGE_S,
    sameSite: 'lax',
    path: '/',
    // The value is a plain list, never JSON: `bund,sbg`.
    decode: (v) => v ?? null,
    encode: (v) => v ?? '',
  })
  const fromRoute = () => parseSourceList(typeof route.query[SOURCE_PARAM] === 'string' ? route.query[SOURCE_PARAM] as string : null)
  const chosen = useState<SourceCode[]>('source-choice', () => fromRoute() ?? parseSourceList(cookie.value) ?? [...DEFAULT_SOURCES])

  // Back and Forward between two addresses that name different sources.
  watch(() => route.query[SOURCE_PARAM], () => {
    const next = fromRoute()
    if (next && formatSourceList(next) !== formatSourceList(chosen.value)) chosen.value = next
  })

  const isLast = (code: SourceCode) => chosen.value.length === 1 && chosen.value[0] === code
  const isLocked = (code: SourceCode) => code === 'bund' && isLast(code)

  function toggle(code: SourceCode): void {
    if (isLocked(code)) return
    const next = isLast(code)
      ? [...DEFAULT_SOURCES]
      : chosen.value.includes(code) ? chosen.value.filter((c) => c !== code) : [...chosen.value, code]
    chosen.value = parseSourceList(formatSourceList(next)) ?? [...DEFAULT_SOURCES]
    const value = isDefaultSources(chosen.value) ? null : formatSourceList(chosen.value)
    cookie.value = value
    router.replace({ query: { ...route.query, [SOURCE_PARAM]: value ?? undefined } })
  }

  return {
    chosen,
    bund: computed(() => chosen.value.includes('bund')),
    laender: computed(() => chosen.value.filter((c): c is LandCode => c !== 'bund')),
    isLocked,
    toggle,
    queryValue: computed(() => (isDefaultSources(chosen.value) ? '' : formatSourceList(chosen.value))),
  }
}

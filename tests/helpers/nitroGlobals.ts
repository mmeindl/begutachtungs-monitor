/**
 * The three Nitro auto-imports a request parser needs, faked — so that
 * `server/utils/http/params.ts` can be executed by vitest at all.
 *
 * WHY THIS EXISTS AND WHAT IT IS NOT. The rule of this suite is that what is
 * under test is a pure module with relative imports (docs/architecture.md
 * §9), and almost everything follows it. `params.ts` cannot: reading a
 * request IS the Nitro boundary — `getQuery`, `getRouterParam` and
 * `createError` are the whole job — so the choice is between faking those
 * three names and leaving the file untested. It was untested, and it decides
 * `von`/`bis`: a flipped pair renders every amendment backwards
 * (`readLawStationPair`).
 *
 * The fakes are as small as the module's use of them. `getQuery` and
 * `getRouterParam` read two plain objects off the event, which is why the
 * event here is a literal rather than an H3Event — h3's own event needs a
 * node request and would test h3. `createError` throws nothing by itself; it
 * returns the object the handler throws, carrying `statusCode` and
 * `statusMessage`, which is what every assertion in `params.test.ts` reads.
 *
 * Loaded by `vitest.config.ts` as a setup file, so it runs before EVERY test
 * file. That is deliberate and harmless: it only adds three names to
 * `globalThis`. What it must never do is stand in for a real behaviour — a
 * test that asserts on h3's own semantics belongs nowhere near this file.
 */

/**
 * The same names for the TOOLS typecheck. `tsconfig.tools.json`
 * replaces the server project's `include`, so the generated
 * `.nuxt/types/nitro-imports.d.ts` is not part of it — and `params.ts`,
 * which this half now imports, would not compile there although it compiles
 * under `nuxt typecheck`. Declared with h3's and Nitro's own signatures
 * rather than with the fakes' below, so the two typechecks agree on what
 * these functions are.
 *
 * NAMED ONE BY ONE, and that is the decision, not laziness: pulling
 * `nitro-imports.d.ts` into the tools project would declare all 900
 * auto-imports at once — including every `server/utils` export — and the
 * scripts run under vite-node, where NO auto-import exists. A script that
 * forgot an explicit import would then typecheck and crash. So a name is
 * added here when a test needs it, and each one is a Nitro/h3 name, never
 * one of ours.
 *
 * `defineCachedFunction`, `DERIVED_CACHE` and `import.meta.dev` came with
 * `tests/bgblService.test.ts` (26.09.2026): executing a `*Service.ts` at all
 * means executing the cache wrapper its cached functions are built with at
 * module load, and a module a test mocks away at RUNTIME is still part of the
 * type program, so `risOnly.ts` and `begutCorpus.ts` came with it.
 *
 * `defineCachedFunction` is written out instead of imported, unlike the h3
 * three: `nitropack` is Nuxt's dependency and not ours, so the specifier does
 * not resolve from `tests/` under pnpm. That it is permissive costs nothing —
 * every file that CALLS it lives under `server/`, which `pnpm typecheck`
 * checks against Nitro's real types. What this declaration has to do is stop
 * the tools project failing on a file it does not own.
 */
declare global {
  const createError: typeof import('h3').createError
  const getQuery: typeof import('h3').getQuery
  const getRouterParam: typeof import('h3').getRouterParam
  const defineCachedFunction: <T, A extends unknown[]>(
    fn: (...args: A) => Promise<T>,
    opts: {
      name: string
      getKey?: (...args: A) => string
      maxAge?: number
      swr?: boolean
      base?: string
      shouldBypassCache?: (...args: A) => boolean
    },
  ) => (...args: A) => Promise<T>
  const DERIVED_CACHE: typeof import('../../server/utils/cache/base').DERIVED_CACHE

  /** Nuxt's build-time flag, read by `ris/begutCorpus.ts` to cache RIS pages in dev only. */
  interface ImportMeta {
    readonly dev: boolean
  }
}

/** The fake event both readers take, in place of an `H3Event`. */
export interface FakeEvent {
  __query?: Record<string, string | string[] | undefined>
  __params?: Record<string, string | undefined>
}

/** What `createError` returns and a handler throws — h3's shape, as far as it is read. */
export interface FakeError {
  statusCode: number
  statusMessage: string
}

Object.assign(globalThis, {
  createError: (input: { statusCode?: number; statusMessage?: string }): FakeError => ({
    statusCode: input.statusCode ?? 500,
    statusMessage: input.statusMessage ?? '',
  }),
  getQuery: (event: FakeEvent) => event.__query ?? {},
  getRouterParam: (event: FakeEvent, name: string) => event.__params?.[name],
})

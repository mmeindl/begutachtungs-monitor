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
 * The same three names for the TOOLS typecheck. `tsconfig.tools.json`
 * replaces the server project's `include`, so the generated
 * `.nuxt/types/nitro-imports.d.ts` is not part of it — and `params.ts`,
 * which this half now imports, would not compile there although it compiles
 * under `nuxt typecheck`. Declared with h3's own signatures rather than with
 * the fakes' below, so the two typechecks agree on what these functions are.
 */
declare global {
  const createError: typeof import('h3').createError
  const getQuery: typeof import('h3').getQuery
  const getRouterParam: typeof import('h3').getRouterParam
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

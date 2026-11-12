/**
 * The door policy for requests from outside (`utils/http/rateLimit.ts` holds
 * the rules and says who counts as outside).
 *
 * 1. The prewarm-only routes answer 404 to anyone who came through the
 *    proxy. Cold, one call fans out to hundreds of upstream requests; open
 *    to the internet, a loop over fifteen periods would get this server's
 *    address rate-limited by Parliament, which takes the whole site down
 *    with it. 404 rather than 403: from outside they do not exist.
 * 2. Every external request draws from a per-client budget, and the two
 *    routes that cost upstream requests on every call draw from a second,
 *    stricter one as well. A page's in-process API calls are not external
 *    requests: the page was admitted, its parts are not counted again.
 *
 * 3. A request that did not come through the proxy — the prewarm, the
 *    watchdog, the Länder archive, every request in dev — waits for fresh
 *    cache values instead of taking a stale one (`cache/stale.ts`): the
 *    prewarm unit runs its builds one after another only because each curl
 *    returns when its build is done. A page's in-process API calls return
 *    early below and keep the context of the request that rendered it, so a
 *    prewarmed page waits all the way down and a visitor's page does not.
 *
 * In memory, per process — one Node process serves the site, and a restart
 * forgetting the counts is harmless.
 */
import { waitForFresh } from '../utils/cache/stale'
import {
  RATE_RULES,
  clientKeyFromForwardedFor,
  createRateLimiter,
  isInProcessRequest,
  isPrewarmOnlyPath,
  isUncountedPath,
  normalisedPath,
  strictClassFor,
  type RateClass,
} from '../utils/http/rateLimit'

const limiters = Object.fromEntries(
  Object.entries(RATE_RULES).map(([name, rule]) => [name, createRateLimiter(rule)]),
) as Record<RateClass, ReturnType<typeof createRateLimiter>>

export default defineEventHandler((event) => {
  // Before anything else, and without entering anything: an in-process call
  // inherits its page's context, waiting or not.
  if (isInProcessRequest(event.node.req.socket?.remoteAddress)) return
  const key = clientKeyFromForwardedFor(getRequestHeader(event, 'x-forwarded-for'))
  if (key === null) {
    waitForFresh()
    return
  }

  const path = normalisedPath(event.path)
  if (isPrewarmOnlyPath(path)) {
    throw createError({ statusCode: 404, statusMessage: 'Seite nicht gefunden' })
  }
  if (isUncountedPath(path)) return

  const strict = strictClassFor(path)
  // The strict bucket first: a request it refuses should not also spend the
  // reader's general budget.
  const wait = (strict ? limiters[strict].take(key) : 0) || limiters.global.take(key)
  if (wait > 0) {
    setResponseHeader(event, 'Retry-After', wait)
    throw createError({ statusCode: 429, statusMessage: 'Zu viele Anfragen, bitte kurz warten' })
  }
})

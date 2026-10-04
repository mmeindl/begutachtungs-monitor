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
 *    stricter one as well.
 *
 * In memory, per process — one Node process serves the site, and a restart
 * forgetting the counts is harmless.
 */
import {
  RATE_RULES,
  clientKeyFromForwardedFor,
  createRateLimiter,
  isPrewarmOnlyPath,
  isUncountedPath,
  strictClassFor,
  type RateClass,
} from '../utils/http/rateLimit'

const limiters = Object.fromEntries(
  Object.entries(RATE_RULES).map(([name, rule]) => [name, createRateLimiter(rule)]),
) as Record<RateClass, ReturnType<typeof createRateLimiter>>

/** The path the router will see, normalised so an encoding or a doubled slash is no way past the checks. */
function normalisedPath(raw: string): string {
  const path = raw.split('?')[0] ?? ''
  let decoded = path
  try {
    decoded = decodeURIComponent(path)
  } catch {
    // Malformed escapes: judge the raw path; the router will 404 it anyway.
  }
  return decoded.replace(/\/{2,}/g, '/').toLowerCase()
}

export default defineEventHandler((event) => {
  const key = clientKeyFromForwardedFor(getRequestHeader(event, 'x-forwarded-for'))
  if (key === null) return

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
    setResponseHeader(event, 'Retry-After', String(wait))
    throw createError({ statusCode: 429, statusMessage: 'Zu viele Anfragen, bitte kurz warten' })
  }
})

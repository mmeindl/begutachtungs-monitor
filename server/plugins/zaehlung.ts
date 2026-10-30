/**
 * Counts page views per UTC day, without anything personal
 * (docs/architecture.md §12.65): no address, no user agent, no cookie, no
 * log line — one number per kind of page grows, and the referring host's.
 * The rules are in `server/utils/zaehlung/`; this file only wires them to
 * the response and to the clock.
 *
 * A request counts when it came from outside — through Caddy, which sets
 * X-Forwarded-For, and not as a page's own in-process call (the same test
 * as the door, `utils/http/rateLimit.ts`) —, asked GET or HEAD, was
 * answered 2xx or 304, and names a page (`klassifiziere`). The prewarm, the
 * watchdog and the smoke test call 127.0.0.1 without the header and are
 * not counted.
 *
 * `NUXT_ZAEHLUNG_FLUSH_S` shortens the write interval for a test run.
 */
import { clientKeyFromForwardedFor, isInProcessRequest, normalisedPath } from '../utils/http/rateLimit'
import { istBot } from '../utils/zaehlung/bots'
import { herkunftHost } from '../utils/zaehlung/herkunft'
import { klassifiziere } from '../utils/zaehlung/klassen'
import { createZaehlung, zaehlVerzeichnis } from '../utils/zaehlung/speicher'

const DEFAULT_FLUSH_S = 5 * 60

export default defineNitroPlugin((nitroApp) => {
  let warned = false
  const zaehlung = createZaehlung(zaehlVerzeichnis(), {
    // Once per process: a read-only directory must show in the journal, but
    // not at request rate.
    warn: (err) => {
      if (warned) return
      warned = true
      console.warn('[zaehlung] writing the day file failed — counts stay in memory until it works:', err)
    },
  })

  nitroApp.hooks.hook('afterResponse', (event) => {
    const method = event.method
    if (method !== 'GET' && method !== 'HEAD') return
    const status = event.node.res.statusCode
    if (!((status >= 200 && status < 300) || status === 304)) return
    if (isInProcessRequest(event.node.req.socket?.remoteAddress)) return
    if (clientKeyFromForwardedFor(getRequestHeader(event, 'x-forwarded-for')) === null) return

    const contentType = event.node.res.getHeader('content-type')
    const treffer = klassifiziere(normalisedPath(event.path), typeof contentType === 'string' ? contentType : null)
    if (!treffer) return

    const bot = istBot(getRequestHeader(event, 'user-agent'))
    zaehlung.erfasse({ ...treffer, bot, herkunft: bot ? null : herkunftHost(getRequestHeader(event, 'referer')) })
  })

  const flushS = Number(process.env.NUXT_ZAEHLUNG_FLUSH_S) || DEFAULT_FLUSH_S
  const timer = setInterval(() => void zaehlung.schreibe(), flushS * 1000)
  timer.unref()

  nitroApp.hooks.hook('close', async () => {
    clearInterval(timer)
    await zaehlung.schreibe()
  })
})

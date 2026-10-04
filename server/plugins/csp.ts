/**
 * Sends the full Content-Security-Policy with every rendered HTML page,
 * replacing the framing-only one the `'/**'` route rule sets for all other
 * responses (`nuxt.config.ts`). The policy and why it looks as it does:
 * `server/utils/http/csp.ts`.
 *
 * Error pages are rendered through `/__nuxt_error`, and Nuxt's error handler
 * copies that response's headers onto the real one, so they get the same
 * policy.
 */
import { buildCsp, inlineExecutableScripts } from '../utils/http/csp'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('render:html', (html, { event }) => {
    const scripts = [...html.head, ...html.bodyAppend].flatMap(inlineExecutableScripts)
    setResponseHeader(event, 'content-security-policy', buildCsp(scripts))
  })
})

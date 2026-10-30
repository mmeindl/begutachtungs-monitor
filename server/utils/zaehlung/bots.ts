/**
 * Whether a request came from a program rather than a reader
 * (docs/architecture.md §12.65). The user-agent string is read here and
 * nowhere else, and it is neither stored nor logged: the answer is one
 * boolean that decides which of two numbers grows.
 *
 * Conservative in the direction that matters: a crawler mistaken for a
 * reader inflates the reader count, a reader mistaken for a crawler only
 * moves one count into the bot column, which is published beside it. So
 * the pattern takes every generic program word, link-preview fetchers and
 * the HTTP libraries scripts use, and a request without any user agent is
 * a program too — browsers always send one.
 */
const BOT_UA = new RegExp(
  [
    // Self-declared programs and crawlers.
    'bot', 'crawl', 'spider', 'slurp', 'fetch', 'preview', 'headless', 'scrap', 'archiver',
    // HTTP libraries and command-line tools.
    'python', 'curl/', 'wget', 'go-http-client', 'http-?client', 'okhttp', 'axios', 'undici', 'java/',
    'libwww', 'perl', 'ruby', 'php/', 'aiohttp', 'httpx',
    // Measuring and monitoring services.
    'lighthouse', 'pagespeed', 'gtmetrix', 'pingdom', 'uptime', 'statuscake', 'monitoring', 'validator',
    // Link previews that do not call themselves bots.
    'facebookexternalhit', 'whatsapp', 'mastodon', 'embedly',
  ].join('|'),
  'i',
)

export function istBot(userAgent: string | null | undefined): boolean {
  const ua = userAgent?.trim() ?? ''
  if (!ua) return true
  return BOT_UA.test(ua)
}

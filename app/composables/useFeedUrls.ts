import type { SourceCode } from '#shared/utils/laender'

/**
 * Subscription URLs for the deadline calendar and the RSS feed.
 *
 * The calendar must be SUBSCRIBED, not imported — a plain https link makes
 * browsers download the .ics, which imports a never-updating snapshot.
 * webcal:// opens Apple Calendar/Outlook directly in subscribe mode; Google
 * Calendar needs its render?cid= deep link; the bare address remains for
 * manual entry (visible, selectable — works without any protocol handler).
 */
export function useFeedUrls(source: SourceCode = 'bund') {
  return feedUrlsOf(useRuntimeConfig().public.siteUrl, source)
}

/** The same, outside setup — for a component whose source changes (`SubscribeLinks`). */
export function feedUrlsOf(siteUrl: string, source: SourceCode) {
  // One source per subscription (25.10.2026): the Bund at the bare address, a Land with `?quelle=`.
  const query = source === 'bund' ? '' : `?quelle=${source}`
  const icsUrl = `${siteUrl}/kalender.ics${query}`
  const webcalUrl = icsUrl.replace(/^https?:\/\//, 'webcal://')
  const googleCalUrl = `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcalUrl)}`
  /** Address without protocol, for display + manual copy. */
  const icsDisplayUrl = icsUrl.replace(/^https?:\/\//, '')
  const feedUrl = `/feed.xml${query}`
  return { icsUrl, webcalUrl, googleCalUrl, icsDisplayUrl, feedUrl }
}

/**
 * Subscription URLs for the deadline calendar and the RSS feed.
 *
 * The calendar must be SUBSCRIBED, not imported — a plain https link makes
 * browsers download the .ics, which imports a never-updating snapshot.
 * webcal:// opens Apple Calendar/Outlook directly in subscribe mode; Google
 * Calendar needs its render?cid= deep link; the bare address remains for
 * manual entry (visible, selectable — works without any protocol handler).
 */
export function useFeedUrls() {
  const { siteUrl } = useRuntimeConfig().public
  const icsUrl = `${siteUrl}/kalender.ics`
  const webcalUrl = icsUrl.replace(/^https?:\/\//, 'webcal://')
  const googleCalUrl = `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcalUrl)}`
  /** Address without protocol, for display + manual copy. */
  const icsDisplayUrl = icsUrl.replace(/^https?:\/\//, '')
  return { icsUrl, webcalUrl, googleCalUrl, icsDisplayUrl }
}

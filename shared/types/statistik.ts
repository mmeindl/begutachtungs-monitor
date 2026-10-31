/**
 * GET /api/statistik — the public page-view counts (docs/architecture.md
 * §12.65). Sums per day, per kind of page and per referring host; nothing in
 * it can name or single out a visitor.
 */

/**
 * One UTC day. Pages, the subscribed feed and calendars, and bots in three
 * columns that never overlap: a feed reader polls on a timer, so its fetches
 * are not page views and are not added to them.
 */
export interface StatistikTag {
  /** `YYYY-MM-DD` (UTC). */
  tag: string
  /** Reader requests for pages — every class except feed and calendars. */
  seiten: number
  /** `/feed.xml`, `/kalender.ics` and the per-draft deadline calendars. */
  feedKalender: number
  /** Requests attributed to programs, all classes together. */
  bots: number
}

/** One kind of page (a `Klasse` of `server/utils/zaehlung/klassen.ts`) over the window. */
export interface StatistikSeite {
  klasse: string
  aufrufe: number
}

export interface StatistikHerkunft {
  host: string
  aufrufe: number
}

export interface StatistikPayload {
  /** The first counted day, or null before anything was counted. */
  seit: string | null
  /** The three columns of `StatistikTag`, summed since `seit`. */
  gesamt: { seiten: number; feedKalender: number; bots: number }
  /** The last 30 days up to today, newest first; a day without a file reads 0. */
  tage: StatistikTag[]
  /** Reader requests per page class over those 30 days, in the order of `KLASSEN`, zeros included. */
  nachSeite: StatistikSeite[]
  /** The same for the feed and calendar classes. */
  nachAbo: StatistikSeite[]
  /** The 20 most frequent referring hosts over those 30 days. */
  herkunft: StatistikHerkunft[]
  /** When the newest day file was written, ISO. */
  stand: string | null
}

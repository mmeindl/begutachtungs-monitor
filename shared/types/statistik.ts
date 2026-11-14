/**
 * GET /api/statistik — the public page-view counts. Sums per day, per kind of page and per referring host; nothing in
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

/** One kind of page (a `Klasse` of `server/utils/zaehlung/klassen.ts`) since counting began. */
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
  /** Every day from `seit` up to today, newest first; a day without a file reads 0. */
  tage: StatistikTag[]
  /** Reader requests per page class since `seit`, most first (ties in `KLASSEN` order, `sonstige` last), zeros included. */
  nachSeite: StatistikSeite[]
  /** The same for the feed and calendar classes. */
  nachAbo: StatistikSeite[]
  /** The 20 most frequent referring hosts since `seit`, each with at least `HERKUNFT_MINDESTENS` visits. */
  herkunft: StatistikHerkunft[]
  /** When the newest day file was written, ISO. */
  stand: string | null
}

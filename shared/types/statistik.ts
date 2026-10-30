/**
 * GET /api/statistik — the public page-view counts (docs/architecture.md
 * §12.65). Sums per day and per referring host; nothing in it can name or
 * single out a visitor.
 */

/** One UTC day. Reader counts throughout, bots in their own column. */
export interface StatistikTag {
  /** `YYYY-MM-DD` (UTC). */
  tag: string
  /** Every counted reader request of the day, feed and calendar included. */
  aufrufe: number
  entwurfBund: number
  entwurfLand: number
  /** `/feed.xml`, `/kalender.ics` and the per-draft deadline calendars. */
  feedKalender: number
  /** Requests attributed to programs, all pages together. */
  bots: number
}

export interface StatistikHerkunft {
  host: string
  aufrufe: number
}

export interface StatistikPayload {
  /** The first counted day, or null before anything was counted. */
  seit: string | null
  /** Reader requests and bot requests since `seit`. */
  gesamt: { aufrufe: number; bots: number }
  /** The last 30 days up to today, newest first; a day without a file reads 0. */
  tage: StatistikTag[]
  /** The 20 most frequent referring hosts over those 30 days. */
  herkunft: StatistikHerkunft[]
  /** When the newest day file was written, ISO. */
  stand: string | null
}

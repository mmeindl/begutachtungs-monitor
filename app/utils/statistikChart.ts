/**
 * The pure half of the page-view chart on `/statistik` (`StatistikChart`):
 * which bars it draws and the scale they stand on. Imports only types, so
 * vitest reads it as it is.
 *
 * ONE BAR PER DAY while the days fit, ONE PER WEEK after that. The page
 * shows every day since counting began (14.11.2026), and from
 * `TAGE_HOECHSTENS` days on a day's bar would be narrower than the gap a
 * reader can see between two. Weeks start on Monday, the Austrian week.
 *
 * A bar is `offen` when its span is not fully counted: the day or week that
 * is still running, and the first week when counting began inside it. Such
 * a bar is drawn as an outline, so a short last bar does not read as a drop.
 */
import type { StatistikTag } from '#shared/types'

/** Above this many days, the chart sums weeks. */
export const TAGE_HOECHSTENS = 120

export interface Saeule {
  /** First day of the span, `YYYY-MM-DD`. */
  von: string
  /** Last counted day of the span. */
  bis: string
  seiten: number
  offen: boolean
}

export interface Saeulen {
  je: 'tag' | 'woche'
  /** Oldest first. */
  saeulen: Saeule[]
}

/** Monday of the UTC week `tag` is in. */
function montag(tag: string): string {
  const d = new Date(`${tag}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  return d.toISOString().slice(0, 10)
}

/** `tage` as the payload has them: newest first, the newest is today. */
export function saeulenAus(tage: readonly StatistikTag[]): Saeulen {
  const alt = [...tage].reverse()
  if (alt.length <= TAGE_HOECHSTENS) {
    return {
      je: 'tag',
      saeulen: alt.map((t, i) => ({ von: t.tag, bis: t.tag, seiten: t.seiten, offen: i === alt.length - 1 })),
    }
  }
  const wochen: (Saeule & { tage: number })[] = []
  for (const t of alt) {
    const von = montag(t.tag)
    const w = wochen.at(-1)
    if (w?.von === von) {
      w.bis = t.tag
      w.seiten += t.seiten
      w.tage++
    } else {
      wochen.push({ von, bis: t.tag, seiten: t.seiten, offen: false, tage: 1 })
    }
  }
  return {
    je: 'woche',
    saeulen: wochen.map(({ tage: n, ...w }, i) => ({ ...w, offen: n < 7 || i === wochen.length - 1 })),
  }
}

/**
 * Gridlines for values up to `max`: a step of 1, 2 or 5 × 10ⁿ, at most four
 * of them above zero, the top one at or above `max`. Whole numbers only, so
 * an empty or tiny chart gets 0 and 1, not halves of a page view.
 */
export function skala(max: number): number[] {
  const roh = Math.max(1, max) / 4
  const zehner = 10 ** Math.floor(Math.log10(roh))
  const schritt = Math.max(1, [1, 2, 5, 10].map((f) => f * zehner).find((s) => s >= roh)!)
  const oben = Math.max(1, Math.ceil(max / schritt)) * schritt
  const linien: number[] = []
  for (let v = 0; v <= oben; v += schritt) linien.push(v)
  return linien
}

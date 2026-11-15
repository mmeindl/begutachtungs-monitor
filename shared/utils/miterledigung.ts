/**
 * A Miterledigung (14.11.2026): Parliament dealt with an item together
 * with another one — „Verfassungsausschuss: Miterledigt mit Bericht 1637
 * d.B.", or in plenary „Auf der Tagesordnung der 249. Sitzung des
 * Nationalrates · Miterledigung". No decision on the item itself, and no
 * lapse either: before this module such an item read „Ohne Beschluss –
 * Gesetzgebungsperiode beendet" (XXVI/496). One reading for the item's page
 * (`houseOutcomeOf`) and the list's rows (`/api/antraege`).
 *
 * Pure module: no Nuxt auto-imports.
 */

/** Whether Parliament's status prose names a Miterledigung. */
export function isMiterledigt(statusText: string | null | undefined): boolean {
  return /Miterledig/i.test(statusText ?? '')
}

/**
 * The item the Miterledigung names, as Parliament cites it — „565 d.B." — or
 * null where the record names none (the plenary form).
 */
export function mergedWithCitation(statusText: string | null | undefined): string | null {
  const text = (statusText ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')
  const m = /Miterledigt mit (?:Bericht )?(\d+) ?(d\.B\.|\/[A-Z]+)/.exec(text)
  if (!m) return null
  return m[2] === 'd.B.' ? `${m[1]} d.B.` : `${m[1]}${m[2]}`
}

/** „Mit 565 d.B. miterledigt", or „Miterledigt" where no item is named. */
export function mergedDe(withCitation: string | null): string {
  return withCitation ? `Mit ${withCitation} miterledigt` : 'Miterledigt'
}

/**
 * The same from the item's Verlauf, where the status prose names none: the
 * plenary's „Miterledigung" stands in the status, the committee's „Miterledigt
 * mit Bericht 565 d.B." one step earlier in the Verlauf (XXVI/496, read
 * 14.11.2026). The status first; then the last Verlauf step that names an
 * item. Null where neither does.
 */
export function mergedWithOf(
  statusText: string | null | undefined,
  phases: readonly { stages?: readonly { text?: string | null }[] | null }[] | null | undefined,
): string | null {
  const fromStatus = mergedWithCitation(statusText)
  if (fromStatus || !isMiterledigt(statusText)) return fromStatus
  const steps = (phases ?? []).flatMap((p) => p.stages ?? [])
  for (let i = steps.length - 1; i >= 0; i--) {
    const c = mergedWithCitation(steps[i]?.text)
    if (c) return c
  }
  return null
}

/** The item a Miterledigung names, as Parliament links it — „565 d.B." at
 *  `/gegenstand/XXVI/I/565`. */
export interface MergedRef {
  gp: string
  ityp: string
  inr: number
  citation: string
}

/** The anchor right after „Miterledigt mit (Bericht)" in Parliament's prose. */
const MERGED_LINK = /Miterledigt mit (?:Bericht )?<a [^>]*href="[^"]*\/gegenstand\/([IVXLC]+)\/([A-Z]+)\/(\d+)"[^>]*>([^<]+)<\/a>/

function mergedRefIn(text: string | null | undefined): MergedRef | null {
  const m = MERGED_LINK.exec(text ?? '')
  if (!m) return null
  return { gp: m[1]!, ityp: m[2]!, inr: Number(m[3]), citation: m[4]!.replace(/\s+/g, ' ').trim() }
}

/**
 * `mergedWithOf`'s item with Parliament's own link to it (14.11.2026), so
 * the page can read its record and link our page of it: the status first,
 * then the last Verlauf step that links one — the same order. Null where no
 * step links the item; the citation alone then stays unlinked.
 */
export function mergedWithRefOf(
  statusText: string | null | undefined,
  phases: readonly { stages?: readonly { text?: string | null }[] | null }[] | null | undefined,
): MergedRef | null {
  if (!isMiterledigt(statusText)) return null
  const fromStatus = mergedRefIn(statusText)
  if (fromStatus) return fromStatus
  const steps = (phases ?? []).flatMap((p) => p.stages ?? [])
  for (let i = steps.length - 1; i >= 0; i--) {
    const ref = mergedRefIn(steps[i]?.text)
    if (ref) return ref
  }
  return null
}

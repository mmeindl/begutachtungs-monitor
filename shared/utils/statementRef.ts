/**
 * The address of one Stellungnahme — "XXVIII/SNME/5408" — as the batch
 * document lookup speaks it.
 *
 * Derived, never stored: every statement already carries `parliamentUrl`,
 * its page on parlament.gv.at, and the address is a pure function of that.
 * A second field spelling the same three values is a second thing to keep
 * in sync, and it is what the (now removed) per-statement redirect needed,
 * not what the lookup needs.
 */
import { GP_RE, INR_RE } from './gp'

export type StatementItemTypeRef = 'SNME' | 'SN'

export interface StatementRefParts {
  gp: string
  ityp: StatementItemTypeRef
  inr: number
}

/**
 * "XXVIII/SNME/5408" out of
 * "https://www.parlament.gv.at/gegenstand/XXVIII/SNME/5408".
 * Null for any other URL — a Stellungnahme is the only thing this addresses.
 */
export function statementRefFromPageUrl(pageUrl: string | null | undefined): string | null {
  const m = /\/gegenstand\/([IVXLC]+)\/(SNME|SN)\/(\d+)(?:[/?#]|$)/.exec(pageUrl ?? '')
  return m ? `${m[1]}/${m[2]}/${m[3]}` : null
}

/** Null for anything that is not a well-formed ref — the endpoint's guard. */
export function parseStatementRef(ref: string): StatementRefParts | null {
  const parts = ref.split('/')
  if (parts.length !== 3) return null
  const [gpRaw, itypRaw, inrRaw] = parts as [string, string, string]
  const gp = gpRaw.toUpperCase()
  const ityp = itypRaw.toUpperCase()
  if (!GP_RE.test(gp)) return null
  if (ityp !== 'SNME' && ityp !== 'SN') return null
  if (!INR_RE.test(inrRaw) || Number(inrRaw) < 1) return null
  return { gp, ityp, inr: Number(inrRaw) }
}

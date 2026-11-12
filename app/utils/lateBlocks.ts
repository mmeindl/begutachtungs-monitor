/**
 * What a page says about a block that is not there (12.11.2026): still on
 * its way, or failed — two states that must never read alike, and neither
 * of which may read as „none".
 *
 * Since the homepage's additions race a server deadline (`useLateFetch`),
 * a block can be missing from the delivered HTML without anything having
 * gone wrong. A count or a sentence computed without it would be a false
 * statement until it arrives, so every count that reads a late block asks
 * `settledCount`, and every block that can be missing beside rows already
 * shown says so in `blockStateLine`'s words.
 */
import type { HalfState } from '~/utils/draftFilters'

/**
 * A total only once every block it sums over has answered — `undefined`
 * while one is on its way, which `ListHeader` reads as „unknown" and shows
 * no number for. A failed block does not hold the number back: its failure
 * is said where it stands, and the rows that are there are counted.
 */
export function settledCount(total: number, states: readonly HalfState[]): number | undefined {
  return states.includes('loading') ? undefined : total
}

/**
 * The sentence under a box whose block is missing: „… werden noch geladen."
 * or „… sind gerade nicht abrufbar." — the failure in the page's existing
 * words (`Die Kundmachungen des Bundes sind gerade nicht abrufbar.`), the
 * pending state in `/entwuerfe`'s (`draftCountLabel`). Null where the block
 * is there or not asked for.
 *
 * @param subject The sentence's subject, with its comma where it is a clause
 * („Was aus den Entwürfen wurde,").
 */
export function blockStateLine(subject: string, number: 'singular' | 'plural', state: HalfState): string | null {
  if (state === 'loading') return `${subject} ${number === 'plural' ? 'werden' : 'wird'} noch geladen.`
  if (state === 'failed') return `${subject} ${number === 'plural' ? 'sind' : 'ist'} gerade nicht abrufbar.`
  return null
}

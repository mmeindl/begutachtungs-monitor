/**
 * The text an instruction announces and the PDF reader did not find in its
 * place (19.11.2026) — „2.1. … lautet die die Wildregion 2.3 betreffende
 * Zeile:", and nothing after the colon.
 *
 * PURE MODULE — relative imports only, so vitest runs it directly.
 *
 * WHY. A Land's PDF sets what an instruction announces as a table — a row of
 * a schedule, an entry of the table of contents — and its text layer puts
 * the table elsewhere or the reader drops it (`draftPdfLaw.ts` drops
 * table-of-contents entries by design). Where one side of a station
 * comparison lost the text and the other kept it, the comparison showed the
 * kept text as new or as gone: Salzburg 33884's Abschussplan rows as added in
 * the Landesgesetzblatt (the draft printed them, with other figures, after
 * its next instruction), Oberösterreich 16103's table-of-contents entry
 * „§ 49a Oö. Heizungs- und Klimaanlagendatenbank" as added although the
 * draft quotes it under its instruction. Where both sides lost it, the
 * instruction stood „unverändert", a claim about text neither side read.
 *
 * WHAT IS CHECKED, and only in an instruction (a „Z" unit; in a §, a colon
 * before a numbered list is the law's own text): an announcing word —
 * „lautet", „eingefügt", „Zeile", „wie folgt" … — before a colon, with
 * nothing after it but the end of the instruction or the next of its own
 * sub-instructions („2.2. "). A quotation or unquoted text after the colon
 * is the announced text, whatever it says: „Z 12 lautet wie folgt: 12.
 * Richtlinie …" is filled (Salzburg 33388), its „12." being the new
 * Ziffer's and not a sub-instruction of instruction 1.
 *
 * Quoted text that trails an instruction's own quotation is the other half
 * of the fault — the rows the text layer put after the next instruction
 * („… in Kraft.“ „ 2.3 45 86 61 “ „ 8.2 35 80 50 “). It is read as displaced
 * only where it is row-like (`OWN_QUOTE_RE`) and the instructions before it
 * in the same law left exactly as many announcements empty: Burgenland's
 * „folgende Z 5a … und folgende Z 8 und 9 angefügt: „5a. …“ „8. …“" quotes
 * twice for its own two insertions.
 */

/** The words that promise a text after the colon. „“" is Salzburg's typo for the colon („Zeile lautet“ 2.2.", 32706). */
const ANNOUNCING_RE = /(?:\blautet|\blauten|\beingefügt|\bangefügt|\bersetzt|\bZeilen?|\bEintr(?:ag|agung|äge|agungen)|\bÜberschrift|\bwie folgt)\s*[:“]/g

/** A quotation with its marks, balanced; what is left of „“ after masking stands alone. */
const QUOTED_RE = /„[^„“]*“/g
const MASK = '\uE000'

/** The instruction's own number: „Z2" and „Z2#dup" are instruction 2. */
function instructionNumber(id: string): string | null {
  return /^Z(\d+[a-z]*)/.exec(id)?.[1] ?? null
}

/**
 * How many texts the instruction announces and does not carry; 0 for a §
 * or any unit that is not an instruction.
 */
export function emptyAnnouncements(text: string, id: string): number {
  const n = instructionNumber(id)
  if (n === null) return 0
  const masked = text.replace(QUOTED_RE, MASK)
  // Its own sub-instructions, which open with a word: „2.2. Im …", „2.2 In
  // …", Salzburg's nesting „2.2.1. Nach …"; Oberösterreich's dash items „-
  // Der Eintrag … wird …". A row of figures is no sub-instruction: „Zeile:
  // 2.3 43 80 59" is the Abschussplan's Wildregion 2.3 (33884).
  const ownSub = new RegExp(`^(?:${n}\\.\\d+(?:\\.\\d+)*\\.?\\s+\\p{Lu}|-\\s+(?:Der|Die|Das|Dem|Den|Im|In|Nach|Vor)\\b)`, 'u')
  let empty = 0
  for (const m of masked.matchAll(ANNOUNCING_RE)) {
    const rest = masked.slice(m.index + m[0].length).trimStart()
    if (rest === '' || ownSub.test(rest)) empty++
  }
  return empty
}

/**
 * A quotation an instruction can carry for itself after its first: an
 * Absatz („(3) …"), a Ziffer or litera with its words („9. die
 * Rechtsnachfolge …", „b) …"), or anything longer than a row — Burgenland
 * appends „5a. …“ „8. …“ in one instruction. A row of figures („ 2.3 45 86
 * 61 ") or a table-of-contents entry („§ 49a …") is none of these.
 */
const OWN_QUOTE_RE = /^\s*(?:\(\d+[a-z]?\)|\d+[a-z]?\.\s+\p{L}|[a-z]\)\s)/u
const ROW_MAX = 80

/** The quotations that trail the one an instruction needs and could not be its own: a run at its end, after the first, row-like. */
function trailingQuotes(text: string): number {
  const quotes = [...text.matchAll(QUOTED_RE)]
  const masked = text.replace(QUOTED_RE, MASK).trimEnd()
  const run = /(?:\uE000\s*)+$/.exec(masked)?.[0] ?? ''
  const spans = [...run].filter((c) => c === MASK).length
  if (spans < 2) return 0
  const extra = quotes.slice(quotes.length - spans + 1).map((q) => q[0].slice(1, -1))
  return extra.every((q) => q.length <= ROW_MAX && !OWN_QUOTE_RE.test(q)) ? extra.length : 0
}

/** The fields of a unit as read that the check needs. */
export interface AnnouncedUnit {
  article: string | null
  id: string
  text: string
}

/**
 * The key a unit is found under from the comparison's side of it: its id and
 * its text as the comparison carries it (`fromText`, `toText`: the read text
 * without its quotation marks, `comparedText`) — not the Artikel's title,
 * which the comparison renames (a draft's „Verordnung … vom ……" is the
 * Landesgesetzblatt's „20. Verordnung … vom 11. März 2026").
 */
export const announcedKey = (id: string, compared: string) => `${id}\u0000${compared}`

/**
 * Per unit of one text as read, keyed `announcedKey(id, compared(text))`:
 * how many announcements it leaves empty, and whether it carries quotations
 * an instruction before it in the same law left room for (`displaced`). Read
 * from the text WITH its quotation marks — they are the evidence.
 */
export function announcedReading(units: readonly AnnouncedUnit[], compared: (text: string) => string = (t) => t): Map<string, { empty: number; displaced: boolean }> {
  const out = new Map<string, { empty: number; displaced: boolean }>()
  /* The empty announcements not yet accounted for, per law. */
  const open = new Map<string | null, number>()
  for (const u of units) {
    const empty = emptyAnnouncements(u.text, u.id)
    const extra = instructionNumber(u.id) === null ? 0 : trailingQuotes(u.text)
    const waiting = open.get(u.article) ?? 0
    const displaced = extra > 0 && extra === waiting
    out.set(announcedKey(u.id, compared(u.text)), { empty, displaced })
    open.set(u.article, (displaced ? waiting - extra : waiting) + empty)
  }
  return out
}

/**
 * What a comparison does with a unit whose announced text one side did not
 * read: `withhold` where the two sides read it differently — the diff would
 * show as new or gone what both documents carry —, `unread` where both lack
 * it alike (the rest of the instruction is compared; the announced text is
 * not), null where nothing is missing.
 */
export function announcedVerdict(
  change: 'unchanged' | 'changed' | 'inserted' | 'removed',
  from: { empty: number; displaced: boolean } | undefined,
  to: { empty: number; displaced: boolean } | undefined,
): 'withhold' | 'unread' | null {
  const f = from ?? { empty: 0, displaced: false }
  const t = to ?? { empty: 0, displaced: false }
  if ((f.displaced || t.displaced) && change !== 'unchanged') return 'withhold'
  if (!f.empty && !t.empty) return null
  // A unit on one side only: what it announces is missing from the text shown.
  if (change === 'inserted' || change === 'removed') return 'unread'
  return f.empty === t.empty ? 'unread' : 'withhold'
}

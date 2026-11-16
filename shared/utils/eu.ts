/**
 * The monitor's address of an EU act:
 * `/eu-recht/richtlinie/2024/1069` — the act's kind, year and
 * number as its citation reads, not its CELEX. Year and number alone would
 * not do: before 2015 a directive and a regulation could share both
 * („Richtlinie 2009/43/EG", „Verordnung (EG) Nr. 43/2009"), so the kind
 * stands in the path, as it does in EUR-Lex's ELI (`dir`, `reg`, `dec`).
 *
 * Pure module: auto-imported in `app/`, imported relatively by vitest.
 */

/** The path words, one per kind — the German nouns, lower case, as the site names things. */
export const EU_ACT_PATH_WORD: Record<'richtlinie' | 'verordnung' | 'beschluss' | 'rahmenbeschluss', string> = {
  richtlinie: 'richtlinie',
  verordnung: 'verordnung',
  beschluss: 'beschluss',
  rahmenbeschluss: 'rahmenbeschluss',
}

/**
 * Where the monitor's EU pages sit. The base flips to `/eu` with the rename
 * (the plan's step 6), and so it is written HERE ONCE: from now on no other
 * file writes it as a literal — a page, a link or a route builds its address
 * through `euPath`.
 */
export const EU_BASE_PATH = '/eu-recht'

/**
 * The Member State this site follows, as the Cellar's authority table names
 * it (`…/authority/country/AUT`). Written HERE ONCE, like the base path: a
 * second country's site changes this line, not a query.
 */
export const EU_MEMBER_STATE = 'AUT'
/**
 * The same Member State as the register of the European Citizens'
 * Initiative codes it (`countryCodeType`: „AT", and „GR" for Greece, not
 * „EL"; measured 15.11.2026). Beside the Cellar's code, so a second
 * country's site changes both lines here and nothing else.
 */
export const EU_MEMBER_STATE_ECI = 'AT'
/** The Member State as a sentence names it. */
export const EU_MEMBER_STATE_NAME_DE = 'Österreich'
/**
 * The title of the EU overview. „EU-Recht in der Begutachtung" until
 * 15.11.2026: since the page opens with the directives to transpose, also
 * those no draft names, it is no longer only about the Begutachtung.
 */
export const EU_PAGE_TITLE_DE = `EU-Recht in ${EU_MEMBER_STATE_NAME_DE}`

/** How far the list of directives to transpose looks back and ahead from today, in years. */
export const EU_UMSETZUNG_YEARS = 2

/**
 * The window of the list for a day: the same day two years before and
 * after („2024-11-15" – „2028-11-15" on 15.11.2026). A 29 February becomes
 * the 28th.
 */
export function euUmsetzungWindow(today: string): { from: string; to: string } {
  const shift = (years: number) => {
    const [y, m, d] = today.split('-').map(Number) as [number, number, number]
    const day = m === 2 && d === 29 ? 28 : d
    return `${y + years}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }
  return { from: shift(-EU_UMSETZUNG_YEARS), to: shift(EU_UMSETZUNG_YEARS) }
}

/**
 * An address below the EU base: `euPath('richtlinie', 2024, 1069)` →
 * `/eu-recht/richtlinie/2024/1069`, `euPath()` → the base itself. Each
 * segment is put in as given — the callers pass path words and numbers,
 * never a reader's input — and empty ones are dropped, so a slash is never
 * doubled.
 */
export function euPath(...segments: (string | number)[]): string {
  const parts = segments.map(String).filter((s) => s.length > 0)
  return parts.length ? `${EU_BASE_PATH}/${parts.join('/')}` : EU_BASE_PATH
}

/** The path word of the EU's „Wege der Gesetzgebung". */
export const EU_WEGE_PATH_WORD = 'wege'

/**
 * `/eu-recht/wege` — the EU's „Wege der Gesetzgebung" (16.11.2026): the EU
 * is a jurisdiction of its own, so its ways have a page of their own below
 * the EU base and move with it (step 6), while a country's ways stay on
 * the country's page.
 */
export function euWegePath(): string {
  return euPath(EU_WEGE_PATH_WORD)
}

/** The path word of an initiative of the Commission's portal (the plan's „The addresses"). */
export const EU_INITIATIVE_PATH_WORD = 'initiative'

/** The portal's numbers are short: 19,517 the highest on 15.11.2026. Nine digits leave room and keep any input bounded. */
const INITIATIVE_ID_RE = /^[1-9]\d{0,8}$/

/**
 * `/eu-recht/initiative/13192` — an initiative before a proposal, or a
 * draft act of the Commission, by the portal's own number; null for
 * anything that is no such number.
 */
export function euInitiativePath(id: number): string | null {
  return Number.isInteger(id) && INITIATIVE_ID_RE.test(String(id)) ? euPath(EU_INITIATIVE_PATH_WORD, id) : null
}

/** The portal's number from a path segment: digits only, no leading zero, bounded; null otherwise. */
export function euInitiativeId(segment: string): number | null {
  return INITIATIVE_ID_RE.test(segment) ? Number(segment) : null
}

/** The path word of a proposal of the Commission (the plan's „The addresses"). */
export const EU_PROPOSAL_PATH_WORD = 'vorschlag'

/** The first year a proposal's page is offered for: the Cellar's dossiers are uneven before (`OBSERVATORY_FIRST_YEAR` is 1994). */
export const EU_PROPOSAL_FIRST_YEAR = 1990

/** A COM number's own number: one to four digits, no leading zero — the canonical address carries no padding. */
const PROPOSAL_NUMBER_RE = /^[1-9]\d{0,3}$/

/**
 * `/eu-recht/vorschlag/2026/780` — a proposal of the Commission by its COM
 * number; null for a year before `EU_PROPOSAL_FIRST_YEAR` or of more than
 * four digits, and for a number outside 1…9999. The address carries no
 * padding: COM(2022) 177, not 0177.
 */
export function euProposalPath(year: number, number: number): string | null {
  if (!Number.isInteger(year) || year < EU_PROPOSAL_FIRST_YEAR || year > 9999) return null
  if (!Number.isInteger(number) || !PROPOSAL_NUMBER_RE.test(String(number))) return null
  return euPath(EU_PROPOSAL_PATH_WORD, year, number)
}

/**
 * Year and number from the two path segments, or null: a year of four
 * digits between `EU_PROPOSAL_FIRST_YEAR` and next year (`today`, ISO, gives
 * the year), a number of one to four digits without a leading zero. A
 * padded number („0780") is null here — the page answers it 301 to the
 * canonical address, the API 400.
 */
export function euProposalAddress(year: string, number: string, today: string): { year: number; number: number } | null {
  if (!/^\d{4}$/.test(year) || !PROPOSAL_NUMBER_RE.test(number)) return null
  const y = Number(year)
  const last = Number(today.slice(0, 4)) + 1
  if (y < EU_PROPOSAL_FIRST_YEAR || y > last) return null
  return { year: y, number: Number(number) }
}

/**
 * The monitor's page of a proposal from a COM number as the portal or the
 * Cellar writes it — „COM(2026)780", „COM(2026) 780", „COM (2026) 0780" —;
 * null for anything else, a composite number („COM(1995) 722 - 3") included.
 */
export function euProposalPathOfReference(reference: string | null): string | null {
  const m = reference ? /^COM\s*\(\s*(\d{4})\s*\)\s*(\d{1,4})$/.exec(reference.trim()) : null
  return m ? euProposalPath(Number(m[1]), Number(m[2])) : null
}

/** The path word of a European Citizens' Initiative (the plan's „The addresses"). */
export const EU_CITIZENS_INITIATIVE_PATH_WORD = 'buergerinitiative'

/** The first year of the register: Regulation (EU) No 211/2011 applied from 1 April 2012. */
export const EU_CITIZENS_INITIATIVE_FIRST_YEAR = 2012

/** A register number's own number: one to six digits, no leading zero — the register pads it to six („000002"), the address does not. */
const CITIZENS_INITIATIVE_NUMBER_RE = /^[1-9]\d{0,5}$/

/**
 * `/eu-recht/buergerinitiative/2022/2` — a European Citizens' Initiative by
 * its register number, ECI(2022)000002; null for a year before
 * `EU_CITIZENS_INITIATIVE_FIRST_YEAR` or of more than four digits, and for a
 * number outside 1…999999. The address carries no padding.
 */
export function euCitizensInitiativePath(year: number, number: number): string | null {
  if (!Number.isInteger(year) || year < EU_CITIZENS_INITIATIVE_FIRST_YEAR || year > 9999) return null
  if (!Number.isInteger(number) || !CITIZENS_INITIATIVE_NUMBER_RE.test(String(number))) return null
  return euPath(EU_CITIZENS_INITIATIVE_PATH_WORD, year, number)
}

/**
 * Year and number from the two path segments, or null: a year of four
 * digits between `EU_CITIZENS_INITIATIVE_FIRST_YEAR` and next year (`today`,
 * ISO, gives the year), a number of one to six digits without a leading
 * zero. A padded number („000002", as the register writes it) is null here —
 * the page answers it 301 to the canonical address, the API 400.
 */
export function euCitizensInitiativeAddress(year: string, number: string, today: string): { year: number; number: number } | null {
  if (!/^\d{4}$/.test(year) || !CITIZENS_INITIATIVE_NUMBER_RE.test(number)) return null
  const y = Number(year)
  if (y < EU_CITIZENS_INITIATIVE_FIRST_YEAR || y > Number(today.slice(0, 4)) + 1) return null
  return { year: y, number: Number(number) }
}

/** „ECI(2022)000002" — the register's own spelling of the number, for the identity line. */
export function euCitizensInitiativeReference(year: number, number: number): string {
  return `ECI(${year})${String(number).padStart(6, '0')}`
}

const CELEX_LETTER: Record<string, keyof typeof EU_ACT_PATH_WORD> = { L: 'richtlinie', R: 'verordnung', D: 'beschluss', F: 'rahmenbeschluss' }
const CELEX_RE = /^3(\d{4})([LRDF])(\d{4})$/

/** `/eu-recht/richtlinie/2024/1069` from `32024L1069`; null for anything that is no CELEX of an act. */
export function euActPath(celex: string): string | null {
  const m = CELEX_RE.exec(celex)
  if (!m) return null
  const kind = CELEX_LETTER[m[2]!]
  if (!kind) return null
  return euPath(EU_ACT_PATH_WORD[kind], m[1]!, Number(m[3]))
}

/** `32024L1069` from the three path segments; null for a path that names no act. */
export function euActCelex(kind: string, year: string, number: string): string | null {
  const letter = (Object.entries(CELEX_LETTER).find(([, k]) => EU_ACT_PATH_WORD[k] === kind) ?? [])[0]
  if (!letter || !/^\d{4}$/.test(year) || !/^[1-9]\d{0,3}$/.test(number)) return null
  return `3${year}${letter}${number.padStart(4, '0')}`
}

// Four spellings among the 114 titles read on 05.11.2026: „(… EWR)" 58 times,
// „(… EWR.)" three, „(… EWR. )" once, a bare „… EWR" once.
const EEA_RE = /\s*\(?\s*Text von Bedeutung für den EWR\.?\s*\)?\.?\s*$/
const MONTHS_DE = 'Januar|Jänner|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember'
// `\s` at every gap: EUR-Lex writes a no-break space between day and month
// in most titles („vom 22.\u00a0November 2023"), an ASCII one in the rest.
const DATED_RE = new RegExp(`\\svom\\s\\d{1,2}\\.\\s(?:${MONTHS_DE})\\s\\d{4}\\s`)

/**
 * The official title as a citation carries it: whole, without the trailing
 * „(Text von Bedeutung für den EWR)" — a note on the act's scope, not part
 * of its name, and on 126 of the map's 230 titles (06.11.2026). Null for no
 * title.
 */
export function euActTitle(title: string | null): string | null {
  return title?.trim().replace(EEA_RE, '').trim() || null
}

/**
 * What an act's official title says after its name and date — „über den
 * Schutz von Personen, die sich öffentlich beteiligen, …" from „Richtlinie
 * (EU) 2024/1069 des Europäischen Parlaments und des Rates vom 11. April
 * 2024 über den Schutz …". The first word stays lower case, as the
 * official grammar has it; a trailing „(Text von Bedeutung für den EWR)"
 * goes. Where no „vom <Tag>" stands, the whole title — still right, only
 * longer. Null for no title. Nothing else is touched: the no-break spaces
 * inside stay („Nr.\u00a0909/2014" must not break), and EUR-Lex's own casing
 * stays where it is odd. Never clamped where shown — the Kurzname stands at
 * the END of these titles.
 */
export function euActSubject(title: string | null): string | null {
  if (!title) return null
  const stripped = euActTitle(title) ?? ''
  const m = DATED_RE.exec(stripped)
  const subject = (m ? stripped.slice(m.index + m[0].length) : stripped).trim()
  return subject || null
}

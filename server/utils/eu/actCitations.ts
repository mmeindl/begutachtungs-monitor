/**
 * EU acts as German legal text cites them → CELEX number, ELI link and a
 * label (docs/architecture.md §12.66).
 *
 * PURE MODULE — text in, acts out; no Nitro globals, relative imports only,
 * so the corpus script (`scripts/corpus/eu.ts`) measures this file and not a
 * copy of it, and the Länder can run it over Landesgesetz text unchanged.
 *
 * The forms, all measured over the RIS Begut corpus since 2024 (04.11.2026):
 *
 * - „Richtlinie (EU) 2024/1069", „Verordnung (EU) 2022/2065" — since 2015,
 *   year first, the organisation in brackets;
 * - „Verordnung (EG) Nr. 1907/2006", „Verordnung (EU) Nr. 517/2014" — the
 *   old regulation form, number first, after „Nr.";
 * - „Richtlinie 2014/36/EU", „Beschluss Nr. 1313/2013/EU" — the old
 *   directive and decision form, organisation as a suffix;
 * - „RL 2019/1937", „VO 2016/679" — abbreviated, four-digit year, no anchor;
 * - „Richtlinie 2024/1785", „Durchführungsbeschluss 2023/2749" — the kind
 *   word alone, without organisation (a Land's AEV, 05.11.2026): only since
 *   2015, year first (`ACT_BARE`);
 * - lists that inherit the type: „der Richtlinien (EU) 2022/2464 und (EU)
 *   2023/2775", „… und 2014/36/EU".
 *
 * Case-insensitive on purpose: „Saisonarbeiter-Richtlinien (2014/36/EU)" and
 * „RL" both occur — the number with its (EU)/EU anchor keeps a national
 * „Förderrichtlinie" out, not the capital R.
 *
 * NOT READ: acts named by a short name only („IE-Richtlinie", „DSGVO",
 * „EMFA"). v1 resolves no short names (rule D7) — no lookup table to age.
 */

/** What kind of act — the CELEX type letter follows from it. */
export type EuActKind = 'richtlinie' | 'verordnung' | 'beschluss' | 'rahmenbeschluss'

export interface EuAct {
  kind: EuActKind
  year: number
  number: number
  /** „32024L1069" — sector 3, year, type letter, four-digit number. */
  celex: string
  /** The act in EUR-Lex, German: `https://eur-lex.europa.eu/eli/dir/2024/1069/oj/deu`. */
  eli: string
  /** How the page names it: „Richtlinie (EU) 2024/1069", „Richtlinie 2009/43/EG". */
  label: string
  /** As printed in the source, whitespace normalised — for the corpus run and the tests. */
  raw: string
}

const TYPE_LETTER: Record<EuActKind, string> = { richtlinie: 'L', verordnung: 'R', beschluss: 'D', rahmenbeschluss: 'F' }
const ELI_TYPE: Record<EuActKind, string> = { richtlinie: 'dir', verordnung: 'reg', beschluss: 'dec', rahmenbeschluss: 'dec_framw' }

const ORG = String.raw`\((?:EU|EG|EWG|EGKS|Euratom)(?:\s*,\s*Euratom)?\)`
const SUFFIX = String.raw`(?:EU|EG|EWG|EGKS|Euratom|JI|GASP)`
/**
 * The type word, inflected: „Richtlinie(n)", „Verordnung(en)", „Beschluss(es)",
 * „Entscheidung(en)", with the Durchführungs-/Delegierte/Rahmen- forms.
 */
const TYPE = String.raw`(?:(?:Durchführungs|Rahmen)?(?:richtlinie|verordnung|beschluss|entscheidung)|Delegierte[nr]?\s+(?:Richtlinie|Verordnung|Beschluss)|(?<![A-Za-zÄÖÜäöüß])(?:RL|VO))(?:en|n|es|e)?`

/** „Richtlinie (EU) 2024/1069", „Verordnung (EG) Nr. 1907/2006", „RL EU 2024/1069". */
const ACT_ORG = new RegExp(String.raw`(${TYPE})\s*(?:${ORG}|EU)\s*(Nr\.\s*)?(\d{1,4})\s*/\s*(\d{1,4})(?!\s*/\s*\d)`, 'giu')
/** „Richtlinie 2014/36/EU", „Richtlinien (2014/36/EU)", „Beschluss Nr. 1313/2013/EU". */
const ACT_SUFFIX = new RegExp(String.raw`(${TYPE})\s*\(?\s*(Nr\.\s*)?(\d{2,4})\s*/\s*(\d{1,4})\s*/\s*${SUFFIX}\b`, 'giu')
/** „RL 2019/1937", „VO 2016/679": the abbreviation with a four-digit year and no anchor at all. */
const ACT_ABBREVIATED = /(?<![A-Za-zÄÖÜäöüß])(RL|VO)\s*(\d{4})\s*\/\s*(\d{1,4})\b(?!\s*\/)/gu
/**
 * „Richtlinie 2024/1785", „Durchführungsbeschluss 2023/2749", „Delegierte
 * Verordnung 2024/1366": the kind word standing alone, then year/number with
 * nothing after it — no organisation in brackets, no suffix. Only the
 * numbering since 2015 (year first, `BARE_FIRST_YEAR`): before it, a/b is
 * number/year for a regulation and year/number for a directive, and without
 * the organisation nothing says which („Richtlinie 2014/36" stays out). The
 * word must not end a compound („Förderrichtlinie 2024/12",
 * „Sonder-Richtlinie 2024/3") — no letter and no hyphen directly before it — and is
 * case-sensitive, as a noun opening the citation. Not after the number: a
 * further „/" or digit (a suffix form or a Geschäftszahl, „2024/12/3"), or a
 * decimal („2024/1.5").
 */
const BARE_TYPE = String.raw`(?:Durchführungs(?:richtlinie|verordnung|beschluss)|Delegierte[nr]?\s+(?:Richtlinie|Verordnung|Beschluss)|Richtlinie|Verordnung|Beschluss)(?:en|n|es|e)?`
const ACT_BARE = new RegExp(String.raw`(?<![\p{L}\-])(${BARE_TYPE})\s+(\d{4})\s*\/\s*(\d{1,4})(?![\d/]|\s*\/|[.,]\d)`, 'gu')
/** The first year of the numbering „year/number" for every kind of act. */
const BARE_FIRST_YEAR = 2015

/**
 * Whether a bare „<year>/<number>" is a citation the bare form may read: a
 * year from 2015 to this year. A rule against a span of years („Richtlinie
 * 2024/25" for a funding year) was measured and dropped (05.11.2026): over
 * both corpora it caught no national act and refused one real one,
 * „Durchführungsverordnung 2025/26 vom 30.10.2024".
 */
function bareCitation(year: number): boolean {
  return year >= BARE_FIRST_YEAR && year <= new Date().getUTCFullYear()
}

/** „…, (EU) 2023/2775", „und 2014/36/EU" after a typed act: the list inherits the type. */
const ACT_CONTINUATION = new RegExp(
  String.raw`^\s*(?:,|und|sowie|oder|bzw\.)\s*(?:der|die|den|des)?\s*(?:${ORG}\s*(Nr\.\s*)?(\d{1,4})\s*/\s*(\d{1,4})(?!\s*/\s*\d)|\(?\s*(\d{2,4})\s*/\s*(\d{1,4})\s*/\s*${SUFFIX}\b)`,
  'u',
)

/**
 * An act named inside another act's title: „Richtlinie (EU) 2019/944 … und
 * zur Änderung der Richtlinie 2012/27/EU", „… zur Aufhebung der Richtlinien
 * 2006/48/EG und 2006/49/EG". The draft implements the first, not the
 * second — one ElWG draft counted 34 acts before this rule (04.11.2026).
 * „in der Fassung der Richtlinie (EU) 2024/1711" stays: that is usually the
 * act the draft adds.
 */
const TITLE_REFERENCE = /(?:Änderung|Aufhebung|Ersetzung)\s+(?:der|des|von)\s*$/

/**
 * An act a provision only REFERS to: introduced by „nach der", „gemäß",
 * „im Sinne der", „entsprechend", „aufgrund", „laut" — directly, or through
 * an article, annex or paragraph of it („nach Art. 6 Abs. 4 der Richtlinie
 * …"). Inside an implementing window it is not the object of „umgesetzt":
 * Burgenland's GADG (bgld-c372) writes „soweit dies zur Umsetzung der
 * Richtlinie (EU) Nr. 2016/2102 … erforderlich ist … harmonisierten Normen,
 * deren Referenzen nach der Verordnung (EU) Nr. 1025/2012 im Amtsblatt …
 * veröffentlicht wurden", and 1025/2012 stood on the page as an act the draft
 * implements (05.11.2026). An enumeration item („1. Richtlinie …") is never
 * introduced so, and stays whole.
 */
const REFERENCE_PHRASE = /(?<![\p{L}])(?:nach|gemäß|im\s+Sinne?|entsprechend|aufgrund|auf\s+Grund|laut)\s+(?:(?:Art(?:ikel|\.)?|Anh(?:ang|\.)|Abs\.?|Z|lit\.?)\s*[\p{L}\d.()\s,]{0,40}?\s)?(?:der|des|dem|den)?\s*$/u

/**
 * An act's title begins right after its citation: „… des Europäischen
 * Parlaments und des Rates", „vom 10. März 2023", „über …", „zur …",
 * „betreffend …". A citation followed by anything else has no title here.
 */
const TITLE_OPENER = /^\s*,?\s*(?:des\s+(?:Europäischen|Rates)|der\s+Kommission|des\s+Rates|vom\s+\d|über\s|zur\s|zum\s|betreffend\s|hinsichtlich\s|mit\s|für\s)/u
/** An act's kind word ahead, an adjective allowed: „die delegierte RL (EU) 2022/2100". */
const ACT_AHEAD = String.raw`(?=(?:[Dd]elegierte[nr]?\s+)?(?:[\p{L}-]*(?:[Rr]ichtlinie|[Vv]erordnung|[Bb]eschluss|[Ee]ntscheidung)|RL\b|VO\b))`
const MONTH = String.raw`(?:Januar|Jänner|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)`
/**
 * What ends a title (05.11.2026), measured over both corpora: the OJ
 * reference („ABl. L 2024/1309"), a „;", a sentence end, the next
 * enumeration item, the amendment phrase („, in der Fassung der …" — D4a,
 * the act the draft adds), and a second act joined as an object of its own
 * („… sowie die delegierte RL (EU) 2022/2100"). A parenthesised short name
 * ends it too (`SHORT_NAME`), and a genitive join before the title names an
 * act (`GENITIVE_JOIN`).
 */
const TITLE_END = new RegExp([
  String.raw`\bABl\b`,
  ';',
  String.raw`(?<!\b(?:Nr|S|Art|Abs|lit|Z|bzw|idF|vgl|iVm|Pkt|Anh)|(?:^|\s)\d{1,3}[a-z]?)\.(?=\s+[A-ZÄÖÜ„"]|\s*$)`,
  String.raw`\s(?:\d{1,3}[a-z]?\.(?!\s*${MONTH}\b)|[a-z]\)|[-–•])\s`,
  String.raw`(?:in\s+der\s+(?:jeweils\s+)?(?:geänderten\s+|geltenden\s+)?Fassung|(?:zuletzt\s+)?geändert\s+durch)\b`,
  String.raw`(?:,|\s(?:und|sowie|bzw\.|oder))\s+(?:die|den)\s+${ACT_AHEAD}`,
].join('|'), 'u')
/**
 * A second act in the genitive: „… über die Ausfuhr von Kulturgütern und
 * der Richtlinie 2014/60/EU" joins an act of its own, „zur Änderung der
 * Richtlinie 2003/59/EG über … und der Richtlinie 2006/126/EG" continues
 * the title's own list. Which one it is shows in what came before: a title
 * names an act before it lists a second (`titleSpanEnd`).
 */
const GENITIVE_JOIN = new RegExp(String.raw`(?:,|\s(?:und|sowie|bzw\.|oder))\s+(?:der|des)\s+${ACT_AHEAD}`, 'gu')
/**
 * A parenthesised short name that closes a title: „(Gigabit-Infrastrukturverordnung)",
 * „(„FFH-Richtlinie“)", „(im Folgenden: EPBD)", „(RED III RL)" — never an
 * organisation („Verordnungen (EG) Nr. 765/2008").
 */
const SHORT_NAME = /\((?!(?:EU|EG|EWG|EGKS|Euratom)(?:\s*,\s*Euratom)?\))(?:im\s+Folgenden:?\s*)?(?:[„"»][^()]{1,80}|[^()\d/]{0,60}(?:[Rr]ichtlinie|[Vv]erordnung|RL|VO|Beschluss)[“"«]?|[A-ZÄÖÜ][A-ZÄÖÜ0-9 .-]{1,15})\)/u
/** A title never runs further than this; a text whose structure was not seen ends there. */
const TITLE_CEILING = 800

/**
 * Where the title of the act whose citation (or list) ends at `from` ends —
 * `from` itself where none begins (`TITLE_OPENER`). A citation inside it —
 * „Durchführungsverordnung (EU) 2023/564 … betreffend … die gemäß der
 * Verordnung (EG) Nr. 1107/2009 … geführten Aufzeichnungen" (t-2026-734),
 * „Richtlinie (EU) 2023/2413 … zur Änderung der Richtlinie (EU) 2018/2001,
 * der Verordnung (EU) 2018/1999 und der Richtlinie 98/70/EG …" — is part of
 * the title, not an act of the draft.
 */
export function titleSpanEnd(text: string, from: number): number {
  const after = text.slice(from, from + TITLE_CEILING)
  if (!TITLE_OPENER.test(after)) return from
  const ends = [TITLE_END.exec(after)?.index, (() => {
    const m = SHORT_NAME.exec(after)
    return m ? m.index + m[0].length : undefined
  })()].filter((n): n is number => n !== undefined)
  const end = ends.length ? Math.min(...ends) : after.length
  // A genitive join before any act of the title's own joins a second act to the first.
  for (const m of after.slice(0, end).matchAll(GENITIVE_JOIN)) {
    if (!readEuActCitations(after.slice(0, m.index)).occurrences.length) return from + m.index
  }
  return from + end
}

function kindOf(word: string): EuActKind {
  const w = word.toLowerCase()
  if (w.startsWith('rahmen')) return 'rahmenbeschluss'
  if (w.includes('richtlinie') || w === 'rl') return 'richtlinie'
  if (w.includes('verordnung') || w === 'vo' || w === 'voen') return 'verordnung'
  return 'beschluss'
}

/** The type word as the label prints it, nominative singular: „Durchführungsverordnung", „Delegierte Richtlinie". */
function wordOf(word: string, kind: EuActKind): string {
  const w = word.toLowerCase().replace(/\s+/g, ' ')
  if (w.startsWith('delegiert')) return kind === 'richtlinie' ? 'Delegierte Richtlinie' : kind === 'verordnung' ? 'Delegierte Verordnung' : 'Delegierter Beschluss'
  if (w.startsWith('durchführungs')) return kind === 'richtlinie' ? 'Durchführungsrichtlinie' : kind === 'verordnung' ? 'Durchführungsverordnung' : 'Durchführungsbeschluss'
  if (w.startsWith('entscheidung')) return 'Entscheidung'
  return { richtlinie: 'Richtlinie', verordnung: 'Verordnung', beschluss: 'Beschluss', rahmenbeschluss: 'Rahmenbeschluss' }[kind]
}

function fullYear(y: number): number {
  return y < 100 ? 1900 + y : y
}

function plausibleYear(y: number): boolean {
  const full = fullYear(y)
  return full >= 1952 && full <= 2030
}

/**
 * Year and number from „a/b". „Nr." means the old order, number first
 * („Verordnung (EU) Nr. 517/2014"); without it a four-digit year in front is
 * the order since 2015 („Richtlinie (EU) 2024/1069"), and anything else is
 * number/year written without the „Nr." („(EU) 1303/2013").
 */
function orderOrg(nr: boolean, a: number, b: number): { year: number; number: number } {
  // „Verordnung (EU) Nr. 2022/2065": the „Nr." of the old form before the new
  // order — read year first where the second number cannot be a year.
  if (nr) return plausibleYear(b) || !plausibleYear(a) ? { year: fullYear(b), number: a } : { year: a, number: b }
  if (a >= 1990 && a <= 2030) return { year: a, number: b }
  return { year: fullYear(b), number: a }
}

/** The suffix form is year first („2014/36/EU") unless „Nr." says otherwise („Nr. 1313/2013/EU"). */
function orderSuffix(nr: boolean, a: number, b: number): { year: number; number: number } {
  return nr && plausibleYear(b) ? { year: fullYear(b), number: a } : { year: fullYear(a), number: b }
}

/**
 * The organisation as the act's own title writes it: from the citation where
 * it says one, else by date — EWG before the Maastricht treaty, EG until
 * Lisbon (1 December 2009), EU after.
 */
function orgOf(raw: string, year: number): string {
  const m = /\((EU|EG|EWG|EGKS|Euratom)\b|\/(EU|EG|EWG|EGKS|Euratom|JI|GASP)\b/.exec(raw)
  if (m) return (m[1] ?? m[2])!
  return year >= 2010 ? 'EU' : year >= 1993 ? 'EG' : 'EWG'
}

/**
 * The label in the act's own citation form: since 2015 „Richtlinie (EU)
 * 2024/1069"; before, „Richtlinie 2009/43/EG" and „Verordnung (EG) Nr.
 * 1907/2006".
 */
function labelOf(word: string, kind: EuActKind, year: number, number: number, org: string): string {
  if (year >= 2015) return `${word} (${org}) ${year}/${number}`
  if (kind === 'verordnung') return `${word} (${org}) Nr. ${number}/${year}`
  return `${word} ${year}/${number}/${org}`
}

/** CELEX of an act: `3` + year + type letter + four-digit number. */
export function celexOf(kind: EuActKind, year: number, number: number): string {
  return `3${year}${TYPE_LETTER[kind]}${String(number).padStart(4, '0')}`
}

/** The act's German page in EUR-Lex, by its ELI. */
export function eliOf(kind: EuActKind, year: number, number: number): string {
  return `https://eur-lex.europa.eu/eli/${ELI_TYPE[kind]}/${year}/${number}/oj/deu`
}

function makeAct(raw: string, typeWord: string, year: number, number: number): EuAct | null {
  if (year < 1952 || year > 2030 || number < 1 || number > 9999) return null
  const kind = kindOf(typeWord)
  const text = raw.replace(/\s+/g, ' ').trim()
  return {
    kind,
    year,
    number,
    celex: celexOf(kind, year, number),
    eli: eliOf(kind, year, number),
    label: labelOf(wordOf(typeWord, kind), kind, year, number, orgOf(text, year)),
    raw: text,
  }
}

export interface CitationOptions {
  /**
   * Drop acts named inside another act's title („zur Änderung der Richtlinie
   * 2012/27/EU") — for the windows that say which act a draft implements,
   * not for counting citations.
   */
  implemented?: boolean
  /**
   * Drop acts a provision only refers to (`REFERENCE_PHRASE`: „nach der
   * Verordnung …", „gemäß Richtlinie …") — for an implementing window,
   * where they are not the object of the verb.
   */
  withoutReferences?: boolean
}

/** What one reading found: the acts, and how many title references it dropped. */
export interface Citations {
  acts: EuAct[]
  /** Every citation kept, in order of appearance, repeats included — with its offset in `text`. */
  occurrences: { at: number; act: EuAct }[]
  titleReferencesDropped: number
  /** Citations dropped as mere references (`withoutReferences`). */
  referencesDropped: number
}

/** Every act cited in `text`, in order, with list continuations; deduped by CELEX. */
export function readEuActCitations(text: string, options: CitationOptions = {}): Citations {
  /** Each citation, with the end of the list it heads (`listEnd`, on the head only). */
  const found: { at: number; act: EuAct; listEnd?: number }[] = []
  let dropped = 0
  let references = 0
  /** Skip the list after a dropped citation — it belongs to the same title or reference — and count it. */
  const skipList = (end: number): number => {
    let rest = end
    let n = 1
    for (let guard = 0; guard < 12; guard++) {
      const m = ACT_CONTINUATION.exec(text.slice(rest))
      if (!m) break
      rest += m[0].length
      n++
    }
    return n
  }
  const take = (at: number, end: number, typeWord: string, order: { year: number; number: number }) => {
    const act = makeAct(text.slice(at, end), typeWord, order.year, order.number)
    if (!act) return
    if (options.implemented && TITLE_REFERENCE.test(text.slice(Math.max(0, at - 40), at))) {
      dropped += skipList(end)
      return
    }
    if (options.withoutReferences && REFERENCE_PHRASE.test(text.slice(Math.max(0, at - 80), at))) {
      references += skipList(end)
      return
    }
    const head: { at: number; act: EuAct; listEnd?: number } = { at, act, listEnd: end }
    found.push(head)
    // The list after it: „der Richtlinien (EU) 2022/2464 und (EU) 2023/2775".
    let rest = end
    for (let guard = 0; guard < 12; guard++) {
      const m = ACT_CONTINUATION.exec(text.slice(rest))
      if (!m) break
      const next = m[2] !== undefined
        ? orderOrg(Boolean(m[1]), Number(m[2]), Number(m[3]))
        : orderSuffix(false, Number(m[4]), Number(m[5]))
      const cont = makeAct(m[0], typeWord, next.year, next.number)
      if (cont) found.push({ at: rest, act: cont })
      rest += m[0].length
    }
    head.listEnd = rest
  }
  for (const m of text.matchAll(ACT_ORG)) take(m.index!, m.index! + m[0].length, m[1]!, orderOrg(Boolean(m[2]), Number(m[3]), Number(m[4])))
  for (const m of text.matchAll(ACT_SUFFIX)) take(m.index!, m.index! + m[0].length, m[1]!, orderSuffix(Boolean(m[2]), Number(m[3]), Number(m[4])))
  for (const m of text.matchAll(ACT_ABBREVIATED)) take(m.index!, m.index! + m[0].length, m[1]!, { year: Number(m[2]), number: Number(m[3]) })
  for (const m of text.matchAll(ACT_BARE)) {
    if (bareCitation(Number(m[2]))) take(m.index!, m.index! + m[0].length, m[1]!, { year: Number(m[2]), number: Number(m[3]) })
  }
  found.sort((a, b) => a.at - b.at)
  // An act named inside another act's title is none of its own (`titleSpanEnd`).
  let kept: { at: number; act: EuAct; listEnd?: number }[] = found
  if (options.implemented) {
    kept = []
    // Each kept act's title, from the end of its list (whose items are acts of their own) to the title's end.
    const titles: [number, number][] = []
    for (const f of found) {
      if (titles.some(([from, to]) => f.at >= from && f.at < to)) {
        dropped++
        continue
      }
      kept.push(f)
      if (f.listEnd !== undefined) titles.push([f.listEnd, titleSpanEnd(text, f.listEnd)])
    }
  }
  return { acts: uniqueActs([kept.map((f) => f.act)]), occurrences: kept.map(({ at, act }) => ({ at, act })), titleReferencesDropped: dropped, referencesDropped: references }
}

/**
 * `text` with every act's title blanked (`titleSpanEnd`), its length kept:
 * what a provision says in its own words. A reference list names „Verordnung
 * (EU) 2018/1212 zur Festlegung von Mindestanforderungen zur Umsetzung der
 * Bestimmungen der Richtlinie 2007/36/EG" — words of the act's title, not of
 * the provision (Börsegesetz 2018 § 190, 05.11.2026).
 */
export function withoutActTitles(text: string): string {
  let out = text
  for (const { at, act } of readEuActCitations(text).occurrences) {
    const end = titleSpanEnd(text, at + act.raw.length)
    if (end > at + act.raw.length) out = out.slice(0, at + act.raw.length) + ' '.repeat(end - at - act.raw.length) + out.slice(end)
  }
  return out
}

/** Every act cited in `text` — `readEuActCitations` without the bookkeeping. */
export function parseEuActCitations(text: string, options: CitationOptions = {}): EuAct[] {
  return readEuActCitations(text, options).acts
}

/** Several lists as one, first occurrence wins. */
export function uniqueActs(lists: readonly (readonly EuAct[])[]): EuAct[] {
  const seen = new Set<string>()
  return lists.flat().filter((a) => !seen.has(a.celex) && seen.add(a.celex))
}

/**
 * „X …, in der Fassung der Y", „X, (zuletzt) geändert durch Y": X is the base
 * text, and Y the amendment the draft adds. The one place the law text says
 * so itself — the EABG's „§ 3. Dieses Gesetz dient der Umsetzung der
 * Richtlinie (EU) 2018/2001 …, in der Fassung der Richtlinie (EU) 2024/1711"
 * is a 2026 draft for the 2024 amendment, and 2018/2001's deadline of 2021
 * is not its deadline. The same class misled the Erläuterungen reading of
 * the NLAV (04.11.2026).
 */
const AMENDED_BY = /(?:in\s+der\s+(?:jeweils\s+)?(?:geänderten\s+)?Fassung|(?:zuletzt\s+)?geändert\s+durch)\s+(?:der|des|die|den)?\s*$/

/** The CELEX numbers `text` names as the base of an amending act it names next (`AMENDED_BY`). */
export function baseActCelexes(text: string): Set<string> {
  const { occurrences } = readEuActCitations(text, { implemented: true })
  const base = new Set<string>()
  for (let i = 0; i + 1 < occurrences.length; i++) {
    const here = occurrences[i]!
    const next = occurrences[i + 1]!
    if (next.act.celex === here.act.celex) continue
    // Between the two: the base's title and its OJ reference („ABl. Nr. L
    // 328 vom 21.12.2018 S. 82" — full of points, so no sentence test), then
    // the phrase, directly before the next act.
    if (AMENDED_BY.test(text.slice(here.at, next.at))) base.add(here.act.celex)
  }
  return base
}

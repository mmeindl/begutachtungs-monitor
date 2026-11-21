/**
 * The right column of a Land's Textgegenüberstellung against the wording
 * the draft itself quotes for the § — word for word and in order
 * (20.11.2026).
 *
 * PURE MODULE — relative imports only, so vitest runs it directly.
 *
 * The rule „nicht im Entwurf" (`landTguGuard.ts`) asks whether the words a §
 * shows as new occur among the words the draft's instructions carry for it:
 * a bag, with floors. A wrongly read word, a changed number and a lost
 * sentence pass it by construction, and the fault injection measured that
 * (0 of 476, 0 of 551, 0 of 338 on GP XXVIII, 19.11.2026). This module holds
 * the same § against the same instructions as a SEQUENCE:
 *
 * - what the draft WRITES for the § (`draftWording`): the payload under an
 *   instruction („§ 5 Abs 2 lautet: „…"", „wird eingefügt: „…""), cut to
 *   the § where one payload prints several, and the new half of a
 *   replacement the instruction quotes in its own line („die Zahl „19"
 *   durch die Zahl „18" ersetzt");
 * - against the §'s right column as the page shows it (`strictCheck`). The
 *   payloads are aligned with it in order (`align`): every word the page
 *   marks as NEW must be a word of a payload at its place, and every word
 *   of a payload must stand in the right column, in that order. A stretch
 *   quoted in an instruction's line is not aligned — where it goes, the
 *   line says in words — but must stand in the column as one stretch, and
 *   accounts for the new words it stands at.
 *
 * A NUMBER IS A WORD. `comparableTokens`, which the bag rule reads with,
 * drops every token under three characters and with it nearly every number
 * of a law; `strictTokens` keeps them all.
 *
 * WHAT CANNOT BE HELD THIS WAY IS SAID, NOT PASSED (`StrictCheck.state`
 * `unchecked`, with its reason): a § no instruction of the draft names, a
 * law that could not be named in the draft, an instruction whose quotes
 * this module cannot tell old from new or that leaves the wording to the
 * reader's grammar, a payload printed for several §§ without their
 * designations, new text the draft writes elsewhere in the law. The bag
 * rule's verdict stands for those, and they are counted apart.
 *
 * ONLY TYPOGRAPHY IS NORMALISED: case, quotation marks, the kinds of dash,
 * punctuation, a word broken at a line's end, where a space stands inside
 * or between two words (`respace`), and what a misread font left of „ß",
 * the umlauts and the quotation marks in two Tirol drafts
 * (`withoutResidue`). Not normalised: any letter, any digit, the order. No
 * threshold and no share: a single word is a finding.
 *
 * MEASURED ON GP XXVIII (20.11.2026, `pnpm harness:land-guard`, 63
 * documents of Oberösterreich, Salzburg, Tirol and Wien, 1,162 §§ changed
 * or new): 1,044 held word for word, 72 not held this way, 46 differing and
 * withheld. Of injected faults in the §§ shown the product sees 611 of 652
 * changed numbers, 876 of 934 swapped words and 315 of 348 dropped
 * sentences (the bag rule: none), and 1,061 of 1,106 sentences of another §
 * of the same draft (the bag rule, where it could judge: 303 of 520).
 *
 * The first run withheld 93, and reading them found our own reader: most
 * of the 47 that are held since were Oberösterreich's marks read one
 * letter off, where an underlined stretch runs into a struck one
 * („einzuhaltend", „Z 3, 4 und 4" for „und 5") — fixed where the letters
 * are placed (`landTgu.ts`, `placedCentres`). Of the 46 left, some are the Land's two
 * documents differing (Wien 2026009: the draft raises a fine to „3 000",
 * its Textgegenüberstellung prints „2 500"; Oö. 2025-16094 strikes
 * „Amtsverschwiegenheit" one letter short), the others sound §§ lost to
 * this module's limits — a table read in another order, a payload our
 * draft reader lost or left a footer in.
 *
 * ITS OWN MISSES (21.11.2026): 11 injected faults passed where this module
 * held the §. Closed: a citation the draft wraps onto a line of its own cut a
 * payload as if a § began there (Salzburg 32025, § 48a); a single new number
 * passed for the draft's because the instruction's line names it as an
 * address („am Ende der Z 8"); a part of a quoted wording passed as the
 * instruction's text where the whole stood at another place („jeweils").
 * Since then (1,044 held, 71 not held, 47 differing) the strict check sees
 * every changed number and swapped word in the §§ it holds, and 317 of 324
 * dropped sentences. The seven it does not see: a word the new text shares
 * with the old at its seam lost there (Oö. 2025-16094, § 21, in three laws:
 * old text lost from the right column, which no rule here reads); a quoted
 * wording of one word that stands again inside a payload's text („(3)",
 * „(5)", „Bemessung"; three — a quote and a payload may share a place, so
 * the place is not asked); and a payload's word found again further down the
 * § by the alignment, which keeps order but not adjacency (one).
 */
import type { LawDiffUnit } from '../../../shared/types'
import { segmentUnits, type LawUnit, type TextBlock } from '../lawtext/lawUnits'
import { normalizeText } from '../lawtext/normalize'
import { designationKey } from '../annex/annexText'
import { draftUnits, type DraftUnit } from '../annex/annexDraft'
import { RUNS_ON_RE } from './landTgu'

const JOINERS = 'und|oder|bzw|sowie|beziehungsweise'
/** A word broken at a line's end („Verord- nung", „Infrastruktur- Dienstleistung"), never an Ergänzungsstrich („Land- und Forstwirtschaft"). The marks of `markedText` between the halves stay. */
const BROKEN_WORD_RE = new RegExp(`(?<=[\\p{L}\\p{N}])-([\\s\\uE000\\uE001]+)(?!(?:${JOINERS})(?![\\p{L}\\p{N}]))(?=\\p{L})`, 'gu')
const TOKEN_RE = /[\uE000\uE001]|§|[\p{L}\p{N}-]+/gu

/** A token with whether it stands inside a stretch marked `\uE000…\uE001` — two private-use characters no text carries and no normalisation touches. */
interface Marked { word: string; marked: boolean }

/**
 * What a misread font leaves in a Land's PDF where a line mixes it with a
 * sound one, so that the reader's repair (`repairMacRoman`, line by line)
 * passes the line by — Tirol's 575/2026 and 722/2026: „ã…Ò" for „…",
 * „¸ ‰ ˆ" for „ü ä ö", „ð" for a list's dash. None of the six is a letter
 * of a German law text.
 */
const withoutResidue = (text: string): string => text.replace(/[ðÐ]/g, ' ').replace(/ã/g, '„').replace(/Ò/g, '“').replace(/¸/g, 'ü').replace(/‰/g, 'ä').replace(/ˆ/g, 'ö')

function markedTokens(text: string): Marked[] {
  const flat = normalizeText(withoutResidue(text))
    .toLowerCase()
    .replace(BROKEN_WORD_RE, (_m, gap: string) => gap.replace(/\s+/g, ''))
  const out: Marked[] = []
  let on = false
  for (const m of flat.matchAll(TOKEN_RE)) {
    if (m[0] === '\uE000') on = true
    else if (m[0] === '\uE001') on = false
    else {
      // „ß" read as the ligature „ﬂ" comes back as „fl" („Maflgabe", the same two drafts): one spelling for both.
      const word = m[0].replace(/-/g, '').replace(/ß/g, 'fl')
      if (word) out.push({ word, marked: on })
    }
  }
  return out
}

/**
 * Every word and every number of a text, in order: lower case, without
 * quotation marks, punctuation and hyphens, a word broken at a line's end
 * joined. Nothing is dropped for its length.
 */
export function strictTokens(text: string): string[] {
  return markedTokens(text).map((t) => t.word)
}

// ---------------------------------------------------------------------------
// The draft's wording for a §
// ---------------------------------------------------------------------------

/** One stretch of words the draft writes for a §. */
export interface Wording {
  tokens: string[]
  /**
   * Words that need not stand in the right column: a § designation and the
   * heading printed with it, which the page shows above the text.
   */
  optional: boolean[]
  /**
   * Wording an instruction quotes in its own line („die Zahl „19" durch die
   * Zahl „18" ersetzt", „erhält die Absatzbezeichnung „(7)""): where in the
   * § it goes the line says in words, often for several places („jeweils"),
   * so it is not aligned. It accounts for every place of the right column
   * it stands at as one stretch.
   */
  repeats: boolean
  /** …and must stand there once at least, where its instruction names one § only. */
  once?: boolean
}

/** What the draft writes for one §, or why that cannot be said. */
export interface DraftWording {
  wordings: Wording[]
  /**
   * The instructions naming the § as they stand, line and payload, without
   * what they quote as old or as a place: a new stretch that is one stretch
   * of these is the draft's, wherever the alignment put it.
   */
  text: string[][]
  /**
   * The same instructions without their lines' own words: what they quote as
   * new (a quotation the line leaves open runs to its end) and their
   * payloads. A single new word must stand here to be the draft's — in the
   * line it is an address („Z 8", „Abs. 10"), not wording.
   */
  written: string[][]
  /** Set where an instruction naming the § could not be read as wording; the § is then not held strictly. */
  unread: string | null
}

const OPEN = '„»'
const CLOSE = '“”«'
/** A quotation inside an instruction line: „…" (the closing mark as the PDF types it). */
const QUOTE_RE = new RegExp(`[${OPEN}]([^${OPEN}${CLOSE}]*)[${CLOSE}]`, 'gu')
const REMOVING = 'entfällt|entfallen|aufgehoben|gestrichen'
const ADDING = 'eingefügt|angefügt|vorangestellt|angehängt|ergänzt'
const VERB_RE = new RegExp(`(?<![\\p{L}])(${REMOVING}|${ADDING}|ersetzt|lautet|lauten)(?![\\p{L}])`, 'u')
const UNIT_WORD = '(?:Wort(?:e|es|folge|folgen|laut|lautes|gruppe)?|Wörter|Wörtern|Ausdruck(?:es|s)?|Ausdrücke|Zitat(?:es|s|e)?|Verweis(?:es|ung)?|Wendung|Zeichenfolge|Wort-\\s+und\\s+Zeichenfolge|Klammerausdruck(?:es|s)?|Klammerzitat(?:es|s)?|Betrag(?:es|s)?|Zahl|Ziffer|Datum|Satzteil(?:es|s)?|Halbsatz(?:es)?|Begriff(?:es|s)?|Bezeichnung|Abkürzung|Jahreszahl|Prozentsatz(?:es)?|Text(?:es|s)?|Passage|Überschrift)'
/** „nach dem Wort „X"", „vor der Wortfolge „X"" — and at the line's start, „Nach der Überschrift „X"" (Oö. 2026-16124): the place, not the text. */
const ANCHOR_RE = new RegExp(`(?<![\\p{L}])(?:[Nn]ach|[Vv]or|[Hh]inter)\\s+(?:de[mnr]\\s+|die\\s+|das\\s+)?(?:\\p{L}+\\s+)?${UNIT_WORD}\\s*$`, 'u')
const NEW_AFTER_RE = /:\s*$|(?<![\p{L}])(?:lautet|lauten|eingefügt|angefügt|vorangestellt|\p{L}*[Bb]ezeichnung(?:en)?|folgende[rnms]?(?:\s+\p{L}+){0,3})\s*$/u

type Role = 'new' | 'old' | 'anchor' | null

/** Where a line's next clause opens: „… entfällt die Wortfolge „X" und wird das Wort „Y" durch …". */
const CLAUSE_RE = /(?:(?<![\p{L}])(?:und|sowie)|[,;])\s+(?:es\s+|im\s+§[^„]*?\s)?(?=(?:wird|werden|entfällt|entfallen|erhält|erhalten|tritt|treten|hat|haben)(?![\p{L}]))/gu
/** Between two quotations of one list: „„Vorlage" und „Beibringung"", „„11.", „12." und „13."". */
const LIST_RE = new RegExp(`^\\s*(?:,|und|sowie|oder|bzw\\.?)\\s*(?:(?:die|das|der|den|dem)\\s+)?(?:${UNIT_WORD}\\s*)?$`, 'u')
/**
 * A quoted wording replaced by a sign, no wording: „„und“ am Ende von lit. a
 * durch einen Strichpunkt ersetzt" — only place words between, no verb, no
 * conjunction, no comma: „„bzw. einer Umweltqualitätsnorm“ eingefügt und der
 * Punkt am Ende durch einen Strichpunkt ersetzt" replaces the full stop.
 */
const REPLACED_BY_SIGN_RE = new RegExp(`^\\s*(?:(?!(?:und|sowie|oder|${REMOVING}|${ADDING}|ersetzt|lautet|lauten)(?![\\p{L}]))[\\p{L}\\d.]+\\s+){0,6}durch\\s+(?:einen|ein)\\s+(?:Strichpunkt|Punkt|Beistrich|Doppelpunkt)(?![\\p{L}])`, 'u')
/** A replacement the instruction leaves to the reader's grammar: the wording is not quoted as it will stand. */
const INEXACT_RE = /grammatikalisch|sinngemäß|in\s+der\s+jeweiligen|im\s+jeweiligen|jeweils\s+richtigen/u

/**
 * What each quotation of an instruction line is: the new wording, the old
 * one it replaces or deletes, or the place it is set at. Null where the
 * line's grammar does not say — the § is then not held strictly.
 *
 * Read clause by clause, since German puts the verb at either end:
 * „entfällt die Wortfolge „X"" and „wird die Wortfolge „X" gestrichen".
 */
export function quoteRoles(raw: string): { text: string; role: Role }[] {
  const line = withoutResidue(raw)
  const quotes = [...line.matchAll(QUOTE_RE)]
  const bounds = [...line.matchAll(CLAUSE_RE)].map((m) => m.index)
  // The instruction's words, not its payload's: „… unter sinngemäßer Anwendung des § 55a …“ (Salzburg 32075, § 16).
  const inexact = INEXACT_RE.test(line.replace(QUOTE_RE, ' '))
  const out = quotes.map((m, i) => {
    const start = m.index
    const end = start + m[0].length
    const before = line.slice(i > 0 ? quotes[i - 1]!.index + quotes[i - 1]![0].length : 0, start)
    const after = line.slice(end, quotes[i + 1]?.index ?? line.length)
    let role: Role = null
    // „„X“ durch …", „„X“ wird durch …" (Oö. 2026-16120), „„und“ am Ende durch einen Punkt ersetzt" (2026-16124, Tirol 575/2026): the old wording.
    if (/^\s*(?:(?:wird|werden)\s+)?(?:jeweils\s+)?durch(?![\p{L}])/u.test(after) || REPLACED_BY_SIGN_RE.test(after)) role = 'old'
    else if (/(?<![\p{L}])durch\s+(?:\p{L}+[\s-]+){0,5}$/u.test(before)) role = 'new'
    else if (ANCHOR_RE.test(before)) role = 'anchor'
    else if (NEW_AFTER_RE.test(before) || /^\s*bezeichnet(?![\p{L}])/u.test(after)) role = 'new'
    return { text: m[1]!, role, before, after, start, end }
  })
  // A list of quotations shares the role its last or its first member has.
  const lists = () => {
    for (let i = out.length - 2; i >= 0; i--) if (out[i]!.role === null && LIST_RE.test(out[i]!.after)) out[i]!.role = out[i + 1]!.role
    for (let i = 1; i < out.length; i++) if (out[i]!.role === null && LIST_RE.test(out[i]!.before)) out[i]!.role = out[i - 1]!.role
  }
  lists()
  // What is left takes its clause's verb: before it („entfällt die Wortfolge „X""), or after („wird die Wortfolge „X" gestrichen").
  for (const q of out) {
    if (q.role !== null) continue
    const clauseStart = bounds.filter((b) => b < q.start).at(-1) ?? 0
    const clauseEnd = bounds.find((b) => b >= q.end) ?? line.length
    const head = line.slice(clauseStart, q.start).replace(QUOTE_RE, ' ')
    const tail = line.slice(q.end, clauseEnd).replace(QUOTE_RE, ' ')
    // „entfällt das Wort „X" und nach dem Wort „Y" wird die Wortfolge „Z" eingefügt": an auxiliary since the last quotation opens a clause whose verb comes after.
    const verbLast = /(?<![\p{L}])(?:wird|werden|hat|haben)(?![\p{L}])/u.test(q.before)
    const verb = !verbLast && /(?<![\p{L}])(?:entfällt|entfallen)(?![\p{L}])/u.test(head) ? 'entfällt' : VERB_RE.exec(tail)?.[1]
    if (verb && new RegExp(`^(?:${REMOVING})$`).test(verb)) q.role = 'old'
    else if (verb && new RegExp(`^(?:${ADDING})$`).test(verb)) q.role = 'new'
  }
  lists()
  return out.map(({ text, role }) => ({ text, role: inexact && role === 'new' ? null : role }))
}

/** A block that opens with a § designation: „§ 2. (1) Die …", „„§ 21a", „§ 20a". */
const DESIGNATION_BLOCK_RE = /^[„"»\s]*§\s*(\d+[a-z]*)\.?(?=\s*(?:$|\(|[„"»\p{Lu}]))(?!\s*(?:Abs\b|Abs\.|Z\s|Z\d|Satz\b))/u
/** A heading line: short, no sentence. */
const isHeadingBlock = (text: string): boolean => {
  const bare = text.replace(/^[„"»\s]+|[“”"«\s]+$/gu, '')
  return bare.length > 0 && bare.length <= 160 && !/[.;:,]$/.test(bare) && !/^(?:\(\d+[a-z]*\)|\d+[a-z]?\.|[a-z]{1,2}\)|§)/.test(bare)
}

/** Salzburg numbers the instructions under one: „21.1. Abs 4 lautet:", „21.2. Im Abs 5 wird …" — no law text is numbered so. */
const SUB_INSTRUCTION_RE = /^\d+(?:\.\d+)+\.?\s/

/** Whether a § designation follows at `i`, after at most two more heading lines („5. Abschnitt" / „Maßnahmen …" / „§ 14"). */
function headsDesignation(blocks: readonly TextBlock[], i: number): boolean {
  for (let k = i; k < Math.min(blocks.length, i + 3); k++) {
    const text = `${blocks[k]!.gld ?? ''} ${blocks[k]!.text}`.trim()
    if (DESIGNATION_BLOCK_RE.test(text)) return true
    if (!isHeadingBlock(text)) return false
  }
  return false
}

/** A page footer the draft reader left inside the text (Tirol: „VD-1590/1/33-2026 Fassung vom 24. August 2026"). */
const FOOTER_RE = /\bVD-\d+\/[\d/-]+\s+Fassung\s+vom\s+\d{1,2}\.\s*\p{L}+\s+\d{4}/gu

interface Piece { key: string | null; tokens: string[]; optional: boolean[] }

/**
 * A payload's blocks, cut at the §§ it prints: one piece per § designation
 * with the heading above or below it, and one piece without a key for what
 * stands before the first designation (the payload of „§ 5 Abs 2 lautet:").
 */
function payloadPieces(blocks: readonly TextBlock[]): Piece[] {
  const pieces: Piece[] = []
  let open: Piece = { key: null, tokens: [], optional: [] }
  const push = (text: string, optional: boolean) => {
    for (const w of strictTokens(text)) {
      open.tokens.push(w)
      open.optional.push(optional)
    }
  }
  const close = () => {
    if (open.tokens.length) pieces.push(open)
  }
  let heading: string | null = null
  /** The block read last into the open piece as text. */
  let last: string | null = null
  for (let i = 0; i < blocks.length; i++) {
    const text = `${blocks[i]!.gld ?? ''} ${blocks[i]!.text}`.replace(FOOTER_RE, ' ').trim()
    const next = blocks[i + 1] ? `${blocks[i + 1]!.gld ?? ''} ${blocks[i + 1]!.text}`.replace(FOOTER_RE, ' ').trim() : ''
    // „… richtet sich nach" / „§ 73 AVG; …": a citation the line wrapped, not a § (`RUNS_ON_RE`, as the readers take it; Salzburg 32025, § 48a, and Oö. 2026-16122, § 57).
    const designation = last !== null && RUNS_ON_RE.test(last) ? null : DESIGNATION_BLOCK_RE.exec(text)
    // A heading above the designation opens the §'s piece.
    if (!designation && isHeadingBlock(text) && headsDesignation(blocks, i + 1)) {
      heading = `${heading ?? ''} ${text}`
      continue
    }
    if (designation) {
      // The next §'s heading at the end of the block before it („… gelten als bewilligte Maßnahmen. Gigabit-Netze" / „§ 14b"): not this §'s text.
      if (heading === null && last !== null) {
        const tail = /(?:^|[.;:!?“”"]\s+)([^.;:!?“”"]{3,160})$/u.exec(last)?.[1]
        const count = tail && /^\p{Lu}/u.test(tail.trim()) ? strictTokens(tail).length : 0
        for (let k = 1; k <= count && k <= open.optional.length; k++) open.optional[open.optional.length - k] = true
      }
      close()
      open = { key: designationKey(`§ ${designation[1]}`), tokens: [], optional: [] }
      if (heading !== null) push(heading, true)
      heading = null
      last = null
      push(designation[0], true)
      const after = text.slice(designation[0].length)
      // „§ 20a Verweisungen" — the heading on the designation's line.
      push(after, isHeadingBlock(after) && !/[.;:]/.test(after))
      // …or on the line below it.
      if (!after.trim() && next && isHeadingBlock(next) && !DESIGNATION_BLOCK_RE.test(next)) {
        push(next, true)
        i++
      }
      continue
    }
    push(text, false)
    last = text
  }
  close()
  return pieces
}

/** What a draft writes, for one law. */
export interface LawWording {
  /** § key (`designationKey`) → what the draft writes for it, the instructions in the draft's order. */
  byKey: Map<string, DraftWording>
  /** The new wording of instructions that name no § the reader could read („In § 29 Abs. 4, § 30 … wird jeweils …"): every § of the law may carry it. */
  general: Wording[]
  /** Those instructions as they stand: text that may be any §'s. */
  generalText: string[][]
}

/** What a line quotes: „…" closed, or opened and left open to the line's end. */
const WRITTEN_RE = new RegExp(`[${OPEN}]([^${OPEN}${CLOSE}]*)(?:[${CLOSE}]|$)`, 'gu')

/** A unit's blocks as the lines of its instructions and the payloads between them. */
interface Run { line: string | null; payload: TextBlock[] }

/** A restating or adding verb, then a quotation the line does not close: the payload's first line. */
const PAYLOAD_OPENS_RE = new RegExp(`((?<![\\p{L}])(?:lautet|lauten|eingefügt|angefügt|ersetzt)\\s*:?\\s*)[${OPEN}][^${OPEN}${CLOSE}]*$`, 'u')

/** An instruction numbered below a payload's closing quote in the same block: „… Hygieneartikel," 3.1.3. Die Z 4 lautet:". */
const SUB_INSIDE_RE = /(?<=[“”"])\s+(?=\d+(?:\.\d+)+\.?\s+\p{Lu})/u

/**
 * A line runs on into the next block where it ends neither on a colon nor
 * on a full stop nor on a closing quote, or leaves a quotation open: the
 * list of §§ of one „jeweils" instruction over two blocks, „… durch den
 * Eintrag" / „„§ 2 Menschen mit Behinderungen" ersetzt.".
 */
function runsOf(unit: LawUnit): Run[] {
  const blocks = unit.blocks.flatMap((b) => {
    if (b.kind === 'novao') return [b]
    const parts = b.text.split(SUB_INSIDE_RE)
    return parts.map((text, i) => ({ ...b, gld: i === 0 ? b.gld : null, text }))
  })
  const runs: Run[] = [{ line: null, payload: [] }]
  const open = (line: string) => {
    const quotes = [...withoutResidue(line)].reduce((n, ch) => n + (OPEN.includes(ch) ? 1 : CLOSE.includes(ch) ? -1 : 0), 0)
    return quotes > 0 || !/[:.“”"]\s*$/u.test(withoutResidue(line).trim())
  }
  let continued = 0
  for (const block of blocks) {
    const text = `${block.gld ?? ''} ${block.text}`.replace(FOOTER_RE, ' ').trim()
    const run = runs.at(-1)!
    if (block.kind === 'novao' || SUB_INSTRUCTION_RE.test(block.text)) {
      // „4. § 9 lautet „Ablehnung und Einschränkung der Grundversorgung": the payload opens on the instruction's line and runs on below.
      const opens = PAYLOAD_OPENS_RE.exec(withoutResidue(text))
      if (opens) runs.push({ line: text.slice(0, opens.index + opens[1]!.length), payload: [{ ...block, kind: 'ziff', gld: null, text: text.slice(opens.index + opens[1]!.length) }] })
      else runs.push({ line: text, payload: [] })
      continued = 0
    } else if (run.line !== null && !run.payload.length && continued < 2 && open(run.line) && !DESIGNATION_BLOCK_RE.test(text)) {
      run.line = `${run.line} ${text}`
      continued++
    } else run.payload.push(block)
  }
  return runs
}

/** What every § of a draft is written as, per law key. */
export function draftWording(blocks: readonly TextBlock[], installed: (unit: DraftUnit) => string[] = () => []): Map<string | null, LawWording> {
  const out = new Map<string | null, LawWording>()
  const law = segmentUnits(blocks)
  const addressed = draftUnits(blocks)
  const lawOf = (lawKey: string | null): LawWording => {
    const w = out.get(lawKey) ?? { byKey: new Map<string, DraftWording>(), general: [], generalText: [] }
    out.set(lawKey, w)
    return w
  }
  const at = (lawKey: string | null, key: string): DraftWording => {
    const byKey = lawOf(lawKey).byKey
    const w = byKey.get(key) ?? { wordings: [], text: [], written: [], unread: null }
    byKey.set(key, w)
    return w
  }
  law.forEach((unit: LawUnit, ui) => {
    const draft = addressed[ui]!
    const keys = [...new Set([...draft.paras, ...installed(draft)].map((p) => designationKey(p)).filter((k): k is string => k !== null))]
    const runs = runsOf(unit)
    // The unit as it stands, without what it quotes as old or as a place.
    const standing: string[] = []
    const written: string[] = []
    for (const run of runs) {
      if (run.line !== null) {
        const roles = quoteRoles(run.line)
        let k = 0
        const kept = withoutResidue(run.line).replace(QUOTE_RE, (m) => (roles[k++]?.role === 'new' ? m : ' '))
        standing.push(...strictTokens(kept))
        written.push(...[...kept.matchAll(WRITTEN_RE)].flatMap((m) => strictTokens(m[1]!)))
      }
      for (const block of run.payload) {
        const tokens = strictTokens(`${block.gld ?? ''} ${block.text}`.replace(FOOTER_RE, ' '))
        standing.push(...tokens)
        written.push(...tokens)
      }
    }
    if (!keys.length) {
      const into = lawOf(draft.law)
      into.generalText.push(standing)
      for (const run of runs) {
        for (const quote of run.line === null ? [] : quoteRoles(run.line)) {
          const tokens = quote.role === 'new' ? strictTokens(quote.text) : []
          if (tokens.length) into.general.push({ tokens, optional: tokens.map(() => false), repeats: true })
        }
      }
      return
    }
    for (const key of keys) {
      at(draft.law, key).text.push(standing)
      at(draft.law, key).written.push(written)
    }
    for (const run of runs) {
      for (const quote of run.line === null ? [] : quoteRoles(run.line)) {
        if (quote.role === null) {
          for (const key of keys) at(draft.law, key).unread ??= `${STRICT_UNCHECKED.quoteRole}${run.line!.slice(0, 120)}`
          continue
        }
        if (quote.role !== 'new') continue
        const tokens = strictTokens(quote.text)
        if (!tokens.length) continue
        for (const key of keys) at(draft.law, key).wordings.push({ tokens, optional: tokens.map(() => false), repeats: true, once: keys.length === 1 })
      }
      if (!run.payload.length) continue
      const pieces = payloadPieces(run.payload)
      const keyed = pieces.some((p) => p.key !== null)
      for (const piece of pieces) {
        if (piece.key !== null) {
          const into = at(draft.law, piece.key)
          into.wordings.push({ tokens: piece.tokens, optional: piece.optional, repeats: false })
          if (!keys.includes(piece.key)) {
            into.text.push(standing)
            into.written.push(written)
          }
        } else if (keyed) {
          // Text before the first § of a payload that prints §§: a division heading, or what the reader did not cut. Whose it is, is not read.
          for (const key of keys) at(draft.law, key).unread ??= STRICT_UNCHECKED.beforeFirst
        } else if (keys.length === 1) {
          at(draft.law, keys[0]!).wordings.push({ tokens: piece.tokens, optional: piece.optional, repeats: false })
        } else {
          for (const key of keys) at(draft.law, key).unread ??= STRICT_UNCHECKED.severalUnnamed
        }
      }
    }
  })
  return out
}

// ---------------------------------------------------------------------------
// The alignment
// ---------------------------------------------------------------------------

/** A new stretch found elsewhere in the draft's text of the law says whose it is only from this length on: a word or a number stands everywhere. */
export const MIN_FOREIGN_RUN = 4
/** Above this many cells the alignment is not run, and the § not held strictly. */
export const MAX_ALIGN_CELLS = 30_000_000
/** A word the page shows as new outweighs any number of others: the alignment first accounts for those. */
const NEW_WEIGHT = 4096

/**
 * The heaviest common subsequence of `shown` and `draft`: which words of
 * each side the other accounts for, in order. A word of `shown` marked new
 * weighs `NEW_WEIGHT`, so among all in-order alignments the one that
 * accounts for most new words wins, and among those the longest.
 */
export function align(shown: readonly Marked[], draft: readonly string[]): { shown: boolean[]; draft: boolean[] } {
  const n = shown.length
  const m = draft.length
  const inShown = new Array<boolean>(n).fill(false)
  const inDraft = new Array<boolean>(m).fill(false)
  if (!n || !m) return { shown: inShown, draft: inDraft }
  // 0 = skip shown[i], 1 = skip draft[j], 2 = match
  const step = new Uint8Array(n * m)
  let below = new Int32Array(m + 1)
  let row = new Int32Array(m + 1)
  for (let i = n - 1; i >= 0; i--) {
    const word = shown[i]!.word
    const weight = shown[i]!.marked ? NEW_WEIGHT : 1
    for (let j = m - 1; j >= 0; j--) {
      let best = below[j]!
      let how = 0
      if (row[j + 1]! > best) {
        best = row[j + 1]!
        how = 1
      }
      if (word === draft[j] && below[j + 1]! + weight >= best) {
        best = below[j + 1]! + weight
        how = 2
      }
      row[j] = best
      step[i * m + j] = how
    }
    const t = below
    below = row
    row = t
    row[m] = 0
  }
  let i = 0
  let j = 0
  while (i < n && j < m) {
    const how = step[i * m + j]
    if (how === 2) {
      inShown[i] = true
      inDraft[j] = true
      i++
      j++
    } else if (how === 1) j++
    else i++
  }
  return { shown: inShown, draft: inDraft }
}

// ---------------------------------------------------------------------------
// The check
// ---------------------------------------------------------------------------

export interface StrictCheck {
  /**
   * `holds`: every new word is the draft's, every word of the draft's
   * wording stands in the right column, in order. `differs`: at least one
   * does not. `unchecked`: the § could not be held this way (`reason`).
   */
  state: 'holds' | 'differs' | 'unchecked'
  reason: string | null
  /** Words shown as new that the draft's wording for the § does not carry at their place. */
  notInDraft: string[]
  /** Words of the draft's wording for the § that the right column does not carry at their place. */
  notShown: string[]
  /** Words shown as new, and words of the draft's wording, as counted here. */
  newWords: number
  draftWords: number
}

const unchecked = (reason: string): StrictCheck => ({ state: 'unchecked', reason, notInDraft: [], notShown: [], newWords: 0, draftWords: 0 })

/**
 * Why a § was not held this way (`StrictCheck.reason`), in the harness's
 * words — the page says each in its own (`draftUncheckedReason` in
 * `landTguGuard.ts`). `quoteRole` is followed by the instruction's line.
 */
export const STRICT_UNCHECKED = {
  undiffed: 'die Wortdifferenz dieses Paragraphen wurde nicht berechnet',
  nothingNew: 'kein neuer Text',
  unnamed: 'keine Anordnung des Entwurfs nennt den Paragraphen',
  lawUnnamed: 'das Gesetz ist im Entwurf nicht sicher benannt',
  twoUnderOne: 'zwei Anordnungen unter einer Ziffer',
  quoteRole: 'Anführung ohne lesbare Rolle: ',
  beforeFirst: 'Text vor dem ersten Paragraphen eines Wortlauts, der mehrere druckt',
  severalUnnamed: 'ein Wortlaut für mehrere Paragraphen ohne deren Bezeichnung',
  tooLong: 'zu lang für den wortweisen Abgleich',
  elsewhere: 'neuer Text, den der Entwurf an anderer Stelle des Gesetzes schreibt',
} as const

/**
 * The right column as the page shows it, each word with whether it is marked
 * new — the § heading first, which the page prints above the text and a
 * payload „samt Überschrift" carries.
 *
 * A word the diff marks only for its punctuation is not new: „Einzelfall;"
 * against „Einzelfall." is the instruction „der Strichpunkt wird durch einen
 * Punkt ersetzt", and no word of the draft. So the words a new stretch
 * shares, in order, with the removed one beside it lose the mark.
 */
export function shownTokens(unit: LawDiffUnit): Marked[] | null {
  const heading = markedTokens(unit.heading ?? '')
  if (unit.change === 'inserted') return [...heading, ...markedTokens(`\uE000${unit.toText ?? ''}\uE001`)]
  if (unit.change !== 'changed' || !unit.segments) return null
  const out = [...heading]
  const segments = unit.segments
  segments.forEach((s, i) => {
    if (s.type === 'removed') return
    if (s.type !== 'inserted') {
      out.push(...markedTokens(s.text))
      return
    }
    const tokens = markedTokens(`\uE000${s.text}\uE001`)
    const beside = [segments[i - 1], segments[i + 1]].find((x) => x?.type === 'removed')
    // The words the new stretch keeps of the removed one, in order: „geschlechtsbezogene Verhaltensweisen," against „Verhaltensweisen in Bezug auf …,".
    if (beside) align(tokens.map((t) => ({ word: t.word, marked: false })), strictTokens(beside.text)).shown.forEach((kept, k) => {
      if (kept) tokens[k]!.marked = false
    })
    out.push(...tokens)
  })
  return out
}

/**
 * One spacing for both sides: a word one document prints in two pieces
 * („Unterrichtseinhei ten" at a table cell's edge, „m 2" for „m²") or two
 * words it prints as one („41und") are joined on the side that parts them,
 * where the other side carries the joined form and not both pieces. Letters
 * and digits are untouched; only where a space stands differs.
 */
function respace(shown: Marked[], wordings: readonly Wording[]): void {
  const vocabulary = (lists: readonly (readonly string[])[]) => new Set(lists.flat())
  const join = <T>(tokens: T[], word: (t: T) => string, merged: (a: T, b: T) => T, other: ReadonlySet<string>): void => {
    for (let i = 0; i + 1 < tokens.length; i++) {
      const a = word(tokens[i]!)
      const b = word(tokens[i + 1]!)
      if (other.has(a + b) && !(other.has(a) && other.has(b))) {
        tokens.splice(i, 2, merged(tokens[i]!, tokens[i + 1]!))
        i = Math.max(-1, i - 2)
      }
    }
  }
  const draftWords = vocabulary(wordings.map((w) => w.tokens))
  join(shown, (t) => t.word, (a, b) => ({ word: a.word + b.word, marked: a.marked || b.marked }), draftWords)
  const shownWords = new Set(shown.map((t) => t.word))
  for (const w of wordings) {
    const pairs = w.tokens.map((word, i) => ({ word, optional: w.optional[i]! }))
    join(pairs, (t) => t.word, (a, b) => ({ word: a.word + b.word, optional: a.optional && b.optional }), shownWords)
    w.tokens = pairs.map((x) => x.word)
    w.optional = pairs.map((x) => x.optional)
  }
}

const REPEALING = new Set(['entfallen', 'entfällt', 'aufgehoben'])

/** Whether `needle` stands in `hay` as one stretch. */
function contains(hay: readonly string[], needle: readonly string[]): boolean {
  return placesOf(hay, needle).length > 0
}

/** Where `needle` stands in `hay` as one stretch. */
function placesOf(hay: readonly string[], needle: readonly string[]): number[] {
  const out: number[] = []
  if (!needle.length) return out
  for (let i = 0; i + needle.length <= hay.length; i++) {
    let j = 0
    while (j < needle.length && hay[i + j] === needle[j]) j++
    if (j === needle.length) out.push(i)
  }
  return out
}

/**
 * Hold one § of the comparison against the draft's wording for it
 * (`draftWording`, under the §'s own number and, renumbered, its old one).
 */
export function strictCheck(unit: LawDiffUnit, wording: readonly (DraftWording | undefined)[], law: { general: readonly Wording[]; elsewhere: readonly string[][] } = { general: [], elsewhere: [] }): StrictCheck {
  const shown = shownTokens(unit)
  if (!shown) return unchecked(unit.change === 'changed' ? STRICT_UNCHECKED.undiffed : STRICT_UNCHECKED.nothingNew)
  const found = wording.filter((w): w is DraftWording => w !== undefined)
  if (!found.length) return unchecked(STRICT_UNCHECKED.unnamed)
  const unread = found.find((w) => w.unread)?.unread
  if (unread) return unchecked(unread)
  // Copies: `respace` rewrites them for this § alone.
  const copy = (w: Wording): Wording => ({ ...w, tokens: [...w.tokens], optional: [...w.optional] })
  const all = found.flatMap((f) => f.wordings).map(copy)
  const general = law.general.map(copy)
  respace(shown, [...all, ...general])
  const words = shown.map((t) => t.word)
  // The §'s own designation is no text of it: the page prints it above, and a payload or a column may print it once more.
  const own = new Set([unit.id, unit.fromId ?? unit.id].map((id) => id.replace(/^§\s*/, '').toLowerCase()))
  const ownAt = (list: readonly string[], i: number) => (list[i] === '§' && own.has(list[i + 1] ?? '')) || (list[i - 1] === '§' && own.has(list[i] ?? ''))
  shown.forEach((t, i) => {
    if (ownAt(words, i)) t.marked = false
  })
  // „(2) entfallen": how a column prints a repealed Absatz — the instruction's verb, not text of the law.
  const repeals = found.some((f) => f.text.some((t) => t.some((w) => REPEALING.has(w))))
  shown.forEach((t) => {
    if (repeals && REPEALING.has(t.word)) t.marked = false
  })
  const draft: string[] = []
  const optional: boolean[] = []
  for (const w of all.filter((x) => !x.repeats)) {
    draft.push(...w.tokens)
    optional.push(...w.optional)
  }
  draft.forEach((_, j) => {
    if (ownAt(draft, j)) optional[j] = true
  })
  if (shown.length * draft.length > MAX_ALIGN_CELLS) return unchecked(STRICT_UNCHECKED.tooLong)
  // A stretch quoted in an instruction's line accounts for each place it stands at…
  const placed = shown.map(() => false)
  for (const w of [...all.filter((x) => x.repeats), ...general]) {
    for (const at of placesOf(words, w.tokens)) for (let k = 0; k < w.tokens.length; k++) placed[at + k] = true
  }
  // …and the payloads are aligned with what is left: a new word accounted for must not pull a payload's word out of its place.
  const aligned = align(shown.map((t, i) => ({ word: t.word, marked: t.marked && !placed[i] })), draft)
  const accounted = shown.map((_, i) => placed[i]! || aligned.shown[i]!)
  const quoted = [...all.filter((x) => x.repeats), ...general].map((w) => w.tokens)
  // A new stretch between two equal words can be cut one word earlier or
  // later („zu [tätigen; 3. … zu] tätigen."): where it is the draft's as one
  // stretch at either cut, it is the draft's.
  for (let i = 0; i < shown.length; i++) {
    if (!shown[i]!.marked) continue
    let j = i
    while (j < shown.length && shown[j]!.marked) j++
    const own = found.flatMap((f) => f.text)
    // One stretch of an instruction naming the §, as it stands: the draft's,
    // wherever the alignment put it. Not a part of a quoted wording, which
    // accounts only where it stands whole (Oö. 2025-16103, § 38: „jeweils",
    // one place cut short); and a single word only from what an instruction
    // quotes or prints — in its line it is an address, „Z 8" (Tirol 728/2026).
    const stretch = words.slice(i, j)
    const partOfQuote = quoted.some((q) => q.length > stretch.length && contains(q, stretch))
    if (!accounted.slice(i, j).every(Boolean) && !partOfQuote && (stretch.length > 1 ? own : found.flatMap((f) => f.written)).some((t) => contains(t, stretch))) for (let k = i; k < j; k++) accounted[k] = true
    if (!accounted.slice(i, j).every(Boolean)) {
      for (let shift = -(j - i); shift <= j - i; shift++) {
        if (shift === 0 || i + shift < 0 || j + shift > shown.length) continue
        // The same text at the other cut: what leaves at one end enters at the other.
        const same = shift > 0 ? words.slice(i, i + shift).every((w, k) => w === words[j + k]) : words.slice(j + shift, j).every((w, k) => w === words[i + shift + k])
        if (same && [draft, ...quoted].some((t) => contains(t, words.slice(i + shift, j + shift)))) {
          for (let k = i; k < j; k++) accounted[k] = true
          break
        }
      }
    }
    i = j
  }
  // The same cut, where the word between two new stretches is the one moved:
  // „5. [eine … oder] die [Unwirtschaftlichkeit …; 6. die] im Zug" inserts
  // „eine … oder die Unwirtschaftlichkeit …; 6." before the old „die". A new
  // word is the draft's where the same word stands unmarked at the other end
  // of new words all accounted for, and the draft's wording took that one.
  for (let i = 0; i < shown.length; i++) {
    if (!shown[i]!.marked || accounted[i]) continue
    for (const step of [-1, 1]) {
      let k = i + step
      while (k >= 0 && k < shown.length && shown[k]!.marked && accounted[k]) k += step
      if (k >= 0 && k < shown.length && k !== i + step && !shown[k]!.marked && aligned.shown[k] && words[k] === words[i]) accounted[i] = true
    }
  }
  const notInDraft = shown.filter((t, i) => t.marked && !accounted[i]).map((t) => t.word)
  const notShown = draft.filter((_, j) => !optional[j] && !aligned.draft[j])
  for (const w of all) if (w.repeats && w.once && !contains(words, w.tokens)) notShown.push(...w.tokens)
  // New text the draft writes elsewhere — for a § the document prints no
  // block of its own for, or in an instruction whose address was not read:
  // whose text it is, is then not read, and the § is not held strictly.
  // Not where the draft's own wording for the § is missing: that differs,
  // whoever wrote the rest.
  if (notInDraft.length && !notShown.length) {
    let foreign = true
    for (let i = 0; i < shown.length && foreign; i++) {
      if (!shown[i]!.marked || accounted[i]) continue
      let a = i
      while (a > 0 && shown[a - 1]!.marked) a--
      let b = i
      while (b < shown.length && shown[b]!.marked) b++
      const run = words.slice(a, b)
      foreign = run.length >= MIN_FOREIGN_RUN && law.elsewhere.some((t) => contains(t, run))
      i = b
    }
    if (foreign) return unchecked(STRICT_UNCHECKED.elsewhere)
  }
  return {
    state: notInDraft.length || notShown.length ? 'differs' : 'holds',
    reason: null,
    notInDraft,
    notShown,
    newWords: shown.filter((t) => t.marked).length,
    draftWords: optional.filter((o) => !o).length,
  }
}

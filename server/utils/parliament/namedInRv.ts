/**
 * „In 298 d.B. genannt" — a Ministerialentwurf that Parliament links to no
 * Regierungsvorlage, whose title the Erläuterungen of another draft's
 * Vorlage name (14.11.2026).
 *
 * WHY. „Seit Ende der Begutachtungsfrist vor über einem Jahr liegt keine
 * Regierungsvorlage vor" stood on 44/ME XXVIII, the Kopftuchverbot, while
 * 298 d.B. carries that Verbot: the ministry folded the draft into the
 * Vorlage of another one (54/ME), and Parliament links the Vorlage to that
 * one only. Its Erläuterungen say so in their Hauptgesichtspunkte —
 * „Stärkung der Selbstbestimmung von unmündigen Mädchen an Schulen mittels
 * Einführung eines Kopftuchverbots", 44/ME's title without „Bundesgesetz
 * zur". 93/ME XXVII (Diplomatische Akademie) went the same way into 945
 * d.B. Parliament's links are not the complete list of what became of a
 * draft; a Vorlage's own words can be the evidence the links lack.
 *
 * THE RULE, all six conditions or nothing (`docs/decisions.md`, „Joins"):
 *  1. closed, no linked Vorlage, a period whose links exist, no
 *     Initiativantrag route, no same-title successor (`mayBeNamed`, and the
 *     index builder for the last two);
 *  2. a title core of at least `TITLE_CORE_MIN_CHARS` that is not a bare
 *     list of laws ending in „u.a." (`titleCoreOf`) — „Schulunterrichtsgesetz,
 *     Änderung" names a law every Schul-Vorlage names, not a draft;
 *  3. the core verbatim, after the same normalisation and on word
 *     boundaries, inside one paragraph of the Erläuterungen of a Vorlage of
 *     the same period that is not linked to the draft (`witnessesIn`);
 *  4. that Vorlage came after the Frist and at most
 *     `RV_LATENCY_CONTEXT_DAYS` later (`decideNamedInRv`) — the window that
 *     separates 44/ME (26 days) from 125/ME and 126/ME, whose laws a
 *     Vorlage amended again about three years on, and 228/ME, whose title
 *     the AbgÄG 2023 repeats 196 days after the Frist;
 *  5. exactly one Vorlage in that window does — two make it a law's name,
 *     not a draft's, and an unread Vorlage in the window could be the
 *     second (`unread`; a PDF-only Erläuterung is read for exactly that);
 *  6. its sentence is a witness (`witnessGuard`): it does not call the
 *     draft a pending „Entwurf" (16/ME XXVI in 68 d.B.), and where the title
 *     amends a law — the core is then the law's name — it says the Vorlage
 *     takes the text up (24/ME XXVI, „Zum Einkommensteuergesetz 1988:" in
 *     190 d.B., is only the law the Vorlage amends too). The first five
 *     were the rule as decided; the corpus accepted these two drafts under
 *     it, both wrong, and the sixth was added for them.
 * Precision before recall: a draft the rule misses keeps today's wording,
 * which is true; a wrong „genannt" would send the reader to a law that is
 * not this draft's.
 *
 * WHAT IT DOES NOT CLAIM: that the Vorlage carries the draft whole, or
 * „aufgegangen"/„zusammengeführt" as a state. The page quotes the sentence
 * and shows no § comparison — the Vorlage holds another draft's text too.
 *
 * Measured with `pnpm corpus:rv-genannt` through this module.
 *
 * PURE MODULE — relative imports only: the server's index
 * (`namedInRvIndex.ts`) and the corpus script run the same functions, each
 * with its own way of fetching.
 */
import type { ChainCoverage, DraftDocument, DraftSummary, NamedInRv } from '../../../shared/types'
import { antragPathFor } from '../../../shared/utils/antragPath'
import { RV_LATENCY_CONTEXT_DAYS } from '../../../shared/utils/rvLatency'
import { spanInDays } from '../../../shared/utils/format'
import { mapWithConcurrency } from '../pool'
import { withPdf } from '../text/pdfDocument'
import { decodeEntities } from './htmlText'
import type { VorlageRow } from './list101'
import { findRelatedDrafts } from './related'

// --- Measured surface: exported for tests and harness scripts, not for the app. ---

/** Below this a core is a law's name, not a draft's („Schulunterrichtsgesetz", 22). */
export const TITLE_CORE_MIN_CHARS = 25

/** The longest quote; a longer sentence is cut around the match. */
export const QUOTE_MAX_CHARS = 300

/** Characters that are no character in the text: soft hyphen, zero-width space and joiners, BOM. */
const INVISIBLE_RE = /[\u00AD\u200B-\u200D\u2060\uFEFF]/g

/**
 * Lower case, every run of what is neither a letter nor a digit one space —
 * quotes, dashes, punctuation, whitespace. A line break survives as itself,
 * one for one, so a match can be traced to its paragraph.
 */
export function normaliseWitnessText(s: string): string {
  return s.replace(INVISIBLE_RE, '').toLowerCase().replace(/[^\p{L}\p{N}\n]+/gu, ' ')
}

/** „Bundesgesetz zur", „Bundesverfassungsgesetz über die", „Bundesgesetz, mit dem" … — normalised. */
const LEADING_RE = /^bundes(?:verfassungs)?gesetz (?:über die|über das|über den|über|zur|zum|betreffend|mit dem) /u

export type TitleCore =
  /** `amendment`: the title amends a law („…, Änderung", „…-Novelle"), so the core is that law's name. */
  | { core: string; amendment: boolean; reason: null }
  | { core: null; amendment: boolean; reason: 'kurz' | 'gesetzesliste' }

/**
 * The part of a draft's title that can name the draft in another text:
 * normalised, without a leading „Bundesgesetz zur …" and a trailing
 * „, Änderung" or „-Novelle …". Null where it is too short to name more
 * than a law, or a list of laws ending in „u.a.".
 */
export function titleCoreOf(title: string): TitleCore {
  const whole = title.trim()
  const cut = whole.replace(/,\s*Änderung\s*$/u, '').replace(/-Novelle\b.*$/u, '')
  const amendment = cut !== whole
  const core = normaliseWitnessText(cut).trim().replace(LEADING_RE, '').trim()
  if (/(?:^| )u a$/u.test(core)) return { core: null, amendment, reason: 'gesetzesliste' }
  if (core.length < TITLE_CORE_MIN_CHARS) return { core: null, amendment, reason: 'kurz' }
  return { core, amendment, reason: null }
}

/**
 * A Word HTML document as paragraphs, one per line: head, styles and
 * scripts out; block tags a line break; inline tags NOTHING — Word splits a
 * word over spans at every change of format, and a space there would break
 * the title in two; entities decoded, whitespace collapsed.
 */
export function htmlParagraphs(html: string): string {
  const text = html
    .replace(/<(head|style|script)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/<\/?(?:p|div|br|li|tr|td|th|h[1-6]|table|ul|ol|blockquote|section)\b[^>]*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
  return decodeEntities(text)
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
}

/**
 * The Vorlage's Erläuterungen among its documents: „Erläuterungen" first
 * (`explanationsGroup`), else a group that carries them under another name —
 * „Vorblatt, WFA, Erläuterungen" (1026 d.B. XXVII, 48 and 374 d.B. XXVI),
 * „Erläuterung" (2612 d.B. XXVII). Four of 627 Vorlagen in three periods;
 * unread, each would have held the state of every draft in its window.
 */
export function explanationsFormats(documents: readonly DraftDocument[]): { html: string | null; pdf: string | null } {
  const group =
    documents.find((d) => /^Erläuterungen\b/i.test(d.title.trim())) ??
    documents.find((d) => /\bErläuterung(?:en)?\b/i.test(d.title))
  const formats = group?.formats ?? []
  return { html: formats.find((f) => f.type === 'html')?.url ?? null, pdf: formats.find((f) => f.type === 'pdf')?.url ?? null }
}

/** The draft as the scan needs it. */
export interface WitnessDraft {
  gp: string
  inr: number
  citation: string
  title: string
  /** Fristende, ISO; null where upstream gives none (never a candidate then). */
  deadline: string | null
  core: string
  /** The title amends a law, so the core is the law's name (`titleCoreOf`). */
  amendment: boolean
}

/** A draft Parliament links to a Vorlage. */
export type LinkedDraft = NamedInRv['linkedDrafts'][number]

/** The Vorlage as the scan needs it. */
export interface WitnessVorlage {
  gp: string
  inr: number
  citation: string
  /** Einlangen, ISO; '' where list 101 has none. */
  date: string
  url: string
}

/** One Vorlage read: where its Erläuterungen are, what they say, and whom Parliament links it to. */
export interface VorlageReading {
  /** The Erläuterungen as Parliament's HTML; null where none is published (a PDF only, or none). */
  explanationsUrl: string | null
  html: string | null
  /** The Erläuterungen' PDF where no HTML is published — read only to rule a second witness out. */
  pdfUrl: string | null
  linkedDrafts: LinkedDraft[]
}

/** A Vorlage whose Erläuterungen have no HTML: the PDF, if any, and whom Parliament links it to. */
export interface UnreadVorlage extends WitnessVorlage {
  pdfUrl: string | null
  linkedDrafts: LinkedDraft[]
}

/** Where a paragraph names a core: the quote the page shows, the whole sentence, and the sentence before the core. */
export interface Passage {
  quote: string
  sentence: string
  before: string
}

/** A Vorlage that names a draft's title, with the sentence that does. */
export interface Witness extends Passage {
  vorlage: WitnessVorlage
  explanationsUrl: string
  linkedDrafts: LinkedDraft[]
  /** Found in the PDF: counts as a second witness, never as the one the page quotes. */
  fromPdf?: true
}

/** Where `core` stands on word boundaries in `norm`, from `from`; -1 where it does not. */
function boundedIndexOf(norm: string, core: string, from = 0): number {
  for (let i = norm.indexOf(core, from); i >= 0; i = norm.indexOf(core, i + 1)) {
    const before = i === 0 ? ' ' : norm[i - 1]!
    const after = i + core.length >= norm.length ? ' ' : norm[i + core.length]!
    if ((before === ' ' || before === '\n') && (after === ' ' || after === '\n')) return i
  }
  return -1
}

/** Occurrences of one core read per document — a heading and a sentence or two; more is a law named throughout. */
const MAX_PASSAGES = 12

/**
 * Which of `drafts` the paragraphs name, each with the passage that does —
 * the first that passes `witnessGuard`, else the first. A core is matched
 * inside one paragraph only: across a break it would be two headings that
 * happen to meet.
 */
export function witnessesIn(
  paragraphs: string,
  drafts: readonly Pick<WitnessDraft, 'inr' | 'core' | 'amendment'>[],
): Map<number, Passage> {
  const out = new Map<number, Passage>()
  if (!drafts.length) return out
  const norm = normaliseWitnessText(paragraphs)
  let lines: string[] | null = null
  for (const d of drafts) {
    let first: Passage | null = null
    let line = 0
    let counted = 0
    for (let at = boundedIndexOf(norm, d.core), n = 0; at >= 0 && n < MAX_PASSAGES; at = boundedIndexOf(norm, d.core, at + 1), n++) {
      for (let i = norm.indexOf('\n', counted); i >= 0 && i < at; i = norm.indexOf('\n', i + 1)) {
        line++
        counted = i + 1
      }
      lines ??= paragraphs.split('\n')
      const passage = passageAround(lines[line] ?? '', d.core)
      if (!passage) continue
      first ??= passage
      if (witnessGuard(d, passage) === null) {
        first = passage
        break
      }
    }
    if (first) out.set(d.inr, first)
  }
  return out
}

/** The paragraph normalised, with each normalised character's index in the original. */
function normaliseWithMap(s: string): { text: string; map: number[] } {
  let text = ''
  const map: number[] = []
  let space = false
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!
    if (/[\u00AD\u200B-\u200D\u2060\uFEFF]/.test(ch)) continue
    if (/[\p{L}\p{N}]/u.test(ch)) {
      for (const lower of ch.toLowerCase()) {
        text += lower
        map.push(i)
      }
      space = false
    } else if (!space) {
      text += ' '
      map.push(i)
      space = true
    }
  }
  return { text, map }
}

/** Abbreviations whose full stop ends no sentence in an Erläuterung. */
const ABBREVIATIONS = new Set(['abs', 'art', 'nr', 'z', 'lit', 'bzw', 'vgl', 'etc', 'ua', 'u.a', 'ivm', 'idf', 'idgf', 'bgbl', 'dr', 'mag', 'st', 's', 'bd', 'pkt', 'gem', 'ca', 'zb', 'z.b', 'd.h', 'usw', 'iSd', 'isd', 'ff', 'f', 'tlw', 'insb', 'sog', 'rz', 'abl', 'gp', 'blgnr', 'zl'])

/** Whether the sentence ends at `p[i]` — a full stop, ! or ? before a space and a capital or an opening quote. */
function endsSentence(p: string, i: number): boolean {
  if (!/[.!?]/.test(p[i]!)) return false
  if (!/^\s+[A-ZÄÖÜ„"»(]/.test(p.slice(i + 1, i + 4))) return false
  if (p[i] !== '.') return true
  const word = /(\S+)$/.exec(p.slice(Math.max(0, i - 12), i))?.[1] ?? ''
  if (ABBREVIATIONS.has(word.toLowerCase())) return false
  // „1.", „IV.", „Z 3." — an enumeration or a single letter, no sentence end.
  if (/^(?:\d+|[IVXLC]+|\p{L})$/u.test(word)) return false
  return true
}

/** The text from `a` to `b`, moved inwards to whole words. */
function words(p: string, a: number, b: number): string {
  const from = a > 0 && /\S/.test(p[a - 1]!) ? p.indexOf(' ', a) + 1 || a : a
  const to = b < p.length && /\S/.test(p[b]!) ? Math.max(from, p.lastIndexOf(' ', b)) : b
  return p.slice(from, to).trim()
}

/** How much of the sentence before the core a cut quote keeps — enough for „wird die Änderung des …". */
const QUOTE_LEAD_CHARS = 160

/**
 * The sentence of `paragraph` that holds `core`, as the document has it.
 * Where it is longer than `QUOTE_MAX_CHARS` the quote keeps the core with
 * the words before it and the sentence's END, and elides the middle with
 * „…": the end is where an Erläuterung says what it does with the law it
 * names — 93/ME XXVII: „… ebenfalls in die vorliegende Regierungsvorlage
 * aufgenommen – siehe Artikel 6." Null where the core is not in the
 * paragraph (it always is when `witnessesIn` asks).
 */
export function passageAround(paragraph: string, core: string): Passage | null {
  const { text, map } = normaliseWithMap(paragraph)
  const at = boundedIndexOf(text, core)
  if (at < 0) return null
  const start = map[at]!
  const end = map[at + core.length - 1]! + 1
  let from = 0
  for (let i = start - 1; i >= 0; i--) {
    if (endsSentence(paragraph, i)) {
      from = i + 1
      break
    }
  }
  let to = paragraph.length
  for (let i = end; i < paragraph.length; i++) {
    if (endsSentence(paragraph, i)) {
      to = i + 1
      break
    }
  }
  // A list item's dash or bullet is layout, not the sentence (298 d.B.: „– Stärkung …").
  while (from < start && /[\s–—•·-]/.test(paragraph[from]!)) from++
  const sentence = paragraph.slice(from, to).trim()
  const before = paragraph.slice(from, start)
  if (sentence.length <= QUOTE_MAX_CHARS) return { quote: sentence, sentence, before }
  // Head: the core and up to QUOTE_LEAD_CHARS before it, to the next word's end.
  const headFrom = Math.max(from, start - QUOTE_LEAD_CHARS)
  const headTo = Math.min(to, paragraph.indexOf(' ', end) < 0 ? to : paragraph.indexOf(' ', end))
  const head = `${headFrom > from ? '… ' : ''}${words(paragraph, headFrom, headTo)}`
  const room = QUOTE_MAX_CHARS - head.length - 3
  if (room <= 20 || headTo >= to) return { quote: `${head}${headTo < to ? ' …' : ''}`, sentence, before }
  // Tail: the sentence's end, as much as fits.
  const tailFrom = Math.max(headTo, to - room)
  const tail = words(paragraph, tailFrom, to)
  return { quote: tailFrom > headTo ? `${head} … ${tail}` : `${head} ${tail}`, sentence, before }
}

/** The core's sentence calls it a draft before naming it — „des dzt. in Begutachtung befindlichen Entwurfs eines …" (16/ME XXVI in 68 d.B.). */
const DRAFT_REFERENCE_RE = /(?:Ministerialentw|Entw)(?:urf|ürfe)(?:s|es|n)?\b|Begutachtung/u

/** What a sentence says when a Vorlage takes another text up — „ebenfalls in die vorliegende Regierungsvorlage aufgenommen" (93/ME XXVII in 945 d.B.). */
const TAKEN_UP_RE = /aufgenommen|übernommen|einbezogen|integriert|mitumfasst|eingearbeitet|zusammengeführt/u

/** Why a passage is no witness for the draft, or null where it is one. */
export type GuardRejection =
  /** The Vorlage speaks of the draft as a separate, pending text. */
  | 'verweis'
  /** The core is a law's name, and the sentence does not say the Vorlage takes the draft up. */
  | 'gesetzesname'

/**
 * The two guards on the sentence, each from a case the window and the count
 * let through (the corpus of 14.11.2026):
 *  - 16/ME XXVI, „Datenschutz-Anpassungsgesetz Justiz 2018 – DS-AGJ 2018",
 *    named eight days after its Frist in 68 d.B. as „des dzt. in
 *    Begutachtung befindlichen Entwurfs eines …" — a cross-reference to the
 *    other draft, the opposite of taking it up (`verweis`);
 *  - 24/ME XXVI, „Einkommensteuergesetz 1988, Änderung": its core is the
 *    law's name, and 190 d.B. (JStG 2018) names it as the heading „Zum
 *    Einkommensteuergesetz 1988:" because it amends that law — as every
 *    Vorlage amending a law names it. Where the title amends a law the
 *    sentence must therefore say that the Vorlage takes the text up
 *    (`gesetzesname`); 93/ME XXVII's does.
 */
export function witnessGuard(draft: Pick<WitnessDraft, 'amendment'>, p: Passage): GuardRejection | null {
  if (DRAFT_REFERENCE_RE.test(p.before)) return 'verweis'
  if (draft.amendment && !TAKEN_UP_RE.test(p.sentence)) return 'gesetzesname'
  return null
}

/** Why a draft whose title a Vorlage names does not get the state. */
export type NamedRejection =
  /** Every Vorlage that names it came on or before its Frist ended. */
  | 'vor-fristende'
  /** … or later than `RV_LATENCY_CONTEXT_DAYS` after it. */
  | 'nach-fenster'
  /** Two or more Vorlagen in the window name it. */
  | 'mehrere'
  /** One does, and a Vorlage in the window could not be read — it could be the second. */
  | 'ungelesen'
  /** The one that does publishes its Erläuterungen as a PDF only — no HTML to quote from. */
  | 'nur-pdf'
  /** The one that does is no witness by its sentence (`witnessGuard`). */
  | GuardRejection
  /** Upstream gives the draft no Frist. */
  | 'ohne-frist'

export type NamedVerdict =
  | { named: true; witness: Witness; daysAfterFrist: number }
  | { named: false; reason: NamedRejection }

/**
 * Conditions 4 and 5 over what the scan found for one draft. `unread`: the
 * Vorlagen of the period whose Erläuterungen could not be read. An undated
 * Vorlage counts as inside every window — it cannot be the one, but it can
 * be the second.
 */
export function decideNamedInRv(
  draft: Pick<WitnessDraft, 'gp' | 'inr' | 'deadline' | 'amendment'>,
  witnesses: readonly Witness[],
  unread: readonly WitnessVorlage[],
): NamedVerdict | null {
  const own = witnesses.filter((w) => !w.linkedDrafts.some((l) => l.gp === draft.gp && l.inr === draft.inr))
  if (!own.length) return null
  if (!draft.deadline) return { named: false, reason: 'ohne-frist' }
  const days = (v: WitnessVorlage) => spanInDays(draft.deadline, v.date)
  const inWindow = (v: WitnessVorlage) => {
    const d = days(v)
    return d === null || (d > 0 && d <= RV_LATENCY_CONTEXT_DAYS)
  }
  const candidates = own.filter((w) => inWindow(w.vorlage))
  if (!candidates.length) {
    return { named: false, reason: own.some((w) => (days(w.vorlage) ?? 1) <= 0) ? 'vor-fristende' : 'nach-fenster' }
  }
  if (candidates.length > 1) return { named: false, reason: 'mehrere' }
  const witness = candidates[0]!
  const after = days(witness.vorlage)
  if (after === null) return { named: false, reason: 'mehrere' }
  if (witness.fromPdf) return { named: false, reason: 'nur-pdf' }
  const guard = witnessGuard(draft, witness)
  if (guard) return { named: false, reason: guard }
  if (unread.some(inWindow)) return { named: false, reason: 'ungelesen' }
  return { named: true, witness, daysAfterFrist: after }
}

/** Whether the window of a draft whose Frist ended on `deadline` holds `date` (or `date` is unknown). */
export function inNamedWindow(deadline: string | null, date: string): boolean {
  const d = spanInDays(deadline, date)
  return deadline !== null && (d === null || (d > 0 && d <= RV_LATENCY_CONTEXT_DAYS))
}

/** What a scan over a period's Vorlagen found. */
export interface ScanResult {
  /** Draft `inr` → every Vorlage that names its title. */
  witnesses: Map<number, Witness[]>
  /** Vorlagen without Erläuterungen to read (a PDF only, or none published). */
  unread: UnreadVorlage[]
  /** Vorlagen whose record or document could not be fetched — the scan is incomplete. */
  failed: WitnessVorlage[]
}

/**
 * Reads each Vorlage's Erläuterungen — `limit` at a time, one document held
 * per worker and let go once its matches are taken — and collects which
 * drafts' titles it names. `read` throws on a failed fetch, which marks the
 * Vorlage `failed`, never `unread`: an unread Vorlage is a fact about the
 * Vorlage, a failed one a fact about the moment.
 */
export async function scanVorlagen(
  vorlagen: readonly WitnessVorlage[],
  drafts: readonly WitnessDraft[],
  read: (v: WitnessVorlage) => Promise<VorlageReading>,
  limit: number,
): Promise<ScanResult> {
  const out: ScanResult = { witnesses: new Map(), unread: [], failed: [] }
  await mapWithConcurrency(vorlagen, limit, async (v) => {
    let reading: VorlageReading
    try {
      reading = await read(v)
    } catch {
      out.failed.push(v)
      return
    }
    if (!reading.html || !reading.explanationsUrl) {
      out.unread.push({ ...v, pdfUrl: reading.pdfUrl, linkedDrafts: reading.linkedDrafts })
      return
    }
    // Every draft of the period the Vorlage is not linked to — the window
    // is `decideNamedInRv`'s, so the corpus sees what it rejects.
    const asked = drafts.filter(
      (d) => d.gp === v.gp && !reading.linkedDrafts.some((l) => l.gp === d.gp && l.inr === d.inr),
    )
    const found = witnessesIn(htmlParagraphs(reading.html), asked)
    for (const [inr, passage] of found) {
      const list = out.witnesses.get(inr) ?? []
      list.push({ ...passage, vorlage: v, explanationsUrl: reading.explanationsUrl, linkedDrafts: reading.linkedDrafts })
      out.witnesses.set(inr, list)
    }
  })
  return out
}

/** Condition 1, as far as the page knows it — every input a fact of the draft's own record. */
export function mayBeNamed(d: {
  active: boolean
  hasRv: boolean
  coverage: ChainCoverage
  antragPath: unknown
  successor: unknown
}): boolean {
  return !d.active && !d.hasRv && d.coverage === 'linked' && d.antragPath == null && d.successor == null
}

/** The state the page shows, out of an accepted verdict. */
export function namedInRvOf(v: Extract<NamedVerdict, { named: true }>): NamedInRv {
  const w = v.witness
  return {
    rv: { gp: w.vorlage.gp, inr: w.vorlage.inr, citation: w.vorlage.citation, url: w.vorlage.url, date: w.vorlage.date },
    explanationsUrl: w.explanationsUrl,
    quote: w.quote,
    daysAfterFrist: v.daysAfterFrist,
    linkedDrafts: w.linkedDrafts,
  }
}

/** Why a draft of the period is not looked for at all. */
export type NamedExclusion =
  /** Parliament links it to a Vorlage, or its text went as an Initiativantrag. */
  | 'verknuepft'
  /** The wording ties it to an Initiativantrag (`antragPath.ts`), whole or in part. */
  | 'antrag'
  /** A same-title later draft exists (`related.ts`) — that one is where the story goes on. */
  | 'nachfolger'
  /** Condition 2: the title core is too short to name more than a law … */
  | 'kurz'
  /** … or a list of laws ending in „u.a.". */
  | 'gesetzesliste'

/** What the index of one period is built from — the server's caches or the corpus script's. */
export interface NamedIndexInput {
  gp: string
  /** List 81 of the period, folded (`dedupeDraftList`). */
  drafts: readonly DraftSummary[]
  /** List 81 of the next period — where a successor of a draft of an ended one is filed; [] while it runs. */
  laterDrafts: readonly DraftSummary[]
  /** Whether Parliament links the draft to a Vorlage (or the station map took it to an Antrag); null: not known. */
  linked: (inr: number) => boolean | null
  /** List 101 of the period. */
  vorlagen: readonly VorlageRow[]
  /** The drafts the station map links to a Vorlage, beside what the Vorlage's own record names. */
  linksOf: (v: WitnessVorlage) => LinkedDraft[]
  read: (v: WitnessVorlage) => Promise<VorlageReading>
  /** A PDF's text, a page per line (`pdfParagraphs`); null where pdf.js cannot read it. Throws on a failed fetch. */
  readPdf: (url: string) => Promise<string | null>
  limit: number
  /** Read every Vorlage, not only those inside a candidate's window — the corpus, to name what the window rejects. */
  everyVorlage?: boolean
}

export interface NamedIndexResult {
  /** Draft `inr` → its state. */
  named: Record<number, NamedInRv>
  /** False where a Vorlage could not be fetched: nothing may be claimed from it. */
  complete: boolean
  /** Drafts a Vorlage names that did not get the state, and why — for the corpus. */
  rejected: { draft: WitnessDraft; reason: NamedRejection | 'antrag' | 'nachfolger'; witnesses: Witness[] }[]
  /** Drafts not looked for, and why — for the corpus. */
  excluded: { draft: DraftSummary; reason: NamedExclusion }[]
  counts: { candidates: number; vorlagen: number; read: number; pdfsRead: number; unread: number; failed: number }
}

/** Condition 1's static half and condition 2, over the period's list. */
export function namedCandidates(input: Pick<NamedIndexInput, 'gp' | 'drafts' | 'laterDrafts' | 'linked'>): {
  candidates: WitnessDraft[]
  excluded: NamedIndexResult['excluded']
} {
  const candidates: WitnessDraft[] = []
  const excluded: NamedIndexResult['excluded'] = []
  const pool = [...input.drafts, ...input.laterDrafts]
  for (const d of input.drafts) {
    if (d.gp !== input.gp) continue
    if (input.linked(d.inr) === true) excluded.push({ draft: d, reason: 'verknuepft' })
    else if (antragPathFor(d.gp, d.inr)) excluded.push({ draft: d, reason: 'antrag' })
    else if (findRelatedDrafts(d, pool).successor) excluded.push({ draft: d, reason: 'nachfolger' })
    else {
      const t = titleCoreOf(d.title)
      if (t.core === null) excluded.push({ draft: d, reason: t.reason })
      else candidates.push({ gp: d.gp, inr: d.inr, citation: d.citation, title: d.title, deadline: d.deadline, core: t.core, amendment: t.amendment })
    }
  }
  return { candidates, excluded }
}

/**
 * The period's index: the candidates, the Vorlagen inside any of their
 * windows (or all, `everyVorlage`), the scan, the verdicts.
 */
export async function buildNamedIndex(input: NamedIndexInput): Promise<NamedIndexResult> {
  const { candidates, excluded } = namedCandidates(input)
  /* The corpus also scans the drafts condition 1 keeps out by its Antrag or
   * its successor, so it can say whether a Vorlage names them too. */
  const scanned = input.everyVorlage
    ? [
        ...candidates,
        ...excluded.flatMap(({ draft: d, reason }) => {
          const t = reason === 'antrag' || reason === 'nachfolger' ? titleCoreOf(d.title) : null
          return t?.core ? [{ gp: d.gp, inr: d.inr, citation: d.citation, title: d.title, deadline: d.deadline, core: t.core, amendment: t.amendment }] : []
        }),
      ]
    : candidates
  const vorlagen: WitnessVorlage[] = input.vorlagen
    .filter((v) => v.gp === input.gp)
    .map((v) => ({ gp: v.gp, inr: v.inr, citation: v.citation, date: v.date, url: v.parliamentUrl }))
  const toRead = input.everyVorlage ? vorlagen : vorlagen.filter((v) => candidates.some((d) => inNamedWindow(d.deadline, v.date)))
  const read = async (v: WitnessVorlage): Promise<VorlageReading> => {
    const r = await input.read(v)
    const links = [...r.linkedDrafts]
    for (const l of input.linksOf(v)) if (!links.some((k) => k.gp === l.gp && k.inr === l.inr)) links.push(l)
    return { ...r, linkedDrafts: links }
  }
  const scan: ScanResult = scanned.length ? await scanVorlagen(toRead, scanned, read, input.limit) : { witnesses: new Map(), unread: [], failed: [] }
  const htmlRead = toRead.length - scan.unread.length - scan.failed.length

  /* THE SECOND WITNESS IN A PDF. Where one Vorlage in a draft's window names
   * it and another in that window publishes its Erläuterungen as a PDF only
   * (the Budgetbegleitgesetze, 9 of 131 Vorlagen of GP XXVIII), condition 5
   * is open until that PDF is read — so it is read, one at a time, only
   * there (the corpus: all of them). What it finds counts against the
   * state, never for it: the page quotes HTML only. */
  const decisive = (d: WitnessDraft) => {
    const inWindow = (scan.witnesses.get(d.inr) ?? []).filter((w) => inNamedWindow(d.deadline, w.vorlage.date))
    return inWindow.length === 1 && !inWindow[0]!.fromPdf
  }
  const pdfs = scan.unread.filter(
    (v) => v.pdfUrl && (input.everyVorlage || candidates.some((d) => decisive(d) && inNamedWindow(d.deadline, v.date))),
  )
  for (const v of pdfs) {
    let text: string | null
    try {
      text = await input.readPdf(v.pdfUrl!)
    } catch {
      scan.failed.push(v)
      scan.unread.splice(scan.unread.indexOf(v), 1)
      continue
    }
    if (text === null) continue
    scan.unread.splice(scan.unread.indexOf(v), 1)
    const asked = scanned.filter((d) => !v.linkedDrafts.some((l) => l.gp === d.gp && l.inr === d.inr))
    for (const [inr, passage] of witnessesIn(text, asked)) {
      const list = scan.witnesses.get(inr) ?? []
      list.push({ ...passage, vorlage: v, explanationsUrl: v.pdfUrl!, linkedDrafts: v.linkedDrafts, fromPdf: true })
      scan.witnesses.set(inr, list)
    }
  }
  const named: Record<number, NamedInRv> = {}
  const rejected: NamedIndexResult['rejected'] = []
  for (const d of scanned) {
    const witnesses: Witness[] = scan.witnesses.get(d.inr) ?? []
    const verdict = decideNamedInRv(d, witnesses, scan.unread)
    if (!verdict) continue
    const kept = excluded.find((e) => e.draft.inr === d.inr)?.reason
    if (kept === 'antrag' || kept === 'nachfolger') rejected.push({ draft: d, reason: kept, witnesses })
    else if (verdict.named) named[d.inr] = namedInRvOf(verdict)
    else rejected.push({ draft: d, reason: verdict.reason, witnesses })
  }
  return {
    named,
    complete: scan.failed.length === 0,
    rejected,
    excluded,
    counts: {
      candidates: candidates.length,
      vorlagen: vorlagen.length,
      read: htmlRead,
      pdfsRead: pdfs.length - pdfs.filter((v) => scan.unread.includes(v) || scan.failed.includes(v)).length,
      unread: scan.unread.length,
      failed: scan.failed.length,
    },
  }
}

/**
 * A PDF's text as `witnessesIn` reads it: a page per line, whitespace
 * collapsed, a word hyphenated over a line break joined again. Null where
 * pdf.js cannot open it or it is too long (`withPdf`).
 */
export async function pdfParagraphs(bytes: Uint8Array): Promise<string | null> {
  try {
    const { extractText } = await import('unpdf')
    const { text } = await withPdf(bytes, (doc) => extractText(doc, { mergePages: false }), { verbosity: 0 })
    return (Array.isArray(text) ? text : [text])
      .map((page) => page.replace(/(\p{Ll})-\s+(\p{Ll})/gu, '$1$2').replace(/\s+/g, ' ').trim())
      .join('\n')
  } catch {
    return null
  }
}

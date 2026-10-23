/**
 * A Land's draft against its Kundmachung, § by § (22.10.2026): the draft
 * from the Land's PDF (`draftPdfLaw`), the Kundmachung from the
 * Landesgesetzblatt's RIS XML, and the comparison the Bund's drafts use
 * (`diffLawUnits`). Measured before it was built — docs/architecture.md
 * §12.44.
 *
 * PURE MODULE — the PDF's pages and the XML come in as text.
 *
 * Two adjustments, both on the Land's path only:
 * - The Landesgesetzblatt sets its Artikel as `<ueberschrift typ="art">`,
 *   which the RIS parser does not map — and its quoted divisions too („7b.
 *   Abschnitt"). Mapped to `g1`, the parser takes an „Artikel …" for an
 *   Artikel and anything else for a section heading, which it drops as
 *   payload: both right here. NOT in the federal parser: there RIS types
 *   „I. TEIL" of a Verordnung the same way, ahead of any instruction, and
 *   as a section heading it became the Artikel's title — 105 units of
 *   federal drafts renamed, measured over 245 cached RIS documents on
 *   22.10.2026 (`scripts/corpus/artMapping.ts`). A Novelle of the
 *   Landesgesetzblatt has no such heading before its Artikel.
 * - Quote marks are dropped on both sides after the units are cut, and a
 *   compound split at a line end is closed up. The PDF has „§ 5 where the
 *   XML keeps the opening quote in an element the parser leaves out;
 *   compared as they come, every quoted § read as changed.
 */
import type { LawDiffUnit } from '#shared/types'
import { articlePairs, diffAtSamePlace } from '../diff/lawDiff'
import { parseLawUnitsFromRis, segmentUnits, type LawUnit } from '../lawtext/lawUnits'
import { lawBlocksFromPdfPages } from './draftPdfLaw'

/* Double quotes, and the single inner ones Salzburg nests („‚erneuerbare
   Energie‘"); not the apostrophe ’, which is part of a word. */
const QUOTES_RE = /[„“”"»«‚‘]/g

/* Quotes out, and a compound split at a line end closed up again
   („Median- Entgelthöhe" in the XML): a hyphen, a space, a capital. „Land-
   und Forstwirtschaft" keeps its space — the next word is lower case. */
function clean(text: string): string {
  return text.replace(QUOTES_RE, '').replace(/(\p{L})- (?=\p{Lu})/gu, '$1-').replace(/\s*&\s*/g, '&')
    // One bullet glyph („•" in the PDF, „●" in RIS), and no image path RIS
    // leaves in the text of a table („/Dokumente/LgblAuth/…/image002.jpg").
    .replace(/[•●▪◦]/g, '•').replace(/\S*\/Dokumente\/\S+\.(?:jpe?g|png|gif)\b/gi, ' ').replace(/\s+/g, ' ').trim()
}

/* The Artikel names too: RIS writes „Artikel\u00a0I" with a no-break
   space, the PDF „Artikel I" — equal to the eye, not to the map the units
   are grouped by, so an untitled Artikel paired by number held no unit
   (Salzburg 29779). */
const sameSpaces = (s: string | null) => (s === null ? null : s.replace(/\s+/g, ' ').trim())

const ROMAN: readonly [number, string][] = [[50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]
function roman(n: number): string {
  let out = ''
  for (const [value, digits] of ROMAN) while (n >= value) { out += digits; n -= value }
  return out
}
const ARABIC_ARTICLE_RE = /^(Art(?:ikel|\.)\s*)(\d{1,2})(?!\d)/
const romanArticle = (s: string | null) => (s === null ? null : s.replace(ARABIC_ARTICLE_RE, (_m, art: string, n: string) => `${art}${roman(Number(n))}`))

/**
 * One numbering for the Artikel: the Land's PDFs write „Artikel 1", the
 * Landesgesetzblatt „Artikel I" (Salzburg 32923, 23.10.2026). Paired as they
 * came, no Artikel met its partner — not by name, not by number — and the
 * comparison of two identical texts read as two texts with nothing in common.
 * Roman, as RIS prints them.
 */
function romanArticles(units: readonly LawUnit[]): LawUnit[] {
  return units.map((u) => ({ ...u, article: romanArticle(u.article), articleNumber: romanArticle(u.articleNumber) }))
}

function unquoted(units: LawUnit[]): LawUnit[] {
  return units.map((u) => ({
    ...u,
    article: sameSpaces(u.article),
    articleNumber: sameSpaces(u.articleNumber),
    text: clean(u.text),
    blocks: u.blocks.map((b) => ({ ...b, text: clean(b.text) })),
  }))
}

/** The Kundmachung's units, from the Landesgesetzblatt's RIS XML. */
/**
 * A NEW law sets „§ 1" inside its § heading („§ 1<br />Ziel und
 * Anwendungsbereich"); the federal XML carries it as `<gldsym>` in the first
 * Absatz, which is where `segmentUnits` opens a §. Moved there — but only in
 * a law without amending instructions: inside a Novelle the same heading is
 * quoted payload, and the PDF side keeps „§ 5 Schlichtungsverfahren" as text.
 */
const PARA_HEAD_RE = /<ueberschrift typ="para"([^>]*)>\s*(§\s*\d+[a-z]*\.?)\s*(?:<br\s*\/>\s*([\s\S]*?))?<\/ueberschrift>(\s*)<absatz typ="(abs|satz)"([^>]*)>/g

const SIGNATURE_TABLE_RE = /<table\b(?:(?!<\/table>)[\s\S])*?(?:Präsident|Landeshauptmann|Landeshauptfrau)(?:(?!<\/table>)[\s\S])*<\/table>/g

const DIVISION_HEAD_RE = /<ueberschrift typ="(?:g1|g1min|g2|art)"[^>]*>(?!\s*(?:<[^>]+>\s*)*Artikel\b)(?:(?!<\/ueberschrift>)[\s\S])*?\b(?:Abschnitt|Unterabschnitt|Teil|Hauptstück|ABSCHNITT|TEIL|HAUPTSTÜCK)\b(?:(?!<\/ueberschrift>)[\s\S])*<\/ueberschrift>/g

export function lgblUnits(xml: string): LawUnit[] {
  // Per Artikel, not per document: a package can enact a law in Artikel I
  // and amend another in Artikel II (16087, 16099, 16022 read one to two
  // units of a whole new law while the gate was the document).
  // Split at the Artikel only: the Landesgesetzblatt types its divisions
  // („1. Teil", „2. Abschnitt") as `art` too (LGBl. Nr. 64/2021). Salzburg
  // types the Artikel itself as `g1` — unsplit, a new law in Artikel I read
  // as two instructions of Artikel II (LGBl. Nr. 95/2022, 112/2021).
  // „(Verfassungsbestimmung)" under an Artikel is set as a § heading, and
  // the reader took it for the Artikel's name: every such Artikel of a
  // package became one group of that name (LGBl. Nr. 76/2025, Artikel 1 and
  // 4, 23.10.2026). A note on the Artikel, not a name; the PDF side has none.
  const parts = xml
    .replace(/<ueberschrift typ="para"[^>]*>\s*\((?:Verfassungsbestimmung|Grundsatzbestimmung)\)\s*<\/ueberschrift>/g, '')
    .split(/(?=<ueberschrift typ="(?:art|g1)"[^>]*>\s*(?:<[^>]+>\s*)*Artikel\b)/)
  const doc = parts.map((part) => /<absatz typ="novao[12]"/.test(part)
    ? part
    : part
        .replace(PARA_HEAD_RE, (_m, attrs: string, sym: string, title: string | undefined, gap: string, typ: string, absAttrs: string) =>
          `<ueberschrift typ="para"${attrs}>${title ?? ''}</ueberschrift>${gap}<absatz typ="${typ}"${absAttrs}><gldsym>${sym.endsWith('.') ? sym : `${sym}.`}</gldsym>`)
        // A new law's divisions („1. Abschnitt Allgemeine Bestimmungen")
        // would name the Artikel — the parser takes the first heading after
        // it for its title — and the PDF side drops them (`draftPdfLaw`).
        .replace(DIVISION_HEAD_RE, ''))
    .join('')
  return parseLawUnitsFromRis(doc
    .replace(/<ueberschrift typ="art"/g, '<ueberschrift typ="g1"')
    // The signatures under the law („Der Erste Präsident des Oö. Landtags: /
    // Der Landeshauptmann:"), a table the parser would append to the last
    // unit — seen in the committee-report cross-check (§12.44).
    .replace(SIGNATURE_TABLE_RE, '')
    // A sub-instruction („2.2. Im Abs 2 lautet …", Salzburg) is part of its
    // instruction: as plain text it joins it, as the PDF side reads it.
    .replace(/<absatz typ="novao[12]"([^>]*)>(\s*(?:<[^>]+>\s*)*\d+\.\s?\d+\.\s)/g, '<absatz typ="abs"$1>$2')
    // RIS writes „&" as an element (`Land<amp />Forst`). The shared reader
    // keeps it too since 22.10.2026 (`risXml.ts`); this pass is older and
    // harmless twice.
    .replace(/<amp\s*\/>/g, '&'))
}

/** The draft's units, from its PDF's pages; null where no legal text was found. */
export function landDraftUnits(pages: readonly string[]): LawUnit[] | null {
  const blocks = lawBlocksFromPdfPages(pages)
  return blocks ? segmentUnits(blocks) : null
}

/** Half of an Artikel's instructions, word for word, in the other: the same law. */
const SAME_CONTENT_SHARE = 0.5

/**
 * The Artikel the names do not pair, paired by what they say (23.10.2026):
 * a draft of one law carries no Artikel, and the Vorlage made a package of
 * it — 33388, whose Artikel I is the draft word for word and Artikel II–IV
 * are laws the Land added. Neither title nor number nor § address pairs
 * the draft's single text with „Artikel I", and the comparison said the two
 * had nothing in common. An Artikel still unpaired goes to the unpaired one
 * that holds at least half of its instructions word for word, and the most.
 */
function landArticlePairs(from: readonly LawUnit[], to: readonly LawUnit[]): { from: string | null; to: string | null }[] {
  const pairs: { from: string | null; to: string | null }[] = articlePairs(from, to).map((p) => ({ from: p.from, to: p.to }))
  // `articlePairs` returns what it paired; the rest of the earlier text's
  // Artikel stand unpaired — which `packageChanges` reports as dropped.
  const paired = new Set(pairs.map((p) => p.from))
  for (const article of new Set(from.map((u) => u.article))) if (!paired.has(article)) pairs.push({ from: article, to: null })
  const used = new Set<string | null>(pairs.map((p) => p.to).filter((a) => a !== null))
  const textsOf = (units: readonly LawUnit[], article: string | null) =>
    new Set(units.filter((u) => u.article === article).map((u) => clean(u.text).toLowerCase()))
  const open = [...new Set(to.map((u) => u.article))].filter((a) => !used.has(a))
  for (const p of pairs) {
    if (p.to !== null) continue
    const mine = textsOf(from, p.from)
    if (!mine.size) continue
    let best: { article: string | null; share: number } | null = null
    for (const article of open) {
      if (used.has(article)) continue
      const theirs = textsOf(to, article)
      let hits = 0
      for (const t of mine) if (theirs.has(t)) hits++
      const share = hits / mine.size
      if (share >= SAME_CONTENT_SHARE && (!best || share > best.share)) best = { article, share }
    }
    if (best) {
      p.to = best.article
      used.add(best.article)
    }
  }
  return pairs
}

const PAIR_MARK = 'artikelpaar'
const PAIR_MARK_RE = / artikelpaar\d+$/

/**
 * The comparison, with the engine's pass that pairs an instruction reworded
 * at the same place (`diffAtSamePlace`; first measured here, 16101, §12.44
 * Nachtrag 3).
 */
export function diffLandDraft(draftAsRead: LawUnit[], kundmachungAsRead: LawUnit[]): LawDiffUnit[] {
  const draft = romanArticles(draftAsRead)
  const kundmachung = romanArticles(kundmachungAsRead)
  // The Artikel are paired on the texts AS THEY ARE: pairing by number
  // checks which §§ each side's instructions address, and a quoted § is new
  // wording, not an address — without the quotes every quoted § counted as
  // one, and Salzburg 29779 paired no Artikel I. The draft's Artikel then
  // take their partners' names, so the comparison of the cleaned texts
  // pairs them again by title.
  // A shared marker word per pair carries the decision through: untitled
  // Artikel („Artikel I" on both sides) have no other word for the title
  // rule to match. Taken off again before anything leaves this function.
  const pairs = landArticlePairs(draft, kundmachung).filter((p) => p.to !== null)
  const markFrom = new Map(pairs.map((p, k) => [p.from, k]))
  const markTo = new Map(pairs.map((p, k) => [p.to, k]))
  const marked = (name: string | null, k: number | undefined) => (k === undefined ? sameSpaces(name) : `${sameSpaces(name) ?? ''} ${PAIR_MARK}${k}`)
  const from = unquoted(draft).map((u, i) => ({ ...u, article: marked(pairs[markFrom.get(draft[i]!.article) ?? -1]?.to ?? draft[i]!.article, markFrom.get(draft[i]!.article)) }))
  const to = unquoted(kundmachung).map((u, i) => ({ ...u, article: marked(kundmachung[i]!.article, markTo.get(kundmachung[i]!.article)) }))
  const result = diffAtSamePlace(from, to)
  const unmark = (s: string | null | undefined) => (s == null ? s : s.replace(PAIR_MARK_RE, ''))
  return result.map((u) => ({ ...u, article: unmark(u.article) ?? null, ...(u.fromArticle ? { fromArticle: unmark(u.fromArticle)! } : {}) }))
}

/**
 * The Artikel only one side has: a law the Landtag added to the package, or
 * one it dropped. Paired as the comparison pairs them (`landArticlePairs`), by
 * title before number.
 */
export function packageChanges(draftAsRead: LawUnit[], kundmachungAsRead: LawUnit[]): { added: string[]; dropped: string[] } {
  const draft = romanArticles(draftAsRead)
  const kundmachung = romanArticles(kundmachungAsRead)
  const pairs = landArticlePairs(draft, kundmachung)
  const paired = new Set(pairs.map((p) => p.to).filter((a): a is string => a !== null))
  // Not where the other text has an Artikel of the same name: the list groups
  // by name, so that group holds both sides, and „added" or „dropped" would
  // contradict it (Salzburg 32879: „Artikel IV" in both, renumbered § 8 → § 7).
  const before = new Set(draft.map((u) => u.article))
  const after = new Set(kundmachung.map((u) => u.article))
  const added = [...new Set(kundmachung.map((u) => u.article).filter((a): a is string => a !== null && !paired.has(a) && !before.has(a)))]
  const dropped = pairs.filter((p) => p.from !== null && p.to === null && !after.has(p.from)).map((p) => p.from!)
  return { added, dropped }
}

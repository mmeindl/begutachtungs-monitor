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
import { articlePairs, diffLawUnits } from '../diff/lawDiff'
import { compareWords, tokenSimilarity } from '../diff/wordDiff'
import { parseLawUnitsFromRis, segmentUnits, type LawUnit } from '../lawtext/lawUnits'
import { lawBlocksFromPdfPages } from './draftPdfLaw'

const QUOTES_RE = /[„“”"»«]/g

/* Quotes out, and a compound split at a line end closed up again
   („Median- Entgelthöhe" in the XML): a hyphen, a space, a capital. „Land-
   und Forstwirtschaft" keeps its space — the next word is lower case. */
function clean(text: string): string {
  return text.replace(QUOTES_RE, '').replace(/(\p{L})- (?=\p{Lu})/gu, '$1-').replace(/\s*&\s*/g, '&').replace(/\s+/g, ' ').trim()
}

function unquoted(units: LawUnit[]): LawUnit[] {
  return units.map((u) => ({ ...u, text: clean(u.text), blocks: u.blocks.map((b) => ({ ...b, text: clean(b.text) })) }))
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
  // („1. Teil", „2. Abschnitt") as `art` too (LGBl. Nr. 64/2021).
  const parts = xml.split(/(?=<ueberschrift typ="art"[^>]*>\s*(?:<[^>]+>\s*)*Artikel\b)/)
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
    // RIS writes „&" as an element (`Land<amp />Forst`), which the shared
    // parser drops with the other tags; the federal fix waits for its own
    // old-against-new run (TODO.md).
    .replace(/<amp\s*\/>/g, '&'))
}

/** The draft's units, from its PDF's pages; null where no legal text was found. */
export function landDraftUnits(pages: readonly string[]): LawUnit[] | null {
  const blocks = lawBlocksFromPdfPages(pages)
  return blocks ? segmentUnits(blocks) : null
}

/** The provision an instruction addresses first: „§ 14 Abs. 8", „§ 5". */
function addressOf(heading: string | null): string | null {
  // „§ 82 (neu) (= bisheriger § 60) Abs. 3": the brackets are no address.
  const h = (heading ?? '').replace(/\s*\((?:neu|=[^)]*)\)/g, '')
  const m = /§\s*(\d+[a-z]*)(?:\s+Abs\.\s*(\d+[a-z]*))?(?:\s+(Z\s*\d+[a-z]*|lit\.\s*[a-z]+|(?:erster|zweiter|dritter|vierter|fünfter|sechster|siebter|achter|neunter|zehnter|vorletzter|letzter)\s+Satz))?/.exec(h)
  // The finer place right after it belongs to the address: „§ 22 Abs. 5 Z 1"
  // and „… Z 2" are two places, „vorletzter" and „letzter Satz" too.
  return m ? `§${m[1]}${m[2] ? ` Abs.${m[2]}` : ''}${m[3] ? ` ${m[3].replace(/\s+/g, '')}` : ''}` : null
}

/** Lower than the engine's 0.6, because the address already says it is the
 *  same place; read over all 34 pairs a looser rule made (§12.44 Nachtrag 3). */
const SAME_PLACE_SIMILARITY = 0.35

/**
 * The comparison, and one pass the Bund's engine does not make (yet): an
 * instruction reworded so far that the engine reports it removed and a new
 * one inserted — „Im § 1 Abs. 2 wird folgende Z 3a eingefügt" against „Im
 * § 1 Abs. 2 wird nach Z 3 folgende Z 3a eingefügt" (16101) — is paired as
 * one changed instruction, where it is the ONLY such pair at that address in
 * its Artikel and the two still share a third of their words. Done by giving
 * the later one the earlier one's instruction line, which the engine's first
 * rule (same Artikel, same heading) pairs; measured in §12.44, Nachtrag 3.
 */
export function diffLandDraft(draft: LawUnit[], kundmachung: LawUnit[]): LawDiffUnit[] {
  const from = unquoted(draft)
  const to = unquoted(kundmachung)
  const first = diffLawUnits(from, to)
  const key = (u: LawDiffUnit, address: string | null) => `${u.articleKey ?? u.fromArticleKey ?? ''}|${address}`
  const removed = new Map<string, LawDiffUnit[]>()
  const inserted = new Map<string, LawDiffUnit[]>()
  for (const u of first) {
    if (u.change !== 'removed' && u.change !== 'inserted') continue
    const unit = (u.change === 'removed' ? from : to).find((x) => x.id === (u.change === 'removed' ? (u.fromId ?? u.id) : u.id) && x.article === (u.change === 'removed' ? (u.fromArticle ?? u.article) : u.article))
    const address = addressOf(unit?.heading ?? u.heading)
    if (!address) continue
    const map = u.change === 'removed' ? removed : inserted
    map.set(key(u, address), [...(map.get(key(u, address)) ?? []), u])
  }
  let paired = 0
  const renamed = to.map((t) => ({ ...t }))
  for (const [k, ins] of inserted) {
    const rem = removed.get(k)
    if (ins.length !== 1 || rem?.length !== 1) continue
    const a = from.find((x) => x.id === (rem[0]!.fromId ?? rem[0]!.id) && x.article === (rem[0]!.fromArticle ?? rem[0]!.article))
    const b = renamed.find((x) => x.id === ins[0]!.id && x.article === ins[0]!.article)
    if (!a || !b || tokenSimilarity(compareWords(a.text), compareWords(b.text)) < SAME_PLACE_SIMILARITY) continue
    b.heading = a.heading
    paired++
  }
  return paired ? diffLawUnits(from, renamed) : first
}

/**
 * The Artikel only one side has: a law the Landtag added to the package, or
 * one it dropped. Paired as the comparison pairs them (`articlePairs`), by
 * title before number.
 */
export function packageChanges(draft: LawUnit[], kundmachung: LawUnit[]): { added: string[]; dropped: string[] } {
  const pairs = articlePairs(draft, kundmachung)
  const paired = new Set(pairs.map((p) => p.to).filter((a): a is string => a !== null))
  const added = [...new Set(kundmachung.map((u) => u.article).filter((a): a is string => a !== null && !paired.has(a)))]
  const dropped = pairs.filter((p) => p.from !== null && p.to === null).map((p) => p.from!)
  return { added, dropped }
}

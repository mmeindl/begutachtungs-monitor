/**
 * What a Landesgesetz changed, § by § (12.11.2026): the wording before it
 * against the wording it brought, both from RIS's consolidated Landesrecht
 * (`LrKons`), checked against the Landesgesetzblatt's own instructions.
 *
 * The NEW wording of a § is a version RIS itself ties to this
 * Landesgesetzblatt: its Kundmachungsorgan names it as the last change
 * („LGBl Nr 57/2019 zuletzt geändert durch LGBl Nr 31/2026") — the filter the
 * geltende Fassung uses (`landKonsLaws.ts`). The OLD wording is the same §'s
 * version that ended the day before the new one began. Everything less
 * certain is not compared (`PairResult`): no date, a gap between the
 * versions, several candidates, a record missing. A § without any earlier
 * version is new.
 *
 * And a § is shown only where an instruction of the Landesgesetzblatt names
 * it (`lgblInstructedParagraphs`, every § an instruction or one of its
 * sub-instructions names before its quoted text). The rest is counted and named, never dropped silently:
 * §§ RIS ties to the Landesgesetzblatt that no instruction names
 * (`uninstructed`), §§ an instruction names that found no pair
 * (`unpaired`), §§ of a law no instruction's law could be matched to
 * (`lawUnmatched`, 20.11.2026). A law the Landesgesetzblatt enacts anew has no instructions
 * and no earlier version: its §§ stand as new. A law it repeals as a whole
 * is stated once, with the number of its §§ (`lgblRepealedLaws`, 23.11.2026).
 *
 * Measured before it was built as a set per law (10.11.2026: 57 of 176
 * laws with equal sets, the first § of each instruction only) — too coarse
 * to show; per § with these guards it is a different question, measured
 * per Land in `docs/decisions.md`.
 *
 * PURE: RIS records, § XML and the Landesgesetzblatt's units come in.
 */
import type { LawUnit, TextBlock } from '../lawtext/lawUnits'
import { normalizeText, stripMarkup } from '../lawtext/normalize'
import { decodeEntities } from '../parliament/htmlText'
import { FIGURE_MARK } from '../../../shared/utils/figureMark'
import { lgblWords } from './lgblSearch'

/** One version of a § in RIS's consolidated Landesrecht. */
export interface LandKonsVersion {
  gesetzesnummer: string
  /** The law's Kurztitel, as RIS spells it. */
  law: string
  /** „§5", „§5a", „Art.19" — the key the units use. */
  key: string
  from: string | null
  to: string | null
  organ: string
  xmlUrl: string | null
  /** The Stammnorm's number („57/2019"). */
  stammnorm: string | null
  /** The law's abbreviation, as RIS gives it apart from the Kurztitel („K-BV"). */
  abbreviation: string | null
}

const str = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '')

/** „§ 5" → „§5", „Art. 19" → „Art.19"; null for an Anlage, the Titel, „§ 0" (the law as a whole). */
export function konsKey(designation: string): string | null {
  const s = designation.replace(/\s+/g, ' ').trim()
  const para = /^§\s*(\d+[a-z]*)$/.exec(s)?.[1]
  if (para) return para === '0' ? null : `§${para}`
  const art = /^Art(?:ikel|\.)?\s*(\d+[a-z]*)$/.exec(s)?.[1]
  return art ? `Art.${art}` : null
}

/* eslint-disable @typescript-eslint/no-explicit-any -- RIS's envelope */
/** One `OgdDocumentReference` of an `LrKons` search; null for anything that is no §. */
export function konsVersionOf(ref: any): LandKonsVersion | null {
  const meta = ref?.Data?.Metadaten?.Landesrecht
  const k = meta?.LrKons
  const key = konsKey(str(k?.ArtikelParagraphAnlage))
  const gesetzesnummer = str(k?.Gesetzesnummer)
  if (!key || !gesetzesnummer) return null
  let xmlUrl: string | null = null
  for (const c of [ref?.Data?.Dokumentliste?.ContentReference].flat()) {
    for (const u of [c?.Urls?.ContentUrl].flat()) if (!xmlUrl && typeof u?.Url === 'string' && u.Url.endsWith('.xml')) xmlUrl = u.Url
  }
  const date = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null)
  return {
    gesetzesnummer,
    law: str(meta?.Kurztitel),
    key,
    from: date(k?.Inkrafttretensdatum),
    to: date(k?.Ausserkrafttretensdatum),
    organ: str(k?.Kundmachungsorgan),
    xmlUrl,
    stammnorm: str(k?.StammnormBgblnummer) || null,
    abbreviation: str(k?.Abkuerzung) || null,
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Whether a version is THIS Landesgesetzblatt's: named last in its Kundmachungsorgan, and not as the repeal. */
export function namesAsLast(organ: string, nummer: string): boolean {
  const cited = new RegExp(`LGBl\\.?\\s*Nr\\.?\\s*${nummer.replace('/', '\\/')}(?![\\d/])\\s*$`)
  return cited.test(organ) && !/aufgehoben durch/.test(organ)
}

/** Whether a version is the repeal BY this Landesgesetzblatt. */
export function repealedBy(organ: string, nummer: string): boolean {
  return new RegExp(`aufgehoben durch LGBl\\.?\\s*Nr\\.?\\s*${nummer.replace('/', '\\/')}(?![\\d/])`).test(organ)
}

/**
 * Whether a version may be the one this Landesgesetzblatt REPLACED, though
 * RIS names it as its change: it began before the Kundmachung and is no
 * longer in force. RIS Kärnten records some amendments that way (§ 94
 * K-LSchG: „zuletzt geändert durch LGBl. Nr. 39/2016", kundgemacht
 * 24.06.2016, on the wording of 01.09.2014 to 30.06.2016), and its pair
 * would show the change before. A retroactive Inkrafttreten still in force
 * passes; one amended since loses its comparison — not compared rather than
 * wrong.
 */
export function shiftedRecord(v: Pick<LandKonsVersion, 'from' | 'to'>, promulgated: string | null): boolean {
  return promulgated !== null && v.from !== null && v.from < promulgated && v.to !== null
}

const dayBefore = (iso: string) => new Date(Date.parse(iso) - 86_400_000).toISOString().slice(0, 10)

/** The earlier wording of a § against its new one, or why there is none to compare. */
export type PairResult =
  | { kind: 'pair'; old: LandKonsVersion }
  | { kind: 'new' }
  | { kind: 'unpaired'; why: 'no-date' | 'early' | 'gap' | 'several' }

/**
 * The version of the same § that ended the day before `neu` began, among
 * `history` (every version of that § of that law). One → a pair; none and
 * no earlier version at all → new; anything else → not compared.
 *
 * `promulgated`: the Landesgesetzblatt's Kundmachungsdatum (`shiftedRecord`).
 */
export function pairOf(neu: LandKonsVersion, history: readonly LandKonsVersion[], promulgated: string | null = null): PairResult {
  if (!neu.from) return { kind: 'unpaired', why: 'no-date' }
  if (shiftedRecord(neu, promulgated)) return { kind: 'unpaired', why: 'early' }
  const same = history.filter((v) => v.gesetzesnummer === neu.gesetzesnummer && v.key === neu.key && v.xmlUrl !== neu.xmlUrl)
  const before = dayBefore(neu.from)
  const candidates = same.filter((v) => v.to === before)
  if (candidates.length === 1) return { kind: 'pair', old: candidates[0]! }
  if (candidates.length > 1) return { kind: 'unpaired', why: 'several' }
  return same.some((v) => v.from !== null && v.from < neu.from!) ? { kind: 'unpaired', why: 'gap' } : { kind: 'new' }
}

/** RIS's image element; its `<src>` path is no text (`konsTree.ts`, `risXml.ts`). */
const BINARY_RE = /<binary\b[^>]*?(?:\/>|>[\s\S]*?<\/binary\s*>)/g

/**
 * An element's text, read as the Bund's reader of the same consolidated XML
 * reads it (`text` in `konsTree.ts`, 20.11.2026): through the shared
 * `stripMarkup`, so „<gt />" and „<lt />" stay signs, inline markup joins
 * its word, and an image is named (`FIGURE_MARK`). Until then this reader
 * stripped every tag itself: a change made only in „>" or „<" read
 * „unverändert", and an image's file path stood as words, which the
 * comparison's cleaning then dropped (`comparedText`) — the image gone with
 * no „[Abbildung]" and no sentence that images are not compared.
 */
const decode = (s: string) => normalizeText(decodeEntities(stripMarkup(
  s.replace(BINARY_RE, ` ${FIGURE_MARK} `).replace(/<gdash\s*\/>/g, '-').replace(/<nbsp\s*\/>/g, ' ').replace(/<amp\s*\/>/g, '&amp;'),
)))

/**
 * RIS's own notes on which Landesgesetzblätter shaped a passage — „(Anm:
 * LGBl.Nr. 96/2017, 22/2025)" after an Absatz (Oberösterreich), a line
 * „*) Fassung LGBl.Nr. 55/2011, 27/2019" (Vorarlberg), „Anm.: in der Fassung
 * LGBl. Nr. 12/2018" (Steiermark). Editorial, not the law's wording: left in,
 * each Landesgesetzblatt would show as an inserted word in every § it touched.
 */
const LGBL_LIST = String.raw`LGBl\.?\s*Nr\.?\s*\d+/\d{4}(?:\s*,\s*(?:LGBl\.?\s*Nr\.?\s*)?\d+/\d{4})*`
const RIS_NOTE = new RegExp(String.raw`\s*\(Anm\.?:?\s*(?:in der Fassung\s*)?${LGBL_LIST}\s*\)`, 'g')
// A line of its own: „*) Fassung LGBl…" or „Anm.: in der Fassung LGBl…", whatever follows („(seit LGBl. Nr. 97/2020 …)").
const RIS_NOTE_LINE = /^(?:\*\)|Anm\.?:?)\s*(?:in der\s*)?Fassung\s*LGBl/

/** A § or Artikel number standing alone, Vorarlberg's note mark after it included („§ 40*)"). */
const DESIGNATION = /^(?:§|Art(?:ikel|\.))\s*\d+[a-z]*\.?\s*(?:\*\))?$/

/**
 * One § of RIS's consolidated Landesrecht as a unit: its heading and its
 * Absätze, Ziffern and lines in order — the elements RIS marks `ct="text"`,
 * after the metadata block, without RIS's notes on Landesgesetzblätter
 * (`RIS_NOTE`). Null where the document carries no text.
 */
export function konsUnit(xml: string, version: Pick<LandKonsVersion, 'key' | 'law'>, article: string | null): LawUnit | null {
  const body = xml.slice(Math.max(0, xml.indexOf('<nutzdaten')))
  const blocks: TextBlock[] = []
  let heading: string | null = null
  // And the Schlussteil that closes a list (19.11.2026), in both of RIS's
  // spellings, as the federal reader takes it (`risXml.ts`): left out, the
  // words after a list's last item were missing from both wordings, and a
  // change made only there read „unverändert" (Tirol LGBl. Nr. 39/2026,
  // § 23 Abs. 9: „… geltend zu machen. Die Frist beginnt …" gone).
  for (const m of body.matchAll(/<(ueberschrift|absatz|listelem|schlussteil|schluss)\b([^>]*)>([\s\S]*?)<\/\1>/g)) {
    if (!/\bct="text"/.test(m[2]!)) continue
    // A title RIS writes in one element with the number („§ 8<br />Ausnahmen", Vorarlberg's
    // „<n>§ 40*)</n><br />Hegeabschuss"; 2,503 headings of the harness cache, 21.11.2026): the number
    // is the id, what follows the break the title. Until then the whole element was skipped as the
    // designation line, and the title was lost.
    const br = m[1] === 'ueberschrift' ? m[3]!.search(/<br\s*\/?>/) : -1
    const joined = br > 0 && DESIGNATION.test(decode(m[3]!.slice(0, br)))
    let text = decode(joined ? m[3]!.slice(br).replace(/^<br\s*\/?>/, '') : m[3]!).replace(RIS_NOTE, '').trim()
    // The designation leading the first Absatz („§ 5. (1) Wer …" in Wien's records), or standing alone: the unit's id, not its text.
    if (m[1] !== 'ueberschrift' && !blocks.length) text = text.replace(/^(?:§|Art(?:ikel|\.))\s*\d+[a-z]*\.(?:\s+|$)/, '')
    if (!text || RIS_NOTE_LINE.test(text)) continue
    if (m[1] === 'ueberschrift') {
      // The designation line („§ 5") is the unit's id; any other heading its title.
      if (/^(?:§|Art(?:ikel|\.))\s*\d/.test(text)) continue
      if (heading === null && blocks.length === 0) heading = text
      else blocks.push({ kind: 'section', cls: 'section', text, gld: null })
      continue
    }
    blocks.push({ kind: m[1] === 'listelem' ? 'ziff' : 'abs', cls: m[1] === 'listelem' ? 'ziff' : 'abs', text, gld: null })
  }
  if (!blocks.length) return null
  return {
    article,
    articleNumber: null,
    id: version.key,
    heading,
    quotedHeadings: [],
    text: blocks.map((b) => b.text).join(' '),
    blocks,
    stammnorm: null,
  }
}

/**
 * The §§ an instruction names (Novellierungsanordnung, a `Z` unit of the
 * Landesgesetzblatt): every „§ n" and „§§ n, m und o" before its quoted
 * text, as keys. Only the instruction line — never the quoted wording,
 * where a § is content, not an address.
 */
export function lgblNamedParagraphs(instruction: string): string[] {
  const head = instruction.split(/[„"]/)[0]!
  const out = new Set<string>()
  for (const m of head.matchAll(/§§\s*((?:\d+[a-z]*(?:\s*(?:,|und|sowie|bis)\s*)?)+)/g)) {
    for (const n of m[1]!.matchAll(/\d+[a-z]*/g)) out.add(`§${n[0]}`)
    // „§§ 48 bis 53": every § in between is named too, „§51a" included (`isNamed`).
    for (const r of m[1]!.matchAll(/(\d+)[a-z]*\s*bis\s*(\d+)/g)) out.add(`§${r[1]}-${r[2]}`)
  }
  for (const m of head.matchAll(/§(?!§)\s*(\d+[a-z]*)/g)) out.add(`§${m[1]}`)
  for (const m of head.matchAll(/\bArt(?:ikel|\.)\s*(\d+[a-z]*)/g)) out.add(`Art.${m[1]}`)
  return [...out]
}

/** Whether a § is named: by its own key, or inside a range „§48-53" (`lgblNamedParagraphs`). */
export function isNamed(named: ReadonlySet<string> | undefined, key: string): boolean {
  if (!named) return false
  if (named.has(key)) return true
  const n = /^§(\d+)/.exec(key)?.[1]
  if (!n) return false
  return [...named].some((k) => {
    const r = /^§(\d+)-(\d+)$/.exec(k)
    return r !== null && Number(n) >= Number(r[1]) && Number(n) <= Number(r[2])
  })
}

/** A new designation an instruction gives in quotes: „§ 19“, „ § 7. “, „ 17c “, and with the Absatz it opens, „§ 34. (1)“. */
const QUOTED_DESIGNATION_RE = /[„"“]\s*(§\s*)?(\d+[a-z]*)\.?\s*(\(\d+[a-z]*\)\s*)?[“”"]/gu
/** „Im § 18a (alt) werden folgende Änderungen vorgenommen: 15.1. Die Überschrift und die Bezeichnung lauten: Erweiterte Teilrechtsfähigkeit § 18c" (Salzburg LGBl. Nr. 64/2018). */
const OLD_NUMBER_GIVEN_RE = /§\s*(\d+[a-z]*)\s*\(alt\)[^:;]*:\s*(?:\d+(?:\.\d+)*\.\s*)?(?:Die\s+Überschrift\s+und\s+)?[Dd]ie\s+Bezeichnung\s+lauten?:[^§:;]{0,120}§\s*(\d+[a-z]*)/gu
/** The designations a renumbering gives, as `renumberingText` marks them (U+E003 around each; U+E002 where another quoted wording stood), one by one, listed or as a range. */
const NEW_DESIGNATIONS_RE = /^([^:;\uE002\uE003]*?)\bdie\s+(Paragraphen(?:-\s*und\s+Absatz)?|Paragrafen-?)?[Bb]ezeichnung(?:en)?\s*((?:\uE003[^\uE003]*\uE003)(?:\s*(?:,|und|sowie|bis)\s*\uE003[^\uE003]*\uE003)*)/u

/** An instruction's text with every quoted wording out, the quoted new designations kept as marks; a quote never closed ends the reading (`subInstructionHeads`). */
function renumberingText(text: string): string {
  return text
    // An Absatz in the quotes counts only behind a § sign: „3 (1)“ designates no §.
    .replace(QUOTED_DESIGNATION_RE, (whole: string, sign: string | undefined, n: string, absatz: string | undefined) => (absatz && !sign ? whole : `\uE003${sign ? '§' : ''}${n}\uE003`))
    .replace(/„[^“”]*[“”]|"[^"]*"/g, '\uE002')
    .split(/[„"]/)[0]!
}

/** The clause a word ends: back to the last colon, semicolon or quoted wording. */
const clauseBefore = (text: string, at: number) => text.slice(0, at).split(/[:;\uE002\uE003]/).at(-1)!

/**
 * The §§ an instruction gives another number, under the old number and
 * under the new one, as keys (22.11.2026): „Die bisherigen §§ 2a, 3 und 4
 * werden als §§ 3, 4 und 5 bezeichnet." (Vorarlberg), „Der bisherige § 21
 * erhält die Bezeichnung „§ 19“." (Oberösterreich, Tirol), „… erhalten die
 * bisherigen §§ 15a und 15b die Paragraphenbezeichnungen „§ 15b“ und
 * „§ 15c“" (Salzburg), a range on either side („§§ 113, 114, 116, 116a und
 * 117 bis 127 … „§ 143“ bis „§ 157“").
 *
 * RIS files a § under its number. After such an instruction the number
 * holds another paragraph than before, or none: the two versions RIS has
 * under „§ 3" are the old § 3 and the old § 2a, and set against each other
 * they read as a change the Landesgesetzblatt did not make.
 *
 * The phrasings are the ones the cached Landesgesetzblätter use: 21 of 721
 * documents, 42 lines, these two verbs; since 23.11.2026 also a designation
 * given with its Absatz („die Paragraphen- und Absatzbezeichnung „§ 34. (1)“",
 * Wien) and a § marked „(alt)" whose designation is written anew (Salzburg).
 * Not a renumbering: an Absatz or a
 * Ziffer given another designation („wird der bisherige Text als Abs. 1
 * bezeichnet", „erhalten die Z 3 und 4 die Bezeichnungen „2.“ und „3.“" —
 * told by „Paragraphenbezeichnung" or a § inside the quotes), a citation
 * replaced („wird die Paragraphenbezeichnung „§ 4“ durch … ersetzt"), §§
 * inserted „als §§ 27a bis 27f".
 */
export function lgblRenumberedParagraphs(instruction: string): string[] {
  const text = renumberingText(instruction)
  const out = new Set<string>()
  const named = (s: string) => lgblNamedParagraphs(s.replace(/\uE003/g, ' ')).filter((k) => k.startsWith('§'))
  for (const m of text.matchAll(/\bbezeichnet\b/gu)) {
    const clause = /(§§?\s*\d.*?)\b(?:wird|werden)\s+als\s+(§§?\s*\d[^.]*?)\s*$/u.exec(clauseBefore(text, m.index))
    if (clause) for (const k of [...named(clause[1]!), ...named(clause[2]!)]) out.add(k)
  }
  for (const m of text.matchAll(/\berh[aä]lt(?:en)?\b/gu)) {
    const given = NEW_DESIGNATIONS_RE.exec(text.slice(m.index + m[0].length))
    if (!given) continue
    const marks = [...given[3]!.matchAll(/\uE003(§?)(\d+)([a-z]*)\uE003(?:\s*(,|und|sowie|bis)\s*)?/gu)]
    // An Absatz, a Ziffer or a litera gets a designation the same way: a § only where the instruction says so.
    if (!given[2] && !marks.some((x) => x[1] === '§')) continue
    for (const k of named(`${clauseBefore(text, m.index)} ${given[1]!}`)) out.add(k)
    marks.forEach((x, i) => {
      out.add(`§${x[2]}${x[3]}`)
      if (x[4] === 'bis' && marks[i + 1]) out.add(`§${x[2]}-${marks[i + 1]![2]}`)
    })
  }
  for (const m of text.matchAll(OLD_NUMBER_GIVEN_RE)) {
    out.add(`§${m[1]}`)
    out.add(`§${m[2]}`)
  }
  return [...out]
}

/** The §§ the Landesgesetzblatt's instructions renumber, per law as `lgblInstructedParagraphs` keys it. */
export function lgblRenumbered(units: readonly LawUnit[]): Map<string | null, Set<string>> {
  const out = new Map<string | null, Set<string>>()
  for (const u of units) {
    if (!/^Z/.test(u.id)) continue
    const keys = lgblRenumberedParagraphs(`${u.heading ?? ''} ${u.text}`)
    if (keys.length) out.set(u.article, new Set([...(out.get(u.article) ?? []), ...keys]))
  }
  return out
}

/**
 * The §§ the Landesgesetzblatt's instructions name, per law — the law as
 * its Artikel names it („Änderung des Salzburger …"), null where the
 * Landesgesetzblatt changes one law without Artikel.
 */
export function lgblInstructedParagraphs(units: readonly LawUnit[]): Map<string | null, Set<string>> {
  const out = new Map<string | null, Set<string>>()
  for (const u of units) {
    if (!/^Z/.test(u.id)) continue
    const set = out.get(u.article) ?? new Set<string>()
    for (const head of [u.heading ?? u.text, ...subInstructionHeads(u.text)]) for (const k of lgblNamedParagraphs(head)) set.add(k)
    out.set(u.article, set)
  }
  return out
}

/** A sub-instruction's number where it opens one, outside the quoted wording: „15.1.1. ", „6a.1 ", „1.1.a ", „19.1.Nach" — not a date („1.1.2026"). */
const SUB_HEAD_RE = /(?:^|\s)\d{1,3}[a-z]?(?:\.\s?\d{1,2}[a-z]?)+\.?(?=\s|\p{L})/gu

/**
 * The sub-instructions an instruction holds, each up to its quoted wording
 * (19.11.2026). Salzburg nests its instructions („15. Im § 18 werden
 * folgende Änderungen vorgenommen: 15.1. … 15.1.1. Im § 18a …"), and the
 * Landesgesetzblatt's reader joins the inner ones to their instruction
 * (`lgblUnits`); a § named in one of them is instructed as much as one in
 * the instruction's own head. Read only outside quotes, as the head is
 * (`lgblNamedParagraphs`): a quoted § is new wording, not an address.
 */
export function subInstructionHeads(text: string): string[] {
  // The quoted wording out, each quote a mark where it stood; a quote never closed ends the reading.
  const bare = text.replace(/„[^“”]*[“”]|"[^"]*"/g, '\u0000').split(/[„"]/)[0]!
  const starts = [...bare.matchAll(SUB_HEAD_RE)].map((m) => m.index!)
  return starts.map((at, i) => bare.slice(at, starts[i + 1] ?? bare.length).split('\u0000')[0]!.trim()).filter(Boolean)
}

/**
 * The two signatures closing a Landesgesetzblatt, at the very end of its
 * last instruction: „Der Landtagspräsident: Der Landeshauptmann: Mag. … Mag.
 * …" (Vorarlberg), „Der Präsident des Landtages: Der Landeshauptmann: … …"
 * (Burgenland) — set as plain paragraphs there, so the reader's signature
 * table rule (`lgblUnits`) does not take them. Both offices, in this order,
 * and nothing after them but the two names: the only shapes in the 529
 * Landesgesetzblätter of the cache, nine units, one of them a „lautet:".
 */
const SIGNATURE_BLOCK_RE = /\s*D(?:er|ie)\s+(?:Landtagspräsident(?:in)?|Präsident(?:in)?\s+des\s+Landtages):\s*D(?:er|ie)\s+Landeshaupt(?:mann|frau):[^:„"“”]{0,120}$/u

/** A text's words, lower case: what the „lautet:" check holds against each other. */
const wordsOf = (s: string) => new Set(s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])

/**
 * The words of an instruction's own wording that RIS's new version of the
 * § lacks (22.11.2026): for an instruction that writes the wording of one
 * § or part of it („§ 14 Abs. 6 lautet: …", „Im § 48 Abs 1 lautet die Z 4:
 * …"), its words against the heading, number and text of the version RIS
 * ties to the Landesgesetzblatt. Null for any other instruction — one that
 * names several §§, the table of contents or an Anlage, or nests
 * sub-instructions (Salzburg's „15.1.") — and for one of another §.
 *
 * Words, not sequence. The census of the harness found two such misses in
 * 172 checked instructions, both Wien LGBl. Nr. 45/2020 (§ 14 Abs. 6, § 16
 * Abs. 5): its Artikel II lets the new wording expire at the end of 2020,
 * and the version RIS ties to it is the one after the expiry, without the
 * words the Landesgesetzblatt writes — compared with the one before, the
 * page showed them as removed by the Landesgesetzblatt that enacted them.
 *
 * Where the instruction quotes its wording, only what stands inside the
 * quotes is wording (22.11.2026): Wien goes on after it — „Die Überschrift
 * zu § 143 lautet: „…“; der bisherige § 143 erhält die Absatzbezeichnung
 * „(1)“; diesem wird folgender Abs. 2 angefügt: „(2) …“" —, and „bisherige",
 * „erhält", „angefügt" are the instruction's words, in no version of the §.
 * Run against RIS over the laws matched since (237 instructions checked),
 * that withheld § 143 of the Wiener Bedienstetengesetz and § 49 of the
 * Wiener Gleichbehandlungsgesetz (LGBl. Nr. 37/2026) for no missing word.
 * An unquoted wording runs to the instruction's end, as before, without the
 * signatures that close the Landesgesetzblatt where this is its last
 * instruction (`SIGNATURE_BLOCK_RE`, 23.11.2026).
 */
export function lautetMissing(instruction: LawUnit, key: string, unit: Pick<LawUnit, 'id' | 'heading' | 'text'>): string[] | null {
  const at = /\blautet\b[^:„"]*:/.exec(instruction.text)
  if (!/^Z/.test(instruction.id) || !at || /[„"]/.test(instruction.text.slice(0, at.index))) return null
  const head = instruction.text.slice(0, at.index)
  const keys = lgblNamedParagraphs(head).filter((k) => k.startsWith('§'))
  if (keys.length !== 1 || keys[0] !== key || /Inhaltsverzeichnis|Anlage|Anhang/.test(head) || subInstructionHeads(instruction.text).length) return null
  const ris = wordsOf(`${unit.id} ${unit.heading ?? ''} ${unit.text}`)
  const rest = instruction.text.slice(at.index + at[0].length)
  const wording = /^\s*[„"]/.test(rest) ? [...rest.matchAll(/„([^“”]*)[“”]|"([^"]*)"/g)].map((m) => m[1] ?? m[2]!).join(' ') : rest.replace(SIGNATURE_BLOCK_RE, '')
  return [...wordsOf(wording)].filter((w) => !ris.has(w))
}

/** A point after an abbreviation or a number („LGBl.", „Oö.", „31. Dezember", „1. Das …"): no sentence ends there. */
const NO_SENTENCE_END_RE = /(?<![\p{L}\p{N}])(LGBl|BGBl|Nr|Oö|Stmk|Bgld|Ktn|Krnt|Sbg|Tir|Vlbg|Vbg|Wr|NÖ|Abs|Art|Z|lit|idF|bzw|vgl)\.|(\d)\.(?=\s)/gu
/** A sentence that puts something out of force: „… tritt … außer Kraft", „… wird … aufgehoben". */
const REPEALS_RE = /\b(?:tritt|treten)\b.*\baußer\s+Kraft\s*$|\b(?:wird|werden)\b.*\baufgehoben\s*$/u
/** What makes the repeal one of a part: a §, an Artikel, an Absatz, an exception, a limit. */
const PART_ONLY_RE = /§|(?<![\p{L}])(?:Art(?:ikel)?|Abs)(?![\p{L}])|Ausnahme|ausgenommen|hinsichtlich|soweit|teilweise/u
/** The law's citation in such a sentence: „LGBl. Nr. 93/1997", „LGBl. für Wien Nr. 37/1987", Salzburg's „LGBl Nr 66" with the year in the law's name. */
const CITED_RE = /LG\s?Bl\.?\s*(?:für\s+Wien\s*)?(?:Nr\.?\s*)?(\d+)(?:\/(\d{4}))?/u

/** The sentences of a Landesgesetzblatt that repeal something whole, each cut into its subjects („das A, LGBl. …, und das B, LGBl. …"). */
function repealSubjects(xml: string): string[] {
  const body = xml.slice(Math.max(0, xml.indexOf('<nutzdaten')))
  const out: string[] = []
  for (const m of body.matchAll(/<(absatz|listelem)\b[^>]*>([\s\S]*?)<\/\1>/g)) {
    const text = decodeEntities(stripMarkup(m[2]!)).replace(/\s+/g, ' ').trim().replace(NO_SENTENCE_END_RE, '$1$2')
    for (const sentence of text.split(/[.;](?:\s+|$)/)) {
      if (REPEALS_RE.test(sentence) && !PART_ONLY_RE.test(sentence)) out.push(...sentence.split(/(?:,\s*|\s+(?:und|sowie)\s+)(?=(?:das|die|der)\s)/u))
    }
  }
  return out
}

/**
 * The laws a Landesgesetzblatt repeals as a whole (23.11.2026): every
 * version RIS ties to it is „aufgehoben durch" it, AND one of its own
 * sentences puts the law out of force by the Stammnorm RIS gives it — „Das
 * Schulratgesetz, LGBl.Nr. 35/1963, … tritt … außer Kraft", „1. Das 1. Oö.
 * Euro-Umstellungsgesetz, LGBl. Nr. 126/1998, wird aufgehoben."
 *
 * RIS alone is not enough: it files two Verordnungen as repealed by
 * Salzburg's LGBl. Nr. 64/2018 that the Landesgesetzblatt names nowhere, and
 * a law of which a Landesgesetzblatt repeals one § looks the same in its
 * records. A sentence about a part (a §, an Artikel, „mit Ausnahme …") does
 * not count. Where the citation gives no year, the Stammnorm's year must
 * stand in the law's name beside it; where two of the laws share a
 * Stammnorm, the sentence must hold the law's name too.
 */
export function lgblRepealedLaws(own: readonly Pick<LandKonsVersion, 'law' | 'organ' | 'stammnorm'>[], nummer: string, xml: string): Set<string> {
  const laws = [...new Set(own.map((v) => v.law))].filter((law) => own.every((v) => v.law !== law || repealedBy(v.organ, nummer)))
  if (!laws.length) return new Set()
  const subjects = repealSubjects(xml).flatMap((text) => {
    const cited = CITED_RE.exec(text)
    return cited ? [{ text, number: cited[1]!, year: cited[2] ?? null }] : []
  })
  const stammOf = (law: string) => /^(\d+)\/(\d{4})/.exec(own.find((v) => v.law === law && v.stammnorm)?.stammnorm ?? '')
  return new Set(laws.filter((law) => {
    const stamm = stammOf(law)
    if (!stamm) return false
    const shared = laws.some((other) => other !== law && stammOf(other)?.[0] === stamm[0])
    return subjects.some((s) => s.number === stamm[1] && (s.year === stamm[2] || (s.year === null && s.text.includes(stamm[2]!))) && (!shared || holdsAll(s.text, lgblWords(law))))
  }))
}

/**
 * The instructions' law for one of RIS's laws: the Artikel whose title
 * holds every distinctive word of the Kurztitel — exactly one, or none at
 * all (the Landesgesetzblatt changes this law alone, without Artikel), or
 * the one group of instructions where RIS ties the Landesgesetzblatt to
 * one law only (`risLaws`), whatever its Artikel is called.
 * `undefined`: no safe match, the law's §§ are not compared.
 */
export function instructionLawFor(kurztitel: string, laws: readonly (string | null)[], risLaws = 0): string | null | undefined {
  if (laws.length === 1 && laws[0] === null) return null
  // One law in RIS, one group of instructions — however the Artikel is titled („Artikel I").
  if (laws.length === 1 && risLaws === 1) return laws[0]!
  const words = lgblWords(kurztitel)
  if (!words.size) return undefined
  const hits = laws.filter((l): l is string => l !== null && holdsAll(l, words))
  return hits.length === 1 ? hits[0]! : undefined
}

/** Whether a title holds every word: as it stands, or in its genitive („…gesetz" → „…gesetzes"). */
function holdsAll(title: string, words: ReadonlySet<string>): boolean {
  const there = [...lgblWords(title)]
  return [...words].every((w) => there.some((t) => t === w || t === `${w}s` || t === `${w}es`))
}

/** „Artikel II Änderung des …" → „II", „Artikel 3" → „3"; null for anything else. */
const articleDesignation = (s: string | null) => /^Art(?:ikel|\.)\s*([IVXLC]+|\d+[a-z]?)(?![\p{L}\d])/u.exec((s ?? '').replace(/\s+/g, ' ').trim())?.[1] ?? null

/** The law an Artikel's promulgation clause names, and the Stammnorm it cites where it gives the year. */
export interface ArticleClause {
  name: string
  /** „56/1986"; null where the clause cites none, or no year („LGBl. Nr. 56", Wien). */
  cites: string | null
}

/** An Artikel's heading, any title headings below it (never the next Artikel's), and the block that follows. */
const ARTICLE_HEAD_RE = /<ueberschrift typ="(?:art|g1)"[^>]*>(\s*(?:<[^>]+>\s*)*Artikel\b(?:(?!<\/ueberschrift>)[\s\S])*?)<\/ueberschrift>((?:\s*<ueberschrift\b[^>]*>(?!\s*(?:<[^>]+>\s*)*Artikel\b)(?:(?!<\/ueberschrift>)[\s\S])*?<\/ueberschrift>)*)\s*<absatz\b[^>]*>((?:(?!<\/absatz>)[\s\S])*?)<\/absatz>/g

/**
 * The law each Artikel's promulgation clause names, by the Artikel's
 * designation („I", „3"): „Die Dienstordnung 1994, LGBl. Nr. 56, zuletzt
 * geändert durch …, wird wie folgt geändert:" (22.11.2026). Vorarlberg,
 * Wien and Salzburg title their Artikel with the number alone („Artikel I"),
 * and say which law it amends only there, in the block below it. Read as
 * plain text: the name before the Landesgesetzblatt it cites, in a clause
 * that ends „… geändert:" — a clause that repeals a law („tritt … außer
 * Kraft") names no amended law.
 */
export function lgblArticleClauses(xml: string): Map<string, ArticleClause> {
  const out = new Map<string, ArticleClause>()
  const flat = (s: string) => decodeEntities(stripMarkup(s)).replace(/\s+/g, ' ').trim()
  for (const m of xml.matchAll(ARTICLE_HEAD_RE)) {
    const designation = articleDesignation(flat(m[1]!))
    const clause = flat(m[3]!)
    if (!designation || out.has(designation) || !/\bgeändert(?:\s+wie\s+folgt)?\s*:$/.test(clause)) continue
    const named = /^(?:Das|Die|Der)\s+(.+?),?\s+LGBl\.?\s*(?:für\s+Wien\s*)?(?:Nr\.?\s*)?(\d+(?:\/\d{4})?)/.exec(clause)
    if (named) out.set(designation, { name: named[1]!, cites: named[2]!.includes('/') ? named[2]! : null })
  }
  return out
}

/** An Artikel titled with its number alone: „Artikel I", „Artikel 3". */
const UNTITLED_RE = /^Art(?:ikel|\.)\s*(?:[IVXLC]+|\d+[a-z]?)$/

/**
 * Each of RIS's laws → the group of instructions that amends it, as
 * `instructionLawFor` finds it (undefined: none safely). An Artikel titled
 * with its number alone is held by the name its clause gives the law
 * (`lgblArticleClauses`, 22.11.2026): until then its title held no word of
 * any law, and every § of the law it amends was withheld as `lawUnmatched`
 * — 251 of the 509 in the harness (Vorarlberg 156, Wien 87, Salzburg 8;
 * „Artikel I" … „Artikel VIII" of Wien's LGBl. Nr. 42/2019).
 *
 * THEN A LAW UNDER ANOTHER NAME (22.11.2026). RIS's Kurztitel carries an
 * abbreviation the Artikel's title does not („Kärntner Bauvorschriften- K-BV"
 * against „Änderung der Kärntner Bauvorschriften", 86 §§ of four Kärnten
 * LGBl, 7 of Steiermark), or the law bears a name the Landesgesetzblatt
 * gives it itself (Salzburg's 76/2019 renames its law in Artikel I). Such a
 * law still unmatched and an Artikel no law took meet where the title holds
 * the Kurztitel's words once RIS's abbreviation and a closing bracket are
 * out, or where the Artikel's clause cites, with its year, the Stammnorm
 * RIS gives the law — and they are paired only where each is the other's
 * only one. Two candidates, or none, stay unmatched.
 */
export function instructionLawsOf(versions: readonly Pick<LandKonsVersion, 'law' | 'abbreviation' | 'stammnorm'>[], units: readonly LawUnit[], xml: string): Map<string, string | null | undefined> {
  const keys = [...lgblInstructedParagraphs(units).keys()]
  const clauses = lgblArticleClauses(xml)
  const titleOf = (key: string | null) => {
    if (key === null || !UNTITLED_RE.test(key.replace(/\s+/g, ' ').trim())) return key
    const clause = clauses.get(articleDesignation(units.find((u) => u.article === key)?.articleNumber ?? key) ?? '')
    return clause ? `${key} ${clause.name}` : key
  }
  const titles = keys.map(titleOf)
  const laws = [...new Set(versions.map((v) => v.law))]
  const out = new Map(laws.map((law) => {
    const title = instructionLawFor(law, titles, laws.length)
    return [law, title === undefined || title === null ? title : keys[titles.indexOf(title)]!]
  }))

  const open = laws.filter((law) => out.get(law) === undefined)
  const taken = new Set(out.values())
  const free = keys.filter((k): k is string => k !== null && !taken.has(k))
  const meets = (law: string, key: string) => {
    const mine = versions.filter((v) => v.law === law)
    const abbreviation = mine.find((v) => v.abbreviation)?.abbreviation
    const name = (abbreviation ? law.replace(new RegExp(`(?<![\\p{L}\\d])${abbreviation.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\d])`, 'u'), ' ') : law).replace(/\([^()]*\)\s*$/, '')
    const words = lgblWords(name)
    if (words.size && holdsAll(titleOf(key)!, words)) return true
    const cites = clauses.get(articleDesignation(units.find((u) => u.article === key)?.articleNumber ?? key) ?? '')?.cites
    return !!cites && mine.some((v) => /^\d+\/\d{4}/.exec(v.stammnorm ?? '')?.[0] === cites)
  }
  const candidates = new Map(open.map((law) => [law, free.filter((key) => meets(law, key))]))
  for (const law of open) {
    const [key, ...more] = candidates.get(law)!
    if (key !== undefined && !more.length && open.filter((other) => candidates.get(other)!.includes(key)).length === 1) out.set(law, key)
  }
  return out
}

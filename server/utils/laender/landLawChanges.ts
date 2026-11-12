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
 * it (`lgblInstructedParagraphs`, every § an instruction names before its
 * quoted text). The rest is counted and named, never dropped silently:
 * §§ RIS ties to the Landesgesetzblatt that no instruction names
 * (`uninstructed`), §§ an instruction names that found no pair
 * (`unpaired`). A law the Landesgesetzblatt enacts anew has no instructions
 * and no earlier version: its §§ stand as new.
 *
 * Measured before it was built as a set per law (10.11.2026: 57 of 176
 * laws with equal sets, the first § of each instruction only) — too coarse
 * to show; per § with these guards it is a different question, measured
 * per Land in `docs/decisions.md`.
 *
 * PURE: RIS records, § XML and the Landesgesetzblatt's units come in.
 */
import type { LawUnit, TextBlock } from '../lawtext/lawUnits'
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

const decode = (s: string) => s
  .replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&nbsp;|&#160;/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()

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
  for (const m of body.matchAll(/<(ueberschrift|absatz|listelem)\b([^>]*)>([\s\S]*?)<\/\1>/g)) {
    if (!/\bct="text"/.test(m[2]!)) continue
    const text = decode(m[3]!).replace(RIS_NOTE, '').trim()
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
    for (const k of lgblNamedParagraphs(u.heading ?? u.text)) set.add(k)
    out.set(u.article, set)
  }
  return out
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
  // A word of the Kurztitel, or its genitive in the Artikel („…gesetz" → „…gesetzes").
  const holds = (title: string) => {
    const there = [...lgblWords(title)]
    return [...words].every((w) => there.some((t) => t === w || t === `${w}s` || t === `${w}es`))
  }
  const hits = laws.filter((l): l is string => l !== null && holds(l))
  return hits.length === 1 ? hits[0]! : undefined
}

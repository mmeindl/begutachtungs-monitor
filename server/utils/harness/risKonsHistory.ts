/**
 * The RIS BrKons history: every version of a law, and the pair one
 * Bundesgesetzblatt produced.
 *
 * Harness-only: nothing on the request path imports this; the harnesses and
 * their tests do.
 */
import { parseKonsParagraph, type LawNode } from '../lawtext/konsTree'
import { asArray } from '../ris/risRecord'
import { IMPLAUSIBLE_HITS, getText, konsJson, konsQuery, konsRefOf, type KonsParagraphRef } from '../ris/konsLaw'

/* eslint-disable @typescript-eslint/no-explicit-any */
/** The amending BGBl a version's Kundmachungsorgan names, e.g. "BGBl. I Nr. 187/2022". */
export function amendedBy(ref: KonsParagraphRef): string | null {
  const m = /zuletzt geändert durch\s+(.+?)\s*$/.exec(ref.kundmachungsorgan ?? '')
  return m ? m[1]! : null
}

export interface KonsLaw {
  gesetzesnummer: string
  kurztitel: string
  /** The BGBl entries that amended this law, each with its Regierungsvorlage */
  aenderungen: string[]
  paragraphs: KonsParagraphRef[]
}

/**
 * Resolves a law to its RIS Gesetzesnummer by Kurztitel. `Titel` matches
 * loosely — the same trap as the Begut join (`ris/risJoin.ts`) — so the
 * result is accepted only on an exact Kurztitel match.
 */
export async function resolveGesetzesnummer(kurztitel: string): Promise<string | null> {
  const body = await konsJson(konsQuery({ Titel: kurztitel, DokumenteProSeite: 'OneHundred' }))
  const results = body?.OgdSearchResult?.OgdDocumentResults
  const counts = new Map<string, number>()
  for (const ref of asArray<any>(results?.OgdDocumentReference)) {
    const b = ref?.Data?.Metadaten?.Bundesrecht
    if (b?.Kurztitel?.trim().toLowerCase() !== kurztitel.trim().toLowerCase()) continue
    const nr = b?.BrKons?.Gesetzesnummer
    if (nr) counts.set(nr, (counts.get(nr) ?? 0) + 1)
  }
  if (counts.size === 0) return null
  return [...counts].sort((a, b) => b[1] - a[1])[0]![0]
}

/** Every paragraph of one law as it stood on `date` (ISO yyyy-mm-dd). */
export async function fetchLawAsOf(gesetzesnummer: string, date: string): Promise<KonsLaw> {
  const paragraphs: KonsParagraphRef[] = []
  let kurztitel = ''
  const aenderungen = new Set<string>()
  let hits = 0
  // Every page, as `fetchAllVersions` below; capped at 20, a law of more than 2.000 §§ lost its tail unsaid.
  for (let page = 1; page <= Math.ceil(IMPLAUSIBLE_HITS / 100); page++) {
    const body = await konsJson(konsQuery({ Gesetzesnummer: gesetzesnummer, 'Fassung.FassungVom': date, DokumenteProSeite: 'OneHundred', Seitennummer: String(page) }))
    const results = body?.OgdSearchResult?.OgdDocumentResults
    hits = Number(results?.Hits?.['#text'] ?? 0)
    if (hits > IMPLAUSIBLE_HITS) throw new Error(`RIS ignorierte den Filter: ${hits} Treffer für Gesetzesnummer ${gesetzesnummer}`)
    const refs = asArray<any>(results?.OgdDocumentReference)
    for (const ref of refs) {
      const b = ref?.Data?.Metadaten?.Bundesrecht
      kurztitel ||= b?.Kurztitel ?? ''
      for (const line of String(b?.BrKons?.Aenderung ?? '').split(/\r?\n/)) if (line.trim()) aenderungen.add(line.trim())
      const p = konsRefOf(ref)
      if (p) paragraphs.push(p)
    }
    if (paragraphs.length >= hits || refs.length === 0) break
  }
  if (paragraphs.length < hits) throw new Error(`Paragraphen unvollständig: ${paragraphs.length} von ${hits} für Gesetzesnummer ${gesetzesnummer}`)
  return { gesetzesnummer, kurztitel, aenderungen: [...aenderungen], paragraphs }
}

/**
 * Every version of every paragraph of one law, oldest first per paragraph.
 * Keyed by the printed label ("§ 20"), because that is what an instruction
 * addresses.
 */
export async function fetchAllVersions(gesetzesnummer: string): Promise<Map<string, KonsParagraphRef[]>> {
  const out = new Map<string, KonsParagraphRef[]>()
  let seen = 0
  let hits = 0
  // Every page, and refused when short (24.11.2026). Capped at 40 pages, the
  // ASVG's 5.121 versions lost their last 1.121 without a word, and with them
  // § 814 to § 818: BGBl. I Nr. 72, 73, 103 and 104/2025 read as never
  // consolidated, though RIS had them.
  for (let page = 1; page <= Math.ceil(IMPLAUSIBLE_HITS / 100); page++) {
    const body = await konsJson(konsQuery({ Gesetzesnummer: gesetzesnummer, DokumenteProSeite: 'OneHundred', Seitennummer: String(page) }))
    const results = body?.OgdSearchResult?.OgdDocumentResults
    hits = Number(results?.Hits?.['#text'] ?? 0)
    if (hits > IMPLAUSIBLE_HITS) throw new Error(`RIS ignorierte den Filter: ${hits} Treffer für Gesetzesnummer ${gesetzesnummer}`)
    const refs = asArray<any>(results?.OgdDocumentReference)
    for (const r of refs) {
      const p = konsRefOf(r)
      if (!p) continue
      if (p.gesetzesnummer && p.gesetzesnummer !== gesetzesnummer) throw new Error(`RIS ignorierte den Filter: Gesetzesnummer ${p.gesetzesnummer} statt ${gesetzesnummer}`)
      const list = out.get(p.label) ?? []
      list.push(p)
      out.set(p.label, list)
    }
    seen += refs.length
    if (seen >= hits || refs.length === 0) break
  }
  if (seen < hits) throw new Error(`Fassungen unvollständig: ${seen} von ${hits} für Gesetzesnummer ${gesetzesnummer}`)
  for (const list of out.values()) list.sort((a, b) => String(a.inkrafttreten).localeCompare(String(b.inkrafttreten)))
  return out
}

/**
 * The version a given amendment produced, and the version it replaced —
 * the exact pair a verification run needs. Returns null when this BGBl did
 * not touch the paragraph.
 *
 * `afters` lists *every* version this BGBl created, oldest first. A Novelle
 * routinely stages its instructions — "19,4%" becomes "23%" from 2027 and
 * "21%" from 2030 in one BGBl (Dienstgeberabgabegesetz § 1, BGBl. I Nr.
 * 73/2026) — and RIS cuts one version per effective date. An engine that
 * applies every instruction produces the end state, so scoring against the
 * first cut alone called it wrong for writing what it was told to write; 5
 * of 33 divergences in the 261-paragraph corpus were this. Scoring against
 * the last cut alone fails the other way: RIS also cuts a version when an
 * Absatz *expires*, and prints an editorial note in its place (LWA-G § 1,
 * "Anm.: Abs. 2 mit Ablauf des 30.12.2029 außer Kraft getreten"). Each of
 * the cuts is law text that exists, so a harness accepts a match with any
 * of them (2026-09-09).
 *
 * **The version before is the one RIS built this BGBl's version on**
 * (24.11.2026). A Bundesgesetzblatt issued later can take effect earlier:
 * BGBl. I Nr. 88/2026 changed EStG § 26 from 17.10.2026, BGBl. I Nr. 62/2026
 * from 01.01.2027. RIS keeps 62/2026's version as it consolidated it, on the
 * text before 88/2026, and adds a second version of the same day „zuletzt
 * geändert durch BGBl. I Nr. 88/2026" that carries both. Taken as the version
 * before, 88/2026's text went into the engine and out again, and RIS's
 * 62/2026 version, which never held it, called the § half applied: three §§
 * of the whole period, all three this (WPFG § 53, BAO § 211, EStG § 26).
 * Where a later BGBl rebuilt one of this BGBl's days, its versions are
 * passed over on the way back. Without that rebuild, RIS consolidated this
 * BGBl after the later one, built on its text, and the version before stands.
 */
export function versionPairFor(versions: readonly KonsParagraphRef[], bgblNumber: string): { before: KonsParagraphRef | null; after: KonsParagraphRef; afters: KonsParagraphRef[] } | null {
  const first = versions.findIndex((v) => amendedBy(v) === bgblNumber)
  if (first < 0) return null
  let last = first
  while (last + 1 < versions.length && amendedBy(versions[last + 1]!) === bgblNumber) last++
  const afters = versions.slice(first, last + 1)
  const days = new Set(afters.map((v) => v.inkrafttreten))
  const later = (v: KonsParagraphRef) => publishedAfter(amendedBy(v), bgblNumber)
  const rebuilt = versions.some((v) => days.has(v.inkrafttreten) && later(v))
  let before = first - 1
  if (rebuilt) while (before >= 0 && later(versions[before]!)) before--
  return { before: versions[before] ?? null, after: versions[first]!, afters }
}

/** „BGBl. I Nr. 88/2026" → [2026, 88]; null for anything else (a Stammfassung names none). */
function bgblOrder(cite: string | null): [number, number] | null {
  const m = /Nr\.\s*(\d+)\/(\d{4})\b/.exec(cite ?? '')
  return m ? [Number(m[2]), Number(m[1])] : null
}

/** Whether Bundesgesetzblatt `a` was issued after `b`: the numbers of one Teil run in issue order through a year. */
export function publishedAfter(a: string | null, b: string): boolean {
  const x = bgblOrder(a)
  const y = bgblOrder(b)
  return x !== null && y !== null && (x[0] > y[0] || (x[0] === y[0] && x[1] > y[1]))
}

/** The paragraph document as a tree. */
export async function fetchParagraphTree(ref: KonsParagraphRef): Promise<LawNode | null> {
  if (!ref.xmlUrl) return null
  return parseKonsParagraph(await getText(ref.xmlUrl))
}

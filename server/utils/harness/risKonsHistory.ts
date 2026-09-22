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
 * loosely — the same trap as the Begut join (docs/ris-join.md §4) — so the
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
  for (let page = 1; page <= 20; page++) {
    const body = await konsJson(konsQuery({ Gesetzesnummer: gesetzesnummer, 'Fassung.FassungVom': date, DokumenteProSeite: 'OneHundred', Seitennummer: String(page) }))
    const results = body?.OgdSearchResult?.OgdDocumentResults
    const hits = Number(results?.Hits?.['#text'] ?? 0)
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
  for (let page = 1; page <= 40; page++) {
    const body = await konsJson(konsQuery({ Gesetzesnummer: gesetzesnummer, DokumenteProSeite: 'OneHundred', Seitennummer: String(page) }))
    const results = body?.OgdSearchResult?.OgdDocumentResults
    const hits = Number(results?.Hits?.['#text'] ?? 0)
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
 */
export function versionPairFor(versions: readonly KonsParagraphRef[], bgblNumber: string): { before: KonsParagraphRef | null; after: KonsParagraphRef; afters: KonsParagraphRef[] } | null {
  const first = versions.findIndex((v) => amendedBy(v) === bgblNumber)
  if (first < 0) return null
  let last = first
  while (last + 1 < versions.length && amendedBy(versions[last + 1]!) === bgblNumber) last++
  return { before: versions[first - 1] ?? null, after: versions[first]!, afters: versions.slice(first, last + 1) }
}

/** The paragraph document as a tree. */
export async function fetchParagraphTree(ref: KonsParagraphRef): Promise<LawNode | null> {
  if (!ref.xmlUrl) return null
  return parseKonsParagraph(await getText(ref.xmlUrl))
}

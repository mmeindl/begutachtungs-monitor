/**
 * What the Land gives as its reasons — the Erläuterungen of a Land's draft,
 * read from the PDF's lines (23.10.2026): the general part as passages for
 * „Was das Land begründet", the particular part one entry per „Zu …"
 * heading, for the § it explains — as the Ministerialentwurf's page shows
 * the ressort's (docs/architecture.md §12.29–30, §12.53).
 *
 * PURE MODULE — no imports, so vitest runs it directly.
 *
 * Three layouts, one reader:
 *  - Oberösterreich: the Begutachtungsentwurf opens with them, „A.
 *    Allgemeiner Teil" … „B. Besonderer Teil" … „Zu Art. I Z 2 (§ 1 Abs. 3):",
 *    and the law text follows.
 *  - Salzburg: after the law text, „Erläuterungen" … „1. Allgemeines:" …
 *    „Zu den einzelnen Bestimmungen:" … „Zu Z 1 (§ 28 Abs 3):".
 *  - Wien: after law and Vorblatt, „ERLÄUTERUNGEN" … „Allgemeiner Teil" …
 *    „Besonderer Teil" … „Zu Z 1 (§ 2 Abs. 8):", the Textgegenüberstellung
 *    after them.
 */

export interface ExplanationPassage {
  heading: string | null
  text: string[]
}

export interface ParticularExplanation {
  /** „I" or „2", where the heading names an Artikel — the law, in a package. */
  article: string | null
  /** The §§ it explains, „5", „12a" — from the heading's brackets. */
  paras: string[]
  /** „Zu Art. I Z 2 (§ 1 Abs. 3):", as printed. */
  heading: string
  text: string[]
}

export interface LandExplanationsParse {
  general: ExplanationPassage[]
  /** Whether a heading said „Allgemeiner Teil"/„Allgemeines" — else the general part is inferred. */
  labelled: boolean
  particular: ParticularExplanation[]
}

const PAGE_NOISE_RE = /^(?:Seite \d+(?: von \d+)?|\d+ von \d+|- ?\d+ ?-|\d+)$/
const START_RE = /^(?:[A-Z]\.|[IVX]+\.|\d+\.)?\s*(?:Allgemeiner Teil|Allgemeines)\b/
const TITLE_RE = /^(?:Erläuterungen|ERLÄUTERUNGEN|Erläuternde Bemerkungen)\b/
const PARTICULAR_RE = /^(?:[A-Z]\.|[IVX]+\.|\d+\.)?\s*(?:Besonderer Teil|Zu den einzelnen Bestimmungen)\b/
/* „Zu Art. I Z 2", and in Salzburg's packages „Zu Art 2 Z 1" (23.10.2026). */
const ENTRY_RE = /^Zu\s+(?:(?:Art(?:ikel)?\.?\s*(?:[IVXL]+|\d+)|Z(?:iffer)?n?\.?\s*\d|§§?\s*\d|den\s+Z|Abs)|Art\.)/
const END_RE = /^(?:Textgegenüberstellung|Der (?:Oö\. |Salzburger |Wiener )?Landtag hat beschlossen|Die (?:Oö\. |Salzburger |Wiener )?Landesregierung hat (?:beschlossen|verordnet)|Vorblatt)\b/
const HEADING_RE = /^(?:[A-Z]|[IVX]+|\d+)\.\s+\S/

/** Lines a document repeats on most pages — address, file number, date — are page furniture, not prose. */
function withoutFurniture(lines: readonly string[]): string[] {
  const counts = new Map<string, number>()
  for (const l of lines) counts.set(l, (counts.get(l) ?? 0) + 1)
  return lines.filter((l) => l && !PAGE_NOISE_RE.test(l) && !(l.length < 80 && (counts.get(l) ?? 0) >= 3))
}

/** Lines into paragraphs: a line that ends a sentence well short of the measure ends its paragraph; a bullet or a heading opens one. */
function paragraphs(lines: readonly string[]): ExplanationPassage[] {
  const measure = Math.max(40, ...lines.map((l) => l.length))
  const out: ExplanationPassage[] = []
  let current: ExplanationPassage = { heading: null, text: [] }
  let para = ''
  const flushPara = () => {
    if (para.trim()) current.text.push(para.trim())
    para = ''
  }
  const flushPassage = () => {
    flushPara()
    if (current.heading || current.text.length) out.push(current)
  }
  let joined = -1
  lines.forEach((line, i) => {
    if (i === joined) return
    // „I. Anlass und Inhalt" is a heading; „1. die Schaffung einer … Ersatzvor-" an item of a list.
    let heading = (START_RE.test(line) || (HEADING_RE.test(line) && /^\S+\.\s+\p{Lu}/u.test(line))) && line.length < 90 && !/[.;,-]$/.test(line)
    let name = line
    // A heading that ends mid-phrase wraps: „VI. Auswirkungen … insbesondere
    // auf" over „Frauen und Männer", in most of Salzburg's Erläuterungen —
    // the rest of it is the next line where that is short and ends no
    // sentence. Where the next line runs on, the „heading" was the first
    // line of a numbered item: „2. Das konkrete Ausmaß … an der" over
    // „Landschaftsabgabe hängt vom …" (23.10.2026).
    if (heading && DANGLING_RE.test(line)) {
      const next = lines[i + 1]
      if (next && next.length <= 60 && !/[.;:,]$/.test(next) && /^\p{L}/u.test(next)) {
        name = `${line} ${next}`
        joined = i + 1
      } else {
        heading = false
      }
    }
    if (heading) {
      flushPassage()
      current = { heading: name.replace(/:$/, ''), text: [] }
      return
    }
    if (/^[-–•]\s/.test(line)) flushPara()
    para = !para ? line : /\p{L}-$/u.test(para) && /^\p{Ll}/u.test(line) && !/^(?:und|oder|bzw\.|sowie)\b/.test(line) ? `${para.slice(0, -1)}${line}` : `${para} ${line}`
    if (/[.:;!?]$/.test(line) && line.length < measure * 0.85) flushPara()
  })
  flushPassage()
  return out
}

/** A line that ends mid-phrase: an article, a preposition, a conjunction. */
const DANGLING_RE = /\s(?:von|der|die|das|des|dem|den|und|oder|für|zur|zum|im|in|auf|mit|bei|nach|über|sowie|insbesondere)$/

/**
 * The §§ a „Zu …" heading names: „(§ 1 Abs. 3)" → 1, „(§§ 4, 5 und 7)" →
 * 4, 5, 7, „(§ 2 Abs. 9 bis 11)" → 2 — a number after „Abs." or „Z" is no §.
 */
export function headingParas(heading: string): string[] {
  const out = new Set<string>()
  for (const m of heading.matchAll(/§§\s*(\d+[a-z]*(?:\s*(?:,|und|bis|sowie)\s*\d+[a-z]*)*)/g)) {
    for (const n of m[1]!.matchAll(/\d+[a-z]*/g)) out.add(n[0])
  }
  for (const m of heading.matchAll(/§(?!§)\s*(\d+[a-z]*)/g)) out.add(m[1]!)
  return [...out]
}

/** „Zu Z 1 und 3", „Zu den Z 3 bis 5", „Zu Ziffer 2" → 1, 3 / 3, 4, 5 / 2. */
export function headingZiffern(heading: string): number[] {
  const m = /\bZ(?:iffer)?n?\.?\s*(\d+[a-z]*(?:\s*(?:,|und|bis|sowie)\s*\d+[a-z]*)*)/.exec(heading)
  if (!m) return []
  const out: number[] = []
  const parts = m[1]!.split(/\s*(,|und|sowie)\s*/).filter((p) => !/^(?:,|und|sowie)$/.test(p))
  for (const part of parts) {
    const range = /^(\d+)[a-z]*\s*bis\s*(\d+)/.exec(part)
    if (range) for (let n = Number(range[1]); n <= Number(range[2]) && n - Number(range[1]) < 60; n++) out.push(n)
    else if (/^\d+/.test(part)) out.push(Number(/^\d+/.exec(part)![0]))
  }
  return out
}

export function parseLandExplanations(pageTexts: readonly string[]): LandExplanationsParse | null {
  const lines = withoutFurniture(pageTexts.flatMap((p) => p.split('\n')).map((l) => l.replace(/\s+/g, ' ').trim()))
  const title = lines.findIndex((l) => TITLE_RE.test(l))
  const startAt = lines.findIndex((l, i) => START_RE.test(l) && (title < 0 || i >= title))
  const begin = startAt >= 0 ? startAt : title >= 0 ? title + 1 : -1
  if (begin < 0) return null
  const rest = lines.slice(begin)
  // The particular part begins at its heading where the document has one; a
  // „Zu Art 1 Z 5 …" before it is a row of the general part's tables (the
  // costs per provision, Salzburg's Raumordnungs-Novelle 2025).
  const particularHead = rest.findIndex((l, i) => i > 0 && PARTICULAR_RE.test(l))
  const particularAt = particularHead >= 0 ? particularHead : rest.findIndex((l, i) => i > 0 && ENTRY_RE.test(l))
  const generalLines = particularAt < 0 ? rest : rest.slice(0, particularAt)
  const generalEnd = generalLines.findIndex((l, i) => i > 0 && END_RE.test(l))
  const general = paragraphs(generalEnd < 0 ? generalLines : generalLines.slice(0, generalEnd))

  const particular: ParticularExplanation[] = []
  if (particularAt >= 0) {
    let body = rest.slice(particularAt)
    const end = body.findIndex((l, i) => i > 0 && END_RE.test(l))
    if (end > 0) body = body.slice(0, end)
    let entry: { heading: string; lines: string[] } | null = null
    const flush = () => {
      if (!entry) return
      const text = paragraphs(entry.lines).flatMap((p) => [...(p.heading ? [p.heading] : []), ...p.text])
      const article = /^Zu\s+Art(?:ikel)?\.?\s*([IVXL]+|\d+)\b/.exec(entry.heading)?.[1] ?? null
      particular.push({ article, paras: headingParas(entry.heading), heading: entry.heading, text })
    }
    let headingOpen = false
    for (const line of body) {
      if (ENTRY_RE.test(line)) {
        flush()
        entry = { heading: line, lines: [] }
        headingOpen = !/:$/.test(line)
        continue
      }
      if (!entry) continue
      // A heading that wraps — „Zu Art. I Z 5 bis 9 und 12 bis 14 und 16 (§ 4 Abs." / „1 und 2):".
      if (headingOpen && entry.heading.length < 220 && (/^[^.]{0,80}\):?$/.test(line) || /\($/.test(entry.heading) || /\([^)]*$/.test(entry.heading))) {
        entry.heading = `${entry.heading} ${line}`
        headingOpen = !/:$/.test(line) && /\([^)]*$/.test(entry.heading)
        continue
      }
      headingOpen = false
      entry.lines.push(line)
    }
    flush()
  }
  if (!general.length && !particular.length) return null
  return { general, labelled: startAt >= 0, particular }
}

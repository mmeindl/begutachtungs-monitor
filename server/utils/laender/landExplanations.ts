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
 *    after them; headings in bold, many without a number (`boldHeading`).
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
/* „TEXTGEGENÜBERSTELLUNG" in capitals in Wien's drafts (w-2026006); the last „Zu …" entry ran on into the table. */
const END_RE = /^(?:Textgegenüberstellung|TEXTGEGENÜBERSTELLUNG|Der (?:Oö\. |Salzburger |Wiener )?Landtag hat beschlossen|Die (?:Oö\. |Salzburger |Wiener )?Landesregierung hat (?:beschlossen|verordnet)|Vorblatt)\b/
const HEADING_RE = /^(?:[A-Z]|[IVX]+|\d+)\.\s+\S/

/** A line of the document, and whether all of it is set in bold (`pdfStyledPages`). */
interface Line {
  text: string
  bold: boolean
}

/** Lines a document repeats on most pages — address, file number, date — are page furniture, not prose. */
function withoutFurniture(lines: readonly Line[]): Line[] {
  const counts = new Map<string, number>()
  for (const l of lines) counts.set(l.text, (counts.get(l.text) ?? 0) + 1)
  return lines.filter(({ text: l }) => l && !PAGE_NOISE_RE.test(l) && !(l.length < 80 && (counts.get(l) ?? 0) >= 3))
}

/**
 * A heading only its weight tells (23.10.2026): Wien sets those of its
 * Erläuterungen unnumbered and in bold — „Ziel und Inhalt der Novelle",
 * „Begründung", „Finanzielle Auswirkungen des Regelungsvorhabens auf den
 * Haushalt der Stadt Wien:" — and read as text they ran into the paragraph
 * below. A whole line in bold that opens with a capital and ends no
 * sentence: a bold sentence is emphasis, not a heading. A rule by the text
 * alone — a short line without a full stop — found headings in 375 of 540
 * documents, nearly all of them wrong. Only Wien's lines carry a weight
 * here (`HEADINGS_BY_WEIGHT`, docs/architecture.md §12.62).
 */
function boldHeading(l: Line): boolean {
  return l.bold && l.text.length < 120 && /^\p{Lu}/u.test(l.text) && !/[.;,]$/.test(l.text)
}

/** Lines into paragraphs: a line that ends a sentence well short of the measure ends its paragraph; a bullet or a heading opens one. */
function paragraphs(lines: readonly Line[]): ExplanationPassage[] {
  const measure = Math.max(40, ...lines.map((l) => l.text.length))
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
  lines.forEach((l, i) => {
    if (i === joined) return
    const line = l.text
    // „I. Anlass und Inhalt" is a heading; „1. die Schaffung einer … Ersatzvor-" an item of a list.
    let heading = ((START_RE.test(line) || (HEADING_RE.test(line) && /^\S+\.\s+\p{Lu}/u.test(line))) && line.length < 90 && !/[.;,-]$/.test(line)) || boldHeading(l)
    let name = line
    // A heading that ends mid-phrase wraps: „VI. Auswirkungen … insbesondere
    // auf" over „Frauen und Männer", in most of Salzburg's Erläuterungen —
    // the rest of it is the next line where that is short and ends no
    // sentence. A bold heading's rest is bold too, may end in its colon, and
    // may follow a word broken at its hyphen. Where the next line runs on,
    // the „heading" was the first line of a numbered item: „2. Das konkrete
    // Ausmaß … an der" over „Landschaftsabgabe hängt vom …" (23.10.2026).
    const broken = l.bold && /\p{L}-$/u.test(line)
    if (heading && (DANGLING_RE.test(line) || broken)) {
      const next = lines[i + 1]
      const ends = l.bold && next?.bold ? /[.;,]$/ : /[.;:,]$/
      if (next && (!broken || next.bold) && next.text.length <= 60 && !ends.test(next.text) && /^\p{L}/u.test(next.text)) {
        name = broken && /^\p{Ll}/u.test(next.text) && !/^(?:und|oder|bzw\.|sowie)\b/.test(next.text) ? `${line.slice(0, -1)}${next.text}` : `${line} ${next.text}`
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

/**
 * The particular part from its first entry on: one entry per „Zu …"
 * heading (`entry`), up to the document's end marker (`END_RE`).
 */
function particularOf(lines: readonly Line[], entry: RegExp): ParticularExplanation[] {
  const particular: ParticularExplanation[] = []
  let body = lines
  const end = body.findIndex((l, i) => i > 0 && END_RE.test(l.text))
  if (end > 0) body = body.slice(0, end)
  let current: { heading: string; lines: Line[] } | null = null
  const flush = () => {
    if (!current) return
    const text = paragraphs(current.lines).flatMap((p) => [...(p.heading ? [p.heading] : []), ...p.text])
    const article = /^Zu\s+Art(?:ikel)?\.?\s*([IVXL]+|\d+)\b/.exec(current.heading)?.[1] ?? null
    particular.push({ article, paras: headingParas(current.heading), heading: current.heading, text })
  }
  let headingOpen = false
  for (const l of body) {
    const line = l.text
    if (entry.test(line)) {
      flush()
      current = { heading: line, lines: [] }
      headingOpen = !/:$/.test(line)
      continue
    }
    if (!current) continue
    // A heading that wraps — „Zu Art. I Z 5 bis 9 und 12 bis 14 und 16 (§ 4 Abs." / „1 und 2):".
    if (headingOpen && current.heading.length < 220 && (/^[^.]{0,80}\):?$/.test(line) || /\($/.test(current.heading) || /\([^)]*$/.test(current.heading))) {
      current.heading = `${current.heading} ${line}`
      headingOpen = !/:$/.test(line) && /\([^)]*$/.test(current.heading)
      continue
    }
    headingOpen = false
    current.lines.push(l)
  }
  flush()
  return particular
}

/**
 * Burgenland's Erläuterungen (30.10.2026): after the law text a „Vorblatt"
 * — Problem, Ziel und wesentlicher Inhalt, Alternativen, Finanzielle
 * Auswirkungen, each headed by a short line ending in its colon — and then
 * „Erläuterungen:" with the particular part alone, „Zu § 22h", „Zur
 * Änderung des Inhaltsverzeichnisses". The Land writes no „Allgemeiner
 * Teil": the Vorblatt is its general part, and the page shows it under that
 * name. Read from „Erläuterungen:", the first entry stood as the whole
 * general part. The colon rule for headings holds inside the Vorblatt only:
 * over whole documents a rule by the text alone was wrong nearly always
 * (`boldHeading`). Null where the document has no Vorblatt before its
 * Erläuterungen — then it is read as any other.
 */
const VORBLATT_RE = /^Vorblatt:?$/
const VORBLATT_HEADING_RE = /^\p{Lu}[^.;,:]{2,110}:$/u
/* „Zur Änderung des Inhaltsverzeichnisses", „Zum Titel" — never „Zur Vermeidung von … wird", prose that opens alike. */
const VORBLATT_ENTRY_RE = new RegExp(`${ENTRY_RE.source}|^Zu[rm]\\s+(?:Änderung|Einfügung|Aufhebung|Entfall|Neufassung|Inhaltsverzeichnis|Titel|Langtitel|Kurztitel|Promulgationsklausel|Anlage)\\b[^.]*$`, 'u')

/** The Vorblatt's lines with its headings marked — one that wraps („… Frauen und" / „Männer:") joined into one line. */
function vorblattLines(lines: readonly Line[]): Line[] {
  const out: Line[] = []
  for (const l of lines) {
    const prev = out.at(-1)
    if (VORBLATT_HEADING_RE.test(l.text) && prev && !prev.bold && DANGLING_RE.test(prev.text) && VORBLATT_HEADING_RE.test(`${prev.text} ${l.text}`.replace(/,/g, ''))) {
      out[out.length - 1] = { text: `${prev.text} ${l.text}`, bold: true }
    } else {
      out.push(VORBLATT_HEADING_RE.test(l.text) ? { ...l, bold: true } : l)
    }
  }
  return out
}

function vorblattParse(lines: readonly Line[], title: number): LandExplanationsParse | null {
  const at = lines.findIndex((l) => VORBLATT_RE.test(l.text))
  if (at < 0 || title <= at) return null
  const general = paragraphs(vorblattLines(lines.slice(at + 1, title)))
  const particular = particularOf(lines.slice(title + 1), VORBLATT_ENTRY_RE)
  if (!general.length && !particular.length) return null
  return { general: [{ heading: 'Vorblatt', text: [] }, ...general], labelled: true, particular }
}

/**
 * The Erläuterungen in a document's pages; `bold` says, per page and line,
 * which lines are set in bold (`pdfStyledPages`) — without it, only numbered
 * headings are found.
 */
export function parseLandExplanations(
  pageTexts: readonly string[],
  bold?: readonly (readonly boolean[])[],
  options: { vorblatt?: boolean } = {},
): LandExplanationsParse | null {
  const lines = withoutFurniture(pageTexts.flatMap((p, n) => p.split('\n').map((l, i) => ({ text: l.replace(/\s+/g, ' ').trim(), bold: bold?.[n]?.[i] ?? false }))))
  const title = lines.findIndex((l) => TITLE_RE.test(l.text))
  if (options.vorblatt) {
    const parse = vorblattParse(lines, title)
    if (parse) return parse
  }
  const startAt = lines.findIndex((l, i) => START_RE.test(l.text) && (title < 0 || i >= title))
  const begin = startAt >= 0 ? startAt : title >= 0 ? title + 1 : -1
  if (begin < 0) return null
  const rest = lines.slice(begin)
  // The particular part begins at its heading where the document has one; a
  // „Zu Art 1 Z 5 …" before it is a row of the general part's tables (the
  // costs per provision, Salzburg's Raumordnungs-Novelle 2025).
  const particularHead = rest.findIndex((l, i) => i > 0 && PARTICULAR_RE.test(l.text))
  const particularAt = particularHead >= 0 ? particularHead : rest.findIndex((l, i) => i > 0 && ENTRY_RE.test(l.text))
  const generalLines = particularAt < 0 ? rest : rest.slice(0, particularAt)
  const generalEnd = generalLines.findIndex((l, i) => i > 0 && END_RE.test(l.text))
  const general = paragraphs(generalEnd < 0 ? generalLines : generalLines.slice(0, generalEnd))

  const particular = particularAt >= 0 ? particularOf(rest.slice(particularAt), ENTRY_RE) : []
  if (!general.length && !particular.length) return null
  return { general, labelled: startAt >= 0, particular }
}

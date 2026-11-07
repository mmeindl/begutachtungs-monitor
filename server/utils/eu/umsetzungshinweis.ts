/**
 * WHICH EU act a draft implements, read from its own law text — the
 * Umsetzungshinweis (docs/architecture.md §12.66).
 *
 * PURE MODULE — text in, windows and acts out; no Nitro globals, relative
 * imports only, so the corpus script measures this file and the Länder can
 * run it over Landesgesetz text unchanged.
 *
 * What a draft writes, measured over the RIS Begut corpus since 2024
 * (04.11.2026):
 *
 * - a § headed „Umsetzungshinweis", „Bezugnahme auf Unionsrecht",
 *   „Umsetzung von Rechtsakten der Europäischen Union" — the act list follows
 *   below the heading, often as Ziffern („Durch dieses Bundesgesetz werden
 *   folgende Richtlinien umgesetzt: 1. …");
 * - one sentence in an Absatz: „Mit diesem Bundesgesetz wird die Richtlinie
 *   (EU) 2024/1069 … umgesetzt", „dient der Umsetzung der Richtlinie …";
 * - for a regulation: „begleitende Regelungen zur Verordnung (EU) …",
 *   „Durchführung der Verordnung (EU) …", „dient dem Wirksamwerden der
 *   Verordnung …".
 *
 * A heading opens a WINDOW to the next §, Artikel, section or
 * Novellierungsanordnung; a sentence is read in its own Absatz, and
 * continues below only where it does not end — to the same end. A signal outside a
 * heading needs something European in its window (`EU_ANCHOR`) — without it,
 * „Richtlinie" is a national one and „Umsetzung" a national goal.
 *
 * WHAT IT DOES NOT KNOW: whether a named act is new. An amendment restates
 * the whole hint, directives transposed years ago included; that question is
 * the law in force's (`euService.ts`, rule D4).
 */
import { parseEuActCitations, uniqueActs, unnamedAmendmentBases, withoutActTitles, type EuAct } from './actCitations'

/** What a window says: implements, flanks a regulation, or only refers. */
export type LawSignal = 'umsetzung' | 'durchfuehrung' | 'bezug'

/**
 * One block of law text. The shape of `lawtext/lawUnits.ts`'s `TextBlock`,
 * restated so the Länder can hand in their own: `kind` decides headings and
 * window ends, `gld` is the printed Gliederungssymbol („§ 3.").
 */
export interface LawTextBlock {
  kind: string
  text: string
  gld?: string | null
}

/** A § heading that announces the EU reference; its text follows in the next blocks. */
const LAW_HEADING = /^(?:Umsetzungshinweis(?:e)?|Hinweis auf (?:die )?Umsetzung|Bezugnahmen? auf (?:das )?Unionsrecht|Bezugnahmen? auf Rechtsakte der (?:Europäischen )?Union|(?:Durchführung und )?Umsetzung von Rechtsakten der (?:Europäischen )?Union|Unionsrechtliche Bezugnahmen?|Bezugnahme auf Richtlinien|Umsetzung (?:von|der) (?:Unionsrecht|Gemeinschaftsrecht|Richtlinien?|EU-Richtlinien?)(?:\b.*)?|Richtlinienumsetzung|Verweisungen? auf (?:das )?Unionsrecht|Unionsrecht|Durchführung (?:von|der) (?:Unionsrecht|Verordnungen?)(?:\b.*)?)\.?$/i
/** The heading word inside a longer heading line — „Umsetzung von Gemeinschaftsrecht" in the older laws (the EAG-VO's § 27). */
const LAW_HEADING_WORD = /Umsetzungshinweis|Bezugnahmen?\s+auf\s+(?:das\s+)?Unionsrecht|Bezugnahmen?\s+auf\s+Rechtsakte\s+der\s+(?:Europäischen\s+)?Union|Umsetzung\s+von\s+(?:Unionsrecht|Gemeinschaftsrecht|Rechtsakten\s+der\s+(?:Europäischen\s+)?Union)/
/**
 * A sentence inside one Absatz that implements: „wird/werden … Richtlinie …
 * umgesetzt" with its subject, not any „umgesetzt" after a Richtlinie — the
 * WiEReG's „Staaten …, die den Nachweis gemäß Verordnung (EU) Nr. 910/2014
 * nicht umgesetzt haben" is a provision, not a hint. „werden die Vorgaben
 * folgender Rechtsakte … umgesetzt: 1. IE-Richtlinie" (the AEVs) names the
 * act after the verb; the act may stand far from the verb and may be a
 * Durchführungsbeschluss.
 */
const LAW_UMSETZUNG = /Umsetzungshinweis|\b(?:wird|werden)\s+[\s\S]{0,300}?\b(?:Richtlinien?|RL|Rechtsakte?|Durchführungsbeschlusses|Durchführungsbeschluss|Beschluss)\b[\s\S]{0,800}?(?<!nicht\s)\bumgesetzt\b|dient\s+(?:der|zur)\s+Umsetzung|zur\s+Umsetzung\s+(?:der|von|einer)\s+[\s\S]{0,60}?Richtlinie/
/** A sentence that flanks a regulation. */
const LAW_DURCHFUEHRUNG = /Bezugnahmen?\s+auf\s+(?:das\s+)?Unionsrecht|Durchführung\s+(?:der|von|zur)\s+[\s\S]{0,40}?(?:Verordnung|Durchführungsverordnung|Delegierten\s+Verordnung)\s*\((?:EU|EG)|begleitende[n]?\s+(?:Regelungen|Bestimmungen|Maßnahmen)\s+zu[rm]?\s+(?:unmittelbar\s+anwendbaren\s+)?(?:Verordnung|Durchführungsverordnung)|flankierende[n]?\s+(?:Regelungen|Bestimmungen)\s+zu/

/** Without an EU anchor in the same Absatz a signal is a national „Richtlinie" or a programme. */
export const EU_ANCHOR = /\((?:EU|EG|EWG)\)|\/E(?:U|G|WG)\b|Europäische[nr]?\s+Union|Unionsrecht|unionsrechtlich|EU-|[A-Za-zÄÖÜäöüß]-Richtlinie\b/

/** Kinds that end the window a heading opens. */
const WINDOW_END: ReadonlySet<string> = new Set(['para_head', 'article', 'section', 'title', 'novao'])

/**
 * Where a window ends besides `WINDOW_END` (05.11.2026). It ended after 12
 * blocks, and Burgenland's GADG (bgld-c372) lists 17 directives under
 * „Umsetzungshinweise § 65. Durch dieses Gesetz werden folgende Richtlinien
 * … umgesetzt: 1. … 17. …" — the six newest, the ones the draft adds, fell
 * off the end; the Vergaberechtsgesetz 2026 lists 37. The end is the
 * structure instead: the next § (`NEXT_PARA`), past the first block below
 * a heading, which carries the hint's own §. A Land's PDF has no heading
 * block before every §, and the Bund's RIS has none in a law without §
 * titles. The next Absatz does not end it: 32/ME writes „§ 2. (1) …
 * folgende Richtlinien umgesetzt: … (2) … folgende Verordnungen
 * durchgeführt: …", and „durchgeführt" opens no window of its own. In the
 * Bund's RIS blocks the § is the Gliederungssymbol, in a Land's PDF blocks
 * the text's start; a Novelle's quotes are taken off first.
 * `WINDOW_CEILING` is a safety net only, for a text whose structure the
 * block reader did not see.
 */
const NEXT_PARA = /^§\s*\d/
const WINDOW_CEILING = 80

/**
 * How a window's acts are read: acts inside another act's title and acts
 * the window only refers to („nach der Verordnung (EU) Nr. 1025/2012",
 * `withoutReferences`) are not what it implements.
 */
const WINDOW_CITATIONS = { implemented: true, withoutReferences: true } as const

/** One place the law text speaks of EU law. */
export interface LawWindow {
  /** The window's text, whitespace normalised. */
  text: string
  /** Index of the block it starts at — the service finds the Novellierungsanordnung above it. */
  start: number
  signal: LawSignal
  /** The acts named in it, those named inside another act's title or only referred to dropped. */
  acts: EuAct[]
  /**
   * A Ziffer a Novelle quotes into a § in force (`readQuotedNovelleHints`):
   * it is a hint only where that § is one (`isHintParagraph`), which the
   * service reads from the law in force.
   */
  quoted?: true
  /**
   * The CELEX numbers the window names only as base texts of an amending act
   * it cites without a number (`unnamedAmendmentBases`, 06.11.2026): „wird
   * die Richtlinie zur Änderung der Richtlinie 2014/65/EU … umgesetzt" does
   * not implement 2014/65. Absent where there are none.
   */
  base?: string[]
}

/** Whether a window names an act it implements — one that is not only a base text (`LawWindow.base`). */
export function namesOwnAct(w: Pick<LawWindow, 'acts' | 'base'>): boolean {
  return w.acts.some((a) => !w.base?.includes(a.celex))
}

export interface UmsetzungshinweisReading {
  /** The strongest signal of any window: umsetzung over durchfuehrung over bezug. */
  signal: LawSignal | null
  /**
   * The strongest signal of a window that names an act other than a base
   * text (`namesOwnAct`) — what may decide
   * „whether" (`euMarker.ts`): a window „… wird die Richtlinie … umgesetzt"
   * whose act is a short name, beside a „Bezugnahme" that names one, says
   * no act is implemented.
   */
  actSignal: LawSignal | null
  windows: LawWindow[]
  /** Every act any window names, in order, once. */
  acts: EuAct[]
  /** Inline matches dropped for want of anything European in their window, with their text. */
  dropped: string[]
}

function blockText(b: LawTextBlock): string {
  return [b.gld, b.text].filter(Boolean).join(' ')
}

/**
 * What a window says, with its heading word taken out first: under
 * „Umsetzungshinweis" the MiCA-Vollzugsgesetz writes „dient dem Wirksamwerden
 * der Verordnung (EU) 2023/1114" — that flanks a regulation, it implements
 * nothing.
 */
export function lawSignalOf(text: string): LawSignal {
  const body = text.replace(/Umsetzungshinweis(?:e)?/g, '')
  // „dient der Umsetzung folgender Richtlinien: 1. …" (sbg-35373) implements, too.
  if (/umgesetzt|\bUmsetzung\s+(?:der|von|einer|des|folgender)\b/.test(body)) return 'umsetzung'
  if (/Durchführung|Wirksamwerden|begleitend|flankierend|unmittelbar anwendbar|Verordnung/.test(body)) return 'durchfuehrung'
  return 'bezug'
}

const SIGNAL_RANK: LawSignal[] = ['umsetzung', 'durchfuehrung', 'bezug']

/** The strongest of several signals, or null. */
export function strongestSignal(signals: readonly LawSignal[]): LawSignal | null {
  return SIGNAL_RANK.find((k) => signals.includes(k)) ?? null
}

/** Plain text as blocks: one line, one Absatz. */
function blocksOfText(text: string): LawTextBlock[] {
  return text.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => ({ kind: 'abs', text: line }))
}

/**
 * Every Umsetzungshinweis in a law text.
 *
 * `input` is the parsed text (`parseRisXml`'s blocks, or anything of that
 * shape) or plain text, one Absatz per line — the plain form knows no
 * headings by kind, so only sentence hints and short heading lines are read.
 */
export function readUmsetzungshinweis(input: string | readonly LawTextBlock[]): UmsetzungshinweisReading {
  const blocks = typeof input === 'string' ? blocksOfText(input) : input
  const windows: LawWindow[] = []
  const dropped: string[] = []
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]!
    const text = blockText(b)
    // The table of contents names the Umsetzungshinweis without its text.
    if (b.kind === 'toc') continue
    // A heading, however RIS typed it: „Umsetzungshinweis" as a § heading,
    // as a quoted heading inside a Novellierungsanordnung, as „§ 21a.
    // Umsetzungshinweis", or in a combined heading („Vollziehung,
    // Inkrafttreten, Übergangsbestimmungen, Umsetzungshinweis").
    // The § symbol goes with or without its period: RIS prints „§ 21a.",
    // a Land's PDF „§ 13b" — and the Land PDF reader joins that § with its
    // title and first sentence into one block („§ 13b Durchführung von
    // Unionsrecht Durch dieses Gesetz werden …", Tirol t-2026-588), which
    // LAW_HEADING's open-ended alternatives read once the symbol is off.
    const bare = b.text.replace(/^[\s"„]+|[\s"“]+$/g, '').replace(/^§\s*\d+[a-z]*\.?\s*/, '').trim()
    const headed = b.kind !== 'abs' && b.kind !== 'novao'
      ? LAW_HEADING.test(bare) || (bare.length < 140 && LAW_HEADING_WORD.test(bare))
      : bare.length < 60 && LAW_HEADING.test(bare)
    const inline = LAW_UMSETZUNG.test(text) || LAW_DURCHFUEHRUNG.test(text)
    if (!headed && !inline) continue
    // A heading (or a Novellierungsanordnung naming one) opens a window to
    // the next provision; a sentence that does not end goes on below
    // („… werden folgende Richtlinien umgesetzt:", „§ 327. Dieses
    // Bundesgesetz dient der Umsetzung").
    let window = text
    if (headed || b.kind === 'novao' || !/[.;]["“]?\s*$/.test(text)) {
      // A sentence that does not end has its § already; a heading and a
      // Novellierungsanordnung reach the hint's own § first.
      const sentence = !headed && b.kind !== 'novao'
      // The first § below a heading is the hint's own, unless the opening block carries it.
      const ownPara = NEXT_PARA.test(text.replace(/^[\s"„»]+/, ''))
      const parts = [text]
      for (let j = i + 1; j < blocks.length && j <= i + WINDOW_CEILING; j++) {
        const next = blocks[j]!
        if (WINDOW_END.has(next.kind)) break
        const start = blockText(next).replace(/^[\s"„»]+/, '')
        if (NEXT_PARA.test(start) && (sentence || ownPara || j > i + 1)) break
        parts.push(blockText(next))
      }
      window = parts.join(' ')
    }
    window = window.replace(/\s+/g, ' ').trim()
    // A sentence without anything European in it is a national „Richtlinie"
    // or a national goal („dient der Umsetzung eines anbieterübergreifenden
    // Einzahlungslimits"). A heading is its own anchor.
    if (!headed && !EU_ANCHOR.test(window) && !parseEuActCitations(window).length) {
      dropped.push(window)
      continue
    }
    // A window inside another is the same provision read twice — the
    // table of contents' „Umsetzungshinweis" beside the § it names.
    if (windows.some((w) => w.text.includes(window))) continue
    for (let k = windows.length - 1; k >= 0; k--) {
      if (window.includes(windows[k]!.text)) windows.splice(k, 1)
    }
    const acts = parseEuActCitations(window, WINDOW_CITATIONS)
    const base = [...unnamedAmendmentBases(window)].filter((c) => acts.some((a) => a.celex === c))
    windows.push({ text: window, start: i, signal: lawSignalOf(window), acts, ...(base.length ? { base } : {}) })
  }
  return {
    signal: strongestSignal(windows.map((w) => w.signal)),
    actSignal: strongestSignal(windows.filter(namesOwnAct).map((w) => w.signal)),
    windows,
    acts: uniqueActs(windows.map((w) => w.acts)),
    dropped,
  }
}

// ---------------------------------------------------------------------------
// The quoted hint: a Ziffer a Novelle adds to the hint in force
// ---------------------------------------------------------------------------

/**
 * A quoted Ziffer that opens with an EU act: its number — or a Spiegelstrich
 * („- Richtlinie (EU) 2023/175 …", the Extraktionslösungsmittelverordnung)
 * —, an article where the list writes one („78. Die Richtlinie (EU)
 * 2024/884 …", „3. die delegierte Richtlinie (EU) 2024/1262 …"), then the
 * act — „Richtlinie 2024/1712/EU …", „Art. 15 und 16 der Richtlinie (EU)
 * 2018/2001 …", „Durchführungsbeschluss 2019/2010 der Kommission …",
 * „Durchführungsrichtlinie (EU) 2025/145 …". The article, the
 * Durchführungsrichtlinie, the delegated act and the Spiegelstrich came in
 * on 05.11.2026: four Bund drafts whose Vorblatt says „umsetzung" named no
 * act for want of them.
 */
const ACT_ZIFFER = /^(?:\d+[a-z]*\.|[-–•])\s+(?:(?:[Dd]ie|[Dd]er|[Dd]as|[Dd]en)\s+)?(?:Art(?:ikel|\.)?\s*\d+[a-z]?\b[^„“"]{0,80}?\s(?:der|des)\s+)?(?:Richtlinie|Verordnung|Durchführungsrichtlinie|Durchführungsverordnung|[Dd]elegierte[nr]?\s+(?:Richtlinie|Verordnung|Beschluss)|Beschluss|Durchführungsbeschluss|Rahmenbeschluss)\b/
/** A Ziffer's or a Spiegelstrich's start inside a quote. */
const ZIFFER_START = /(?:^|\n)(?=(?:\d+[a-z]*\.|[-–•])\s)/
/** The lead of a list of references, not of implementations. */
const REFERENCE_LEAD = /verwei|zu verstehen/i

/** One quoted Ziffer read as a hint: its text and the acts it names. */
export interface QuotedHint {
  text: string
  acts: EuAct[]
}

/**
 * The Ziffern of one quote — its text without the quote marks, one line per
 * block — that open with an EU act (Nachtrag 2 of §12.66, 04.11.2026; the
 * Bund's since 05.11.2026). A Novelle adds an act to the hint in force as a
 * quoted Ziffer, „12. Richtlinie 2024/1385/EU …" (Salzburg 34413), „3.
 * Durchführungsbeschluss 2019/2010 …" (the Bund's AEV Verbrennungsgas):
 * neither a hint word nor „umgesetzt" stands in it — the § the instruction
 * names IS the hint, in the law in force. A national law lists bare acts
 * as Ziffern only in its Umsetzungshinweis or in a list of its references;
 * a quote that introduces its list as references („Dieses Gesetz verweist
 * auf folgende Rechtsakte …", „… sind darunter zu verstehen:") is skipped,
 * and a bare Ziffer replacing one in such a list is the residual risk.
 */
export function quotedZiffern(quote: string): QuotedHint[] {
  const items = quote.split(ZIFFER_START)
  if (REFERENCE_LEAD.test(items[0] ?? '')) return []
  const out: QuotedHint[] = []
  for (const item of items) {
    const ziffer = item.replace(/\s+/g, ' ').trim()
    if (!ACT_ZIFFER.test(ziffer)) continue
    const acts = parseEuActCitations(ziffer, WINDOW_CITATIONS)
    if (acts.length) out.push({ text: ziffer, acts })
  }
  return out
}

/** What quoted hint Ziffern say: a directive among them is implemented, else a regulation flanked. */
export function quotedHintSignal(acts: readonly EuAct[]): LawSignal | null {
  return !acts.length ? null : acts.some((a) => a.kind === 'richtlinie') ? 'umsetzung' : 'durchfuehrung'
}

/** Kinds that end what a Novellierungsanordnung quotes: the next instruction, Artikel or title. */
const QUOTE_END: ReadonlySet<string> = new Set(['novao', 'article', 'title'])
const QUOTE_MARK = /["„»“«]/

/**
 * The quoted hint Ziffern of a Bund law text: what each
 * Novellierungsanordnung quotes — „25. § 6 Abs. 2 wird folgende Z 3
 * angefügt" and below it `"3. Durchführungsbeschluss 2019/2010 der
 * Kommission …"` (BEGUT_45BB5DFC, the AEV Verbrennungsgas), RIS's straight
 * quotes — read by `quotedZiffern`. Each becomes a window that starts at
 * its Novellierungsanordnung, so the law in force is asked about the §
 * it addresses (rule D4), like any hint window.
 *
 * NOT A HINT BY ITSELF (measured 05.11.2026). The Länder take such a
 * Ziffer as a hint, with a reference list as the residual risk; in the
 * Bund that risk is the rule. Over the 512 RIS records since 2024 the reading
 * named new acts in 24 drafts, and most were the Verweisungslisten of the
 * financial-market laws („§ 190 Abs. 4 Z 16 lautet: "16. Richtlinie
 * 2014/65/EU …"", „§ 71 Abs. 2 Z 22", „§ 196 Abs. 2 Z 32") and the legal
 * bases of the statistics regulations („§ 14 Z 2 lautet: "2. Verordnung
 * (EU) Nr. 549/2013 …""). Nothing in the draft tells them apart from „§ 6
 * Abs. 2 wird folgende Z 3 angefügt"; the § in force does. So each window
 * is marked `quoted`, and the service keeps it only where the § it
 * addresses is a hint in the law in force (`isHintParagraph`).
 */
export function readQuotedNovelleHints(blocks: readonly LawTextBlock[]): LawWindow[] {
  const windows: LawWindow[] = []
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i]!.kind !== 'novao') continue
    const instruction = blockText(blocks[i]!)
    const inline = QUOTE_MARK.exec(instruction)
    const lines = inline ? [instruction.slice(inline.index)] : []
    for (let j = i + 1; j < blocks.length && !QUOTE_END.has(blocks[j]!.kind); j++) lines.push(blockText(blocks[j]!))
    if (!lines.length || !/^\s*["„»]/.test(lines[0]!)) continue
    const quote = lines.map((l) => l.replace(/^[\s"„»]+|[\s"“«]+$/g, '')).join('\n')
    for (const hint of quotedZiffern(quote)) windows.push({ text: hint.text, start: i, signal: quotedHintSignal(hint.acts)!, acts: hint.acts, quoted: true })
  }
  return windows
}

/**
 * Whether a § of the law in force — its plain text, as RIS serves it — is
 * an Umsetzungshinweis: a hint heading („Umsetzungshinweis", „Bezugnahme
 * auf Unionsrecht", „Umsetzung von Rechtsakten der Europäischen Union"), or
 * a sentence that implements or carries out („Durch diese Verordnung werden
 * folgende Rechtsakte … umgesetzt:"). A list of references („Soweit in
 * diesem Bundesgesetz auf … verwiesen wird") is none, and nor are the words
 * of the act titles it lists (`withoutActTitles`).
 */
export function isHintParagraph(text: string): boolean {
  // In its own words: a reference list's act titles say „zur Umsetzung der …" too.
  const own = withoutActTitles(text)
  if (LAW_HEADING_WORD.test(own)) return true
  return readUmsetzungshinweis(own).windows.some((w) => w.signal === 'umsetzung' || w.signal === 'durchfuehrung')
}

/**
 * What a Bund law text says about EU law: its hint windows
 * (`readUmsetzungshinweis`) and the quoted Ziffern its Novellen add to a
 * hint in force (`readQuotedNovelleHints`) — a Ziffer whose acts a window
 * names already adds nothing.
 */
export function readBundLaw(blocks: readonly LawTextBlock[]): UmsetzungshinweisReading {
  const law = readUmsetzungshinweis(blocks)
  const named = new Set(law.acts.map((a) => a.celex))
  const quoted = readQuotedNovelleHints(blocks).filter((w) => w.acts.some((a) => !named.has(a.celex)))
  return quoted.length ? readingOfWindows([...law.windows, ...quoted], law.dropped) : law
}

/** A reading of some windows: their signals, the strongest of those naming an act, their acts. */
export function readingOfWindows(windows: LawWindow[], dropped: string[] = []): UmsetzungshinweisReading {
  return {
    signal: strongestSignal(windows.map((w) => w.signal)),
    actSignal: strongestSignal(windows.filter(namesOwnAct).map((w) => w.signal)),
    windows,
    acts: uniqueActs(windows.map((w) => w.acts)),
    dropped,
  }
}

// ---------------------------------------------------------------------------
// The Erläuterungen: WHETHER only, where no Vorblatt can be read (rule D5)
// ---------------------------------------------------------------------------

/**
 * Per Absatz of the Allgemeiner Teil. A bare „Umsetzungsfrist" does not
 * count — it fired on „Umsetzungsfrist von 48 Monaten ab Gewährung der
 * Förderung"; a deadline counts only beside a Richtlinie.
 */
const ERL_UMSETZUNG = /dient\s+(?:der|zur)\s+Umsetzung|(?:der|zur)\s+Umsetzung\s+(?:der|von|einer|dieser|des)\s+(?:[^.]{0,60}?\s)?(?:Richtlinie|RL\b|unionsrechtlich|Unionsrecht|EU-Richtlinie|Vorgaben\s+der\s+Richtlinie)|\b(?:Richtlinien?|RL)\b[\s\S]{0,300}?\b(?:umgesetzt|umzusetzen|Umsetzungsfrist)\b|in\s+(?:nationales|innerstaatliches|österreichisches)\s+Recht\s+(?:umgesetzt|umzusetzen|zu\s+übernehmen)/
const ERL_DURCHFUEHRUNG = /begleitende[n]?\s+(?:Regelungen|Bestimmungen|Maßnahmen)\s+zu[rm]?\s+(?:unmittelbar\s+anwendbaren\s+)?(?:Verordnung|Durchführungsverordnung|Delegierten\s+Verordnung|EU-Verordnung)|Durchführung\s+(?:der|von|zur)\s+[\s\S]{0,40}?(?:Verordnung|Durchführungsverordnung)\s*\((?:EU|EG)|unmittelbar\s+anwendbare[nr]?\s+(?:Verordnung|Unionsrecht|EU-Verordnung)|flankierende[n]?\s+(?:Regelungen|Bestimmungen|Maßnahmen)/
/**
 * A negated signal, from the negation to the end of its sentence:
 * Steiermark's house sentence „Der Entwurf dient nicht der Durchführung oder
 * Umsetzung von Unionsrecht" fired ERL_UMSETZUNG (its „oder Umsetzung von
 * Unionsrecht" holds „der Umsetzung"), and through rule D5 a „no" would
 * print „Setzt EU-Recht um" (Länder measurement, 04.11.2026). Only this
 * clause is blanked, so a positive sentence beside it in the same paragraph
 * still speaks; the span stops at the first „." or „;", which may end it
 * early (an „ABl." inside) but never runs it into the next sentence.
 * „nicht nur der Umsetzung" is a yes and stays.
 */
const ERL_NEGATED = new RegExp([
  // „dient nicht der (Durchführung oder) Umsetzung …", „keine Umsetzung …" — to the sentence end
  String.raw`\b(?:nicht(?!\s+nur\b)|keine[nrsm]?)\s+(?:(?:der|zur|einer|die)\s+)?(?:(?:Durchführung|Umsetzung)\s+(?:oder|und|bzw\.?|sowie)\s+)?(?:Durchführung|Umsetzung)\b[^.;]*`,
  // „… wird nicht umgesetzt" — within one clause
  String.raw`\bnicht(?!\s+nur\b)\s+[^.;,]{0,120}?\b(?:umgesetzt|umzusetzen|durchgeführt)\b`,
  // „werden keine Richtlinien umgesetzt" — „keine" before the act, not any „keine Kosten"
  String.raw`\bkeine[nrsm]?\s+(?:[\wäöüß-]+\s+){0,2}?(?:Richtlinien?|Verordnungen?|Rechtsakte?|Rechtsvorschriften|Vorschriften|Vorgaben)\b[^.;,]{0,120}?\b(?:umgesetzt|umzusetzen|durchgeführt)\b`,
].join('|'), 'g')

/** A paragraph with its negated signal clauses blanked (`ERL_NEGATED`). */
export function withoutNegatedSignals(text: string): string {
  return text.replace(ERL_NEGATED, ' ')
}

/**
 * A signal about another text than the draft, blanked like a negated one:
 * t-2026-728 printed „Setzt EU-Recht um" for a draft that REPEALS Tirol's
 * RED III provisions because the Bund's EABG took them over (07.11.2026).
 * Both of its signals spoke of other laws — „Mit dem Ersten und Zweiten
 * Tiroler Erneuerbaren Ausbaugesetz … wurden … Maßnahmen zur Umsetzung der
 * Richtlinie (EU) 2023/2413 … umgesetzt" (what earlier laws did) and „Das
 * EABG dient gleichermaßen der Umsetzung …" (what the Bund's law does).
 * The past tense of the implementing verb, from „wurde(n)" to its participle
 * within the sentence, and a sentence whose subject is another named law —
 * an abbreviation or a word ending in „-gesetz"/„-verordnung" after the
 * article, never „Der Entwurf", „Das vorliegende Gesetz", „Diese Novelle" —
 * to the sentence end. Only the Erläuterungen' prose road: a Vorblatt
 * sentence speaks of its own draft by form.
 */
const ERL_ELSEWHERE = new RegExp([
  // „… wurden … umgesetzt", „wurde in Umsetzung … erlassen"
  String.raw`\bwurden?\b[^.;]{0,300}?\b(?:umgesetzt|erlassen)\b`,
  // „Das EABG dient …", „Das Erneuerbaren-Ausbau-Gesetz dient …"
  String.raw`\b(?:Das|Der|Die)\s+(?:[A-ZÄÖÜ][\wäöüß-]*\s+){0,2}?(?:[A-ZÄÖÜ]{2,}[\wäöüß-]*|[\wäöüß-]+-?(?:gesetz|verordnung)(?:es)?)\s+(?:dient|diente)\b[^.;]*`,
].join('|'), 'g')

/** A paragraph with its negated clauses and its clauses about other texts blanked. */
export function withoutForeignSignals(text: string): string {
  return withoutNegatedSignals(text).replace(ERL_ELSEWHERE, ' ')
}

/** A passage heading of the Allgemeiner Teil that is the EU section itself. */
const ERL_EU_HEADING = /Unionsrecht|Europäischen\s+Union|EU-Recht|Verhältnis\s+zu(?:m)?\s+(?:den\s+)?Rechtsvorschriften/i

/** A passage of the Erläuterungen as both readers carry it: a heading and its paragraphs. */
export interface ExplanationsPassageText {
  heading: string | null
  text: readonly string[]
}

export interface ExplanationsEuReading {
  signal: 'umsetzung' | 'durchfuehrung' | null
  /** The paragraphs that gave a signal, whitespace normalised. */
  paragraphs: string[]
  /** Signals dropped for want of an EU anchor in their paragraph. */
  unanchored: number
}

/**
 * Whether the Allgemeiner Teil says the draft implements or flanks EU law.
 *
 * Never which act: over seven hand-read cases the Erläuterungen named the
 * right act four times — past implementation, existing coverage and the base
 * directive instead of the amending one were the other three (04.11.2026).
 */
export function readExplanationsEuSignal(passages: readonly ExplanationsPassageText[]): ExplanationsEuReading {
  const paragraphs: string[] = []
  const signals: ('umsetzung' | 'durchfuehrung')[] = []
  let unanchored = 0
  for (const passage of passages) {
    const euHeading = ERL_EU_HEADING.test(passage.heading ?? '')
    for (const text of [...(passage.heading ? [passage.heading] : []), ...passage.text]) {
      const read = withoutForeignSignals(text)
      const ums = ERL_UMSETZUNG.test(read)
      const dur = ERL_DURCHFUEHRUNG.test(read)
      if (!ums && !dur) continue
      // The anchor, too, only from what is left: a negated sentence's
      // „Unionsrecht" must not anchor a national „Richtlinie" beside it.
      if (!euHeading && !EU_ANCHOR.test(read)) {
        unanchored++
        continue
      }
      paragraphs.push(text.replace(/\s+/g, ' ').trim())
      signals.push(ums ? 'umsetzung' : 'durchfuehrung')
    }
  }
  const signal = signals.includes('umsetzung') ? 'umsetzung' : signals.includes('durchfuehrung') ? 'durchfuehrung' : null
  return { signal, paragraphs, unanchored }
}

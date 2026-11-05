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
import { parseEuActCitations, uniqueActs, type EuAct } from './actCitations'

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
const LAW_HEADING = /^(?:Umsetzungshinweis(?:e)?|Hinweis auf (?:die )?Umsetzung|Bezugnahmen? auf (?:das )?Unionsrecht|Bezugnahmen? auf Rechtsakte der (?:Europäischen )?Union|(?:Durchführung und )?Umsetzung von Rechtsakten der (?:Europäischen )?Union|Unionsrechtliche Bezugnahmen?|Bezugnahme auf Richtlinien|Umsetzung (?:von|der) (?:Unionsrecht|Richtlinien?|EU-Richtlinien?)(?:\b.*)?|Richtlinienumsetzung|Verweisungen? auf (?:das )?Unionsrecht|Unionsrecht|Durchführung (?:von|der) (?:Unionsrecht|Verordnungen?)(?:\b.*)?)\.?$/i
/** The heading word inside a longer heading line. */
const LAW_HEADING_WORD = /Umsetzungshinweis|Bezugnahmen?\s+auf\s+(?:das\s+)?Unionsrecht|Bezugnahmen?\s+auf\s+Rechtsakte\s+der\s+(?:Europäischen\s+)?Union|Umsetzung\s+von\s+(?:Unionsrecht|Rechtsakten\s+der\s+(?:Europäischen\s+)?Union)/
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

/** One place the law text speaks of EU law. */
export interface LawWindow {
  /** The window's text, whitespace normalised. */
  text: string
  /** Index of the block it starts at — the service finds the Novellierungsanordnung above it. */
  start: number
  signal: LawSignal
  /** The acts named in it, those named inside another act's title dropped. */
  acts: EuAct[]
}

export interface UmsetzungshinweisReading {
  /** The strongest signal of any window: umsetzung over durchfuehrung over bezug. */
  signal: LawSignal | null
  /**
   * The strongest signal of a window that names an act — what may decide
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
    windows.push({ text: window, start: i, signal: lawSignalOf(window), acts: parseEuActCitations(window, { implemented: true }) })
  }
  return {
    signal: strongestSignal(windows.map((w) => w.signal)),
    actSignal: strongestSignal(windows.filter((w) => w.acts.length).map((w) => w.signal)),
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
      const read = withoutNegatedSignals(text)
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

/**
 * The Erläuterungen of a draft, read from the RIS XML (docs/api-exploration.md
 * §2, docs/architecture.md §12.29).
 *
 * PURE MODULE — relative imports only, so vitest runs it directly.
 *
 * WHY THIS EXISTS. The relevance check a reader performs on a new draft starts
 * at the Allgemeiner Teil of the Erläuterungen — what is this law supposed to
 * do — and only then goes to the text itself. Until now the page offered that
 * document as a PDF link and nothing more, while Parliament's own
 * Kurzbeschreibung stood above it under „Worum geht es?". The two are not
 * substitutes: the Kurzbeschreibung is written for the parliamentary record,
 * the Erläuterungen are the ministry's own reasoning, and a Verordnungsentwurf
 * has no Kurzbeschreibung at all because it never reaches Parliament.
 *
 * WHAT RIS GIVES US. The Erläuterungen are their own document of the Begut
 * record (`ContentReference` named "Erläuterungen") and the XML is typed, not
 * merely styled: `<ueberschrift typ="erlz">` carries the part headings
 * ("Allgemeiner Teil", "Besonderer Teil", and inside the latter the per-Artikel
 * headings), `<ueberschrift typ="erll">` the passage headings — which in the
 * Besonderer Teil read „Zu Z 4 (§ 54c Abs. 1a und 1b):", i.e. the same
 * Novellierungsanordnung-plus-§ address `annexDraft.ts` already computes for
 * the Textgegenüberstellung.
 *
 * FOUR TRAPS, every one of them found by measuring the corpus rather than by
 * reading one document (`pnpm audit:erlaeuterungen`):
 *
 *  1. **A document named "Erläuterungen" is not always Erläuterungen.** Some
 *     ressorts put the Vorblatt and the wirkungsorientierte Folgenabschätzung
 *     into the same file: its parts are then titled „Ziel(e)", „Inhalt",
 *     „Maßnahmen", „Problemanalyse", „Abschätzung der Auswirkungen". Printing
 *     those under the promise „die Begründung des Ministeriums" would show a
 *     form-sheet in place of the reasoning — so a WFA part is recognised and
 *     never stands in for the Allgemeiner Teil.
 *  2. **The part heading is numbered in the wild** („I. Allgemeiner Teil",
 *     „A. Allgemeiner Teil", „B. Besonderer Teil") **and letter-spaced**
 *     („E r l ä u t e r u n g e n", 5 documents in the 2024+ window). RIS
 *     normalises runs of whitespace to one space, so word boundaries are
 *     gone by the time the text arrives here: the headings are therefore
 *     matched with whitespace squeezed out entirely.
 *  3. **A scan is not an empty document.** Where the ressort delivered images,
 *     the XML is nothing but `<absatz typ="abbobj">` with the GIF path in it —
 *     and a path is text, so the first "paragraph" of the Budgetbegleitgesetz
 *     2027-2028 came out as „/Dokumente/Begut/…0001.gif". Figures are dropped
 *     from the prose, which lets `hasReadableText` see the scan for what it is
 *     (the same distinction `isScanned` draws for the Textgegenüberstellung).
 *  4. **One in five documents carries no part heading at all** — 99 of 465 in
 *     the window, and their prose is ordinary reasoning („Um den technischen
 *     Entwicklungen im Bereich der Kleinbadeteiche Rechnung zu tragen …"),
 *     not a form-sheet. Refusing those outright would cost a fifth of the
 *     corpus for a tidier rule, so the reasoning before the Besonderer Teil
 *     stands in — but only where the document holds no WFA part, and the
 *     result is marked `generalInferred`, because a section that the ministry
 *     did not head „Allgemeiner Teil" must not be labelled as if it had.
 */
import { normalizeText } from '../lawtext/normalize'
import { parseRisXml } from '../lawtext/risXml'

/**
 * Which part of the Erläuterungen a section is.
 *
 * `wfa` is the form-sheet half (Vorblatt, wirkungsorientierte
 * Folgenabschätzung); `other` is everything a ressort invents. Both are
 * carried rather than dropped, so a measurement can see what is in there
 * without a second parser — and so the presence of a `wfa` part can veto the
 * inference below.
 */
export type ExplanationsPartKind = 'general' | 'special' | 'wfa' | 'other'

/** One passage: an `erll` heading and the prose under it. */
export interface ExplanationsPassage {
  /** The heading as printed, e.g. „Zu Z 1 (§ 12 Abs. 3):" — null before the first one. */
  heading: string | null
  /**
   * The Artikel heading in force above this passage inside the Besonderer
   * Teil, e.g. „Zu Art. 1 (Änderung des Audiovisuelle Mediendienste-Gesetzes)".
   * Null in the Allgemeiner Teil and in single-law drafts, which carry none.
   */
  article: string | null
  /** §§ named in the heading, normalised to „§ 12", in printed order, deduped. */
  paragraphs: string[]
  /** Novellierungsanordnung numbers named in the heading, normalised to „Z 4". */
  items: string[]
  /** Prose paragraphs, in printed order. */
  text: string[]
}

export interface ExplanationsPart {
  kind: ExplanationsPartKind
  /** The `erlz` heading as printed, null for prose before the first one. */
  heading: string | null
  passages: ExplanationsPassage[]
  /** Characters of prose in this part — the cheap size signal for the page. */
  chars: number
  /**
   * Blocks dropped from `text` because they are table cells or figures. The
   * page must not claim completeness where this is non-zero; it links the
   * document for exactly that reason.
   */
  dropped: number
}

export interface ExplanationsDocument {
  parts: ExplanationsPart[]
  /** The Allgemeiner Teil — labelled by the ministry, or inferred (trap 4). */
  general: ExplanationsPart | null
  /**
   * Whether `general` is the inference rather than a part the ministry headed
   * „Allgemeiner Teil". The page has to say which of the two it is showing:
   * one is a named part of a document, the other is our reading of it.
   */
  generalInferred: boolean
  /** The Besonderer Teil — labelled by the ministry, or divided off (see `divide`). */
  special: ExplanationsPart | null
  /** Whether `special` is the division rather than a part the ministry headed. */
  specialInferred: boolean
  /** Prose characters over the whole document — 0 means a scan or an empty parse. */
  chars: number
}

/**
 * Headings are matched with all whitespace removed — see trap 2. Everything
 * below therefore reads as one run-on word: `allgemeinerteil`.
 */
function squeeze(heading: string): string {
  return heading.toLowerCase().replace(/\s+/g, '')
}

/**
 * Part headings, with the numbering ressorts put in front of them.
 *
 * Deliberately anchored: „Zu Artikel 1 (Änderung des Allgemeinen …)" must not
 * be read as the Allgemeiner Teil, and „Besonderer Teil" occurs inside passage
 * prose often enough that a loose search would open a part mid-sentence.
 */
const PART_PREFIX = String.raw`(?:[ivxlc]+|[a-h]|\d+)?[.)]?`
const GENERAL_RE = new RegExp(`^${PART_PREFIX}allgemeinerteil`)
const SPECIAL_RE = new RegExp(`^${PART_PREFIX}besondererteil`)

/**
 * The document's own title line („Erläuterungen", „ERLÄUTERUNGEN",
 * „Erläuterungen zur Verordnung, mit der …"). It opens nothing; without this
 * it would open an `other` part that swallows the prose of a document whose
 * Allgemeiner Teil is unlabelled — and that prose would then look like a part
 * we had recognised.
 */
const DOC_TITLE_RE = /^erl(ä|ae|a)uterungen/

/**
 * The form-sheet vocabulary: the standard headings of the Vorblatt and of the
 * wirkungsorientierte Folgenabschätzung, which some ressorts deliver inside
 * the Erläuterungen document (trap 1).
 *
 * A prefix list rather than a full-text match, because the long ones vary
 * („Auswirkungen auf die Gleichstellung von Frauen und Männern",
 * „Abschätzung der Auswirkungen auf …"). It is used for two things only:
 * labelling a part, and vetoing the inference — never for hiding anything, so
 * a false positive costs a fallback, not a document.
 */
const WFA_PREFIXES = [
  'vorblatt',
  'ziel',
  'inhalt',
  'maßnahmen',
  'massnahmen',
  'problemanalyse',
  'problemdefinition',
  'abschätzungderauswirkungen',
  'auswirkungenauf',
  'wirkungsorientiertefolgenabschätzung',
  'wfa',
  'interneevaluierung',
  'verhältniszudenrechtsvorschriftender',
]

/**
 * The path of a delivered image, which reaches the parser as ordinary text
 * because the `<src>` of a `<binary>` is a text node (trap 3). Typed blocks
 * catch nearly all of them; this catches the ressort that wrapped one in
 * something else.
 */
const IMAGE_PATH_RE = /^\/?Dokumente\/[\w-]+\/[\w.-]+\.(?:gif|png|jpe?g)$/i

/** „§ 54c", „§§ 12 und 13", „§ 5 Abs. 1" — every § named in a passage heading. */
const PARA_RE = /§+\s*(\d+[a-z]?)/gi
/** „Z 4", „Z 4 und 5" — the Novellierungsanordnung the passage explains. */
const ITEM_RE = /\bZ\s*(\d+[a-z]?)/g
/**
 * „§§ 23 bis 25" — a range, where only the first § carries the symbol.
 *
 * Without this the passage „Zu Z 3 bis 6 (§§ 23 bis 25 NO)" reaches § 23 and
 * leaves §§ 24 and 25 unexplained although the ressort explained them in the
 * same breath. Only plain numbers are expanded: „§§ 140a bis 140i" would need
 * us to invent the letters in between, and inventing designations is exactly
 * what this module does not do.
 */
const PARA_RANGE_RE = /§§\s*(\d+)\s*(?:bis|–|-)\s*(\d+)/gi
/**
 * „§§ 12 und 13", „§§ 4, 5 und 6" — eine Aufzählung, bei der nur der erste
 * Paragraph das Zeichen trägt.
 *
 * Dieselbe Lücke wie beim Bereich darüber und aus demselben Grund gefüllt:
 * Das Ressort erklärt beide Paragraphen in einem Atemzug, und ohne den
 * Ausdruck bekommt nur der erste die Begründung. Anders als beim Bereich
 * wird hier nichts erfunden — jede Nummer steht im Text.
 */
const PARA_LIST_RE = /§§\s*(\d+[a-z]?(?:\s*,\s*\d+[a-z]?)*)\s*(?:und|sowie)\s*(\d+[a-z]?)\b/gi
/** A range longer than this is a citation habit, not an address — 45 of 45 measured ranges are far below. */
const MAX_RANGE = 50

function uniq(values: string[]): string[] {
  return [...new Set(values)]
}

/**
 * Exportiert seit 22.09.2026: Die Erläuterungen der Regierungsvorlage gibt es
 * nur als Word-HTML des Parlaments, nicht als typisiertes RIS-XML, und ein
 * zweiter Ausdruck für dieselbe Adresse wäre eine zweite Gelegenheit, eine
 * Passage an den falschen Paragraphen zu hängen (`explanationsHtml.ts`).
 */
export function addressOf(heading: string): { paragraphs: string[]; items: string[] } {
  const paragraphs = [...heading.matchAll(PARA_RE)].map((m) => `§ ${m[1]!.toLowerCase()}`)
  for (const m of heading.matchAll(PARA_RANGE_RE)) {
    const from = Number(m[1])
    const to = Number(m[2])
    if (to <= from || to - from > MAX_RANGE) continue
    for (let n = from; n <= to; n++) paragraphs.push(`§ ${n}`)
  }
  for (const m of heading.matchAll(PARA_LIST_RE)) {
    for (const part of m[1]!.split(',')) paragraphs.push(`§ ${part.trim().toLowerCase()}`)
    paragraphs.push(`§ ${m[2]!.toLowerCase()}`)
  }
  return {
    paragraphs: uniq(paragraphs),
    items: uniq([...heading.matchAll(ITEM_RE)].map((m) => `Z ${m[1]!.toLowerCase()}`)),
  }
}

/**
 * „Zu Art. 1 (Änderung der Notariatsordnung)" and the bare „Artikel 1" — the
 * Artikel heading of the Besonderer Teil, in the forms ressorts type when they
 * type it as a passage rather than as an `erlz`.
 *
 * Both were measured, not guessed. Without the first, the Berufsrechts-
 * Änderungsgesetz 2024 left all 31 of its passages without a law; without the
 * second, the EU-Batterienverordnung Begleitgesetz left all 56 of its
 * passages without one, because it prints „Artikel 1" and the law's name as
 * two separate lines — the same shape `draftArticles` reads in the draft
 * text itself.
 *
 * Only where the heading names no § of its own: „Zu Art. 2 Z 1 (§ 7)" is a
 * passage about § 7, not a division of the package.
 */
const ARTICLE_HEADING_RE = /^(?:zu\s+)?art(?:ikel)?\.?\s*(?:[0-9]+[a-z]?|[ivxlc]+)\b/i

function kindOf(heading: string): ExplanationsPartKind {
  const squeezed = squeeze(heading)
  if (GENERAL_RE.test(squeezed)) return 'general'
  if (SPECIAL_RE.test(squeezed)) return 'special'
  if (WFA_PREFIXES.some((p) => squeezed.startsWith(p))) return 'wfa'
  return 'other'
}

/**
 * RIS Erläuterungen XML → parts and passages.
 *
 * The block stream comes from `parseRisXml`, the same reader the draft text
 * and the ME→RV comparison use, so the text normalisation is identical and a
 * `<kzinhalt>` page header is already gone. Table cells and figures arrive
 * with a `table:` prefix or without text at all; they are counted, not
 * printed (`dropped`).
 */
export function parseExplanations(xml: string): ExplanationsDocument {
  const blocks = parseRisXml(xml)
  /**
   * A part is open from the first block on, and an empty one is dropped at the
   * end. The alternative — opening parts lazily — makes every access below
   * nullable for one document shape that occurs anyway: prose before any
   * heading, which is how the unlabelled fifth of the corpus arrives.
   */
  let part: ExplanationsPart = { kind: 'other', heading: null, passages: [], chars: 0, dropped: 0 }
  const parts: ExplanationsPart[] = [part]
  let passage: ExplanationsPassage | null = null
  /** The Artikel heading in force — an `erlz` inside the Besonderer Teil. */
  let article: string | null = null

  const newPassage = (heading: string | null): ExplanationsPassage => ({
    heading,
    article,
    ...(heading ? addressOf(heading) : { paragraphs: [], items: [] }),
    text: [],
  })

  for (const block of blocks) {
    const [tag, typ = ''] = block.cls.replace(/^table:/, '').split('/')
    const inTable = block.cls.startsWith('table:')
    const text = block.text.trim()
    if (!text) continue

    if (tag === 'ueberschrift') {
      const kind = kindOf(text)
      // Inside the Besonderer Teil, an `erlz` is the heading of one Artikel —
      // „Zu Art. 2 (Änderung des KommAustria-Gesetzes)" — not a new part.
      if (typ === 'erlz' && part.kind === 'special' && kind === 'other') {
        article = text
        passage = null
        continue
      }
      /**
       * A part heading is normally an `erlz`. Some ressorts type the division
       * one level down instead — „Allgemeiner Teil:" and „Besonderer Teil:" as
       * `erll` (Studienbeitragsverordnung, seen on the page) — and reading
       * those as passages was wrong twice over: the document counted as
       * ungegliedert although it says exactly how it is divided, and its
       * general part then ended on an empty „Besonderer Teil:" heading.
       *
       * Only those two names are promoted. Every other `erll` stays a passage,
       * or every „Kompetenzgrundlage:" would become a part of its own.
       */
      if (typ === 'erlz' || kind === 'general' || kind === 'special') {
        // The document's own title opens nothing, wherever it stands:
        // „Erläuterungen" as a part name would be a part we claim to have
        // recognised.
        if (DOC_TITLE_RE.test(squeeze(text))) continue
        part = { kind, heading: text, passages: [], chars: 0, dropped: 0 }
        parts.push(part)
        passage = null
        article = null
        continue
      }
      // Inside the Besonderer Teil, the Artikel heading may arrive as an
      // ordinary passage heading too — then it divides the package rather
      // than explaining a provision.
      if (part.kind === 'special' && ARTICLE_HEADING_RE.test(text) && !addressOf(text).paragraphs.length) {
        article = text
        passage = null
        continue
      }
      // `erll` and everything else a ressort typed as a heading (`art`, `g1`,
      // `g1min`): a passage opens under it.
      passage = newPassage(text)
      part.passages.push(passage)
      continue
    }
    // Prose. A part that starts without a heading gets an anonymous passage,
    // which is how „Hauptgesichtspunkte" prose before the first `erll` reaches
    // the page at all.
    if (!passage) {
      passage = newPassage(null)
      part.passages.push(passage)
    }
    // A figure carries the GIF path as its text (trap 3), a table cell carries
    // a fragment of a layout. Neither is a sentence of the reasoning.
    if (inTable || typ === 'abbobj' || IMAGE_PATH_RE.test(text)) {
      part.dropped++
      continue
    }
    passage.text.push(text)
    part.chars += text.length
  }

  // The eager first part, where the document opened with a heading after all.
  if (!parts[0]!.passages.length && !parts[0]!.dropped) parts.shift()

  const first = (kind: ExplanationsPartKind): ExplanationsPart | null => parts.find((p) => p.kind === kind) ?? null
  const labelled = first('general')
  const inferred = labelled ? null : inferGeneral(parts)
  const general = labelled ?? inferred
  const special = first('special')
  // Where the ministry typed no „Besonderer Teil", the passages say where it
  // begins — see `divide`.
  const divided = special || !general ? null : divide(general)
  return {
    parts,
    general: divided?.general ?? general,
    generalInferred: !labelled && inferred !== null,
    special: special ?? divided?.special ?? null,
    specialInferred: !special && divided !== null,
    chars: parts.reduce((sum, p) => sum + p.chars, 0),
  }
}

/**
 * „Zu § 1:", „Zu Z 4 (§ 54c Abs. 1a):", „Zu Artikel 1: Erneuerbaren-Ausbau-…"
 * — a passage heading that is an address rather than a topic.
 *
 * Anchored on „Zu" plus a real address, so „Zum Verhältnis zu § 5" and any
 * other prose heading that happens to cite a § stays in the general part.
 */
const ADDRESS_HEADING_RE = /^zu\s+(?:§|z\s*\d|art\b|artikel\b|abs\b|anlage\b)/i

/** Ob eine Überschrift eine Passage des Besonderen Teils eröffnet — geteilt mit `explanationsHtml.ts`. */
export function isAddressHeading(heading: string): boolean {
  return ADDRESS_HEADING_RE.test(normalizeText(heading).trim())
}

/**
 * The boundary inside a document that never typed „Besonderer Teil".
 *
 * A fifth of the drafts head their general prose („Allgemeiner Teil" or
 * nothing at all) and then simply start „Zu § 1:", without a divider in
 * between: the Erneuerbaren-Ausbau-Beschleunigungsgesetz runs 106.262
 * characters that way, 57 passages of which all but three are per-§ commentary.
 * Printing that as „what is this law meant to do" would be the opposite of a
 * triage aid.
 *
 * The Legistische Richtlinien' own convention supplies the cut: the Besonderer
 * Teil is exactly the run of addressed passages. So the part is divided at the
 * first one — and the halves are marked as inferred, because the ministry drew
 * no such line itself.
 */
function divide(general: ExplanationsPart): { general: ExplanationsPart; special: ExplanationsPart } | null {
  let at = general.passages.findIndex((p) => p.heading !== null && ADDRESS_HEADING_RE.test(p.heading))
  if (at <= 0) return null
  // A heading with nothing under it belongs to what follows, not to what
  // precedes: „Zu den einzelnen Bestimmungen:" standing alone at the end of
  // the general part announces the Besonderer Teil rather than closing the
  // general one.
  while (at > 1 && !general.passages[at - 1]!.text.length) at--
  const cut = (passages: ExplanationsPassage[], kind: ExplanationsPartKind, heading: string | null): ExplanationsPart => ({
    kind,
    heading,
    passages,
    chars: passages.reduce((sum, p) => sum + p.text.reduce((n, t) => n + t.length, 0), 0),
    dropped: 0,
  })
  return {
    general: cut(general.passages.slice(0, at), 'general', general.heading),
    special: cut(general.passages.slice(at), 'special', null),
  }
}

/**
 * The reasoning of a document that never says „Allgemeiner Teil" (trap 4):
 * everything before the Besonderer Teil, as one part.
 *
 * Two conditions, and both are refusals rather than guesses. A document that
 * carries a WFA part is out — there the unlabelled prose is as likely to be
 * form-sheet as reasoning, and this function cannot tell. A document whose
 * leading parts carry headings of their own is out too: a ressort that names
 * its parts and does not name one „Allgemeiner Teil" has said something, and
 * overruling it would put „Zu den einzelnen Bestimmungen" under the promise of
 * a general part.
 */
function inferGeneral(parts: ExplanationsPart[]): ExplanationsPart | null {
  if (parts.some((p) => p.kind === 'wfa')) return null
  const specialAt = parts.findIndex((p) => p.kind === 'special')
  const leading = (specialAt === -1 ? parts : parts.slice(0, specialAt)).filter((p) => p.chars > 0)
  if (!leading.length || leading.some((p) => p.heading !== null)) return null
  return {
    kind: 'general',
    heading: null,
    passages: leading.flatMap((p) => p.passages),
    chars: leading.reduce((sum, p) => sum + p.chars, 0),
    dropped: leading.reduce((sum, p) => sum + p.dropped, 0),
  }
}

/**
 * Whether the parse found prose at all.
 *
 * The same failure the Textgegenüberstellung has (`isScanned`): RIS carries
 * some older documents as images with an XML shell around them. There the
 * answer is "we cannot read this one", never an empty section that looks like
 * a draft without reasoning.
 */
export function hasReadableText(doc: ExplanationsDocument): boolean {
  return doc.chars > 0
}

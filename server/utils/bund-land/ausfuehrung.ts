/**
 * Whether a Land's draft carries out something of the Bund's — a
 * Grundsatzgesetz (Art. 12, 14 B-VG) or a Vereinbarung gemäß Art. 15a B-VG
 * — and which act.
 *
 * PURE MODULE — text in, findings out; no Nitro globals, relative imports
 * only. It reads what the Land's EU fact reads (`LandEuInput`): the pages
 * of the documents the Erläuterungen' reader opened and the Erläuterungen'
 * general and particular part. The service (`landBundesrechtService.ts`)
 * and the corpus script (`scripts/corpus/bundLand.ts`) both run it.
 *
 * THE PROTOTYPE'S RULES, PORTED. Unlike
 * the EU case the act is easy and the „whether" is hard: half of all
 * mentions are references, and no Vorblatt sentence decides.
 *
 *  - GRUNDSATZGESETZ, strong: the enacting clause „Der Landtag hat … in
 *    Ausführung des …, BGBl. I Nr. 44/2025, beschlossen:" — only Steiermark
 *    and Kärnten write it. Medium: a sentence that names a Grundsatz term
 *    and either says close by that it is carried out („Umsetzung der
 *    grundsatzgesetzlichen Bestimmungen", „Grundsatzbestimmungen … umzusetzen")
 *    or, with its neighbours, names a change, an execution verb and an act.
 *  - VEREINBARUNG, strong: the fixed forms of § 1 and the Erläuterungen
 *    („zur Umsetzung der Verpflichtungen aus der Vereinbarung gemäß Art. 15a
 *    B-VG …", „Vereinbarung … umgesetzt") and Steiermark's fixed line on
 *    the Volksabstimmung. Medium exists (an execution verb near the
 *    agreement) but is not shipped: it was a third references.
 *  - EXCLUDED: negations and the past („nicht mehr", „außer Kraft",
 *    „ehemalig", „bis 2020"), a pending Bund draft („Begutachtungsentwurf
 *    des Bundes"), a court's ruling, a competence statement without a
 *    citation, and for agreements every reference context (a definition,
 *    funds „aus der Vereinbarung", negotiations).
 *
 * THE ACT IS READ FROM THE SIGNAL'S OWN CLAUSE, never from a bare citation
 * elsewhere: BGBl. I Nr. 50/2025 is cited by 26 drafts in reference lists
 * and carried out by none. Within the clause the segment that names the act
 * („Anstellungserfordernisse-Grundsatzgesetz") decides, and of its Teil-I
 * citations the latest — „…, BGBl. Nr. 406/1968, in der Fassung BGBl. I
 * Nr. 44/2025" is 44/2025, the Kundmachung the Land follows.
 *
 * The sentence a finding rests on travels with it for the measurement and
 * the tests; the endpoint does not print it.
 */
import type { BgblICitation } from '../../../shared/types/bundLand'
import type { LandEuInput } from '../eu/landEuReading'

export type AusfuehrungKind = 'grundsatzgesetz' | 'vereinbarung'
export type AusfuehrungStrength = 'strong' | 'medium'

type BgblCitation = BgblICitation

export interface Ausfuehrung {
  kind: AusfuehrungKind
  strength: AusfuehrungStrength
  /** The sentence or enacting clause the finding rests on — evidence, never printed. */
  sentence: string
  /** Which document it was read from: the index into the documents the reader took. */
  document: number
  /** From the Erläuterungen' parts of that document, rather than its pages. */
  inExplanations: boolean
  act: {
    /**
     * A Grundsatzgesetz's name in the nominative, „Anstellungserfordernisse-
     * Grundsatzgesetz"; an agreement's subject as it follows „B-VG",
     * „über Sozialbetreuungsberufe" or „Zielsteuerung-Gesundheit". Null
     * where the clause names none.
     */
    name: string | null
    /** The Teil-I Kundmachung the clause cites, latest first; null without one. */
    bgbl: BgblCitation | null
    /** The text says „teilweise": only part of the draft carries the act out. */
    partial: boolean
  }
}

/** One document as the reader takes it: its pages where read, and the Erläuterungen where they were read from it. */
export interface AusfuehrungDocument {
  /** The document's address and title, for the credit line; absent in tests. */
  url?: string
  title?: string
  pages: readonly string[] | null
  explanations: { general: readonly { heading: string | null; text: readonly string[] }[]; particular: readonly { law?: string | null; paras?: readonly string[]; heading: string; text: readonly string[] }[] } | null
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

/** A word character as Python's `\w` reads it — JavaScript's is ASCII even with `u`. */
const W = '[\\p{L}\\p{N}_]'
/** Python's `\b` before a word. */
const B = `(?<!${W})`
const WS = /\s+/g

/**
 * Stops that end no sentence: the prototype's list, and since 06.11.2026
 * the Länder' own abbreviations — „… (KAKuG) werden im Oö.
 * Krankenanstaltengesetz umgesetzt“ was cut at „Oö.“ and lost its verb.
 */
const ABBR = '(?:Oö|NÖ|Stmk|Bgld|Ktn|Sbg|Vbg|Tir|Wr|Art|Abs|Nr|BGBl|LGBl|lit|Z|vgl|bzw|ua|zB|gem|iVm|idF|Hrsg|Dr|Mag|Jän|Jan|Dez|Nov|Okt|Sept|Sep|Aug|Jul|Jun|Mai|Apr|Mär|Feb|ca|dh|ds|usw|etc|insb|iSd|leg|cit|S|Rz|Pkt|sog|gg|I|II|III|IV|V|VI|VII|VIII|IX|X|\\d{1,3})'
const ABBR_DOT = new RegExp(`${B}${ABBR}\\.`, 'gu')
/** A stand-in for a protected full stop (ONE DOT LEADER), as the prototype used. */
const HELD = '․'

/** Sentences: abbreviation stops protected, split after .!?: before a capital, a quote or §. */
export function ausfuehrungSentences(text: string): string[] {
  const held = text.replace(ABBR_DOT, (m) => `${m.slice(0, -1)}${HELD}`)
  return held.split(/(?<=[.!?:])\s+(?=[A-ZÄÖÜ„»(§\d])/u).map((p) => p.replaceAll(HELD, '.'))
}

/** Erläuterungen' parts as one text, in the order their fields stand. */
function explanationsText(e: NonNullable<AusfuehrungDocument['explanations']>): string {
  const parts: string[] = []
  for (const g of e.general) parts.push(...(g.heading ? [g.heading] : []), ...g.text)
  for (const p of e.particular) parts.push(...(p.law ? [p.law] : []), ...(p.paras ?? []), p.heading, ...p.text)
  return parts.join('\n')
}

interface Text {
  kind: 'pdf' | 'erl'
  text: string
  document: number
}

function textsOf(docs: readonly AusfuehrungDocument[]): Text[] {
  const out: Text[] = []
  docs.forEach((d, document) => {
    if (d.pages?.length) {
      const t = d.pages.join('\n')
      if (t) out.push({ kind: 'pdf', text: t.replace(WS, ' '), document })
    }
    if (d.explanations) {
      const t = explanationsText(d.explanations)
      if (t) out.push({ kind: 'erl', text: t.replace(WS, ' '), document })
    }
  })
  return out
}

/**
 * The documents in the draft's order, each with its pages and — on the
 * Erläuterungen' own document — their parts: what the EU fact read.
 */
export function ausfuehrungDocumentsOf(input: LandEuInput): AusfuehrungDocument[] {
  const erl = input.explanations.available ? input.explanations : null
  const urls = [...new Set([...input.documents.map((d) => d.url), ...input.pages.keys(), ...(input.draft.url ? [input.draft.url] : [])])]
  return urls
    .map((url) => ({
      url,
      title: input.documents.find((d) => d.url === url)?.title,
      pages: input.pages.get(url) ?? (url === input.draft.url ? input.draft.pages : null),
      explanations: erl && url === erl.url ? { general: erl.general, particular: erl.particular } : null,
    }))
    .filter((d) => d.pages?.length || d.explanations)
}

// ---------------------------------------------------------------------------
// Vocabulary — the prototype's, character for character where JS allows
// ---------------------------------------------------------------------------

const BGBL = /BGBl\.?\s*(I\s*)?Nr\.?\s*(\d+)\s*\/\s*(\d{4})/giu
/** `BGBL` without its global state, for a test. */
const HAS_BGBL = new RegExp(BGBL.source, 'iu')
const GG_TERM = /Grundsatzgesetz|grundsatzgesetzlich|Grundsatzbestimmung|Grundsatzgesetzgebung des Bundes|bundesgesetzlichen? Grundsätze/iu
const GG_ACT_NAME = new RegExp(
  `[A-ZÄÖÜ][\\p{L}\\p{N}_-]*-?Grundsatzgesetz(?:es)?(?:-Novelle)?|Schulorganisationsgesetz(?:es)?|Krankenanstalten- und Kuranstaltengesetz(?:es)?|KAKuG|Vereinbarungsumsetzungsgesetz(?:es)? 2024|VUG 2024|Erneuerbaren-Ausbau-?Beschleunigungsgesetz(?:es)?|Elektrizitätswirtschafts- und -organisationsgesetz(?:es)? 2010|ElWOG 2010|Elektrizitätswirtschaftsgesetz(?:es)?|ElWG(?!${W})`,
  'iu',
)
const CHANGE = /geändert|Änderung|Novelle|novelliert|in Kraft (?:getreten|tritt)|erlassen wurde|neu (?:erlassen|gefasst)|BGBl|Bundesgesetzblatt|kundgemacht|beschlossen/iu
const EXEC = new RegExp(
  `Ausführung(?!${W})|ausgeführt|auszuführen|umgesetzt|Umsetzung|umzusetzen|nachvollz|Anpassung|anzupassen|angepasst|angeglichen|übernommen|übernimmt|zu übernehmen|Übereinstimmung|entspr(?:icht|echen|echend)|setzt|setzen|durchgeführt|Durchführung|Reaktion|erforderlich|notwendig|Anlass|Folge|Rechnung getragen|berücksichtig`,
  'iu',
)
/** Negations, the past, a pending Bund draft, a court: no execution of a law in force. */
const NEG = /nicht Gebrauch|keinen Gebrauch|entfallen|nicht mehr|außer Kraft|aufgehoben|ehemalig|vormals|bis (?:zum )?(?:1\. Jänner )?20(?:19|20)|früher|seinerzeit|weggefallen|Wegfall|keine Vorgabe|noch keine|nicht in Geltung|VfGH|Erkenntnis|handelte|Begutachtungsentwurf (?:zum|des Bundes)|derzeit [^.]{0,40}vorgesehen|Mit LGBl\. Nr\. \d+\/\d{4} wurde/iu
const COMPETENCE_ONLY = /(?:Bundessache|Landessache|Kompetenz(?:grundlage|rechtlich|tatbestand|verteilung)|Zuständigkeit)/iu

/** The enacting clause „Der Landtag hat … in Ausführung des … beschlossen:" (Steiermark, Kärnten). */
const ENACT_GG = new RegExp(`Landtag[^.]{0,40}?${B}hat${'(?!' + W + ')'}[^:]{0,120}?in Ausführung (?:des|der) ([\\s\\S]{0,700}?)\\s*[–-]?\\s*beschlossen:`, 'u')
/** A Grundsatz term within a few words of „carried out". */
const CLOSE = new RegExp(
  `(?:Umsetzung|Ausführung|Durchführung|Anpassung an)\\s+(?:der\\s+|des\\s+|von\\s+|die\\s+)?(?:${W}+\\s+){0,4}?(?:Grundsatzbestimmung|grundsatzgesetzlich|Grundsatzgesetz)|(?:Grundsatzbestimmung${W}*|grundsatzgesetzlich${W}*|Grundsatzgesetz${W}*)\\s+(?:${W}+\\s+){0,5}?(?:umgesetzt|umzusetzen|ausgeführt|auszuführen|nachvollzogen|Rechnung)`,
  'iu',
)

const A15 = /Vereinbarung(?:en)?[^.]{0,60}?(?:gemäß|nach|gem\.)\s*Art(?:ikel|\.)?\s*15\s*a|Art(?:ikel|\.)?\s*15\s*a[^.]{0,20}?-?\s*Vereinbarung|Grundversorgungsvereinbarung|Zielsteuerung-Gesundheit|Bund-Länder-Vereinbarung|Vereinbarung zwischen dem Bund und den Ländern|Änderungsvereinbarung/iu
const STMK_FIXED = /nicht einer Volksabstimmung wegen Umsetzung einer Vereinbarung gemäß Art\.? 15a/iu
const A15_EXEC = new RegExp(
  `Erfüllung(?!${W})|erfüllt|Umsetzung|umgesetzt|umzusetzen|Durchführung|durchgeführt|durchzuführen|nachvollz|Anpassung an|angepasst|anzupassen|entspr(?:icht|echen|echend)|setzt|setzen|Verpflichtungen aus|dient(?!${W})|übernommen|Berücksichtigung|berücksichtig|vorgesehen|legistisch|Umstellung`,
  'iu',
)
/** An agreement named for a definition, its funds, its negotiations — not carried out here. */
const A15_REF = /Begriffsbestimmung|lautet:|Fördermittel|Mitteln der Vereinbarung|Förderung(?:en)? (?:aus|nach)|Zweckzuschuss|Zweckzuschüsse|Fördermöglichkeit|Verhandlungen|noch keine|nicht Gegenstand|Kostenersatz|anzurechnen/iu
const A15_STRONG = new RegExp(
  `(?:zur Umsetzung|Umsetzung|Erfüllung|Durchführung)\\s+(?:der|des)\\s+(?:\\(geänderten\\)\\s+|geänderten\\s+)?(?:Verpflichtungen\\s+aus\\s+der\\s+)?(?:${W}+\\s+){0,3}?Vereinbarung|Verpflichtungen[^;]{0,80}?Vereinbarung[^;]{0,200}?(?:umgesetzt|umzusetzen|erfüllt|durchgeführt)|Vereinbarung[^;]{0,160}?(?:umgesetzt|umzusetzen|nachvollzogen|legistisch)|(?:Durchführungsbestimmungen|Anpassung|Umsetzung) (?:zur|an|der) [^;]{0,60}?Vereinbarung|Änderungsvereinbarung vorgesehenen Anpassungen`,
  'iu',
)

/**
 * A medium finding must say in its own sentence that something is carried
 * out or changed (06.11.2026, after review): the neighbours' words were
 * enough in the prototype, and two norm citations without any such
 * statement would have been published — a numbered list of laws „in der
 * Fassung …“ (bgld-011af, 121/2024) and a quoted norm „Nach § 13 Abs. 1 …
 * Pflichtschulerhaltungs-Grundsatzgesetz … hat für jede … zu bestehen“
 * (ktn-83484, 37/2023).
 */
const CHANGE_STATEMENT = /geändert|novelliert|Novelle|Umsetzung|umgesetzt|umzusetzen|Ausführung|auszuführen|ausgeführt|nachvollz|Anpassung|angepasst|Grundsatzbestimmungen[^.]{0,80}?erlassen/iu
/**
 * „auszuführen“ that means „to explain“: „Zu den grundsatzgesetzlichen
 * Rahmenbedingungen … ist Folgendes auszuführen:“ (ktn-83484) states nothing.
 */
const EXPLAINING = /(?:Folgendes|wie folgt|dazu|hiezu|hierzu)\s+auszuführen/giu
/** A numbered list of citations, „1. … ; 2. …“. */
const ENUMERATION = /(?:^|\s)1\.\s[^;]{3,}?;\s*2\.\s/u
/** Two „in der Fassung“/„idF“ citations in one sentence are a list of laws. */
const IN_DER_FASSUNG = /in der Fassung|idF/giu
/** A norm quoted for its content: „Nach § … <Gesetz> … hat/ist/sind/darf“. */
const NORM_QUOTATION = new RegExp(`^\\s*Nach §[^.]{0,240}?${B}(?:hat|ist|sind|darf)(?!${W})`, 'u')

/** Whether a medium sentence itself states a change or an execution, and is no citation list or norm quotation. */
export function carriesOutInSentence(s: string): boolean {
  if (!CHANGE_STATEMENT.test(s.replace(EXPLAINING, ''))) return false
  if (ENUMERATION.test(s) || (s.match(IN_DER_FASSUNG) ?? []).length >= 2) return false
  return !NORM_QUOTATION.test(s)
}

/** How much of a sentence travels as evidence. */
const EVIDENCE_CHARS = 400

// ---------------------------------------------------------------------------
// The act in the clause
// ---------------------------------------------------------------------------

/** Where one law's citations end and the next law's begin, in a list of laws. */
const SEGMENT_END = /;\s|,\s+(?:des|der|und)\s|\s(?:sowie|und)\s+(?:des|der)\s/u

interface Cite extends BgblCitation {
  at: number
}

/** Teil-I citations, in order, with where each stands. */
function teilICitations(text: string): Cite[] {
  return [...text.matchAll(BGBL)].filter((m) => m[1]).map((m) => ({ number: Number(m[2]), year: Number(m[3]), at: m.index }))
}

/** The latest of several citations: the last Kundmachung, by year then number. */
function latest<C extends BgblCitation>(cites: readonly C[]): C | null {
  let best: C | null = null
  for (const c of cites) if (!best || c.year > best.year || (c.year === best.year && c.number > best.number)) best = c
  return best
}

const plain = (c: BgblCitation | null): BgblCitation | null => (c ? { number: c.number, year: c.year } : null)

const ABBREVIATED: Record<string, string> = {
  KAKuG: 'Krankenanstalten- und Kuranstaltengesetz',
  'VUG 2024': 'Vereinbarungsumsetzungsgesetz 2024',
  'ElWOG 2010': 'Elektrizitätswirtschafts- und -organisationsgesetz 2010',
  ElWG: 'Elektrizitätswirtschaftsgesetz',
}

/** A line break's hyphen before a capital, closed: „Anstellungserfordernisse- Grundsatzgesetz" → „Anstellungserfordernisse-Grundsatzgesetz". */
function closeBreaks(text: string): string {
  return text.replace(/(\p{L})-\s+(?=\p{Lu})/gu, '$1-')
}

/** A law's name in the nominative, a lost hyphen restored: „AnstellungserfordernisseGrundsatzgesetzes" → „Anstellungserfordernisse-Grundsatzgesetz". */
export function nominativeName(raw: string): string {
  const joined = raw.replace(/(\p{Ll})(\p{Lu}\p{Ll})/gu, '$1-$2').replace(/-Novelle$/u, '')
  const name = joined.replace(/gesetzes(?=\s|$)/u, 'gesetz')
  return ABBREVIATED[name] ?? name
}

/** Every law name in a text, with where it stands. */
function namesIn(text: string): { name: string; at: number }[] {
  return [...text.matchAll(new RegExp(GG_ACT_NAME.source, 'giu'))].map((m) => ({ name: m[0], at: m.index }))
}

/**
 * The act a Grundsatz clause names. The clause is cut into one segment per
 * law of a list; the segment that names a law and cites a Teil-I
 * Kundmachung decides (else the first that cites one), and of its
 * citations the latest. The name is the one standing last before that
 * citation — „… des mit dem VUG 2024 novellierten Kranken- und
 * Kuranstaltengesetz - KAKuG, BGBl. Nr. 1/1957, in der Fassung … BGBl. I
 * Nr. 24/2024" is the KAKuG's —, else the first named after it („mit BGBl.
 * I Nr. 2/2026 bewirkten Novelle des Schulorganisationsgesetzes").
 */
export function grundsatzActOf(clause: string): { name: string | null; bgbl: BgblCitation | null } {
  const segments = closeBreaks(clause).split(SEGMENT_END)
  const seg = segments.find((s) => namesIn(s).length && teilICitations(s).length) ?? segments.find((s) => teilICitations(s).length) ?? null
  if (!seg) {
    const first = namesIn(closeBreaks(clause))[0]
    return { name: first ? nominativeName(first.name) : null, bgbl: null }
  }
  const cite = latest(teilICitations(seg))!
  const names = namesIn(seg)
  const before = names.filter((n) => n.at < cite.at).at(-1)
  const name = before ?? names[0] ?? namesIn(closeBreaks(clause))[0]
  return { name: name ? nominativeName(name.name) : null, bgbl: plain(cite) }
}

/** An agreement's subject, as it follows „Art. 15a B-VG": „über Sozialbetreuungsberufe", „Zielsteuerung-Gesundheit". */
const A15_SUBJECT = /Art(?:ikel|\.)?\s*15\s*a\s*B-VG(?:\s+zwischen dem Bund und den Ländern)?\s+(über\s+[^,;()„"“.]{3,160}?|Zielsteuerung-Gesundheit)(?=\s*[,;()„"“.]|\s+(?:geändert|umgesetzt|werden|wird|ist|sind|vorgesehen|kundgemacht|BGBl|LGBl|sowie|und den|geschuldeten|vorgesehenen|festgelegten|enthaltenen|getroffenen)(?![\p{L}\p{N}_])|\s*$)/u

export function vereinbarungActOf(sentence: string): { name: string | null; bgbl: BgblCitation | null } {
  const m = A15_SUBJECT.exec(closeBreaks(sentence))
  return { name: m ? m[1]!.trim() : null, bgbl: plain(latest(teilICitations(sentence))) }
}

const PARTIAL = /teilweise/iu

// ---------------------------------------------------------------------------
// The two readings
// ---------------------------------------------------------------------------

function grundsatzSignal(texts: readonly Text[]): Ausfuehrung | null {
  let best: Omit<Ausfuehrung, 'kind'> | null = null
  for (const { kind, text, document } of texts) {
    const m = kind === 'pdf' ? ENACT_GG.exec(text.slice(0, 6000)) : null
    if (m) {
      const act = grundsatzActOf(m[1]!)
      return { kind: 'grundsatzgesetz', strength: 'strong', sentence: m[0].replace(WS, ' ').slice(0, EVIDENCE_CHARS), document, inExplanations: false, act: { ...act, partial: PARTIAL.test(m[0]) } }
    }
    const ss = ausfuehrungSentences(text)
    for (let i = 0; i < ss.length; i++) {
      const s = ss[i]!
      if (!GG_TERM.test(s) || NEG.test(s)) continue
      const ctx = ss.slice(Math.max(0, i - 1), i + 2).join(' ')
      const close = CLOSE.test(s)
      const hasChange = CHANGE.test(ctx)
      const hasExec = EXEC.test(ctx)
      const cited = HAS_BGBL.test(ctx)
      const hasAct = cited || GG_ACT_NAME.test(ctx)
      let take = false
      if (close && !NEG.test(ctx)) take = true
      else if (hasChange && hasExec && hasAct && !(COMPETENCE_ONLY.test(s) && !cited)) take = true
      if (!take || !carriesOutInSentence(s)) continue
      const act = grundsatzActOf(s)
      const cand = { strength: 'medium' as const, sentence: s.slice(0, EVIDENCE_CHARS), document, inExplanations: kind === 'erl', act: { ...act, partial: PARTIAL.test(s) } }
      // The first finding stands, unless a later one cites the act and it did not.
      if (!best || (act.bgbl && !best.act.bgbl)) best = cand
    }
  }
  return best ? { kind: 'grundsatzgesetz', ...best } : null
}

function vereinbarungSignal(texts: readonly Text[]): Ausfuehrung | null {
  type Hit = { strength: AusfuehrungStrength; sentence: string; document: number; inExplanations: boolean }
  const found = ({ strength, sentence: s, document, inExplanations }: Hit): Ausfuehrung => ({
    kind: 'vereinbarung',
    strength,
    document,
    inExplanations,
    sentence: s.slice(0, EVIDENCE_CHARS),
    act: { ...vereinbarungActOf(s), partial: PARTIAL.test(s) },
  })
  let best: Hit | null = null
  for (const { kind, text, document } of texts) {
    const hit = (strength: AusfuehrungStrength, sentence: string): Hit => ({ strength, sentence, document, inExplanations: kind === 'erl' })
    const ss = ausfuehrungSentences(text)
    for (let i = 0; i < ss.length; i++) {
      const s = ss[i]!
      if (STMK_FIXED.test(s)) return found(hit('strong', s))
      if (!A15.test(s) || A15_REF.test(s) || NEG.test(s)) continue
      const next = ss[i + 1]
      const ctx = `${s} ${next !== undefined && !A15_REF.test(next) ? next : ''}`
      if (A15_STRONG.test(ctx)) {
        // In the title or § 1 of the draft itself, the first strong finding decides.
        if (kind === 'pdf' && i < 40) return found(hit('strong', s))
        if (best?.strength !== 'strong') best = hit('strong', s)
      } else if (!best && A15_EXEC.test(s)) {
        best = hit('medium', s)
      }
    }
  }
  return best ? found(best) : null
}

/** Everything the reader finds, strong and medium — the measurement's view. */
export function readAusfuehrungAll(docs: readonly AusfuehrungDocument[]): Ausfuehrung[] {
  const texts = textsOf(docs)
  return [grundsatzSignal(texts), vereinbarungSignal(texts)].filter((a): a is Ausfuehrung => a !== null)
}

/**
 * What the page shows: a Grundsatzgesetz strong or medium, an agreement
 * only in its fixed, strong forms (medium was a third references).
 */
export function isShown(a: Pick<Ausfuehrung, 'kind' | 'strength'>): boolean {
  return a.kind === 'grundsatzgesetz' || a.strength === 'strong'
}

/** The findings the page shows (`isShown`). */
export function readAusfuehrung(docs: readonly AusfuehrungDocument[]): Ausfuehrung[] {
  return readAusfuehrungAll(docs).filter(isShown)
}

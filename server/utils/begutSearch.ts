/**
 * Wo ein Stichwort in einem Entwurfsdokument steht — die Fundstelle zur
 * Volltextsuche (docs/architecture.md §12.31).
 *
 * PURE MODULE — relative imports only, so vitest runs it directly.
 *
 * WARUM ES DIESES MODUL ÜBERHAUPT GIBT. Die Suche selbst macht das RIS: sein
 * `Suchworte` durchsucht den Volltext aller Dokumente eines Datensatzes und
 * ist damit eine Fähigkeit, die wir nicht nachbauen müssen. Was es NICHT
 * zurückgibt, ist die Fundstelle — die Antwort ist der gewöhnliche
 * Metadatensatz, ohne Trefferstelle, ohne Textausschnitt. Gemessen am
 * 18.09.2026 über 79 Treffer aus fünf Stichworten: bei „Fahrrad" steht das
 * Wort nur in 7 von 20 Treffern im Entwurfstext und in 16 von 20 in den
 * Erläuterungen. Eine Trefferliste ohne Fundstelle behauptet deshalb für
 * jeden dritten Treffer etwas anderes, als der Leser annimmt — „das Gesetz
 * handelt davon", wo das Ressort es nur in seiner Begründung streift.
 *
 * Die Fundstelle ist also nicht Zierde, sondern das, was einen Treffer von
 * einer Vermutung unterscheidet. Sie wird hier aus denselben Blöcken
 * gelesen, die auch die Gegenüberstellung liest (`lawText.parseRisXml`) —
 * derselbe Parser, dieselbe Textform, also dieselbe Auskunft wie auf der
 * Entwurfsseite —, und seit 21.09.2026 notfalls aus dem PDF desselben
 * Dokuments (`blocksFromPlainText`), weil das XML kürzt, wo das PDF alles
 * hat.
 *
 * WORTGRENZEN, weil das RIS sie hat. „Klimaschut" findet nichts, und
 * `Klimaschutz*` findet 491 statt 453 Sätzen — das RIS sucht ganze Wörter
 * und kennt den Stern als Trunkierung. Diese Suche spiegelt beides, sonst
 * fände sie im Dokument nicht, was das RIS im selben Dokument gefunden hat.
 *
 * `loose` ist der Notnagel dafür, und er ist ein PARAMETER, kein zweiter
 * Durchgang in dieser Funktion. Der Unterschied ist nicht kosmetisch: Ein
 * Satz hat mehrere Dokumente, und sie werden in einer Rangfolge gelesen
 * (`begutSearchService.DOCUMENT_ORDER`). Suchte jedes Dokument erst streng
 * und dann als Teilstring, gewänne ein Entwurfstext mit „Klimaschutzgesetz"
 * gegen die Erläuterungen, in denen „Klimaschutz" wirklich steht — die
 * Fundstelle wäre falsch, und zwar zugunsten des stärksten Dokuments. Der
 * Aufrufer geht deshalb ZWEIMAL über alle Dokumente: erst streng, dann
 * großzügig. Lieber eine Fundstelle zu großzügig als die Auskunft „das Wort
 * steht in einem Dokument, wir wissen nicht wo", die wir nachweislich
 * widerlegen könnten — aber nie im falschen Dokument.
 */
import type { TextBlock } from './lawText'
import { normalizeText } from './lawText'
import { stripMinistryMentions, type MinistryToken } from './searchHaystack'

/** Ein Suchwort, wie der Leser es eingegeben hat. */
export interface SearchTerm {
  /** Kleingeschrieben, ohne Stern und ohne Anführungszeichen. */
  text: string
  /** Mit Stern eingegeben: „Klimaschutz*" trifft auch „Klimaschutzgesetz". */
  prefix: boolean
}

/**
 * Mehr Wörter helfen niemandem und kosten Regexe: Das RIS verknüpft sie mit
 * UND, ab dem vierten ist die Treffermenge ohnehin leer.
 */
const MAX_TERMS = 6
/** Kürzer als zwei Zeichen ist kein Stichwort, sondern ein Tippfehler. */
const MIN_TERM_LEN = 2
/** Zeichen links und rechts der Fundstelle. Zwei Zeilen auf dem Telefon. */
const SNIPPET_RADIUS = 90

/**
 * Die Eingabe in Suchwörter.
 *
 * Anführungszeichen fallen weg, statt eine Phrasensuche zu versprechen: das
 * RIS kennt keine — `"Klimaschutz"` liefert exakt dieselben 453 Sätze wie
 * `Klimaschutz` —, und ein Werkzeug, das Anführungszeichen entgegennimmt und
 * ignoriert, lügt leiser als eines, das sie ablehnt.
 */
export function parseSearchQuery(raw: string): SearchTerm[] {
  const out: SearchTerm[] = []
  for (const word of normalizeText(raw).split(/\s+/)) {
    const bare = word.replace(/["'„“”‚‘’»«›‹]/g, '')
    const prefix = bare.endsWith('*')
    const text = (prefix ? bare.slice(0, -1) : bare).toLowerCase()
    if (text.length < MIN_TERM_LEN) continue
    if (out.some((t) => t.text === text)) continue
    out.push({ text, prefix })
    if (out.length === MAX_TERMS) break
  }
  return out
}

/** Die Suchwörter wieder als das, was ans RIS geht. */
export function searchQueryString(terms: readonly SearchTerm[]): string {
  return terms.map((t) => (t.prefix ? `${t.text}*` : t.text)).join(' ')
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Ein Suchwort als Regex — ganzes Wort, außer der Stern sagt etwas anderes.
 *
 * Die Grenzen sind Lookarounds auf Buchstaben und Ziffern, nicht `\b`: `\b`
 * kennt Umlaute nicht als Wortzeichen, und „für" würde mitten im Wort
 * treffen.
 */
function termRe(term: SearchTerm, loose: boolean): RegExp {
  const body = escapeRe(term.text)
  if (loose) return new RegExp(body, 'iu')
  const tail = term.prefix ? '[\\p{L}\\p{N}]*' : ''
  return new RegExp(`(?<![\\p{L}\\p{N}])${body}${tail}(?![\\p{L}\\p{N}])`, 'iu')
}

/** Trifft das Suchwort in diesem Text, und wo? Null, wenn nicht. */
function findTerm(text: string, term: SearchTerm, loose: boolean): { at: number; len: number } | null {
  const m = termRe(term, loose).exec(text)
  return m ? { at: m.index, len: m[0].length } : null
}

/** Der Textausschnitt um eine Fundstelle, in drei Teilen. */
interface SearchSnippet {
  /** Was links davon steht, vorn mit „…", wenn abgeschnitten. */
  before: string
  /** Das gefundene Wort, in der Schreibweise des Dokuments. */
  match: string
  /** Was rechts davon steht, hinten mit „…", wenn abgeschnitten. */
  after: string
}

// --- Measured surface: exported for tests and harness scripts, not for the app. ---
/**
 * Der Ausschnitt um eine Fundstelle, an Wortgrenzen geschnitten.
 *
 * Drei Teile statt eines markierten Strings, damit die Seite die Marke
 * selbst setzt: ein `<mark>` aus dem Server wäre HTML aus Nutzereingabe,
 * und die einzige sichere Fassung davon ist die, die es nicht gibt.
 *
 * `radius` is a test seam: no caller varies it.
 */
export function buildSnippet(text: string, at: number, len: number, radius = SNIPPET_RADIUS): SearchSnippet {
  const from = Math.max(0, at - radius)
  const to = Math.min(text.length, at + len + radius)
  let before = text.slice(from, at)
  let after = text.slice(at + len, to)
  // An der Wortgrenze schneiden, aber nur, wenn überhaupt gekürzt wurde —
  // sonst frisst der Schnitt das erste Wort eines Absatzes.
  if (from > 0) {
    const cut = before.indexOf(' ')
    before = `…${cut >= 0 ? before.slice(cut) : before}`
  }
  if (to < text.length) {
    const cut = after.lastIndexOf(' ')
    after = `${cut >= 0 ? after.slice(0, cut) : after}…`
  }
  return { before, match: text.slice(at, at + len), after }
}

/** Wo in einem Dokument das Stichwort steht. */
interface SearchLocation {
  /**
   * Die Bezeichnung der Stelle, wie das Dokument sie führt: „§ 5." im
   * Entwurfstext, „Zu § 5:" in den Erläuterungen. Null, wo das Dokument bis
   * dorthin keine trägt.
   */
  designation: string | null
  snippet: SearchSnippet
}

/** Blöcke, die keine Fundstelle sein dürfen. */
function skipBlock(b: TextBlock): boolean {
  // Ein Inhaltsverzeichnis wiederholt die Überschriften des Dokuments. Ein
  // Treffer dort ist immer die Dublette eines Treffers weiter unten — und
  // die schlechtere von beiden, weil sie keinen Satz zeigt.
  return b.kind === 'toc'
}

/** Trägt dieser Block eine Bezeichnung, die als Fundstelle taugt? */
function designationOf(b: TextBlock): string | null {
  if (b.gld) return b.gld
  if (b.kind === 'para_head' || b.kind === 'section' || b.kind === 'article') return b.text || null
  return null
}

/**
 * Die erste Stelle, an der das Dokument die Suchwörter zeigt.
 *
 * Bevorzugt einen Block, der ALLE Wörter trägt — das RIS verknüpft sie mit
 * UND, also ist der Absatz, in dem sie zusammen stehen, der gemeinte. Gibt
 * es keinen, zählt der erste Block mit irgendeinem von ihnen: Die Wörter
 * können über das Dokument verteilt sein, und dann ist ein Satz mit einem
 * davon immer noch die Antwort auf „kommt mein Thema vor?".
 */
export function locateInBlocks(
  blocks: readonly TextBlock[],
  terms: readonly SearchTerm[],
  loose = false,
): SearchLocation | null {
  if (!terms.length) return null
  let designation: string | null = null
  let fallback: SearchLocation | null = null
  for (const b of blocks) {
    const own = designationOf(b)
    if (own) designation = own
    if (skipBlock(b) || !b.text) continue
    const found = terms.map((t) => findTerm(b.text, t, loose)).filter((h) => h !== null)
    if (!found.length) continue
    const first = found.reduce((a, h) => (h.at < a.at ? h : a))
    const here: SearchLocation = { designation, snippet: buildSnippet(b.text, first.at, first.len) }
    if (found.length === terms.length) return here
    fallback ??= here
  }
  return fallback
}

/* ------------------------------------------------------------------ *
 * Zwei Textquellen, ein Blockformat
 * ------------------------------------------------------------------ */

/** So lang darf ein Block aus PDF-Text werden, bevor der nächste anfängt. */
const PDF_BLOCK_MAX = 400

/**
 * PDF-Text als Blöcke — die zweite Quelle für dieselbe Fundstelle
 * (docs/architecture.md §12.31).
 *
 * WARUM ES SIE GIBT: Das XML eines Begleitschreibens ist ein Stummel. Beim
 * DGAV-Entwurf hat es 943 Zeichen, das PDF desselben Dokuments 12.223 — und
 * nur dort steht der Verteiler, auf den das RIS getroffen hat. Dieselbe
 * Lehre wie bei den Beilagen: Der Text war nie weg, gelesen wurde das
 * Format, das ihn weggeworfen hat.
 *
 * ZEILEN WERDEN GEBÜNDELT, weil ein PDF keine Absätze kennt, sondern
 * Zeilenumbrüche. Einzelne Zeilen als Blöcke hätten zwei Fehler: Eine
 * UND-Suche fände ihre Wörter nie zusammen in einem Block, und der
 * Ausschnitt bräche mitten im Satz ab. Gebündelt wird nach Zeichenzahl und
 * nicht nach Semantik — eine Grammatik des Schriftsatzes gibt es hier nicht,
 * und der Ausschnitt schneidet ohnehin ±90 Zeichen um die Fundstelle.
 *
 * `kind: 'other'`, `gld: null`: Ein PDF trägt keine Gliederungssymbole, die
 * wir sicher zuordnen könnten. Die Zeile sagt dann „im Begleitschreiben"
 * ohne Paragraph — weniger, als das XML hergibt, aber nichts Erfundenes.
 *
 * `maxLen` is a test seam: no caller varies it.
 */
export function blocksFromPlainText(text: string, maxLen = PDF_BLOCK_MAX): TextBlock[] {
  const blocks: TextBlock[] = []
  let current = ''
  const flush = (): void => {
    const t = current.trim()
    if (t) blocks.push({ kind: 'other', cls: 'pdf', text: t, gld: null })
    current = ''
  }
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) {
      flush()
      continue
    }
    if (current.length + trimmed.length > maxLen) flush()
    current = current ? `${current} ${trimmed}` : trimmed
  }
  flush()
  return blocks
}

/**
 * Dieselben Blöcke ohne die Ressortnennungen.
 *
 * DER VERTEILER IST KEIN SACHTREFFER. Jedes Begleitschreiben listet alle
 * Ministerien als Empfänger, jedes Dokument trägt die Unterschriftszeile
 * seines Hauses — „klima" steht damit in Dokumenten, die von Druckgeräten
 * handeln. Gemessen am 21.09.2026: Von den 7 RIS-Treffern zu „klima" sind 3
 * reine Ressortnennungen.
 *
 * Gestrichen wird VOR der Suche, nicht danach, damit die Fundstelle auf die
 * SACHSTELLE zeigt, wo es beide gibt: Im Klimagesetz stand als Beleg die
 * Aufzählung der Ministerien in § 5, obwohl das Dokument das Wort 164-mal
 * führt.
 *
 * Was hier NICHT fällt, ist die Ressortnennung ohne Ministeranrede — und das
 * ist Absicht: Die UVP-G-Novelle ersetzt in dutzenden §§ die Wortfolge „für
 * Klimaschutz, Umwelt, Energie …" durch die neue. Dort IST der Name der
 * Gegenstand (`searchHaystack.ts`).
 */
export function withoutMinistryMentions(
  blocks: readonly TextBlock[],
  tokens: readonly MinistryToken[],
): TextBlock[] {
  if (!tokens.length) return [...blocks]
  return blocks.map((b) => ({ ...b, text: stripMinistryMentions(b.text, tokens) }))
}

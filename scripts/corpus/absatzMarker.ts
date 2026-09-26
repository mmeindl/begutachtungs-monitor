#!/usr/bin/env vite-node
/**
 * Wo die Lesefassung gliedern darf: welche Gliederungsmarken ein reiner
 * Textblick zurückgewinnt, und was er dabei erfindet
 * (docs/architecture.md §12.12a).
 *
 * Usage:  npx vite-node scripts/corpus/absatzMarker.ts -- [--limit=300] [--laws=40] [--paras=0]
 *
 * **Warum es diese Messung braucht.** `bodyText` in `lawtext/konsTree.ts`
 * trennt jeden Block des Baums mit einem Zeilenumbruch — der Baum weiß genau,
 * wo ein Absatz, eine Ziffer, eine Litera anfängt. Der Wortdiff darüber
 * zerlegt an `\s+` und normalisiert damit den Umbruch weg, also kommt die
 * Gliederung als Segmentliste ohne sie auf der Seite an. `app/utils/absaetze.ts`
 * gewinnt heute genau eine Klasse zurück: `(1)`, `(2a)`. Ein Paragraph, der
 * keine Absatznummern führt, aber Ziffern, steht deshalb als Wand — § 111
 * RStDG, 2.792 Zeichen, bei 390 px rund 40 Zeilen.
 *
 * **Warum es nicht einfach eine zweite Regel ist.** `(1)` ist
 * selbstbegrenzend, `1.` nicht: „mit 1. Jänner 2027 in Kraft" trägt dieselbe
 * Form mitten im Satz, und eine Regel, die dort trennt, zerreißt einen Satz
 * des geltenden Rechts. Ob das die Ausnahme oder der Normalfall ist,
 * entscheidet keine Überlegung, sondern der Korpus.
 *
 * **Das Orakel liegt im Text selbst.** `bodyText` ist die Wahrheit — jeder
 * `\n` darin IST eine Blockgrenze, vom Baum gesetzt. Die Anzeige sieht
 * denselben Text ohne Umbrüche. Also: Umbrüche entfernen, die Kandidatenregel
 * darauf laufen lassen, und ihre Trennstellen gegen die des Baums halten. Das
 * misst genau das, was die Seite tut, ohne dass eine zweite Lesung des RIS-XML
 * dazwischenliegt.
 *
 * **Was nie zurückzugewinnen ist, wird getrennt gezählt.** Ein Schlussteil und
 * ein Satzblock ohne eigene Marke haben im Text kein Zeichen, an dem man sie
 * erkennen könnte. Sie stehen als `unmarkiert` in der Bilanz, damit die
 * Deckung einer Regel nicht an einer Obergrenze gemessen wird, die es nicht
 * gibt.
 */
import { blockStarts } from '../../app/utils/absaetze'
import { bodyText, type LawNode } from '../../server/utils/lawtext/konsTree'
import { draftArticles } from '../../server/utils/lawtext/draftArticles'
import { parseRisXml } from '../../server/utils/lawtext/risXml'
import { resolveLawByBgbl, type KonsLawAtDate } from '../../server/utils/ris/konsLaw'
import { fetchParagraphTree } from '../../server/utils/harness/risKonsHistory'
import { installFetchCache } from '../lib/harnessCache'
import { argAssigned } from '../lib/args'
import { pool } from '../lib/async'
import { getText, risJson as risQuery } from '../lib/http'
import { asArray } from '../lib/ris'

installFetchCache(process.env.HARNESS_CACHE ?? '.harness-cache')
const SCRIPT = 'corpus/absatzMarker'

/* eslint-disable @typescript-eslint/no-explicit-any */
const risJson = (params: Record<string, string>): Promise<any> => risQuery(params, { script: SCRIPT })

// ---------------------------------------------------------------------------
// Die Kandidatenregeln
// ---------------------------------------------------------------------------

/**
 * Die Regel, die AUSGELIEFERT wird, ist importiert und nicht nachgebaut
 * (`app/utils/absaetze.ts`). Eine Messung, die eine Kopie misst, berichtet
 * den Ertrag der Seite nicht — derselbe Grund, aus dem
 * `corpus/innerElision.ts` seit 26.09.2026 die Prüfung des Servers aufruft.
 *
 * Die widerlegten Varianten stehen dagegen HIER, weil es sie sonst nirgends
 * mehr gibt: eine Messung ohne Ausgangspunkt ist keine.
 */
const ABS_RE = /^\(\d+[a-z]?\)$/
const Z_RE = /^(\d+)([a-z]*)\.$/
const LIT_RE = /^([a-z]{1,2})\)$/

/** Eine Regel entscheidet je Wort, ob davor ein neuer Block anfängt. */
type Rule = (tokens: string[]) => Set<number>

function absatzOnly(tokens: string[]): Set<number> {
  const out = new Set<number>()
  for (const [i, t] of tokens.entries()) if (i > 0 && ABS_RE.test(t)) out.add(i)
  return out
}

/** Jede Wortform `n.` trennt — die naive Regel, als Ausgangspunkt. */
function withNaiveZiffern(tokens: string[]): Set<number> {
  const out = absatzOnly(tokens)
  for (const [i, t] of tokens.entries()) if (i > 0 && Z_RE.test(t)) out.add(i)
  return out
}

/** Aufsteigende Folgen von Marken ab der ersten — der Kern der Regel, ohne die Ausnahmen. */
function ascending(tokens: string[], re: RegExp, valueOf: (m: RegExpExecArray) => number, first: number): number[] {
  const out: number[] = []
  let run: number[] = []
  let expected = first
  const flush = (): void => {
    if (run.length >= 2) out.push(...run)
    run = []
  }
  for (const [i, t] of tokens.entries()) {
    if (i === 0) continue
    const m = re.exec(t)
    if (!m) continue
    const n = valueOf(m)
    const repeats = n === expected - 1 && Boolean(m[2])
    if (n === expected || repeats) {
      run.push(i)
      expected = n + 1
    } else if (n === first) {
      flush()
      run.push(i)
      expected = n + 1
    } else {
      flush()
      expected = first
    }
  }
  flush()
  return out
}

/** Nur aufsteigende Ziffern ab 1 — der Vorschlag aus `TODO.md` § 5d, ungeprüft. */
function ascendingZiffern(tokens: string[]): Set<number> {
  const out = absatzOnly(tokens)
  for (const i of ascending(tokens, Z_RE, (m) => Number(m[1]), 1)) out.add(i)
  return out
}

/** Dazu die Litera, ebenfalls als aufsteigende Folge ab „a)". */
function ascendingZiffernAndLitera(tokens: string[]): Set<number> {
  const out = ascendingZiffern(tokens)
  for (const i of ascending(tokens, LIT_RE, (m) => m[0]!.charCodeAt(0), 'a'.charCodeAt(0))) out.add(i)
  return out
}

/**
 * Die verworfene Verschärfung: zusätzlich verlangen, dass das Wort DAVOR
 * einen Block abschließt. Gemessen und nicht übernommen — sie kostet echte
 * Grenzen und spart gegenüber den Ausnahmen keine Erfindung mehr.
 */
const CLOSES_RE = /[:;,.!?]["')“”»]?$/
const REFERENCE_BEFORE = new Set(['Abs.', 'Z', 'Ziffer', 'Ziffern', '§', '§§', 'Art.', 'Artikel', 'lit.', 'Nr.', 'Anlage', 'Anl.', 'Abschnitt', 'Teil', 'Hauptstück', 'vom', 'am', 'ab', 'bis', 'dem', 'mit', 'seit', 'des', 'zum', 'zur'])
const CONNECTORS = new Set(['und', 'oder', 'sowie', 'beziehungsweise', 'bzw.'])

function ascendingChecked(tokens: string[]): Set<number> {
  const out = new Set<number>()
  for (const i of ascendingZiffernAndLitera(tokens)) {
    const prev = tokens[i - 1]!
    if (ABS_RE.test(tokens[i]!)) {
      out.add(i)
      continue
    }
    if (REFERENCE_BEFORE.has(prev)) continue
    if (CLOSES_RE.test(prev) || CONNECTORS.has(prev) || ABS_RE.test(prev) || Z_RE.test(prev) || LIT_RE.test(prev)) out.add(i)
  }
  return out
}

const RULES: [string, Rule][] = [
  ['heute — nur (1)', absatzOnly],
  ['jede Form n.', withNaiveZiffern],
  ['aufsteigende Ziffern ab 1', ascendingZiffern],
  ['dazu Litera', ascendingZiffernAndLitera],
  ['dazu die Ausnahmen (ausgeliefert)', blockStarts],
  ['stattdessen: Wort davor schließt ab', ascendingChecked],
]

// ---------------------------------------------------------------------------
// Das Orakel: die Blockgrenzen, die der Baum gesetzt hat
// ---------------------------------------------------------------------------

interface Truth {
  tokens: string[]
  /** Wortnummern, vor denen `bodyText` umgebrochen hat. */
  breaks: Set<number>
  /** Davon jene, deren erstes Wort überhaupt eine Marke ist — die erreichbare Obergrenze. */
  marked: Map<number, MarkClass>
}

/** `bodyText` in seine Wörter und seine wahren Blockgrenzen zerlegt. */
function truthOf(node: LawNode): Truth {
  const text = bodyText(node)
  const tokens: string[] = []
  const breaks = new Set<number>()
  const marked = new Map<number, MarkClass>()
  // Getrennt an jedem Weißraum, wie `displayTokens`; gemerkt wird nur, ob in
  // der übersprungenen Strecke ein Umbruch stand.
  for (const line of text.split('\n')) {
    const words = line.split(/\s+/).filter(Boolean)
    if (words.length === 0) continue
    if (tokens.length > 0) {
      breaks.add(tokens.length)
      const first = words[0]!
      const cls: MarkClass | null = ABS_RE.test(first) ? 'abs' : Z_RE.test(first) ? 'z' : LIT_RE.test(first) ? 'lit' : null
      if (cls) marked.set(tokens.length, cls)
    }
    tokens.push(...words)
  }
  return { tokens, breaks, marked }
}

// ---------------------------------------------------------------------------
// Die Bilanz
// ---------------------------------------------------------------------------

type MarkClass = 'abs' | 'z' | 'lit'

interface Score {
  /** Echte Grenzen mit Marke, die die Regel findet. */
  hit: number
  /** Echte Grenzen mit Marke, die sie übersieht. */
  miss: number
  /** Übersehene Grenzen nach Art der Marke — sagt, WAS eine Regel liegen lässt. */
  missBy: Record<MarkClass, number>
  /** Trennstellen, an denen der Baum keine Grenze kennt — die gefährliche Klasse. */
  invented: number
  /** Paragraphen, in denen die Regel mindestens eine Stelle erfindet. */
  paragraphsWithInvention: number
  examples: string[]
}
const emptyScore = (): Score => ({ hit: 0, miss: 0, missBy: { abs: 0, z: 0, lit: 0 }, invented: 0, paragraphsWithInvention: 0, examples: [] })

const scores = new Map<string, Score>(RULES.map(([name]) => [name, emptyScore()]))

const totals = {
  laws: 0,
  paragraphs: 0,
  /** Paragraphen ohne jede Absatzmarke — die Wand, um die es geht. */
  withoutAbsatz: 0,
  /** Davon jene, die Ziffern führen: was die neue Regel überhaupt retten kann. */
  withoutAbsatzWithZiffern: 0,
  breaks: 0,
  markedBreaks: 0,
}

function scoreParagraph(label: string, kurztitel: string, node: LawNode): void {
  const { tokens, breaks, marked } = truthOf(node)
  if (tokens.length === 0) return
  totals.paragraphs++
  totals.breaks += breaks.size
  totals.markedBreaks += marked.size
  const hasAbsatz = tokens.some((t) => ABS_RE.test(t))
  const hasZiffer = tokens.some((t) => Z_RE.test(t))
  if (!hasAbsatz) {
    totals.withoutAbsatz++
    if (hasZiffer) totals.withoutAbsatzWithZiffern++
  }

  for (const [name, rule] of RULES) {
    const s = scores.get(name)!
    const found = rule(tokens)
    let inventedHere = 0
    for (const i of found) {
      if (breaks.has(i)) continue
      inventedHere++
      if (s.examples.length < 10) {
        const from = Math.max(0, i - 6)
        s.examples.push(`${kurztitel} ${label}: …${tokens.slice(from, i + 6).join(' ')}…`)
      }
    }
    for (const [i, cls] of marked) {
      if (found.has(i)) s.hit++
      else {
        s.miss++
        s.missBy[cls]++
      }
    }
    s.invented += inventedHere
    if (inventedHere > 0) s.paragraphsWithInvention++
  }
}

// ---------------------------------------------------------------------------
// Der Korpus: die Gesetze, die eine Periode ändert
// ---------------------------------------------------------------------------

const limit = Number(argAssigned('limit') ?? 300)
const lawLimit = Number(argAssigned('laws') ?? 40)
/** 0 heißt: jeder Paragraph des Gesetzes. */
const paraLimit = Number(argAssigned('paras') ?? 0)

const docs: any[] = []
for (let page = 1; page <= 4 && docs.length < limit; page++) {
  const body = await risJson({ Applikation: 'Begut', DokumenteProSeite: 'OneHundred', Seitennummer: String(page) })
  const refs = asArray<any>(body?.OgdSearchResult?.OgdDocumentResults?.OgdDocumentReference)
  if (refs.length === 0) break
  docs.push(...refs)
}
console.log(`${docs.length} Begut-Sätze aus dem RIS`)

/** Ein Gesetz je Gesetzesnummer, in der Reihenfolge, in der die Entwürfe es nennen. */
const laws = new Map<string, KonsLawAtDate>()
for (const doc of docs.slice(0, limit)) {
  if (laws.size >= lawLimit) break
  const meta = doc?.Data?.Metadaten
  const begut = meta?.Bundesrecht?.Begut
  const beginn: string | null = begut?.BeginnBegutachtungsfrist ?? null
  if (!beginn) continue
  const contents = asArray<any>(doc?.Data?.Dokumentliste?.ContentReference)
  const main = contents.find((c) => c?.ContentType === 'MainDocument')
  const mainXml = asArray<any>(main?.Urls?.ContentUrl).find((u) => u?.DataType === 'Xml')?.Url ?? null
  if (!mainXml) continue
  try {
    const articles = draftArticles(parseRisXml(await getText(mainXml, { script: SCRIPT })))
    for (const article of articles.filter((a) => a.amends && a.bgbl)) {
      if (laws.size >= lawLimit) break
      const law = await resolveLawByBgbl(article.bgbl!, beginn, article.title).catch(() => null)
      if (law && !laws.has(law.gesetzesnummer)) laws.set(law.gesetzesnummer, law)
    }
  } catch (err) {
    // Ein Entwurf, dessen Text nicht zu lesen ist, ist hier kein Befund.
    process.stderr.write(`  ? ${String(err).slice(0, 110)}\n`)
  }
}
console.log(`${laws.size} Gesetze aufgelöst\n`)

for (const law of laws.values()) {
  const entries = Object.entries(law.paragraphs)
  const chosen = paraLimit > 0 ? entries.slice(0, paraLimit) : entries
  totals.laws++
  const trees = await pool(chosen, 6, async ([, ref]) => {
    try {
      return await fetchParagraphTree(ref)
    } catch {
      return null
    }
  })
  for (const [i, tree] of trees.entries()) {
    if (tree) scoreParagraph(chosen[i]![0], law.kurztitel, tree)
  }
  process.stderr.write(`  ${law.kurztitel.slice(0, 50)}: ${chosen.length} §§\n`)
}

// ---------------------------------------------------------------------------

const pct = (a: number, b: number): string => (b === 0 ? '—' : `${((a / b) * 100).toFixed(1)} %`)

console.log(`\n${totals.laws} Gesetze, ${totals.paragraphs} Paragraphen`)
console.log(`  Blockgrenzen des Baums:        ${totals.breaks}`)
console.log(`  davon mit Marke (erreichbar):  ${totals.markedBreaks} (${pct(totals.markedBreaks, totals.breaks)})`)
console.log(`  ohne jede Absatzmarke:         ${totals.withoutAbsatz} §§ (${pct(totals.withoutAbsatz, totals.paragraphs)})`)
console.log(`  davon mit Ziffern:             ${totals.withoutAbsatzWithZiffern} §§`)

console.log('\nRegel                                gefunden        übersehen (Abs/Z/lit)   erfunden   §§ mit Erfindung')
for (const [name] of RULES) {
  const s = scores.get(name)!
  const total = s.hit + s.miss
  const found = `${String(s.hit).padStart(6)} (${pct(s.hit, total).padStart(6)})`
  const missed = `${String(s.miss).padStart(9)} (${s.missBy.abs}/${s.missBy.z}/${s.missBy.lit})`.padEnd(26)
  const invented = `${String(s.invented).padStart(6)}${String(s.paragraphsWithInvention).padStart(12)}`
  console.log(`  ${name.padEnd(34)} ${found}${missed}${invented} (${pct(s.paragraphsWithInvention, totals.paragraphs)})`)
}

for (const [name] of RULES) {
  const s = scores.get(name)!
  if (s.examples.length === 0) continue
  console.log(`\n  erfundene Trennstellen — ${name}`)
  for (const e of s.examples) console.log(`    ${e.slice(0, 150)}`)
}

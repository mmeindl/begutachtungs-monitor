/**
 * Was das Suchfeld NICHT durchsuchen darf: die Ressortnennung
 * (docs/architecture.md §12.31).
 *
 * DAS PROBLEM, gemessen am 21.09.2026 über GP XXVIII: „klima" führte 36
 * Zeilen, und in genau 2 davon stand das Wort im Kurztitel — also in dem
 * Text, den die Zeile zeigt. Die übrigen 34 trafen über zwei Felder, die der
 * Leser nicht sieht:
 *
 *  - den **Ressortnamen**: BMLUK ist „Bundesministerium für Land- und
 *    Forstwirtschaft, Klima- und Umweltschutz, Regionen und
 *    Wasserwirtschaft";
 *  - den **amtlichen Langtitel**, der bei jeder Verordnung mit „Verordnung
 *    des Bundesministers für <dasselbe Portfolio>, mit der …" beginnt.
 *
 * Ein Portfolio-Wort zog damit den gesamten Output eines Ressorts, ohne dass
 * irgendetwas in der Zeile den Grund dafür benannt hätte: „umwelt" 36 → 3,
 * „justiz" 27 → 4, „sport" 12 → 2 (Zeilen heute → Zeilen mit dem Wort im
 * Kurztitel). Nach dem Ressort gibt es die eigene Filterachse daneben; das
 * Freitextfeld muss sie nicht doppeln.
 *
 * DIE REGEL, und warum sie so eng ist: Gestrichen wird nur die
 * **Ministerklausel** — „des Bundesministers für <Portfolio>" —, nie das
 * Portfolio für sich. „Finanzen", „Justiz", „Inneres" sind auch ganz
 * gewöhnliche Sachwörter, und eine Verordnung ÜBER die Finanzen von etwas
 * muss unter „Finanzen" weiter zu finden sein. Was ohne „für" gebildet ist
 * („Bundeskanzleramt"), ist ein Eigenname und wird als solcher gestrichen.
 *
 * Der Langtitel BLEIBT ansonsten im Heuhaufen: Bei einer Verordnung steht
 * der Gegenstand dort und nur dort — der Kurztitel nennt oft bloß die
 * geänderte Verordnung.
 *
 * Reines Modul ohne Nuxt-Importe: Beide Endpunkte müssen dieselbe Regel
 * benutzen, sonst driften die zwei Hälften der Liste auseinander, und die
 * Regel selbst gehört unter Test.
 */

/** Ein Ressortname ohne „für" ist ein Eigenname; kürzer als das ist kein Name. */
const MIN_TOKEN_LEN = 4

/**
 * Die Anrede vor dem Portfolio, in den Schreibweisen, die in den Titeln
 * vorkommen: „des Bundesministers für", „der Bundesministerin für", „dem
 * Bundesminister für", „Bundesministerium für".
 */
const MINISTER_CLAUSE = String.raw`(?:(?:des|der|dem|den|das|vom|beim)\s+)?Bundesminister(?:iums|ium|innen|in|s|n)?\s+für\s+`

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Was zwischen zwei Wörtern eines Portfolios stehen darf: „- ", ", ", " ". */
const SEP = String.raw`[\s,-]+`

/**
 * Ein Portfolio als Muster, das seine eigenen Schreibweisen aushält.
 *
 * DIE STARRE FASSUNG HAT ZWEI ECHTE TITEL VERFEHLT (gemessen 21.09.2026):
 *
 *  - „Land- und Forstwirtschaft, **Klima und** Umweltschutz, …" — das Amt
 *    schreibt sich „Klima- und Umweltschutz", der Titel lässt den Bindestrich
 *    weg. Ein Zeichen Unterschied, und die Klausel blieb stehen.
 *  - „des Bundesministers für Land- und Forstwirtschaft, Klima- und
 *    Umweltschutz" — dasselbe Haus, aber nur der halbe Name.
 *
 * Also wird das Portfolio Wort für Wort gebaut: Die Trennzeichen dürfen
 * variieren, und der Schwanz darf fehlen (verschachtelte Optionalität). Das
 * bleibt an den ECHTEN Wörtern des Ressorts verankert — es rät keine Grammatik
 * und kann deshalb nicht mehr wegnehmen, als ein Ressortname hergibt.
 */
function portfolioPattern(portfolio: string): string | null {
  const words = portfolio
    .split(/[\s,]+/)
    .map((w) => w.replace(/^-+|-+$/g, '').trim())
    .filter(Boolean)
    .map(escapeRegExp)
  if (!words.length) return null
  let tail = ''
  for (let i = words.length - 1; i >= 1; i--) tail = `(?:${SEP}${words[i]}${tail})?`
  return `${words[0]}${tail}`
}

/**
 * Ein zu streichender Ressorttext — und die eine Eigenschaft, die darüber
 * entscheidet, wie weit gestrichen werden darf.
 */
export interface MinistryToken {
  text: string
  /**
   * `true` für ein Portfolio („Finanzen"): Es darf NUR in der Ministerklausel
   * fallen, weil es für sich genommen ein gewöhnliches Sachwort ist.
   * `false` für einen Eigennamen („Bundeskanzleramt"): der fällt überall.
   */
  clauseOnly: boolean
}

// --- Measured surface: exported for tests and harness scripts, not for the app. ---
/**
 * Der Ressortname als Streichtoken: was hinter dem „für" steht, sonst der
 * Name selbst.
 *
 * Beide Schreibweisen führen dasselbe Portfolio — „Bundesministerium für X"
 * im Datensatz, „Bundesministers für X" im Titel —, deshalb reicht ein Token
 * für beide.
 */
export function ministryToken(name: string): MinistryToken | null {
  // „BMLUK (Bundesministerium für …)" ist die Schreibweise des RIS-Satzes,
  // „Bundesministerium für …" die der gemappten Zeile. Beide kommen hier an.
  const raw = (name ?? '').trim()
  const bare = /^[A-ZÄÖÜ]{2,8}\s*\((.+)\)\s*$/.exec(raw)
  const trimmed = bare ? bare[1]!.trim() : raw
  const m = /\bfür\s+(.+)$/s.exec(trimmed)
  const text = (m ? m[1]! : trimmed).trim().replace(/\s+/g, ' ')
  if (text.length < MIN_TOKEN_LEN) return null
  return { text, clauseOnly: m !== null }
}

/**
 * Das Vokabular einer Gesetzgebungsperiode, längstes Token zuerst.
 *
 * Die Reihenfolge ist kein Detail: Stünde „Finanzen" vor „Finanzen und
 * Wirtschaft", bliebe von der längeren Klausel ein Rest stehen, der beim
 * nächsten Durchgang nicht mehr als Klausel erkennbar ist.
 */
export function ministryTokens(names: Iterable<string>): MinistryToken[] {
  const byText = new Map<string, MinistryToken>()
  for (const name of names) {
    const token = ministryToken(name)
    if (token && !byText.has(token.text)) byText.set(token.text, token)
  }
  return [...byText.values()].sort((a, b) => b.text.length - a.text.length)
}

/**
 * Die Ressortnennungen aus einem Titel — für die Suche, nicht für die
 * Anzeige. Das Ergebnis muss nicht lesbar sein, nur frei von dem, was jede
 * Verordnung eines Hauses gleich schreibt.
 *
 * Mitgenommen wird auch das zweite Haus: „im Einvernehmen mit dem
 * Bundesminister für Finanzen" steht in vielen Verordnungen und träfe sonst
 * dieselbe Falle ein zweites Mal.
 */
export function stripMinistryMentions(text: string, tokens: readonly MinistryToken[]): string {
  if (!text) return ''
  let out = text
  for (const { text: token, clauseOnly } of tokens) {
    if (clauseOnly) {
      const pattern = portfolioPattern(token)
      if (pattern) out = out.replace(new RegExp(`${MINISTER_CLAUSE}${pattern}`, 'gi'), ' ')
    } else {
      out = out.replace(new RegExp(escapeRegExp(token), 'gi'), ' ')
    }
  }
  return out
}

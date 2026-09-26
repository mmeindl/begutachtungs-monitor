/**
 * Die Lesefassung nach Gliederungseinheiten, nicht als eine Wand
 * (docs/architecture.md §12.12a).
 *
 * `bodyText` in `lawtext/konsTree.ts` trennt jeden Block des Baums mit einem
 * Zeilenumbruch — der Baum weiß genau, wo ein Absatz, eine Ziffer, eine
 * Litera anfängt. Der Wortdiff darüber zerlegt an `\s+` und normalisiert den
 * Umbruch damit weg (gemessen 19.09.2026: 0 von 3 Segmenten trugen noch
 * einen). Die Gliederung kommt also ohne sie auf der Seite an und wird hier
 * aus dem Text zurückgewonnen.
 *
 * **Getrennt wird OHNE die Segmentgrenzen zu verletzen:** ein Segment ist ein
 * Lauf einer Art (`equal | inserted | removed`), und ein Blockbruch darin
 * schneidet nur den Text, nie die Art. Ein eingefügter Absatz bleibt grün,
 * auch wenn er einen eigenen Block bekommt.
 *
 * ## Warum die Ziffer eine Regel braucht und der Absatz keine
 *
 * `(1)`, `(2a)` sind selbstbegrenzend: Ziffern in Klammern stehen sonst
 * nirgends. „(EU) 2018/1808" trägt Buchstaben, „Abs. 1" keine Klammern, und
 * beide stehen im selben Text daneben.
 *
 * `1.` ist es nicht — „mit 1. Jänner 2027 in Kraft" trägt dieselbe Form
 * mitten im Satz. Bis 26.09.2026 blieb die Ziffer deshalb ungetrennt, und ein
 * Paragraph ohne Absatznummern stand als Wand (§ 111 RStDG, 2.792 Zeichen,
 * bei 390 px rund 40 Zeilen).
 *
 * ## Gemessen, nicht geschätzt (`pnpm corpus:absatz-marker`, 26.09.2026)
 *
 * Über 3.433 Paragraphen aus 30 Gesetzen, die Entwürfe der laufenden Periode
 * ändern — 15.257 Blockgrenzen, davon 14.642 (96 %) überhaupt an einer Marke.
 * Das Orakel ist `bodyText` selbst: jeder `\n` darin IST eine Grenze, vom
 * Baum gesetzt. 1.051 Paragraphen (30,6 %) führen keine einzige Absatzmarke.
 *
 * |  Regel                              | gefunden | erfunden | §§ mit Erfindung |
 * |-------------------------------------|----------|----------|------------------|
 * | nur `(1)` (bis 26.09.)              | 49,7 %   |        3 | 3 (0,1 %)        |
 * | jede Form `n.`                      | 92,9 %   |    2.411 | 465 (13,5 %)     |
 * | aufsteigende Ziffern ab 1           | 88,8 %   |      173 | 35 (1,0 %)       |
 * | dazu Litera                         | 95,5 %   |      191 | 48 (1,4 %)       |
 * | **dazu die Ausnahmen — ausgeliefert**| 95,5 %  |       14 | 8 (0,2 %)        |
 *
 * Die naive Regel ist damit widerlegt: sie zerreißt in jedem siebenten
 * Paragraphen einen laufenden Satz. Die aufsteigende Folge allein reicht auch
 * nicht — sie erfindet noch in jedem hundertsten. Mit den Ausnahmen bleiben 14
 * Stellen in 8 Paragraphen, und zwei dieser acht gehen auf die Absatzregel
 * zurück, die schon vorher stand („(247a)" als Verweisung in StGB § 52b).
 *
 * **Verworfen, und zwar gemessen:** zusätzlich zu verlangen, dass das Wort
 * DAVOR einen Block abschließt (Doppelpunkt, Strichpunkt, Beistrich, Punkt,
 * Bindewort). Das kostet 892 echte Grenzen (95,5 % → 89,4 %) und spart
 * gegenüber den Ausnahmen keine einzige Erfindung mehr — die Verschärfung
 * trifft dieselben Stellen zweimal und die echten Ziffern einmal zu oft.
 *
 * Absatzgrenzen übersieht keine der Regeln — 0 von 7.278 in jeder Zeile der
 * Tabelle. Was die 4,5 % Rest ausmacht, sind Ziffernlisten, die nicht bei 1
 * anfangen, und Schlussteile, die im Text gar kein Zeichen tragen, an dem man
 * sie erkennen könnte.
 */
import type { LawDiffSegment } from '#shared/types'

/** „(1)", „(2a)" — der Absatz, selbstbegrenzend. */
const ABS_RE = /^\(\d+[a-z]?\)$/
/** „3.", „3a." — die Ziffer, wie `konsTree.Z_MARKER_RE` sie im Baum liest. */
const Z_RE = /^(\d+)([a-z]*)\.$/
/** „b)", „aa)" — die Litera. */
const LIT_RE = /^[a-z]{1,2}\)$/

/** Ein Monatsname hinter der Zahl macht aus ihr ein Datum: „mit 1. Jänner 2027". */
const MONTH = new Set([
  'Jänner', 'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
])
/** Was eine Ordnungszahl sonst noch zählt — eine Gliederung über dem Paragraphen, ein Schuljahr. */
const ORDINAL_OF = new Set([
  'Abschnitt', 'Abschnittes', 'Unterabschnitt', 'Hauptstück', 'Hauptstückes', 'Teil', 'Teiles',
  'Semester', 'Halbjahr', 'Klasse', 'Klassen', 'Jahrgang', 'Jahrganges', 'Jahrgangs',
  'Schulstufe', 'Novelle',
])
/** „ABl. Nr. L 11 vom 16. 1. 2003" — ein rein numerisch geschriebenes Datum. */
const YEAR_RE = /^\d{4}[,.;:)]?$/
/** Steht eines davor, ist die Zahl eine Verweisung und keine Ziffer. */
const REFERENCE = new Set([
  'Abs.', 'Z', 'Ziffer', 'Ziffern', '§', '§§', 'Art.', 'Artikel', 'lit.', 'Nr.',
  'Anlage', 'Anl.', 'Abschnitt', 'Teil', 'Hauptstück',
  'vom', 'am', 'ab', 'bis', 'dem', 'mit', 'seit', 'des', 'zum', 'zur',
])

/**
 * Die Wortnummern, vor denen ein neuer Block anfängt.
 *
 * Getrennt gehalten von der Segmentarbeit darunter, weil hier die Regel steht
 * und dort die Buchführung — und weil eine Regel über eine Wortliste
 * gemessen werden kann (`scripts/corpus/absatzMarker.ts`).
 */
export function blockStarts(tokens: string[]): Set<number> {
  const out = new Set<number>()
  for (const [i, t] of tokens.entries()) if (i > 0 && ABS_RE.test(t)) out.add(i)

  for (const run of ascendingRuns(tokens, Z_RE, (m) => Number(m[1]), 1)) {
    for (const i of run) accept(tokens, i, out)
  }
  for (const run of ascendingRuns(tokens, LIT_RE, (m) => m[0].charCodeAt(0), 'a'.charCodeAt(0))) {
    // Eine Literafolge, die unmittelbar auf eine Ziffer folgt, steht im
    // Fließtext DIESER Ziffer: dort hat das RIS die Untergliederung nicht
    // ausgezeichnet, und der Baum kennt keine einzige Grenze darin. Die
    // ganze Folge fällt, nicht nur ihr „a)" — sonst bekäme „b)" einen
    // eigenen Block und „a)" keinen (Abfallwirtschaftsgesetz § 3, RStDG § 2).
    const head = run[0]!
    if (head > 0 && Z_RE.test(tokens[head - 1]!)) continue
    for (const i of run) accept(tokens, i, out)
  }
  return out
}

/**
 * Nimmt eine gefundene Stelle an — oder verwirft sie an einer der gemessenen
 * Ausnahmen. Wort 0 ist nie eine Trennstelle: davor steht nichts.
 */
function accept(tokens: string[], i: number, out: Set<number>): void {
  if (i === 0) return
  const next = tokens[i + 1]
  if (next && (MONTH.has(next) || ORDINAL_OF.has(next) || YEAR_RE.test(next))) return
  if (REFERENCE.has(tokens[i - 1]!)) return
  out.add(i)
}

/**
 * Die Marken-FOLGEN eines Textes, jede aufsteigend und bei der ersten Marke
 * beginnend — „1., 2., 3." und „a), b), c)".
 *
 * Eine Aufzählung zählt hoch; eine Zahl mitten im Satz steht allein. Deshalb
 * zählt nur, was in einer Folge von mindestens zwei steht: ein einzelnes
 * „1." bleibt Text. Ein Buchstabenanhang („3a." nach „3.") gilt als
 * Wiederholung derselben Zahl, weil eine Novelle so einschiebt.
 *
 * **Wort 0 zählt mit, obwohl es nie eine Trennstelle ist.** Ein Paragraph
 * ohne Absatznummern fängt mit seiner ersten Ziffer an — genau der Fall, um
 * den es hier geht —, und liefe die Folge erst ab Wort 1, bliebe sie eine
 * Marke zu kurz und der ganze Paragraph eine Wand.
 */
function ascendingRuns(
  tokens: string[],
  re: RegExp,
  valueOf: (m: RegExpExecArray) => number,
  first: number,
): number[][] {
  const out: number[][] = []
  let run: number[] = []
  let expected = first
  const flush = (): void => {
    if (run.length >= 2) out.push(run)
    run = []
  }
  for (const [i, t] of tokens.entries()) {
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

/** Ein Wort mit seinem Platz: in welchem Segment, an welcher Stelle darin. */
interface Token {
  segment: number
  at: number
  text: string
}

function tokensOf(segments: LawDiffSegment[]): Token[] {
  const out: Token[] = []
  for (const [segment, seg] of segments.entries()) {
    for (const m of seg.text.matchAll(/\S+/g)) out.push({ segment, at: m.index, text: m[0] })
  }
  return out
}

export function absaetze(segments: LawDiffSegment[]): LawDiffSegment[][] {
  const tokens = tokensOf(segments)
  const starts = blockStarts(tokens.map((t) => t.text))
  /** Je Segment die Zeichenstellen, an denen ein Block anfängt — aufsteigend. */
  const cuts = new Map<number, number[]>()
  for (const i of [...starts].sort((a, b) => a - b)) {
    const t = tokens[i]!
    const list = cuts.get(t.segment)
    if (list) list.push(t.at)
    else cuts.set(t.segment, [t.at])
  }

  const out: LawDiffSegment[][] = []
  let current: LawDiffSegment[] = []
  for (const [i, seg] of segments.entries()) {
    let from = 0
    for (const at of cuts.get(i) ?? []) {
      const before = seg.text.slice(from, at)
      if (before) current.push({ ...seg, text: before })
      if (current.length) {
        out.push(current)
        current = []
      }
      from = at
    }
    const rest = seg.text.slice(from)
    if (rest) current.push({ ...seg, text: rest })
  }
  if (current.length) out.push(current)
  return out.length ? out : [segments]
}

/**
 * Vom Verordnungsentwurf zur Kundmachung im BGBl II
 * (docs/architecture.md §12.32).
 *
 * PURE MODULE — relative imports only, so vitest and die Messskripte es
 * direkt ausführen.
 *
 * DAS PROBLEM. Zwei Drittel des Korpus sind Verordnungsentwürfe, und für sie
 * endet der Monitor heute mit der Frist: kein Gegenstand im Parlament, keine
 * Regierungsvorlage, keine Station danach. Der Weg gibt es trotzdem —
 * Begutachtung → Erlassung durch das Ressort → Kundmachung im **BGBl II** —,
 * er läuft nur nicht durchs Parlament. Was fehlt, ist der Schlüssel: Der
 * Begut-Satz und der BGBl-Satz teilen keinen, also muss er gebaut werden.
 *
 * DIESELBE MECHANIK WIE RIS↔ME, mit Absicht. `risJoin.ts` hat für genau diese
 * Aufgabe schon Titelähnlichkeit, Ressort-Abstammung und Datumsfenster
 * gemessen und kalibriert; dieses Modul leiht sich die Bauteile, statt eine
 * zweite Ähnlichkeitslehre aufzumachen. Was hier anders ist, steht unten:
 * das Rauschwort und die Richtung des Datums.
 *
 * WAS DER JOIN NICHT DARF. „Nicht kundgemacht" ist die Aussage, die weh tut
 * — sie liest sich als „das Ressort hat die Verordnung fallen gelassen". Ein
 * verpasster Treffer sagt also nicht „wir wissen es nicht", sondern etwas
 * Falsches über ein Ressort. Deshalb ist die Schwelle hoch, deshalb gibt es
 * die Mehrdeutigkeitsmarge, und deshalb hat `BgblOutcome` einen dritten
 * Zustand: `unknown`, für alles, was das Fenster noch nicht entscheiden kann.
 */
import { ministryCodeOf, ministryScore } from './ris/ministryCodes'
import { daysBetween, normalizeTitleText, titleComponents } from './ris/titleSimilarity'

/** Ein Satz des Bundesgesetzblatts, so viel davon, wie der Join braucht. */
export interface BgblRecord {
  /** `BGBLA_2026_II_50` */
  id: string
  /** `Teil1` | `Teil2` | `Teil3` */
  teil: string
  /** „BGBl. II Nr. 50/2026" */
  nummer: string
  /** ISO-Ausgabedatum. */
  datum: string
  kurztitel: string | null
  titel: string | null
  /** „BMASGPK (Bundesministerium für …)", dieselbe Schreibweise wie bei Begut. */
  stelle: string | null
}

/** Die Seite des Entwurfs, die der Join liest. */
export interface BgblJoinDraft {
  kurztitel: string | null
  titel: string | null
  stelle: string | null
  /** Ende der Begutachtungsfrist, ISO. Ohne sie ist kein Fenster zu ziehen. */
  ende: string | null
}

// --- Measured surface: exported for tests and harness scripts, not for the app. ---
/**
 * Das Fenster zwischen Fristende und Ausgabedatum, in Tagen.
 *
 * Die Untergrenze ist negativ und nicht null: Eine Kundmachung KANN vor dem
 * formellen Fristende liegen, wenn die Verordnung eilt und das Ressort die
 * Begutachtung parallel laufen lässt. −30 lässt diesen Fall zu, ohne die
 * Vorgängerfassung derselben Verordnung einzufangen.
 *
 * Die Obergrenze ist großzügig, weil sie nichts kostet: Der Titel entscheidet,
 * das Datum grenzt nur ein. Gemessen (`pnpm audit:bgbl2`) liegt der Median
 * weit darunter; was die 540 Tage verhindern, ist der Treffer auf die
 * NÄCHSTE Novelle desselben Textes zwei Jahre später.
 */
export const BGBL_WINDOW_DAYS: readonly [number, number] = [-30, 540]

/**
 * Ab welcher Titelähnlichkeit ein Treffer gilt, und wie weit er vor dem
 * zweiten liegen muss. Beide Werte sind gemessen, nicht gesetzt — die
 * Kalibrierung steht in `docs/architecture.md` §12.32.
 */
export const BGBL_ACCEPT = 0.72
export const BGBL_MARGIN = 0.08
/**
 * Wie weit die zweitbeste Kundmachung zeitlich weg sein muss, damit ein
 * Gleichstand der Titel trotzdem entschieden werden kann.
 *
 * DAS IST DER FALL, DEN DIE ERSTE FASSUNG FALSCH VERWORFEN HAT. Viele
 * Verordnungen werden jährlich geändert, und die Kundmachungen heißen dann
 * Jahr für Jahr gleich: „Änderung der Studienbeitragsverordnung" gibt es
 * 2024, 2025 und 2026. Die Marge sah zwei Kandidaten mit derselben Punktzahl
 * und sagte „keine Antwort" — obwohl die Antwort feststand: Die erste
 * Kundmachung NACH dem Fristende ist die aus dieser Begutachtung, die
 * anderen gehören zu anderen. Gemessen kostete das 21 Entwürfe, darunter
 * welche mit Punktzahl 1,000.
 *
 * 60 Tage, weil darunter die Reihenfolge nichts mehr aussagt: Zwei
 * Kundmachungen derselben Verordnung innerhalb von zwei Monaten können beide
 * aus derselben Begutachtung stammen (Berichtigung, zweiter Teil), und dann
 * ist die Wahl wieder ein Münzwurf.
 */
const BGBL_TIE_DAYS = 60

/**
 * Das formelhafte Vorwort einer Verordnung, das über den Titel nichts sagt.
 *
 * „Verordnung des Bundesministers für Finanzen, mit der die
 * Sachbezugswerteverordnung geändert wird" trägt vier Wörter Inhalt und ein
 * Dutzend Formel. Das Ressort steckt schon im eigenen Feld — bliebe es im
 * Titel, verglichen wir es zweimal und ließen „Finanzen" gegen „Finanzen"
 * einen Treffer stützen, den der Titel nicht hergibt.
 */
const PREAMBLE_RE =
  /^verordnung\s+(?:des|der)\s+bundesminister(?:s|in)?[^,]*,\s*/i
/**
 * „Verordnung" selbst ist in Teil II das, was „Bundesgesetz" in Teil I ist:
 * auf beiden Seiten jedes Satzes, also Rauschen. `risJoin.STOP` wirft
 * „bundesgesetz" aus demselben Grund weg, kann „verordnung" aber nicht
 * wegwerfen — dort unterscheidet es die Arten.
 */
const NOISE_RE = /\b(?:verordnungen|verordnung|kundmachung|novelle)\b/gi

/** Titel ohne Formel und ohne Rauschwort — das, was verglichen wird. */
export function bgblTitleCore(title: string | null | undefined): string {
  const t = (title ?? '').replace(PREAMBLE_RE, ' ').replace(NOISE_RE, ' ')
  return normalizeTitleText(t)
}

/** Jeder Titel des Entwurfs gegen jeden Titel der Kundmachung, der beste zählt. */
export function bgblTitleScore(draft: BgblJoinDraft, record: BgblRecord): number {
  let best = 0
  for (const a of [draft.kurztitel, draft.titel]) {
    const left = bgblTitleCore(a)
    if (!left) continue
    for (const b of [record.kurztitel, record.titel]) {
      const right = bgblTitleCore(b)
      if (!right) continue
      const c = titleComponents(left, right)
      // `cont` trägt, weil die Kundmachung den Entwurfstitel oft VERKÜRZT
      // („Änderung der Honigverordnung" gegen den vollen Verordnungstitel);
      // `jac` hält dagegen, wo Enthaltensein allein zu billig wäre.
      const s = Math.max(c.jac, c.cont * 0.9, c.lcp * 0.85)
      if (s > best) best = s
    }
  }
  return Math.round(best * 1000) / 1000
}

/** Ein bewerteter Kandidat. */
interface BgblCandidate {
  record: BgblRecord
  score: number
  /** Tage zwischen Fristende und Ausgabedatum. */
  days: number
  /** 1 gleiches Ressort, 0.5 Rechtsnachfolger, 0 fremd. */
  ministry: number
}

/** Das Ergebnis: ein Treffer, mit dem Abstand zum zweitbesten. */
interface BgblMatch extends BgblCandidate {
  margin: number
}

/**
 * Die Kandidaten eines Entwurfs, bewertet und absteigend sortiert.
 *
 * Getrennt vom Urteil, damit die Messung sehen kann, was knapp verfehlt hat
 * — eine Schwelle, die man nur an ihren Treffern prüft, prüft man nicht.
 */
export function bgblCandidates(draft: BgblJoinDraft, records: readonly BgblRecord[]): BgblCandidate[] {
  if (!draft.ende) return []
  const codes = new Set([ministryCodeOf(draft.stelle)])
  const out: BgblCandidate[] = []
  for (const record of records) {
    if (record.teil !== 'Teil2' || !record.datum) continue
    const days = daysBetween(draft.ende, record.datum)
    if (days < BGBL_WINDOW_DAYS[0] || days > BGBL_WINDOW_DAYS[1]) continue
    const ministry = ministryScore(codes, ministryCodeOf(record.stelle))
    const score = bgblTitleScore(draft, record)
    if (score <= 0) continue
    out.push({ record, score, days, ministry })
  }
  // Nach Punktzahl, bei Gleichstand das frühere Datum: Wird derselbe Text
  // zweimal geändert, ist die erste Kundmachung nach der Frist die aus
  // dieser Begutachtung.
  return out.sort((a, b) => b.score - a.score || a.days - b.days)
}

/**
 * Die Kundmachung zu einem Entwurf — oder null.
 *
 * Das fremde Ressort ist ein hartes Aus, kein Abzug. Ein Titel kann sich
 * zufällig gleichen („Ratenzahlungs-Verordnung" des E-Control-Vorstands
 * gegen eine Ressortverordnung); dass zwei verschiedene Stellen dieselbe
 * Verordnung erlassen, kann dagegen nicht sein. Die Abstammungsgruppen aus
 * `risJoin` fangen dabei den Regierungswechsel ab, der zwischen Frist und
 * Kundmachung liegen kann.
 */
export function joinDraftToBgbl(draft: BgblJoinDraft, records: readonly BgblRecord[]): BgblMatch | null {
  const ranked = bgblCandidates(draft, records).filter((c) => c.ministry > 0)
  const best = ranked[0]
  if (!best || best.score < BGBL_ACCEPT) return null
  const second = ranked[1]
  const margin = best.score - (second?.score ?? 0)
  // Gleichstand im Titel: Dann entscheidet die Zeit, und zwar zugunsten der
  // ERSTEN Kundmachung nach dem Fristende — `bgblCandidates` sortiert dafür
  // schon. Liegen beide nah beieinander, sagt auch die Zeit nichts, und dann
  // sind zwei Antworten keine.
  if (second && margin < BGBL_MARGIN && second.days - best.days < BGBL_TIE_DAYS) return null
  return { ...best, margin: Math.round(margin * 1000) / 1000 }
}

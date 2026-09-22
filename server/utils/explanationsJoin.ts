/**
 * Die Passagen des Besonderen Teils an ihrem Paragraphen
 * (docs/architecture.md §12.30) — die zweite Hälfte des Erläuterungen-Pakets.
 *
 * PURE MODULE — relative imports only, so vitest runs it directly.
 *
 * WARUM DAS GEHT, OHNE EIN ZWEITES AUSRICHTUNGSPROBLEM ZU ÖFFNEN. Der
 * Besondere Teil überschreibt seine Passagen mit genau der Adresse, die das
 * Werkzeug ohnehin berechnet: „Zu Z 4 (§ 54c Abs. 1a und 1b):" nennt die
 * Novellierungsanordnung und den Paragraphen, „Zu Art. 2 (Änderung des
 * KommAustria-Gesetzes)" das Gesetz des Pakets. Die Gegenüberstellung führt
 * ihre Zeilen unter denselben zwei Schlüsseln (`ComparisonRow.law`,
 * `ComparisonRow.para`). Der Join ist deshalb ein Nachschlagen, keine
 * Ähnlichkeitssuche über Text.
 *
 * WAS NICHT PASSIERT: Es wird nichts erfunden und nichts weggelassen. Eine
 * Passage, deren Gesetz sich nicht sicher bestimmen lässt, wird in einem
 * Paket mit mehreren Gesetzen **verworfen** statt irgendwo angehängt — § 5
 * des zweiten Gesetzes ist eine andere Bestimmung als § 5 des ersten, und die
 * falsche Begründung am Paragraphen wäre schlimmer als keine. Dieselbe Regel,
 * die `ComparisonRow.law` bereits befolgt.
 */
import type { DraftArticle } from './lawTitles'
import type { ExplanationsDocument } from './explanations'
import { lawNameTokens } from './lawDiff'
import { jaccardSimilarity } from './lawtext/lawNames'
// Relative, nicht über `#shared`: Dieses Modul ist rein, damit vitest und die
// Messskripte es direkt ausführen — wie `lawDiff.ts` es hält.
import { explanationParaId } from '../../shared/utils/explanationKey'

/** Eine Erläuterungspassage, adressiert an einen Paragraphen eines Gesetzes. */
export interface ParagraphExplanation {
  /**
   * Der Gesetzesschlüssel des Pakets, identisch mit `ComparisonRow.law`;
   * null bei einem Entwurf, der nur ein Gesetz ändert — dort führen auch die
   * Zeilen kein Gesetz.
   */
  law: string | null
  /** Die Nummer des Paragraphen, „54c" — wie `explanationParaId` sie bildet. */
  para: string
  /** Die Überschrift, wie das Ressort sie gedruckt hat. */
  heading: string
  /** Die Absätze der Passage, in Druckreihenfolge. */
  text: string[]
}

/** „Zu Art. 2 (…)", „Zu Artikel 2 – …" — die Nummer des Artikels, wenn eine dasteht. */
const ARTICLE_NUMERAL_RE = /^(?:zu\s+)?art(?:ikel)?\.?\s*([0-9]+[a-z]?|[ivxlc]+)\b/i

/**
 * Ab wann zwei Gesetzesnamen als derselbe gelten, wenn die Passage keine
 * Artikelnummer nennt.
 *
 * Gemessen (`pnpm audit:erlaeuterungen -- --join`): Die Nummer trägt die
 * große Mehrheit der Fälle; der Namensvergleich ist der Rest, und bei 0,5
 * bleibt er auf der sicheren Seite — „Änderung des Aktiengesetzes" gegen
 * „Aktiengesetz" ist nach Entfernen der Formelwörter eine Deckung von 1,0,
 * zwei verschiedene Gesetze eines Pakets liegen weit darunter.
 */
const NAME_MIN_JACCARD = 0.5

/**
 * Welches Gesetz des Pakets eine Passage erklärt.
 *
 * Zuerst über die Artikelnummer, weil sie eine Angabe des Ressorts ist und
 * kein Urteil von uns; dann über den Gesetzesnamen, für die Ressorts, die
 * „Änderung des Aktiengesetzes" ohne Nummer darüberschreiben. Bleibt beides
 * ohne Ergebnis, ist die Antwort null — und der Aufrufer verwirft die Passage,
 * statt sie zu raten.
 */
function articleKeyOf(heading: string | null, articles: readonly DraftArticle[]): string | null {
  if (!heading) return null
  const numeral = ARTICLE_NUMERAL_RE.exec(heading)?.[1]?.toLowerCase()
  if (numeral) {
    const hit = articles.find((a) => a.numeral?.toLowerCase() === numeral)
    if (hit?.key) return hit.key
  }
  const tokens = lawNameTokens(heading)
  let best: { key: string; score: number } | null = null
  for (const article of articles) {
    if (!article.key) continue
    const score = jaccardSimilarity(tokens, lawNameTokens(article.title ?? article.key))
    if (score >= NAME_MIN_JACCARD && (!best || score > best.score)) best = { key: article.key, score }
  }
  return best?.key ?? null
}

/**
 * Die Passagen des Besonderen Teils, aufgelöst auf (Gesetz, Paragraph).
 *
 * Eine Passage, die mehrere Paragraphen nennt („Zu §§ 12 und 13"), erscheint
 * bei jedem von ihnen: Sie IST die Begründung für beide, und der Leser, der
 * bei § 13 steht, hat kein Interesse daran, dass sie unter § 12 gedruckt war.
 */
export function explanationsByParagraph(
  doc: ExplanationsDocument,
  articles: readonly DraftArticle[],
): ParagraphExplanation[] {
  const out: ParagraphExplanation[] = []
  /**
   * Der Schlüssel MUSS der der Zeilen sein, und der ist nicht „null, wenn es
   * nur ein Gesetz gibt": Die Beilage führt ihre Zeilen unter dem Schlüssel des
   * Artikels, sobald der Entwurf einen benannten trägt — auch wenn es genau
   * einer ist. Die erste Fassung hat hier null gesetzt und damit bei einem
   * Entwurf, dessen §§ perfekt passten, **keinen einzigen Treffer** erzeugt
   * (Honigverordnung Novelle 2025, 9 von 9 daneben). Gemessen statt vermutet:
   * `pnpm audit:erlaeuterungen -- --join`.
   */
  const keyed = articles.filter((a) => a.key !== null)
  const only = keyed.length === 1 ? keyed[0]!.key : null
  for (const passage of doc.special?.passages ?? []) {
    if (!passage.heading || !passage.text.length || !passage.paragraphs.length) continue
    // Die Überschrift der Passage zuerst: „Zu Art. 2 Z 1 (§ 7)" nennt ihr
    // Gesetz selbst, und das ist die genauere Angabe als die Artikelüberschrift,
    // unter der sie steht.
    const law =
      keyed.length <= 1 ? only : articleKeyOf(passage.heading, articles) ?? articleKeyOf(passage.article, articles)
    // Ein Paket mit mehreren Gesetzen und eine Passage ohne bestimmbares
    // Gesetz: verwerfen. Siehe Kopf.
    if (keyed.length > 1 && law === null) continue
    for (const para of passage.paragraphs) {
      const id = explanationParaId(para)
      if (id) out.push({ law, para: id, heading: passage.heading, text: passage.text })
    }
  }
  return out
}

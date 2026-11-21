/**
 * The definitions a tag opens in place (`TermNote`), in one record.
 *
 * A reader meets „redaktionell" or „nicht gezählt" at the tag, not on a
 * method page, so the definition stands under the tag's row (14.11.2026,
 * docs/decisions.md, „Help text"). The wording lives here and nowhere else:
 * this is the one file a second language replaces, and a component that
 * shows a term passes its key, never its sentence.
 *
 * One to three sentences each — what the word means on this site, never how
 * the check behind it works; that is the section's „Methode". A term that
 * means something different in two places gets two keys (`redaktionell` and
 * its Gegenüberstellung variant), not a sentence with a branch in it.
 *
 * Pure module.
 */
import { EDITORIAL_BADGE_DEFINITION } from '#shared/utils/lawStations'
import { RV_LATENCY_CONTEXT_DAYS } from '#shared/utils/rvLatency'

export interface Term {
  /** The word as the tag prints it. */
  label: string
  definition: string
}

/* The window of „genannt", in the months the rest of the site says it in
   (`/so-funktionierts#wartezeit` until 14.11.2026). */
const NAMED_WINDOW_MONTHS = Math.round(RV_LATENCY_CONTEXT_DAYS / 30.44)

/* The Regelfall and the yardstick are the same for both Frist words; only
   the threshold differs. */
const FRIST_CONTEXT =
  'Im Regelfall vorgesehen sind sechs Wochen (§ 9 Abs. 3 WFA-Grundsatz-Verordnung). Zum Vergleich steht der Median der Gesetzgebungsperiode, in der die Frist begann – seit 2013 in jeder Periode rund vier Wochen.'

export const TERMS = {
  /** The § comparison after the Begutachtung (`LawDiffSection`). */
  redaktionell: {
    label: 'redaktionell',
    definition: EDITORIAL_BADGE_DEFINITION,
  },
  /** The Textgegenüberstellung: two columns of one §, so no renumbering to follow. */
  'redaktionell-gegenueberstellung': {
    label: 'redaktionell',
    definition: `${EDITORIAL_BADGE_DEFINITION} Die Gegenüberstellung hält zwei Spalten desselben Paragraphen nebeneinander und kann deshalb keine Umnummerierung feststellen; hier zählt jeder geänderte Verweis als Änderung.`,
  },
  'nicht-gezeigt': {
    label: 'nicht gezeigt',
    definition:
      'Eine der drei Prüfungen ist nicht aufgegangen: Die Zeile gehört nicht zu ihrem Paragraphen, oder die Beilage legt einen anderen Stand des Gesetzes zugrunde. Statt eines falschen Vergleichs steht dort, welche Prüfung es war. Was sich ändert, sagt die Beilage des Ministeriums.',
  },
  'nicht-geprueft': {
    label: 'nicht geprüft',
    definition:
      'Die Prüfung ließ sich nicht durchführen, etwa weil das RIS das Gesetz oder den Paragraphen nicht führt oder seine Absätze nicht auseinanderhalten lässt, oder weil die Beilage zu wenig Text hergibt: zu wenig geltenden für den Vergleich mit dem RIS oder zu wenig neuen für den Abgleich mit dem vorgeschlagenen Gesetzestext. Das ist kein Befund über den Entwurf, sondern einer über die Prüfbarkeit; der Grund steht beim Gesetz.',
  },
  /** A Land's Textgegenüberstellung: the new text against the draft's own Gesetzestext (`landUnchecked.ts`). */
  'nicht-geprueft-entwurf': {
    label: 'nicht geprüft',
    definition:
      'Ob der neue Text dieses Paragraphen Wort für Wort so im Gesetzestext des Entwurfs steht, ließ sich nicht prüfen. Gezeigt wird er trotzdem. Das ist kein Befund über den Entwurf oder die Textgegenüberstellung, sondern einer über die Prüfbarkeit; der Grund steht beim Gesetz.',
  },
  /** A Verordnung of the Bund: the statement goes to the ministry. */
  'nicht-gezaehlt-verordnung': {
    label: 'nicht gezählt',
    definition:
      'Eine Stellungnahme zu einer Verordnung geht direkt an das Ministerium, und eine öffentliche Liste der Einreichungen gibt es nicht. Hier steht deshalb keine Zahl – nicht, weil niemand Stellung genommen hätte, sondern weil niemand zählt.',
  },
  /** A Land's draft, Gesetz or Verordnung alike. */
  'nicht-gezaehlt-land': {
    label: 'nicht gezählt',
    definition:
      'Eine Stellungnahme geht direkt an das Land, und wie viele eingehen, zählt kein Land öffentlich. Hier steht deshalb keine Zahl.',
  },
  'frist-voll': {
    label: 'voll',
    definition: `Eine Frist von sechs Wochen oder mehr. ${FRIST_CONTEXT}`,
  },
  'frist-kurz': {
    label: 'kurz',
    definition: `Eine Frist unter drei Wochen. ${FRIST_CONTEXT}`,
  },
  genannt: {
    label: 'genannt',
    definition: `Manchmal führt ein Ministerium einen Entwurf in die Regierungsvorlage eines anderen über, und das Parlament verknüpft die Vorlage nur mit dem anderen. „Genannt“ heißt: Die Erläuterungen genau einer Vorlage nennen binnen ${NAMED_WINDOW_MONTHS} Monaten nach Fristende den Titel dieses Entwurfs – nennt der Titel nur ein Gesetz, muss der Satz sagen, dass die Vorlage den Entwurf aufnimmt –, und der Satz steht zum Nachprüfen dabei. Einen Paragraphenvergleich gibt es nicht: Die Vorlage enthält auch den Inhalt des anderen Entwurfs, und welcher Teil auf welchen zurückgeht, lässt sich nicht verlässlich trennen.`,
  },
  /**
   * A Regierungsvorlage or Initiativantrag no Ministerialentwurf preceded
   * (the Vorlage's page, under its procedure card). „Vorgeschrieben ist eine
   * Begutachtung nicht" is the framing guard: the page states a procedural
   * fact, never a reproach. From the list's note under „Ohne Entwurf"
   * (until 14.11.2026).
   */
  'ohne-begutachtung-bund': {
    label: 'Was „ohne Begutachtung“ heißt',
    definition:
      'Vor diesem Gesetzesvorschlag ist kein Ministerialentwurf in Begutachtung erkennbar. Vorgeschrieben ist eine Begutachtung nicht; Stellungnahmen an den Nationalrat sind während des Verfahrens möglich (§ 23b GOG-NR).',
  },
  /** The same page where the committee invited Stellungnahmen itself. */
  ausschussbegutachtung: {
    label: 'Was „Ausschussbegutachtung“ heißt',
    definition:
      'Der Ausschuss des Nationalrats hat zu diesem Gesetzesvorschlag selbst schriftliche Stellungnahmen eingeholt; ein Ministerialentwurf in Begutachtung ist davor nicht erkennbar. Vorgeschrieben ist eine Begutachtung nicht, und Stellungnahmen an den Nationalrat sind während des Verfahrens möglich (§ 23b GOG-NR).',
  },
  /** A Salzburg law the evidence calls „ohne Begutachtung" (`LandLawPage`). */
  'ohne-begutachtung-land': {
    label: 'Was „ohne Begutachtung“ heißt',
    definition:
      'Im Register des Landes steht kein zugeordneter oder ähnlich benannter Entwurf, und die Unterlagen des Landtags berichten über keine Begutachtung.',
  },
  /** Every other Landesgesetz without a joined draft (`LandLawPage`); from the
   *  list's fold „Wie vollständig die Länder-Entwürfe sind" (until 14.11.2026). */
  'ohne-zugeordneten-entwurf': {
    label: 'Was „ohne zugeordneten Entwurf“ heißt',
    definition:
      'Diesem Landesgesetz ist kein Entwurf aus dem Register des Landes zugeordnet. So heißt es nur, wo das Land seine Entwürfe zwei Jahre vor dem Gesetz noch zeigt; wo es sie früher abnimmt (Niederösterreich, Vorarlberg, Wien und die Gesetze Tirols), heißt es nur „Landesgesetz“, weil es einen Entwurf gegeben haben kann. Ob eine Begutachtung stattfand, sagt der Monitor nur für Salzburg, aus den Erläuterungen der Regierungsvorlage; die Unterlagen der anderen Landtage liest er für diese Frage nicht.',
  },
} as const satisfies Record<string, Term>

export type TermKey = keyof typeof TERMS

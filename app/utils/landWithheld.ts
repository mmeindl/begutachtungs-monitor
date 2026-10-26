/**
 * The §§ a Land's Textgegenüberstellung changes and its comparison does not
 * show (`LandLawDiffResponse.withheld`), as `LandLawDiffSection` lists them
 * under the law they belong to.
 *
 * Pure: no Vue, no Nuxt — tests/landWithheld.test.ts runs it as it is.
 */
import type { LandLawDiffResponse } from '#shared/types'

export type LandWithheld = LandLawDiffResponse['withheld'][number]

/**
 * The withheld §§ by the group they are counted in: the law the server
 * files each under. Only a § filed under NO law joins the one group the
 * comparison shows, where there is one; a § of another law is that law's,
 * in a group of its own — Kärnten 38532/2024 counted the
 * Wildschadensfondsgesetz's §§ 1, 3 and 4 under the Jagdgesetz, the only
 * group with a § shown, and named „§ 4" there twice (25.10.2026).
 */
export function withheldGroups(withheld: readonly LandWithheld[], shownLaws: readonly (string | null)[]): Map<string, LandWithheld[]> {
  const keys = new Set(shownLaws.map((l) => l ?? ''))
  const only = keys.size === 1 ? [...keys][0]! : null
  const out = new Map<string, LandWithheld[]>()
  for (const w of withheld) {
    const key = w.law ? w.law : (only ?? '')
    out.set(key, [...(out.get(key) ?? []), w])
  }
  return out
}

/** Why a § is withheld, `standing` where the server gives no reason: RIS refused its text in force. */
export type WithheldCause = NonNullable<LandWithheld['reason']> | 'standing'

/**
 * What the page says of the withheld §§ of one cause: the words before the
 * list („Nicht gezeigt: § 3 und § 7."), and the sentence after it, for one §
 * and for several. Each sentence must be true of every § it follows — until
 * 25.10.2026 one sentence, „Die Novelle ändert dort einzelne Wörter oder
 * Sätze", stood after every § the reader did not compose, whatever the
 * cause. What the monitor did not find is said as its finding, never as the
 * Land's error; where the cause may be our reading of the PDF, the sentence
 * says so.
 *
 * THE ONLY PLACE these causes are worded, as `annexNotes.ts` is for the
 * Bund's annex.
 */
const NOTES: Record<WithheldCause, { lead: string; one: string; many: string }> = {
  standing: {
    lead: 'Nicht gezeigt:',
    one: 'Seinen geltenden Text fand der Monitor im RIS nicht wortgleich',
    many: 'Ihren geltenden Text fand der Monitor im RIS nicht wortgleich',
  },
  inserted: {
    lead: 'Nicht gezeigt:',
    one: 'Die Textgegenüberstellung führt ihn als neu; dass das geltende Recht ihn noch nicht enthält, konnte der Monitor im RIS nicht bestätigen',
    many: 'Die Textgegenüberstellung führt sie als neu; dass das geltende Recht sie noch nicht enthält, konnte der Monitor im RIS nicht bestätigen',
  },
  elided: {
    lead: 'Nicht gezeigt:',
    one: 'Die Textgegenüberstellung lässt seinen geltenden Text aus, und im RIS fand der Monitor ihn unter diesem Gesetz nicht',
    many: 'Die Textgegenüberstellung lässt ihren geltenden Text aus, und im RIS fand der Monitor sie unter diesem Gesetz nicht',
  },
  deletion: {
    lead: 'Nicht gezeigt:',
    one: 'Für ihn fand der Monitor weder einen neuen Text noch im Entwurf die Anordnung, dass er entfällt – das kann daran liegen, wie der Monitor das PDF liest',
    many: 'Für sie fand der Monitor weder einen neuen Text noch im Entwurf die Anordnung, dass sie entfallen – das kann daran liegen, wie der Monitor das PDF liest',
  },
  twice: {
    lead: 'Nicht gezeigt:',
    one: 'Er steht in der Textgegenüberstellung mehrfach, und welche Stelle welche Fassung zeigt, liest der Monitor nicht sicher heraus',
    many: 'Sie stehen in der Textgegenüberstellung mehrfach, und welche Stelle welche Fassung zeigt, liest der Monitor nicht sicher heraus',
  },
  unsure: {
    lead: 'Nicht gezeigt:',
    one: 'Seinen Text oder die Änderungszeichen darin liest der Monitor aus der Textgegenüberstellung nicht sicher heraus',
    many: 'Ihren Text oder die Änderungszeichen darin liest der Monitor aus der Textgegenüberstellung nicht sicher heraus',
  },
  unchecked: {
    lead: 'Nicht gezeigt:',
    one: 'Beim Abgleich antwortete eine Quelle nicht, das RIS oder die Seite des Landes; der Monitor prüft beim nächsten Aufruf erneut',
    many: 'Beim Abgleich antwortete eine Quelle nicht, das RIS oder die Seite des Landes; der Monitor prüft beim nächsten Aufruf erneut',
  },
  wording: {
    lead: 'Ebenfalls geändert, hier nicht gezeigt:',
    one: 'Die Novelle ändert dort einzelne Wörter, Sätze oder Ziffern; den neuen Wortlaut setzt der Monitor nicht selbst zusammen',
    many: 'Die Novelle ändert dort einzelne Wörter, Sätze oder Ziffern; den neuen Wortlaut setzt der Monitor nicht selbst zusammen',
  },
  unread: {
    lead: 'Ebenfalls geändert, hier nicht gezeigt:',
    one: 'Seinen neuen Wortlaut setzt der Monitor aus den Änderungsanweisungen der Novelle nicht selbst zusammen',
    many: 'Ihren neuen Wortlaut setzt der Monitor aus den Änderungsanweisungen der Novelle nicht selbst zusammen',
  },
  division: {
    lead: 'Ebenfalls geändert, hier nicht gezeigt:',
    one: 'Die Novelle fasst den Teil des Gesetzes, in dem er steht, als Ganzes neu, fügt ihn ein oder hebt ihn auf; was dabei aus ihm wird, setzt der Monitor nicht einzeln zusammen',
    many: 'Die Novelle fasst den Teil des Gesetzes, in dem sie stehen, als Ganzes neu, fügt ihn ein oder hebt ihn auf; was dabei aus ihnen wird, setzt der Monitor nicht einzeln zusammen',
  },
  gap: {
    lead: 'Ebenfalls geändert, hier nicht gezeigt:',
    one: 'Nicht jede Änderungsanweisung der Novelle zu diesem Gesetz fand der Monitor in der Textgegenüberstellung an ihrer Stelle; ohne sie setzt er keinen neuen Wortlaut zusammen',
    many: 'Nicht jede Änderungsanweisung der Novelle zu diesem Gesetz fand der Monitor in der Textgegenüberstellung an ihrer Stelle; ohne sie setzt er keinen neuen Wortlaut zusammen',
  },
  annex: {
    lead: 'Nicht gezeigt:',
    one: 'Anlagen und Anhänge gleicht der Monitor nicht mit dem RIS ab und zeigt sie deshalb nicht',
    many: 'Anlagen und Anhänge gleicht der Monitor nicht mit dem RIS ab und zeigt sie deshalb nicht',
  },
  // One per law (`tguParagraphs`): the id is „Titel".
  title: {
    lead: 'Nicht gezeigt:',
    one: 'Den Titel des Gesetzes gleicht der Monitor nicht mit dem RIS ab und zeigt ihn deshalb nicht',
    many: 'Den Titel des Gesetzes gleicht der Monitor nicht mit dem RIS ab und zeigt ihn deshalb nicht',
  },
}

/** The order the causes stand in under a law: what RIS or the reading refused, then what the reader does not compose. */
const ORDER: WithheldCause[] = ['unchecked', 'standing', 'inserted', 'elided', 'deletion', 'twice', 'unsure', 'division', 'gap', 'wording', 'unread', 'annex', 'title']

/**
 * The withheld §§ of one group by cause, in `ORDER`, each with its words.
 * `alone`: no § of the comparison is shown, so nothing is „ebenfalls" changed.
 */
export function withheldNotes(items: readonly LandWithheld[], { alone = false } = {}): { cause: WithheldCause; ids: string[]; fromIds: (string | null)[]; lead: string; text: string; pronoun: 'ihn' | 'sie' }[] {
  const byCause = new Map<WithheldCause, LandWithheld[]>()
  for (const w of items) {
    const cause: WithheldCause = w.reason ?? 'standing'
    byCause.set(cause, [...(byCause.get(cause) ?? []), w])
  }
  return ORDER.filter((c) => byCause.has(c)).map((cause) => {
    const listed = byCause.get(cause)!
    const ids = listed.map((w) => w.id)
    const note = NOTES[cause] ?? NOTES.standing
    const lead = alone ? note.lead.replace(/^Ebenfalls geändert/, 'Geändert') : note.lead
    // „Die Textgegenüberstellung des Landes zeigt ihn" — a Paragraph, an Artikel; an Anlage is „sie".
    // `fromIds`: the number a renumbered § has in force, named „§ 13 → § 9" as the comparison shows it (26.10.2026).
    return { cause, ids, fromIds: listed.map((w) => w.fromId ?? null), lead, text: ids.length === 1 ? note.one : note.many, pronoun: ids.length === 1 && cause !== 'annex' ? 'ihn' as const : 'sie' as const }
  })
}

/**
 * An instruction of the Novelle that reaches §§ it does not name, said for
 * its law (26.10.2026) — „Im V. Abschnitt wird jeweils …", „Im ganzen Gesetz
 * …", or one that changes another Novelle's article — or the sentence that
 * repeals a law whole: quoted as the document prints it, so the §§ listed
 * are not read as all it changes. The sentence after it says nothing of §§,
 * since not every such instruction reaches one — and stands not after a
 * repeal, where no wording is left to compose (`repeal`, 26.10.2026).
 */
export function reachesNote(): { lead: string; after: string } {
  return { lead: 'Außerdem ordnet die Novelle an:', after: 'Den Wortlaut, der sich daraus ergibt, setzt der Monitor nicht selbst zusammen.' }
}

/**
 * A law the draft enacts anew, where the Textgegenüberstellung does not
 * print its text (Kärnten, 26.10.2026) — the sense of the Bund's
 * `neu-erlassen`, said for what the Land's document does.
 */
export function enactedNote(): string {
  return 'Dieses Gesetz erlässt der Entwurf neu. Seinen ganzen Text enthält der Entwurf selbst, nicht die Textgegenüberstellung; der Monitor vergleicht hier nur Änderungen bestehender Gesetze.'
}

/** An instruction as the note quotes it: one whose text follows its colon („Der 4. Abschnitt lautet:") with the text left out, „…". */
export function quotedInstruction(instruction: string): string {
  return /:$/.test(instruction.trim()) ? `${instruction.trim()} …` : instruction.trim()
}

/** One instruction as a group lists it: its words, and whether it repeals a law whole. */
export interface Reach { instruction: string; repeal: boolean }

/** The instructions of `reaches` that belong to a group — the law each is said for (`withheldGroups`' rule), each once. */
export function reachesGroups(reaches: readonly { law: string | null; instruction: string; repeal?: true }[], shownLaws: readonly (string | null)[]): Map<string, Reach[]> {
  const keys = new Set(shownLaws.map((l) => l ?? ''))
  const only = keys.size === 1 ? [...keys][0]! : null
  const out = new Map<string, Reach[]>()
  for (const r of reaches) {
    const key = r.law ? r.law : (only ?? '')
    const listed = out.get(key) ?? []
    if (!listed.some((x) => x.instruction === r.instruction)) out.set(key, [...listed, { instruction: r.instruction, repeal: !!r.repeal }])
  }
  return out
}

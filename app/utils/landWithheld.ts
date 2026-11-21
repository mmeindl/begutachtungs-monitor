/**
 * The §§ a Land's Textgegenüberstellung changes and its comparison does not
 * show (`LandLawDiffResponse.withheld`), as `LandLawDiffSection` lists them
 * under the law they belong to.
 *
 * Pure: no Vue, no Nuxt — tests/landWithheld.test.ts runs it as it is.
 */
import type { LandLawDiffResponse } from '#shared/types'
import { gapDe } from '#shared/utils/gaps'
import { displayId, renumberedFrom } from '#shared/utils/unitName'

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

/**
 * Whether a search keeps a withheld § (20.11.2026): by its designation —
 * as the response carries it („§13") and as the page prints it („§ 13"),
 * old or new number — or by its law, as the Bund's annex keeps a withheld
 * row by its `para` and `law` (`TextComparisonSection`). It has no text to
 * be found by. Until then a search dropped every withheld §, and where none
 * shown matched the page said „Nichts gefunden." of a § it names. `q`:
 * the query, trimmed.
 */
export function withheldMatches(w: LandWithheld, q: string): boolean {
  const ids = [w.id, w.fromId].filter((id): id is string => !!id)
  return [...ids, ...ids.map(displayId), w.law].filter(Boolean).join('\n').toLowerCase().includes(q.toLowerCase())
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
  // The Bund's „nicht im Entwurf" (12.11.2026): said as our finding, with our reading named as a cause.
  // „Einen Teil": the rule fires where too much is missing (`landTguGuard.ts`), not only where all is.
  notInDraft: {
    lead: 'Nicht gezeigt:',
    one: 'Einen Teil dessen, was die Textgegenüberstellung bei ihm als neu zeigt, fand der Monitor im Entwurf an dieser Stelle nicht – das kann daran liegen, wie der Monitor die beiden Texte liest',
    many: 'Einen Teil dessen, was die Textgegenüberstellung bei ihnen als neu zeigt, fand der Monitor im Entwurf an diesen Stellen nicht – das kann daran liegen, wie der Monitor die beiden Texte liest',
  },
  // The strict check (20.11.2026, `landTguStrict.ts`): one word or number is enough, so no „einen Teil"; whose deviation it is, the monitor does not know.
  draftDiffers: {
    lead: 'Nicht gezeigt:',
    one: 'Was die Textgegenüberstellung bei ihm als neu zeigt, stimmt nicht Wort für Wort mit dem Wortlaut überein, den der Entwurf für ihn schreibt – das kann an den beiden Dokumenten liegen oder daran, wie der Monitor sie liest',
    many: 'Was die Textgegenüberstellung bei ihnen als neu zeigt, stimmt nicht Wort für Wort mit dem Wortlaut überein, den der Entwurf für sie schreibt – das kann an den beiden Dokumenten liegen oder daran, wie der Monitor sie liest',
  },
  // The draft's instructions name it, the document does not print it where the monitor reads it (21.11.2026, `unprintedInstructed`):
  // „diese Stelle", since an Anlage stands here as a § does; whose gap it is, the monitor does not know.
  unprinted: {
    lead: 'Nicht gezeigt:',
    one: 'Der Entwurf ändert diese Stelle; in der Textgegenüberstellung fand der Monitor sie nicht – das kann an der Textgegenüberstellung liegen oder daran, wie der Monitor sie liest',
    many: 'Der Entwurf ändert diese Stellen; in der Textgegenüberstellung fand der Monitor sie nicht – das kann an der Textgegenüberstellung liegen oder daran, wie der Monitor sie liest',
  },
  // A station pair (19.11.2026, `announcedText.ts`): one side's reader did not find what the instruction announces, so the diff would show it as new or gone.
  announced: {
    lead: 'Nicht gezeigt:',
    one: 'Den Text, den diese Anweisung ankündigt – etwa eine Zeile einer Tabelle oder des Inhaltsverzeichnisses –, fand der Monitor in einem der beiden Dokumente nicht an seiner Stelle, und ein Vergleich würde ihn als neu oder als entfallen zeigen. Das liegt daran, wie der Monitor die Dokumente liest',
    many: 'Den Text, den diese Anweisungen ankündigen – etwa Zeilen einer Tabelle oder des Inhaltsverzeichnisses –, fand der Monitor in einem der beiden Dokumente nicht an seiner Stelle, und ein Vergleich würde ihn als neu oder als entfallen zeigen. Das liegt daran, wie der Monitor die Dokumente liest',
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
  // A Landesgesetz's page (12.11.2026): what RIS and the Landesgesetzblatt do not agree on is not compared.
  // „Nicht gezeigt:" as every cause of the list (21.11.2026): „Nicht verglichen:" was a lead of its own, outside the rule.
  uninstructed: {
    lead: 'Nicht gezeigt:',
    one: 'Das RIS ordnet seine Fassung diesem Landesgesetzblatt zu, aber keine Anweisung des Landesgesetzblatts nennt ihn',
    many: 'Das RIS ordnet ihre Fassung diesem Landesgesetzblatt zu, aber keine Anweisung des Landesgesetzblatts nennt sie',
  },
  // „Seine Fassungen", not „seine Fassung davor und danach" (20.11.2026): a § the Landesgesetzblatt repeals has none after it.
  unpaired: {
    lead: 'Nicht gezeigt:',
    one: 'Eine Anweisung des Landesgesetzblatts nennt ihn; seine Fassungen im RIS fand der Monitor nicht so, dass er sie eindeutig gegenüberstellen kann',
    many: 'Anweisungen des Landesgesetzblatts nennen sie; ihre Fassungen im RIS fand der Monitor nicht so, dass er sie eindeutig gegenüberstellen kann',
  },
  // No instruction's law matched to the §'s law, or no instruction read at all (20.11.2026): nothing is said of an instruction naming it.
  lawUnmatched: {
    lead: 'Nicht gezeigt:',
    one: 'Das RIS ordnet seine Fassung diesem Landesgesetzblatt zu, aber welche Anweisungen des Landesgesetzblatts sein Gesetz betreffen, konnte der Monitor nicht sicher feststellen',
    many: 'Das RIS ordnet ihre Fassung diesem Landesgesetzblatt zu, aber welche Anweisungen des Landesgesetzblatts ihr Gesetz betreffen, konnte der Monitor nicht sicher feststellen',
  },
  // A „lautet:" instruction's own wording not in the version RIS ties to the Landesgesetzblatt (22.11.2026, `lautetMissing`):
  // the monitor's finding, not whose deviation it is — a wording that expired (Wien LGBl. Nr. 45/2020) reads the same as a reading of ours.
  wordingNotInRis: {
    lead: 'Nicht gezeigt:',
    one: 'Das Landesgesetzblatt gibt für ihn einen Wortlaut vor, den der Monitor in der Fassung, die das RIS diesem Landesgesetzblatt zuordnet, nicht vollständig fand',
    many: 'Das Landesgesetzblatt gibt für sie einen Wortlaut vor, den der Monitor in den Fassungen, die das RIS diesem Landesgesetzblatt zuordnet, nicht vollständig fand',
  },
  // A law the Landesgesetzblatt enacts anew (19.11.2026): no instruction names its §§, and there is nothing before.
  enactedUnread: {
    lead: 'Nicht gezeigt:',
    one: 'Das Landesgesetzblatt erlässt ihn neu; seinen Text fand der Monitor im RIS nicht in einer Fassung, die er sicher lesen kann',
    many: 'Das Landesgesetzblatt erlässt sie neu; ihren Text fand der Monitor im RIS nicht in einer Fassung, die er sicher lesen kann',
  },
  // One per law (`tguParagraphs`): the id is „Titel".
  title: {
    lead: 'Nicht gezeigt:',
    one: 'Den Titel des Gesetzes gleicht der Monitor nicht mit dem RIS ab und zeigt ihn deshalb nicht',
    many: 'Den Titel des Gesetzes gleicht der Monitor nicht mit dem RIS ab und zeigt ihn deshalb nicht',
  },
}

/** The order the causes stand in under a law: what RIS or the reading refused, then what the reader does not compose. */
const ORDER: WithheldCause[] = ['unchecked', 'unpaired', 'lawUnmatched', 'uninstructed', 'wordingNotInRis', 'enactedUnread', 'standing', 'inserted', 'elided', 'deletion', 'notInDraft', 'draftDiffers', 'unprinted', 'announced', 'twice', 'unsure', 'division', 'gap', 'wording', 'unread', 'annex', 'title']

/**
 * The numbers other §§ of a group move to: „§ 34 → § 33" makes § 33 one
 * (26.10.2026). A § of the group that keeps such a number without moving is
 * the one in force there, struck or not read, and the page names it „§ 33
 * (alt)" (`IN_FORCE_MARK`) — beside the moved one it read as the same §
 * (Tirol 575; Oö. 16120's struck §§ 9 to 12 beside §§ 13 to 16, which
 * become §§ 9 to 12).
 */
export function moveTargets(entries: readonly { id: string; fromId?: string | null }[]): Set<string> {
  return new Set(entries.filter((e) => renumberedFrom(e.fromId, e.id)).map((e) => e.id))
}

/** What follows such a §'s number: „§ 33 (alt)". */
export const IN_FORCE_MARK = '(alt)'

/**
 * The withheld §§ of one group by cause, in `ORDER`, each with its words.
 * `alone`: no § of the comparison is shown, so nothing is „ebenfalls" changed.
 * `movedTo`: the group's `moveTargets` — a § withheld under one of those
 * numbers that does not move itself, and that the document does not print
 * as new, is the one in force there (`inForce`).
 */
export function withheldNotes(items: readonly LandWithheld[], { alone = false, movedTo = new Set<string>() }: { alone?: boolean; movedTo?: ReadonlySet<string> } = {}): { cause: WithheldCause; ids: string[]; fromIds: (string | null)[]; inForce: boolean[]; lead: string; text: string; pronoun: 'ihn' | 'sie' }[] {
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
    const inForce = listed.map((w) => !w.fromId && w.reason !== 'inserted' && movedTo.has(w.id))
    return { cause, ids, fromIds: listed.map((w) => (renumberedFrom(w.fromId, w.id) ? w.fromId! : null)), inForce, lead, text: ids.length === 1 ? note.one : note.many, pronoun: ids.length === 1 && cause !== 'annex' ? 'ihn' as const : 'sie' as const }
  })
}

/**
 * The instructions of a station pair that are shown, and whose announced
 * text neither side's reader found in its place (`unreadAnnounced`,
 * 19.11.2026): „Nicht lesbar: Z 1 und Z 4. …" — a gap sentence, since the
 * rest of each instruction is compared and only that text is not. Null
 * where there are none. Ids as the comparison names them (`displayId`).
 */
export function unreadAnnouncedNote(ids: readonly string[]): string | null {
  if (!ids.length) return null
  const named = ids.map(displayId)
  const list = named.length === 1 ? named[0]! : `${named.slice(0, -1).join(', ')} und ${named.at(-1)}`
  const text = ids.length === 1
    ? 'Den Text, den diese Anweisung ankündigt – etwa einen Eintrag im Inhaltsverzeichnis –, fand der Monitor in keinem der beiden Dokumente an seiner Stelle; verglichen ist der Rest der Anweisung, dieser Text nicht.'
    : 'Den Text, den diese Anweisungen ankündigen – etwa Einträge im Inhaltsverzeichnis –, fand der Monitor in keinem der beiden Dokumente an seiner Stelle; verglichen ist der Rest der Anweisungen, dieser Text nicht.'
  return gapDe('unreadable', `${list}. ${text}`)
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

/**
 * Where the draft renumbers §§ and the comparison could not pair one of them
 * old → new (`LandLawDiffResponse.renumbered`, 26.10.2026): said above the
 * list, as a warning that a § may stand beside the one that takes its
 * number. One such sentence of the draft's quoted, as it prints it — and
 * true beside the moves the list does show, „§ 16 → § 18".
 */
export function renumberedNote(sentences: readonly string[]): string | null {
  if (!sentences.length) return null
  return `Die Novelle nummeriert Paragraphen um. Wo der Monitor einen Paragraphen in der Textgegenüberstellung nicht seiner neuen Nummer zuordnen kann, etwa bei „${sentences[0]}“, stellt er ihn nach seiner Nummer gegenüber, nicht nach seiner Herkunft.`
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

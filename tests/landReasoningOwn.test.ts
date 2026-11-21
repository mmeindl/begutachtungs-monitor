/**
 * A Land's Begründungsvergleich at the § of a law enacted anew (21.11.2026):
 * the unit takes the passages titled by its own designation on each side
 * (`joinOwnParagraph` via `compareReasoningByParagraph`'s `own`), by the
 * Bund's rules and, in a package, only where the passage's Artikel is the
 * unit's. Through `compareLandReasoning` with the PDFs' pages and the
 * comparison handed in, so the Land's reading of its Erläuterungen runs as
 * it is.
 */
import { describe, expect, it, vi } from 'vitest'
import type { LandDraftDetail, LandLawDiffResponse, LawDiffUnit } from '../shared/types'
import { diffUnitKey } from '../shared/utils/diffKey'

vi.stubGlobal('defineCachedFunction', <A extends unknown[], T>(fn: (...a: A) => Promise<T>) => fn)
const { compareLandReasoning } = await import('../server/utils/laender/landReasoningService')

const DRAFT = 'https://service.salzburg.gv.at/pub/get/9001'
const DRAFT_ERL = 'https://service.salzburg.gv.at/pub/get/9002'
const RV = 'https://www.salzburg.gv.at/00201lpi/beispiel/9.pdf'
const RV_ERL = 'https://service.salzburg.gv.at/pub/get/9003'
const TITLE = 'Gesetz über das Beispiel im Land Salzburg (Salzburger Beispielgesetz)'

const detail = {
  draft: {
    title: TITLE,
    documents: [
      { title: 'Entwurf', url: DRAFT },
      { title: 'Erläuterungen', url: DRAFT_ERL },
      { title: 'Regierungsvorlage, Erläuterungen', url: RV_ERL },
    ],
  },
  procedure: [{ station: 'rv', url: RV, label: 'Regierungsvorlage' }],
  comparisons: [['entwurf', 'rv']],
} as unknown as LandDraftDetail

const LAW = `Gesetz vom ……… über das Beispiel\nDer Salzburger Landtag hat beschlossen:\n§ 1\nText.`
/** A text's Erläuterungen with the particular part given. */
const erl = (particular: string) => [`Erläuterungen\n1. Allgemeines:\nDas Gesetz regelt das Beispiel.\nBesonderer Teil\n${particular}`]

/** A unit of the comparison: a § of the new law, or an instruction of a package's other law. */
function unit(id: string, change: LawDiffUnit['change'] = 'changed', o: { article?: string; key?: string; text?: string } = {}): LawDiffUnit {
  return {
    article: o.article ?? TITLE,
    articleKey: o.key ?? null,
    fromArticleKey: change === 'inserted' ? null : (o.key ?? null),
    id,
    fromId: change === 'inserted' ? null : id,
    heading: null,
    quotedHeading: null,
    change,
    editorial: false,
    fromText: change === 'inserted' ? null : (o.text ?? `${id} alt`),
    toText: change === 'removed' ? null : (o.text ?? `${id} neu`),
    segments: null,
  }
}

async function compare(units: LawDiffUnit[], draftParticular: string, rvParticular: string) {
  const pages: Record<string, string[]> = { [DRAFT]: [LAW], [RV]: [LAW], [DRAFT_ERL]: erl(draftParticular), [RV_ERL]: erl(rvParticular) }
  const comparison = { available: true, unavailableReason: null, units } as unknown as LandLawDiffResponse
  return compareLandReasoning('sbg', '9001', detail, { pagesOf: async (url) => pages[url]!, comparison: async () => comparison })
}

/** The entry a unit points at. */
const entryAt = (r: Awaited<ReturnType<typeof compare>>, u: LawDiffUnit) => {
  const key = r.units[diffUnitKey(u)]
  return key ? r.entries[key]! : null
}

describe('Begründungsvergleich eines Landes — der § eines neuen Gesetzes (21.11.2026)', () => {
  it('compares the passages titled by the § on both sides: a changed Begründung and an unchanged one', async () => {
    const one = unit('§1')
    const two = unit('§2')
    const r = await compare(
      [one, two],
      'Zu § 1 (Ziel):\nDie Bestimmung regelt den Zweck des Gesetzes.\nZu § 2 (Begriffe):\nDie Begriffe werden bestimmt.',
      'Zu § 1 (Ziel):\nDie Bestimmung regelt den Zweck und die Ziele des Gesetzes.\nZu § 2 (Begriffe):\nDie Begriffe werden bestimmt.',
    )
    expect(r.available).toBe(true)
    expect(entryAt(r, one)).toMatchObject({ basis: 'paragraph', comparable: true, changed: true })
    expect(entryAt(r, two)).toMatchObject({ basis: 'paragraph', comparable: true, changed: false })
    expect(r.stats).toMatchObject({ compared: 2, changed: 1, uncompared: 0 })
    expect(r.gaps).toEqual({})
  })

  it('shows a regrouping without a verdict: two passages in the draft, one for both §§ in the Vorlage', async () => {
    const one = unit('§1')
    const two = unit('§2')
    const r = await compare(
      [one, two],
      'Zu § 1:\nDie Bestimmung regelt den Zweck.\nZu § 2:\nDie Begriffe werden bestimmt.',
      'Zu §§ 1 und 2:\nDie Bestimmungen regeln den Zweck und die Begriffe.',
    )
    expect(entryAt(r, one)).toMatchObject({ comparable: false, changed: false })
    expect(entryAt(r, two)).toMatchObject({ comparable: false, changed: false })
    expect(r.stats.compared).toBe(0)
  })

  it('beside a regrouping alone, says at a change whose Begründung it could not attach that it could not', async () => {
    const one = unit('§1')
    const two = unit('§2')
    const three = unit('§3')
    const r = await compare([one, two, three], 'Zu § 1:\nDer Zweck.\nZu § 2:\nDie Begriffe.', 'Zu §§ 1 und 2:\nDer Zweck und die Begriffe.')
    expect(r.stats).toMatchObject({ compared: 0, uncompared: 2 })
    expect(r.gaps).toEqual({ [diffUnitKey(three)]: 'unread' })
  })

  it('reads a new law\'s „Zu Z 1 („…“):" below its § as part of that §\'s Begründung, not as an instruction\'s passage', async () => {
    const definitions = unit('§3')
    const items = (word: string) => `Zu § 3 (Begriffsbestimmungen):\nDie Begriffe werden bestimmt.\nZu Z 1 („Spielkunde“):\nDer Begriff umfasst jede Person, ${word}.\nZu Z 2 („Transaktion“):\nDer Begriff folgt der Richtlinie.`
    const r = await compare([definitions], items('die spielt'), items('die an einem Spiel teilnimmt'))
    expect(entryAt(r, definitions)).toMatchObject({ comparable: true, changed: true })
  })

  it('takes no answer to the statements as a §\'s Begründung: a § heading that runs on into prose joins nothing', async () => {
    const one = unit('§1')
    const passage = 'Zu § 1 (Ziel):\nDie Bestimmung regelt den Zweck des Gesetzes.'
    // A Vorlage's „Ergebnis des Begutachtungsverfahrens", which the reader takes into the particular part (Salzburg 34234).
    const r = await compare([one], passage, `Zu § 1: Zur Anregung der Fraktion der Personalvertretung ist festzuhalten, dass\ndie Bestimmung bleibt.\n${passage}`)
    expect(entryAt(r, one)).toMatchObject({ comparable: true, changed: false })
  })

  it('compares the prose a sub-heading runs on into: it is the first sentence of that passage', async () => {
    const one = unit('§1')
    const passage = (month: string) => `Zu § 1 (Ziel):\nDie Bestimmung regelt den Zweck.\nZu Abs. 2: Die Übermittlung der Daten an die genannten Stellen ist ab ${month}\nzulässig und notwendig.`
    const r = await compare([one], passage('Jänner'), passage('April'))
    expect(entryAt(r, one)).toMatchObject({ comparable: true, changed: true })
  })

  it('reads no motion of the Landesregierung as part of the last §\'s Begründung', async () => {
    const last = unit('§14')
    const passage = 'Zu § 14 (Inkrafttreten):\nDas Gesetz soll mit 28. August 2025 in Kraft treten.'
    const r = await compare([last], passage, `${passage}\nDie Landesregierung stellt sohin den\nAntrag,\nder Salzburger Landtag wolle beschließen:\n1. Das vorstehende Gesetz wird zum Beschluss erhoben.`)
    expect(entryAt(r, last)).toMatchObject({ comparable: true, changed: false })
  })

  it('gives a § only one side has no entry', async () => {
    const one = unit('§1')
    const added = unit('§3', 'inserted')
    const r = await compare([one, added], 'Zu § 1:\nDer Zweck.', 'Zu § 1:\nDer Zweck.\nZu § 3:\nDie neue Bestimmung.')
    expect(entryAt(r, one)).toMatchObject({ comparable: true, changed: false })
    expect(entryAt(r, added)).toBeNull()
  })

  it('in a package, joins a § only under its own Artikel: not the other law\'s passage of the same number, not a passage under no Artikel', async () => {
    const own = unit('§3', 'changed', { article: 'Artikel I', key: '1' })
    const unique = unit('§4', 'changed', { article: 'Artikel I', key: '1' })
    const other = unit('Z1', 'changed', { article: 'Artikel II', key: '2', text: '1. Im § 3 Abs. 1 wird das Wort „alt“ durch das Wort „neu“ ersetzt.' })
    const particular = (word: string) =>
      [
        'Zu § 4:',
        `Diese Passage steht unter keinem Artikel, ${word}.`,
        'Zu Artikel I (Salzburger Beispielgesetz):',
        'Zu § 3:',
        `Die Begründung des neuen Gesetzes, ${word}.`,
        'Zu Artikel II (Änderung des Salzburger Anderengesetzes):',
        'Zu § 3:',
        `Die Begründung des anderen Gesetzes, ${word}.`,
      ].join('\n')
    const r = await compare([own, unique, other], particular('alt'), particular('neu'))
    const at3 = entryAt(r, own)
    expect(at3).toMatchObject({ comparable: true, changed: true })
    const words = (at3!.segments ?? []).map((s) => s.text).join(' ')
    expect(words).toContain('des neuen Gesetzes')
    expect(words).not.toContain('des anderen Gesetzes')
    expect(entryAt(r, unique)).toBeNull()
    // The other law's instruction on § 3: the § join keeps out of a number two laws carry, as before.
    expect(entryAt(r, other)).toBeNull()
  })
})

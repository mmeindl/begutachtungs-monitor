import { describe, expect, it } from 'vitest'
import { landPairChecks, numbersOnly, pairsPerLand, recurringRuns, type RunUnit } from '../scripts/lib/landStationChecks'
import { comparedText, diffLandDraft, landDraftUnits } from '../server/utils/laender/landLawDiff'
import type { LawUnit } from '../server/utils/lawtext/lawUnits'

const page = (...lines: string[]) => lines.join('\n')

/* A changed unit of a station pair: its Land, its draft, and the runs the
   comparison shows inserted („+…") or removed („-…"). */
const unit = (land: string, draft: string, ...runs: string[]): RunUnit => ({
  land,
  draft,
  change: 'changed',
  segments: runs.map((r) => ({ type: r.startsWith('+') ? 'inserted' : 'removed', text: r.slice(1) })),
})

describe('recurringRuns — the same short run inserted or removed across a Land\'s drafts (20.11.2026)', () => {
  /* The shapes Kärnten's session stamp left in the station pairs before the
     reader dropped it (ktn-104907-2025-32 Artikel III Z 4 and Z 12: the stamp
     alone; Z 7: the stamp beside a real change). */
  const stamp = [
    unit('ktn', 'ktn-104907-2025-32', '+REG.SITZG.'),
    unit('ktn', 'ktn-104907-2025-32', '+REG.SITZG.', '+Nr.', '+2024/1233'),
    unit('ktn', 'ktn-18119-2023-83', '+REG.SITZG.', '-spätestens eine Woche', '+ehestmöglich'),
    unit('ktn', 'ktn-61525-2024-53', '+REG.SITZG.', '+REG.SITZG.'),
  ]

  it('finds a run in three drafts that is the only change of at least one unit, and names those units', () => {
    const [hit, ...rest] = recurringRuns(stamp)
    expect(rest).toEqual([])
    expect(hit).toMatchObject({ land: 'ktn', side: 'inserted', text: 'REG.SITZG.', drafts: 3, units: 4 })
    // The units it is the only change of, the run twice included.
    expect(hit!.only).toEqual([stamp[0], stamp[3]])
  })

  it('needs three drafts, not three units', () => {
    expect(recurringRuns(stamp.filter((u) => u.draft !== 'ktn-61525-2024-53'))).toEqual([])
  })

  it('needs the run to stand alone somewhere: beside real changes everywhere it proves nothing', () => {
    expect(recurringRuns([stamp[1]!, stamp[2]!, unit('ktn', 'ktn-1', '+REG.SITZG.', '-alt')])).toEqual([])
  })

  it('counts each Land and each side apart', () => {
    const mixed = [unit('ktn', 'ktn-1', '+REG.SITZG.'), unit('ktn', 'ktn-2', '-REG.SITZG.'), unit('sbg', 'sbg-3', '+REG.SITZG.')]
    expect(recurringRuns(mixed)).toEqual([])
  })

  it('leaves out a run with a digit or longer than 40 characters, and a unit that is not „geändert"', () => {
    const three = (run: string) => ['ktn-1', 'ktn-2', 'ktn-3'].map((d) => unit('ktn', d, run))
    expect(recurringRuns(three('+LGBl Nr 12/2025'))).toEqual([])
    expect(recurringRuns(three(`+${'Wortfolge '.repeat(5)}`))).toEqual([])
    expect(recurringRuns(three('+REG.SITZG.').map((u) => ({ ...u, change: 'inserted' })))).toEqual([])
  })

  it('leaves out a run shorter than six characters: a corrected word or mark is wording, not furniture', () => {
    const three = (run: string) => ['sbg-1', 'sbg-2', 'sbg-3'].map((d) => unit('sbg', d, run))
    /* The runs the check found beside the stamp before it had a lower bound
       (ktn-61525-2024-53 „wird der im Eintrag", sbg-32374 „geregelt ist ist",
       „(§) 130", sbg-31395 „7. Im § 11", sbg-34443 „Die Ziffer 6 entfällt"). */
    for (const run of ['-der', '+der', '-die', '-ist', '-Im', '+Die', '+(§)']) expect(recurringRuns(three(run))).toEqual([])
    expect(recurringRuns(three('+Gesetz')).map((r) => r.text)).toEqual(['Gesetz'])
  })
})

describe('numbersOnly — a unit changed by nothing but bare numbers, inserted or removed', () => {
  const seg = (...runs: string[]) => runs.map((r) => ({ type: r.startsWith('+') ? 'inserted' as const : r.startsWith('-') ? 'removed' as const : 'equal' as const, text: r.slice(1) }))

  it('says „neu" where only numbers were inserted — a table value or an enumerator one reader dropped (K-TDBG § 10)', () => {
    expect(numbersOnly('changed', seg('=innerhalb von 14 Tagen ', '+1.', '=ab der Gewährung oder ', '+2.', '=ab Aus- oder Rückzahlung'))).toBe('neu')
  })

  it('says „weg" where only numbers were removed — the same fault seen from the other side', () => {
    expect(numbersOnly('changed', seg('=Stufe A ', '-100', '=Stufe B ', '-60 %'))).toBe('weg')
  })

  it('says nothing where a number changed, a word moved with it, or the unit is not „geändert"', () => {
    expect(numbersOnly('changed', seg('-60', '+80'))).toBeNull()
    expect(numbersOnly('changed', seg('-60', '-Prozent'))).toBeNull()
    expect(numbersOnly('changed', seg('-.', '-,'))).toBeNull()
    expect(numbersOnly('removed', seg('-60'))).toBeNull()
    expect(numbersOnly('changed', seg('=gleich'))).toBeNull()
  })
})

describe('landPairChecks — the Bund\'s checks over a Land pair (20.11.2026)', () => {
  /* Salzburg's Kehrgebietsverordnung (sbg-31933 § 1): the draft PDF prints
     „§ 1" over a sentence whose first line ends without punctuation. The
     reader took that line for the §'s title until 20.11.2026 (`pdf`, the
     fault rebuilt); the Landesgesetzblatt reads the sentence whole, with no
     title, and so does the reader since (`lgbl`). */
  const first = 'Für die Ausübung der sicherheitsrelevanten Tätigkeiten des Rauchfangkehrergewerbes im Sinn des'
  const lgbl = landDraftUnits([page('Verordnung des Landeshauptmannes von Salzburg über die Festlegung von Kehrgebieten', 'Auf Grund des § 120 Abs 1 GewO 1994 wird verordnet:',
    '§ 1', first,
    '§ 120 Abs 1 zweiter Satz GewO 1994 im Land Salzburg werden folgende Kehrgebiete festgelegt:', '1. Jene Gebiete der Stadtgemeinde Salzburg.')])!
  const pdf = lgbl.map((u) => ({ ...u, heading: first, text: u.text.slice(first.length + 1) }))
  const checks = (from: LawUnit[], to: LawUnit[]) => {
    const served = diffLandDraft(from, to)
    return landPairChecks({ from, to, served, before: served, back: diffLandDraft(to, from), compared: comparedText })
  }

  it('finds nothing wrong where the two texts are read alike', () => {
    expect(checks(lgbl, lgbl)).toEqual({ breaches: [], symmetry: [] })
  })

  it('names a unit that carries the earlier side\'s heading where the later side has none', () => {
    expect(lgbl[0]!.heading).toBeNull()
    expect(lgbl[0]!.text.startsWith(`${first} § 120 Abs 1`)).toBe(true)
    expect(checks(pdf, lgbl).breaches.map((b) => b.kind)).toEqual(['überschrift'])
  })

  it('names a run that does not read the two texts, and a pair only one direction makes', () => {
    const from = [...lgbl, { ...lgbl[0]!, id: '§2', text: 'Der Antrag ist binnen sechs Wochen einzubringen.' }]
    const to = [...lgbl, { ...lgbl[0]!, id: '§2', text: 'Der Antrag ist binnen acht Wochen einzubringen.' }]
    const served = diffLandDraft(from, to)
    const lost = served.map((u) => (u.change === 'changed' ? { ...u, segments: u.segments!.filter((s) => s.type !== 'removed') } : u))
    expect(landPairChecks({ from, to, served: lost, before: served, back: diffLandDraft(to, from), compared: comparedText }).breaches.map((b) => b.kind)).toEqual(['rekonstruktion'])
    const back = diffLandDraft(to, from).flatMap((u) => (u.change === 'changed' ? [{ ...u, change: 'removed' as const, toText: null }, { ...u, change: 'inserted' as const, fromText: null }] : [u]))
    expect(landPairChecks({ from, to, served, before: served, back, compared: comparedText }).symmetry.map((b) => b.detail)).toEqual(['nur vorwärts gepaart'])
  })

  it('names a unit of a side the comparison lost', () => {
    const served = diffLandDraft(lgbl, lgbl)
    expect(landPairChecks({ from: lgbl, to: lgbl, served, before: [], back: null, compared: comparedText }).breaches.map((b) => b.kind)).toEqual(['vollständigkeit', 'vollständigkeit'])
  })
})

describe('pairsPerLand — per Land, what was requested and what was reached (20.11.2026)', () => {
  it('counts each Land\'s drafts and pairs, so a Land that reached nothing says so', () => {
    const drafts = [
      { land: 'sbg', cached: true, pairs: 3 },
      { land: 'stmk', cached: false, pairs: 0 },
      { land: 'stmk', cached: true, pairs: 0 },
      { land: 't', cached: true, pairs: 2 },
      { land: 'ktn', cached: true, pairs: 1 },
    ]
    const lines = [
      { land: 'sbg', state: 'verglichen' as const },
      { land: 'sbg', state: 'nicht verfügbar' as const },
      { land: 'sbg', state: 'Fehler' as const },
      { land: 't', state: 'fehlt' as const },
      { land: 't', state: 'fehlt' as const },
      { land: 'ktn', state: 'verglichen' as const },
    ]
    expect(pairsPerLand(drafts, lines)).toEqual({
      ktn: { drafts: 1, uncached: 0, withPairs: 1, requested: 1, compared: 1, unavailable: 0, missing: 0, errored: 0 },
      sbg: { drafts: 1, uncached: 0, withPairs: 1, requested: 3, compared: 1, unavailable: 1, missing: 0, errored: 1 },
      stmk: { drafts: 2, uncached: 1, withPairs: 0, requested: 0, compared: 0, unavailable: 0, missing: 0, errored: 0 },
      t: { drafts: 1, uncached: 0, withPairs: 1, requested: 2, compared: 0, unavailable: 0, missing: 2, errored: 0 },
    })
  })
})

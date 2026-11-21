import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { baselineMoves, landPairChecks, lgblNoneUnchanged, numbersOnly, pairsPerLand, recurringRuns, type RunUnit } from '../scripts/lib/landStationChecks'
import { summarizeDiff } from '../server/utils/diff/lawDiff'
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

// G080 of the audit of 20.11.2026: a draft held against the next amendment of
// the same law pairs its Ziffern by place, one reads „geändert", and the
// comparison's only refusal (no unit unchanged or changed) never fires.
describe('lgblNoneUnchanged — the pairs to the Landesgesetzblatt with no unit unchanged, for reading by hand', () => {
  const draft = landDraftUnits([page('Der Salzburger Landtag hat beschlossen:', 'Das X-Gesetz, LGBl Nr 1/2020, wird geändert wie folgt:',
    '1. Im § 2 wird das Wort „Hauptverband" durch das Wort „Dachverband" ersetzt.', '2. § 4 entfällt.')])!
  const nextAmendment = landDraftUnits([page('Der Salzburger Landtag hat beschlossen:', 'Das X-Gesetz, LGBl Nr 1/2020, wird geändert wie folgt:',
    '1. Im § 2 wird das Wort „Gemeinde" durch das Wort „Stadt" ersetzt.', '2. § 9 lautet: „§ 9 Neu.“', '3. § 11 entfällt.')])!
  const line = (pair: string, stats: { unchanged: number } | null, state: 'verglichen' | 'fehlt' = 'verglichen') => ({ draft: 'sbg-1', pair, state, stats })

  it('lists a draft against another amendment of its law, which the comparison does not refuse', () => {
    const stats = summarizeDiff(diffLandDraft(draft, nextAmendment))
    expect(stats.unchanged).toBe(0)
    expect(stats.changed).toBeGreaterThan(0)
    expect(lgblNoneUnchanged([line('entwurf→lgbl', stats)]).map((l) => l.pair)).toEqual(['entwurf→lgbl'])
  })

  it('leaves out pairs with a unit unchanged, pairs to another station and pairs not compared', () => {
    expect(lgblNoneUnchanged([line('rv→lgbl', { unchanged: 1 }), line('entwurf→rv', { unchanged: 0 }), line('rv→lgbl', null, 'fehlt')])).toEqual([])
  })
})

describe('baselineMoves — the null comparison against its committed residues (21.11.2026)', () => {
  const was = ['ooe-1 ausschuss→lgbl changed Artikel I · Z1→Z1', 'ooe-2 ausschuss→lgbl changed Artikel I · Z4→Z4']

  it('names a residue that came and one that went, in either direction a move', () => {
    expect(baselineMoves(['ooe-1 ausschuss→lgbl changed Artikel I · Z1→Z1', 'ooe-1 ausschuss→lgbl inserted Artikel I · —→Z2'], was, new Set(['ooe-1', 'ooe-2']))).toEqual({
      came: ['ooe-1 ausschuss→lgbl inserted Artikel I · —→Z2'],
      went: ['ooe-2 ausschuss→lgbl changed Artikel I · Z4→Z4'],
    })
  })

  it('does not call a residue gone whose draft the run did not reach', () => {
    expect(baselineMoves([was[0]!], was, new Set(['ooe-1']))).toEqual({ came: [], went: [] })
  })

  it('the committed baseline gives every residue that is not editorial its reason, and no reason without its residue', () => {
    const baseline = JSON.parse(readFileSync(new URL('../scripts/harness/landStationsNullBaseline.json', import.meta.url), 'utf8')) as { residues: string[]; reasons: Record<string, string> }
    expect(baseline.residues.filter((r) => !r.includes('(redaktionell)') && !baseline.reasons[r])).toEqual([])
    expect(Object.keys(baseline.reasons).filter((k) => !baseline.residues.includes(k))).toEqual([])
  })
})

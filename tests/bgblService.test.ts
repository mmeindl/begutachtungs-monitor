import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RisConsultation, RisConsultationDetail } from '../shared/types'
import { risConsultation } from './helpers/builders'

/**
 * The Nitro-aware half of the Kundmachung lookup, under a pinned clock
 * (`server/utils/ris/bgblService.ts`, docs/architecture.md §12.32).
 *
 * WHY THIS FILE EXISTS. Every rule this module *decides* is pure and tested
 * next door — `isRunningYear`, `bgblOutcomeState` and the join itself are
 * `bgblJoin.ts` and `tests/bgblJoin.test.ts`. What was untested is the half
 * that reads the calendar and then acts on it: which Jahrgänge are asked of
 * RIS at all, which of the two lifetimes a Jahrgang is read on, and whether
 * a Frist that is still running survives the trip through the cached record.
 * All three are silent failures — a year not asked for is not an error, it
 * is a Verordnung that reads „bisher nicht kundgemacht" while it has been
 * in force for months.
 *
 * TWO FAKES, and they are the module's two boundaries and nothing else.
 *
 * `defineCachedFunction` is Nitro's, and it is replaced by a wrapper that
 * records the cache NAME and then calls straight through. Not the identity:
 * the one thing this module does with the clock that nothing else can see is
 * choose between `bgbl-jahrgang-seite` and `…-laufend` — one fixed `maxAge`
 * per cached function is why there are two of them, so the choice IS the
 * lifetime. Passing through rather than caching is what makes the fetch
 * count below mean something.
 *
 * `globalThis.fetch` is the other, the one seam every upstream request of
 * this codebase goes through (`upstream/fetch.ts` holds the only `fetch(`
 * in `server/`, and `scripts/lib/harnessCache.ts` takes the same seam). So
 * the real client runs — its retry loop, its RIS envelope check, its URL —
 * and the test can read off which Jahrgang was requested instead of trusting
 * a mocked `risJson` to have been called correctly.
 *
 * `risOnly` is mocked away as a module: it is the corpus, not a boundary of
 * this module, and loading it would drag the whole Begut cache in.
 */

/** Which cached function ran, in order — the lifetime choice, made visible. */
const viaCache: string[] = []
/** Every URL the module asked RIS for, in order. */
const asked: string[] = []

vi.stubGlobal(
  'defineCachedFunction',
  <A extends unknown[], R>(fn: (...args: A) => R, opts: { name: string }) =>
    (...args: A): R => {
      viaCache.push(opts.name)
      return fn(...args)
    },
)

vi.mock('../server/utils/ris/risOnly', () => ({
  getRisConsultation: vi.fn(),
  getRisOnlyForGp: vi.fn(),
}))

const { getRisConsultation, getRisOnlyForGp } = vi.mocked(
  await import('../server/utils/ris/risOnly'),
)
const { findBgblIForVorlage, getBgblOutcome, getBgblOutcomesForGp, getBgblTeil2Year } = await import(
  '../server/utils/ris/bgblService'
)

// ---------------------------------------------------------------------------
// The RIS answers this test hands out
// ---------------------------------------------------------------------------

interface Kundmachung {
  id: string
  nummer: string
  datum: string
  titel: string
  stelle: string
  teil?: string
  /** A law's parliamentary key — Teil I only (`bgblVorlage.ts`). */
  gp?: string
  rv?: string | string[]
}

/** One `OgdDocumentReference` in the shape `mapRecord` reads it. */
function reference(k: Kundmachung) {
  return {
    Data: {
      Metadaten: {
        Technisch: { ID: k.id, Einbringer: k.stelle },
        Bundesrecht: {
          Kurztitel: k.titel,
          Titel: k.titel,
          BgblAuth: {
            Teil: k.teil ?? 'Teil2',
            Bgblnummer: k.nummer,
            Ausgabedatum: k.datum,
            Gesetzgebungsperiode: k.gp,
            Regierungsvorlage: k.rv === undefined ? undefined : { item: k.rv },
          },
        },
      },
    },
  }
}

/** What BgblAuth holds, per Jahrgang. Everything else answers empty. */
const jahrgang = new Map<number, Kundmachung[]>()

/**
 * The BgblAuth query answered from `jahrgang`.
 *
 * The year is read back out of `VonKundmachungsdatum`, which is the filter
 * the module builds — so an off-by-one in `yearsFor` shows up here as an
 * empty answer rather than as a matching one.
 */
function answer(url: string): Response {
  asked.push(url)
  const params = new URL(url).searchParams
  const year = Number(params.get('VonKundmachungsdatum')?.slice(0, 4))
  const items = (jahrgang.get(year) ?? []).map(reference)
  return new Response(
    JSON.stringify({
      OgdSearchResult: {
        OgdDocumentResults: { Hits: { '#text': String(items.length) }, OgdDocumentReference: items },
      },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )
}

/** Which Jahrgänge were asked for, deduplicated in the order they were asked. */
function yearsAsked(): number[] {
  const out: number[] = []
  for (const url of asked) {
    const y = Number(new URL(url).searchParams.get('VonKundmachungsdatum')?.slice(0, 4))
    if (!out.includes(y)) out.push(y)
  }
  return out
}

/** The clock, pinned to a Vienna day at noon so no timezone shifts it. */
function pin(isoDay: string): void {
  vi.setSystemTime(new Date(`${isoDay}T12:00:00Z`))
}

/**
 * One Verordnungsentwurf of the BMF, Frist 13.06.2026 — the draft every case
 * below varies. `active: false` is the value the corpus cache holds and the
 * one no reader may believe (`risRecord.withRisActiveOn`).
 */
function verordnung(over: Partial<RisConsultation> = {}): RisConsultation {
  return risConsultation({
    kind: 'verordnung',
    title: 'Sachbezugswerteverordnung, Änderung',
    longTitle: 'Sachbezugswerteverordnung, Änderung',
    ministryCode: 'BMF',
    ministryName: 'Bundesministerium für Finanzen',
    startedAt: '2026-05-02',
    deadline: '2026-06-13',
    active: false,
    ...over,
  })
}

/** The same draft as a detail record — `getBgblOutcome` reads one of those. */
function detail(over: Partial<RisConsultation> = {}): RisConsultationDetail {
  return {
    ...verordnung(over),
    mainDocument: { html: null, xml: null, pdf: null },
    explanations: null,
    textComparison: null,
    textComparisonParts: [],
    coverLetter: null,
    otherDocuments: [],
  }
}

/** The corpus answer for a period — only `items` is read here. */
function corpus(items: RisConsultation[]) {
  return { items, withGegenstand: 0, undecided: 0 }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve(answer(url))))
  jahrgang.clear()
  asked.length = 0
  viaCache.length = 0
  getRisConsultation.mockReset()
  getRisOnlyForGp.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

// ---------------------------------------------------------------------------

/**
 * `yearsFor`: the Jahrgänge a Frist's Kundmachung can fall into — never one
 * that cannot exist yet.
 *
 * The window reaches 540 days forward (`BGBL_WINDOW_DAYS`), so at most into
 * the year after next; the ceiling is the running Jahrgang, because RIS holds
 * nothing beyond it. Asking anyway would not be merely wasteful: `MAX_PAGES`
 * of empty result sets per draft, against an API this project has no licence
 * to hammer.
 */
describe('welche Jahrgänge gefragt werden', () => {
  it('fragt nur den Jahrgang der Frist, solange kein weiterer angefangen hat', async () => {
    pin('2026-09-26')
    getRisConsultation.mockResolvedValue(detail())
    await getBgblOutcome('BEGUT_1')
    expect(yearsAsked()).toEqual([2026])
  })

  it('nimmt das Folgejahr dazu, sobald es läuft', async () => {
    pin('2027-06-01')
    getRisConsultation.mockResolvedValue(detail())
    await getBgblOutcome('BEGUT_1')
    expect(yearsAsked()).toEqual([2026, 2027])
  })

  /* Drei Jahrgänge sind die Obergrenze des Fensters selbst, nicht eine
   * weitere Regel: 540 Tage ab einer Frist im Dezember enden im übernächsten
   * Jahr. */
  it('reicht bis ins übernächste Jahr und nicht weiter', async () => {
    pin('2029-06-01')
    getRisConsultation.mockResolvedValue(detail())
    await getBgblOutcome('BEGUT_1')
    expect(yearsAsked()).toEqual([2026, 2027, 2028])
  })

  /* A made-up id is not a state: it throws, and an error is never cached,
   * so no entry is left behind for it. A record WITHOUT a Frist below is a
   * real state and does get one. */
  it('throws 404 for an id the corpus does not hold, without asking RIS', async () => {
    pin('2026-09-26')
    getRisConsultation.mockResolvedValue(null)
    await expect(getBgblOutcome('BEGUT_UNBEKANNT')).rejects.toMatchObject({ statusCode: 404 })
    expect(asked).toEqual([])
  })

  /* Ohne Frist gibt es kein Fenster und also keine Frage an RIS — die vierte
   * Antwort `unbekannt`, für das, was das Fenster gar nicht entscheiden kann. */
  it('fragt gar nicht, wo keine Frist steht', async () => {
    pin('2026-09-26')
    getRisConsultation.mockResolvedValue(detail({ deadline: null }))
    const outcome = await getBgblOutcome('BEGUT_1')
    expect(outcome.state).toBe('unbekannt')
    expect(asked).toEqual([])
  })
})

/**
 * Which of the two lifetimes a Jahrgang is read on.
 *
 * A closed year is finished and keeps for a month; the running one grows a
 * few times a week and a Kundmachung that stays invisible for a month is
 * exactly the error this module exists to avoid. The grace in January is
 * `isRunningYear`'s: the Jahrgang that just ended still receives its last
 * pieces then.
 */
describe('welche Lebensdauer ein Jahrgang bekommt', () => {
  it('liest den laufenden Jahrgang kurz und einen abgeschlossenen lang', async () => {
    pin('2027-06-01')
    await getBgblTeil2Year(2027)
    await getBgblTeil2Year(2026)
    expect(viaCache).toContain('bgbl-jahrgang-seite-laufend')
    expect(viaCache).toContain('bgbl-jahrgang-seite')
  })

  /* Im Jänner ist der eben abgelaufene Jahrgang noch „laufend": Teil II
   * bekommt seine letzten Stücke mit Kundmachungsdatum des Vorjahres. */
  it('behandelt im Jänner auch den Vorjahrgang als laufend', async () => {
    pin('2027-01-15')
    await getBgblTeil2Year(2026)
    expect(viaCache).toContain('bgbl-jahrgang-seite-laufend')
    expect(viaCache).not.toContain('bgbl-jahrgang-seite')
  })

  it('behandelt ihn ab Februar als abgeschlossen', async () => {
    pin('2027-02-01')
    await getBgblTeil2Year(2026)
    expect(viaCache).toContain('bgbl-jahrgang-seite')
    expect(viaCache).not.toContain('bgbl-jahrgang-seite-laufend')
  })
})

/**
 * The state itself, through the service rather than through the pure rule:
 * that the day the rule is asked about is today's, and that a hit fills
 * `nummer`, `datum`, `url` and `days`.
 */
describe('der Stand einer Verordnung', () => {
  const kundmachung: Kundmachung = {
    id: 'NOR40260815',
    nummer: 'BGBl. II Nr. 214/2026',
    datum: '2026-07-31',
    titel: 'Sachbezugswerteverordnung, Änderung',
    stelle: 'BMF',
  }

  it('nennt die Kundmachung samt ELI-Adresse und Abstand zur Frist', async () => {
    pin('2026-09-26')
    jahrgang.set(2026, [kundmachung])
    getRisConsultation.mockResolvedValue(detail())
    expect(await getBgblOutcome('BEGUT_1')).toEqual({
      state: 'kundgemacht',
      nummer: 'BGBl. II Nr. 214/2026',
      datum: '2026-07-31',
      url: 'https://www.ris.bka.gv.at/eli/bgbl/II/2026/214',
      days: 48,
    })
  })

  it('sagt „begutachtung", solange die Frist läuft', async () => {
    pin('2026-06-01')
    getRisConsultation.mockResolvedValue(detail({ active: true }))
    expect((await getBgblOutcome('BEGUT_1')).state).toBe('begutachtung')
  })

  /* Die 180-Tage-Regel, an der Grenze und durch den Dienst gelesen: eine
   * Frist, die sechs Wochen her ist, ist nicht „nicht kundgemacht", sondern
   * jung. Ein Scheitern ist keine Antwort (§12.13). */
  it('sagt „ausstehend" bis zum 180. Tag und danach „keine"', async () => {
    getRisConsultation.mockResolvedValue(detail())
    pin('2026-12-09') // 179 Tage nach dem 13.06.
    expect((await getBgblOutcome('BEGUT_1')).state).toBe('ausstehend')
    pin('2026-12-10') // 180 Tage
    expect((await getBgblOutcome('BEGUT_1')).state).toBe('keine')
  })
})

/**
 * The pass over a whole period — the one the list reads.
 *
 * Two claims, and both are about the clock. The Jahrgänge are loaded ONCE
 * for all drafts, not once per draft; and `active` is decided HERE, on
 * today, because the record `getRisOnlyForGp` caches carries a meaningless
 * one (`risRecord.withRisActiveOn`). Without that second step a draft whose
 * Frist is still running would be counted as silent the moment the corpus
 * cache is a day old.
 */
describe('der Stand einer ganzen Periode', () => {
  it('lädt jeden Jahrgang einmal, nicht je Entwurf', async () => {
    pin('2027-06-01')
    getRisOnlyForGp.mockResolvedValue(
      corpus([
        verordnung({ id: 'BEGUT_1' }),
        verordnung({ id: 'BEGUT_2', title: 'Honigverordnung, Änderung' }),
        verordnung({ id: 'BEGUT_3', title: 'Druckgeräteverordnung, Änderung' }),
      ]),
    )

    const out = await getBgblOutcomesForGp('XXVIII')
    expect(Object.keys(out).sort()).toEqual(['BEGUT_1', 'BEGUT_2', 'BEGUT_3'])
    // Drei Entwürfe, zwei Jahrgänge, zwei Anfragen — nicht sechs.
    expect(asked).toHaveLength(2)
    expect(yearsAsked()).toEqual([2026, 2027])
  })

  it('überspringt Gesetzesentwürfe und Datensätze ohne Frist', async () => {
    pin('2026-09-26')
    getRisOnlyForGp.mockResolvedValue(
      corpus([
        verordnung({ id: 'BEGUT_1' }),
        verordnung({ id: 'BEGUT_2', kind: 'gesetz' }),
        verordnung({ id: 'BEGUT_3', deadline: null }),
      ]),
    )
    expect(Object.keys(await getBgblOutcomesForGp('XXVIII'))).toEqual(['BEGUT_1'])
  })

  /* Der gespeicherte `active`-Wert ist bedeutungslos, und genau das wird hier
   * geprüft: derselbe Datensatz, zweimal gelesen, an einem Tag innerhalb der
   * Frist und an einem danach. */
  it('entscheidet „läuft noch" am heutigen Tag, nicht am gespeicherten Kennzeichen', async () => {
    const stale = verordnung({ id: 'BEGUT_1', active: false })
    getRisOnlyForGp.mockResolvedValue(corpus([stale]))

    pin('2026-06-01')
    expect((await getBgblOutcomesForGp('XXVIII')).BEGUT_1?.state).toBe('begutachtung')

    pin('2026-07-01')
    expect((await getBgblOutcomesForGp('XXVIII')).BEGUT_1?.state).toBe('ausstehend')
  })
})

/**
 * The second source for a law's BGBl number (03.10.2026): where Parliament
 * links none, RIS by period and Vorlage. What the service adds to the pure
 * join is the calendar — every Jahrgang from the Beschluss to the running
 * one — and the spelling: Parliament's long form, RIS's document page.
 */
describe('die Kundmachung einer Regierungsvorlage', () => {
  const nr69: Kundmachung = {
    id: 'BGBLA_2026_I_69',
    nummer: 'BGBl. I Nr. 69/2026',
    datum: '2026-07-29',
    titel: 'Sterbeverfügungsgesetz-Novelle 2026',
    stelle: '',
    teil: 'Teil1',
    gp: 'XXVIII',
    rv: '525',
  }

  it('findet sie über Periode und Vorlage, in der Schreibweise des Parlaments', async () => {
    pin('2026-10-03')
    jahrgang.set(2026, [nr69])
    expect(await findBgblIForVorlage('XXVIII', 525, '2026-07-07')).toEqual({
      number: 'Bundesgesetzblatt I Nr. 69/2026',
      datum: '2026-07-29',
      url: 'https://www.ris.bka.gv.at/Dokument.wxe?Abfrage=BgblAuth&Dokumentnummer=BGBLA_2026_I_69',
    })
    expect(viaCache).toContain('bgbl-teil1-jahrgang-laufend')
  })

  it('fragt jeden Jahrgang vom Beschluss bis heute', async () => {
    pin('2026-10-03')
    jahrgang.set(2026, [nr69])
    expect((await findBgblIForVorlage('XXVIII', 525, '2025-12-10'))?.number).toBe('Bundesgesetzblatt I Nr. 69/2026')
    expect(yearsAsked()).toEqual([2025, 2026])
  })

  /* 80 d.B.: no Kundmachung names it, and a law of the same period with
   * another Vorlage — or a Teil-II record — is not its Kundmachung. */
  it('findet nichts, wo keine Kundmachung die Vorlage nennt', async () => {
    pin('2026-10-03')
    jahrgang.set(2025, [{ ...nr69, id: 'BGBLA_2025_I_65', nummer: 'BGBl. I Nr. 65/2025', rv: undefined }])
    jahrgang.set(2026, [nr69, { ...nr69, id: 'BGBLA_2026_II_80', teil: 'Teil2', rv: '80' }])
    expect(await findBgblIForVorlage('XXVIII', 80, '2025-07-10')).toBeNull()
  })
})

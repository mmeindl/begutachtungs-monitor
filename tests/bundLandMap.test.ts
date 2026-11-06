import { describe, expect, it } from 'vitest'
import type { LandConsultation } from '../shared/types'
import { bgblActOf, bgblKeyOf, bgblOfKey, fristClauseOf, meCarriesGrundsatz, vorlageDe } from '../server/utils/bund-land/bundesgesetzblatt'
import { assembleBundLandMap } from '../server/utils/bund-land/bundLandMap'
import { bundLandStore, type LandAusfuehrungFact } from '../server/utils/bund-land/bundLandStore'
import { runAligned } from '../server/utils/cache/population'
import { createFactStore } from '../server/utils/cache/factStore'

describe('the Frist clause', () => {
  it('reads the sentence verbatim (44/2025)', () => {
    expect(fristClauseOf('<p>(2) Die Ausführungsgesetze der Länder sind binnen eines Jahres zu erlassen.</p>')).toBe('Die Ausführungsgesetze der Länder sind binnen eines Jahres zu erlassen.')
  })

  it('takes RIS\'s spelled-out twin where the abbreviated one has a full stop inside (91/2025)', () => {
    const html = '<p>Die Ausführungsgesetze der Länder sind binnen sechs Monaten nach Inkrafttreten der Grundsatzbestimmungen gemäß Abs. 8, zu erlassen.</p>' +
      '<span class="sr-only">Die Ausführungsgesetze der Länder sind binnen sechs Monaten nach Inkrafttreten der Grundsatzbestimmungen gemäß Absatz 8, zu erlassen.</span>'
    expect(fristClauseOf(html)).toBe('Die Ausführungsgesetze der Länder sind binnen sechs Monaten nach Inkrafttreten der Grundsatzbestimmungen gemäß Absatz 8, zu erlassen.')
  })

  it('is null where the act sets none (2/2026)', () => {
    expect(fristClauseOf('<p>§ 8a. (Grundsatzbestimmung) Deutschförderklassen …</p>')).toBeNull()
  })
})

describe('whether a Ministerialentwurf carried the Grundsatz content', () => {
  it('names the law the Länder carry out (13/ME, 44/2025)', () => {
    expect(meCarriesGrundsatz('Artikel 2 Änderung des Anstellungserfordernisse- Grundsatzgesetzes Das Anstellungserfordernisse-Grundsatzgesetz, BGBl. Nr. 406/1968, …', ['Anstellungserfordernisse-Grundsatzgesetz'])).toBe(true)
  })

  it('refuses the Budgetbegleitgesetz: 15/ME never named the Sozialhilfe-Grundsatzgesetz (25/2025 ← 69 d.B.)', () => {
    expect(meCarriesGrundsatz('Budgetbegleitgesetz 2025 Artikel 1 Änderung des Allgemeinen Sozialversicherungsgesetzes …', ['Sozialhilfe-Grundsatzgesetz'])).toBe(false)
  })

  it('wants a Grundsatz marker beside a name without „Grundsatz" (66/ME, Schulorganisationsgesetz)', () => {
    expect(meCarriesGrundsatz('Änderung des Schulorganisationsgesetzes … § 8h (Grundsatzbestimmung)', ['Schulorganisationsgesetz'])).toBe(true)
    expect(meCarriesGrundsatz('Änderung des Schulorganisationsgesetzes … § 82 Bundesschulen', ['Schulorganisationsgesetz'])).toBe(false)
  })

  it('decides by the marker alone where no Land has named the act yet', () => {
    expect(meCarriesGrundsatz('Die Ausführungsgesetze der Länder sind binnen eines Jahres zu erlassen.', [])).toBe(true)
    expect(meCarriesGrundsatz('Änderung des Glücksspielgesetzes', [])).toBe(false)
  })
})

describe('the BGBl record', () => {
  const ref = {
    Data: {
      Metadaten: {
        Technisch: { ID: 'BGBLA_2024_I_24' },
        Bundesrecht: {
          Titel: 'Bundesgesetz, mit dem das Bundesgesetz über Krankenanstalten und Kuranstalten geändert wird',
          Kurztitel: 'Änderung des Bundesgesetzes über Krankenanstalten und Kuranstalten',
          BgblAuth: { Bgblnummer: 'BGBl. I Nr. 24/2024', Teil: 'Teil1', Ausgabedatum: '2024-03-28', Gesetzgebungsperiode: 'XXVII', Initiativantrag: { item: '3867/A' } },
        },
      },
      Dokumentliste: { ContentReference: { ContentType: 'MainDocument', Urls: { ContentUrl: [{ DataType: 'Html', Url: 'https://ogd.ris.bka.gv.at/Dokumente/BgblAuth/BGBLA_2024_I_24/BGBLA_2024_I_24.html' }] } } },
    },
  }

  it('reads number, day, Vorlage and the HTML', () => {
    const act = bgblActOf(ref)!
    expect(act).toMatchObject({ nummer: 'BGBl. I Nr. 24/2024', datum: '2024-03-28', gp: 'XXVII', regierungsvorlagen: [], initiativantraege: ['3867/A'] })
    expect(act.html).toMatch(/BGBLA_2024_I_24\.html$/)
    expect(vorlageDe(act)).toBe('3867/A (XXVII. GP)')
    expect(vorlageDe({ gp: 'XXVIII', regierungsvorlagen: [128], initiativantraege: [] })).toBe('128 d.B. (XXVIII. GP)')
  })

  it('keys an act by year and number', () => {
    expect(bgblKeyOf({ year: 2025, number: 44 })).toBe('2025-44')
    expect(bgblOfKey('2025-44')).toEqual({ year: 2025, number: 44 })
    expect(bgblOfKey('2025-x')).toBeNull()
  })
})

function land(over: Partial<LandConsultation> & Pick<LandConsultation, 'id' | 'land'>): LandConsultation {
  return { kind: 'gesetz', title: `Entwurf ${over.id}`, startedAt: '2025-10-01', deadline: '2025-11-01', url: 'https://example.org', documents: [], active: false, ...over }
}

const gg = (number: number, year: number, name: string | null, partial = false): LandAusfuehrungFact['findings'][number] =>
  ({ kind: 'grundsatzgesetz', strength: 'strong', document: 0, inExplanations: false, act: { name, bgbl: { number, year }, partial } })

describe('the map', () => {
  it('collects the Land drafts per act, names by frequency, the federal acts without drafts too', () => {
    const store = bundLandStore.empty()
    store.builtAt = '2026-11-06T00:00:00Z'
    const entry = (fact: LandAusfuehrungFact) => ({ fingerprint: '', readAt: '', fact })
    store.entries['land:stmk-a'] = entry({ findings: [gg(44, 2025, 'Anstellungserfordernisse-Grundsatzgesetz')], sources: [] })
    store.entries['land:ktn-b'] = entry({ findings: [gg(44, 2025, 'Anstellungserfordernisse-Grundsatzgesetz', true)], sources: [] })
    store.entries['land:ooe-c'] = entry({ findings: [{ ...gg(1, 2024, null), kind: 'vereinbarung' }], sources: [] })
    store.entries['land:w-d'] = entry({ findings: [{ ...gg(0, 0, 'Schulorganisationsgesetz'), act: { name: 'Schulorganisationsgesetz', bgbl: null, partial: false } }], sources: [] })
    const map = assembleBundLandMap({
      gp: 'XXVIII',
      window: { from: '2024-10-24', to: null },
      store,
      laender: [land({ id: 'stmk-a', land: 'stmk' }), land({ id: 'ktn-b', land: 'ktn', stage: { station: 'bgbl', date: '2026-01-15', detail: 'LGBl. Nr. 1/2026' } as LandConsultation['stage'] }), land({ id: 'ooe-c', land: 'ooe' }), land({ id: 'w-d', land: 'w' })],
      unavailableLands: ['t'],
      federal: [{ year: 2025, number: 44 }, { year: 2025, number: 117 }],
      today: '2026-11-06',
    })
    expect(Object.keys(map.acts).sort()).toEqual(['2025-117', '2025-44'])
    const act = map.acts['2025-44']!
    expect(act.names).toEqual(['Anstellungserfordernisse-Grundsatzgesetz'])
    // Kärnten before Steiermark, as the Länder are listed.
    expect(act.drafts.map((d) => [d.publisher, d.partial, d.stand?.label])).toEqual([['ktn', true, 'Landesgesetzblatt'], ['stmk', false, 'Heute']])
    expect(map.acts['2025-117']!.drafts).toEqual([])
    expect(map.incomplete).toEqual(['t'])
  })
})

describe('aligned populations', () => {
  it('runs each draft\'s jobs one after the other, every store its own', async () => {
    const order: string[] = []
    const a = createFactStore<string>({ subdir: 'test-a', shape: 1, readerVersion: 1, label: 'a' }).empty()
    const b = createFactStore<string>({ subdir: 'test-b', shape: 1, readerVersion: 1, label: 'b' }).empty()
    const job = (store: string, key: string, complete = true) => ({ key, fingerprint: 'f', open: false, read: async () => { order.push(`${store}:${key}`); return { value: key, complete } } })
    const [ra, rb] = await runAligned([
      { store: a, label: 'a', jobs: [job('a', '1'), job('a', '2')] },
      { store: b, label: 'b', jobs: [job('b', '1'), job('b', '2', false)] },
    ], 1)
    expect(order).toEqual(['a:1', 'b:1', 'a:2', 'b:2'])
    expect(ra).toMatchObject({ total: 2, read: 2 })
    expect(rb).toMatchObject({ total: 2, read: 1, partial: 1 })
    expect(Object.keys(b.entries)).toEqual(['1'])
  })
})

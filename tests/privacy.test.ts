import { describe, expect, it } from 'vitest'
import { classifySubmitter } from '../server/utils/privacy'

describe('classifySubmitter', () => {
  describe('organisations — the name is preserved', () => {
    it.each([
      'Bundeskanzleramt; Verfassungsdienst',
      'Vegane Gesellschaft Österreich',
      'Wirtschaftskammer Österreich',
      'Bundesministerium für Finanzen',
      'Österreichischer Gewerkschaftsbund',
      'Amt der Oö. Landesregierung',
      'Universität Wien, Institut für Staatsrecht',
      'Verein für Konsumenteninformation',
      'Arbeiterkammer Wien',
      'Stadt Graz',
      'Land Tirol',
      'Österreichische Gesundheitskasse',
      'Caritas Österreich',
      'Rechtsanwaltskammer Wien',
    ])('%s → organisation', (name) => {
      expect(classifySubmitter(name)).toEqual({ kind: 'organisation', name })
    })

    it('recognizes legal forms (GmbH, AG, e.U.)', () => {
      expect(classifySubmitter('Muster Consulting GmbH')).toEqual({
        kind: 'organisation',
        name: 'Muster Consulting GmbH',
      })
      expect(classifySubmitter('Verbund AG')).toEqual({
        kind: 'organisation',
        name: 'Verbund AG',
      })
      expect(classifySubmitter('Tischlerei Huber e.U.')).toEqual({
        kind: 'organisation',
        name: 'Tischlerei Huber e.U.',
      })
    })

    it('strong org signals beat the comma pattern', () => {
      expect(classifySubmitter('Wirtschaftskammer Österreich, Abteilung Sozialpolitik')).toEqual({
        kind: 'organisation',
        name: 'Wirtschaftskammer Österreich, Abteilung Sozialpolitik',
      })
    })

    it('allowlisted brand-style names without org keywords (§12.9)', () => {
      expect(classifySubmitter('epicenter.works')).toEqual({
        kind: 'organisation',
        name: 'epicenter.works',
      })
      expect(classifySubmitter('EPICENTER.WORKS')).toEqual({
        kind: 'organisation',
        name: 'EPICENTER.WORKS',
      })
      // Not allowlisted, no org signal → stays safely hidden.
      expect(classifySubmitter('example.works')).toEqual({ kind: 'person', name: null })
    })
  })

  describe('private persons — the name is ALWAYS suppressed (GDPR)', () => {
    it.each([
      'Mustermann, Maria',
      'Huber Franz, Mag.',
      'Dimitriadis, Ioannis',
      'Dr. Mustermann, Maria',
      'Berger-Steiner, Anna Lena',
      'van der Bellen, Alexander',
      'Univ.-Prof. Dr. Huber, Josef',
      'Mag.a Steiner, Julia',
    ])('%s → person without a name', (name) => {
      expect(classifySubmitter(name)).toEqual({ kind: 'person', name: null })
    })

    it('strips "(postal code town)" suffixes and classifies as person', () => {
      expect(classifySubmitter('Huber, Franz (4880 St. Georgen im Attergau)')).toEqual({
        kind: 'person',
        name: null,
      })
      expect(classifySubmitter('Mustermann, Maria (1010 Wien)')).toEqual({
        kind: 'person',
        name: null,
      })
    })

    it('last names that sound like org words do not leak', () => {
      expect(classifySubmitter('Land, Michael')).toEqual({ kind: 'person', name: null })
      expect(classifySubmitter('Kammer, Josef')).toEqual({ kind: 'person', name: null })
      expect(classifySubmitter('Kirchner, Maria')).toEqual({ kind: 'person', name: null })
      expect(classifySubmitter('Österreicher, Franz')).toEqual({ kind: 'person', name: null })
    })
  })

  describe('non-public Stellungnahmen', () => {
    it('recognizes the placeholder', () => {
      expect(classifySubmitter('Nicht-öffentliche Stellungnahme')).toEqual({
        kind: 'nonpublic',
        name: null,
      })
    })

    it('recognizes the placeholder with a trailing citation too', () => {
      expect(classifySubmitter('Nicht-öffentliche Stellungnahme (410/SN-126/ME)')).toEqual({
        kind: 'nonpublic',
        name: null,
      })
    })
  })

  describe('edge cases → safe default person/null', () => {
    it.each([
      'Max Mustermann',
      'Kanzlei Huber',
      'jemand',
      'X',
      '???',
    ])('%s → person without a name', (name) => {
      expect(classifySubmitter(name)).toEqual({ kind: 'person', name: null })
    })

    it('empty/missing input → person without a name', () => {
      expect(classifySubmitter('')).toEqual({ kind: 'person', name: null })
      expect(classifySubmitter('   ')).toEqual({ kind: 'person', name: null })
      expect(classifySubmitter(null)).toEqual({ kind: 'person', name: null })
      expect(classifySubmitter(undefined)).toEqual({ kind: 'person', name: null })
    })

    it('a name is never non-null when kind is person or nonpublic', () => {
      const samples = [
        'Mustermann, Maria',
        'Huber Franz, Mag.',
        'Nicht-öffentliche Stellungnahme',
        'Irgendwas Unklares',
        'Huber, Franz (4880 St. Georgen im Attergau)',
      ]
      for (const sample of samples) {
        const result = classifySubmitter(sample)
        if (result.kind !== 'organisation') expect(result.name).toBeNull()
      }
    })
  })
})

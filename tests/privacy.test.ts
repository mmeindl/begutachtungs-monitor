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

    /* The classes the corpus audit of 2026-09-15 found filed as "Privatperson"
     * (scripts/classifier-audit.ts): 334+ rows in GP XXVIII, led by the
     * ministries' short form. Every string here is a real list-142 spelling. */
    it.each([
      'BM f. Finanzen',
      'BM f. Arbeit, Soziales, Gesundheit, Pflege und Konsumentenschutz',
      'Datenschutzbehörde',
      'Datenschutzbehörde; Datenschutzbehörde',
      'Finanzmarktaufsicht (FMA); Internationale Angelegenheiten & Legistik',
      'Oberlandesgericht Wien; Geschäftsabteilung der Präsidentin',
      'Landesgericht Korneuburg',
      'Staatsanwaltschaft Innsbruck, Staatsanwaltschaft Feldkirch',
      'Oö. Umweltanwaltschaft',
      'Kinder- und Jugendanwaltschaften Österreichs',
      'Oesterreichische Nationalbank; Rechtsabteilung',
      'Presseclub Concordia',
      'Chaos Computer Club Wien (C3W)',
      'Österreichische Liga für Menschenrechte',
      'Islamische Föderation Wien; Frauenjugendabteilung',
      'Kuratorium für Verkehrssicherheit (KFV)',
      'VIVID - Fachstelle für Suchtprävention',
      'Umweltschutzorganisation GLOBAL 2000',
      'GLOBAL 2000',
      'Greenpeace in Zentral- und Osteuropa',
      'ÖKOBÜRO - Allianz der Umweltbewegung',
      'Anwältin für Gleichbehandlungsfragen für Menschen mit Behinderungen',
      'LEFÖ-IBF Interventionsstelle für Betroffene des Frauenhandels; NGO',
      'AK Wien; Klima, Umwelt und Verkehr',
      'VCÖ',
      'ÖVI',
      'ÖHGB; Rechtsabteilung',
      'WEISSER RING',
      'Vier Pfoten; Stiftung für Tierschutz',
      'Die Österreichischen Rechtsanwälte; Österreichischer Rechtsanwaltskammertag',
      'Österreichische Kinderfreunde; Bundesorganisation',
      'Österreichischer Werberat; Gesellschaft zur Selbstkontrolle der Werbewirtschaft',
      'Österreichische HochschülerInnenschaft; Bundesvertretung',
      'Bund Österreichischer Frauenvereine; National Council of Women - Austria',
      'Neustart, gemeinnütziger Verein',
      'WU Wien, Institut für Österreichisches und Europäisches Wirtschaftsstrafrecht',
      'Österreichischer Mieter-, Siedler und Wohnungseigentümerbund - ÖMB',
    ])('%s → organisation (audit class)', (name) => {
      expect(classifySubmitter(name)).toEqual({ kind: 'organisation', name })
    })

    it('matches the Ö-initial abbreviations (ASCII \\b never did)', () => {
      for (const name of ['ÖAMTC; Rechtsdienste', 'ÖGB; Volkswirtschaft', 'SPÖ Wien', 'ARBÖ ; Rechtsabteilung', 'ÖH BOKU']) {
        expect(classifySubmitter(name).kind, name).toBe('organisation')
      }
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

    /* Surnames that contain an org keyword the audit added — the word
     * boundaries in the patterns are what keeps them persons. */
    it.each(['Gliga, Dorian', 'Vonbank, Christine', 'KOLLROSS, PETER', 'Scheer, Ma8', 'Schöh, Anna', 'Neosan, Max'])(
      '%s → person despite a keyword-like fragment',
      (name) => {
        expect(classifySubmitter(name)).toEqual({ kind: 'person', name: null })
      },
    )

    /* A person with an affiliation is a person. Before 2026-09-15 the
     * affiliation's keyword won and the whole string, name included, was
     * published as an organisation — 239 rows in GP XXVII. */
    it.each([
      'Huber, Anna; Universität Wien',
      'Huber, Anna; Raubal GmbH - Metallwarenfabrik',
      'Maderbacher Gregor, Dr.; Rechtsanwalt; Geppert & Maderbacher Rechtsanwälte GesbR',
      'Krejci, Florian; Dr. med. dent. Krejci',
      'Huber Anna; Amt der Tiroler Landesregierung',
      'Huber, Anna, Universität Wien',
      'Huber Anna, Richterin am Landesgericht Wien',
      'Weilguny BEd., Renate; Fachschule für Sozialberufe',
      'Dr. Huber, Anna; Institut für Strafrecht und Kriminologie',
      'Dr. Maria Musterfrau, hba Rechtsanwälte GmbH',
      'Mustermann Max; Parteifreier Gewerkschafter',
      'Huber, Anna; Österreichischer Staatsbürger',
      'huber, anna; österreichischer staatsbürger',
      'Anna Huber/Max Mayer, ÖHXY; Hochschüler_innenschaft an der XY',
      'Anna Huber und Max Mayer, Studienvertretung Physik',
    ])('%s → person (affiliation dropped with the name)', (name) => {
      expect(classifySubmitter(name)).toEqual({ kind: 'person', name: null })
    })

    it('leaves organisations whose own name is comma-shaped alone', () => {
      for (const name of [
        'Land Tirol, Abteilung Verfassungsdienst; Verfassungsdienst',
        'Bundeskanzleramt; Verfassungsdienst',
        'Amt der Kärntner Landesregierung; Abteilung 1 – Verfassungsdienst',
        'Wirtschaftskammer Österreich, Abteilung Sozialpolitik',
        'Universität Wien, Institut für Staatsrecht, Abteilung Verfassungsrecht',
        'Stadt Wien, MA 62; Verfassungsdienst',
        'Presseclub Concordia; Generalsekretariat',
        'Vier Pfoten/Tierschutz Austria; gemeinsame Stellungnahme',
        'Ärzte ohne Grenzen/Médecins Sans Frontières, Sektion Österreich',
      ]) {
        expect(classifySubmitter(name), name).toEqual({ kind: 'organisation', name })
      }
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

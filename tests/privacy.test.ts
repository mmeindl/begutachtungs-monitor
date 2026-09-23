import { describe, expect, it } from 'vitest'
import { classifySubmitter, readUpstreamFlag } from '../server/utils/parliament/privacy'

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
     * (scripts/audit/classifier.ts): 334+ rows in GP XXVIII, led by the
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
      // "Vier Pfoten; Stiftung für Tierschutz" belongs here by kind, but it
      // is an allowlist HEAD match and prints "Vier Pfoten" alone — see
      // "allowlist display names" below.
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
      'Musteriadis, Ioannis',
      'Dr. Mustermann, Maria',
      'Berger-Steiner, Anna Lena',
      'van der Bellen, Alexander',
      'Univ.-Prof. Dr. Huber, Josef',
      'Mag.a Steiner, Julia',
    ])('%s → person without a name', (name) => {
      expect(classifySubmitter(name)).toEqual({ kind: 'person', name: null })
    })

    /* Surnames that contain an org keyword the audit added — the word
     * boundaries in the patterns are what keeps them persons. Synthetic
     * stand-ins: the corpus spellings are real people, the fragment and its
     * position in the word are what the case exercises. */
    it.each(['Testliga, Dora', 'Musterbank, Christine', 'MUSTERMANN, PETER', 'Muster, Ma8', 'Testöh, Anna', 'Neosmuster, Max'])(
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
      'Mustermann Gregor, Dr.; Rechtsanwalt; Beispiel & Mustermann Rechtsanwälte GesbR',
      'Mustermann, Florian; Dr. med. dent. Mustermann',
      'Huber Anna; Amt der Tiroler Landesregierung',
      'Huber, Anna, Universität Wien',
      'Huber Anna, Richterin am Landesgericht Wien',
      'Musterfrau BEd., Renate; Fachschule für Sozialberufe',
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
  /**
   * List 142's own TYP flag (column 19). It records how the submitter
   * registered, so it sees a person standing behind an org-shaped name —
   * and it may only ever suppress a name, never publish one. Real shapes
   * from the corpus comparison of 2026-09-16 — the organisations stand as
   * they are upstream, the persons behind them are synthetic.
   */
  describe('the upstream TYP flag', () => {
    it('reads only the two documented values, never guesses', () => {
      expect(readUpstreamFlag('I')).toBe('I')
      expect(readUpstreamFlag('P')).toBe('P')
      expect(readUpstreamFlag('')).toBeNull()
      expect(readUpstreamFlag('i')).toBeNull()
      expect(readUpstreamFlag(null)).toBeNull()
      expect(readUpstreamFlag(undefined)).toBeNull()
      expect(readUpstreamFlag(1)).toBeNull()
    })

    it.each([
      // The class the name heuristic cannot reach: the naming segment is an
      // organisation and the person stands behind it.
      'Windland Energieerzeugungs GmbH; Max Mustermann',
      'Verein Erneuerbare Energie Bregenzerwald, Max Mustermann',
      'i.A. Mustermann, dabei-austria/ Dachverband',
    ])('P suppresses a name the string alone would publish: %s', (name) => {
      expect(classifySubmitter(name)).toEqual({ kind: 'organisation', name })
      expect(classifySubmitter(name, 'P')).toEqual({ kind: 'person', name: null })
    })

    it('never publishes a name on the flag alone — I changes nothing', () => {
      // Real institutions upstream flags as such; they stay "Privatperson"
      // until a human puts them in ORG_ALLOWLIST.
      for (const name of ['Datenschutzrat', 'KommAustria', 'Aktienforum']) {
        expect(classifySubmitter(name, 'I')).toEqual(classifySubmitter(name))
      }
    })

    it('leaves non-public rows alone — the flag says who filed, not what is published', () => {
      const nonpublic = { kind: 'nonpublic', name: null }
      expect(classifySubmitter('Nicht-öffentliche Stellungnahme', 'P')).toEqual(nonpublic)
      expect(classifySubmitter('Nicht-öffentliche Stellungnahme', 'I')).toEqual(nonpublic)
    })

    it('the allowlist outranks the flag — it is the escape hatch for a false veto', () => {
      const allowlisted = 'epicenter.works'
      expect(classifySubmitter(allowlisted).kind).toBe('organisation')
      expect(classifySubmitter(allowlisted, 'P').kind).toBe('organisation')
    })

    /* The 13 organisations whose staff filed through the private-person
     * registration, verified 2026-09-16 from the corpus comparison. Without
     * the allowlist the veto hides them; each matched exactly one upstream
     * string in GP XXVIII/XXVII and nothing else. */
    it.each([
      ['Bundestheater Holding GmbH, BTH', 'Bundestheater-Holding GmbH'],
      ['Patentanwaltskammer, Österr.', 'Österreichische Patentanwaltskammer'],
      ['Tirol Kliniken GmbH, Rechtsabteilung', 'Tirol Kliniken GmbH, Rechtsabteilung'],
      ['Fachstelle Suchtprävention, Soziale Dienste BGLD GmbH', 'Fachstelle Suchtprävention, Soziale Dienste BGLD GmbH'],
    ])('stays an organisation under a P flag: %s', (raw, shown) => {
      expect(classifySubmitter(raw, 'P')).toEqual({ kind: 'organisation', name: shown })
    })
  })

  /**
   * Parliament stores the submitter in two fields shaped "Nachname,
   * Vorname". An organisation that fills them in comes back inverted, and
   * was printed that way for as long as the row was public. A display name
   * de-inverts what the same string already says — it never invents one.
   */
  describe('allowlist display names', () => {
    it('prints the de-inverted name where the upstream string is inverted', () => {
      expect(classifySubmitter('Pressefreiheit, Institut für').name).toBe(
        'Institut für Pressefreiheit',
      )
      // Matched by the segment before the semicolon, like "Vier Pfoten".
      expect(
        classifySubmitter('GmbH, Verkehrsverbund Ost-Region (VOR); Verkehrsverbund Ost-Region (VOR) GmbH').name,
      ).toBe('Verkehrsverbund Ost-Region (VOR) GmbH')
    })

    it('prints the upstream string unchanged where no display name is given', () => {
      // The three entries that predate the mechanism must not have moved.
      expect(classifySubmitter('epicenter.works').name).toBe('epicenter.works')
      expect(classifySubmitter('WEISSER RING').name).toBe('WEISSER RING')
      // A full-string match keeps printing the full string.
      expect(classifySubmitter('Vier Pfoten').name).toBe('Vier Pfoten')
    })

    /* A head match prints the head alone. Until 2026-09-23 it printed the
     * whole string, so an allowlisted organisation with a person after the
     * semicolon — "Org; <Vorname Nachname>", a measured class — published
     * that person, and the upstream P flag could not veto it because the
     * allowlist outranks the flag. */
    it('prints the head alone where the head is what is allowlisted', () => {
      // Was 'Vier Pfoten; Stiftung für Tierschutz' — a department, harmless,
      // but the same code path that printed the tail below.
      expect(classifySubmitter('Vier Pfoten; Stiftung für Tierschutz').name).toBe('Vier Pfoten')
      expect(classifySubmitter('Vier Pfoten; Huber, Anna')).toEqual({
        kind: 'organisation',
        name: 'Vier Pfoten',
      })
    })

    it('a P flag cannot reach a head match — and no longer needs to', () => {
      expect(classifySubmitter('Vier Pfoten; Anna Huber', 'P')).toEqual({
        kind: 'organisation',
        name: 'Vier Pfoten',
      })
      expect(classifySubmitter('WEISSER RING; Huber, Anna', 'P')).toEqual({
        kind: 'organisation',
        name: 'WEISSER RING',
      })
      expect(classifySubmitter('epicenter.works; Mag. Thomas Muster', 'P')).toEqual({
        kind: 'organisation',
        name: 'epicenter.works',
      })
    })

    it('leaves a string that is not allowlisted alone', () => {
      // Same shape as an entry, different organisation — must not borrow a name.
      expect(classifySubmitter('Pressefreiheit, Verein für').name).not.toBe(
        'Institut für Pressefreiheit',
      )
    })

    it('without a flag nothing changes — every other caller keeps its behaviour', () => {
      for (const name of ['Vegane Gesellschaft Österreich', 'Mustermann, Maria', '']) {
        expect(classifySubmitter(name, null)).toEqual(classifySubmitter(name))
      }
    })
  })
})

/**
 * The kinds of path a text can take to a law or a Verordnung, as the
 * matrix on `/wege` draws them: one row per kind, one column per station
 * of the rail (`StationId`), and per cell whether the path passes the
 * station, skips it, or whether that depends on the case. Under the matrix,
 * the instruments that stand BESIDE a norm's path and have no stations
 * (`WEG_INSTRUMENTS`).
 *
 * It replaces the section „Der Weg eines Entwurfs" of /so-funktionierts
 * (14.11.2026), which told two of these paths in some 900 words.
 *
 * THE LAW IS THE SOURCE (14.11.2026, second pass). The first version was
 * built from what the monitor's code knows; it was then held against the
 * law in `docs/research/wege-zu-einer-rechtsnorm.md` („Abgleich mit der
 * Grafik") and corrected row by row. Every cell names the provision it
 * stands on, as the memo cites it; what the memo lists under „Offen" is
 * `offen` or left out, never drawn as a fact. A row the monitor does not
 * follow is still drawn — the law has the path — and says why
 * (`notFollowed`); whether the monitor follows a row is read from the code
 * named at the row.
 *
 * Left out on purpose, as no route on which anyone can take part: the
 * Notverordnung (Art. 18 Abs. 3–5 B-VG), the Wiederverlautbarung (Art. 49a)
 * and a VfGH-Aufhebung (Art. 140 Abs. 5) pass only „Kundgemacht"; the
 * Bundesrat's Einspruch and the Beharrungsbeschluss (Art. 42) are branches
 * inside „Parlament", the Volksabstimmung (Art. 43, 44 Abs. 3) one after it,
 * and it stands in the second block; the Länder's Verordnungen of the
 * Landeshauptmann or a Bezirksverwaltungsbehörde, their Notverordnung (Art.
 * 97 Abs. 3) and their Art. 15a Abs. 2 agreements, where the memo leaves the
 * stations open.
 *
 * The German copy lives here and nowhere in the page, so a second language
 * replaces this module's strings and not the template.
 *
 * Pure module: no Nuxt auto-imports, so vitest reads it as it is.
 */
import { gapDe } from '#shared/utils/gaps'
import type { AnliegenKind, LandDraftKind, ProcedureItemKind, RisConsultationKind } from '#shared/types'
import { ANLIEGEN_PATH, ANLIEGEN_SECTION_DE } from '#shared/utils/anliegen'
import { DRAFT_STATION_LABEL } from '#shared/utils/draftStations'
import { LAND_CODES, SOURCE_PARAM, formatSourceList } from '#shared/utils/laender'
import { euPath } from '#shared/utils/eu'
import { SECOND_ROUND_CLAUSE, type StationId } from './spine'

/**
 * What a path does at a station.
 *
 *  - `durch`: it passes the station.
 *  - `stellungnahme`: it passes, and anyone can file a Stellungnahme there —
 *    the one blue mark („you can do something here").
 *  - `entfaellt`: the path does not pass this station.
 *  - `offen`: it depends on the case, or the law as read does not settle
 *    it. Said as such, never drawn as either of the two above.
 */
export type WegCell = 'durch' | 'stellungnahme' | 'entfaellt' | 'offen'

/** The stations in the rail's order — the matrix's columns. */
export const WEG_STATION_ORDER: readonly StationId[] = ['entwurf', 'begutachtung', 'rv', 'parlament', 'bgbl']

export interface WegStation {
  id: StationId
  /** The list tabs' words (`DRAFT_STATION_LABEL`); „Entwurf" is the rail's. */
  label: string
  /** The list under that station's tab; null where the list has no such tab. */
  href: string | null
}

export const WEG_STATIONS: readonly WegStation[] = WEG_STATION_ORDER.map((id) => ({
  id,
  label: id === 'entwurf' ? 'Entwurf' : DRAFT_STATION_LABEL[id],
  // „Entwurf" is no tab: every row of the list is past it.
  href: id === 'entwurf' ? null : `/entwuerfe?station=${id}`,
}))

export const WEG_IDS = [
  'gesetz',
  'gesetz-als-antrag',
  'vorlage-ohne-begutachtung',
  'antrag-ohne-begutachtung',
  'ausschussantrag',
  'bundesrat-antrag',
  'volksbegehren',
  'verordnung',
  'verordnung-ohne-begutachtung',
  'regulierungsbehoerde',
  'staatsvertrag',
  'landesgesetz',
  'landesgesetz-ohne-entwurf',
  'landtag-antrag',
  'landes-volksbegehren',
  'landes-initiative',
  'landesverordnung',
] as const

export type WegId = (typeof WEG_IDS)[number]

export type WegLevel = 'bund' | 'land'

export interface Weg {
  id: WegId
  level: WegLevel
  label: string
  /** At most a few words; null where the row says it all. */
  note: string | null
  /** A link after the note, inside the site; null where none. */
  noteLink: { label: string; href: string } | null
  /** Why the monitor does not follow this path; null where it does. */
  notFollowed: string | null
  /**
   * What of a followed path the monitor does not show, one sentence — the
   * part before it reaches the monitor's source. Absent where nothing.
   */
  gap?: string
  cells: Record<StationId, WegCell>
  /** The list filtered to this kind; null where the list has no filter for it. */
  href: string | null
}

/* The list of Anliegen an das Parlament narrowed to one kind — its own
 * `?art=` (`anliegenArtOf`), open ones first as the list opens. */
const anliegenListHref = (kind: AnliegenKind): string => `${ANLIEGEN_PATH}?art=${kind}`

export const WEG_LEVEL_LABEL: Record<WegLevel, string> = {
  bund: 'Bund',
  land: 'Länder',
}

/** What a group's bar adds to its name: the stations' names at that level. */
export const WEG_LEVEL_NOTE: Record<WegLevel, string | null> = {
  bund: null,
  land: 'Parlament ist hier der Landtag, kundgemacht wird im Landesgesetzblatt',
}

/* Every Land as the only sources: the list's own parameter
 * (`useSourceChoice`), so a Länder row opens the Länder alone. */
const LAENDER_SOURCES = formatSourceList(LAND_CODES)

/* The Begutachtung per Land, as the law has it: the step „Begutachtung
 * vorgeschrieben" on /datenlage (`shared/utils/datenlage.ts`). */
const LAND_LAW_LINK = { label: 'Rechtslage', href: '/datenlage?ansicht=schritt#begutachtung-vorgeschrieben' }

const row = (
  cells: [entwurf: WegCell, begutachtung: WegCell, rv: WegCell, parlament: WegCell, bgbl: WegCell],
): Record<StationId, WegCell> => ({
  entwurf: cells[0],
  begutachtung: cells[1],
  rv: cells[2],
  parlament: cells[3],
  bgbl: cells[4],
})

export const WEGE: readonly Weg[] = [
  /* ---------------------------------------------------------------- Bund */

  /* The rail of a Ministerialentwurf (`stations`).
   *  - Begutachtung: anyone may file, though no law prescribes it for the
   *    Bund — Rundschreiben of the Verfassungsdienst; § 9 Abs. 3
   *    WFA-Grundsatz-Verordnung sets only the Frist.
   *  - Regierungsvorlage, Parlament: Art. 41 Abs. 1 B-VG; § 23b Abs. 1
   *    GOG-NR admits Stellungnahmen on „Vorlagen der Bundesregierung"
   *    „während des parlamentarischen Gesetzgebungsverfahrens"
   *    (`SECOND_ROUND_WINDOW`). The list offers „Stellungnahme möglich" under
   *    both tabs for that reason (`OPEN_UNAVAILABLE` in pages/entwuerfe).
   *  - Kundgemacht: Art. 49 Abs. 1 B-VG, BGBl. I (BGBlG § 3 Z 1). */
  {
    id: 'gesetz',
    level: 'bund',
    label: 'Gesetzesentwurf',
    note: `Stellungnahme ${SECOND_ROUND_CLAUSE}`,
    noteLink: null,
    notFollowed: null,
    cells: row(['durch', 'stellungnahme', 'stellungnahme', 'stellungnahme', 'durch']),
    href: '/entwuerfe?art=gesetz',
  },
  /* A Ministerialentwurf whose text became law as an Initiativantrag — both
   * routes of the list's option of the same name in the plural (`ART_CHOICES`,
   * `antragRouteCitation`): the inferred one (no Vorlage, the Antrag carries
   * the draft, `antragPath.ts`) and the stated one (the Vorlage's
   * Gesetzesbeschluss was not promulgated and Parliament names the Antrag
   * that followed: 2/ME XXVIII → 80 d.B. → 416/A). What all its rows share is
   * the Antrag, so the note says that; the Regierungsvorlage is therefore
   * `offen`, not `entfaellt` (it was „ohne Regierungsvorlage" until
   * 14.11.2026, false for 2/ME).
   *  - Begutachtung: as `gesetz`.
   *  - Regierungsvorlage: passed on the stated route, with § 23b; none on the
   *    inferred one.
   *  - Parlament: § 23b Abs. 1 GOG-NR, „Selbständige Anträge von
   *    Abgeordneten"; § 26 Abs. 4 (five members).
   *  - Kundgemacht: Art. 49 B-VG. */
  {
    id: 'gesetz-als-antrag',
    level: 'bund',
    label: 'Gesetzesentwurf, als Initiativantrag eingebracht',
    note: 'teils nach einer Regierungsvorlage',
    noteLink: null,
    notFollowed: null,
    cells: row(['durch', 'stellungnahme', 'offen', 'stellungnahme', 'durch']),
    href: '/entwuerfe?art=als-antrag',
  },
  /* `vorlageStations` with `withoutBegutachtung`; the list's option
   * „Regierungsvorlagen ohne Entwurf" (`ART_CHOICES`). Labelled „ohne
   * Entwurf" since 14.11.2026: the filter also holds the Vorlagen whose
   * committee invited Stellungnahmen (Ausschussbegutachtung, § 40 Abs. 1
   * GOG-NR — a circle the committee invites, not the public, so no blue
   * mark), and „ohne Begutachtung" was false for them. The id and the URL
   * value stay (links exist).
   *  - Regierungsvorlage, Parlament: § 23b Abs. 1 GOG-NR.
   *  - Kundgemacht: Art. 49 B-VG. */
  {
    id: 'vorlage-ohne-begutachtung',
    level: 'bund',
    label: 'Regierungsvorlage ohne Entwurf',
    note: 'teils mit Ausschussbegutachtung',
    noteLink: null,
    notFollowed: null,
    cells: row(['entfaellt', 'entfaellt', 'stellungnahme', 'stellungnahme', 'durch']),
    href: '/entwuerfe?begutachtung=ohne&art=vorlage',
  },
  /* The same page for an Initiativantrag (`ityp` 'A'). Art. 41 Abs. 1 B-VG,
   * § 26 Abs. 4 GOG-NR (five members); no Begutachtung: Parliament's
   * research service (RLW, 03.02.2026) — drafts that come from members do
   * not go into one. Parlament: § 23b Abs. 1 GOG-NR. */
  {
    id: 'antrag-ohne-begutachtung',
    level: 'bund',
    label: 'Initiativantrag ohne Entwurf',
    note: 'von Abgeordneten, teils mit Ausschussbegutachtung',
    noteLink: null,
    notFollowed: null,
    cells: row(['entfaellt', 'entfaellt', 'entfaellt', 'stellungnahme', 'durch']),
    href: '/entwuerfe?begutachtung=ohne&art=antrag',
  },
  /* § 27 Abs. 1 GOG-NR: a committee's own motion. Parliament lists it as an
   * item of its own (type BUA, 84 in GP XXVII, 18 in XXVIII), and § 23b
   * Abs. 1 admits Stellungnahmen on „Anträge … von Ausschüssen" — one is
   * counted on 14/BUA XXVIII. Until 14.11.2026 the row said „kein eigener
   * Gegenstand im Parlament", which was wrong.
   *  - Begutachtung: `offen` as in the memo („? (§ 40)"); no
   *    Ministerialentwurf exists.
   *  - Kundgemacht: Art. 49 B-VG.
   * Followed since 14.11.2026: each BUA item has its own page
   * (`/entwuerfe/<gp>/ausschussantrag/<nr>`), and the list the option
   * „Ausschussanträge ohne Entwurf" (`art=ausschussantrag`): the law's RIS
   * record names the motion as its Ausschussbericht, and the list classes it
   * like an Antrag (`skippedLaws.ts`, decision 2). One term,
   * „Ausschussantrag", here as on the page (decision 8 of 14.11.2026). */
  {
    id: 'ausschussantrag',
    level: 'bund',
    label: 'Ausschussantrag',
    note: null,
    noteLink: null,
    notFollowed: null,
    cells: row(['entfaellt', 'offen', 'entfaellt', 'stellungnahme', 'durch']),
    href: '/entwuerfe?begutachtung=ohne&art=ausschussantrag',
  },
  /* Art. 41 Abs. 1 B-VG; § 21 Abs. 1 and 3 GO-BR. § 23b Abs. 1 GOG-NR names
   * „Gesetzesanträge des Bundesrates" (Parliament: type GABR, open since
   * 1.8.2021) — hence blue. The motion of a third of the Bundesrat's members
   * (§ 21 Abs. 6 GO-BR, type GABR13) is the same route, but whether § 23b
   * covers it is „Offen" in the memo, so the note says so instead of a mark.
   * Kundgemacht `offen` as in the memo: rare, and most stayed in committee
   * (one became BGBl. I Nr. 44/2015). Counts (list 101, 14.11.2026): GABR
   * 3 · 2 · 0 · 2 · 0 and GABR13 0 · 0 · 2 · 4 · 0 in GP XXIV–XXVIII.
   * Followed since 14.11.2026: each has its own page
   * (`/entwuerfe/<gp>/bundesratsantrag/<nr>`), and a law from one is
   * classed like an Antrag (`skippedLaws.ts`). No link (decision 3 of
   * 14.11.2026): no list option of its own — its rows stand under „Alle
   * ohne Entwurf", too few for an option. */
  {
    id: 'bundesrat-antrag',
    level: 'bund',
    label: 'Gesetzesantrag des Bundesrates',
    note: 'Antrag eines Drittels: Stellungnahme offen',
    noteLink: null,
    notFollowed: null,
    cells: row(['entfaellt', 'entfaellt', 'entfaellt', 'stellungnahme', 'offen']),
    href: null,
  },
  /* Art. 41 Abs. 2 B-VG; § 23b Abs. 1 GOG-NR (open since 1.8.2021,
   * docs/research/volksbegehren.md § 6). It may take the form of a
   * Gesetzesantrag (Art. 41 Abs. 2, § 3 Abs. 1 VoBeG 2018), so „kein
   * Gesetzestext" (until 14.11.2026) was only partly true. Kundgemacht
   * `offen`: no law is owed (§ 24 GOG-NR sets deadlines, not an outcome).
   * Followed since 15.11.2026 for its time in the Nationalrat, as an Anliegen
   * an den Nationalrat (`/anliegen`, from GP XXII on, `anliegenIsFollowed`):
   * its course from the Einlangen to the plenary, not what became of it
   * afterwards — that is attribution over years, which no source links
   * (volksbegehren.md, verdict and § 9). Unterstützung and Eintragung happen
   * before, at the Bundesministerium für Inneres, without an interface: the
   * row's `gap`. Signing one is in the second block. */
  {
    id: 'volksbegehren',
    level: 'bund',
    label: 'Volksbegehren',
    note: 'im Monitor für seine Zeit im Nationalrat',
    noteLink: null,
    notFollowed: null,
    gap: gapDe('outOfScope', 'Unterstützung und Eintragung vor dem Einlangen im Nationalrat.'),
    cells: row(['entfaellt', 'entfaellt', 'entfaellt', 'stellungnahme', 'offen']),
    href: anliegenListHref('volksbegehren'),
  },
  /* `regulationStations`: a ministry's Verordnung that WAS put out for
   * Begutachtung — RIS „Begut" holds only ministries' drafts (4.620 records,
   * memo). Art. 18 Abs. 2 B-VG; Begutachtung possible, not required (§ 9
   * Abs. 4 WFA-GV); the Stellungnahme goes to the ministry
   * (`risFilingNote`). No Nationalrat. Kundgemacht: BGBl. II (BGBlG § 4
   * Abs. 1 Z 2). The ones without a Begutachtung are the next row. */
  {
    id: 'verordnung',
    level: 'bund',
    label: 'Verordnungsentwurf',
    note: 'eines Ministeriums',
    noteLink: null,
    notFollowed: null,
    cells: row(['durch', 'stellungnahme', 'entfaellt', 'entfaellt', 'durch']),
    href: '/entwuerfe?art=verordnung',
  },
  /* § 9 Abs. 4 WFA-GV counts on Verordnungen for which „ein
   * Begutachtungsverfahren … nicht vorgesehen ist". Entwurf `offen` (memo:
   * „?"); Kundgemacht BGBl. II (BGBlG § 4 Abs. 1 Z 2). Not followed: that a
   * Verordnung had no Begutachtung is a claim about absence, and no source
   * states it — RIS records the drafts that were put out, never that one
   * was not. The only witness would be our own join of drafts to
   * Kundmachungen, and it misses real pairs (263 of 304 drafts matched,
   * 14.11.2026; of 15 old misses read, 7 were promulgated). The reason
   * named until 15.11.2026, „Kundmachung zu rund 85 % auffindbar", read as
   * a quality figure of the monitor and said nothing about why
   * (docs/research/wege-ausserhalb-der-stationen.md, item 4). */
  {
    id: 'verordnung-ohne-begutachtung',
    level: 'bund',
    label: 'Verordnung ohne Begutachtung',
    note: null,
    noteLink: null,
    notFollowed: 'keine Quelle belegt, dass die Begutachtung fehlte',
    cells: row(['offen', 'entfaellt', 'entfaellt', 'entfaellt', 'durch']),
    href: null,
  },
  /* A regulator's Verordnung: the Begutachtung is prescribed by law, on the
   * authority's own site — E-ControlG § 36 Abs. 3 („eine öffentliche
   * Begutachtung mit angemessener Frist"), FMABG § 22 Abs. 3a, TKG 2021
   * § 206 (at least 30 days). Kundgemacht in BGBl. II where ordered, else „in
   * anderer geeigneter Weise" (BGBlG § 4 Abs. 2 Z 2, E-ControlG § 36 Abs. 3)
   * — passed either way. Not followed: RIS „Begut" holds only ministries. */
  {
    id: 'regulierungsbehoerde',
    level: 'bund',
    label: 'Verordnung einer Regulierungsbehörde',
    note: 'Begutachtung bei E-Control, FMA, RTR',
    noteLink: null,
    notFollowed: 'Entwürfe nicht im RIS',
    cells: row(['durch', 'stellungnahme', 'entfaellt', 'entfaellt', 'durch']),
    href: null,
  },
  /* ONE row for three kinds (decided 14.11.2026): a Staatsvertrag the
   * Nationalrat must approve (Art. 50 B-VG: Vorlage type RVS, then
   * Parlament), one it need not (Art. 65 Abs. 1, 66 Abs. 2: neither), and a
   * Vereinbarung nach Art. 15a (approval only where it binds federal
   * legislation). They differ only at Regierungsvorlage and Parlament,
   * where none of them allows a Stellungnahme — Parliament refuses it for
   * RVS („Keine Begutachtung bei dem Doktyp "RVS" möglich", 0 Stellungnahmen
   * on 131 such Vorlagen in GP XXVII and XXVIII) — so `offen` there is true
   * for all three, and the note says what a split would have shown.
   *  - Entwurf, Begutachtung: `offen` — possible (§ 10 Abs. 1 WKG names
   *    Staatsverträge and Art. 15a agreements), never required. Until
   *    14.11.2026 drawn as `durch`/blue, which claimed more.
   *  - Kundgemacht: BGBl. III (BGBlG § 5 Abs. 1 Z 1; exception § 5 Abs. 3);
   *    a Vereinbarung in BGBl. I with the Nationalrat's approval (§ 3 Z 6),
   *    else BGBl. II (§ 4 Abs. 1 Z 7).
   * Followed since 14.11.2026 (step 5) from the Vorlage on: each treaty's
   * Vorlage (`RVS`) has its own page (`/entwuerfe/<gp>/staatsvertrag/<nr>`)
   * with its Kundmachung in BGBl. III or I, read by the exact key of period
   * and Vorlage (`findBgblForTreaty`), and the list the option
   * „Staatsverträge" (`art=staatsvertraege`, decision 3). A treaty the
   * Nationalrat need not approve has no Vorlage there and stays outside;
   * the drafts in Begutachtung stand under „Andere Entwürfe" beside
   * programmes, which is why the link goes to the Vorlagen. */
  {
    id: 'staatsvertrag',
    level: 'bund',
    // A non-breaking hyphen (U+2011): „B-VG“ broke at its hyphen in the matrix.
    label: 'Staatsvertrag, Vereinbarung nach Art. 15a B‑VG',
    note: 'im Parlament keine Stellungnahme',
    noteLink: null,
    notFollowed: null,
    cells: row(['offen', 'offen', 'offen', 'offen', 'durch']),
    href: '/entwuerfe?art=staatsvertraege',
  },

  /* -------------------------------------------------------------- Länder */

  /* `landStations` with a Landtag record: a Land's DRAFT in Begutachtung —
   * the Bund's five stations, „Landtag" and „Landesgesetzblatt" in place of
   * Parlament and Bundesgesetzblatt (Art. 97 Abs. 1 B-VG). The blue mark
   * stands for the drafts the row holds; the law behind it differs by Land
   * (constitutionally required in K, N, St, T, V; „soll"/„kann" in B and O;
   * nothing in the constitution of S and W), so the note points to
   * /datenlage instead of suggesting one right.
   * Landtag: four Länder let a committee put Anträge out for Begutachtung
   * (B Art. 68 Abs. 4 L-VG, K Art. 33 Abs. 2 K-LVG, O Art. 58 Abs. 2 Oö.
   * L-VG, St Art. 68 Abs. 2 L-VG 2010), by the committee's decision; that it
   * covers a Regierungsvorlage the memo does not say, so this row's Landtag
   * stays `durch` and the motions have their own row (`landtag-antrag`).
   * (Until 14.11.2026 this comment said no such window was documented.) */
  {
    id: 'landesgesetz',
    level: 'land',
    label: 'Landesgesetz',
    note: 'Begutachtung je Land verschieden geregelt',
    noteLink: LAND_LAW_LINK,
    notFollowed: null,
    cells: row(['durch', 'stellungnahme', 'durch', 'durch', 'durch']),
    href: `/entwuerfe?art=gesetz&${SOURCE_PARAM}=${LAENDER_SOURCES}`,
  },
  /* `landLawStations`: every Land's law from RIS without a joined draft,
   * whether it came as a Regierungsvorlage or as a motion in the Landtag
   * (`routeOf`, as RIS states it; Salzburg and Oberösterreich compare the
   * Antrag with the Kundmachung, `antrag>lgbl`). The Begutachtung is known
   * only in Salzburg (decisions.md, „Ohne Begutachtung"). The list's option
   * of the same name (14.11.2026), every Land as the sources. */
  {
    id: 'landesgesetz-ohne-entwurf',
    level: 'land',
    label: 'Landesgesetz ohne zugeordneten Entwurf',
    note: 'Begutachtung nur in Salzburg feststellbar',
    noteLink: null,
    notFollowed: null,
    cells: row(['entfaellt', 'offen', 'offen', 'durch', 'durch']),
    href: `/entwuerfe?begutachtung=ohne&art=landesgesetz&${SOURCE_PARAM}=${LAENDER_SOURCES}`,
  },
  /* A motion of members or of a committee in the Landtag (every Land's
   * constitution or Geschäftsordnung, memo „Wer einen Gesetzesvorschlag in
   * den Landtag bringt"; Wien's committees not verified). No Begutachtung
   * before it, no Vorlage. Landtag `offen`: a committee MAY put it out for
   * Begutachtung in four Länder (B Art. 68 Abs. 4, K Art. 33 Abs. 2, O
   * Art. 58 Abs. 2, St Art. 68 Abs. 2), by its own decision, nowhere else
   * by the constitution. Kundgemacht: Art. 97 Abs. 1 B-VG.
   * Followed only from its end: the law it becomes is a row of
   * `landesgesetz-ohne-entwurf`; the motion before the Kundmachung and a
   * committee's Begutachtung of it the monitor does not read. */
  {
    id: 'landtag-antrag',
    level: 'land',
    label: 'Antrag im Landtag',
    note: 'Ausschussbegutachtung in Bgld., Ktn., OÖ, Stmk.',
    noteLink: null,
    notFollowed: 'nur das Gesetz daraus',
    cells: row(['entfaellt', 'entfaellt', 'entfaellt', 'offen', 'durch']),
    href: null,
  },
  /* A Land's Volksbegehren, in all nine (B Art. 30, K Art. 31 Abs. 2, N
   * Art. 26, S Art. 21 Abs. 2, St Art. 69, T Art. 37, V Art. 33 Abs. 4, W
   * § 131b WStV; Oberösterreich's Bürgerinitiative, Art. 59, is the next
   * row). Regierungsvorlage `offen`: in N and S it becomes a Vorlage of the
   * Landesregierung (N Art. 26 Abs. 2, S Art. 21 Abs. 2). Landtag: passed.
   * Kundgemacht `offen` (memo „?"). Not followed: whether the Landtage
   * publish them in a form the monitor could read is not checked (memo,
   * „Was sich verfolgen ließe"). */
  {
    id: 'landes-volksbegehren',
    level: 'land',
    label: 'Volksbegehren im Land',
    note: 'Vorlage in Niederösterreich und Salzburg',
    noteLink: null,
    notFollowed: 'Quellen nicht geprüft',
    cells: row(['entfaellt', 'entfaellt', 'offen', 'durch', 'offen']),
    href: null,
  },
  /* The Land-specific routes, one row (memo, „Wer einen Gesetzesvorschlag
   * in den Landtag bringt" and „Je Land, was besonders ist"): the
   * Gemeindeinitiative of the Steiermark (Art. 71 L-VG 2010, 50 Gemeinden),
   * a Volksbegehren of Gemeinden in B (Art. 30 Abs. 1 Z 2, 3), N (Art. 26),
   * T (Art. 37), V (Art. 33), and Oberösterreich's Bürgerinitiative (Art. 59
   * Oö. L-VG). Begutachtung `offen` as in the memo („? (Art. 58 Abs. 2)" for
   * O); Landtag passed; Kundgemacht `offen`. Not followed, for the reason
   * of the row above. The note counts the Länder instead of listing them
   * (14.11.2026): six names and three forms took three lines, and Land
   * letters (B, N, T, V) are unreadable to a citizen. */
  {
    id: 'landes-initiative',
    level: 'land',
    label: 'Initiative von Gemeinden oder Bürgerinnen und Bürgern',
    note: 'in sechs Ländern, je Land eigene Form',
    noteLink: null,
    notFollowed: 'Quellen nicht geprüft',
    cells: row(['entfaellt', 'offen', 'entfaellt', 'durch', 'offen']),
    href: null,
  },
  /* A Verordnung of the Landesregierung (Art. 101 Abs. 1, Art. 18 Abs. 2
   * B-VG) whose DRAFT is in Begutachtung, as the Land lists it. Begutachtung
   * required only in N (Art. 45a NÖ LV, „von allgemeiner Bedeutung") and St
   * (Art. 68 Abs. 1 L-VG 2010), possible in O (Art. 61), otherwise not in
   * the constitution — hence the note and the link. No Landtag.
   * Kundgemacht: where each Land orders it (not checked in the memo); the
   * monitor reads the Landesgesetzblatt. */
  {
    id: 'landesverordnung',
    level: 'land',
    label: 'Verordnung der Landesregierung',
    note: 'Begutachtung nur in wenigen Ländern vorgeschrieben',
    noteLink: LAND_LAW_LINK,
    notFollowed: null,
    cells: row(['durch', 'stellungnahme', 'entfaellt', 'entfaellt', 'durch']),
    href: `/entwuerfe?art=verordnung&${SOURCE_PARAM}=${LAENDER_SOURCES}`,
  },
]

/** The level groups in table order, each with its rows. */
export function wegGroups(): { level: WegLevel; label: string; note: string | null; rows: Weg[] }[] {
  return (['bund', 'land'] as const).map((level) => ({
    level,
    label: WEG_LEVEL_LABEL[level],
    note: WEG_LEVEL_NOTE[level],
    rows: WEGE.filter((w) => w.level === level),
  }))
}

/**
 * The lead-in above the national paths: an EU act a draft carries out.
 * Art. 288 AEUV — a Richtlinie needs a national act (Umsetzung), a
 * Verordnung applies directly and draws accompanying rules. The monitor
 * marks both on a draft (`EuMarker`: `umsetzung`, `flankierend-vo`). It named
 * the Richtlinie alone until 14.11.2026. The list filters only the first
 * (`EuFilter`), so the list link says so.
 */
export const EU_LEAD = {
  label: 'EU-Richtlinie, EU-Verordnung',
  href: '/eu-recht',
  note: 'Umsetzung einer Richtlinie, begleitende Regeln zu einer Verordnung',
  list: { label: 'Entwürfe, die EU-Recht umsetzen', href: '/entwuerfe?eu=umsetzung' },
} as const

/** What a cell says in words — beside the mark, or for a screen reader. */
export const WEG_CELL_LABEL: Record<WegCell, string> = {
  durch: 'durchläuft',
  stellungnahme: 'Stellungnahme möglich',
  entfaellt: 'entfällt',
  offen: 'je nach Fall',
}

/** The legend: the marks that need one. The dash speaks for itself. */
export const WEG_LEGEND: readonly { cell: WegCell; label: string }[] = [
  { cell: 'durch', label: 'Station' },
  { cell: 'stellungnahme', label: 'Stellungnahme möglich' },
  { cell: 'offen', label: 'je nach Fall' },
]

/* ------------------------------------------------------------------ */
/* Beside the path                                                     */
/* ------------------------------------------------------------------ */

export type WegInstrumentLevel = 'eu' | 'bund' | 'land'

export const WEG_INSTRUMENT_LEVEL_LABEL: Record<WegInstrumentLevel, string> = {
  eu: 'EU',
  bund: 'Bund',
  land: 'Land',
}

/**
 * An instrument beside a norm's path: no station of the matrix, but a way
 * to say something about a law. Source: the memo's „Wo man sich äußern
 * kann", each line's provision in the comment above it.
 */
export interface WegInstrument {
  id: string
  level: WegInstrumentLevel
  name: string
  /** What one can do, in two or three words. */
  act: string
  /** Who must respond, and how — only where the memo cites the duty; null otherwise. */
  duty: string | null
  /** The one instrument whose result decides (the Volksabstimmung). */
  binding: boolean
  /**
   * The official place where it is done — only URLs the memo names; null
   * where it names none, never a guessed address.
   */
  href: string | null
  /** The link's words, the host as the reader will see it. */
  hrefLabel: string | null
  /**
   * The monitor's own section for it, where it follows the instrument's
   * items (15.11.2026: Petition, Bürgerinitiative, Volksbegehren under
   * `/anliegen`). The name links there; `href` stays beside it as the source.
   * Absent where the monitor follows none.
   */
  monitorHref?: string
  /**
   * Where the monitor follows the instrument, inside the site; null where it
   * does not. The portal's consultations since 15.11.2026 (step 3 of the EU
   * cycle), the European Citizens' Initiative since the same day (step 5).
   */
  followed: { label: string; href: string } | null
}

/* Parliament's page „Petitionen unterstützen" (memo, „Quellen"): it covers
 * Petitionen and Bürgerinitiativen alike. */
const PARLAMENT_PETITIONEN = 'https://www.parlament.gv.at/beteiligen/unterstuetzen/petitionen'

export const WEG_INSTRUMENTS: readonly WegInstrument[] = [
  /* Art. 11 Abs. 3 EUV; COM(2021) 219 („Bessere Rechtsetzung"): calls for
   * evidence, public consultations (twelve weeks), feedback on proposals.
   * A summary report, no answer to the single contribution — no duty here.
   * The memo names only the portal's undocumented JSON endpoint, no page.
   * Followed since 15.11.2026: every open window is listed on the EU page
   * (step 3 of the EU cycle), and each initiative's page links the portal. */
  {
    id: 'eu-konsultation',
    level: 'eu',
    name: 'Konsultationen der Kommission („Ihre Meinung zählt“)',
    act: 'Rückmeldung geben, an Konsultationen teilnehmen',
    duty: null,
    binding: false,
    href: null,
    hrefLabel: null,
    followed: { label: 'offene Fristen im Monitor', href: `${euPath()}#eu-fenster` },
  },
  /* Art. 11 Abs. 4 EUV; VO (EU) 2019/788 Art. 3 (one million signatories
   * from a quarter of the member states). Art. 15 Abs. 2: the Commission
   * sets out its conclusions „in einer Mitteilung", with reasons, within six
   * months. The memo names only the register's API, no page.
   * Followed since 15.11.2026: every initiative in collection is listed on
   * the EU page (step 5 of the EU cycle), and each initiative has a page
   * with its own rail. */
  {
    id: 'eu-buergerinitiative',
    level: 'eu',
    name: 'Europäische Bürgerinitiative',
    act: 'unterstützen',
    duty: 'die Kommission antwortet binnen sechs Monaten mit Gründen',
    binding: false,
    href: null,
    hrefLabel: null,
    followed: { label: 'Initiativen in der Sammlung im Monitor', href: `${euPath()}#eu-buergerinitiativen` },
  },
  /* Art. 227 AEUV: anyone resident in the Union, on a matter that affects
   * them directly. What follows is not checked in the memo. */
  {
    id: 'eu-petition',
    level: 'eu',
    name: 'Petition an das Europäische Parlament',
    act: 'einreichen',
    duty: null,
    binding: false,
    href: null,
    hrefLabel: null,
    followed: null,
  },
  /* § 100 Abs. 1 Z 1 GOG-NR: handed in by a member of the Nationalrat;
   * electronic support on Parliament's page (legal basis not found, memo
   * „Offen"); Stellungnahmen during its treatment, § 23b Abs. 2. Duty:
   * a committee report with one of three motions, § 100c Abs. 3. */
  {
    id: 'petition',
    level: 'bund',
    name: 'Petition an den Nationalrat',
    act: 'über Abgeordnete einbringen, online unterstützen',
    duty: 'der Ausschuss muss berichten',
    binding: false,
    href: PARLAMENT_PETITIONEN,
    hrefLabel: 'parlament.gv.at',
    monitorHref: anliegenListHref('petition'),
    followed: null,
  },
  /* § 100 Abs. 1 Z 2, Abs. 2 GOG-NR: 500 Austrian citizens from 16, signed
   * by hand; online support and § 23b Abs. 2 as above. Duty as the
   * Petition's (§ 100c Abs. 3); the first signatory is informed of the
   * outcome (§ 100d). */
  {
    id: 'buergerinitiative',
    level: 'bund',
    name: 'Parlamentarische Bürgerinitiative',
    act: 'mit 500 Unterschriften einbringen, online unterstützen',
    duty: 'der Ausschuss muss berichten',
    binding: false,
    href: PARLAMENT_PETITIONEN,
    hrefLabel: 'parlament.gv.at',
    monitorHref: anliegenListHref('buergerinitiative'),
    followed: null,
  },
  /* Art. 41 Abs. 2 B-VG; VoBeG 2018 §§ 3–6 (support online with ID Austria
   * or at the Gemeinde, eight days of Eintragung). Duty: treatment within
   * deadlines (§ 24 GOG-NR), no outcome owed. Its way through the
   * Nationalrat is a row of the matrix, and followed under `/anliegen`
 * (15.11.2026); the support before it is not. The memo names no official
 * page. */
  {
    id: 'volksbegehren',
    level: 'bund',
    name: 'Volksbegehren',
    act: 'unterstützen, unterschreiben',
    duty: 'der Nationalrat muss es in Fristen behandeln',
    binding: false,
    href: null,
    hrefLabel: null,
    monitorHref: anliegenListHref('volksbegehren'),
    followed: null,
  },
  /* Art. 43 (an ordinary law, if the Nationalrat so decides or a majority
   * of its members demands it) and Art. 44 Abs. 3 B-VG (a total revision of
   * the constitution always, a partial one on demand of a third of either
   * chamber). Art. 45: the majority decides — the only binding instrument. */
  {
    id: 'volksabstimmung',
    level: 'bund',
    name: 'Volksabstimmung',
    act: 'über einen Gesetzesbeschluss abstimmen',
    duty: 'das Ergebnis entscheidet über das Gesetz',
    binding: true,
    href: null,
    hrefLabel: null,
    followed: null,
  },
  /* Art. 49b B-VG: on the Nationalrat's decision; the result goes to the
   * Nationalrat and the Bundesregierung. The memo cites no binding effect
   * and no duty, so none is said. */
  {
    id: 'volksbefragung',
    level: 'bund',
    name: 'Volksbefragung',
    act: 'befragt werden',
    duty: null,
    binding: false,
    href: null,
    hrefLabel: null,
    followed: null,
  },
  /* The Länder's own instruments, one line (memo, the Länder tables):
   * Volksbegehren, Volksabstimmung, Volksbefragung and petitions as each
   * Landesverfassung has them, the Bürgerrat of Vorarlberg (a guideline
   * of the Landesregierung, Art. 1 Abs. 4 L-V). Duties differ — an answer
   * to a petition within three months in V (Art. 10), an answer in O
   * (Art. 64) and St (Art. 76), reasons from the Landtag after a
   * Bürgerinitiative in O (Art. 59 Abs. 7) — so the line says „teils". */
  {
    id: 'laender',
    level: 'land',
    name: 'Volksbegehren, Volksabstimmung, Volksbefragung, Petition, Bürgerrat',
    act: 'je nach Landesverfassung',
    duty: 'teils Pflicht zur Antwort',
    binding: false,
    href: null,
    hrefLabel: null,
    followed: null,
  },
]

export const WEGE_COPY = {
  title: 'Der Weg eines Entwurfs',
  description:
    'Alle Wege, die ein Text zum Gesetz oder zur Verordnung nehmen kann – beim Bund, in den Ländern, ausgehend vom EU-Recht –, Station für Station, und wo eine Stellungnahme möglich ist.',
  lede: 'Welche Stationen ein Text durchläuft, bis er gilt – und wo Sie Stellung nehmen können.',
  caption: 'Wege zum Gesetz und zur Verordnung, nach Station',
  pathColumn: 'Weg',
  notFollowedPrefix: 'nicht im Monitor',
  selected: 'dieser Weg',
  instrumentsHeading: 'Weitere Wege, sich zu äußern',
  instrumentsLede: `Neben dem Weg einer Norm, ohne Stationen. Petitionen, Bürgerinitiativen und Volksbegehren im Nationalrat verfolgt der Monitor als ${ANLIEGEN_SECTION_DE}, die Konsultationen der Kommission unter EU-Recht, die übrigen nicht.`,
} as const

export function isWegId(value: unknown): value is WegId {
  return typeof value === 'string' && (WEG_IDS as readonly string[]).includes(value)
}

/** The matrix with one row marked: `/wege?weg=…`. */
export function wegHref(id: WegId): string {
  return `/wege?weg=${id}`
}

/**
 * Which row a page's record walks, from the facts the page already holds.
 * Null where none fits for certain — a Vorlage whose committee consulted, or
 * one whose Begutachtung cannot be told, is neither „ohne" row; a RIS record
 * whose title names no legal form may be a programme, not a Staatsvertrag.
 *
 * `viaAntrag` on a Ministerialentwurf is `draftTookAntragRoute`
 * (`shared/utils/antragPath.ts`): both routes the list's option holds, so a
 * draft's page and the list point at the same row.
 */
export type WegFacts =
  | { source: 'ministerialentwurf'; viaAntrag: boolean }
  | { source: 'ris'; kind: RisConsultationKind }
  | { source: 'vorlage'; ityp: 'I' | 'A'; withoutBegutachtung: boolean; itemKind?: ProcedureItemKind }
  | { source: 'land'; kind: LandDraftKind }
  | { source: 'landesgesetz' }

export function wegFor(f: WegFacts): WegId | null {
  switch (f.source) {
    case 'ministerialentwurf':
      return f.viaAntrag ? 'gesetz-als-antrag' : 'gesetz'
    case 'ris':
      // `unbestimmt` holds programmes besides Staatsverträge and
      // Vereinbarungen (`RIS_KIND_LABEL`): no row fits for certain.
      return f.kind === 'verordnung' ? 'verordnung' : f.kind === 'gesetz' ? 'gesetz' : null
    case 'vorlage':
      // A committee's motion walks its own row, whatever is known about a
      // Begutachtung: the row is the kind of item, not its outcome.
      if (f.itemKind === 'ausschussantrag') return 'ausschussantrag'
      if (f.itemKind === 'bundesratsantrag') return 'bundesrat-antrag'
      if (f.itemKind === 'staatsvertrag') return 'staatsvertrag'
      if (!f.withoutBegutachtung) return null
      return f.ityp === 'I' ? 'vorlage-ohne-begutachtung' : 'antrag-ohne-begutachtung'
    case 'land':
      return f.kind === 'gesetz' ? 'landesgesetz' : 'landesverordnung'
    case 'landesgesetz':
      return 'landesgesetz-ohne-entwurf'
  }
}

/**
 * The pages „Wege der Gesetzgebung", one per jurisdiction since 16.11.2026
 * (`WEGE_PAGES`: the country's at `/wege`, the EU's at `euWegePath()`), and
 * first the kinds of path a text can take to a law or a Verordnung, as the
 * country's national matrices draw them: one row per kind, one column per station
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
 * inside „Parlament"; the Länder's Verordnungen of the
 * Landeshauptmann or a Bezirksverwaltungsbehörde, their Notverordnung (Art.
 * 97 Abs. 3) and their Art. 15a Abs. 2 agreements, where the memo leaves the
 * stations open.
 *
 * The German copy lives here and nowhere in the page, so a second language
 * replaces this module's strings and not the template.
 *
 * The Volksabstimmung (Art. 43, 44 Abs. 3 B-VG; in the Länder their own
 * constitutions) is a row since 16.11.2026, once for the Bund and once for
 * the Länder: it stands between the Beschluss and the Kundmachung, so it
 * belongs to a law's path, not beside it. It has no column — a sixth
 * station would be empty in every other row — so the row says it in its
 * note, and its Kundmachung is `offen` (only if accepted). Until then it
 * stood in the list „Nicht im Monitor" as an instrument.
 *
 * Pure module: no Nuxt auto-imports, so vitest reads it as it is.
 */
import { gapDe } from '#shared/utils/gaps'
import { ANLIEGEN_PATH } from '#shared/utils/anliegen'
import { DRAFT_STATION_LABEL } from '#shared/utils/draftStations'
import { LAND_CODES, SOURCE_PARAM, formatSourceList } from '#shared/utils/laender'
import type { AnliegenKind, EuActHead, EuAdoptedBy, LandDraftKind, ProcedureItemKind, RisConsultationKind } from '#shared/types'
import { EU_MEMBER_STATE_ECI, EU_MEMBER_STATE_NAME_DE, euPath, euWegePath } from '#shared/utils/eu'
import { SECOND_ROUND_CLAUSE, type StationId } from './spine'
import { EU_BUERGERINITIATIVE_DE } from './euBuergerinitiative'
import { euInitiativeTrackOf } from './euInitiative'
import { EU_RAIL_DE } from './euRail'

/* ------------------------------------------------------------------ */
/* One page per jurisdiction (16.11.2026)                              */
/* ------------------------------------------------------------------ */

/**
 * Whose ways a matrix, a seam or an instrument shows: the country this
 * site follows, or the EU. The EU is a jurisdiction of its own, as for its
 * object pages, so a country's ways and the EU's are two pages, and a
 * second country later gets a page of its own instead of sharing one.
 *
 * The country's id is its code as a path segment will carry it (`/at`, the
 * plan's step 6), taken from the configured Member State
 * (`EU_MEMBER_STATE_ECI`, „AT"), never written here.
 */
export const WEGE_STATE = EU_MEMBER_STATE_ECI.toLowerCase() as Lowercase<typeof EU_MEMBER_STATE_ECI>
export type WegeJurisdiction = typeof WEGE_STATE | 'eu'

/** The country's page of ways. It stays at `/wege` until step 6 moves the country's pages below its segment. */
export const WEGE_PATH = '/wege'

/** Each jurisdiction's page, by its address — the EU's built by the EU address helper, so step 6 moves it with the rest. */
export const WEGE_PATH_OF: Record<WegeJurisdiction, string> = {
  [WEGE_STATE]: WEGE_PATH,
  eu: euWegePath(),
}

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
  'gesetz-volksabstimmung',
  'verordnung',
  'verordnung-ohne-begutachtung',
  'regulierungsbehoerde',
  'staatsvertrag',
  'landesgesetz',
  'landesgesetz-ohne-entwurf',
  'landtag-antrag',
  'landes-volksbegehren',
  'landes-initiative',
  'landesgesetz-volksabstimmung',
  'landesverordnung',
] as const

export type WegId = (typeof WEG_IDS)[number]

/**
 * The rows of the EU's page that an EU object's page can name as its own
 * (`euWegFor`): an act's three kinds and the Citizens' Initiative. Listed
 * here, beside the national ids, so `wegHref` knows each row's page without
 * reading the pages, which are built from rows that call it.
 */
export const EU_WEG_IDS = ['eu-richtlinie', 'eu-verordnung', 'eu-kommission', 'eu-buergerinitiative'] as const

export type EuWegId = (typeof EU_WEG_IDS)[number]

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

/* What the monitor does not show of a Volksbegehren: the support before it
 * arrives (Bundesministerium für Inneres, no interface; volksbegehren.md).
 * One sentence for both rows that carry it, the national one and the
 * Anliegen's. */
const VOLKSBEGEHREN_GAP = gapDe('outOfScope', 'Unterstützung und Eintragung vor dem Einlangen im Nationalrat.')

/* The list of Anliegen an das Parlament narrowed to one kind — its own
 * `?art=` (`anliegenArtOf`), open ones first as the list opens. */
const anliegenListHref = (kind: AnliegenKind): string => `${ANLIEGEN_PATH}?art=${kind}`
/* The same list without „Nur offene" (`?alle=1`), for the kinds of which
 * hardly one is open on a given day — a Volksbegehren, a Petition an den
 * Bundesrat. Their plain link landed on an empty list (measured
 * 16.11.2026: none open of either), and a row's link should show the kind. */
const anliegenListAllHref = (kind: AnliegenKind): string => `${anliegenListHref(kind)}&alle=1`

export const WEG_LEVEL_LABEL: Record<WegLevel, string> = {
  bund: 'Bund',
  land: 'Länder',
}

/**
 * What a group's bar adds to its name. Nothing since 16.11.2026: the
 * Länder's sentence („Parlament ist hier der Landtag, kundgemacht wird im
 * Landesgesetzblatt") became the Länder matrix's own column names
 * (`WEG_LEVEL_STATION_LABEL`).
 */
export const WEG_LEVEL_NOTE: Record<WegLevel, string | null> = {
  bund: null,
  land: null,
}

/**
 * The last two stations by their names at each level (16.11.2026): Bund
 * and Länder are a matrix each, so the header says „Parlament" and
 * „Bundesgesetzblatt" over the Bund's rows, „Landtag" and
 * „Landesgesetzblatt" over the Länder's, and no sentence has to translate
 * a shared header. The stations are the same five; the list's tab behind
 * a header keeps its own words („Parlament / Landtag", „Kundgemacht").
 */
export const WEG_LEVEL_STATION_LABEL: Record<WegLevel, Partial<Record<StationId, string>>> = {
  bund: { parlament: 'Parlament', bgbl: 'Bundesgesetzblatt' },
  land: { parlament: 'Landtag', bgbl: 'Landesgesetzblatt' },
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
   *  - Begutachtung: `offen` since 16.11.2026, for that
   *    Ausschussbegutachtung — the mark an Ausschussantrag carries for the
   *    same thing (§ 40); a dash beside the note „teils mit
   *    Ausschussbegutachtung" contradicted it.
   *  - Regierungsvorlage, Parlament: § 23b Abs. 1 GOG-NR.
   *  - Kundgemacht: Art. 49 B-VG. */
  {
    id: 'vorlage-ohne-begutachtung',
    level: 'bund',
    label: 'Regierungsvorlage ohne Entwurf',
    note: 'teils mit Ausschussbegutachtung',
    noteLink: null,
    notFollowed: null,
    cells: row(['entfaellt', 'offen', 'stellungnahme', 'stellungnahme', 'durch']),
    href: '/entwuerfe?begutachtung=ohne&art=vorlage',
  },
  /* The same page for an Initiativantrag (`ityp` 'A'). Art. 41 Abs. 1 B-VG,
   * § 26 Abs. 4 GOG-NR (five members); no Begutachtung: Parliament's
   * research service (RLW, 03.02.2026) — drafts that come from members do
   * not go into one. Begutachtung `offen` all the same (16.11.2026): a
   * committee may invite Stellungnahmen (§ 40 Abs. 1 GOG-NR), as the note
   * says and as the Vorlage's row marks it. Parlament: § 23b Abs. 1 GOG-NR. */
  {
    id: 'antrag-ohne-begutachtung',
    level: 'bund',
    label: 'Initiativantrag ohne Entwurf',
    note: 'von Abgeordneten, teils mit Ausschussbegutachtung',
    noteLink: null,
    notFollowed: null,
    cells: row(['entfaellt', 'offen', 'entfaellt', 'stellungnahme', 'durch']),
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
   * ohne Entwurf", too few for an option. Not a link to that list either
   * (15.11.2026): a name's link leads to its own kind, and the running
   * period holds none. The note says it is followed, so the missing link
   * does not read as „nicht im Monitor". */
  {
    id: 'bundesrat-antrag',
    level: 'bund',
    label: 'Gesetzesantrag des Bundesrates',
    // „Stellungnahme offen" read as „possible" (16.11.2026); it is the question that is open.
    note: 'im Monitor, ohne eigene Liste; beim Antrag eines Drittels ungeklärt, ob eine Stellungnahme möglich ist',
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
   * row's `gap`. Its time in the Nationalrat, station by station, is a row of
   * the Anliegen's matrix (`ANLIEGEN_MATRIX`). */
  {
    id: 'volksbegehren',
    level: 'bund',
    label: 'Volksbegehren',
    note: 'im Monitor für seine Zeit im Nationalrat',
    noteLink: null,
    notFollowed: null,
    gap: VOLKSBEGEHREN_GAP,
    cells: row(['entfaellt', 'entfaellt', 'entfaellt', 'stellungnahme', 'offen']),
    href: anliegenListAllHref('volksbegehren'),
  },
  /* Art. 43 B-VG: on an ordinary law „wenn der Nationalrat es beschließt
   * oder die Mehrheit der Mitglieder des Nationalrates es verlangt", before
   * the Beurkundung; Art. 44 Abs. 3: a total revision of the constitution
   * always, a partial one on demand of a third of either chamber. Art. 45
   * Abs. 1: the majority decides, so a „no" ends the path (memo, „Gesetz mit
   * Volksabstimmung", route table: „fehlt").
   *  - Entwurf, Begutachtung, Regierungsvorlage: `offen` — „wie Herkunft",
   *    any of the paths above can lead here.
   *  - Parlament: passed; the vote follows the Beschluss.
   *  - Kundgemacht: `offen` — only if accepted, then „mit Berufung auf das
   *    Ergebnis der Volksabstimmung" (Art. 48).
   * Not followed: two since 1945 (1978 Zwentendorf, 1994 accession to the
   * EU); a reader for so rare an event would break before the next one. */
  {
    id: 'gesetz-volksabstimmung',
    level: 'bund',
    label: 'Gesetz mit Volksabstimmung',
    note: 'nach dem Beschluss, vor der Kundmachung; das Ergebnis entscheidet',
    noteLink: null,
    notFollowed: 'zwei seit 1945, zuletzt 1994',
    cells: row(['offen', 'offen', 'offen', 'durch', 'offen']),
    href: null,
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
   * before it, no Vorlage. Begutachtung `offen` (in the Landtag's column
   * until 16.11.2026; moved so that an Ausschussbegutachtung is drawn in
   * one place at both levels, and the Landtag, which every motion passes,
   * is a dot): a committee MAY put it out for
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
    cells: row(['entfaellt', 'offen', 'entfaellt', 'durch', 'durch']),
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
  /* A Land's law put to a Volksabstimmung after the Landtag's Beschluss,
   * in all nine (memo, „Volksbegehren, Volksabstimmung, Volksbefragung"):
   * on the Landtag's decision everywhere; also on demand of voters or
   * Gemeinden in B (Art. 33), N (Art. 27), St (Art. 72), T (Art. 39) and V
   * (Art. 35) — five, which the note counts (Land letters are unreadable,
   * see the row above). Cells as the Bund's row: `offen` before the Landtag
   * („wie Herkunft"), Landtag passed, Kundgemacht only if accepted.
   * Not followed: whether the Länder publish them in a readable form is not
   * checked. */
  {
    id: 'landesgesetz-volksabstimmung',
    level: 'land',
    label: 'Landesgesetz mit Volksabstimmung',
    note: 'nach dem Beschluss; in fünf Ländern auch auf Verlangen der Wahlberechtigten',
    noteLink: null,
    notFollowed: 'Quellen nicht geprüft',
    cells: row(['offen', 'offen', 'offen', 'durch', 'offen']),
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

/** What a cell says in words — beside the mark, or for a screen reader. */
export const WEG_CELL_LABEL: Record<WegCell, string> = {
  durch: 'durchläuft',
  stellungnahme: 'Stellungnahme möglich',
  entfaellt: 'entfällt',
  offen: 'je nach Fall',
}

/** The legend: every mark the matrices draw, the dash too (16.11.2026) — „speaks for itself" did not hold beside a „?". */
export const WEG_LEGEND: readonly { cell: WegCell; label: string }[] = [
  { cell: 'durch', label: 'Station' },
  // One mark for every way to take part (16.11.2026): a Stellungnahme in the national matrix, a Rückmeldung or an Unterstützung in the others, each row saying which (`WegMatrixRow.takePart`).
  { cell: 'stellungnahme', label: 'Stellungnahme, Rückmeldung oder Unterstützung möglich' },
  { cell: 'offen', label: 'je nach Fall' },
  { cell: 'entfaellt', label: 'entfällt' },
]

/* ------------------------------------------------------------------ */
/* The other objects, each with the stations of its own rail           */
/* ------------------------------------------------------------------ */

/**
 * A matrix of `/wege` (16.11.2026): the stations of one rail as columns,
 * its kinds of path as rows in groups. The national matrix (`WEGE`) is the
 * first; an EU act, a European Citizens' Initiative and an Anliegen an das
 * Parlament each have their own, because each walks the rail of its own
 * page and none of them is a sixth station of the national one
 * (docs/decisions.md, „The five stations stay five"). One page template
 * draws them all (`WegMatrix`).
 *
 * THE STATIONS ARE THE RAILS' (names and order): read from the code that
 * builds each rail, cited at each matrix, so the graphic and the page agree.
 * THE CELLS ARE THE LAW'S, as in `WEGE`: every cell names in a comment the
 * provision or memo passage it stands on; what a memo leaves open is
 * `offen` or left out, never a mark.
 */
export interface WegMatrixStation {
  id: string
  label: string
  /** A list behind the station; null where none. */
  href: string | null
}

export interface WegMatrixRow {
  id: string
  label: string
  note: string | null
  /**
   * The note itself as a link, where its words name what another page
   * shows — the seam between two jurisdictions' pages, at the row where a
   * law crosses („Umsetzung durch Bund oder Land" → the country's ways).
   * Absent where the note is plain text.
   */
  noteHref?: string
  noteLink: { label: string; href: string } | null
  /** The official page where it is done — only an address a memo names; never guessed. */
  source?: { label: string; href: string }
  notFollowed: string | null
  gap?: string
  cells: Record<string, WegCell>
  href: string | null
  /** What the blue mark means on this row („Rückmeldung möglich"); the national words (`WEG_CELL_LABEL`) where absent. */
  takePart?: string
  /** A station's name on this row's own rail where it differs from the column's („Eingelangt" for a Volksbegehren). */
  stationLabels?: Record<string, string>
}

export interface WegMatrixGroup {
  key: string
  label: string
  /** What the group's bar adds to its name, as `WEG_LEVEL_NOTE` does. */
  note: string | null
  rows: WegMatrixRow[]
}

export interface WegMatrix {
  id: string
  /** Whose ways: the page that draws this matrix (`WEGE_PAGES`). */
  jurisdiction: WegeJurisdiction
  /** The table's caption, for a screen reader. */
  caption: string
  /** The head of the rows' column: „Weg" in every matrix (16.11.2026) — the bar under it says whose ways. */
  pathColumn: string
  stations: WegMatrixStation[]
  groups: WegMatrixGroup[]
}

/** What a cell of a row says in words: its own take-part words for the blue mark, the matrix's otherwise. */
export function wegCellLabel(row: Pick<WegMatrixRow, 'takePart'>, cell: WegCell): string {
  return cell === 'stellungnahme' && row.takePart ? row.takePart : WEG_CELL_LABEL[cell]
}

/**
 * Where a station's name may break in a column header (16.11.2026). The
 * station columns are equally wide and narrower than the longest names, so
 * a compound breaks; the browser's own hyphenation chose „Regierungsvor-
 * lage". The joints are marked here with a soft hyphen (U+00AD) and the
 * header hyphenates by hand only (`hyphens-manual`), so a name breaks
 * between its words or not at all. A name not listed has no joint.
 */
const SHY = '\u00AD'
const HEADER_JOINTS: Readonly<Record<string, string>> = {
  Regierungsvorlage: `Regierungs${SHY}vorlage`,
  Bundesgesetzblatt: `Bundes${SHY}gesetz${SHY}blatt`,
  Landesgesetzblatt: `Landes${SHY}gesetz${SHY}blatt`,
}
/** A column header's words with their joints marked; any other text unchanged. */
export function wegHeaderLabel(label: string): string {
  return label.split(' ').map((w) => HEADER_JOINTS[w] ?? w).join(' ')
}

/** A station's name on one row's rail. */
export function wegStationLabel(row: Pick<WegMatrixRow, 'stationLabels'>, station: WegMatrixStation): string {
  return row.stationLabels?.[station.id] ?? station.label
}

/* Parliament's page „Petitionen unterstützen" (memo, „Quellen"): it covers
 * Petitionen and Bürgerinitiativen alike, in the Nationalrat and the
 * Bundesrat („Sie können eine Petition im Nationalrat oder Bundesrat
 * unterstützen", read 15.11.2026). */
const PARLAMENT_PETITIONEN = 'https://www.parlament.gv.at/beteiligen/unterstuetzen/petitionen'
const PARLAMENT_SOURCE = { label: 'parlament.gv.at', href: PARLAMENT_PETITIONEN }

/* The windows open on the Commission's portal and the Citizens' Initiatives
 * in collection, on the EU page (steps 3 and 5 of the EU cycle). */
const EU_FENSTER_HREF = `${euPath()}#eu-fenster`
const EU_BUERGERINITIATIVEN_HREF = `${euPath()}#eu-buergerinitiativen`
/* „Richtlinien, die Österreich umzusetzen hat" (`EuUmsetzungList`): where
 * the row „Richtlinie" leads since 16.11.2026. The open feedback windows,
 * where it led before, are the blue cells' matter and stand behind the two
 * station headers that carry them. */
const EU_UMSETZUNG_HREF = `${euPath()}#eu-umsetzung`

/** The drafts that carry out an EU act (the list's `EuFilter`: directives only, so the words say so). */
export const EU_IMPLEMENTING_LIST = { label: 'Entwürfe, die EU-Recht umsetzen', href: '/entwuerfe?eu=umsetzung' } as const

/**
 * A. The national matrices as `WegMatrix`: the five stations, once for the
 * Bund and once for the Länder, each under its own header
 * (`WEG_LEVEL_STATION_LABEL`). A Länder header leads to the list with the
 * Länder as its only sources, as the Länder rows do.
 */
const CAPTION_BY_LEVEL: Record<WegLevel, string> = {
  bund: 'Wege zum Bundesgesetz und zur Verordnung des Bundes, nach Station',
  land: 'Wege zum Landesgesetz und zur Verordnung eines Landes, nach Station',
}
export const NATIONAL_MATRICES: readonly WegMatrix[] = wegGroups().map((g) => ({
  id: g.level,
  jurisdiction: WEGE_STATE,
  caption: CAPTION_BY_LEVEL[g.level],
  pathColumn: 'Weg',
  stations: WEG_STATIONS.map((s) => ({
    ...s,
    label: WEG_LEVEL_STATION_LABEL[g.level][s.id] ?? s.label,
    href: s.href && g.level === 'land' ? `${s.href}&${SOURCE_PARAM}=${LAENDER_SOURCES}` : s.href,
  })),
  groups: [{ key: g.level, label: g.label, note: g.note, rows: g.rows }],
}))

/**
 * B. An EU act. The columns are the rail of an act's page (`euRailView`,
 * `app/utils/euRail.ts`; the same names on a proposal's and an initiative's
 * page, `euVorschlag.ts`, `euInitiative.ts`): „Konsultation", „Vorschlag",
 * „Parlament und Rat" (station `beschluss`), „Amtsblatt", and the last
 * station, „Umsetzung" for a directive and „Geltung" for what applies by
 * itself (`effectStation`) — one column, each row naming its own.
 * The memo's own proposal for the rail (eu-zyklus.md § 2.4) has the same
 * five; wege-zu-einer-rechtsnorm.md („Einschätzung", EU) calls the last
 * „Umsetzungsfrist", the code „Umsetzung" — the code's word stands.
 */
const EU_STATIONS: WegMatrixStation[] = [
  { id: 'konsultation', label: EU_RAIL_DE.name.konsultation, href: EU_FENSTER_HREF },
  { id: 'vorschlag', label: EU_RAIL_DE.name.vorschlag, href: EU_FENSTER_HREF },
  { id: 'beschluss', label: EU_RAIL_DE.name['parlament-rat'], href: null },
  { id: 'amtsblatt', label: EU_RAIL_DE.name.amtsblatt, href: null },
  { id: 'wirkung', label: `${EU_RAIL_DE.name.umsetzung} oder ${EU_RAIL_DE.name.geltung}`, href: null },
]

const euCells = (konsultation: WegCell, vorschlag: WegCell, beschluss: WegCell, amtsblatt: WegCell, wirkung: WegCell): Record<string, WegCell> =>
  ({ konsultation, vorschlag, beschluss, amtsblatt, wirkung })

export const EU_MATRIX: WegMatrix = {
  id: 'eu',
  jurisdiction: 'eu',
  caption: 'Wege eines EU-Rechtsakts, nach Station',
  pathColumn: 'Weg',
  stations: EU_STATIONS,
  groups: [{
    key: 'eu',
    label: 'EU-Rechtsakt',
    // No note (16.11.2026): where one gives feedback is the legend's blue and the rows' link, as in every other bar.
    note: null,
    rows: [
      /* A directive on a legislative proposal.
       *  - Konsultation: blue — Art. 11 Abs. 3 EUV, COM(2021) 219: Sondierung
       *    (call for evidence) and öffentliche Konsultation, „jede Person"
       *    (wege-zu-einer-rechtsnorm.md, „Wo man sich äußern kann", EU;
       *    eu-zyklus.md § 3). Not every proposal had one (the portal holds
       *    proposals from 2017, eu-zyklus.md § 2.4: 29 of 36 found) — the
       *    blue mark stands for the windows the row holds, as a
       *    Verordnungsentwurf's Begutachtung does in the national matrix.
       *  - Vorschlag: blue — the feedback period on the adopted proposal
       *    (eu-zyklus.md § 3, „Angenommener Vorschlag", jede Person; § 2.4:
       *    present in all 29 initiatives found).
       *  - Parlament und Rat: passed, no channel for individuals (eu-zyklus.md
       *    § 3; the proposal's page says so, `noChannel` in euInitiative.ts).
       *    Under a special procedure the Council decides alone and the rail
       *    names the station „Rat" (`decisionStation`); passed either way.
       *  - Amtsblatt: passed (eu-zyklus.md § 2.4, station 4).
       *  - Umsetzung: passed — Art. 288 AEUV, a directive needs a national
       *    act (wege-zu-einer-rechtsnorm.md, „EU"); where a Stellungnahme is
       *    possible then is the national matrix's, so no mark here.
       * The seam to the country's page (16.11.2026): the note's own words,
       * „Umsetzung durch Bund oder Land", link the page that draws the Bund's
       * and the Länder's ways — the place where the law crosses. */
      {
        id: 'eu-richtlinie',
        label: 'Richtlinie',
        note: 'Umsetzung durch Bund oder Land',
        noteHref: WEGE_PATH,
        noteLink: EU_IMPLEMENTING_LIST,
        notFollowed: null,
        cells: euCells('stellungnahme', 'stellungnahme', 'durch', 'durch', 'durch'),
        href: EU_UMSETZUNG_HREF,
        takePart: 'Rückmeldung möglich',
        stationLabels: { wirkung: EU_RAIL_DE.name.umsetzung },
      },
      /* A regulation on a legislative proposal: the directive's cells, the
       * last station „Geltung" — Art. 288 AEUV, it applies directly; the
       * national rules that accompany it are drafts of the national matrix
       * (wege-zu-einer-rechtsnorm.md, „EU"). Sources of the other cells as
       * above. */
      {
        id: 'eu-verordnung',
        label: 'Verordnung',
        note: 'gilt unmittelbar',
        noteLink: null,
        notFollowed: null,
        cells: euCells('stellungnahme', 'stellungnahme', 'durch', 'durch', 'durch'),
        href: EU_FENSTER_HREF,
        takePart: 'Rückmeldung möglich',
        stationLabels: { wirkung: EU_RAIL_DE.name.geltung },
      },
      /* A delegated or implementing act of the Commission.
       *  - Konsultation: `offen` — the initiative's rail shows it only where
       *    the portal holds a period before the draft (`showConsultation`,
       *    euInitiative.ts); no memo says such acts have one.
       *  - Vorschlag: at its place the Commission's own station, „Rechtsakt
       *    der Kommission" (euInitiative.ts, track `kommission`), with the
       *    feedback on the draft act: blue — eu-zyklus.md § 3 („Entwurf
       *    eines delegierten oder Durchführungsrechtsakts", jede Person) and
       *    wege-zu-einer-rechtsnorm.md („Rückmeldung … zu Entwürfen
       *    delegierter und Durchführungsrechtsakte"). Its length is open in
       *    both memos; that it has one is not.
       *  - Parlament und Rat: none — eu-zyklus.md § 2.4 („hat keine
       *    Stationen 2 und 3 in dieser Form"); the act's rail omits them
       *    (`euRailView`, `commission`).
       *  - Amtsblatt, Umsetzung oder Geltung: passed (`euRailView`, the rail
       *    of an act of the Commission). */
      {
        id: 'eu-kommission',
        label: 'Rechtsakt der Kommission',
        note: 'delegiert oder zur Durchführung; Rückmeldung zum Entwurf',
        noteLink: null,
        notFollowed: null,
        cells: euCells('offen', 'stellungnahme', 'entfaellt', 'durch', 'durch'),
        href: EU_FENSTER_HREF,
        takePart: 'Rückmeldung möglich',
        stationLabels: { vorschlag: 'Rechtsakt der Kommission' },
      },
    ],
  }],
}

/**
 * C. A European Citizens' Initiative. The columns are its rail
 * (`EU_BUERGERINITIATIVE_DE.name`, `app/utils/euBuergerinitiative.ts`):
 * Registrierung · Sammlung · Prüfung · Einreichung · Antwort der Kommission.
 * The endings that leave the rail („Zurückgezogen", „Nicht genug
 * Unterstützungen") are no columns: a path that ends there passes no more.
 */
const ECI_NAME = EU_BUERGERINITIATIVE_DE.name
const ECI_STATIONS: WegMatrixStation[] = [
  { id: 'registrierung', label: ECI_NAME.registrierung, href: null },
  { id: 'sammlung', label: ECI_NAME.sammlung, href: null },
  { id: 'pruefung', label: ECI_NAME.pruefung, href: null },
  { id: 'einreichung', label: ECI_NAME.einreichung, href: null },
  { id: 'antwort', label: ECI_NAME.antwort, href: null },
]

export const ECI_MATRIX: WegMatrix = {
  id: 'eci',
  jurisdiction: 'eu',
  caption: 'Weg einer Europäischen Bürgerinitiative, nach Station',
  pathColumn: 'Weg',
  stations: ECI_STATIONS,
  groups: [{
    key: 'eci',
    label: 'Europäische Bürgerinitiative',
    note: null,
    rows: [
      /* Art. 11 Abs. 4 EUV; VO (EU) 2019/788 Art. 3 (memo, „Wo man sich
       * äußern kann", EU).
       *  - Registrierung: passed — every initiative in the register is
       *    registered (REGISTERED on 28 of 28, docs/decisions.md, „The rail
       *    comes from the register's progress").
       *  - Sammlung: blue — Unionsbürger support it (memo, same row); the door
       *    stands while the collection runs (decisions.md, „The door stands
       *    only while the collection runs").
       *  - Prüfung, Einreichung, Antwort der Kommission: `offen` — only an
       *    initiative with a million signatures from a quarter of the Member
       *    States goes on (Art. 3); measured VERIFICATION 7, SUBMITTED 5,
       *    ANSWERED 4 of 28 (decisions.md). After a submission the answer is
       *    owed within six months (Art. 15 Abs. 2): the row's note. */
      {
        id: 'eu-buergerinitiative',
        label: 'Europäische Bürgerinitiative',
        note: 'unterstützen · die Kommission antwortet binnen sechs Monaten mit Gründen',
        noteLink: null,
        notFollowed: null,
        cells: { registrierung: 'durch', sammlung: 'stellungnahme', pruefung: 'offen', einreichung: 'offen', antwort: 'offen' },
        href: EU_BUERGERINITIATIVEN_HREF,
        takePart: 'Unterstützung möglich',
      },
    ],
  }],
}

/**
 * D. An Anliegen an das Parlament. The columns are the rail of its page
 * (`petitionSteps`, `volksbegehrenSteps`, `bundesratSteps` in `anliegenView.ts`):
 * Eingebracht (a Volksbegehren „Eingelangt") · Erste Lesung · Ausschuss ·
 * Nationalrat (a Petition an den Bundesrat „Bundesrat"). The committee's
 * Erledigung is no column since 16.11.2026: the rail holds it in the
 * committee's row (59d67e8, „An Anliegen's rail is its table of
 * contents"), so a column would name a station no page has. The subject committee a Petition or
 * Bürgerinitiative may be forwarded to („Fachausschuss") is no column: the
 * rail puts it before or after the Nationalrat as things happened, so no
 * column order fits both. It is a fact of the Anliegen that was forwarded
 * and stands on that Anliegen's page; the graphic does not name it.
 *
 * Where to take part (decisions.md, „Anliegen an den Nationalrat"): the
 * item's own flags open the door, with no Frist; the window closes when the
 * treatment in the Nationalrat ends. No source ties the window to one
 * station, so the blue mark stands at „Ausschuss", where every item is
 * under treatment, and at no station after it.
 */
const ANLIEGEN_STATIONS: WegMatrixStation[] = [
  { id: 'eingebracht', label: 'Eingebracht', href: null },
  { id: 'erste-lesung', label: 'Erste Lesung', href: null },
  { id: 'ausschuss', label: 'Ausschuss', href: null },
  { id: 'nationalrat', label: 'Nationalrat', href: null },
]

/** The station names the rail's code writes, for the test that holds the two together. */
export const ANLIEGEN_STATION_NAMES = ['Eingebracht', 'Eingelangt', 'Erste Lesung', 'Ausschuss', 'Nationalrat', 'Bundesrat'] as const

const anliegenCells = (eingebracht: WegCell, ersteLesung: WegCell, ausschuss: WegCell, nationalrat: WegCell): Record<string, WegCell> =>
  ({ eingebracht, 'erste-lesung': ersteLesung, ausschuss, nationalrat })

export const ANLIEGEN_MATRIX: WegMatrix = {
  id: 'anliegen',
  jurisdiction: WEGE_STATE,
  caption: 'Wege eines Anliegens an das Parlament, nach Station',
  pathColumn: 'Weg',
  stations: ANLIEGEN_STATIONS,
  groups: [{
    key: 'anliegen',
    // „an das Parlament" since 16.11.2026: the Petition an den Bundesrat is a row.
    label: 'Anliegen an das Parlament',
    // No note (16.11.2026): a bar carries its name only. The Fachausschuss is a fact of the one Anliegen that was forwarded, shown on its own page.
    note: null,
    rows: [
      /* § 100 Abs. 1 Z 1 GOG-NR: handed in by a member of the Nationalrat.
       *  - Eingebracht: passed (§ 100 Abs. 1 Z 1).
       *  - Erste Lesung: none — the rail of a Petition has none
       *    (`petitionSteps`; plan umsetzungsplan-petitionen-volksbegehren.md,
       *    step 2).
       *  - Ausschuss für Petitionen und Bürgerinitiativen: blue — electronic
       *    support on Parliament's page (legal basis not found, memo
       *    „Offen") and Stellungnahmen during its treatment, § 23b Abs. 2.
       *    Its Erledigung, a report with one of three motions (§ 100c
       *    Abs. 3), stands in this row of the rail.
       *  - Nationalrat: passed — it takes note of the committee's
       *    Sammelbericht (decisions.md, „Framing"). */
      {
        id: 'anliegen-petition',
        label: 'Petition',
        note: 'über Abgeordnete einbringen · der Ausschuss muss berichten',
        noteLink: null,
        source: PARLAMENT_SOURCE,
        notFollowed: null,
        cells: anliegenCells('durch', 'entfaellt', 'stellungnahme', 'durch'),
        href: anliegenListHref('petition'),
        takePart: 'Unterstützung und Stellungnahme möglich',
      },
      /* § 100 Abs. 1 Z 2, Abs. 2 GOG-NR: 500 Austrian citizens from 16,
       * signed by hand. Cells and their sources as the Petition's; the first
       * signatory is informed of the outcome (§ 100d). */
      {
        id: 'anliegen-buergerinitiative',
        label: 'Parlamentarische Bürgerinitiative',
        note: 'mit 500 Unterschriften einbringen · der Ausschuss muss berichten',
        noteLink: null,
        source: PARLAMENT_SOURCE,
        notFollowed: null,
        cells: anliegenCells('durch', 'entfaellt', 'stellungnahme', 'durch'),
        href: anliegenListHref('buergerinitiative'),
        takePart: 'Unterstützung und Stellungnahme möglich',
      },
      /* Art. 41 Abs. 2 B-VG; its way to a law is the row `volksbegehren` of
       * the national matrix, which the note links instead of repeating it.
       *  - Eingelangt: passed (Art. 41 Abs. 2: „dem Nationalrat zur
       *    Behandlung vorzulegen").
       *  - Erste Lesung: `offen` — only on the Nationalrat's decision (§ 69
       *    GOG-NR, volksbegehren.md § 2); the rail shows it „only where
       *    held".
       *  - Ausschuss: blue, a Stellungnahme only — § 23b Abs. 1 GOG-NR; no
       *    Unterstützung in the Nationalrat (`anliegenParticipation`); the
       *    deadlines of § 24 GOG-NR; its committee's report is a fact of
       *    this row (`volksbegehrenSteps`).
       *  - Nationalrat: passed — the report is owed to it (§ 24 GOG-NR). */
      {
        id: 'anliegen-volksbegehren',
        label: 'Volksbegehren',
        note: 'der Nationalrat muss es in Fristen behandeln',
        noteLink: { label: 'Weg zum Gesetz', href: `${wegHref('volksbegehren')}#weg-volksbegehren` },
        notFollowed: null,
        gap: VOLKSBEGEHREN_GAP,
        cells: anliegenCells('durch', 'offen', 'stellungnahme', 'durch'),
        href: anliegenListAllHref('volksbegehren'),
        takePart: 'Stellungnahme möglich',
        stationLabels: { eingebracht: 'Eingelangt' },
      },
      /* § 25 GO-BR: handed in by a member of the Bundesrat (Abs. 1),
       * assigned to its committee (Abs. 2). Its rail (`bundesratSteps`):
       * Eingebracht · the committee (with its Erledigung) · Bundesrat.
       *  - Erste Lesung: none.
       *  - Ausschuss: blue — online support on Parliament's page („im
       *    Nationalrat oder Bundesrat") and Stellungnahmen during the
       *    treatment (`anliegenParticipation`, `WINDOW_NOTE_BR`). Its
       *    Erledigung, in this row of the rail, is the committee's report
       *    or, without one within six months, the forwarding to the
       *    responsible member of the Bundesregierung (Abs. 3): 31 of 42
       *    ended so, 10 with a report, 1 „gilt als zurückgezogen".
       *  - Bundesrat (the column „Nationalrat"): `offen` — the plenary only
       *    after a report. */
      {
        id: 'anliegen-petition-bundesrat',
        label: 'Petition an den Bundesrat',
        note: 'über Mitglieder des Bundesrates einbringen · ohne Bericht binnen sechs Monaten an die Regierung',
        noteLink: null,
        source: PARLAMENT_SOURCE,
        notFollowed: null,
        cells: anliegenCells('durch', 'entfaellt', 'stellungnahme', 'offen'),
        href: anliegenListAllHref('petition-bundesrat'),
        takePart: 'Unterstützung und Stellungnahme möglich',
        stationLabels: { nationalrat: 'Bundesrat' },
      },
    ],
  }],
}

/** Every matrix, each page's in its order: the national ones, then the objects with rails of their own. */
/* The order on each page (16.11.2026): how a text becomes law, then how
 * people start something themselves. The country's page: Bund, Länder,
 * Anliegen an das Parlament; the EU's: an EU act, the European Citizens'
 * Initiative. Until 16.11.2026 one page held all five, Austria before the
 * EU within each part; a page draws its own (`jurisdiction`), in this
 * order. */
export const WEG_MATRICES: readonly WegMatrix[] = [...NATIONAL_MATRICES, ANLIEGEN_MATRIX, EU_MATRIX, ECI_MATRIX]

/* ------------------------------------------------------------------ */
/* Not in the monitor: instruments without stations                    */
/* ------------------------------------------------------------------ */

export type WegInstrumentLevel = 'eu' | 'bund' | 'land'

export const WEG_INSTRUMENT_LEVEL_LABEL: Record<WegInstrumentLevel, string> = {
  eu: 'EU',
  bund: 'Bund',
  land: 'Land',
}

/**
 * An instrument the monitor does not follow: a way to say something about
 * a law, listed without stations. Source: the memo's „Wo man sich äußern
 * kann", each line's provision in the comment above it; the reason it is
 * not followed from the memo's „Was sich verfolgen ließe", in the words
 * the national matrix uses for its rows (`notFollowed`). The followed ones
 * (the Commission's consultations, the European Citizens' Initiative, the
 * Petition, the Petition an den Bundesrat, the Bürgerinitiative, the
 * Volksbegehren) have matrices above, and so has the Volksabstimmung, a
 * station of a law's path (16.11.2026). What stays here has no path to a
 * norm the monitor could draw, or no source to follow it by.
 */
export interface WegInstrument {
  id: string
  /** Whose instrument: the page whose list „Nicht im Monitor" holds it. */
  jurisdiction: WegeJurisdiction
  level: WegInstrumentLevel
  name: string
  /** What one can do, in two or three words. */
  act: string
  /** Who must respond, and how — only where the memo cites the duty; null otherwise. */
  duty: string | null
  /** The official page where it is done — only an address a memo names; never guessed. */
  source?: { label: string; href: string }
  /** Why the monitor does not follow it. */
  notFollowed: string
}

/* Bund, Land, EU — the order of the matrices above (16.11.2026; it ran EU,
 * Bund, Land, against them). */
export const WEG_INSTRUMENTS: readonly WegInstrument[] = [
  /* Art. 49b B-VG: on the Nationalrat's decision; the result goes to the
   * Nationalrat and the Bundesregierung. The memo cites no binding effect
   * and no duty, so none is said. No path to a norm: it asks, it decides
   * nothing, and it attaches to no law. Not followed: one so far (2013),
   * and nothing a path could show. */
  {
    id: 'volksbefragung',
    jurisdiction: WEGE_STATE,
    level: 'bund',
    name: 'Volksbefragung',
    act: 'befragt werden',
    duty: null,
    notFollowed: 'bisher eine (2013), an kein Gesetz gebunden',
  },
  /* The Länder's own instruments, one line (memo, the Länder tables):
   * Volksbefragung and petitions as each
   * Landesverfassung has them, the Bürgerrat of Vorarlberg (a guideline
   * of the Landesregierung, Art. 1 Abs. 4 L-V). Duties differ — an answer
   * to a petition within three months in V (Art. 10), an answer in O
   * (Art. 64) and St (Art. 76), reasons from the Landtag after a
   * Bürgerinitiative in O (Art. 59 Abs. 7) — so the line says „teils".
   * Not followed: whether the Landtage's systems hold them is „nicht
   * geprüft" (memo, „Was sich verfolgen ließe", „Anträge, Volksbegehren,
   * Petitionen in den Landtagen"; the national matrix's Länder rows say
   * the same).
   * The Volksbegehren im Land, the Initiative of Gemeinden or citizens and
   * the Volksabstimmung are rows of the Länder matrix and stand only there
   * (16.11.2026). The petitions' sources were read on 15.11.2026
   * (petitionen-laender-und-eu.md): readable in some Länder, not in
   * others, none built — hence „teils geprüft". */
  {
    id: 'laender',
    jurisdiction: WEGE_STATE,
    level: 'land',
    name: 'Volksbefragung, Petition, Bürgerrat',
    act: 'je nach Landesverfassung',
    duty: 'teils Pflicht zur Antwort',
    notFollowed: 'Quellen je Land, erst teils geprüft',
  },
  /* Art. 227 AEUV: anyone resident in the Union, on a matter that affects
   * them directly. Not followed (petitionen-laender-und-eu.md, 15.11.2026):
   * no API and no dataset; the portal answers programs with 403, and the
   * EP's legal notice forbids circumventing technical measures. The source
   * is the portal's list of petitions, the address the memo names. */
  {
    id: 'eu-petition',
    jurisdiction: 'eu',
    level: 'eu',
    name: 'Petition an das Europäische Parlament',
    act: 'einreichen',
    duty: null,
    source: { label: 'europarl.europa.eu', href: 'https://www.europarl.europa.eu/petitions/en/show-petitions' },
    notFollowed: 'keine Schnittstelle',
  },
]

export const WEGE_COPY = {
  // „Der Weg eines Entwurfs" until 16.11.2026: it named two of the page's six blocks. An Anliegen, an EU act and a Citizens' Initiative are no Entwurf.
  // The name of every jurisdiction's page; its H1 adds where (`WegePage.title`), so the place never becomes part of the name.
  title: 'Wege der Gesetzgebung',
  lede: 'Welche Stationen ein Text durchläuft, bis er gilt – und wo Sie sich beteiligen können.',
  notFollowedPrefix: 'nicht im Monitor',
  selected: 'dieser Weg',
  instrumentsHeading: 'Nicht im Monitor',
  instrumentsLede: 'weitere Wege, sich zu äußern, ohne Stationen',
} as const

/* ------------------------------------------------------------------ */
/* The seams, and the pages                                            */
/* ------------------------------------------------------------------ */

/**
 * A seam: one line of a page that leads to another jurisdiction's page,
 * where a law crosses between them. It passes no station of the page, so
 * it is no matrix row: a group of the card with its bar and one line, at
 * the place in the page's order where the other jurisdiction's law enters
 * (`after`, a matrix id). The way back is a row's own note
 * (`WegMatrixRow.noteHref`): on the EU's page the directive's „Umsetzung
 * durch Bund oder Land".
 */
export interface WegSeam {
  id: string
  /** The page that draws this line. */
  jurisdiction: WegeJurisdiction
  /** The matrix it follows on that page. */
  after: string
  /** The bar's name. */
  bar: string
  label: string
  /** The other jurisdiction's page. */
  href: string
  note: string
  noteLink: { label: string; href: string } | null
}

/**
 * Where EU law enters the country's ways (16.11.2026; the „EU" lead line
 * `EU_LEAD` above the national matrix until the EU got a matrix on this
 * page, the same day). Art. 288 AEUV — a Richtlinie needs a national act
 * (Umsetzung), a Verordnung applies directly and draws accompanying rules;
 * the monitor marks both on a draft (`EuMarker`: `umsetzung`,
 * `flankierend-vo`). The list filters only the first (`EuFilter`), so its
 * link says so. It stands after the Länder: it enters the Bund's and the
 * Länder's paths alike, so it belongs to neither matrix, and it closes the
 * part „how a text becomes law" where the EU's matrix stood. The words of
 * label and note are the lead line's of 14.11.2026.
 */
export const WEG_SEAMS: readonly WegSeam[] = [
  {
    id: 'eu-recht',
    jurisdiction: WEGE_STATE,
    after: 'land',
    bar: 'EU-Recht',
    label: 'EU-Richtlinie, EU-Verordnung',
    href: WEGE_PATH_OF.eu,
    note: 'Umsetzung einer Richtlinie, begleitende Regeln zu einer Verordnung',
    noteLink: EU_IMPLEMENTING_LIST,
  },
]

/** A part of a page's card, in the page's order. */
export type WegeBlock = { kind: 'matrix'; matrix: WegMatrix } | { kind: 'seam'; seam: WegSeam }

/**
 * One jurisdiction's „Wege der Gesetzgebung" (16.11.2026). Both pages are
 * drawn by one component (`WegePage`) from this object; a page file only
 * names its jurisdiction. A third jurisdiction is an id in
 * `WegeJurisdiction`, an address in `WEGE_PATH_OF`, its words in
 * `WEGE_PAGE_COPY`, its matrices, seams and instruments tagged with it, and
 * a page file of three lines.
 */
export interface WegePage {
  jurisdiction: WegeJurisdiction
  path: string
  /** The H1 and the search result's title: the name and where („in Österreich"). */
  title: string
  lede: string
  description: string
  /** The matrices and seams, in the page's order. */
  blocks: readonly WegeBlock[]
  /** The list „Nicht im Monitor". */
  instruments: readonly WegInstrument[]
}

/**
 * Each page's words. The place in the H1 tells the two pages apart without
 * becoming part of the name; the country's comes from the configured
 * Member State (`EU_MEMBER_STATE_NAME_DE`), as the EU overview's title does.
 *
 * The EU's lede is its own: an EU act walks to „Geltung" or „Umsetzung",
 * the rail's last station, and a Citizens' Initiative is no text that comes
 * to apply — it ends with the Commission's answer.
 */
export const WEGE_PAGE_COPY: Record<WegeJurisdiction, Pick<WegePage, 'title' | 'lede' | 'description'>> = {
  [WEGE_STATE]: {
    title: `${WEGE_COPY.title} in ${EU_MEMBER_STATE_NAME_DE}`,
    lede: WEGE_COPY.lede,
    description:
      `Alle Wege, die ein Text in ${EU_MEMBER_STATE_NAME_DE} zum Gesetz oder zur Verordnung nehmen kann – beim Bund und in den Ländern –, und die Wege eines Anliegens an das Parlament: Station für Station, und wo eine Stellungnahme oder eine Unterstützung möglich ist.`,
  },
  eu: {
    title: `${WEGE_COPY.title} in der EU`,
    lede: 'Welche Stationen ein Rechtsakt der EU bis zur Geltung oder Umsetzung durchläuft und eine Europäische Bürgerinitiative bis zur Antwort der Kommission – und wo Sie sich beteiligen können.',
    description:
      'Die Wege eines Rechtsakts der Europäischen Union und einer Europäischen Bürgerinitiative, Station für Station, und wo eine Rückmeldung oder eine Unterstützung möglich ist.',
  },
}

function wegePage(jurisdiction: WegeJurisdiction): WegePage {
  const blocks: WegeBlock[] = []
  for (const matrix of WEG_MATRICES.filter((m) => m.jurisdiction === jurisdiction)) {
    blocks.push({ kind: 'matrix', matrix })
    for (const seam of WEG_SEAMS.filter((s) => s.jurisdiction === jurisdiction && s.after === matrix.id)) blocks.push({ kind: 'seam', seam })
  }
  return {
    jurisdiction,
    path: WEGE_PATH_OF[jurisdiction],
    ...WEGE_PAGE_COPY[jurisdiction],
    blocks,
    instruments: WEG_INSTRUMENTS.filter((i) => i.jurisdiction === jurisdiction),
  }
}

/** Every jurisdiction's page, the country's first. */
export const WEGE_PAGES: Record<WegeJurisdiction, WegePage> = {
  [WEGE_STATE]: wegePage(WEGE_STATE),
  eu: wegePage('eu'),
}

/** The matrices a page draws. */
export function wegePageMatrices(page: WegePage): WegMatrix[] {
  return page.blocks.flatMap((b) => (b.kind === 'matrix' ? [b.matrix] : []))
}

/** Every row a page draws, in its order. */
export function wegePageRows(page: WegePage): WegMatrixRow[] {
  return wegePageMatrices(page).flatMap((m) => m.groups.flatMap((g) => g.rows))
}

/* The ways to take part the blue mark stands for, in the legend's order. */
const TAKE_PART_WORDS = ['Stellungnahme', 'Rückmeldung', 'Unterstützung'] as const

/**
 * A page's legend (16.11.2026): only the marks its matrices draw, and for
 * the blue mark only the ways to take part its rows name — „Stellungnahme
 * oder Unterstützung möglich" on the country's page, „Rückmeldung oder
 * Unterstützung möglich" on the EU's. A legend that names what the page
 * does not draw sends the reader looking for it.
 */
export function wegLegend(page: WegePage): { cell: WegCell; label: string }[] {
  const rows = wegePageRows(page)
  const drawn = new Set(rows.flatMap((r) => Object.values(r.cells)))
  const takePart = rows.filter((r) => Object.values(r.cells).includes('stellungnahme')).map((r) => wegCellLabel(r, 'stellungnahme'))
  const words = TAKE_PART_WORDS.filter((w) => takePart.some((t) => t.includes(w)))
  const joined = words.length > 1 ? `${words.slice(0, -1).join(', ')} oder ${words.at(-1)}` : (words[0] ?? '')
  return WEG_LEGEND
    .filter((l) => drawn.has(l.cell))
    .map((l) => (l.cell === 'stellungnahme' && joined ? { ...l, label: `${joined} möglich` } : l))
}

/**
 * The row `?weg=` names on a page, or null: only a row the page draws. An
 * unknown value, or a row of another jurisdiction's page, selects nothing —
 * an old `/wege?weg=eu-…` included, which no code ever wrote (the national
 * ids alone were readable before 16.11.2026).
 */
export function wegSelected(page: WegePage, value: unknown): string | null {
  const id = Array.isArray(value) ? value[0] : value
  return typeof id === 'string' && wegePageRows(page).some((r) => r.id === id) ? id : null
}

export function isWegId(value: unknown): value is WegId {
  return typeof value === 'string' && (WEG_IDS as readonly string[]).includes(value)
}

/**
 * The page that holds a row, with the row marked: `/wege?weg=gesetz`,
 * `/eu-recht/wege?weg=eu-richtlinie`. Each id knows its page from the id
 * lists, not from the pages (the Anliegen's matrix calls this while the
 * pages are not built yet).
 */
export function wegHref(id: WegId | EuWegId): string {
  const jurisdiction: WegeJurisdiction = (EU_WEG_IDS as readonly string[]).includes(id) ? 'eu' : WEGE_STATE
  return `${WEGE_PATH_OF[jurisdiction]}?weg=${id}`
}

/**
 * Which row of the EU's page an EU object's page walks, from what the page
 * already holds; null where none fits for certain.
 *
 *  - An act: „Rechtsakt der Kommission" where the Cellar names the
 *    Commission as its author; a Richtlinie or Verordnung only where it
 *    names the Parliament and the Council, or the Council — an act whose
 *    author is unread may be a delegated one, so it marks no row. A
 *    Beschluss and a Rahmenbeschluss have no row.
 *  - An initiative of the portal, or the consultation behind a proposal:
 *    the act the Commission foresees, by the track its own rail takes
 *    (`euInitiativeTrackOf`) — a proposal for a Richtlinie or Verordnung,
 *    or an act of the Commission; anything else no row.
 *
 * A European Citizens' Initiative needs no facts: its page names its row.
 */
export type EuWegFacts =
  | { source: 'act'; kind: EuActHead['kind']; adoptedBy: EuAdoptedBy | null }
  | { source: 'portal'; actType: string | null }

export function euWegFor(f: EuWegFacts): EuWegId | null {
  switch (f.source) {
    case 'act':
      if (f.adoptedBy === 'kommission') return 'eu-kommission'
      if (f.adoptedBy !== 'parlament-rat' && f.adoptedBy !== 'rat') return null
      return f.kind === 'richtlinie' ? 'eu-richtlinie' : f.kind === 'verordnung' ? 'eu-verordnung' : null
    case 'portal': {
      const track = euInitiativeTrackOf(f.actType)
      if (track === 'kommission') return 'eu-kommission'
      if (track !== 'gesetz') return null
      return f.actType === 'PROP_DIR' ? 'eu-richtlinie' : f.actType === 'PROP_REG' ? 'eu-verordnung' : null
    }
  }
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

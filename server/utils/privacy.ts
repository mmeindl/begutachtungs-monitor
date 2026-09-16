/**
 * GDPR enforcement: classification of submitter names from the
 * Parliament API (list 142 — SNME on a Ministerialentwurf, SN on a
 * Regierungsvorlage; the strings have the same shapes).
 *
 * PURE MODULE — no Nuxt auto-imports, only relative imports,
 * so vitest can execute the module directly.
 *
 * Hard invariant (docs/architecture.md §3): the name of a private person
 * must NEVER leave the server. The safe default is therefore `person` with
 * `name: null` — an organisation misclassified as a person is a cosmetic
 * bug, the opposite direction would publish a name.
 *
 * The cosmetic bug is not rare and not evenly spread. Measured on every
 * GP-XXVIII Stellungnahme on 2026-09-15 (`scripts/classifier-audit.ts`): at
 * least 334 of the 2,996 rows filed as "person" were institutions — 221 of
 * them federal ministries in their own short form ("BM f. Finanzen"), then
 * courts, the Datenschutzbehörde, the FMA, the Umweltanwaltschaften and a
 * handful of brand-style NGOs. Every pattern added that day was held against
 * the comma-form person names of the same corpus and matched none of them.
 * Refused on the same evidence: a bare semicolon rule (persons file as
 * "Mustermann, Florian; Dr. med. dent."), all-caps ("MUSTERMANN, PETER") and digits
 * ("Muster, Ma8").
 *
 * The audit also found the opposite error, which is the one that matters:
 * "Lastname, Firstname; Universität Salzburg" — a person filing with an
 * affiliation — was published whole, name included, because the affiliation
 * carried the keyword. 239 rows in GP XXVII, 2 in GP XXVIII.
 * `leadsWithPersonName` closes that: the segment that names the submitter
 * decides, and it is checked before any organisation signal.
 */
import type { SubmitterKind } from '../../shared/types'

export interface SubmitterClassification {
  kind: SubmitterKind
  name: string | null
}

const PERSON: SubmitterClassification = { kind: 'person', name: null }
const NONPUBLIC: SubmitterClassification = { kind: 'nonpublic', name: null }

/** The API's placeholder for non-public submissions. */
const NONPUBLIC_RE = /nicht-?\s*öffentliche?\s+stellungnahme/i

/**
 * Known organisations the heuristic cannot recognize (architecture.md §12.9):
 * brand-style names without any legal form or org keyword, and — since the
 * upstream `TYP` flag started vetoing (`classifySubmitter`) — organisations
 * whose staff filed through the private-person registration. Matched
 * case-insensitively against the full normalized name. Because an entry here
 * publishes the name, this list may contain organisations only, never
 * persons — add entries solely after verifying the exact spelling in the
 * Parliament data (list 142 `names[].name`). `scripts/classifier-audit.ts`
 * prints the candidates as lists 1 and 3.
 *
 * The value is the name to PRINT; `null` prints the upstream string as it
 * stands. It exists because Parliament's two name fields are "Nachname,
 * Vorname", and an organisation that fills them in gets stored inverted:
 * "Pressefreiheit, Institut für", "GmbH, Verkehrsverbund Ost-Region (VOR)".
 * Those rows were on the site in that shape for as long as they were public.
 * A display name is a de-inversion READ OFF the same string — never an
 * invention, and never a person's name.
 */
const ORG_ALLOWLIST = new Map<string, string | null>([
  ['epicenter.works', null], // verified 2026-08-23 via 14/SN-8/ME (GP XXVIII)
  ['weisser ring', null], // verified 2026-09-15, list 142 GP XXVIII ("WEISSER RING", 3 rows)
  ['vier pfoten', null], // verified 2026-09-15, list 142 GP XXVII ("Vier Pfoten; Stiftung für Tierschutz")

  /* Verified 2026-09-16 from the TYP-veto corpus comparison — every one an
   * organisation, none containing a natural person's name. GP XXVIII: */
  ['dachverband berufliche inklusion, dabei-austria', null],
  ['fachstelle suchtprävention, soziale dienste bgld gmbh', null],
  /* GP XXVII: */
  ['der universität innsbruck, rektorat', 'Universität Innsbruck, Rektorat'],
  ['tirol kliniken gmbh, rechtsabteilung', null],
  ['sabaini gmbh, firma', 'Sabaini GmbH'],
  ['umwelt, forum wissenschaft &', 'Forum Wissenschaft & Umwelt'],
  ['öh universität innsbruck, stv doktorat phil hist univ. innsbruck', null],
  ['(tu wien), studienkommission raumplanung', 'TU Wien, Studienkommission Raumplanung'],
  ['akademie, junge', 'Junge Akademie der Österreichischen Akademie der Wissenschaften'],
  ['bundestheater holding gmbh, bth', 'Bundestheater-Holding GmbH'],
  ['pressefreiheit, institut für', 'Institut für Pressefreiheit'],
  ['gmbh, verkehrsverbund ost-region (vor)', 'Verkehrsverbund Ost-Region (VOR) GmbH'],
  ['patentanwaltskammer, österr.', 'Österreichische Patentanwaltskammer'],
])

/**
 * The whole string, or its naming segment: "Vier Pfoten; Stiftung für
 * Tierschutz" is allowlisted by its first segment, the department after the
 * semicolon varies from filing to filing.
 *
 * Returns the name to print, or null when the string is not allowlisted —
 * so "not listed" and "listed, print as it stands" stay distinguishable.
 */
function allowlistedName(s: string): string | null {
  const lower = s.toLowerCase()
  if (ORG_ALLOWLIST.has(lower)) return ORG_ALLOWLIST.get(lower) ?? s
  const semicolon = lower.indexOf(';')
  if (semicolon < 0) return null
  const head = lower.slice(0, semicolon).trim()
  return ORG_ALLOWLIST.has(head) ? (ORG_ALLOWLIST.get(head) ?? s) : null
}

/** "(4880 St. Georgen im Attergau)" suffix — only ever appears on private persons. */
const PLZ_SUFFIX_RE = /\s*\(\d{4,5}\s+[^)]+\)\s*$/

/**
 * Legal forms — never occur in personal names and therefore beat every
 * person pattern. Short forms (AG, OG, KG, SE) are case-sensitive so they
 * don't match initials/names.
 */
const LEGAL_FORM_PATTERNS: RegExp[] = [
  /\bGmbH\b/i,
  /\bGesmbH\b/i,
  /\bGes\.\s?m\.\s?b\.\s?H\.?/i,
  /\bm\.\s?b\.\s?H\.?/i,
  /\bmbH\b/,
  /\bAG\b/,
  /\bOG\b/,
  /\bKG\b/,
  /\bKEG\b/,
  /\bSE\b/,
  /\beGen\b/,
  /\be\.\s?U\.?(?=\s|$)/,
  /\be\.\s?V\.?(?=\s|$)/,
  /&\s?Co\b/i,
]

/**
 * Strong org signals: tokens that are practically never part of a personal
 * name. They also overrule the "Lastname, Firstname" pattern
 * (e.g. "Wirtschaftskammer Österreich, Abteilung Sozialpolitik").
 * Risky standalone words (Kammer, Amt, Land, Bund …) are deliberately NOT
 * listed bare here — only in compounds or with context.
 */
const STRONG_ORG_PATTERNS: RegExp[] = [
  /ministerium/i,
  // The ministries' own short form in list 142 ("BM f. Finanzen", "BM f.
  // Arbeit, Soziales, …") — 221 rows of GP XXVIII read as "Privatperson".
  /^BM\s?f\.\s/i,
  /kanzleramt/i,
  /(?:wirtschafts|arbeiter|land(?:es)?|landwirtschafts|ärzte|zahnärzte|tierärzte|apotheker|notariats?|rechtsanwalts|ziviltechniker|patentanwalts|ingenieur)kammer/i,
  /kammer\s+(?:für|der|des)\b/i,
  /gewerkschaft/i,
  /gesellschaft\b/i,
  /universität/i,
  /(?:fach)?hochschule/i,
  /gerichtshof|rechnungshof|volksanwaltschaft/i,
  // Oberlandesgericht Wien, Landesgericht Korneuburg, Verwaltungsgericht Wien;
  // Staatsanwaltschaft, Umweltanwaltschaft, Kinder- und Jugendanwaltschaft
  // (never "Anwalt" alone — that is a profession, and persons file as
  // "Huber, Anna; Rechtsanwältin"); Datenschutzbehörde; Finanzmarktaufsicht.
  // Strong, because these file in comma form too ("Staatsanwaltschaft
  // Innsbruck, Staatsanwaltschaft Feldkirch").
  /gericht(?:e|s|en)?\b/i,
  /anwaltschaft(?:en)?\b/i,
  /behörden?\b/i,
  /aufsicht\b/i,
  /bundesamt|landesamt|gemeindeamt|\bamt\s+der\b/i,
  /landesregierung|landtag\b|magistrat|bezirkshauptmannschaft/i,
  /sozialversicherung|gesundheitskasse|krankenkasse|pensionsversicherung|unfallversicherung/i,
  /genossenschaft/i,
  /bischofskonferenz|erzdiözese|diözese/i,
  /stiftung\b/i,
]

/**
 * Bundesländer as they appear behind "AK"/"BAK" (Arbeiterkammer,
 * Bundesarbeitskammer) — the chambers file under their initials.
 */
const LAENDER =
  'Wien|Niederösterreich|Oberösterreich|Salzburg|Steiermark|Kärnten|Tirol|Vorarlberg|Burgenland|Österreich'

/** Further org indicators — checked only AFTER the person patterns. */
const ORG_PATTERNS: RegExp[] = [
  ...STRONG_ORG_PATTERNS,
  /\bverein\b|vereinigung/i,
  /verband/i,
  /institut/i,
  /\bbundes[a-zäöüß]/i,
  /österreich\b|oesterreich\b|\baustria\b/i,
  /\bgemeinde\b|marktgemeinde|stadtgemeinde|gemeindebund/i,
  /\bstadt\b/i,
  /\bland\s+(?:tirol|salzburg|steiermark|kärnten|oberösterreich|niederösterreich|burgenland|vorarlberg|wien)\b/i,
  /[a-zäöüß]bund\b/i,
  /versicherung\b/i,
  /kommission\b|konferenz\b|beirat\b/i,
  /initiative\b|plattform\b|netzwerk\b|\bforum\b|zentrum\b|akademie\b/i,
  /klinik|krankenhaus|krankenanstalt/i,
  /caritas|diakonie|hilfswerk|rotes\s+kreuz|feuerwehr/i,
  /kirche\b/i,
  /holding\b|verlag\b|agentur\b/i,
  /interessenvertretung|arbeitsgemeinschaft|dachorganisation|berufsvereinigung/i,
  // JS `\b` is ASCII-only: before "Ö" there is no word boundary, so the old
  // `\b(?:ÖGB|…)\b` never matched ÖGB, ÖAMTC, SPÖ or ARBÖ at all — only WKO
  // and NEOS. Letter/digit lookarounds do what the boundary was meant to.
  /(?<![\p{L}\d])(?:ÖGB|WKÖ|WKO|ÖH|ÖAMTC|ARBÖ|SPÖ|ÖVP|FPÖ|NEOS|KPÖ)(?![\p{L}\d])/u,
  /partei\b/i,
  // Added 2026-09-15 from the corpus audit; each one zero hits among the
  // comma-form persons of GP XXVIII.
  /österreichisch/i, // "Österreichische Kinderfreunde", "Österreichischer Werberat" — `österreich\b` above misses the adjective
  /hochschüler/i, // ÖH in words: "Österreichische HochschülerInnenschaft"
  /[a-zäöüß]vereine?\b/i, // "Bund Österreichischer Frauenvereine", "Sportverein" — `\bverein\b` above needs the bare word
  /vertretung\b/i, // Studienvertretung, Bundesvertretung, Erwachsenenvertretung
  /presseclub|\bclub\b/i,
  /\bnationalbank\b|\bbank\b/i, // "Musterbank, Christine" has no boundary before "bank"
  /allianz\b/i,
  /\bliga\b/i, // "Testliga, Dora" is a surname
  /föderation/i,
  /kuratorium|fachstelle|\bsektion\b/i,
  /organisation\b/i,
  /greenpeace|global\s?2000/i,
  /gleichbehandlung/i,
  /\bNGO\b/,
  /personalvertretung|betriebsrat/i,
  /(?:interventions|beratungs|service|ombuds|koordinations|anlauf|geschäfts)stelle/i,
  new RegExp(`^(?:AK|BAK)\\s+(?:${LAENDER})\\b`),
  /^(?:ÖHGB|ÖVI|VCÖ)(?=[\s;,]|$)/,
]

/**
 * Academic titles (leading and trailing). Case-sensitive so that
 * name parts ("Di Marco", "Ma") are not matched. The degree abbreviations
 * take an optional dot: "Musterfrau BEd., Renate" is how the form is filled
 * in, and a title left half-stripped breaks the comma form that would have
 * protected the name.
 */
const TITLE_RE =
  /(?:^|[\s,])(?:(?:o\.|ao\.|em\.)\s?)?(?:Univ\.-?\s?Prof\.|Priv\.-?\s?Doz\.|Dipl\.-?\s?Ing\.|Dipl\.-?\s?Kfm\.|Dipl\.-?\s?Päd\.|MMag\.a?|Mag\.a?|DDr\.|Dr\.in|Dr\.|Ing\.|Prof\.|DI(?=[\s,]|$)|LL\.\s?M\.|LL\.\s?B\.|MSc\.?|BSc\.?|MBA\.?|MPA\.?|MAS\.?|MEd\.?|BEd\.?|MA\.?(?=[\s,]|$)|BA\.?(?=[\s,]|$)|PhD\.?|Bakk\.|iur\.|jur\.|phil\.|rer\.\s?nat\.|rer\.\s?soc\.\s?oec\.|med\.|techn\.|h\.c\.)/g

/** "Lastname, Firstname [middle name]" — nobility particles on the left allowed. */
const PERSON_COMMA_FORM_RE =
  /^\p{Lu}[\p{L}'’.-]*(?:\s+(?:\p{Lu}[\p{L}'’.-]*|van|von|der|de|den|zu|ter|le|la))?\s*,\s*\p{Lu}[\p{L}'’.-]*(?:[\s-]\p{Lu}[\p{L}'’.-]*){0,2}$/u

/** 1–3 capitalized name tokens (only relevant when a title was present). */
const SIMPLE_NAME_RE = /^\p{Lu}[\p{L}'’-]+(?:\s+\p{Lu}[\p{L}'’-]+){0,2}$/u

function matchesAny(patterns: RegExp[], s: string): boolean {
  return patterns.some((re) => re.test(s))
}

function stripTitles(s: string): { core: string; hadTitle: boolean } {
  const stripped = s.replace(TITLE_RE, ' ')
  const hadTitle = stripped !== s
  const core = stripped
    .replace(/\s*,\s*(?=,|$)/g, '')
    .replace(/^[\s,]+|[\s,]+$/g, '')
    .replace(/\s{2,}/g, ' ')
  return { core, hadTitle }
}

/** Any organisation signal at all — legal form, strong or weak keyword. */
function carriesOrgSignal(s: string): boolean {
  return matchesAny(LEGAL_FORM_PATTERNS, s) || matchesAny(ORG_PATTERNS, s)
}

/** Two or three capitalized tokens — a bare "Firstname Lastname". */
const BARE_NAME_RE = /^\p{Lu}[\p{L}'’-]+(?:\s+\p{Lu}[\p{L}'’-]+){1,2}$/u
/** An acronym ("WU Wien", "ÖH BOKU"), a split compound ("Mieter-, Siedler …")
 *  or an article ("Die Österreichischen Rechtsanwälte") — none of which
 *  opens a personal name. */
const NOT_A_NAME_RE = /(?:^|\s)\p{Lu}{2,}(?:\s|$)|-\s*$|-\s|^(?:Die|Der|Das|Den|Dem|Des)\s/u

/**
 * Whether a segment on its own reads as a person: "Lastname, Firstname", or
 * a title with one to three name tokens ("Mustermann Gregor, Dr."). With
 * `bare`, also two or three capitalized mixed-case tokens without any title
 * ("Huber Anna") — used only where the rest of the string supplies the
 * doubt, and never for a single token, an acronym or a hyphen-split word:
 * "Neustart, gemeinnütziger Verein", "WU Wien, Institut für …" and
 * "Österreichischer Mieter-, Siedler und Wohnungseigentümerbund" are
 * organisations, and the corpus comparison of 2026-09-15 is where each of
 * those shapes was caught.
 */
function isPersonShaped(segment: string, bare = false): boolean {
  if (!segment || /\d/.test(segment) || carriesOrgSignal(segment)) return false
  const { core: raw, hadTitle } = stripTitles(segment)
  if (!raw) return false
  // "mustermann, roland" is a person who did not reach for the shift key; the
  // shapes below want capitals, so an all-lowercase segment is given them.
  // Only then: in "Ärzte ohne Grenzen" the lowercase word is the signal
  // that this is not a name.
  const core = /\p{Lu}/u.test(raw)
    ? raw
    : raw.replace(/(^|[\s,/-])(\p{Ll})/gu, (_, before: string, letter: string) => before + letter.toUpperCase())
  if (PERSON_COMMA_FORM_RE.test(core)) return true
  if (hadTitle && SIMPLE_NAME_RE.test(core)) return true
  return bare && BARE_NAME_RE.test(core) && !NOT_A_NAME_RE.test(core)
}

/**
 * Several persons filing together: "Anna Huber/Max Mayer, Studienvertretung
 * X; …". Every part before the first separator has to read as a bare name;
 * one organisation among them ("Vier Pfoten/Tierschutz Austria") and the
 * string is not this shape.
 */
const JOINT_SPLIT_RE = /\/|\s(?:und|&)\s/

function leadsWithJointPersonNames(s: string): boolean {
  const first = s.split(/[;,]/)[0]!.trim()
  if (first.length === s.length || !JOINT_SPLIT_RE.test(first)) return false
  const parts = first.split(JOINT_SPLIT_RE).map((part) => part.trim())
  return parts.length >= 2 && parts.every((part) => isPersonShaped(part, true))
}

/**
 * A person first, an institution after: "Lastname, Firstname; Universität
 * Salzburg", "Mustermann Gregor, Dr.; Rechtsanwalt; … Rechtsanwälte GesbR",
 * "Huber, Anna, Universität Wien", "Huber Anna, Richterin am Landesgericht
 * Wien". The institution's keyword used to decide, and the row was published
 * whole. Here the segment that names the submitter decides instead — before
 * the legal forms, because "Huber, Anna; Raubal GmbH" names the person first.
 *
 * Deliberately narrow about what counts as the naming segment: the text
 * before the first semicolon, or the first two comma parts, or — with a
 * single comma — the left part when the right one carries the org signal.
 * An organisation whose own name is comma-shaped keeps its keyword in that
 * segment ("Land Tirol, Abteilung Verfassungsdienst; …") and is left alone.
 * The price is a brand-style organisation filing as "Name Name; Abteilung",
 * which now stays hidden like every other name the heuristic cannot place.
 */
function leadsWithPersonName(s: string): boolean {
  if (leadsWithJointPersonNames(s)) return true
  const semicolon = s.indexOf(';')
  if (semicolon >= 0) return isPersonShaped(s.slice(0, semicolon).trim(), true)
  const parts = s.split(',')
  if (parts.length >= 3) return isPersonShaped(`${parts[0]},${parts[1]}`.trim())
  if (parts.length === 2) {
    const [left, right] = parts as [string, string]
    return carriesOrgSignal(right) && isPersonShaped(left.trim(), true)
  }
  return false
}

/**
 * What list 142 column 19 says about the submitter: `I` for an institution,
 * `P` for a person, null when the column is missing or holds anything else.
 *
 * It records how the submitter REGISTERED, not what their name denotes —
 * which is exactly why it sees what a name cannot. Measured 2026-09-16 over
 * 106,626 rows (GP XXVIII/ME, GP XXVII/ME, GP XXVIII RV; present on 100 %
 * of them), it agrees with the name heuristic on 96.8–99.7 %.
 */
export type UpstreamSubmitterFlag = 'I' | 'P' | null

/** Anything but the two documented values is "no answer", never a guess. */
export function readUpstreamFlag(value: unknown): UpstreamSubmitterFlag {
  return value === 'I' || value === 'P' ? value : null
}

/**
 * The name half of the decision: everything that can be read off the string
 * itself. The rule order is GDPR-driven — do not reorder: person patterns
 * win against weak org indicators; only legal forms and strong org signals
 * win against person patterns — and the segment that names the submitter
 * wins against both.
 */
function classifyByName(s: string): SubmitterClassification {
  // The API delivers the "(postal code town)" suffix only for private persons.
  const withoutPlz = s.replace(PLZ_SUFFIX_RE, '').trim()
  if (withoutPlz !== s) return PERSON
  if (!withoutPlz) return PERSON

  // A person with an affiliation is a person, whatever the affiliation is.
  if (leadsWithPersonName(withoutPlz)) return PERSON

  // Legal forms are unambiguous — no person is called "GmbH".
  if (matchesAny(LEGAL_FORM_PATTERNS, withoutPlz)) {
    return { kind: 'organisation', name: withoutPlz }
  }

  const { core, hadTitle } = stripTitles(withoutPlz)
  const strongOrg = matchesAny(STRONG_ORG_PATTERNS, withoutPlz)

  if (!strongOrg && core && !/\d/.test(core)) {
    if (PERSON_COMMA_FORM_RE.test(core)) return PERSON
    if (hadTitle && SIMPLE_NAME_RE.test(core)) return PERSON
  }

  if (matchesAny(ORG_PATTERNS, withoutPlz)) {
    return { kind: 'organisation', name: withoutPlz }
  }

  // Safe default: when in doubt, private person with the name suppressed.
  return PERSON
}

/**
 * Classifies a raw submitter string from the Parliament API, with the
 * upstream flag as a second opinion.
 *
 * The flag may only ever VETO publication, never authorise it. Both
 * directions of disagreement were measured on 2026-09-16
 * (`scripts/classifier-audit.ts`), and they are not symmetric:
 *
 *  - Flag `P`, name reads as an organisation (29 rows across the corpora).
 *    Hand-checked, roughly sixteen of them name a real person the site
 *    publishes today — "Windland Energieerzeugungs GmbH; <Vorname Nachname>",
 *    "i.A. <Nachname>, <Verband>", "<Nachname> (für <AG>), <Vorname>". The
 *    name heuristic cannot reach these: the segment that names the submitter
 *    is org-shaped and the person stands behind it. The flag does not read
 *    the name at all, so it sees them. → the name is suppressed.
 *
 *  - Flag `I`, name reads as a person (176 / 287 / 30 rows). Mostly real
 *    institutions rendered as "Privatperson" (Datenschutzrat, KommAustria,
 *    Amnesty International, Naturhistorisches Museum Wien). Publishing on
 *    the flag alone would put the hard invariant in the hands of an
 *    undocumented upstream column: one silent flip and the site republishes
 *    names. → nothing changes here; `scripts/classifier-audit.ts` lists them
 *    and `ORG_ALLOWLIST` is where a verified one is published, by hand.
 *
 * The allowlist therefore outranks the flag: it is a human statement that
 * this name is an organisation, and it is the escape hatch for the roughly
 * eleven organisations per GP whose staff registered privately
 * ("Bundestheater Holding GmbH, BTH", "Patentanwaltskammer, Österr.").
 */
export function classifySubmitter(
  raw: string | null | undefined,
  upstreamFlag: UpstreamSubmitterFlag = null,
): SubmitterClassification {
  const s = (raw ?? '').replace(/\s+/g, ' ').trim()
  if (!s) return PERSON

  // Orthogonal to the flag: non-public rows carry both values (902 `P` and
  // 13 `I` in GP XXVIII alone), because it says who filed, not what is
  // published. The placeholder string stays the only source of truth here.
  if (NONPUBLIC_RE.test(s)) return NONPUBLIC

  const allowlisted = allowlistedName(s)
  if (allowlisted !== null) {
    return { kind: 'organisation', name: allowlisted }
  }

  const byName = classifyByName(s)
  if (byName.kind === 'organisation' && upstreamFlag === 'P') return PERSON
  return byName
}

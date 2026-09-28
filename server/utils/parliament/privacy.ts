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
 * GP-XXVIII Stellungnahme on 2026-09-15 (`scripts/audit/classifier.ts`): at
 * least 334 of the 2,996 rows filed as "person" were institutions — 221 of
 * them federal ministries in their own short form ("BM f. Finanzen"), then
 * courts, the Datenschutzbehörde, the FMA, the Umweltanwaltschaften and a
 * handful of brand-style NGOs. Every pattern added that day was held against
 * the comma-form person names of the same corpus and matched none of them.
 * Refused on the same evidence: a bare semicolon rule (persons file as
 * "Mustermann, Florian; Dr. med. dent."), all-caps ("MUSTERMANN, PETER")
 * and digits ("Muster, Ma8").
 *
 * The audit also found the opposite error, which is the one that matters:
 * "Lastname, Firstname; Universität Salzburg" — a person filing with an
 * affiliation — was published whole, name included, because the affiliation
 * carried the keyword. 239 rows in GP XXVII, 2 in GP XXVIII.
 * `leadsWithPersonName` closes that: the segment that names the submitter
 * decides, and it is checked before any organisation signal.
 */
import type { SubmitterKind } from '../../../shared/types'
import { ORG_ALLOWLIST } from './orgAllowlist'

interface SubmitterClassification {
  kind: SubmitterKind
  name: string | null
}

const PERSON: SubmitterClassification = { kind: 'person', name: null }
const NONPUBLIC: SubmitterClassification = { kind: 'nonpublic', name: null }

/** The API's placeholder for non-public submissions. */
const NONPUBLIC_RE = /nicht-?\s*öffentliche?\s+stellungnahme/i

/**
 * The segment separator of GP XXVI and earlier: „Organisation*Funktion*Name"
 * where later periods write a semicolon — 1.519 rows of GP XXVI/ME carry
 * it. Read as one, every rule that splits at the semicolon saw a single
 * segment there. Not the gender star, which is always „*in" or „*innen…"
 * with no further letter („Richter*innen", „Hochschüler*innenschaft",
 * „Pflegeanwält*innen"); „*institut" and „*international" are separators.
 * And only where a word follows: „(VkA*)" and a trailing „Frauen*" are not.
 */
const STAR_SEPARATOR_RE = /\s*\*(?!in(?:nen\p{Ll}*)?(?!\p{L}))(?=\s*\p{L})\s*/gu

/**
 * The whole string, or its naming segment: "Vier Pfoten; Stiftung für
 * Tierschutz" is allowlisted by its first segment, the department after the
 * semicolon varies from filing to filing.
 *
 * A head match therefore prints the HEAD only — the display name if the
 * entry carries one, otherwise the head as it stands upstream, never the
 * tail. What follows the semicolon is unverified, and "Org; <Vorname
 * Nachname>" is a measured class of this data: printing the full string
 * published the person standing behind the allowlisted organisation, and
 * because the allowlist outranks the upstream `P` flag
 * (`classifySubmitter`) nothing downstream could take that back.
 *
 * Returns the name to print, or null when the string is not allowlisted —
 * so "not listed" and "listed, print as it stands" stay distinguishable.
 */
function allowlistedName(s: string): string | null {
  const full = ALLOWLIST.get(allowlistKey(s))
  if (full !== undefined) return full ?? s
  // The longest listed run of leading segments, not only the first: with the
  // star read as a separator, „ÖSKOR * Radiologietechnologie; …" is a
  // verified name of two segments followed by an unverified third.
  const segments = s.split(';').map((t) => t.trim())
  for (let n = segments.length - 1; n >= 1; n--) {
    const head = segments.slice(0, n).join('; ')
    const listed = ALLOWLIST.get(allowlistKey(head))
    if (listed !== undefined) return listed ?? head
  }
  return null
}

/** Case and the spacing around a semicolon do not distinguish two entries. */
function allowlistKey(s: string): string {
  return s.toLowerCase().replace(/\s*;\s*/g, '; ')
}

const ALLOWLIST = new Map([...ORG_ALLOWLIST].map(([k, v]) => [allowlistKey(k), v]))

/**
 * "(4880 St. Georgen im Attergau)" suffix — only ever appears on private
 * persons. It ends the naming segment, not necessarily the string: a
 * semicolon may follow it ("… (1010 Wien); Universität Wien"), and anchoring
 * on the string's end alone threw away the API's strongest person signal
 * exactly where an affiliation came after it.
 */
const PLZ_SUFFIX_RE = /\s*\(\d{4,5}\s+[^)]+\)\s*(?=;|$)/

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
  // Written out as "BM für …" too (GP XXVII, 2026-09-28).
  /^BM\s?(?:f\.|für)\s/i,
  /kanzleramt/i,
  /(?:wirtschafts|arbeiter|arbeits|land(?:es)?|landwirtschafts|ärzte|zahnärzte|tierärzte|apotheker|notariats?|rechtsanwalts|ziviltechniker|patentanwalts|ingenieur)kammer/i,
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
  /gericht(?:e|s|es|en)?\b/i,
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
  // The genitive too (2026-09-27): "Österreichs E-Wirtschaft", "Oesterreichs
  // Energie", "Arbeiter-Samariter-Bund Österreichs" — two capitalized words,
  // so without the signal the head read as a bare "Vorname Nachname".
  /österreichs?\b|oesterreichs?\b|\baustria\b/i,
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
  /\bnationalbank\b|\bbank\b/i, // a surname ending in "-bank" has no boundary before the keyword
  /allianz\b/i,
  /\bliga\b/i, // a surname can end in "-liga"
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
  // Added 2026-09-23 so the affiliation guard in `classifyByName` costs no
  // visible row: these six naming segments carry no other org signal, and
  // without one the guard would read them as a person before an institution.
  /fonds\b/i, // "Fonds Soziales Wien", and "Klima- und Energiefonds" needs the compound
  /gemeinschaft\b/i, // "AktionsGemeinschaft"; also the `arbeitsgemeinschaft` above
  /^Fa\.\s/, // the Firma abbreviation, case-sensitive like `^BM f.` — "Fa. Softec, www.softec.at"
  /:innen\b/i, // the gender colon never occurs in a name — "Pflichtschullehrer:innen"
  // Added 2026-09-27 from the rows list 142 flags `I` and this module filed
  // as "person" (313 d.B.: 3 of 21). The flag found them; it does not
  // publish them — these patterns do, and each was held against every row
  // of GP XXVIII/XXVII (ME and RV) before it went in.
  /kom{1,2}itee\b/i, // "Parlamentarisches Datenschutzkomitee" — upstream spells it with "mm" too
  /\b(?:energie|e)-control\b/i, // the regulator E-Control: "Energie-Control ; Recht"

  // Added 2026-09-28 from the whole review queue of list 142 (flag `I`, filed
  // as "person": 558 distinct strings over GP XXVIII/XXVII, ME and RV). Each
  // was held against every row of that snapshot, both flags, and every string
  // it newly published was read; none names a person. What is NOT here, and
  // why: bare `rat\b` (the first name Murat, surnames ending in -rat, the
  // surname Rat itself), `\bhub\b` and `wende\b` without a compound (both
  // surnames in this data), `stelle\b` (the first name Estelle),
  // `\bsociety\b` and `\bUC\b` (each would have published the person named in
  // the segment after an org head — "Org; DI <Vorname Nachname>"), `Kanzlei`,
  // `Rechtsanwälte`, `Büro`, `Consulting` (firms named after their owners).
  /(?:datenschutz|fiskal|ernährungs|redaktions|fakultäts)rat(?:es)?\b/i, // the compounds only
  /^Rat\s+(?:der|des|für)\s/, // "Rat für Forschung …", "Rat der Kärntner Slowenen"
  /[a-zäöüß]ausschuss(?:es)?\b/i, // Monitoring-, Zentral-, Dienststellenausschuss — not "Ausschuss der … und Mag. <Name>"
  /prokuratur\b/i, // Finanzprokuratur, Generalprokuratur
  /bildungsdirektion|generaldirektion\b/i,
  /präsidentschaftskanzlei|hochkommissariat/i,
  /^(?:FH|TU|PH|KPH)(?=[\s;,-]|$)/, // "FH Campus Wien", "TU Wien; Senat" — case-sensitive
  /senat(?:e|s)?\b/i, // "TU Graz Senat", "Begutachtungssenat des OLG Linz"
  /universit|universtität/i, // "Danube Private University", "Privatuniverstität" as upstream spells it
  /kollegium|gremium|seminar\b/i,
  /arbeitskreis/i,
  /^(?:ARGE|Arge|IG)\s/, // Arbeits- and Interessengemeinschaft by their short forms — case-sensitive
  /\binternational\b/i,
  /\b(?:association|foundation|council|federation|confederation|alliance|agency|chapter|cent(?:er|re)|network|bureau)\b/i,
  /gmbh\b|\b(?:ltd|limited|plc)\b/i, // "gGmbH", "BetriebsgmbH" have no boundary before GmbH
  /\b(?:Inc|FlexCo|GbR|eG)\b/, // case-sensitive: "eG" is not "EG", "Inc" not "inc"
  /bündnis|bewegung\b|lobby\b|volksbegehren/i,
  /\bunion\b|demokratische?\b|demokratie\b/i,
  /(?:^|\s)Bund\s+(?:der|des)\s/, // "Bund der Steuerzahler" — case-sensitive, and never "Bund, Anna"
  /hilfe\b/i, // Volkshilfe, Suchthilfe, Lebenshilfe, Aids Hilfe, Bewährungshilfe
  /(?:antidiskriminierungs|doku|stabs|fachausbildungs|ombud)stelle\b/i, // extends the -stelle list above
  /museum\b|kultusgemeinde|kinderdorf|kinderschutz|schulamt\b/i,
  /klub\b|gruppe\b|\bgroup\b/i,
  /magazin\b|zeitung\b|rundschau\b|\bjournal\b/i,
  /^ORF\b/,
  /umweltanwalt\b/i, // Landesumweltanwalt — the office, like the Umweltanwaltschaft above
  /\bUN-|\bUNHCR\b|\bOSCE\b/,
  /einrichtung(?:en)?\b|anstalt\b/i,
  /[a-zäöüß](?:freunde|wende|forum)\b/i, // compounds only: "Naturschutzfreunde", "Verkehrswende", "Aktienforum"
  /vereins\b/i, // the genitive, which `[a-zäöüß]vereine?\b` above misses: "NÖ Landesvereins für …"
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
 * "<no organisation word at all>; <institution>" — the affiliation shape
 * read off the org signals alone, as the backstop for every head spelling
 * `isPersonShaped` cannot parse. An organisation's own naming segment names
 * the organisation, so it carries the signal itself ("Land Tirol,
 * Abteilung …; Verfassungsdienst"); a brand-style one that does not is what
 * `ORG_ALLOWLIST` is for.
 */
function leadsWithUnsignedSegment(s: string): boolean {
  const semicolon = s.indexOf(';')
  if (semicolon < 0) return false
  const head = s.slice(0, semicolon).trim()
  const tail = s.slice(semicolon + 1).trim()
  if (!head || !tail) return false
  return !carriesOrgSignal(head) && carriesOrgSignal(tail)
}

/**
 * The segments of an organisation's string that go on the page: the head,
 * and after it only segments that are themselves organisational — up to the
 * first that carries a title, reads as a person, or names no organisation.
 *
 * The same rule `allowlistedName` applies to its heads, for the strings the
 * patterns publish. They matched the whole string, and printed it whole:
 * „Verbund AG; Mag. <Vorname Nachname>", „Universität Wien; Institut für
 * Zivilrecht; Univ.-Ass. Mag. <Vorname Nachname>" were on the site (GP XXVI
 * 18 strings, GP XXVII 14, measured 2026-09-28), because both guards above
 * read the HEAD for a person and this shape has the person behind it, where
 * the `I` flag does not veto. A department survives („TU Wien; Senat",
 * „Die Tagespresse Medien FlexCo; FlexCo"); a function does not
 * („Demokratische Alternative; Vorsitzender") — it names no organisation,
 * and it is the segment a name follows.
 */
function printedName(full: string): string {
  const marker = personMarkerAt(full)
  const s = marker > 0 ? full.slice(0, marker).replace(/[\s,;]+$/, '') : full
  const segments = s.split(';').map((t) => t.trim())
  const kept = [withoutPersonPart(segments[0]!)]
  if (kept[0] === segments[0]) {
    for (const segment of segments.slice(1)) {
      if (!(carriesOrgSignal(segment) || DEPARTMENT_RE.test(segment)) || namesPerson(segment)) break
      const part = withoutPersonPart(segment)
      kept.push(part)
      if (part !== segment) break
    }
  }
  // Nothing cut: the string as it stands, spacing included.
  return s === full && kept.length === segments.length && kept.every((k, i) => k === segments[i]) ? s : kept.join('; ')
}

/**
 * The words a department, office or body of an organisation is named by —
 * evidence for a segment AFTER the head only, never a head of its own:
 * „Rechtsabteilung", „Rektorat", „Verfassungsdienst", „Geschäftsführung".
 */
const DEPARTMENT_RE =
  /abteilung|rektorat|dekanat|fakultät|institut|hauptstelle|arbeit\b|dienst\b|geschäftsf(?:ü|ue)hrung|geschäftsfeld|geschäftsstelle|sekretariat|vorstand\b|präsidi|referat\b|bereich\b|sektion\b|direktion\b|leitung\b|legistik|recht\b|politik\b|angelegenheiten|affairs\b|strategie\b|stellungnahme\b|bibliothek\b|department\b/i

/**
 * A title anywhere, or what is left once the department words are gone
 * reads as a person: „Abteilung Sozialpolitik" and „Public Affairs" are two
 * capitalised words and no name, „Rechtsabteilung Anna Huber" is a name.
 */
function namesPerson(segment: string): boolean {
  // „MA 62" is the Magistratsabteilung, not the degree.
  if (stripTitles(segment.replace(/\bMA\s?\d+\b/g, '')).hadTitle) return true
  // „LandesrätInnen <Vorname Nachname> (Oberösterreich)": the bracket is
  // where a name is placed, not part of it.
  const rest = segment
    .replace(/\s*\([^)]*\)/g, '')
    .split(/\s+/)
    .filter((token) => !DEPARTMENT_RE.test(token))
    .join(' ')
  return isPersonShaped(rest, true)
}

/**
 * Who files ON BEHALF of the organisation: „…; Vorstand, vertreten durch
 * <Vorname Nachname> & <Vorname Nachname>", „i.A. <Nachname>, <Verband>".
 * What follows is a person however it is spelled, so the printed name ends
 * before it — and a string that opens with it is a person's.
 */
const ON_BEHALF_RE = /(?:^|[\s,;])(?:vertreten\s+durch|im\s+Auftrag|i\.\s?A\.|z\.\s?H\.)/i

/**
 * A function followed by a name: „Die Grünen UmweltlandesrätInnen <Vorname
 * Nachname> (Vorarlberg), …", „…; Obmann <Vorname Nachname>". Also inside a
 * compound, and wherever it stands — in the head, where no comma split
 * reaches it. Only with two capitalised words after it, so „Leiterin
 * Konzernrecht und …" is a function, not a name.
 */
const FUNCTION_BEFORE_NAME_RE =
  /(?:^|[\s,;])\S*?(?:[Ll]andesr[aä]t|[Ss]tadtr[aä]t|[Bb]ürgermeister|[Oo]bmann|[Oo]bfrau|[Vv]orsitzende|[Ss]precher|[Ll]eiter|[Pp]räsident|[Gg]eschäftsführer|[Dd]irektor|[Rr]ektor)(?:in|innen|Innen|en|e|s|r|n)?\s+(\p{Lu}\p{Ll}+\s+\p{Lu}\p{Ll}+)/gu

/** Where the part of the string that names a person begins; -1 when nowhere. */
function personMarkerAt(s: string): number {
  const at = [s.search(ON_BEHALF_RE)]
  // The two words after the function must read as a person: „Der
  // Vizepräsident, Landesgericht Innsbruck" names a court, not a judge.
  for (const m of s.matchAll(FUNCTION_BEFORE_NAME_RE)) if (isPersonShaped(m[1]!, true)) at.push(m.index)
  const found = at.filter((i) => i >= 0)
  return found.length ? Math.min(...found) : -1
}

/**
 * „Verein Erneuerbare Energie Bregenzerwald, Max Mustermann": a comma inside
 * a segment is how organisations name themselves („Universität Wien,
 * Institut für …") and how a person is appended. So the cut there is at the
 * first comma part that carries a title or reads as a person, not at the
 * first without an organisation word.
 */
function withoutPersonPart(segment: string): string {
  const [first, ...parts] = segment.split(',')
  const kept = [first!]
  for (const part of parts) {
    if (namesPerson(part.trim())) break
    kept.push(part)
  }
  return kept.join(',').trim()
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
type UpstreamSubmitterFlag = 'I' | 'P' | null

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

  // The same shape, decided without reading a name. `leadsWithPersonName`
  // has to RECOGNISE the head as a person, and an adversarial probe of
  // 2026-09-23 showed how cheaply that fails: all caps ("MUSTERMANN ANNA"
  // reads as an acronym), a digit anywhere, a zero-width space inside the
  // comma form, a title the list does not know ("Dr. med. univ."). Each
  // time the affiliation's keyword then published the whole row. What the
  // head does NOT carry is an organisation word, and that is decidable
  // without a name: a naming segment with no org signal, followed by one
  // that has it, is the affiliation shape however the head is spelled.
  // Allowlisted heads never reach this — `classifySubmitter` returns first.
  if (leadsWithUnsignedSegment(withoutPlz)) return PERSON

  // „Univ.-Prof. Dr. <Vorname Nachname>, Universität Wien, …": a title in
  // the first comma part of the head is a person leading the string. The
  // comma form above reads the first TWO parts together, and the second
  // carries the organisation word that clears them (measured 2026-09-28,
  // three strings in GP XXVI/XXVII published that way).
  if (namesPerson(withoutPlz.split(';')[0]!.split(',')[0]!.trim())) return PERSON
  if (personMarkerAt(withoutPlz) === 0) return PERSON

  // Legal forms are unambiguous — no person is called "GmbH".
  if (matchesAny(LEGAL_FORM_PATTERNS, withoutPlz)) {
    return { kind: 'organisation', name: printedName(withoutPlz) }
  }

  const { core, hadTitle } = stripTitles(withoutPlz)
  const strongOrg = matchesAny(STRONG_ORG_PATTERNS, withoutPlz)

  if (!strongOrg && core && !/\d/.test(core)) {
    if (PERSON_COMMA_FORM_RE.test(core)) return PERSON
    if (hadTitle && SIMPLE_NAME_RE.test(core)) return PERSON
  }

  if (matchesAny(ORG_PATTERNS, withoutPlz)) {
    return { kind: 'organisation', name: printedName(withoutPlz) }
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
 * (`scripts/audit/classifier.ts`), and they are not symmetric:
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
 *    names. → nothing changes here; `scripts/audit/classifier.ts` lists them
 *    and `ORG_ALLOWLIST` is where a verified one is published, by hand.
 *
 * The allowlist therefore outranks the flag: it is a human statement that
 * this name is an organisation, and it is the escape hatch for the roughly
 * eleven organisations per GP whose staff registered privately
 * ("Bundestheater Holding GmbH, BTH", "Patentanwaltskammer, Österr.").
 * It can outrank it because `allowlistedName` prints the verified head
 * alone — there is no tail left for the flag to veto.
 */
export function classifySubmitter(
  raw: string | null | undefined,
  upstreamFlag: UpstreamSubmitterFlag = null,
): SubmitterClassification {
  // Zero-width characters go before the whitespace collapse: `\s` does not
  // match U+200B, so one of them inside "Nachname, Vorname" breaks the comma
  // form while the string still reads as a name to anyone looking at it.
  // NFC first, for the same reason one level down: list 142 carries decomposed
  // umlauts ("O" + U+0308, 6 rows in GP XXVIII/XXVII), and a combining mark is
  // neither `\p{L}` for the name shapes nor "ö" for the org patterns.
  const s = (raw ?? '')
    .normalize('NFC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(STAR_SEPARATOR_RE, '; ')
    .replace(/[;\s]+$/, '')
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

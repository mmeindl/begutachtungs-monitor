/**
 * GDPR enforcement: classification of submitter names from the
 * Parliament API (list 142 / SNME).
 *
 * PURE MODULE — no Nuxt auto-imports, only relative imports,
 * so vitest can execute the module directly.
 *
 * Hard invariant (docs/architecture.md §3): the name of a private person
 * must NEVER leave the server. The safe default is therefore `person` with
 * `name: null` — an organisation misclassified as a person is a cosmetic
 * bug, the opposite direction would publish a name.
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
 * brand-style names without any legal form or org keyword. Matched
 * case-insensitively against the full normalized name. Because an entry here
 * publishes the name, this list may contain organisations only, never
 * persons — add entries solely after verifying the exact spelling in the
 * Parliament data (list 142 `names[].name`).
 */
const ORG_ALLOWLIST = new Set([
  'epicenter.works', // verified 2026-08-23 via 14/SN-8/ME (GP XXVIII)
])

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
  /kanzleramt/i,
  /(?:wirtschafts|arbeiter|land(?:es)?|landwirtschafts|ärzte|zahnärzte|tierärzte|apotheker|notariats?|rechtsanwalts|ziviltechniker|patentanwalts|ingenieur)kammer/i,
  /kammer\s+(?:für|der|des)\b/i,
  /gewerkschaft/i,
  /gesellschaft\b/i,
  /universität/i,
  /(?:fach)?hochschule/i,
  /gerichtshof|rechnungshof|volksanwaltschaft/i,
  /bundesamt|landesamt|gemeindeamt|\bamt\s+der\b/i,
  /landesregierung|landtag\b|magistrat|bezirkshauptmannschaft/i,
  /sozialversicherung|gesundheitskasse|krankenkasse|pensionsversicherung|unfallversicherung/i,
  /genossenschaft/i,
  /bischofskonferenz|erzdiözese|diözese/i,
  /stiftung\b/i,
]

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
  /\b(?:ÖGB|WKÖ|WKO|ÖH|ÖAMTC|ARBÖ|SPÖ|ÖVP|FPÖ|NEOS|KPÖ)\b/,
  /partei\b/i,
]

/**
 * Academic titles (leading and trailing). Case-sensitive so that
 * name parts ("Di Marco", "Ma") are not matched.
 */
const TITLE_RE =
  /(?:^|[\s,])(?:(?:o\.|ao\.|em\.)\s?)?(?:Univ\.-?\s?Prof\.|Priv\.-?\s?Doz\.|Dipl\.-?\s?Ing\.|Dipl\.-?\s?Kfm\.|Dipl\.-?\s?Päd\.|MMag\.a?|Mag\.a?|DDr\.|Dr\.in|Dr\.|Ing\.|Prof\.|DI(?=[\s,]|$)|LL\.\s?M\.|LL\.\s?B\.|MSc|BSc|MBA|MPA|MAS|MEd|BEd|MA(?=[\s,]|$)|BA(?=[\s,]|$)|PhD|Bakk\.|iur\.|jur\.|phil\.|rer\.\s?nat\.|rer\.\s?soc\.\s?oec\.|med\.|techn\.|h\.c\.)/g

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

/**
 * Classifies a raw submitter string from the Parliament API.
 * The rule order is GDPR-driven — do not reorder:
 * person patterns win against weak org indicators; only legal forms
 * and strong org signals win against person patterns.
 */
export function classifySubmitter(raw: string | null | undefined): SubmitterClassification {
  const s = (raw ?? '').replace(/\s+/g, ' ').trim()
  if (!s) return PERSON

  if (NONPUBLIC_RE.test(s)) return NONPUBLIC

  if (ORG_ALLOWLIST.has(s.toLowerCase())) {
    return { kind: 'organisation', name: s }
  }

  // The API delivers the "(postal code town)" suffix only for private persons.
  const withoutPlz = s.replace(PLZ_SUFFIX_RE, '').trim()
  if (withoutPlz !== s) return PERSON
  if (!withoutPlz) return PERSON

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

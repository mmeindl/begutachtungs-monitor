/**
 * What a script needs in order to read a RIS record the way the site does.
 *
 * `asArray` is the SHIPPED one, re-exported rather than copied: it is the
 * XML-to-JSON trap (one element → bare object, several → array), and a script
 * that read the corpus through a second copy of that rule would be measuring
 * its own reading instead of the site's.
 */
export { asArray } from '../../server/utils/ris/risRecord'

/**
 * How a Textgegenüberstellung and the Erläuterungen name themselves — the
 * SHIPPED rules, re-exported for the same reason as `asArray`: until
 * 27.09.2026 this file held a copy of the annex literal, kept in step with the
 * request path by hand, and a copy is what lets a script count what the site
 * does not.
 */
export { explanationsNameRank, pickExplanations, pickOlderTextComparisons, pickTextComparisons, textComparisonNameRank } from '../../server/utils/ris/risRecord'

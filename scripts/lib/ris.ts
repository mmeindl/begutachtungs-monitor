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
 * How a Textgegenüberstellung names itself in a RIS `ContentReference` or a
 * Parliament document group.
 *
 * The same literal as `server/utils/ris/risRecord.ts` and
 * `server/utils/annex/annexSource.ts`, which are on the request path and
 * decide from their own constant — a script must not be able to widen what
 * it counts as an annex without the site widening with it, so when this one
 * moves, those two are the ones to check. No `g` flag, so the instance is
 * safe to share across call sites.
 */
export const ANNEX_NAME_RE = /gegen.?über|^TG(Ü|G|UE)$/i

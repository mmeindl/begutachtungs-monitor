/**
 * Canonical validation for GP codes and item numbers — the ONE definition
 * for client routes, server params, and mappers (auto-imported; pure module
 * so vitest can import it relatively).
 */

/** Valid GP code: Roman numerals (value range of the Parliament API). */
export const GP_RE = /^[IVXLC]+$/

/** Valid item number (INR): digit sequence. */
export const INR_RE = /^\d+$/

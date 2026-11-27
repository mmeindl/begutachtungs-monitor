/**
 * Why a read of a source failed, in a few words for the server's log.
 *
 * BUILT FROM THE ERROR'S KIND, NEVER FROM AN ANSWER'S TEXT. A source's answer
 * can hold what no log may keep: the Commission's portal and the register of
 * the European Citizens' Initiative name officials and organisers in their
 * records, and the runtime quotes an answer in its own messages — a body that
 * is no JSON fails with „Unexpected token 'E', "Erika Must"... is not valid
 * JSON". So a message is printed only where this repository wrote it:
 *
 * - an error of the HTTP client (`fetch.ts`) gives its status or its class,
 *   and one that gave up after its attempts gives what the last attempt died
 *   of, which the client names as a kind (`UpstreamUnreachableError.reason`);
 * - a plain `Error` is a reader's own sentence („Register: Liste ohne
 *   Einträge"), thrown where a parser met a shape it does not know. The
 *   readers write these as fixed sentences that carry nothing of the answer
 *   but a count (`tests/failureReason.test.ts` holds the two list readers to
 *   it);
 * - every other error — a `SyntaxError`, a `TypeError`, anything the runtime
 *   or a library made — gives its name alone.
 *
 * FOR A READ WHOSE ANSWER MAY NAME A PERSON. A Land's list reads print the
 * error's message instead (`[laender] … nicht abrufbar:`): there the reason
 * is the gate's sentence and the page's address, and both are needed.
 *
 * PURE MODULE — no Nitro globals, relative imports only.
 */
import { UpstreamError, UpstreamHttpError, UpstreamUnreachableError } from './fetch'

/** The reason for the log line; see the header for what it may hold. */
export function failureReason(error: unknown): string {
  if (error instanceof UpstreamUnreachableError) return `nicht erreichbar (${error.reason})`
  if (error instanceof UpstreamHttpError) return `HTTP ${error.status}`
  if (error instanceof UpstreamError) return error.name
  if (error instanceof Error) return error.constructor === Error ? error.message : error.name
  return 'Fehler ohne Angabe'
}

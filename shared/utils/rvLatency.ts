/**
 * How long after the Fristende a Regierungsvorlage still counts as the
 * usual pipeline — one number for the page and for the server.
 *
 * Deadline ended ≤ N days ago → the no-RV note adds pipeline-latency context
 * ("häufig mehrere Monate"), so a fresh "Bisher keine Regierungsvorlage"
 * reads as "not yet", never as shelved. Written by hand in August 2026 and
 * confirmed by measurement on 2026-09-08 (`scripts/corpus/rvLatency.ts`): the
 * p90 of Fristende → first Regierungsvorlage is 189 days in GP XXVII and
 * 148 in GP XXVI, so nine in ten arrive inside this window — which is what
 * `app/utils/outcomes.ts` says under the sentence.
 *
 * In `shared/` since 14.11.2026: the server reads the same window to decide
 * whether a Vorlage of another draft that names this draft's title came
 * soon enough to be about it (`server/utils/parliament/namedInRv.ts`).
 *
 * Pure module.
 */
export const RV_LATENCY_CONTEXT_DAYS = 180

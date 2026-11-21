/**
 * The page's own RIS readers for a harness, uncached (audit of 20.11.2026).
 *
 * The request path finds a law through `resolveKonsLaw` (`kons/konsCache.ts`):
 * the Stammnorm with the clause the draft prints, the law looked up by the
 * clause's name where it cites no Stammnorm, and the law as it stood on the
 * day (`standingOnDay`); the annex check bridges a § across a version gap
 * (`annexSourcesOf`). `annexPdf.ts`, `faultInjection.ts`, `me.ts` and
 * `ci/gateGoldenRecord.ts` called `resolveLawByBgbl` instead and caught a
 * failed lookup into null, so what they measured was not what the page does.
 *
 * Those readers are Nitro glue, built with `defineCachedFunction` at module
 * load. The identity stands in for it, as in `ci/konsGoldenRecord.ts`, so
 * what runs is the read itself, under the harness cache the caller installs.
 * A throw goes through: a lookup that failed is a draft not reached, never
 * a law that does not exist.
 */
import type { AnnexSources } from '../../server/utils/annex/verdict'
import { annexSourcesOf } from '../../server/utils/annex/annexSources'

/* eslint-disable @typescript-eslint/no-explicit-any */
const g = globalThis as any
g.defineCachedFunction ??= (fn: unknown) => fn
// `kons/konsCache.ts` reads the layer name as a Nitro auto-import.
g.DERIVED_CACHE ??= '/derived'
const kons = await import('../../server/utils/kons/konsCache')

/** Which law a Stammnorm — or, with an empty one, the clause's name — means on a day, as the page resolves it. */
export const resolveKonsLaw = kons.resolveKonsLaw

/** The annex check's sources as the page builds them, uncached. */
export const annexSources: AnnexSources = annexSourcesOf({ resolveLaw: kons.resolveKonsLaw, history: kons.readParagraphHistory, paragraphXml: kons.fetchParagraphXml })

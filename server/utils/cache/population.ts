/**
 * Reading one population of drafts into a fact store (`factStore.ts`) — the
 * map builders' loop (docs/architecture.md §12.66 Nachtrag 3, §12.67).
 *
 * A fresh entry is kept, every other draft read with `limit` in flight. A
 * throw costs that draft, never the population; an incomplete answer
 * (`Gathered.complete: false`) is served on the page and not stored.
 *
 * ALIGNED POPULATIONS (`runAligned`): the EU map and the Bund-zu-Land map
 * read the same Länder drafts, and both facts rest on one read of each
 * draft's PDFs (`laender/landDraftTexts.ts`), held only for minutes. So
 * the Länder run as one loop over the drafts, each draft's EU job and
 * Bund-zu-Land job one after the other — the second finds the first's read.
 */
import { isFresh, type StoreFile } from './factStore'
import type { Gathered } from './gathered'

/** One population's line of a build report. */
export interface PopulationReport {
  total: number
  /** Read now and stored. */
  read: number
  /** Taken from the store, unread. */
  fromStore: number
  /** Threw — not stored, the publisher is incomplete. */
  failed: number
  /** Read, but a part of it did not answer (`Gathered.complete: false`) — not stored either. */
  partial: number
  seconds: number
}

/** One draft to read: its key, what its fact rests on, whether its Begutachtung runs, and how to read it. */
export interface PopulationJob<F> {
  key: string
  fingerprint: string
  open: boolean
  read: () => Promise<Gathered<F>>
}

export const emptyReport = (): PopulationReport => ({ total: 0, read: 0, fromStore: 0, failed: 0, partial: 0, seconds: 0 })

/** One store and its jobs; in `runAligned` every population's job `k` is the same draft. */
export interface Population<F> {
  store: StoreFile<F>
  jobs: readonly PopulationJob<F>[]
  /** The log's prefix for a draft that threw. */
  label: string
}

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Reads several populations over the same drafts, draft by draft: a worker
 * takes draft `k` and runs each population's job `k` in turn. One report
 * per population, in their order.
 */
export async function runAligned(populations: readonly Population<any>[], limit: number): Promise<PopulationReport[]> {
  const t0 = Date.now()
  const length = Math.max(0, ...populations.map((p) => p.jobs.length))
  const reports = populations.map((p) => ({ ...emptyReport(), total: p.jobs.length }))
  const now = Date.now()
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < length) {
      const k = next++
      for (const [i, p] of populations.entries()) {
        const job = p.jobs[k]
        if (!job) continue
        const report = reports[i]!
        if (isFresh(p.store.entries[job.key], job.fingerprint, job.open, now)) {
          report.fromStore++
          continue
        }
        try {
          const g = await job.read()
          if (g.complete) {
            p.store.entries[job.key] = { fingerprint: job.fingerprint, readAt: new Date().toISOString(), fact: g.value }
            report.read++
          } else {
            // Served on the page, never kept: the next build asks again.
            Reflect.deleteProperty(p.store.entries, job.key)
            report.partial++
          }
        } catch (err) {
          Reflect.deleteProperty(p.store.entries, job.key)
          report.failed++
          console.warn(`[${p.label}] ${job.key}:`, err instanceof Error ? err.message : err)
        }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, length) }, worker))
  const seconds = Math.round((Date.now() - t0) / 100) / 10
  for (const r of reports) r.seconds = seconds
  return reports
}

/* eslint-enable @typescript-eslint/no-explicit-any */

/** One population on its own. */
export async function runPopulation<F>(store: StoreFile<F>, jobs: readonly PopulationJob<F>[], limit: number, label: string): Promise<PopulationReport> {
  return (await runAligned([{ store, jobs, label }], limit))[0]!
}

/**
 * A corpus read, kept on disk so the second run is free.
 *
 * Five scripts had this, and the reason is the same in all five: a run over
 * a Gesetzgebungsperiode is several hundred documents, and a measurement
 * that costs twenty minutes is a measurement nobody repeats after changing
 * the thing it measures. Nothing here expires anything — the cache directory
 * is deleted by hand when the corpus should be read again.
 *
 * Deliberately not `lib/harnessCache.ts`: that one intercepts `fetch` for a
 * whole harness run and verifies what it stores, this one is an explicit
 * per-file read the caller names.
 */
import { readFile, writeFile } from 'node:fs/promises'

/** The parsed JSON at `file`, or `load()` written there first. */
export async function cachedJson<T>(file: string, load: () => Promise<T>): Promise<T> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as T
  } catch {
    const data = await load()
    await writeFile(file, JSON.stringify(data))
    return data
  }
}

/** The same for a document kept as it arrived — XML, HTML, plain text. */
export async function cachedText(file: string, load: () => Promise<string>): Promise<string> {
  try {
    return await readFile(file, 'utf8')
  } catch {
    const data = await load()
    await writeFile(file, data)
    return data
  }
}

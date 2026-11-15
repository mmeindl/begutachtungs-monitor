/**
 * No test reaches the network (15.11.2026). `fetch` refuses here, and a test
 * that tried fails afterwards with the address, so a read that is not
 * mocked is a failing test, not a test that passes online and times out
 * offline.
 *
 * Why it exists: `stationMap.test.ts` and `lawDiffService.test.ts` reached
 * Parliament's EBR list for real through the Bundesrat's objection, which
 * none of their tests is about. Each such test took half a second online
 * and hit vitest's 5 s limit when the network was slow, so the suite failed
 * at random and the failures were read as load.
 *
 * WHY THE CHECK RUNS AFTER EACH TEST and the throw alone is not enough: the
 * code under test catches an upstream failure on purpose (an unreachable
 * list is „not answered", never an error page). The refusal alone was
 * swallowed there, and the leaking test passed — measured by putting the
 * original leak back.
 *
 * A test of the fetch layer stubs `fetch` itself (`vi.stubGlobal`), so this
 * guard is never called there, and `vi.unstubAllGlobals` brings the guard
 * back, not the real `fetch`.
 */
import { afterEach } from 'vitest'

const attempts: string[] = []

const guard: typeof fetch = async (input) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  attempts.push(url)
  throw new Error(`A test reached the network: ${url}. Mock the upstream read instead.`)
}

globalThis.fetch = guard

afterEach(() => {
  if (!attempts.length) return
  const urls = attempts.splice(0)
  throw new Error(`This test tried to reach the network (${urls.length}×), first ${urls[0]}. Mock the upstream read instead.`)
})

/**
 * What the Regierungsvorlage made of the draft, for its station frame
 * (02.10.2026): how much of the text it changed, how many Begründungen, and
 * where its Erläuterungen are.
 *
 * Until then the ME→RV comparison said it in two sentences above its list.
 * They moved into the card because the card is where the page states a
 * station's facts (`FactList`), and the comparison under it now opens with
 * its list.
 *
 * ONE REQUEST EACH. The comparison (`LawDiffSection`) reads the same two
 * responses, so both fetch under the shared keys (`lawDiffKey`, `lawReasoningKey`)
 * and with `dedupe: 'defer'` — Nuxt's default `cancel` aborts the first
 * caller's request and sends it again. Client-side like the comparison: the
 * first request per draft parses two documents, and the page must not wait
 * for that.
 *
 * @param enabled Whether a Vorlage exists — the endpoints have nothing to
 * compare otherwise.
 */
import type { LawDiffResponse, ReasoningDiffResponse } from '#shared/types'
import { changeShareNounDe, ownChangeShare } from '#shared/utils/changeShare'
import { lawDiffKey, lawReasoningKey } from '#shared/utils/lawStations'

export function useVorlageOutcome(source: () => { gp: string; inr: number }, enabled: boolean) {
  const { data: diff, status: diffStatus } = useFetch<LawDiffResponse>(
    () => `/api/drafts/${source().gp}/${source().inr}/diff?von=me&bis=rv`,
    { key: () => lawDiffKey(source().gp, source().inr, 'me', 'rv'), lazy: true, server: false, dedupe: 'defer', immediate: enabled },
  )
  const { data: reasoning } = useFetch<ReasoningDiffResponse>(
    () => `/api/drafts/${source().gp}/${source().inr}/begruendung?von=me&bis=rv`,
    { key: () => lawReasoningKey(source().gp, source().inr, 'me', 'rv'), lazy: true, server: false, dedupe: 'defer', immediate: enabled },
  )

  /** Null once the comparison is there and has nothing to count. */
  const share = computed(() => {
    const d = diff.value
    if (!d?.available) return null
    const s = ownChangeShare(d.stats)
    return s ? { ...s, noun: changeShareNounDe(d.units) } : null
  })
  /** Still on its way — the card holds the row's place meanwhile. */
  const sharePending = computed(() => enabled && !diff.value && diffStatus.value !== 'error')

  const reasoningStats = computed(() => {
    const stats = reasoning.value?.stats
    return stats?.compared ? { changed: stats.changed, compared: stats.compared } : null
  })
  /** The Vorlage's Erläuterungen. The service sends both documents as
   *  [Entwurf, Regierungsvorlage], and only where both were found. */
  const rvExplanations = computed(() => (reasoning.value?.sources?.length === 2 ? reasoning.value.sources[1] ?? null : null))

  return { share, sharePending, reasoningStats, rvExplanations }
}

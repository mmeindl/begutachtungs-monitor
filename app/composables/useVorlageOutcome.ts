/**
 * What the Regierungsvorlage made of the draft, for its station frame
 * (02.10.2026): how many Begründungen it changed, and where its
 * Erläuterungen are.
 *
 * Until then the ME→RV comparison said it in two sentences above its list.
 * They moved into the card because the card is where the page states a
 * station's facts (`FactList`), and the comparison under it now opens with
 * its list. The other of the two, how much of the text changed, was a row
 * with a share until 17.11.2026; the comparison's legend counts it per kind,
 * so the frame no longer repeats it and this no longer reads the § diff.
 *
 * ONE REQUEST. The comparison (`LawDiffSection`) reads the same response,
 * so it is fetched under the shared key (`lawReasoningKey`) and with
 * `dedupe: 'defer'` — Nuxt's default `cancel` aborts the first caller's
 * request and sends it again. Client-side like the comparison: the first
 * request per draft parses two documents, and the page must not wait for
 * that.
 *
 * @param enabled Whether a Vorlage exists — the endpoints have nothing to
 * compare otherwise. A ref, because after a click the page's draft arrives
 * after this runs (`lazy`, 04.10.2026): read once, it was false for good.
 */
import type { Ref } from 'vue'
import type { ReasoningDiffResponse } from '#shared/types'
import { lawReasoningKey } from '#shared/utils/lawStations'
import { reasoningShareValueDe } from '~/utils/outcomes'
import { explanationsMissingNote, substantiveReasoningChanges } from '~/utils/reasoningNotes'

export function useVorlageOutcome(source: () => { gp: string; inr: number }, enabled: Ref<boolean>) {
  const { data: reasoning } = useFetch<ReasoningDiffResponse>(
    () => `/api/drafts/${source().gp}/${source().inr}/begruendung?von=me&bis=rv`,
    { key: () => lawReasoningKey(source().gp, source().inr, 'me', 'rv'), lazy: true, server: false, dedupe: 'defer', enabled, watch: [enabled] },
  )

  /** Changed as the page counts it, the editorial ones not (`substantiveReasoningChanges`). */
  const reasoningStats = computed(() => {
    const stats = reasoning.value?.stats
    return stats?.compared ? { changed: substantiveReasoningChanges(stats), compared: stats.compared } : null
  })
  /** The Vorlage's Erläuterungen. The service sends both documents as
   *  [Entwurf, Regierungsvorlage], and only where both were found. */
  const rvExplanations = computed(() => (reasoning.value?.sources?.length === 2 ? reasoning.value.sources[1] ?? null : null))

  /** The count as the frame's row prints it; null while absent. */
  const reasoningDe = computed(() => {
    const r = reasoningStats.value
    return r ? reasoningShareValueDe(r.changed, r.compared) : null
  })

  /** Why no Begründung could be compared, where a side's Erläuterungen were not read (`explanationsMissingNote`). */
  const explanationsMissingDe = computed(() => explanationsMissingNote(reasoning.value?.explanationsMissing))

  return { reasoningStats, rvExplanations, reasoningDe, explanationsMissingDe }
}

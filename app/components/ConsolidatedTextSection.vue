<script setup lang="ts">
/**
 * „Wie das Gesetz danach lauten würde" — die eigene konsolidierte
 * Lesefassung (docs/architecture.md §12.12).
 *
 * WARUM ES DIESEN ABSCHNITT GIBT, obwohl die Gegenüberstellung über ihm
 * dieselbe Änderung zeigt. Die Beilage des Ressorts druckt den Absatz, den
 * sie ändert, und lässt den Rest des Paragraphen weg; hier steht der ganze
 * Paragraph, wie er nach dem Entwurf lautete, aus dem geltenden Text des RIS
 * statt aus der Abschrift des Ressorts. Das ist der Unterschied zwischen
 * „diese Wortfolge wird ersetzt" und „so liest sich die Bestimmung dann" —
 * und es ist der kleinere Teil der Frage, weshalb dieser Abschnitt UNTER der
 * Gegenüberstellung steht und nicht an ihrer Stelle.
 *
 * WAS ER NICHT IST: keine amtliche Fassung, keine Vorhersage und nichts, was
 * ein Sprachmodell geschrieben hätte. Die Anweisungen des Entwurfs werden als
 * Textoperationen angewendet, und angezeigt wird ein Paragraph nur, wenn die
 * Textgegenüberstellung des Ressorts dasselbe Ergebnis trägt (`konsGate.ts`).
 *
 * DIE FEHLENDEN PARAGRAPHEN SIND DER WICHTIGSTE TEIL DER ANZEIGE. Im Median
 * zeigt dieses Tor 12 % der Paragraphen eines Entwurfs. Eine Liste, die das
 * verschweigt, liest sich wie „der Rest bleibt, wie er ist" — und das ist die
 * eine Aussage, die hier nie stehen darf (§12.27: eine Lücke ist kein
 * Befund). Deshalb steht unter jeder Liste, wie viele Paragraphen der Entwurf
 * ändert, wie viele davon hier stehen und warum die anderen fehlen.
 *
 * CLIENT-SEITIG wie die anderen Vergleichsabschnitte: Ein Entwurf kann
 * Dutzende RIS-Dokumente brauchen, und das gehört nicht in den SSR-Pfad.
 */
import type { ConsolidatedParagraph, ConsolidatedTextResponse } from '#shared/types'
import { formatDateDe } from '#shared/utils/format'

const props = defineProps<{ gp: string; inr: number }>()

const { data, status } = await useFetch<ConsolidatedTextResponse>(
  () => `/api/drafts/${props.gp}/${props.inr}/konsolidiert`,
  { lazy: true, server: false },
)

/**
 * Nach Gesetz gruppiert, in der Reihenfolge der Artikel des Entwurfs.
 *
 * Bei einer Einzelnovelle trägt kein Paragraph ein Gesetz — dann gibt es
 * eine Gruppe ohne Überschrift, weil das Gesetz zwei Abschnitte weiter oben
 * schon steht und eine Wiederholung nur Platz kostet.
 */
interface LawGroup {
  key: string
  law: string | null
  article: string | null
  paragraphs: ConsolidatedParagraph[]
}

const groups = computed<LawGroup[]>(() => {
  const out: LawGroup[] = []
  for (const p of data.value?.paragraphs ?? []) {
    const key = `${p.article ?? ''}|${p.law ?? ''}`
    const last = out.at(-1)
    if (last?.key === key) last.paragraphs.push(p)
    else out.push({ key, law: p.law, article: p.article, paragraphs: [p] })
  }
  return out
})

const shownCount = computed(() => data.value?.paragraphs.length ?? 0)

/** Dieselbe Mechanik wie in den anderen Abschnitten: erst nach dem Laden ansagen. */
const loadAnnouncement = computed(() => {
  if (status.value === 'pending' || status.value === 'idle') return ''
  if (status.value === 'error' || !data.value) return 'Die Lesefassung ist gerade nicht verfügbar.'
  if (!data.value.available) return data.value.unavailableReason ?? ''
  return `Lesefassung geladen: ${shownCount.value} Paragraphen.`
})
</script>

<template>
  <div class="mt-4">
    <p aria-live="polite" class="sr-only">{{ loadAnnouncement }}</p>

    <p v-if="status === 'pending' || status === 'idle'" class="text-sm text-ink-muted">
      Die Lesefassung wird berechnet …
    </p>

    <p v-else-if="status === 'error' || !data" class="text-sm text-ink-secondary">
      Die Lesefassung ist gerade nicht verfügbar.
    </p>

    <!-- Der häufigste Fall, und kein Fehler: In der Hälfte der Entwürfe
         bestätigt die Beilage keinen einzigen Paragraphen. Der Satz sagt,
         woran es liegt — an der fehlenden zweiten Meinung, nicht daran, dass
         der Entwurf nichts änderte. -->
    <template v-else-if="!data.available">
      <p class="max-w-prose text-sm text-ink-secondary">{{ data.unavailableReason }}</p>
      <!-- Auch wenn nichts dasteht, steht hier, worüber nichts dasteht: Wie
           viele Paragraphen der Entwurf ändert, ist die Zahl, die der Leser
           sonst aus dem Schweigen erraten müsste. -->
      <template v-if="data.touched > 0">
        <p class="mt-2 max-w-prose text-sm text-ink-muted">
          Der Entwurf ändert {{ data.touched }} Paragraphen — ungeprüft ist
          nicht unverändert.
        </p>
        <ul v-if="data.withheld.length" class="mt-2 space-y-1 text-sm text-ink-muted">
          <li v-for="w in data.withheld" :key="w.cause">{{ w.count }} × {{ w.label }}</li>
        </ul>
      </template>
    </template>

    <template v-else>
      <!-- Der Vorbehalt steht ÜBER dem Text: Er sagt, wie das Folgende zu
           lesen ist. Die Quelle steht darunter — dieselbe Regel wie in den
           anderen Abschnitten. -->
      <p class="max-w-prose text-sm text-ink-muted">
        Nicht amtliche konsolidierte Lesefassung: der geltende Text aus dem
        RIS<template v-if="data.asOf"> in der Fassung vom {{ formatDateDe(data.asOf) }}</template>,
        auf den wir die Anweisungen dieses Entwurfs angewendet haben. Gezeigt
        wird nur, was die Textgegenüberstellung des Ressorts bestätigt.
      </p>

      <div v-for="group in groups" :key="group.key" class="mt-6">
        <p v-if="group.law" class="text-sm font-semibold text-ink">
          {{ group.law }}
          <span v-if="group.article" class="font-normal text-ink-muted">({{ group.article }})</span>
        </p>

        <div class="mt-2 divide-y divide-hairline">
          <article v-for="p in group.paragraphs" :key="`${group.key}|${p.id}`" class="py-4 first:pt-2">
            <!-- Keine Versalien: „§ 212b" ist eine Bezeichnung, und
                 `uppercase` machte daraus „§ 212B" — einen anderen
                 Paragraphen, streng genommen. -->
            <p class="text-xs font-semibold tracking-wide text-ink-muted">{{ p.label }}</p>
            <!-- Die Überschrift des Paragraphen als Überschrift, mit
                 derselben Markierung wie der Text: Ändert der Entwurf sie
                 („Generalprokuratur" → „Bundesstaatsanwaltschaft"), ist das
                 die auffälligste Änderung, die er an dieser Stelle macht. -->
            <p v-if="p.headingSegments" class="mt-1 text-sm font-semibold text-ink">
              <template v-for="(s, si) in p.headingSegments" :key="si">
                <del v-if="s.type === 'removed'" class="rounded bg-status-critical/10 px-0.5 font-normal text-ink line-through decoration-status-critical/70">{{ s.text }}</del>
                <ins v-else-if="s.type === 'inserted'" class="rounded bg-status-good/15 px-0.5 text-ink no-underline">{{ s.text }}</ins>
                <span v-else>{{ s.text }}</span>
                {{ ' ' }}
              </template>
            </p>
            <!-- Ein Fließtext, kein Zweispalter: Die Überschrift des
                 Paragraphen steht im Text, wo das RIS sie führt, und ändert
                 der Entwurf sie, ist sie hier genauso markiert wie jedes
                 andere Wort. Dieselbe rot/grün-Sprache wie in den
                 Vergleichsabschnitten. -->
            <p class="mt-1 hyphens-auto text-sm leading-relaxed text-ink">
              <template v-for="(s, si) in p.segments" :key="si">
                <del v-if="s.type === 'removed'" class="rounded bg-status-critical/10 px-0.5 text-ink line-through decoration-status-critical/70">{{ s.text }}</del>
                <ins v-else-if="s.type === 'inserted'" class="rounded bg-status-good/15 px-0.5 text-ink no-underline">{{ s.text }}</ins>
                <span v-else>{{ s.text }}</span>
                {{ ' ' }}
              </template>
            </p>
          </article>
        </div>
      </div>

      <!-- Die Bilanz, und sie ist nicht optional: Ohne sie liest sich die
           Liste oben wie „das ist alles, was sich ändert". -->
      <div class="mt-6 border-t border-hairline pt-4">
        <p class="max-w-prose text-sm text-ink-secondary">
          Gezeigt sind {{ shownCount }} von {{ data.touched }} Paragraphen, die
          dieser Entwurf ändert. Was hier fehlt, ist deshalb nicht unverändert —
          es ist ungeprüft.
        </p>
        <ul v-if="data.withheld.length" class="mt-2 space-y-1 text-sm text-ink-muted">
          <li v-for="w in data.withheld" :key="w.cause">
            {{ w.count }} × {{ w.label }}
          </li>
        </ul>
      </div>

      <SectionCredits>
        <span>Geltender Text (CC BY 4.0, RIS):</span>
        <ExternalLink
          v-if="data.paragraphs[0]?.risUrl"
          :href="data.paragraphs[0]!.risUrl!"
          class="text-accent-deep hover:underline"
          >Konsolidierte Fassung im RIS</ExternalLink
        >
      </SectionCredits>
    </template>
  </div>
</template>

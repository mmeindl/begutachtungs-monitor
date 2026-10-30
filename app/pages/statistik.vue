<script setup lang="ts">
/**
 * The page-view counts, public (docs/architecture.md §12.65). The counting
 * is the one thing the site stores about its visits, so what it stores is
 * shown whole: the same sums the day files hold, per day and per referring
 * host, and nothing the files do not hold.
 *
 * Plain tables in the unfilled frame — figures to consult, not an
 * instrument (box grammar, §8). No chart: thirty rows of four numbers read
 * fine as numbers, and a chart would be the one on the site.
 */
import type { StatistikPayload } from '#shared/types'
import { formatDateDe, formatDateTimeDe, formatDateWeekdayDe, formatNumberDe } from '#shared/utils/format'

usePageSeo({
  title: 'Statistik',
  description:
    'Wie oft die Seiten des Begutachtungs-Monitors aufgerufen werden: Seitenaufrufe je Tag und die Domains, von denen Besuche kommen – gezählt ohne IP-Adressen, Cookies oder Kennungen.',
})

const { data, status, error, refresh } = useFetch<StatistikPayload>('/api/statistik', { lazy: true })
</script>

<template>
  <div class="mx-auto w-full max-w-2xl">
    <h1 class="page-title">
      Statistik
    </h1>
    <p class="mt-4 leading-relaxed text-ink-secondary">
      Der Monitor zählt, wie oft seine Seiten aufgerufen werden, und von
      welchen Domains Besuche kommen – als Summe je Tag, ohne IP-Adresse,
      Cookie oder Kennung. Wer was gelesen hat, lässt sich daraus nicht
      ablesen; wie das gezählt wird, steht unter
      <NuxtLink to="/datenschutz#dse-zaehlung" class="link-inline">Datenschutz</NuxtLink>.
    </p>

    <FetchGate
      :status="status"
      :error="error"
      :data="data"
      loading-label="Zahlen werden geladen …"
      state-class="mt-10"
      @retry="refresh()"
    >
      <template #default="{ data: stats }">
        <ProseSection id="stat-tage" heading="Die letzten 30 Tage" first>
          <p v-if="!stats.seit">
            Noch ist kein Tag gezählt. Die Zahlen erscheinen hier, sobald der
            erste Tag gespeichert ist.
          </p>
          <template v-else>
            <p>
              Gezählt seit {{ formatDateDe(stats.seit) }}:
              <strong class="font-semibold text-ink">{{ formatNumberDe(stats.gesamt.aufrufe) }}
                Seitenaufrufe</strong>,
              dazu {{ formatNumberDe(stats.gesamt.bots) }} Zugriffe von Programmen.
            </p>
            <div class="mt-6 overflow-x-auto rounded-xl border border-hairline">
              <table class="w-full text-sm">
                <caption class="sr-only">
                  Seitenaufrufe je Tag, neuester Tag zuerst
                </caption>
                <thead class="border-b border-hairline text-left text-ink-muted">
                  <tr>
                    <th scope="col" class="px-3 py-2 font-medium">Datum</th>
                    <th scope="col" class="px-3 py-2 text-right font-medium">Gesamt</th>
                    <th scope="col" class="px-3 py-2 text-right font-medium">Entwürfe Bund</th>
                    <th scope="col" class="px-3 py-2 text-right font-medium">Entwürfe Länder</th>
                    <th scope="col" class="px-3 py-2 text-right font-medium">Feed &amp; Kalender</th>
                    <th scope="col" class="px-3 py-2 text-right font-medium">Programme</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-hairline tabular-nums text-ink">
                  <tr v-for="row in stats.tage" :key="row.tag">
                    <th scope="row" class="whitespace-nowrap px-3 py-2 text-left font-normal">
                      {{ formatDateWeekdayDe(row.tag) }}
                    </th>
                    <td class="px-3 py-2 text-right font-medium">{{ formatNumberDe(row.aufrufe) }}</td>
                    <td class="px-3 py-2 text-right">{{ formatNumberDe(row.entwurfBund) }}</td>
                    <td class="px-3 py-2 text-right">{{ formatNumberDe(row.entwurfLand) }}</td>
                    <td class="px-3 py-2 text-right">{{ formatNumberDe(row.feedKalender) }}</td>
                    <td class="px-3 py-2 text-right text-ink-muted">{{ formatNumberDe(row.bots) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p class="text-sm">
              Tage nach UTC. „Gesamt“ umfasst alle Seiten samt Feed und
              Kalender; „Programme“ sind Suchmaschinen, Vorschaudienste und
              andere Software, die sich als solche zu erkennen gibt – sie
              sind in „Gesamt“ nicht enthalten. Der laufende Tag steht mit
              dem Stand der letzten Speicherung<template v-if="stats.stand">
                ({{ formatDateTimeDe(stats.stand) }})</template>.
            </p>
          </template>
        </ProseSection>

        <ProseSection v-if="stats.seit" id="stat-herkunft" heading="Woher Besuche kommen">
          <p>
            Die Domains der Seiten, über deren Links Besuche der letzten 30
            Tage kamen – nur die Domain, ohne Pfad. Besuche ohne solche
            Angabe, etwa über ein Lesezeichen oder eine App, fehlen hier.
          </p>
          <p v-if="!stats.herkunft.length">
            Bisher ist keine verweisende Domain gezählt.
          </p>
          <div v-else class="mt-6 overflow-x-auto rounded-xl border border-hairline">
            <table class="w-full text-sm">
              <caption class="sr-only">
                Die häufigsten verweisenden Domains der letzten 30 Tage
              </caption>
              <thead class="border-b border-hairline text-left text-ink-muted">
                <tr>
                  <th scope="col" class="px-3 py-2 font-medium">Domain</th>
                  <th scope="col" class="px-3 py-2 text-right font-medium">Besuche</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-hairline tabular-nums text-ink">
                <tr v-for="row in stats.herkunft" :key="row.host">
                  <th scope="row" class="break-all px-3 py-2 text-left font-normal">{{ row.host }}</th>
                  <td class="px-3 py-2 text-right">{{ formatNumberDe(row.aufrufe) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </ProseSection>

        <ProseSection id="stat-grenzen" heading="Was die Zahlen nicht sagen">
          <ul>
            <li>
              Seitenaufrufe sind keine Personen: Wer drei Entwürfe liest,
              zählt dreimal, wer zweimal kommt, ebenso.
            </li>
            <li>
              Gezählt wird jede Seite, die der Server ausliefert. Wer
              innerhalb des Monitors weiterklickt, lädt die nächste Seite
              meist nicht neu – diese Klicks fehlen in den Zahlen.
            </li>
            <li>
              Feed und Kalender zählen Abrufe, nicht Abonnements: Ein
              Feedreader fragt mehrmals am Tag nach. Wie viele Menschen
              abonniert haben, bleibt unbekannt.
            </li>
            <li>
              Nicht jedes Programm gibt sich zu erkennen; ein Teil der
              Seitenaufrufe kann deshalb trotzdem von Software stammen.
            </li>
          </ul>
        </ProseSection>
      </template>
    </FetchGate>
  </div>
</template>

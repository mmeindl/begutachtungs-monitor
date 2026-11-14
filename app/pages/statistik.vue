<script setup lang="ts">
/**
 * The page-view counts, public. The counting
 * is the one thing the site stores about its visits, so what it stores is
 * shown whole: the same sums the day files hold, per day and per referring
 * host, and nothing the files do not hold.
 *
 * Plain tables in the unfilled frame — figures to consult, not an
 * instrument (box grammar).
 *
 * EVERY DAY SINCE COUNTING BEGAN, in every section (14.11.2026); until
 * then the last 30 days. With the window open-ended the day table grows by
 * a row a day, so the page views stand as a chart above it
 * (`StatistikChart`), and the table opens on two weeks — this one against
 * the last — with the rest behind `ListMore`. A host still needs
 * `HERKUNFT_MINDESTENS` visits, now summed over the longer window; kept
 * at five on purpose, to be raised once a private page shows up.
 */
import type { StatistikPayload } from '#shared/types'
import { formatDateDe, formatDateTimeDe, formatDateWeekdayDe, formatNumberDe } from '#shared/utils/format'

usePageSeo({
  title: 'Statistik',
  description:
    'Wie oft die Seiten des Begutachtungs-Monitors aufgerufen werden: Seitenaufrufe je Tag und die Domains, von denen Besuche kommen – gezählt ohne IP-Adressen, Cookies oder Kennungen.',
})

const { data, status, error, refresh } = useFetch<StatistikPayload>('/api/statistik', { lazy: true })

/** Two weeks stand, so this week reads against the one before it; the rest behind `ListMore`. */
const TAGE_STEP = 14
const tage = usePagedList(() => data.value?.tage ?? [], TAGE_STEP, [])

/** Names for the page classes of `server/utils/zaehlung/klassen.ts`. */
const KLASSE_NAME: Record<string, string> = {
  start: 'Startseite',
  entwuerfe: 'Liste der Entwürfe',
  'entwurf-bund': 'Entwürfe des Bundes',
  'entwurf-land': 'Entwürfe der Länder',
  // Counted on their own since 14.11.2026; before, under „Andere Seiten".
  'vorlage-bund': 'Vorlagen und Anträge ohne Entwurf (seit 14.11.2026)',
  'eu-recht': 'EU-Recht',
  wege: 'Wege',
  datenlage: 'Datenlage',
  'so-funktionierts': 'So funktioniert’s (bis 14.11.2026)',
  ueber: 'Über',
  impressum: 'Impressum',
  datenschutz: 'Datenschutz',
  statistik: 'Statistik',
  sonstige: 'Andere Seiten',
  feed: 'RSS-Feed (feed.xml)',
  kalender: 'Fristen-Kalender (kalender.ics)',
  'frist-kalender': 'Frist eines Entwurfs (.ics)',
}
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
        <ProseSection id="stat-tage" heading="Seitenaufrufe je Tag" first>
          <p v-if="!stats.seit">
            Noch ist kein voller Tag gezählt. Die Zahlen erscheinen hier ab
            dem Tag nach dem Beginn der Zählung.
          </p>
          <template v-else>
            <p>
              Gezählt seit {{ formatDateDe(stats.seit) }}:
              <strong class="font-semibold text-ink">{{ formatNumberDe(stats.gesamt.seiten) }}
                Seitenaufrufe</strong>,
              dazu {{ formatNumberDe(stats.gesamt.feedKalender) }} Abrufe von
              Abonnements und {{ formatNumberDe(stats.gesamt.bots) }} Zugriffe von Programmen.
            </p>
            <StatistikChart :tage="stats.tage" class="mt-6" />
            <!-- The frame clips, the table scrolls inside it, so the pager
                 at the foot stays put while a narrow screen scrolls the
                 columns. -->
            <div class="mt-4 overflow-clip rounded-xl border border-hairline">
              <div class="overflow-x-auto">
                <table class="w-full text-sm">
                  <caption class="sr-only">
                    Seitenaufrufe je Tag, neuester Tag zuerst
                  </caption>
                  <thead class="border-b border-hairline text-left text-ink-muted">
                    <tr>
                      <th scope="col" class="px-3 py-2 font-medium">Datum</th>
                      <th scope="col" class="px-3 py-2 text-right font-medium">Seitenaufrufe</th>
                      <th scope="col" class="px-3 py-2 text-right font-medium">Abonnements</th>
                      <th scope="col" class="px-3 py-2 text-right font-medium">Programme</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-hairline tabular-nums text-ink">
                    <tr v-for="row in tage.shown.value" :key="row.tag">
                      <th scope="row" class="whitespace-nowrap px-3 py-2 text-left font-normal">
                        {{ formatDateWeekdayDe(row.tag) }}
                      </th>
                      <td class="px-3 py-2 text-right font-medium">{{ formatNumberDe(row.seiten) }}</td>
                      <td class="px-3 py-2 text-right">{{ formatNumberDe(row.feedKalender) }}</td>
                      <td class="px-3 py-2 text-right text-ink-muted">{{ formatNumberDe(row.bots) }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <ListMore
                :visible="tage.visible.value"
                :total="stats.tage.length"
                :step="TAGE_STEP"
                @more="tage.more()"
                @all="tage.all()"
              />
            </div>
            <p class="text-sm">
              Tage nach UTC. Der Tag, an dem die Zählung begann, fehlt in
              allen Zahlen dieser Seite: Sie begann im Lauf des Tages, er ist
              nur zum Teil gezählt. „Abonnements“ sind Abrufe des RSS-Feeds und
              der Kalenderdateien, die Feedreader und Kalender-Apps von sich
              aus in festen Abständen stellen – sie sind keine Seitenaufrufe
              und darin nicht enthalten. „Programme“ sind Suchmaschinen, Vorschaudienste und
              andere Software, die sich als solche zu erkennen gibt; auch sie
              zählen in keiner der beiden anderen Spalten. Der laufende Tag steht mit
              dem Stand der letzten Speicherung<template v-if="stats.stand">
                ({{ formatDateTimeDe(stats.stand) }})</template>.
            </p>
          </template>
        </ProseSection>

        <ProseSection v-if="stats.seit" id="stat-seiten" heading="Was aufgerufen wird">
          <p>
            Seit Beginn der Zählung nach Art der Seite, darunter die Abrufe des
            Feeds und der Kalenderdateien. Gezählt wird die Art, nicht die
            Adresse: welcher Entwurf gelesen wurde, steht nirgends.
          </p>
          <div
            v-for="(tabelle, i) in [
              { kopf: 'Seite', zahl: 'Aufrufe', caption: 'Seitenaufrufe seit Beginn der Zählung nach Art der Seite', zeilen: stats.nachSeite },
              { kopf: 'Abonnement', zahl: 'Abrufe', caption: 'Abrufe von Feed und Kalenderdateien seit Beginn der Zählung', zeilen: stats.nachAbo },
            ]"
            :key="tabelle.kopf"
            class="overflow-x-auto rounded-xl border border-hairline"
            :class="i ? 'mt-4' : 'mt-6'"
          >
            <table class="w-full text-sm">
              <caption class="sr-only">
                {{ tabelle.caption }}
              </caption>
              <thead class="border-b border-hairline text-left text-ink-muted">
                <tr>
                  <th scope="col" class="px-3 py-2 font-medium">{{ tabelle.kopf }}</th>
                  <th scope="col" class="px-3 py-2 text-right font-medium">{{ tabelle.zahl }}</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-hairline tabular-nums text-ink">
                <tr v-for="row in tabelle.zeilen" :key="row.klasse">
                  <th scope="row" class="px-3 py-2 text-left font-normal">{{ KLASSE_NAME[row.klasse] ?? row.klasse }}</th>
                  <td class="px-3 py-2 text-right">{{ formatNumberDe(row.aufrufe) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </ProseSection>

        <ProseSection v-if="stats.seit" id="stat-herkunft" heading="Woher Besuche kommen">
          <p>
            Die Domains der Seiten, über deren Links Besuche seit Beginn der
            Zählung kamen – nur die Domain, ohne Pfad, und erst ab fünf Besuchen,
            damit ein einzelner Link von einer privaten Seite nicht hier
            erscheint. Besuche ohne solche
            Angabe, etwa über ein Lesezeichen oder eine App, fehlen hier.
          </p>
          <p v-if="!stats.herkunft.length">
            Bisher ist keine verweisende Domain gezählt.
          </p>
          <div v-else class="mt-6 overflow-x-auto rounded-xl border border-hairline">
            <table class="w-full text-sm">
              <caption class="sr-only">
                Die häufigsten verweisenden Domains seit Beginn der Zählung
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
              Abonnements zählen Abrufe, nicht Abonnentinnen und Abonnenten:
              Ein Feedreader oder Kalender fragt mehrmals am Tag nach. Wie
              viele Menschen abonniert haben, bleibt unbekannt.
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

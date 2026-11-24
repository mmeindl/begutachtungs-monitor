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
import { ANLIEGEN_SECTION_DE } from '#shared/utils/anliegen'
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
  'vorlage-bund': 'Vorlagen und Anträge ohne Entwurf',
  // Counted on their own since 15.11.2026; before, under „Andere Seiten".
  anliegen: `Liste der ${ANLIEGEN_SECTION_DE}`,
  'anliegen-gegenstand': 'Petitionen, Bürgerinitiativen, Volksbegehren und Petitionen an den Bundesrat',
  'eu-recht': 'EU-Recht',
  // Counted on their own since 15.11.2026.
  'eu-initiative': 'Vorhaben der EU-Kommission',
  'eu-vorschlag': 'Vorschläge der EU-Kommission',
  'eu-buergerinitiative': 'Europäische Bürgerinitiativen',
  wege: 'Wege',
  // Counted on its own since 16.11.2026; before, the EU's ways stood on `/wege`.
  'eu-wege': 'Wege der Gesetzgebung in der EU',
  datenlage: 'Datenlage',
  // Counted since 19.11.2026, the day the page was made.
  genauigkeit: 'Genauigkeit',
  // A page of its own since 16.11.2026; before, a section of the Impressum.
  quellen: 'Quellen & Lizenzen',
  // Counted since 17.11.2026; before, `/suche` redirected and was not counted.
  suche: 'Suche',
  // A page until 14.11.2026; its counts stay, the row stands in the lighter gray.
  'so-funktionierts': 'So funktioniert’s',
  ueber: 'Über',
  impressum: 'Impressum',
  datenschutz: 'Datenschutz',
  statistik: 'Statistik',
  sonstige: 'Andere Seiten',
  feed: 'RSS-Feed (feed.xml)',
  kalender: 'Fristen-Kalender (kalender.ics)',
  'frist-kalender': 'Frist eines Entwurfs (.ics)',
}

/**
 * Page classes whose pages no longer exist. Their counts stay in the sums,
 * the row stands in the muted gray; when each class was counted lives in
 * the comments above, not on the page.
 */
const KLASSE_ENTFALLEN = new Set(['so-funktionierts'])
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
      <NuxtLink to="/datenschutz#zaehlung" class="link-inline">Datenschutz</NuxtLink>.
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
        <ProseSection id="tage" heading="Seitenaufrufe je Tag" first>
          <p v-if="!stats.seit">
            Noch ist kein voller Tag gezählt. Die Zahlen erscheinen hier ab
            dem Tag nach dem Beginn der Zählung.
          </p>
          <template v-else>
            <p>
              Gezählt {{ stats.stand
                ? `vom ${formatDateDe(stats.seit)} bis ${formatDateTimeDe(stats.stand)} Uhr`
                : `seit ${formatDateDe(stats.seit)}` }}:
              <strong class="font-semibold text-ink">{{ formatNumberDe(stats.gesamt.seiten) }}
                Seitenaufrufe</strong>,
              dazu {{ formatNumberDe(stats.gesamt.feedKalender) }} Abrufe von
              Abonnements (RSS-Feed und Kalender) und
              {{ formatNumberDe(stats.gesamt.bots) }} Zugriffe von Programmen
              wie Suchmaschinen.
            </p>
            <p>
              Das sind keine Personen: Wer wiederkommt, zählt erneut, und ein
              Feedreader fragt mehrmals am Tag nach. Klicks innerhalb des
              Monitors fehlen meist, und nicht jedes Programm gibt sich zu
              erkennen, ein Teil der Seitenaufrufe kann also von Software
              stammen.
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
          </template>
        </ProseSection>

        <ProseSection v-if="stats.seit" id="seiten" heading="Was aufgerufen wird">
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
                <tr
                  v-for="row in tabelle.zeilen"
                  :key="row.klasse"
                  :class="KLASSE_ENTFALLEN.has(row.klasse) && 'text-ink-muted'"
                >
                  <th scope="row" class="px-3 py-2 text-left font-normal">
                    {{ KLASSE_NAME[row.klasse] ?? row.klasse }}<span
                      v-if="KLASSE_ENTFALLEN.has(row.klasse)"
                      class="sr-only"
                    > (gibt es nicht mehr)</span>
                  </th>
                  <td class="px-3 py-2 text-right">{{ formatNumberDe(row.aufrufe) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </ProseSection>

        <ProseSection v-if="stats.seit" id="herkunft" heading="Woher Besuche kommen">
          <p>
            Domains erscheinen ab fünf Besuchen, damit ein einzelner Link von
            einer privaten Seite hier nicht auftaucht. Gezählt sind nur Besuche
            über einen Link: Wer über ein Lesezeichen oder eine App kommt, fehlt
            hier.
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
      </template>
    </FetchGate>
  </div>
</template>

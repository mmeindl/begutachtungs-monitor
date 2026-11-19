<script setup lang="ts">
/**
 * Genauigkeit (19.11.2026): how each comparison of the monitor is checked,
 * how often the check holds, and which faults it does not catch. The
 * figures and their sentences are `shared/utils/genauigkeit.ts`, the figures
 * themselves `shared/data/genauigkeit.json`, written by a measurement round
 * (`scripts/harness/genauigkeit.ts`); this page only lays them out.
 *
 * ONE JOB (docs/decisions.md, „Each of the prose pages has one job"):
 * `/datenlage` says what a source publishes, this page what the monitor
 * makes of it. The short „Methode" at each comparison stays where it is —
 * it is about that document — and links here for the measurement.
 *
 * FOUR PARTS, from the mechanism to the limits: one real § through every
 * step, each step with where an error can come in; per kind of comparison
 * what it is held against, what was measured, and what the check does not
 * catch; what becomes of every § the drafts change; and how it is measured.
 * The last row of each kind is the reason the page exists: a reader who
 * knows where the check is blind knows where to look twice.
 */
import { formatDateDe, formatNumberDe } from '#shared/utils/format'
import {
  GENAUIGKEIT,
  GENAUIGKEIT_CODE_BASE,
  GENAUIGKEIT_GRENZEN,
  GENAUIGKEIT_INSTRUMENTE,
  GENAUIGKEIT_ROW_DE,
  commitUrl,
  funnelRows,
  genauigkeitArten,
  measuredLineDe,
  type GenauigkeitArt,
} from '#shared/utils/genauigkeit'

usePageSeo({
  title: 'Wie genau der Monitor vergleicht',
  description:
    'Wogegen der Begutachtungs-Monitor seine Textvergleiche prüft, wie oft sie an kundgemachten Gesetzen stimmen, welche Fehler die Prüfungen fangen und welche nicht.',
})

const arten = genauigkeitArten()
const funnel = GENAUIGKEIT.lesefassung.funnel
const risOnly = GENAUIGKEIT.lesefassung.risOnly
const rows = funnelRows()

/** The rows of one kind, in the page's order; a row with nothing to say is left out. */
function rowsOf(art: GenauigkeitArt): { key: keyof typeof GENAUIGKEIT_ROW_DE; lines: string[] }[] {
  return ([
    { key: 'where', lines: [art.where] },
    { key: 'against', lines: [art.against] },
    { key: 'measured', lines: art.measured },
    { key: 'injected', lines: art.injected },
    { key: 'missed', lines: art.missed },
  ] as const).filter((r) => r.lines.length).map((r) => ({ key: r.key, lines: [...r.lines] }))
}
</script>

<template>
  <div class="mx-auto w-full max-w-2xl">
    <h1 class="page-title">
      Wie genau der Monitor vergleicht
    </h1>
    <p class="mt-3 leading-relaxed text-ink-secondary">
      Der Monitor zeigt eine Änderung nur, wenn er sie prüfen konnte. Hier
      steht, wogegen er prüft, wie oft das stimmt – und welche Fehler die
      Prüfung nicht fängt.
    </p>
    <p class="mt-2 text-sm text-ink-secondary">
      {{ measuredLineDe() }}
    </p>

    <ProseSection id="weg" heading="Ein Paragraph auf dem Weg" first>
      <p>
        Am Beispiel des ganzen Paragraphen danach, wie der Monitor ihn aus
        drei Teilen zusammensetzt. An jedem Schritt steht, wo ein Fehler
        hineinkommen kann und was der Monitor dann tut.
      </p>
      <GenauigkeitWeg />
    </ProseSection>

    <ProseSection id="pruefungen" heading="Was geprüft wird, und wie gut">
      <p>
        Jede Art von Vergleich hat ihre eigene Prüfung. Gemessen wird an
        Fällen, deren richtiges Ergebnis feststeht, und mit Fehlern, die wir
        absichtlich einbauen.
      </p>
      <div class="mt-6 space-y-10">
        <section
          v-for="art in arten"
          :id="art.id"
          :key="art.id"
          :aria-labelledby="`${art.id}-heading`"
          class="scroll-mt-6"
        >
          <h3 :id="`${art.id}-heading`" class="text-lg font-semibold text-ink">{{ art.heading }}</h3>
          <dl class="mt-3 divide-y divide-hairline border-y border-hairline text-sm">
            <div
              v-for="row in rowsOf(art)"
              :key="row.key"
              class="py-2 sm:grid sm:grid-cols-[11rem_1fr] sm:gap-x-4"
            >
              <dt class="text-ink-secondary">{{ GENAUIGKEIT_ROW_DE[row.key] }}</dt>
              <dd class="mt-0.5 space-y-1.5 sm:mt-0">
                <p v-for="(line, i) in row.lines" :key="i" class="text-ink">{{ line }}</p>
              </dd>
            </div>
          </dl>
        </section>
      </div>
    </ProseSection>

    <ProseSection id="gezeigt" heading="Was gezeigt wird und was nicht">
      <p>
        Von {{ formatNumberDe(funnel.changed) }} Paragraphen, die die
        {{ formatNumberDe(funnel.drafts) }} Ministerialentwürfe der
        {{ GENAUIGKEIT.gp }}. Gesetzgebungsperiode ändern, zeigt der Monitor
        {{ formatNumberDe(funnel.shown) }} als ganzen Paragraphen danach. Bei
        jedem anderen steht am Paragraphen, warum nicht – hier mit dem Satz,
        der dort steht.
      </p>
      <figure>
        <GenauigkeitBalken :rows="rows" :total="funnel.changed" />
        <figcaption class="sr-only">
          Was aus {{ formatNumberDe(funnel.changed) }} geänderten Paragraphen wird, nach Grund.
        </figcaption>
      </figure>
      <p class="mt-6">
        Fehlt der ganze Paragraph danach, heißt das nie, dass er gleich
        bleibt: Was der Entwurf an ihm ändert, zeigt die
        Textgegenüberstellung darüber, soweit sie es abdruckt.
      </p>
      <p>
        Bei den Entwürfen, die nur im RIS stehen, meist Verordnungen, sind es
        {{ formatNumberDe(risOnly.shown) }} von {{ formatNumberDe(risOnly.changed) }}
        geänderten Paragraphen in {{ formatNumberDe(risOnly.drafts) }} Entwürfen.
      </p>
    </ProseSection>

    <ProseSection id="messen" heading="Wie gemessen wird">
      <p>
        Jede Zahl auf dieser Seite stammt aus einem Messprogramm, das mit dem
        Quellcode veröffentlicht ist. Gemessen wird nach Änderungen am
        Vergleich; die Zahlen hier sind vom {{ formatDateDe(GENAUIGKEIT.date) }},
        mit dem Programmstand
        <ExternalLink :href="commitUrl()" class="link-inline">{{ GENAUIGKEIT.commit.slice(0, 7) }}</ExternalLink>.
      </p>
      <dl class="mt-4 divide-y divide-hairline border-y border-hairline text-sm">
        <div
          v-for="tool in GENAUIGKEIT_INSTRUMENTE"
          :key="tool.file"
          class="py-2 sm:grid sm:grid-cols-[11rem_1fr] sm:gap-x-4"
        >
          <dt class="text-ink-secondary">{{ tool.name }}</dt>
          <dd class="mt-0.5 sm:mt-0">
            <span class="block text-ink">{{ tool.text }}</span>
            <ExternalLink :href="`${GENAUIGKEIT_CODE_BASE}${tool.file}`" class="link-muted">{{ tool.file }}</ExternalLink>
          </dd>
        </div>
      </dl>
    </ProseSection>

    <ProseSection id="grenzen" heading="Was die Zahlen nicht sagen">
      <ul>
        <li v-for="line in GENAUIGKEIT_GRENZEN" :key="line">{{ line }}</li>
      </ul>
      <p>
        Wer trotzdem einen Fehler findet: Unter jedem Vergleich steht
        „Fehler melden“, und jeder Hinweis hilft. Wie sich der Monitor
        sonst erreichen lässt, steht unter
        <NuxtLink to="/ueber#about-contact" class="link-inline">Kontakt</NuxtLink>.
        Was die Quellen selbst veröffentlichen, steht unter
        <NuxtLink to="/datenlage" class="link-inline">Datenlage</NuxtLink>.
      </p>
    </ProseSection>
  </div>
</template>

<script setup lang="ts">
import type { EntryView } from '#shared/utils/entryView'

/**
 * Eine Liste von Einträgen, zwei Dichten, ein Spaltenkopf — jede Liste der
 * Seite (docs/architecture.md §12.28).
 *
 * `EntryItem` regelt, was IN einer Zeile steht; diese Komponente regelt, was
 * eine Liste von Zeilen ist: Karten unter `md`, ab `md` ein Blatt mit
 * Spaltenkopf und Trennlinien. Rein per CSS umgeschaltet, ohne JS und ohne
 * Client-Hook — beide Fassungen stehen im SSR-HTML, wie vorher.
 *
 * SEIT 18.09.2026 GILT DAS AUCH FÜR DIE STARTSEITE. Vorher stand der
 * Spaltenkopf nur auf `/entwuerfe`, mit dem Argument: über fünf Karten sei
 * er mehr Gerüst als Inhalt. Das Argument zählte die Zeilen und übersah, was
 * der Kopf tut — er ist die Bedingung dafür, dass die Zellen ihre
 * Einheitswörter ablegen dürfen, und erst ohne sie fluchten die Ziffern. Die
 * Startseite ist außerdem die Seite, auf der VIER Listen untereinander
 * stehen: was dort in derselben Spalte steht, muss über die Abschnitte
 * hinweg an derselben Kante stehen, sonst vergleicht man 846 gegen 12 über
 * eine Abschnittsgrenze hinweg im Blindflug. Ein Kopf je Abschnitt kostet
 * 29 px und macht aus vier Listen eine Anatomie.
 *
 * DER SLOT `evidence` ist die eine Ausnahme von „eine Zeile sagt über den
 * Entwurf, was es über ihn gibt": Er trägt den Grund, warum die Zeile
 * DASTEHT — die Fundstelle eines Volltext-Treffers (§12.31). Er wird an
 * beide Dichten durchgereicht und pro Eintrag ausgewertet, weil in einer
 * gemischten Liste nur ein Teil der Zeilen einen Beleg hat.
 *
 * Der Titel steht in beiden Dichten ganz da und bricht um, so oft er muss —
 * die dichte Zeile kürzte bis zum selben Tag auf eine Zeile. Die Zeilenhöhe
 * schwankt dadurch; die Messung und die Abwägung stehen in `EntryItem`,
 * Zone 1.
 */
defineProps<{
  entries: EntryView[]
  /**
   * `ol` statt `ul`: nur dort, wo die REIHENFOLGE selbst die Aussage ist
   * (die Reihung nach Stellungnahmen). Eine Fristenliste ist sortiert, nicht
   * gereiht — das ist ein Anzeigezustand, keine Bedeutung.
   */
  ordered?: boolean
  /**
   * Die Überschrift der ersten Spalte. „Entwurf" überall außer dort, wo die
   * Zeilen keine sind: der Abschnitt „Zweite Runde" listet
   * Regierungsvorlagen, und ein Kopf, der sie „Entwurf" nennt, wäre die eine
   * Stelle, an der das Gerüst dem Inhalt widerspricht.
   */
  lead?: string
}>()
</script>

<template>
  <div>
    <!-- Karten bis `md`: genug Breite pro Zeile, zwei Titelzeilen, und jede
         Zelle trägt ihr Einheitswort selbst — es gibt hier keinen Kopf, der
         es für sie sagen könnte. -->
    <component :is="ordered ? 'ol' : 'ul'" class="space-y-3 md:hidden">
      <li v-for="entry in entries" :key="entry.key">
        <EntryItem :entry="entry" density="card">
          <template v-if="$slots.evidence" #evidence>
            <slot name="evidence" :entry="entry" />
          </template>
        </EntryItem>
      </li>
    </component>

    <!-- Ab `md` ein Blatt: eine Tabelle benennt ihre Spalten einmal.
         `aria-hidden`, weil die Zeilen darunter Links sind und keine
         Tabellenzellen — der Kopf ist eine Sehhilfe, die Vorlesereihenfolge
         steht in der Zeile selbst. -->
    <div
      class="hidden overflow-hidden rounded-xl border border-hairline bg-surface md:block"
    >
      <div
        aria-hidden="true"
        class="flex items-center gap-4 border-b border-hairline px-4 py-2 text-xs font-medium uppercase tracking-wide text-ink-muted"
      >
        <span class="min-w-0 flex-1">{{ lead ?? 'Entwurf' }}</span>
        <span class="entry-col-count">Stellungnahmen</span>
        <span class="entry-col-state">Stand</span>
      </div>
      <component :is="ordered ? 'ol' : 'ul'" class="divide-y divide-hairline">
        <li v-for="entry in entries" :key="entry.key">
          <EntryItem :entry="entry" density="row">
            <template v-if="$slots.evidence" #evidence>
              <slot name="evidence" :entry="entry" />
            </template>
          </EntryItem>
        </li>
      </component>
    </div>
  </div>
</template>

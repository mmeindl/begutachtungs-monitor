<script setup lang="ts">
/**
 * The credit line at the foot of a section: who published what it shows,
 * the links to those documents — and last, that the marking is ours.
 *
 * Why at the foot: a source statement stands below the table, not above it —
 * it is looked up while or after reading, never before. Since 18.09.2026 it
 * is the only thing down here: a legend for „redaktionell" stood beside it
 * briefly and is gone again — a term that reads the same on every page
 * belongs on the page that explains it, not under every comparison.
 *
 * No licence since 01.10.2026: the line names who published what it shows
 * („Quelle: RIS"; where it mixes publishers, „Quellen:" and each item names
 * its own), and what may be claimed about each source stands once, in the
 * Impressum, which the footer of every page links. The same claim under
 * every section was four wordings and up to five repetitions; one line in
 * one grammar is what a reader scans. The pattern is the data-journalism
 * caption — „Quelle: … · Grafik: …".
 *
 * „Markierung" is rendered by the component itself and always last: other
 * people's things first, our own after — and the sentence is the same in every
 * section because none of them writes it. It answers the question a
 * red/green marked ministry text raises: who did the marking? A section that
 * prints a text unmarked says `marked: false`.
 *
 * „Zeilenzuordnung" stands before it where the section paired the rows
 * itself — a Textgegenüberstellung read from the PDF, which RIS publishes
 * only as an image (02.10.2026). The same grammar for the same kind of
 * claim: the pairing is ours, as the marking is, and may be wrong; the
 * method page says how. It replaced the caveat over the comparison. Where
 * both claims are ours they merge into one item, „Zeilenzuordnung und
 * Markierung" (03.10.2026): two adjacent „…: Begutachtungs-Monitor" said the
 * same authorship twice.
 *
 * „Methode" closes the line since 02.10.2026, after the marking it explains —
 * where the caption convention puts it („Daten & Methodik"). It stood above
 * as „Wie wir vergleichen" and „Wie wir prüfen", once per section: the
 * licence's pattern again, one claim in several wordings. The component
 * writes the word; the section gives the text.
 *
 * Since 14.11.2026 „Methode" opens its text in place, beneath the line at
 * prose width (`#method`, a component from `app/components/method/`), instead
 * of linking to /so-funktionierts, which is being dissolved. The `method`
 * anchor prop still links for the sections not yet moved; a section that
 * gives the slot needs no anchor. That also revises the 18.09.2026 rule
 * above: a term's definition now stands at the tag (`TermNote`), because the
 * reader meets the term there, and the method page it pointed to is going.
 *
 * `own` names anything else on the box that is ours rather than the
 * publisher's (02.10.2026): a station frame shows Parliament's facts beside
 * figures we compute from them, the Frist median or the count of rewritten
 * paragraphs, and „Quelle: Parlament" alone would claim those for Parliament.
 * Same grammar as the marking, in the same place: after the other people's things.
 *
 * „Fehler melden" ends the line wherever it names a claim of ours
 * (17.11.2026): the marking, the pairing, a count, the classification of
 * who filed. The line has just said that this part is the monitor's and
 * may therefore be wrong; the place to say so is beside it, not on another
 * page. A line that only credits publishers gets none: an error in a
 * source's own data is not ours to correct. The component writes it, as it
 * writes „Markierung", so no section can forget it. It opens a mail that
 * already names the page and the claim (`app/utils/contact.ts`). After
 * „Methode": whoever doubts the marking reads how it was made first. Muted
 * and not blue-filled, because blue buttons are the doors into lawmaking
 * and this is a note to the monitor.
 *
 * It opens in place, as „Methode" does, and is not itself the mail link
 * (17.11.2026, the same day): on a machine whose browser has no mail
 * program behind `mailto:` a click on the bare link did nothing at all, and
 * said nothing. So the words open one sentence, „Hinweis an" and the
 * address written out, which is the link; whoever's link opens nothing
 * reads the address. A second sentence explaining the link and a copy
 * button stood there briefly and were taken out again as over-explaining.
 */
import { sourceLineDe, type SourceEntry } from '#shared/utils/provenance'
import { REPORT_LABEL_DE, REPORT_LEAD_DE } from '~/utils/contact'

const props = withDefaults(defineProps<{
  sources: readonly SourceEntry[]
  marked?: boolean
  /** The section paired the rows itself (`readFrom: 'pdf'`). */
  paired?: boolean
  /** What else on the box is ours, e.g. „Zählung" → „Zählung: Begutachtungs-Monitor". */
  own?: string
  /** The section's anchor on the method page, e.g. `/so-funktionierts#vergleich`;
   *  superseded by the `#method` slot, kept until every section has moved. */
  method?: string
}>(), { marked: true })

defineSlots<{
  /** Other people's documents, between the source line and our claims. */
  default?: () => unknown
  /** The section's method text; „Methode" opens it beneath the line. */
  method?: () => unknown
}>()

const line = computed(() => sourceLineDe(props.sources))

/** What the line calls ours, in the line's own words; none, no report link. */
const claim = computed(() => {
  const claims: string[] = []
  if (props.own) claims.push(props.own)
  if (props.paired && props.marked) claims.push('Zeilenzuordnung und Markierung')
  else if (props.paired) claims.push('Zeilenzuordnung')
  else if (props.marked) claims.push('Markierung')
  return claims.join(', ')
})
const { email, reportHref } = useContact()

/**
 * „Methode" and „Fehler melden" share a `name`, so the browser keeps one of
 * the two open (17.11.2026): both open stacked two grey rules in two text
 * sizes, the one-line hint hanging under a method text it does not belong
 * to. Native (`<details name>`), no script; a browser that does not know
 * the attribute leaves both open, as before. One id per credit line: a page
 * has several, and they must not close each other.
 */
const group = useId()
</script>

<template>
  <div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
    <span v-if="line">{{ line }}</span>
    <slot />
    <span v-if="paired && !marked">Zeilenzuordnung: Begutachtungs-Monitor</span>
    <span v-if="own">{{ own }}: Begutachtungs-Monitor</span>
    <span v-if="paired && marked">Zeilenzuordnung und Markierung: Begutachtungs-Monitor</span>
    <span v-else-if="marked">Markierung: Begutachtungs-Monitor</span>
    <!-- The last item of the line, its text on a line of its own under it
         (`TermNote`): running text at prose width, in the prose pages' type,
         not the caption's. -->
    <TermNote v-if="$slots.method" :name="group">
      Methode
      <template #note>
        <div class="prose-flow text-base">
          <slot name="method" />
        </div>
      </template>
    </TermNote>
    <NuxtLink v-else-if="method" :to="method" class="link-muted">Methode</NuxtLink>
    <TermNote v-if="claim" :name="group">
      {{ REPORT_LABEL_DE }}
      <template #note>
        <p class="text-sm leading-relaxed text-ink-secondary">
          {{ REPORT_LEAD_DE }}
          <a :href="reportHref(claim)" class="link-inline">{{ email }}</a>
        </p>
      </template>
    </TermNote>
  </div>
</template>

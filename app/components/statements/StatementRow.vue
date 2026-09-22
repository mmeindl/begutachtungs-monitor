<script setup lang="ts">
/**
 * One row of the statements panel, in the grammar every list in it shares:
 * date · identity · citation(s) · Zustimmungen.
 *
 * All three lists (the organisations, the statements of one organisation
 * that filed several times, and the raw item list) describe the same
 * upstream object and differ only in the identity — an organisation's name,
 * or the fixed label for persons and non-public submissions, never a
 * person's name (GDPR).
 *
 * A GRID, not a flex row with fixed widths: the two right-hand tracks are
 * fixed and the identity track absorbs the slack, so every row that shares
 * a right edge shares its columns — including the indented sub-rows, which
 * used to sit 32px off because the row padding applied twice.
 *
 * The citation carries the link on every row: the submitter is who filed,
 * the citation is the document, and upstream it is the document that has a
 * page. A row standing for several statements of one organisation carries
 * several citations in that one cell.
 */

const props = defineProps<{
  /** ISO date; null renders "–" (upstream ships none for this row). */
  date: string | null
  /** Visible identity: an organisation's name, or a fixed label. */
  label: string
  /**
   * The documents this row points at — one citation ("95/SN-88/ME") on an
   * ordinary row, several when one organisation filed more than once on the
   * same day. The citation is the precise handle, what a reader quotes, and
   * on the anonymous half the only thing telling apart hundreds of rows
   * that all read "Privatperson".
   *
   * `href` is the statement's page upstream, and it is also the only
   * address `StatementDocumentTag` needs: the tag reads the GP/type/number
   * out of it, resolves on approach whether a PDF was uploaded, and links
   * that file directly. Where none was, no tag appears — the text was typed
   * into parliament's web form and sits on this very page. Measured
   * 2026-09-16 on 132/ME: 14 of 60 statements have a PDF, and every
   * organisation in the sample uploaded one.
   */
  links?: { citation: string; href: string }[] | null
  /**
   * Plain-text stand-in for the citation cell, for a row with no single
   * document to point at ("4 Stellungnahmen", listed below the row).
   * Ignored when `links` is set.
   */
  detail?: string | null
  /** Names the submitter in the links' accessible names — organisations only. */
  submitter?: string | null
}>()

/* The visible link text is the citation, so the accessible name adds what
 * the column beside it says: who filed. Never a person's name — `submitter`
 * is passed for organisations only. */
function linkAriaLabel(citation: string): string {
  const who = props.submitter ? ` von ${props.submitter}` : ''
  return `Stellungnahme ${citation}${who} auf parlament.gv.at öffnen`
}
</script>

<template>
  <!-- px-4 because every list that mounts this sits inside the panel's
       bordered surface: the hairlines belong to the <li> and span the full
       width, the content is inset from the border.

       ONE column below the threshold: the identity on its own line, and the
       date, the citation(s) and the Zustimmungen packed into a single meta
       line beneath it. The phone layout before this kept the 6rem date track
       beside the name and spread the line below it to both edges — which
       gave one row three left edges, put the citation under the DATE instead
       of under the name it belongs to, and left a hand's width of nothing
       between the two values that describe the same submission.

       Four columns from row-cols up (main.css: the switch is on the LIST's
       width, not the window's). `contents` dissolves the meta line's wrapper
       there and its three spans become grid cells; the tracks are assigned
       explicitly because the identity comes FIRST in the DOM — it is what
       the row is about, and on a phone it is also the first line — so
       auto-placement would push the date, which sits in the track to its
       left, onto a second row. -->
  <li
    class="grid grid-cols-1 items-baseline gap-x-3 gap-y-1 px-4 py-2.5 row-cols:grid-cols-[6rem_minmax(8rem,1fr)_8.5rem_3.5rem_7.5rem]"
  >
    <!-- Two lines, not one: what distinguishes these submitters sits at the
         END of the name ("Amt der Kärntner Landesregierung; Abteilung 1 –
         Verfassungsdienst"), so a single-line ellipsis cuts away the half a
         reader is looking for — and three lines on a phone, where the column
         is narrow and vertical space is the cheap resource.
         min-w-0: a grid item refuses to shrink below its content otherwise,
         and the clamp never engages.
         Three lines in the columns too, not two: the same argument that took
         this from one line to two takes it to three — "Universität Wien /
         Rechtswissenschaftliche Fakultät; Institut für Strafrecht und…" is
         cut exactly where it stops being distinguishable from the other
         faculty row. Only the names that need the third line take it.
         Empty on the sub-rows of a grouped organisation: from row-cols up
         that cell has to stay, it is what holds the two right-hand tracks in
         their columns — on a phone it would be a blank first line. -->
    <span
      class="min-w-0 overflow-hidden row-cols:col-start-2 row-cols:row-start-1"
      :class="{ 'hidden row-cols:block': !label }"
    >
      <span class="line-clamp-3 text-sm font-medium text-ink">
        {{ label }}
      </span>
    </span>

    <!-- One meta line on a phone, three grid cells from row-cols up. Packed
         at the left, not spread to both edges: date, document and
         Zustimmungen describe the same submission, so they read as one line.
         Gaps and not middots, because this line wraps at 320px and a
         separator at the wrap point dangles at the end of the line — the
         fields are told apart by colour and weight anyway. Same 12px as the
         grid's column gap. -->
    <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm row-cols:contents">
      <!-- The panel's one left edge from row-cols up. Tabular figures in a
           fixed track, so the dates form a column across every list in the
           section. Every row states its own date, the sub-rows of a group
           included — repeated down a column a date is a value the eye skips,
           while a hole in the column is one it has to go and look up. It is
           also what makes the nesting visible in the columns: the sub-rows'
           dates are the only cell that indents. -->
      <span
        class="tabular-nums text-ink-muted row-cols:col-start-1 row-cols:row-start-1"
      >
        {{ formatDateDe(date) }}
      </span>

      <!-- The Stellungnahme carries the link — every row, without exception.
           The submitter is who filed, the citation is the document, and it is
           the document that has a page upstream; linking the name on some
           rows and the citation on others made the same object look like two
           kinds of thing.

           TWO cells, not one: the citation is the handle a reader quotes and
           the address of the official record, the PDF tag is the file, and
           the tag needs a column of its own — appended to the citation it
           started wherever that citation happened to end, so the tags
           staggered down the list instead of forming a column to scan.
           Both point at parlament.gv.at, so both are the reader's to copy
           and cite; nothing on this row routes through us.

           A row can carry several citations (an organisation that filed more
           than once to the same Regierungsvorlage). Both cells stack in the
           same order with the same line box, so citation n and tag n stay on
           one line. -->
      <span
        class="flex flex-col items-start gap-y-1 tabular-nums row-cols:col-start-3 row-cols:row-start-1"
      >
        <!-- The line box belongs to the WRAPPER, never to the link: the link
             carries `tap-target`, whose 44px minimum a `min-h` of its own
             would silently undercut. -->
        <span v-for="link in links ?? []" :key="link.href" class="flex min-h-6 items-center">
          <ExternalLink
            :href="link.href"
            :aria-label="linkAriaLabel(link.citation)"
            class="tap-target font-medium text-accent-deep hover:underline"
          >
            {{ link.citation }}
          </ExternalLink>
        </span>
        <span v-if="!links?.length && detail" class="flex min-h-6 items-center text-ink-muted">{{ detail }}</span>
      </span>

      <!-- The file column. Empty on a row whose statement was typed into
           parliament's web form — there the text is on the page the citation
           already links to, so the gap is the answer, not a missing link. -->
      <span
        class="flex flex-col items-start gap-y-1 row-cols:col-start-4 row-cols:row-start-1"
      >
        <StatementDocumentTag
          v-for="link in links ?? []"
          :key="link.href"
          :page-url="link.href"
          :citation="link.citation"
          :submitter="submitter"
        />
      </span>

      <!-- Rendered even when empty: the reserved track is what holds the
           citation column in place on the rows without Zustimmungen — which
           is most of them. A grouped row prints the organisation's sum here
           and labels it as one; the sub-rows print what upstream counted for
           each Stellungnahme. -->
      <span
        class="tabular-nums text-ink-secondary row-cols:col-start-5 row-cols:row-start-1 row-cols:text-right"
      >
        <slot name="meta" />
      </span>
    </div>

    <!-- Full-width below the row: the per-statement links of a grouped
         organisation. -->
    <div v-if="$slots.default" class="col-span-full">
      <slot />
    </div>
  </li>
</template>

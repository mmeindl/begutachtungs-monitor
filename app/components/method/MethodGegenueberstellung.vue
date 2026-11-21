<!--
  Where „Was ändert der Entwurf?" comes from and how its two columns are
  checked — the „Methode" of `TextComparisonSection`, opened under its credit
  line (14.11.2026; until then /so-funktionierts#gegenueberstellung).

  THE CREDIT LINE IN FULL SENTENCES (18.11.2026). The line above it is the
  method in shorthand: „Quelle: RIS · Textgegenüberstellung des Ministeriums ·
  Markierung: Begutachtungs-Monitor". This text says the same in the same
  order, and each term's heading is the answer itself, so the bold lines
  alone give the method. It was six paragraphs of running text before, with
  the two Rundschreiben that prescribe the annex, the exception for a wording
  an instruction inserts, and a pointer to another section's „Methode": true,
  and nothing a reader needs to read the comparison.

  IT VARIES WITH THE DOCUMENT, because the section stands on four kinds of
  page and the old text was only true on two of them: a draft's annex is the
  ministry's and is checked at the start of the Begutachtungsfrist; a
  Regierungsvorlage without a Begutachtung has the ressort's annex and an
  Antrag the Parlamentsdirektion's working copy, both checked at the day they
  reached Parliament. The line on our own row pairing shows only where this
  comparison was read from the PDF.

  A `<dl>` in the caller's `prose-flow`, which styles terms and spacing.
  „redaktionell" and „nicht geprüft" are not defined here; their pills open
  the definition at the row (`TermNote`, `app/utils/terms.ts`). „nicht
  gezeigt" is: its only pill is a count in the law's header button, and a
  control is never also a disclosure. How the Lesefassung is made opens at
  the Lesefassung (`MethodLesefassung`).
-->
<script setup lang="ts">
import { formatDateDe } from '#shared/utils/format'
import type { Publisher } from '#shared/types'

/** Whose document: a draft's annex, a Vorlage's, Parliament's working copy to an Antrag, or an item's document of neither kind. */
type Kind = 'entwurf' | 'vorlage' | 'parldion' | 'item'

const props = defineProps<{
  kind: Kind
  /** Who published the copy that was read: the credit line's „Quelle: RIS" as a sentence. */
  publisher: Publisher
  /** The day whose RIS text the left column was held against; null where RIS gave none. */
  asOf: string | null
  /** The rows were paired by us, from the PDF's page layout. */
  paired: boolean
}>()

const BOTH_COLUMNS = 'links die geltende Fassung, rechts die vorgeschlagene. Wir übernehmen beide Spalten Wort für Wort.'

const COPY: Record<Kind, { author: string; origin: string; item: string; day: string }> = {
  entwurf: {
    author: 'Der Text ist vom Ministerium',
    origin: `Das Ministerium legt dem Entwurf eine Textgegenüberstellung bei: ${BOTH_COLUMNS}`,
    item: 'des Entwurfs',
    day: 'Beginn der Begutachtungsfrist',
  },
  vorlage: {
    author: 'Der Text ist vom Ministerium',
    origin: `Das Ministerium legt der Regierungsvorlage eine Textgegenüberstellung bei: ${BOTH_COLUMNS}`,
    item: 'der Regierungsvorlage',
    day: 'Einlangen im Parlament',
  },
  parldion: {
    author: 'Der Text ist von der Parlamentsdirektion',
    origin:
      'Sie erstellt zum Antrag ein Arbeitsdokument in drei Spalten: die geltende Fassung, die Anweisungen des Antrags und die Fassung, die sich daraus ergibt. Wir zeigen die erste und die dritte, Wort für Wort.',
    item: 'des Antrags',
    day: 'Einlangen im Parlament',
  },
  item: {
    author: 'Der Text ist nicht von uns',
    origin: `Er stammt aus der Textgegenüberstellung, die dem Antrag beiliegt: ${BOTH_COLUMNS}`,
    item: 'des Antrags',
    day: 'Einlangen im Parlament',
  },
}

/** Where the copy that was read stands; EUR-Lex publishes no annex. */
const PUBLISHED: Partial<Record<Publisher, string>> = {
  ris: 'Veröffentlicht ist sie im Rechtsinformationssystem des Bundes (RIS).',
  parlament: 'Veröffentlicht ist sie auf der Website des Parlaments.',
}

const copy = computed(() => COPY[props.kind])
</script>

<template>
  <dl>
    <div>
      <dt>{{ copy.author }}</dt>
      <dd>{{ copy.origin }} {{ PUBLISHED[publisher] }}</dd>
    </div>
    <div>
      <dt>Die Markierung ist von uns</dt>
      <dd>
        Wir vergleichen die beiden Fassungen Wort für Wort und heben hervor,
        was wegfällt und was dazukommt.
      </dd>
    </div>
    <div>
      <dt>Geprüft gegen das geltende Recht im RIS</dt>
      <!-- A new § has no left column, and rule 2 is the only check it can
           get (20.11.2026); a § a check could not reach is shown, marked. -->
      <dd>
        Ohne Vorbehalt zeigen wir einen Paragraphen nur, wenn diese Dinge stimmen:
        <ul>
          <li>
            Die linke Spalte entspricht dem Gesetzestext im RIS, wie er am
            {{ asOf ? formatDateDe(asOf) : 'Stichtag' }} galt ({{ copy.day }}).
          </li>
          <li>Was rechts als neu markiert ist, steht nicht schon im Gesetz.</li>
          <li>Was rechts als neu markiert ist, steht auch im Gesetzestext {{ copy.item }}.</li>
          <li>
            Was rechts als neu markiert ist, steht Wort für Wort und in derselben
            Reihenfolge im Gesetzestext {{ copy.item }}<template v-if="kind === 'entwurf'">, oder unsere eigene
              Lesung des ganzen Paragraphen nach dem Entwurf bestätigt ihn</template>.
          </li>
          <li>Zeigt die rechte Spalte von einem Paragraphen nichts, hebt der Gesetzestext {{ copy.item }} ihn auch auf.</li>
        </ul>
        Einem neuen Paragraphen steht links nichts gegenüber; bei ihm zählen nur
        der dritte und der vierte Punkt. Ließ sich etwas davon nicht prüfen, steht beim
        Paragraphen „nicht geprüft“. Stimmt der neue Text beim wortweisen
        Abgleich nicht mit dem Gesetzestext überein<template v-if="kind === 'entwurf'"> und bestätigt
          ihn auch unsere eigene Lesung nicht</template>, steht „nicht bestätigt“;
        gezeigt wird der Paragraph trotzdem.
      </dd>
    </div>
    <div>
      <dt>„Nicht gezeigt“ heißt: Eine Prüfung ging nicht auf</dt>
      <dd>
        Dann zeigen wir lieber keinen Vergleich als einen falschen. An der
        Stelle des Paragraphen steht der Grund. Was sich dort ändert, steht im
        Dokument selbst, das unter der Gegenüberstellung verlinkt ist.
      </dd>
    </div>
    <div v-if="paired">
      <dt>Die Zeilenzuordnung ist von uns</dt>
      <dd>
        Das RIS veröffentlicht diese Textgegenüberstellung nur als Bild. Wir
        lesen deshalb das PDF des Ministeriums und ordnen selbst zu, welche
        Zeile links zu welcher rechts gehört. Dabei können wir uns irren; auch
        ein „nicht gezeigt“ kann daran liegen.
      </dd>
    </div>
    <!-- How often it holds, and what its check does not catch: measured,
         on /genauigkeit (19.11.2026); the method stays here, the figures
         stand there once. -->
    <div>
      <dt>Wie oft das stimmt, ist gemessen</dt>
      <dd>
        Auf der Seite
        <NuxtLink to="/genauigkeit#gegenueberstellung" class="link-inline">Genauigkeit</NuxtLink>,
        samt den Fehlern, die die Prüfung nicht fängt.
      </dd>
    </div>
  </dl>
</template>

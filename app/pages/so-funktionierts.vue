<script setup lang="ts">
/**
 * The Verfahrens explainer: static, zero data, zero ops — makes every
 * StageBar and TraceTimeline in the product retroactively legible for the
 * audience that lands from a shared link and has never heard the word
 * "Regierungsvorlage". Anchor IDs let detail pages deep-link each term.
 */
useSeoMeta({
  title: "So funktioniert's",
  description:
    'Wie ein Gesetz in Österreich entsteht: vom Ministerialentwurf über die Begutachtung und die Regierungsvorlage bis zur Kundmachung im Bundesgesetzblatt. Und woher die Textgegenüberstellung kommt, die zeigt, was ein Entwurf am geltenden Recht ändert.',
})

const steps = [
  {
    id: 'ministerialentwurf',
    name: 'Ministerialentwurf',
    text: 'Ein Ministerium legt den Entwurf eines Gesetzes vor. Ab jetzt ist er öffentlich einsehbar – lange bevor das Parlament darüber abstimmt.',
  },
  {
    id: 'begutachtung',
    name: 'Begutachtung',
    text: 'Mehrere Wochen lang kann jede und jeder eine Stellungnahme abgeben – Privatpersonen genauso wie Kammern, Vereine und Unternehmen. Die Frist dafür setzt das Ministerium; abgegeben wird die Stellungnahme direkt auf parlament.gv.at.',
    link: { to: '/begutachtungen?status=open', label: 'Alle offenen Begutachtungen →' },
  },
  {
    id: 'regierungsvorlage',
    name: 'Regierungsvorlage',
    text: 'Das Ministerium überarbeitet den Entwurf, oft auf Basis der Stellungnahmen; die Regierung beschließt die Vorlage an den Nationalrat. Manche Entwürfe kommen nie so weit – auch das zeigt der Monitor. Endet die Gesetzgebungsperiode vorher, wird ein Entwurf nur selten noch eingebracht; meist beginnt die nächste Regierung mit einer neuen Begutachtung.',
  },
  {
    id: 'parlament',
    name: 'Parlament',
    text: 'Nationalrat und Bundesrat beraten die Vorlage; im Ausschuss und im Plenum kann sich der Text weiter ändern.',
  },
  {
    id: 'bundesgesetzblatt',
    name: 'Bundesgesetzblatt',
    text: 'Mit der Kundmachung im Bundesgesetzblatt wird das Gesetz verbindlich.',
  },
] as const
</script>

<template>
  <div class="mx-auto w-full max-w-2xl">
    <h1 class="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
      So funktioniert die Begutachtung
    </h1>
    <p class="mt-3 leading-relaxed text-ink-secondary">
      Bevor ein Gesetzesentwurf ins Parlament kommt, durchläuft er fünf
      Stationen. Der Monitor verfolgt jeden Entwurf über alle fünf – und
      zeigt, was aus dem Input der Öffentlichkeit wird.
    </p>

    <!-- Numbers + text carry the sequence; the connector line and the
         marker tiles are decorative (meaning never on color/shape alone). -->
    <ol class="mt-10">
      <li
        v-for="(step, i) in steps"
        :id="step.id"
        :key="step.id"
        class="relative scroll-mt-6 pb-10 pl-14 last:pb-0"
      >
        <span
          v-if="i < steps.length - 1"
          aria-hidden="true"
          class="absolute bottom-0 left-4.5 top-10 w-0.5 bg-hairline"
        />
        <span
          aria-hidden="true"
          class="absolute left-0 top-0 inline-flex size-9 items-center justify-center rounded-md bg-mark font-heading text-lg font-semibold text-ink"
        >
          {{ i + 1 }}
        </span>
        <h2 class="pt-1 text-lg font-semibold text-ink">
          <span class="sr-only">Schritt {{ i + 1 }}: </span>{{ step.name }}
        </h2>
        <p class="mt-2 leading-relaxed text-ink-secondary">{{ step.text }}</p>
        <p v-if="'link' in step && step.link" class="mt-2">
          <NuxtLink
            :to="step.link.to"
            class="tap-target rounded text-sm font-medium text-accent-deep hover:underline"
          >
            {{ step.link.label }}
          </NuxtLink>
        </p>
      </li>
    </ol>

    <!-- Not a sixth station: a note on one section of the detail page, which
         links here from its check sentence ("Wie wir prüfen"). It stands
         apart from the numbered list because it describes a document, not a
         step of the procedure — but keeps the page's typography, because it
         answers the same kind of question. -->
    <section id="gegenueberstellung" class="mt-16 scroll-mt-6 border-t border-hairline pt-10">
      <h2 class="text-lg font-semibold text-ink">Woher „Was ändert der Entwurf?“ kommt</h2>

      <p class="mt-3 leading-relaxed text-ink-secondary">
        Zu den meisten Entwürfen legt das Ministerium eine
        <strong class="font-medium text-ink">Textgegenüberstellung</strong> bei:
        links die geltende Fassung, rechts die vorgeschlagene. Ein Rundschreiben
        des Bundeskanzleramts vom 27.03.2002 schreibt diese Form vor – die
        Spaltentitel, und dass unveränderter Text dazwischen abgekürzt wird
        („2. bis 26b. …“). Der Text auf unserer Seite stammt aus diesem
        Dokument des Ministeriums, Wort für Wort.
      </p>

      <p class="mt-4 leading-relaxed text-ink-secondary">
        Von uns stammt die <strong class="font-medium text-ink">Markierung</strong>:
        Wir vergleichen die beiden Spalten Wort für Wort und heben hervor, was
        wegfällt und was dazukommt. „Redaktionell“ heißt dabei, dass sich nur
        Verweise, Zahlen, Daten oder Satzzeichen geändert haben.
      </p>

      <p class="mt-4 leading-relaxed text-ink-secondary">
        Die linke Spalte behauptet, das geltende Recht zu sein – und das lässt
        sich nachsehen. Wir halten sie gegen den Text im
        <strong class="font-medium text-ink">RIS Bundesrecht</strong>, und zwar
        zum Beginn der Begutachtungsfrist: das ist der Stand, den das
        Ministerium beim Schreiben vor sich hatte.
      </p>

      <p class="mt-4 leading-relaxed text-ink-secondary">
        Auch die rechte Spalte hat Bezugspunkte, und seit 10.09.2026 prüfen wir
        sie: Was dort grün als <strong class="font-medium text-ink">neu</strong>
        markiert ist, darf im geltenden Paragraphen nicht schon so stehen – tut
        es das, fehlt der Text links, weil er beim Lesen verloren ging oder die
        Beilage einen älteren Stand zugrunde legt, und der Entwurf sieht
        umfangreicher aus, als er ist. Und es muss in den
        <strong class="font-medium text-ink">Novellierungsanordnungen</strong>
        vorkommen, die der Entwurf für genau diesen Paragraphen trifft – der
        Gesetzestext des Entwurfs steht im selben RIS-Dokument neben der
        Beilage. Text, den weder das geltende Recht noch der Entwurf an dieser
        Stelle anordnet, gehört dorthin nicht. Was bei beiden Prüfungen
        herauskommt, steht über der Gegenüberstellung. Zwei Ergebnisse brauchen
        eine Erklärung:
      </p>

      <dl class="mt-4 space-y-3 leading-relaxed text-ink-secondary">
        <div>
          <dt class="font-medium text-ink">„nicht gezeigt“</dt>
          <dd>
            Eine der drei Prüfungen ist an dieser Stelle nicht aufgegangen: der
            geltende Text im RIS deckt die linke Spalte nicht, oder die rechte
            zeigt Geltendes als neu, oder sie trägt Text, den der Entwurf für
            diesen Paragraphen nicht anordnet. Dann gehört die Zeile entweder
            nicht zu dem Paragraphen, unter dem sie steht, oder die Beilage
            legt einen älteren Stand des Gesetzes zugrunde. Wir blenden den Vergleich dort
            aus, statt einen falschen zu zeigen – und verlinken die Beilage des
            Ministeriums, die die Frage beantwortet. Über der Stelle steht
            jeweils, welche der drei Prüfungen es war.
          </dd>
        </div>
        <div>
          <dt class="font-medium text-ink">„nicht geprüft“</dt>
          <dd>
            Es gibt nichts zum Vergleichen. Ein Entwurf, der neues Recht
            schafft, hat keinen geltenden Text; eine Verordnung steht nicht im
            Bundesrecht; manchmal führt das RIS den Paragraphen nicht oder hält
            ihn als Tabelle. Das ist kein Befund über den Entwurf, sondern
            einer über die Prüfbarkeit.
          </dd>
        </div>
      </dl>

      <p class="mt-4 leading-relaxed text-ink-secondary">
        Ein Vorbehalt zum Schluss: Bei einem Teil der Entwürfe veröffentlicht
        das RIS die Beilage nur als Bild. Dann lesen wir das PDF des
        Ministeriums und erschließen aus dem Seitenlayout, welche Zeile links
        zu welcher Zeile rechts gehört. Der Text ist auch dort der des
        Ministeriums – die Zuordnung ist unsere, und sie kann daneben liegen.
        Auf solchen Seiten steht das ausdrücklich dabei.
      </p>
    </section>

    <p class="mt-12 leading-relaxed text-ink-secondary">
      Der Monitor zeigt Verfahren mit weiterem Verlauf genauso wie Verfahren
      ohne – Nachverfolgung, nicht Bewertung.
      <NuxtLink
        to="/ueber"
        class="rounded text-accent-deep underline underline-offset-2 hover:no-underline"
      >Mehr über das Projekt</NuxtLink>
    </p>
  </div>
</template>

<script setup lang="ts">
/**
 * The Verfahrens explainer: static, zero data, zero ops. It makes the
 * five-station bar on every Entwurf page (`SpineRail`, "Der Text im
 * Verfahren") legible for the audience that lands from a shared link and
 * has never heard the word "Regierungsvorlage": the same five stations, in
 * the same order, under the names the bar uses — plus the marks the bar
 * draws. Anchor IDs let other pages deep-link each term;
 * `#gegenueberstellung` is linked from `TextComparisonSection` and must
 * stay.
 */
useSeoMeta({
  title: "So funktioniert's",
  description:
    'Wie ein Gesetz in Österreich entsteht: vom Ministerialentwurf über die Begutachtung und die Regierungsvorlage bis zur Kundmachung im Bundesgesetzblatt. Und woher die Textgegenüberstellung kommt, die zeigt, was ein Entwurf am geltenden Recht ändert.',
})

/* The five names and their order are the bar's (`shared/utils/stations.ts`).
   Kept static here rather than imported, because this page explains the
   terms and the bar only uses them — but a rename there is a rename here.
   `monitor` is what the detail page actually shows at that station, so the
   explainer promises nothing the product does not do. */
const steps = [
  {
    id: 'entwurf',
    name: 'Entwurf',
    text: 'Ein Ministerium legt den Entwurf eines Gesetzes vor, amtlich Ministerialentwurf. Ab jetzt ist er öffentlich einsehbar – lange bevor das Parlament darüber abstimmt.',
    monitor: 'Welche Gesetze der Entwurf ändert, seine Dokumente und – aus der Textgegenüberstellung des Ministeriums – was er ändert.',
    link: { to: '#gegenueberstellung', label: 'Woher die Gegenüberstellung kommt →' },
  },
  {
    id: 'begutachtung',
    name: 'Begutachtung',
    text: 'Mehrere Wochen lang kann jede und jeder eine Stellungnahme abgeben – Privatpersonen genauso wie Kammern, Vereine und Unternehmen. Die Frist dafür setzt das Ministerium; abgegeben wird die Stellungnahme direkt auf parlament.gv.at.',
    monitor: 'Die Frist, die Zahl der Stellungnahmen und wer sie abgegeben hat – Organisationen mit Namen, Privatpersonen ohne.',
    link: { to: '/entwuerfe?status=open', label: 'Alle offenen Begutachtungen →' },
  },
  {
    id: 'regierungsvorlage',
    name: 'Regierungsvorlage',
    text: 'Nach der Begutachtung überarbeitet das Ministerium den Entwurf – die Stellungnahmen liegen ihm dabei vor; die Regierung beschließt die Vorlage an den Nationalrat. Manche Entwürfe kommen nie so weit – auch das zeigt der Monitor. Endet die Gesetzgebungsperiode vorher, wird ein Entwurf nur selten noch eingebracht; meist beginnt die nächste Regierung mit einer neuen Begutachtung.',
    monitor: 'Ob und wann eine Regierungsvorlage kam, und was sich gegenüber dem Entwurf geändert hat, Paragraph für Paragraph. Kam keine, steht auch das da.',
  },
  {
    id: 'parlament',
    name: 'Parlament',
    text: 'Nationalrat und Bundesrat beraten die Vorlage; im Ausschuss und im Plenum kann sich der Text weiter ändern.',
    monitor: 'Ob der Nationalrat den Text unverändert beschlossen oder im Ausschuss und im Plenum geändert hat – mit den Fassungen, die dabei entstanden sind.',
  },
  {
    id: 'bundesgesetzblatt',
    name: 'Bundesgesetzblatt',
    text: 'Mit der Kundmachung im Bundesgesetzblatt wird das Gesetz verbindlich.',
    monitor: 'Die Nummer der Kundmachung, verlinkt ins Rechtsinformationssystem.',
  },
] as const
</script>

<template>
  <div class="mx-auto w-full max-w-2xl">
    <h1 class="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
      So funktioniert die Begutachtung
    </h1>
    <p class="mt-3 leading-relaxed text-ink-secondary">
      Vom Entwurf eines Ministeriums bis zur Kundmachung im
      Bundesgesetzblatt durchläuft ein Gesetz fünf Stationen. Der Monitor
      verfolgt jeden Entwurf über alle fünf – und zeigt, was aus dem Input
      der Öffentlichkeit wird.
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
        <p class="mt-2 text-sm text-ink-secondary">
          <span class="font-medium text-ink">Im Monitor:</span> {{ step.monitor }}
        </p>
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

    <!-- The dots repeat SpineRail's classes on purpose: a legend has to look
         like the thing it explains, and the words next to them carry the
         meaning (never colour alone). If the bar's dot styles change, this
         legend changes with them. -->
    <section id="leiste" class="mt-16 scroll-mt-6 border-t border-hairline pt-10">
      <h2 class="text-lg font-semibold text-ink">Die Leiste auf jeder Entwurfsseite</h2>

      <p class="mt-3 leading-relaxed text-ink-secondary">
        Oben auf jeder Entwurfsseite stehen dieselben fünf Stationen
        untereinander. Darüber steht in einem Satz, wo der Text gerade liegt.
        Jede Station nennt darunter, was dort geschehen ist, und führt zu dem
        Abschnitt der Seite, der sie behandelt.
      </p>

      <ul class="mt-4 space-y-2 text-sm text-ink-secondary">
        <li class="flex items-baseline gap-3">
          <span
            aria-hidden="true"
            class="mt-1 box-border size-3 shrink-0 rounded-full border-2 border-ink bg-ink"
          />
          <span><span class="font-medium text-ink">Ausgefüllt</span> – diese Station ist passiert.</span>
        </li>
        <li class="flex items-baseline gap-3">
          <span
            aria-hidden="true"
            class="mt-1 box-border size-3 shrink-0 rounded-full border-2 border-ink bg-mark"
          />
          <span><span class="font-medium text-ink">Gelb</span> – hier steht der Text gerade. Läuft dort etwas, ist die ganze Zeile gelb hinterlegt: während der Frist die Begutachtung, danach die Regierungsvorlage, solange das Ministerium die Stellungnahmen hat.</span>
        </li>
        <li class="flex items-baseline gap-3">
          <span
            aria-hidden="true"
            class="mt-1 box-border size-3 shrink-0 rounded-full border-2 border-baseline bg-surface"
          />
          <span><span class="font-medium text-ink">Leer</span> – diese Station liegt noch vor dem Text, oder er hat sie nie erreicht; dann steht daneben, warum.</span>
        </li>
      </ul>

      <p class="mt-4 leading-relaxed text-ink-secondary">
        Die beiden Fragen in der Leiste – „Was ändert der Entwurf?“ und „Was
        sich nach der Begutachtung geändert hat“ – führen zu den Vergleichen.
        Die erste beantwortet das Ministerium selbst, die zweite rechnen wir.
      </p>
    </section>

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

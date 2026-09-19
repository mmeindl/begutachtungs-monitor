<script setup lang="ts">
/**
 * The one canonical page for invariant background: static, zero data, zero
 * ops. Every product page that needs the procedure explained links here and
 * keeps at most a bridge sentence of its own.
 *
 * WHY THE PAGE IS NOT A LIST OF STATIONS ANY MORE (18.09.2026). It was, and
 * that made it a mechanism document with a newcomer's title: the outline was
 * the procedure, which is the question a reader already inside the system
 * asks. Someone arriving from a shared link asks three others first — does
 * this concern me, can I do anything, does it ever change anything — and
 * only then how the machinery runs. The stations are now the scaffolding of
 * the third answer rather than the page's skeleton, and the table of
 * contents lets both audiences skip to their half.
 *
 * TWO PATHS, not five stations. Verordnungsentwürfe are the larger half of
 * the corpus and never reach Parliament, so „durchläuft ein Gesetz fünf
 * Stationen. Der Monitor verfolgt jeden Entwurf über alle fünf" was false
 * for most of what the site lists. Shared stations 1–2, then a fork: three
 * further stations for a Gesetz, one for a Verordnung.
 *
 * The station texts stay free of „bei einem Ministerialentwurf … bei einem
 * Verordnungsentwurf …" clauses. The PROCEDURE is shared; what differs is
 * the publication venue, and that difference is stated once, in
 * `#ohne-stellungnahmen`, instead of four times in halves.
 *
 * ANCHORS. `#gegenueberstellung` is linked from `TextComparisonSection` and
 * must stay. `#leiste` is gone — a legend for a UI element on another page,
 * reached by no link at all, and stale within a day of the third comparison
 * („die beiden Fragen in der Leiste"). The rail says its own state in words
 * instead.
 */
import { EDITORIAL_BADGE_SENTENCE } from '#shared/utils/lawStations'
import { SECOND_ROUND_WINDOW } from '#shared/utils/stations'

useSeoMeta({
  title: "So funktioniert's",
  description:
    'Wie die Begutachtung in Österreich funktioniert und was danach kommt: Ein Gesetzesentwurf geht über Regierungsvorlage und Parlament ins Bundesgesetzblatt, eine Verordnung erlässt das Ministerium selbst. Und woher die Textgegenüberstellung kommt, die zeigt, was ein Entwurf am geltenden Recht ändert.',
})

interface Step {
  id: string
  name: string
  text: string
  /** What the detail page actually shows there — never a promise. */
  monitor: string
  link?: { to: string; label: string; external?: boolean }
}

/* Station names and their order are the rail's (`shared/utils/stations.ts`).
   Kept static rather than imported, because this page explains the terms and
   the rail only uses them — but a rename there is a rename here. */
const sharedSteps: Step[] = [
  {
    id: 'entwurf',
    name: 'Entwurf',
    text: 'Ein Ministerium legt den Entwurf öffentlich auf – für ein Gesetz, das später der Nationalrat beschließen soll, oder für eine Verordnung, die es auf Grundlage eines Gesetzes selbst erlässt. Ab jetzt ist der Text einsehbar, lange bevor er gilt.',
    monitor:
      'Die Dokumente des Entwurfs: der Text selbst, die Erläuterungen des Ministeriums und, wo es sie gibt, die Gegenüberstellung mit dem geltenden Recht.',
    link: { to: '#gegenueberstellung', label: 'Woher die Gegenüberstellung kommt →' },
  },
  {
    id: 'begutachtung',
    name: 'Begutachtung',
    text: 'Mehrere Wochen lang kann jede und jeder eine Stellungnahme abgeben – Privatpersonen genauso wie Kammern, Vereine und Unternehmen. Die Frist setzt das Ministerium.',
    monitor:
      'Die Frist. Dazu, wo das Parlament den Entwurf führt, die Zahl der Stellungnahmen und wer sie abgegeben hat – Organisationen mit Namen, Privatpersonen ohne.',
    link: {
      to: '/entwuerfe?status=open&station=begutachtung',
      label: 'Alle offenen Begutachtungen →',
    },
  },
]

/* Both branches start at 3 — `<ol start="3">` and a tile that prints the
   real number. Letters (3a/3b) or a continuous count would claim a sequence
   that does not exist: they are alternatives, not a longer chain. The counts
   ride in words next to the heading, so the path length never depends on
   counting tiles. */
const paths: { id: string; name: string; count: string; lede: string; steps: Step[] }[] = [
  {
    id: 'weg-gesetz',
    name: 'Weg eines Gesetzes',
    count: 'drei weitere Stationen',
    lede: 'Jede dieser Stationen ist öffentlich dokumentiert; der Monitor verfolgt alle drei.',
    steps: [
      {
        id: 'regierungsvorlage',
        name: 'Regierungsvorlage',
        text: 'Die Regierung beschließt den überarbeiteten Entwurf als Vorlage an den Nationalrat. Manche Entwürfe kommen nie so weit – auch das zeigt der Monitor. Endet die Gesetzgebungsperiode vorher, wird ein Entwurf nur selten noch eingebracht; meist beginnt die nächste Regierung mit einer neuen Begutachtung.',
        monitor:
          'Ob und wann eine Regierungsvorlage kam, und was sich gegenüber dem Entwurf geändert hat, Paragraph für Paragraph. Kam keine, steht auch das da.',
      },
      {
        id: 'parlament',
        name: 'Parlament',
        /* Das zweite Fenster steht hier, und das ist seit 18.09.2026 seine
           einzige feste Adresse: Es wurde auf Listen- und Detailseiten
           fünfmal erklärt und auf der Seite, die das Verfahren erklärt,
           überhaupt nicht. */
        text: `Nationalrat und Bundesrat beraten die Vorlage; im Ausschuss und im Plenum kann sich der Text weiter ändern. Auch zur Vorlage selbst sind noch Stellungnahmen möglich. ${SECOND_ROUND_WINDOW}`,
        monitor:
          'Ob der Nationalrat den Text unverändert beschlossen oder im Ausschuss und im Plenum geändert hat – mit den Fassungen, die dabei entstanden sind, und den Stellungnahmen, die zur Vorlage noch eingegangen sind.',
      },
      {
        id: 'bundesgesetzblatt',
        name: 'Bundesgesetzblatt',
        /* „wird das Gesetz verbindlich" war ungenau: Die Kundmachung ist die
           Veröffentlichung, das Inkrafttreten kann später liegen und steht
           im Gesetz selbst. */
        text: 'Mit der Kundmachung im Bundesgesetzblatt Teil I ist das Gesetz erlassen. In Kraft tritt es zu dem Zeitpunkt, den es selbst nennt – das kann derselbe Tag sein oder Monate später.',
        monitor: 'Die Nummer der Kundmachung, verlinkt ins Rechtsinformationssystem.',
      },
    ],
  },
  {
    id: 'weg-verordnung',
    name: 'Weg einer Verordnung',
    count: 'eine weitere Station',
    /* „Mehr als die Hälfte" statt „zwei Drittel": Der Jahresanteil liegt seit
       2016 zwischen 54 % und 75 % (docs/architecture.md §12.16). Auf einer
       statischen Seite muss die Zahl auch in fünf Jahren noch stimmen. Der
       Satz bleibt trotzdem stehen — ohne ihn liest sich der kürzere Weg als
       Ausnahme, und er ist der häufigere Fall. */
    lede: 'Das ist der häufigere Weg: Mehr als die Hälfte aller Begutachtungen betrifft Verordnungen. Eine Verordnung regelt, was ein Gesetz dem Ministerium überlässt – Gebühren, Fristen, Grenzwerte, Formulare – und braucht keinen Beschluss des Nationalrats.',
    steps: [
      {
        /* EINE Station, nicht zwei. „Erlassung durch das Ressort" wäre eine
           Zeile ohne Beobachtbares, und `stations.ts` hat genau dafür schon
           eine Regel: „Ausarbeitung im Ressort happens before anything is
           published … a row for it would be an empty promise." Zwischen
           Fristende und Kundmachung ist von außen nichts zu sehen, und zwei
           Zeilen „Im Monitor: nichts" hintereinander wären eine Wand aus
           Abwesenheit. Kommt die Verordnungs-Leiste (TODO), hat sie damit
           drei Zeilen, von denen jede etwas anzeigen kann. */
        id: 'bundesgesetzblatt-ii',
        name: 'Bundesgesetzblatt II',
        text: 'Das Ministerium erlässt die überarbeitete Verordnung und macht sie im Bundesgesetzblatt Teil II kund – erst damit gilt sie. Eine Regierungsvorlage und einen Beschluss des Nationalrats gibt es hier nicht; zwischen Fristende und Kundmachung ist von außen nichts zu sehen.',
        monitor:
          'Die Kundmachung selbst: „Kundgemacht als BGBl. II Nr. 410/2024, 44 Tage nach Ende der Begutachtungsfrist“ – auf der Seite des Entwurfs und als Stand in der Liste. Gefunden wird sie über Titel, Ressort und Datum, also nicht lückenlos: Über 291 Verordnungsentwürfe seit 2024 gemessen findet der Abgleich 84,2 % der Kundmachungen, bei Fristen von vor mehr als einem Jahr 92,3 %. Zwischen Fristende und Kundmachung liegen im Median 57 Tage, in einem von zehn Fällen mehr als ein halbes Jahr.',
        link: {
          to: 'https://www.ris.bka.gv.at/Bgbl-Auth/',
          label: 'Bundesgesetzblatt II im RIS',
          external: true,
        },
      },
    ],
  },
]

/* Eine Überschrift je Abschnitt, in der Reihenfolge der Seite. Von Hand
   gepflegt und nicht aus dem DOM gelesen: Die Seite ist statisch, und eine
   Liste, die sich selbst erzeugt, wäre JavaScript für etwas, das sich
   zweimal im Jahr ändert. */
const toc = [
  { to: '#betrifft-mich', label: 'Betrifft mich das?' },
  { to: '#wirkung', label: 'Was eine Stellungnahme bewirkt' },
  { to: '#stationen', label: 'Der Weg eines Entwurfs' },
  { to: '#ohne-stellungnahmen', label: 'Warum manche Entwürfe keine Stellungnahmen zeigen' },
  { to: '#gegenueberstellung', label: 'Woher „Was ändert der Entwurf?“ kommt' },
]
</script>

<template>
  <div class="mx-auto w-full max-w-2xl">
    <h1 class="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
      So funktioniert die Begutachtung
    </h1>
    <p class="mt-3 leading-relaxed text-ink-secondary">
      Bevor ein Gesetz oder eine Verordnung gilt, legt das zuständige
      Ministerium den Entwurf öffentlich auf. Mehrere Wochen lang kann jede
      und jeder dazu Stellung nehmen. Diese Phase heißt Begutachtung – der
      früheste Zeitpunkt, zu dem sich an einem Vorhaben noch etwas ändern
      lässt, und der am wenigsten beachtete.
    </p>

    <nav class="mt-8 border-y border-hairline py-4" aria-labelledby="toc-heading">
      <h2 id="toc-heading" class="text-sm font-medium text-ink">Auf dieser Seite</h2>
      <ul class="mt-2 space-y-1">
        <li v-for="item in toc" :key="item.to">
          <NuxtLink
            :to="item.to"
            class="tap-target rounded text-sm text-accent-deep hover:underline"
          >
            {{ item.label }}
          </NuxtLink>
        </li>
      </ul>
    </nav>

    <section id="betrifft-mich" class="mt-12 scroll-mt-6">
      <h2 class="text-lg font-semibold text-ink">Betrifft mich das?</h2>

      <p class="mt-3 leading-relaxed text-ink-secondary">
        Eine Stellungnahme darf jede und jeder abgeben. Es braucht keine
        Organisation hinter sich, keine juristische Ausbildung und keine
        bestimmte Form – ein Schreiben genügt, das sagt, worum es geht und was
        daran geändert werden soll. In der Praxis kommen die meisten
        Stellungnahmen von Kammern, Verbänden und Ländern, die die Fristen
        beobachten. Das ist kein Zugangshindernis, sondern eine Frage davon,
        wer rechtzeitig erfährt, dass ein Entwurf aufliegt.
      </p>

      <p class="mt-4 leading-relaxed text-ink-secondary">
        Und es geht nicht nur um die großen Gesetze. Der größere Teil der
        Begutachtungen betrifft Verordnungen – Gebühren, Grenzwerte, Fristen,
        Prüfvorschriften, Lehrpläne, Formulare. Das sind die Regeln, die eine
        Branche, einen Beruf oder eine Region unmittelbar treffen, und sie
        laufen meist ohne öffentliche Aufmerksamkeit durch.
      </p>

      <p class="mt-4 leading-relaxed text-ink-secondary">
        Rechtzeitig erfahren lässt sich das auf drei Wegen, alle ohne Konto:
        <NuxtLink
          to="/entwuerfe?status=open"
          class="rounded font-medium text-accent-deep underline underline-offset-2 hover:no-underline"
        >die Liste der offenen Begutachtungen</NuxtLink>, der
        <a
          href="/feed.xml"
          class="rounded font-medium text-accent-deep underline underline-offset-2 hover:no-underline"
        >RSS-Feed</a>
        und ein
        <!-- Verweist auf /ueber, statt hier ein webcal:// anzubieten. Ein
             webcal-Link tut ohne registrierten Handler sichtbar nichts, und
             die funktionierende Fassung des Angebots steht ohnehin schon an
             einer Stelle: Apple/Outlook, Google und die Adresse zum
             Eintragen von Hand, mit dem Hinweis abonnieren-statt-
             importieren. Ein Erklärtext nennt den Weg, die Mechanik steht
             dort, wo die Knöpfe sind. -->
        <NuxtLink
          to="/ueber#about-subscribe"
          class="rounded font-medium text-accent-deep underline underline-offset-2 hover:no-underline"
        >Kalender-Abo aller Fristen</NuxtLink>.
      </p>
    </section>

    <!-- Mechanismus 3 aus CLAUDE.md, und der Grund, warum diese Seite
         überhaupt Prosa ist: Ein Werkzeug, das nur zählt, was folgenlos
         blieb, beweist, dass Beteiligung sinnlos ist. Der Satz „Ministerien
         überarbeiten Entwürfe regelmäßig" stand bisher einmal auf der Seite,
         klein und grau unter einem Handlungskasten.

         KEINE Zahl im Fließtext. Eine Quote, die hier steht, altert
         unbemerkt — auf einer Seite, deren ganzer Anspruch Überprüfbarkeit
         ist. Der Beleg ist die Liste, die sich selbst nachrechnet; die
         Grundraten über hunderte Verfahren sind ein eigenes Arbeitspaket. -->
    <section id="wirkung" class="mt-12 scroll-mt-6">
      <h2 class="text-lg font-semibold text-ink">Was eine Stellungnahme bewirkt</h2>

      <p class="mt-3 leading-relaxed text-ink-secondary">
        Entwürfe ändern sich nach der Begutachtung – regelmäßig, nicht
        ausnahmsweise. Das Ministerium überarbeitet den Text, bevor er
        weitergeht, und die eingelangten Stellungnahmen liegen ihm dabei vor.
        Bisher war das kaum nachvollziehbar: Wer eine Stellungnahme abgegeben
        hatte, erfuhr in der Regel nicht, ob sich an der Stelle, um die es
        ihm ging, etwas getan hat.
      </p>

      <p class="mt-4 leading-relaxed text-ink-secondary">
        Genau das zeigt der Monitor. Zu jedem Entwurf stellt er die Fassungen
        nebeneinander und markiert, was sich Paragraph für Paragraph geändert
        hat. Und er zeigt die Entwürfe, aus denen nichts wurde: Ein Teil
        erreicht das Parlament nie, ohne dass das je begründet würde.
      </p>

      <p class="mt-4 leading-relaxed text-ink-secondary">
        Was der Monitor <strong class="font-medium text-ink">nicht</strong>
        behauptet, ist der Zusammenhang. Dass ein Paragraph nach der
        Begutachtung anders lautet, heißt nicht, dass eine bestimmte
        Stellungnahme ihn geändert hat – Änderungen entstehen auch aus der
        Ressortabstimmung, aus EU-Vorgaben oder aus Rechtsförmlichkeit. Der
        Monitor zeigt, was sich geändert hat, und überlässt das Warum dem,
        der beides gelesen hat.
        Die Liste lässt sich
        <NuxtLink
          to="/entwuerfe?art=ministerialentwurf&sort=stellungnahmen"
          class="rounded font-medium text-accent-deep underline underline-offset-2 hover:no-underline"
        >nach den meisten Stellungnahmen reihen</NuxtLink> – jede Zeile mit
        dem, was aus dem Entwurf geworden ist.
      </p>
    </section>

    <section id="stationen" class="mt-16 scroll-mt-6 border-t border-hairline pt-10">
      <h2 class="text-xl font-semibold text-ink">Der Weg eines Entwurfs</h2>
      <p class="mt-3 leading-relaxed text-ink-secondary">
        Die ersten beiden Stationen sind für jeden Entwurf dieselben. Danach
        trennen sich die Wege: Ein Gesetz geht über die Regierung ins
        Parlament, eine Verordnung erlässt das Ministerium selbst.
      </p>

      <!-- Zahlen und Text tragen die Abfolge; Verbindungslinie und Kacheln
           sind dekorativ (Bedeutung nie allein über Farbe oder Form). Die
           Linie läuft auch unter der zweiten Station weiter — sie endet
           nicht, sie gabelt sich. -->
      <ol class="mt-8">
        <li
          v-for="(step, i) in sharedSteps"
          :id="step.id"
          :key="step.id"
          class="relative scroll-mt-6 pb-10 pl-14"
        >
          <span
            aria-hidden="true"
            class="absolute bottom-0 left-4.5 top-10 w-0.5 bg-hairline"
          />
          <span
            aria-hidden="true"
            class="absolute left-0 top-0 inline-flex size-9 items-center justify-center rounded-md bg-mark font-heading text-lg font-semibold text-ink"
          >
            {{ i + 1 }}
          </span>
          <h3 class="pt-1 text-lg font-semibold text-ink">
            <span class="sr-only">Schritt {{ i + 1 }}: </span>{{ step.name }}
          </h3>
          <p class="mt-2 leading-relaxed text-ink-secondary">{{ step.text }}</p>
          <p class="mt-2 text-sm text-ink-secondary">
            <span class="font-medium text-ink">Im Monitor:</span> {{ step.monitor }}
          </p>
          <p v-if="step.link" class="mt-2">
            <NuxtLink
              :to="step.link.to"
              class="tap-target rounded text-sm font-medium text-accent-deep hover:underline"
            >
              {{ step.link.label }}
            </NuxtLink>
          </p>
        </li>
      </ol>

      <!-- Die Gabelung trägt kein Kachelsymbol: Sie ist keine Station,
           sondern die Stelle, an der es zwei gibt. Gezeichnet wird sie von
           Überschrift und Text, nicht von einer verzweigenden Linie — die
           müsste ohnehin `aria-hidden` sein und überlebt 320 px nicht. -->
      <div id="wege" class="scroll-mt-6 pl-14">
        <h3 class="text-lg font-semibold text-ink">
          Nach der Begutachtung trennen sich die Wege
        </h3>
        <p class="mt-2 leading-relaxed text-ink-secondary">
          In beiden Fällen überarbeitet das Ministerium den Entwurf – die
          Stellungnahmen liegen ihm dabei vor. Was dann kommt, hängt davon ab,
          was der Entwurf ist: Ein Gesetz kann nur der Nationalrat
          beschließen, eine Verordnung erlässt das Ministerium selbst.
        </p>
      </div>

      <!-- p-4 unter sm, weil sich die Einzüge hier addieren: Seitenrand (16)
           + Kartenpolster + Kachelspalte. Mit p-5 und pl-14 blieben auf
           320 px rund 192 px Textspalte, und „Rechtsinformationssystem" ist
           breiter als das. -->
      <section
        v-for="path in paths"
        :id="path.id"
        :key="path.id"
        class="mt-10 scroll-mt-6 rounded-xl border border-hairline bg-surface p-4 sm:p-6"
      >
        <h3 class="text-base font-semibold text-ink">
          {{ path.name }}
          <span class="ml-1 font-normal text-ink-muted">· {{ path.count }}</span>
        </h3>
        <p class="mt-2 leading-relaxed text-ink-secondary">{{ path.lede }}</p>

        <ol class="mt-6" start="3">
          <li
            v-for="(step, i) in path.steps"
            :id="step.id"
            :key="step.id"
            class="relative scroll-mt-6 pb-10 pl-12 last:pb-0 sm:pl-14"
          >
            <span
              v-if="i < path.steps.length - 1"
              aria-hidden="true"
              class="absolute bottom-0 left-4.5 top-10 w-0.5 bg-hairline"
            />
            <span
              aria-hidden="true"
              class="absolute left-0 top-0 inline-flex size-9 items-center justify-center rounded-md bg-mark font-heading text-lg font-semibold text-ink"
            >
              {{ i + 3 }}
            </span>
            <h4 class="pt-1 text-lg font-semibold text-ink">
              <!-- „von M" nur hier, nicht bei den geteilten Stationen: Die
                   sind Schritt 1 und 2 von beiden Wegen zugleich, und eine
                   Gesamtzahl wäre dort schlicht falsch. -->
              <span class="sr-only">
                Schritt {{ i + 3 }} von {{ path.steps.length + 2 }}:
              </span>{{ step.name }}
            </h4>
            <p class="mt-2 leading-relaxed text-ink-secondary">{{ step.text }}</p>
            <p class="mt-2 text-sm text-ink-secondary">
              <span class="font-medium text-ink">Im Monitor:</span> {{ step.monitor }}
            </p>
            <p v-if="step.link" class="mt-2">
              <ExternalLink
                v-if="step.link.external"
                :href="step.link.to"
                class="tap-target rounded text-sm font-medium text-accent-deep hover:underline"
              >
                {{ step.link.label }}
              </ExternalLink>
              <NuxtLink
                v-else
                :to="step.link.to"
                class="tap-target rounded text-sm font-medium text-accent-deep hover:underline"
              >
                {{ step.link.label }}
              </NuxtLink>
            </p>
          </li>
        </ol>
      </section>
    </section>

    <!-- Die Folge der Gabelung für das, was der Leser auf den Zeilen sieht.
         Eigener Abschnitt und nicht Teil der Gabelung, weil es eine andere
         Frage beantwortet: Die Gabelung erklärt das Verfahren, dieser
         Abschnitt die Quellen — warum neben manchen Zeilen keine Zahl
         steht. Hier stehen auch die Lücken der amtlichen Listen, denn hier
         hat sie jemand gesucht; auf einer Entwurfsseite wären sie eine
         Auskunft über uns an einen Leser, der nach einem Entwurf gefragt
         hat. -->
    <section id="ohne-stellungnahmen" class="mt-16 scroll-mt-6 border-t border-hairline pt-10">
      <h2 class="text-lg font-semibold text-ink">
        Warum manche Entwürfe keine Stellungnahmen zeigen
      </h2>

      <p class="mt-3 leading-relaxed text-ink-secondary">
        Zu einem Gesetzesentwurf führt das Parlament eine eigene Seite: Dort
        wird die Stellungnahme abgegeben, und dort steht anschließend auch,
        wer sie abgegeben hat. Eine Verordnung kommt nie ins Parlament. Die
        Stellungnahme geht direkt an das Ministerium, an die Adresse im
        Begleitschreiben, und eine öffentliche Liste der Einreichungen gibt
        es nicht. Deshalb steht auf diesen Zeilen keine Zahl – nicht, weil
        niemand Stellung genommen hätte, sondern weil niemand zählt.
      </p>

      <p class="mt-4 leading-relaxed text-ink-secondary">
        Seltener trifft es einen Gesetzesentwurf. Beide amtlichen Listen haben
        Lücken: Ein Entwurf kann im Rechtsinformationssystem stehen und in der
        Liste des Parlaments fehlen. Der Monitor liest deshalb beide, damit
        die Lücke der einen nicht zur Lücke des Monitors wird. Und bei wenigen
        Entwürfen nennt schon der Titel keine Rechtsform – Staatsverträge etwa
        oder Vereinbarungen zwischen Bund und Ländern; welchen Weg sie nehmen,
        sagt das Dokument selbst.
      </p>
    </section>

    <!-- Not a station: a note on one section of the detail page, which links
         here from its check sentence ("Wie wir prüfen"). It stands apart from
         the numbered lists because it describes a document, not a step of the
         procedure — but keeps the page's typography, because it answers the
         same kind of question. -->
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
        wegfällt und was dazukommt. Dieselbe Markierung und dieselben Abzeichen
        trägt der Vergleich nach der Begutachtung, Entwurf gegen
        Regierungsvorlage – auch er verlinkt hierher.
        {{ EDITORIAL_BADGE_SENTENCE }}
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

    <!-- „Nachverfolgung, nicht Bewertung" steht seit 18.09.2026 nur noch
         auf /ueber, wo es hingehört: eine Aussage über das Projekt, nicht
         über das Verfahren. Hier stand sie wortgleich ein zweites Mal. -->
    <p class="mt-12 leading-relaxed text-ink-secondary">
      <NuxtLink
        to="/ueber"
        class="rounded text-accent-deep underline underline-offset-2 hover:no-underline"
      >Mehr über das Projekt</NuxtLink>
      – wer es macht, woher die Daten kommen und was es noch nicht kann.
    </p>
  </div>
</template>

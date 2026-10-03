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
 * must stay; so are `#lesefassung` (its disclosures) and `#vergleich`
 * (`LawDiffSection`), both since 30.09.2026. `#leiste` is gone — a legend for a UI element on another page,
 * reached by no link at all, and stale within a day of the third comparison
 * („die beiden Fragen in der Leiste"). The rail says its own state in words
 * instead.
 */
import { EDITORIAL_BADGE_SENTENCE } from '#shared/utils/lawStations'
import { SECOND_ROUND_WINDOW } from '~/utils/spine'

usePageSeo({
  title: "So funktioniert's",
  description:
    'Wie die Begutachtung in Österreich funktioniert, was danach kommt – vom Entwurf bis ins Bundesgesetzblatt – und woher die Textgegenüberstellung stammt.',
})

interface Step {
  id: string
  name: string
  text: string
  /** What the detail page actually shows there — never a promise. */
  monitor: string
  link?: { to: string; label: string; external?: boolean }
}

/* Station names and their order are the rail's (`app/utils/spine.ts`).
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
    /* The Regelfall and its source stand here since 30.09.2026 — they stood
       under every draft's „Die Begutachtung" before, where the page now keeps
       the draft's Frist drawn against the Regelfall (`FristBar`). */
    text: 'Mehrere Wochen lang kann jede und jeder eine Stellungnahme abgeben – Privatpersonen genauso wie Kammern, Vereine und Unternehmen. Die Frist setzt das Ministerium; im Regelfall vorgesehen sind sechs Wochen (§ 9 Abs. 3 WFA-Grundsatz-Verordnung). Der Monitor nennt eine Frist ab sechs Wochen „voll“ und unter drei Wochen „kurz“; zum Vergleich zeigt er den Median der Entwürfe seit 2013, vier Wochen.',
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
        /* The second window stands here, and since 18.09.2026 this is its
           only fixed address: it was explained five times on list and detail
           pages and not at all on the page that explains the procedure. */
        text: `Nationalrat und Bundesrat beraten die Vorlage; im Ausschuss und im Plenum kann sich der Text weiter ändern. Auch zur Vorlage selbst sind noch Stellungnahmen möglich. ${SECOND_ROUND_WINDOW} Freigegebene Stellungnahmen gehen an die parlamentarischen Klubs und an das zuständige Ministerium und werden bei der Vorlage veröffentlicht; ein eigenes Verfahren im Ausschuss sieht die Geschäftsordnung dafür nicht vor – außer der Ausschuss holt selbst Stellungnahmen ein (Ausschussbegutachtung). Am Ende steht eine einzige Abstimmung über das ganze Gesetz, die dritte Lesung.`,
        /* „welche Klubs" und nicht „wie das Parlament abgestimmt hat": das
           Parlament zählt das Handzeichen je Klub, nicht je Abgeordnetem
           (`docs/architecture.md` §12.34). Der Satz über der Zeile sagt, dass
           es eine Abstimmung über das ganze Gesetz ist — damit die Klubs
           neben den Fassungen nicht als Urteil über einen Paragraphen
           gelesen werden. */
        monitor:
          'Ob der Nationalrat den Text unverändert beschlossen oder im Ausschuss und im Plenum geändert hat – mit den Fassungen, die dabei entstanden sind, den Stellungnahmen, die zur Vorlage noch eingegangen sind, und welche Klubs in dritter Lesung dafür und dagegen gestimmt haben.',
      },
      {
        id: 'bundesgesetzblatt',
        name: 'Bundesgesetzblatt',
        /* „wird das Gesetz verbindlich" was imprecise: the Kundmachung is the
           publication, while the Inkrafttreten can come later and is named in
           the law itself. */
        text: 'Mit der Kundmachung im Bundesgesetzblatt Teil I ist das Gesetz erlassen. In Kraft tritt es zu dem Zeitpunkt, den es selbst nennt – das kann derselbe Tag sein oder Monate später.',
        monitor: 'Die Nummer der Kundmachung, verlinkt ins Rechtsinformationssystem.',
      },
    ],
  },
  {
    id: 'weg-verordnung',
    name: 'Weg einer Verordnung',
    count: 'eine weitere Station',
    /* „Mehr als die Hälfte" rather than „zwei Drittel": the yearly share has
       been between 54 % and 75 % since 2016 (docs/architecture.md §12.16). On
       a static page the figure has to be right in five years too. The sentence
       stays regardless — without it the shorter path reads as the exception,
       and it is the more common case. */
    lede: 'Das ist der häufigere Weg: Mehr als die Hälfte aller Begutachtungen betrifft Verordnungen. Eine Verordnung regelt, was ein Gesetz dem Ministerium überlässt – Gebühren, Fristen, Grenzwerte, Formulare – und braucht keinen Beschluss des Nationalrats.',
    steps: [
      {
        /* ONE station, not two. „Erlassung durch das Ressort" would be a row
           with nothing observable behind it, and `app/utils/spine.ts` already
           carries the rule for exactly that: „Ausarbeitung im Ressort happens
           before anything is published … a row for it would be an empty
           promise." Between Fristende and Kundmachung nothing is visible from
           outside, and two rows saying „Im Monitor: nichts" in a row would be
           a wall of absence. When the Verordnung bar arrives (TODO) it thus
           has three rows, each of which can show something. */
        id: 'bundesgesetzblatt-ii',
        name: 'Bundesgesetzblatt II',
        text: 'Das Ministerium erlässt die überarbeitete Verordnung und macht sie im Bundesgesetzblatt Teil II kund – erst damit gilt sie. Eine Regierungsvorlage und einen Beschluss des Nationalrats gibt es hier nicht; zwischen Fristende und Kundmachung ist von außen nichts zu sehen.',
        monitor:
          'Die Kundmachung selbst: „Kundgemacht als BGBl. II Nr. 410/2024, 44 Tage nach Ende der Begutachtungsfrist“ – auf der Seite des Entwurfs und als Stand in der Liste. Gefunden wird sie über Titel, Ressort und Datum, also nicht lückenlos: Über 291 Verordnungsentwürfe seit 2024 gemessen findet der Abgleich 84,2\u00a0% der Kundmachungen, bei Fristen von vor mehr als einem Jahr 92,3\u00a0%. Zwischen Fristende und Kundmachung liegen im Median 57 Tage, in einem von zehn Fällen mehr als ein halbes Jahr.',
        link: {
          to: 'https://www.ris.bka.gv.at/Bgbl-Auth/',
          label: 'Bundesgesetzblatt II im RIS',
          external: true,
        },
      },
    ],
  },
]

/* One heading per section, in the page's order. Maintained by hand rather
   than read from the DOM: the page is static, and a list that generates
   itself would be JavaScript for something that changes twice a year. */
const toc = [
  { to: '#betrifft-mich', label: 'Betrifft mich das?' },
  { to: '#wirkung', label: 'Was eine Stellungnahme bewirkt' },
  { to: '#stationen', label: 'Der Weg eines Entwurfs' },
  { to: '#ohne-stellungnahmen', label: 'Warum manche Entwürfe keine Stellungnahmen zeigen' },
  { to: '#gegenueberstellung', label: 'Woher „Was ändert der Entwurf?“ kommt' },
  { to: '#vergleich', label: 'Wie wir Entwurf und Regierungsvorlage vergleichen' },
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
      <h2 id="toc-heading" class="font-sans text-sm font-medium text-ink">Auf dieser Seite</h2>
      <ul class="mt-2 space-y-1">
        <li v-for="item in toc" :key="item.to">
          <NuxtLink
            :to="item.to"
            class="tap-target text-sm link-quiet"
          >
            {{ item.label }}
          </NuxtLink>
        </li>
      </ul>
    </nav>

    <section id="betrifft-mich" class="page-section scroll-mt-6">
      <h2 class="section-heading">Betrifft mich das?</h2>

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
          class="link-inline font-medium"
        >die Liste der offenen Begutachtungen</NuxtLink>, der
        <a
          href="/feed.xml"
          class="link-inline font-medium"
        >RSS-Feed</a>
        und ein
        <!-- Points at /ueber instead of offering a webcal:// here. A webcal
             link visibly does nothing without a registered handler, and the
             working version of the offer already stands in one place:
             Apple/Outlook, Google and the address to enter by hand, with the
             subscribe-rather-than-import note. An explanatory text names the
             way, the mechanics stand where the buttons are. -->
        <NuxtLink
          to="/ueber#about-subscribe"
          class="link-inline font-medium"
        >Kalender-Abo aller Fristen</NuxtLink>.
      </p>
    </section>

    <!-- The design risk behind the mission, and the reason this page is
         prose at all:
         a tool that only counts what stayed without consequence proves that
         taking part is pointless. The sentence „Ministerien überarbeiten
         Entwürfe regelmäßig" used to stand once on the site, small and grey
         under an action card.

         NO figure in the running text. A rate that stands here ages unnoticed
         — on a page whose whole claim is checkability. The evidence is the
         list, which recomputes itself; the base rates over hundreds of
         Verfahren are a work package of their own. -->
    <section id="wirkung" class="page-section scroll-mt-6">
      <h2 class="section-heading">Was eine Stellungnahme bewirkt</h2>

      <p class="mt-3 leading-relaxed text-ink-secondary">
        Entwürfe ändern sich nach der Begutachtung – regelmäßig, nicht
        ausnahmsweise. Das Ministerium überarbeitet den Text, bevor er
        weitergeht, und die eingelangten Stellungnahmen liegen ihm dabei vor.
        Bisher war das kaum nachvollziehbar: Wer eine Stellungnahme abgegeben
        hatte, erfuhr in der Regel nicht, ob sich an der Stelle, um die es
        ging, etwas getan hat.
      </p>

      <p class="mt-4 leading-relaxed text-ink-secondary">
        Genau das zeigt der Monitor. Wo es die Fassungen gibt, stellt er sie
        nebeneinander und markiert, was sich Paragraph für Paragraph geändert
        hat. Und er zeigt die Entwürfe, aus denen nichts wurde: Ein Teil
        erreicht das Parlament nie, und eine Pflicht, das zu begründen, gibt
        es nicht.
      </p>

      <p class="mt-4 leading-relaxed text-ink-secondary">
        Was der Monitor <strong class="font-medium text-ink">nicht</strong>
        behauptet, ist der Zusammenhang. Dass ein Paragraph nach der
        Begutachtung anders lautet, heißt nicht, dass eine bestimmte
        Stellungnahme ihn geändert hat – Änderungen entstehen auch aus der
        Ressortabstimmung, aus EU-Vorgaben oder aus Rechtsförmlichkeit. Der
        Monitor zeigt, was sich geändert hat, und überlässt das Warum allen,
        die beides gelesen haben.
        Die Liste lässt sich
        <NuxtLink
          to="/entwuerfe?art=ministerialentwurf&sort=stellungnahmen"
          class="link-inline font-medium"
        >nach den meisten Stellungnahmen reihen</NuxtLink> – jede Zeile mit
        dem, was aus dem Entwurf geworden ist.
      </p>
    </section>

    <section id="stationen" class="page-section scroll-mt-6">
      <h2 class="section-heading">Der Weg eines Entwurfs</h2>
      <p class="mt-3 leading-relaxed text-ink-secondary">
        Die ersten beiden Stationen sind für jeden Entwurf dieselben. Danach
        trennen sich die Wege: Ein Gesetz geht über die Regierung ins
        Parlament, eine Verordnung erlässt das Ministerium selbst.
      </p>

      <!-- Numbers and text carry the sequence; the connecting line and the
           tiles are decorative (meaning never rides on colour or shape alone).
           The line runs on below the second station too — it does not end, it
           forks. -->
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
          <h3 class="pt-1.5 text-base font-semibold text-ink">
            <span class="sr-only">Schritt {{ i + 1 }}: </span>{{ step.name }}
          </h3>
          <p class="mt-2 leading-relaxed text-ink-secondary">{{ step.text }}</p>
          <p class="mt-2 text-sm text-ink-secondary">
            <span class="font-medium text-ink">Im Monitor:</span> {{ step.monitor }}
          </p>
          <p v-if="step.link" class="mt-2">
            <NuxtLink
              :to="step.link.to"
              class="tap-target text-sm font-medium link-quiet"
            >
              {{ step.link.label }}
            </NuxtLink>
          </p>
        </li>
      </ol>

      <!-- The fork carries no tile: it is not a station but the place where
           there are two. It is drawn by heading and text, not by a branching
           line — that would have to be `aria-hidden` anyway and does not
           survive 320 px. -->
      <div id="wege" class="scroll-mt-6 pl-14">
        <h3 class="text-base font-semibold text-ink">
          Nach der Begutachtung trennen sich die Wege
        </h3>
        <p class="mt-2 leading-relaxed text-ink-secondary">
          In beiden Fällen überarbeitet das Ministerium den Entwurf – die
          Stellungnahmen liegen ihm dabei vor. Was dann kommt, hängt davon ab,
          was der Entwurf ist: Ein Gesetz kann nur der Nationalrat
          beschließen, eine Verordnung erlässt das Ministerium selbst.
        </p>
      </div>

      <!-- p-4, the card padding of every box on the site since 02.10.2026. It
           was p-4 below sm already, because the indents add up here: page
           margin (16) + card padding + tile column. With p-5 and pl-14 about
           192 px of text column were left at 320 px, and
           „Rechtsinformationssystem" is wider than that. -->
      <section
        v-for="path in paths"
        :id="path.id"
        :key="path.id"
        class="mt-10 scroll-mt-6 rounded-xl border border-hairline bg-surface p-4"
      >
        <!-- The count moves to the next line whole or not at all: it broke
             as „drei weitere / Stationen" at 390 px (30.09.2026). -->
        <h3 class="text-base font-semibold text-ink">
          {{ path.name }}<span class="font-normal text-ink-muted">&nbsp;·</span>
          <span class="inline-block font-normal text-ink-muted">{{ path.count }}</span>
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
            <h4 class="pt-1.5 text-base font-semibold text-ink">
              <!-- „von M" only here, not on the shared stations: those are
                   steps 1 and 2 of both paths at once, and a total would
                   simply be wrong there. -->
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
                class="tap-target text-sm font-medium link-quiet"
              >
                {{ step.link.label }}
              </ExternalLink>
              <NuxtLink
                v-else
                :to="step.link.to"
                class="tap-target text-sm font-medium link-quiet"
              >
                {{ step.link.label }}
              </NuxtLink>
            </p>
          </li>
        </ol>
      </section>
    </section>

    <!-- The fork's consequence for what the reader sees on the rows. Its own
         section and not part of the fork, because it answers a different
         question: the fork explains the procedure, this section the sources —
         why some rows carry no number. The gaps in the official lists stand
         here too, because here somebody came looking for them; on a draft page
         they would be information about us given to a reader who asked about a
         draft. -->
    <section id="ohne-stellungnahmen" class="page-section scroll-mt-6">
      <h2 class="section-heading">
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
         here from its credit line („Methode", until 02.10.2026 „Wie wir
         prüfen" after its check sentence). It stands apart from
         the numbered lists because it describes a document, not a step of the
         procedure — but keeps the page's typography, because it answers the
         same kind of question. -->
    <section id="gegenueberstellung" class="page-section scroll-mt-6">
      <h2 class="section-heading">Woher „Was ändert der Entwurf?“ kommt</h2>

      <p class="mt-3 leading-relaxed text-ink-secondary">
        Zu den meisten Entwürfen legt das Ministerium eine
        <strong class="font-medium text-ink">Textgegenüberstellung</strong> bei:
        links die geltende Fassung, rechts die vorgeschlagene, in der Form, die
        ein Rundschreiben des Bundeskanzleramts vom 27.03.2002 vorschreibt. Der
        Text auf unserer Seite stammt aus diesem
        Dokument des Ministeriums, Wort für Wort. Verpflichtend ist die
        Gegenüberstellung nicht, und ein Entwurf, der ein neues Gesetz schafft,
        hat nichts gegenüberzustellen – fehlt sie, steht auf der Seite nur,
        dass es keine gibt.
      </p>

      <p class="mt-4 leading-relaxed text-ink-secondary">
        Von uns stammt die <strong class="font-medium text-ink">Markierung</strong>:
        Wir vergleichen die beiden Spalten Wort für Wort und heben hervor, was
        wegfällt und was dazukommt. Dieselbe Markierung und dieselben Abzeichen
        trägt der Vergleich nach der Begutachtung, Entwurf gegen
        Regierungsvorlage – auch er verlinkt hierher.
        {{ EDITORIAL_BADGE_SENTENCE }}
        Die Gegenüberstellung hält zwei Spalten desselben Paragraphen
        nebeneinander und kann deshalb keine Umnummerierung feststellen; hier
        zählt jeder geänderte Verweis als Änderung.
      </p>

      <p class="mt-4 leading-relaxed text-ink-secondary">
        Die linke Spalte behauptet, das geltende Recht zu sein – und das lässt
        sich nachsehen. Wir halten sie gegen den Text im
        <strong class="font-medium text-ink">RIS Bundesrecht</strong>, und zwar
        zum Beginn der Begutachtungsfrist: das ist der Stand, den das
        Ministerium beim Schreiben vor sich hatte.
      </p>

      <p class="mt-4 leading-relaxed text-ink-secondary">
        Auch die rechte Spalte prüfen wir: Was dort als
        <strong class="font-medium text-ink">neu</strong> markiert ist, darf im
        geltenden Paragraphen nicht schon stehen – sonst fehlt links Text, und
        der Entwurf wirkt umfangreicher, als er ist. Und es muss in den
        <strong class="font-medium text-ink">Novellierungsanordnungen</strong>
        vorkommen, die der Entwurf für diesen Paragraphen trifft.
      </p>

      <p class="mt-4 leading-relaxed text-ink-secondary">
        Was dabei herauskommt, zählt der Kopf jedes Gesetzes, Paragraph für
        Paragraph; was nicht aufging, steht auch am Paragraphen selbst.
        Bestätigte Paragraphen bleiben ohne Hinweis, ebenso neu eingefügte:
        Sie haben keinen geltenden Text und brauchen keine Prüfung. Zwei
        Ergebnisse brauchen eine Erklärung:
      </p>

      <dl class="mt-4 space-y-3 leading-relaxed text-ink-secondary">
        <div>
          <dt class="font-medium text-ink">„nicht gezeigt“</dt>
          <dd>
            Eine der drei Prüfungen ist nicht aufgegangen: Die Zeile gehört
            nicht zu ihrem Paragraphen, oder die Beilage legt einen älteren
            Stand des Gesetzes zugrunde. Wir zeigen dort keinen Vergleich statt
            eines falschen; an seiner Stelle steht, welche Prüfung es war. Was
            sich ändert, sagt die Beilage des Ministeriums, die unter der
            Gegenüberstellung verlinkt ist.
          </dd>
        </div>
        <div>
          <dt class="font-medium text-ink">„nicht geprüft“</dt>
          <dd>
            Die Änderung betrifft geltendes Recht, aber wir finden nichts, wogegen
            sich prüfen ließe: Das RIS führt den Paragraphen nicht oder gliedert
            ihn so, dass sich seine Absätze nicht auseinanderhalten lassen, das
            geänderte Gesetz lässt sich im RIS nicht finden, oder die Beilage
            grenzt ihre Gesetze nicht ab. Das ist kein Befund über den Entwurf,
            sondern einer über die Prüfbarkeit. Lief die Prüfung für einen
            ganzen Entwurf nicht, steht der Grund über der Gegenüberstellung.
          </dd>
        </div>
      </dl>

      <p class="mt-4 leading-relaxed text-ink-secondary">
        Ein Vorbehalt zum Schluss: Bei einem Teil der Entwürfe veröffentlicht
        das RIS die Beilage nur als Bild. Dann lesen wir das PDF des
        Ministeriums und erschließen aus dem Seitenlayout, welche Zeile links
        zu welcher Zeile rechts gehört. Der Text ist auch dort der des
        Ministeriums – die Zuordnung ist unsere, und sie kann danebenliegen.
        Auf solchen Seiten nennt die Quellenzeile das:
        „Zeilenzuordnung: Begutachtungs-Monitor“. Ein „nicht gezeigt“ kann dort
        auch an unserer Zuordnung liegen.
      </p>

      <!-- Since 30.09.2026 the only place the Lesefassung explains itself:
           each disclosure on a draft page says „Nicht amtliche Lesefassung"
           and links here. -->
      <h3 id="lesefassung" class="mt-8 scroll-mt-6 text-base font-semibold text-ink">Die Lesefassung</h3>
      <p class="mt-2 leading-relaxed text-ink-secondary">
        Bei manchen Paragraphen lässt sich aufklappen, wie die Bestimmung nach
        dem Entwurf ganz lauten würde. Das ist keine amtliche Fassung: Wir
        nehmen den geltenden Text aus dem RIS und wenden die Anweisungen des
        Entwurfs darauf an. Gezeigt wird das Ergebnis nur, wo die
        Gegenüberstellung des Ministeriums zum selben Text kommt. Fehlt die
        Lesefassung bei einem Paragraphen, heißt das nicht, dass er gleich
        bleibt – nur, dass wir sie nicht bestätigen konnten.
      </p>
    </section>

    <!-- The comparison AFTER the Begutachtung, since 30.09.2026 with an
         address of its own: its method link (since 02.10.2026 „Methode" in
         the credit line, „Wie wir vergleichen" before) used to land on
         the Gegenüberstellung above, which explains a different document,
         and its method sentence stood on every draft page instead. -->
    <section id="vergleich" class="page-section scroll-mt-6">
      <h2 class="section-heading">Wie wir Entwurf und Regierungsvorlage vergleichen</h2>
      <p class="mt-3 leading-relaxed text-ink-secondary">
        Nach der Begutachtung vergleichen wir die Texte selbst: den Entwurf mit
        der Regierungsvorlage, und weiter mit den Fassungen aus Ausschuss,
        Plenum und Bundesgesetzblatt. Ein Gesetz, das ein bestehendes ändert,
        besteht aus nummerierten Änderungsanordnungen (Z&nbsp;1, Z&nbsp;2&nbsp;…) – verglichen
        wird dann Anordnung für Anordnung. Ein neues Gesetz vergleichen wir
        Paragraph für Paragraph.
      </p>
      <p class="mt-4 leading-relaxed text-ink-secondary">
        Wie viel die Regierungsvorlage am Entwurf geändert hat, zählen wir an
        den Einheiten des Entwurfs – Änderungsanordnungen, auf der Seite kurz
        „Änderungen“, oder Paragraphen: wie viele davon sie umgeschrieben oder
        gestrichen hat. Was sie neu hinzufügt, zählt nicht mit, redaktionelle
        Änderungen auch nicht. {{ EDITORIAL_BADGE_SENTENCE }}
        Verglichen wird dieser Anteil mit den Entwürfen einer abgeschlossenen
        Gesetzgebungsperiode – welcher, steht am Balken; „üblich“ heißt die
        mittlere Hälfte von ihnen, ein Viertel lag darunter, ein Viertel
        darüber. Kam die Vorlage noch während der Begutachtung, fehlt dieser
        Vergleich: Die Spanne wurde an Vorlagen gemessen, die danach kamen.
      </p>
      <p class="mt-4 leading-relaxed text-ink-secondary">
        Auch die Erläuterungen beider Fassungen halten wir gegeneinander.
        Gezählt werden nur Begründungen, die in beiden Fassungen zur selben
        Änderung stehen, und davon die, die das Ressort umgeschrieben hat. Ob
        eine Änderung auf eine Stellungnahme zurückgeht, sagt keiner der
        beiden Vergleiche.
      </p>
    </section>

    <!-- „Nachverfolgung, nicht Bewertung" has stood only on /ueber since
         18.09.2026, where it belongs: a statement about the project, not about
         the procedure. It stood here word for word a second time. -->
    <p class="mt-12 leading-relaxed text-ink-secondary">
      <NuxtLink
        to="/ueber"
        class="link-inline"
      >Mehr über das Projekt</NuxtLink>
      – wer es macht, woher die Daten kommen und was es noch nicht kann.
    </p>
  </div>
</template>

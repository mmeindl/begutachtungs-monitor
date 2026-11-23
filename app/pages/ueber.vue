<script setup lang="ts">
import { LAND_CODES, LAND_NAME } from '#shared/utils/laender'
import { feedUrlsOf } from '~/composables/useFeedUrls'
import { REPORT_LABEL_DE } from '~/utils/contact'

usePageSeo({
  title: 'Über das Projekt',
  description:
    'Worum es beim Begutachtungs-Monitor geht, wie er funktioniert, woher die Daten stammen und wo seine Grenzen liegen.',
})

const { webcalUrl, googleCalUrl, icsDisplayUrl } = useFeedUrls()
const { siteUrl } = useRuntimeConfig().public
const contact = useContact()
</script>

<template>
  <div class="mx-auto w-full max-w-2xl">
    <h1 class="page-title">
      Über das Projekt
    </h1>

    <ProseSection id="about-mission" heading="Worum es geht" first>
      <!-- 16.11.2026: the section still described the Bund's Begutachtung
           alone. It follows the order of the monitor's goal: a law through
           its making, where one can take part, what became of the input,
           and then the other routes. -->
      <p>
        Der Begutachtungs-Monitor folgt einem Gesetz durch seine Entstehung
        und zeigt, wo man sich beteiligen kann. Er beginnt in der
        Begutachtung, in der jede und jeder Stellung nehmen kann: welche
        Entwürfe des Bundes und der neun Länder gerade offen sind, wann die
        Fristen enden und welche Organisationen Stellung genommen haben.
      </p>
      <p>
        Genauso wichtig ist der Blick zurück: Was wurde aus dem Entwurf und
        aus den Stellungnahmen? Der Monitor verfolgt den Weg vom Entwurf über
        die Regierungsvorlage und das Parlament bis zur Kundmachung,
        vergleicht die Fassungen, wo die Quellen es zulassen, und zeigt
        Änderungen so deutlich wie Stillstand. Nachverfolgung, nicht
        Bewertung.
      </p>
      <p>
        Dazu kommen Gesetze, die ohne Begutachtung entstehen, das EU-Recht
        von der Konsultation der Kommission bis zur Umsetzung in Österreich
        und die Anliegen an das Parlament: Petitionen, Bürgerinitiativen und
        Volksbegehren. Alle Wege auf einen Blick zeigt die Seite
        <NuxtLink to="/wege" class="link-inline">Wege</NuxtLink>.
      </p>
      <!-- Phrased as a question, not as a plan: a question the tool asks
           does not age, a roadmap does. That is exactly what the section
           „Woran gearbeitet wird" failed on — it never stood a single day
           without one of its items already being out of date. -->
      <p>
        Über viele Verfahren hinweg wird daraus eine Frage, die bisher
        niemand beantworten kann: Wie oft ändern sich Entwürfe nach der
        Begutachtung tatsächlich?
      </p>
    </ProseSection>

    <!-- 16.11.2026: one job per page. Licences stand on /quellen, the names
         rule and what the site does not do on /datenschutz, what a source
         publishes on /datenlage. This section names them and links; it
         repeats none of them. -->
    <ProseSection id="about-how" heading="Wie es funktioniert">
      <p>
        Alle Daten stammen aus amtlichen Quellen: vom Parlament, aus dem
        Rechtsinformationssystem des Bundes, von den Seiten der neun Länder
        und ihrer Landtage, aus EUR-Lex und von der Europäischen Kommission.
        Der Monitor ruft sie bei Bedarf ab und hält sie kurz im
        Zwischenspeicher; eine eigene Datenbank gibt es nicht.
      </p>
      <ul>
        <li>
          <NuxtLink to="/quellen" class="link-inline">Quellen &amp; Lizenzen</NuxtLink>:
          welche Quelle unter welcher Lizenz steht.
        </li>
        <li>
          <NuxtLink to="/datenlage" class="link-inline">Datenlage</NuxtLink>:
          was jede Quelle veröffentlicht und was nicht.
        </li>
        <li>
          <NuxtLink to="/datenschutz" class="link-inline">Datenschutz</NuxtLink>:
          keine Konten, kein Tracking, keine Drittanbieter; Privatpersonen
          werden gezählt, nie genannt.
        </li>
      </ul>
      <!-- Voluntary, and deliberately without the article number: no text
           the site shows about a draft is model-generated, and its own
           copy is reviewed and owned by the Medieninhaber — the human-review
           exception of Art 50(4) AI Act. Citing it here would read as a
           legal opinion; the facts are what a reader can check. If a model
           ever produces what a page shows, this paragraph stops being true. -->
      <p>
        Beim Programmieren und Formulieren hilft ein KI-Assistent. Was der
        Monitor zu einem Entwurf zeigt, erzeugt aber kein Sprachmodell:
        Fristen, Zahlen und Texte kommen aus den amtlichen Quellen, die
        Vergleiche rechnet gewöhnliche Software, und beim Aufruf einer Seite
        wird kein KI-System befragt. Jeden Text dieser Website hat der
        Medieninhaber geprüft und verantwortet ihn.
      </p>
    </ProseSection>

    <ProseSection id="about-subscribe" heading="Abonnieren">
      <p>
        Neue Begutachtungsverfahren gibt es als
        <ExternalLink href="/feed.xml" class="link-inline">RSS-Feed</ExternalLink> für jeden
        Feed-Reader. Alle Begutachtungsfristen lassen sich als Kalender
        abonnieren:
        <a :href="webcalUrl" class="link-inline">Fristen-Kalender abonnieren</a>
        (Apple Kalender, Outlook),
        <ExternalLink
          :href="googleCalUrl"
          class="link-inline"
        >zu Google Kalender hinzufügen</ExternalLink>
        – oder die Adresse
        <span class="select-all font-medium text-ink">{{ icsDisplayUrl }}</span>
        manuell als Kalender-Abo eintragen. Beides funktioniert ohne
        Registrierung, mit dem Kalender oder Feed-Reader, den man ohnehin
        nutzt.
      </p>
      <p>
        Feed und Kalender oben gelten für die Entwürfe des Bundes. Jedes Land,
        das der Monitor liest, hat einen eigenen:
        <template v-for="(land, i) in LAND_CODES" :key="land"><template v-if="i">, </template>{{ LAND_NAME[land] }}
          (<ExternalLink :href="`/feed.xml?quelle=${land}`" class="link-inline">RSS</ExternalLink>,
          <a :href="feedUrlsOf(siteUrl, land).webcalUrl" class="link-inline">Kalender</a>)</template>.
        Über den Listen wählt man die Quelle des Abos direkt vor den Links.
      </p>
    </ProseSection>

    <ProseSection id="about-a11y" heading="Barrierefreiheit">
      <p>
        Der Monitor zielt auf WCAG 2.2, Konformitätsstufe AAA: alle
        Textfarben erreichen mindestens ein Kontrastverhältnis von 7:1,
        Bedeutung hängt nie an Farbe allein, und die Seite ist vollständig
        per Tastatur nutzbar. Eine bewusste Ausnahme ist die Größe der
        Bedienelemente: auf Touch-Geräten mindestens 44 Pixel, mit der Maus
        mindestens 36 – das erfüllt Stufe AA, nicht AAA.
        Reduzierte Bewegung wird respektiert. Links auf fremde Seiten öffnen
        durchgehend ein neues Fenster und sagen es an.
        Wer dennoch auf eine Barriere
        stößt, hilft dem Projekt mit einem Hinweis an
        <a
          :href="contact.mailto"
          class="link-inline"
        >{{ contact.email }}</a>.
      </p>
    </ProseSection>

    <ProseSection id="about-history" heading="Vorgeschichte">
      <p>
        <ExternalLink
          href="https://github.com/Forum-Informationsfreiheit/OffenesParlament"
          class="link-inline"
        >OffenesParlament.at</ExternalLink>, ein Projekt des Forum Informationsfreiheit, hat
        Ministerialentwürfe in Begutachtung schon vor rund zehn Jahren
        beobachtbar gemacht, inklusive E-Mail-Benachrichtigungen. Es blieb in
        der Beta und ist seit Jahren offline; der Quellcode ist unter der
        BSD-2-Clause-Lizenz archiviert. Der Begutachtungs-Monitor baut diesen
        Ausschnitt auf den heutigen offiziellen Schnittstellen neu – und
        ergänzt, was damals nicht versucht wurde: die Nachverfolgung, was aus
        den Entwürfen wurde.
      </p>
    </ProseSection>

    <!-- 18.11.2026: the answer to „how far can I rely on it?", in one place
         a reader can link. Until then the site said only what the monitor
         is not (Impressum, footer, „Grenzen"). Three statements, each one
         the code keeps: what is passed through is the source's; what is
         derived is ours and says so; a missing assignment proves no
         absence. The figures stand on /genauigkeit (the comparisons, since
         19.11.2026) and /datenlage#gemessen (the joins), the legal sentence
         on /impressum#imp-data; none is repeated here. -->
    <ProseSection id="about-reliability" heading="Wie verlässlich die Angaben sind">
      <p>
        Fristen, Zahlen und Dokumente übernimmt der Monitor aus den
        amtlichen Quellen und verlinkt jede Angabe auf ihr Original. Sie
        sind so vollständig und so richtig wie die Quelle selbst.
      </p>
      <p>
        Was der Monitor selbst ableitet, sagt er dazu: welche
        Regierungsvorlage und welche Kundmachung zu einem Entwurf gehören,
        wo die Quelle es nicht nennt, und die Textvergleiche. Unter jedem
        solchen Abschnitt steht, was vom Monitor stammt, und „Methode“ öffnet
        dort, wie es entsteht. Eine fehlende
        Zuordnung heißt, dass der Monitor keine gefunden hat, nicht, dass es
        keine gibt. Wo etwas fehlt, steht dabei, warum. Wie die Ableitungen
        geprüft sind und was dabei herauskommt, steht für die Textvergleiche unter
        <NuxtLink to="/genauigkeit" class="link-inline">Genauigkeit</NuxtLink>,
        für die Zuordnungen unter
        <NuxtLink to="/datenlage#gemessen" class="link-inline">Datenlage</NuxtLink>.
        Was bei den Textvergleichen nicht gemessen ist, steht ebenfalls unter Genauigkeit.
      </p>
      <p>
        Der Monitor ist
        <NuxtLink to="/impressum#imp-data" class="link-inline">kein amtliches Angebot</NuxtLink>.
        Wo es darauf ankommt, gilt das verlinkte Original.
      </p>
    </ProseSection>

    <!-- Concrete limits rather than a blanket label (the word „Prototyp"
         devalued the data and warned nobody about the text comparison,
         where an error can actually arise). No date and no claim about the
         rest of the site: both went stale (16.11.2026). -->
    <ProseSection id="about-status" heading="Grenzen">
      <ul>
        <li>
          Der Textvergleich ist eine Ableitung, keine amtliche Fassung. Bei
          Novellen vergleicht er die Änderungs<em>anweisungen</em>; wie das
          Gesetz danach lautet, zeigt der Monitor nur für die
          Paragraphen, die die Textgegenüberstellung des Ministeriums
          bestätigt oder bei denen der Gesetzestext des Entwurfs in zwei
          Fassungen (XML und PDF) dasselbe sagt wie unser Ergebnis; dort
          steht beim Paragraphen, worin die Textgegenüberstellung abweicht.
          Im Zweifel gilt das verlinkte Original. Welche Fehler
          seine Prüfungen fangen und welche nicht, steht unter
          <NuxtLink to="/genauigkeit" class="link-inline">Genauigkeit</NuxtLink>.
        </li>
        <li>
          Benachrichtigungen gibt es nur als Feed und Kalender, nicht per
          E-Mail.
        </li>
        <li>
          Es wird keine Historie geführt: Fristverlängerungen und das
          Anwachsen der Stellungnahmen sind im Nachhinein nicht ablesbar.
          Angekündigte, noch nicht gestartete Begutachtungen kennen die
          Quellen nicht.
        </li>
      </ul>
    </ProseSection>

    <!-- 16.11.2026: says in so many words who receives the money and that
         nothing is given for it. The recipient is the Medieninhaber as a
         private person; no organisation collects for the monitor. The
         Impressum's „Beteiligungsverhältnisse" says the same; change both
         together. -->
    <ProseSection id="about-support" heading="Unterstützen">
      <p>
        Der Monitor ist werbefrei und ohne Bezahlschranke; Betrieb und
        Weiterentwicklung trägt Manuel Meindl als Privatperson. Wer das
        Projekt unterstützen möchte, kann das über
        <ExternalLink
          href="https://liberapay.com/manuelmeindl/donate"
          class="link-inline"
        >Liberapay</ExternalLink>
        tun – oder per Überweisung an Manuel Meindl, IBAN
        <span class="select-all font-medium text-ink">AT59 1501 3002 3104 4157</span>.
        Beiträge sind freiwillige Zuwendungen an ihn persönlich, ohne
        Gegenleistung: Sie decken Server und Domain, was darüber hinausgeht,
        fließt in die Weiterentwicklung. Steuerlich absetzbar sind sie
        nicht.
      </p>
    </ProseSection>

    <!-- The address and what to do about a mistake (17.11.2026). „Fragen,
         Hinweise und Feedback" asked nobody in particular; the invitation
         to work with the project is the footer's first line, on every
         page. -->
    <ProseSection id="about-contact" heading="Kontakt">
      <p>
        Eine Adresse für alles:
        <a
          :href="contact.mailto"
          class="link-inline"
        >{{ contact.email }}</a>. Es antwortet Manuel Meindl.
      </p>
      <p>
        Eine Angabe stimmt nicht, ein Paragraph ist falsch zugeordnet, etwas
        fehlt oder ist schwer zu verstehen: Jeder solche Hinweis hilft, per
        E-Mail oder als
        <ExternalLink
          href="https://github.com/mmeindl/begutachtungs-monitor/issues"
          class="link-inline"
        >GitHub-Issue</ExternalLink>.
        Wo der Monitor selbst vergleicht, zählt oder einordnet, steht unter
        dem Abschnitt „{{ REPORT_LABEL_DE }}“; der Link dort trägt die Seite gleich in
        die Nachricht ein.
      </p>
    </ProseSection>
  </div>
</template>

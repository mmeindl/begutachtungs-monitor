<script setup lang="ts">
useSeoMeta({
  title: 'Über das Projekt',
  description:
    'Worum es beim Begutachtungs-Monitor geht, wie er funktioniert, woher die Daten stammen und warum Privatpersonen nicht namentlich genannt werden.',
})

const { webcalUrl, googleCalUrl, icsDisplayUrl } = useFeedUrls()
</script>

<template>
  <div class="mx-auto w-full max-w-2xl">
    <h1 class="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
      Über das Projekt
    </h1>

    <div class="mt-10 space-y-20">
      <section aria-labelledby="about-mission">
        <h2 id="about-mission" class="section-heading">
          Worum es geht
        </h2>
        <p class="mt-3 leading-relaxed text-ink-secondary">
          Bevor ein Gesetzesentwurf ins Parlament kommt, legen ihn die
          Ministerien zur öffentlichen Begutachtung auf – jede und jeder kann
          eine Stellungnahme abgeben. Der Begutachtungs-Monitor macht diese
          Phase sichtbar: welche Entwürfe gerade offen sind, wann Fristen enden
          und wie viele Stellungnahmen eingehen.
        </p>
        <p class="mt-3 leading-relaxed text-ink-secondary">
          Genauso wichtig ist der Blick zurück: Was wurde aus dem Input? Der
          Monitor verfolgt den Weg vom Ministerialentwurf über die
          Regierungsvorlage bis zur Kundmachung im Bundesgesetzblatt – und
          zeigt Verfahren mit weiterem Verlauf genauso wie Verfahren ohne.
          Nachverfolgung, nicht Bewertung.
        </p>
        <!-- Phrased as a question, not as a plan: a question the tool asks
             does not age, a roadmap does. That is exactly what the section
             „Woran gearbeitet wird" failed on — it never stood a single day
             without one of its items already being out of date. -->
        <p class="mt-3 leading-relaxed text-ink-secondary">
          Über viele Verfahren hinweg wird daraus eine Frage, die bisher
          niemand beantworten kann: Wie oft ändern sich Entwürfe nach der
          Begutachtung tatsächlich?
        </p>
      </section>

      <section aria-labelledby="about-how">
        <h2 id="about-how" class="section-heading">
          Wie es funktioniert
        </h2>
        <p class="mt-3 leading-relaxed text-ink-secondary">
          Alle Daten stammen aus den amtlichen Schnittstellen des
          <ExternalLink
            href="https://www.parlament.gv.at/recherchieren/open-data/"
            class="link-inline"
          >österreichischen Parlaments</ExternalLink>
          und des
          <ExternalLink
            href="https://www.ris.bka.gv.at"
            class="link-inline"
          >Rechtsinformationssystems des Bundes</ExternalLink>. Der Monitor
          ruft sie bei Bedarf ab und hält sie rund 30 Minuten im
          Zwischenspeicher; eine eigene Datenbank gibt es nicht. Es gibt keine
          Konten, kein Tracking und keine Cookies.
        </p>
      </section>

      <section aria-labelledby="about-subscribe">
        <h2 id="about-subscribe" class="section-heading">
          Abonnieren
        </h2>
        <p class="mt-3 leading-relaxed text-ink-secondary">
          Neue Begutachtungsverfahren gibt es als
          <a href="/feed.xml" class="link-inline">RSS-Feed</a> für jeden
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
          manuell als Kalender-Abo eintragen. Wichtig: abonnieren, nicht
          importieren – nur ein Abo aktualisiert sich automatisch, wenn
          Fristen dazukommen oder verlängert werden. Beides funktioniert ohne
          Registrierung, mit dem Kalender oder Feed-Reader, den man ohnehin
          nutzt.
        </p>
      </section>

      <section aria-labelledby="about-license">
        <h2 id="about-license" class="section-heading">
          Daten &amp; Lizenz
        </h2>
        <p class="mt-3 leading-relaxed text-ink-secondary">
          Textgegenüberstellungen, geltendes Bundesrecht, das
          Bundesgesetzblatt und die Erläuterungen der Ressorts stammen aus dem
          Rechtsinformationssystem des Bundes, die Stationen nach der
          Begutachtung – Regierungsvorlage, Ausschuss- und Plenarfassung – von
          der Parlamentsdirektion, deren Ergebnislisten unter
          <ExternalLink
            href="https://creativecommons.org/licenses/by/4.0/deed.de"
            class="link-inline"
          >CC BY 4.0</ExternalLink>
          stehen und deren Dokumente das Parlament als freie Werke bezeichnet;
          die RIS-Daten stehen unter CC BY 4.0.
          Den Gesetzestext und die Erläuterungen eines Ministerialentwurfs
          liest der Textvergleich in der Fassung, die das Parlament
          veröffentlicht; dieselben Dokumente führt das RIS unter CC BY 4.0.
        </p>
        <p class="mt-3 leading-relaxed text-ink-secondary">
          Für das Begutachtungsverfahren selbst – Ministerialentwürfe,
          Stellungnahmen und Zustimmungen – weist das Parlament keine
          Open-Data-Lizenz aus. Der Monitor zeigt daraus Metadaten – Fristen,
          Geschäftszahlen, Anzahl der Einreichungen und die Namen
          einreichender Organisationen –, die Kurzinformation des Parlaments
          zum Entwurf („Worum geht es?“) und im Textvergleich den Gesetzestext
          und die Erläuterungen des Entwurfs. Volltexte von Stellungnahmen
          übernimmt er nicht, sondern verlinkt sie auf parlament.gv.at; Namen
          von Privatpersonen veröffentlicht er nicht. Welche Lizenz für
          welchen Datensatz gilt, steht
          <NuxtLink
            to="/impressum#imp-license"
            class="link-inline"
          >im Impressum</NuxtLink>.
        </p>
      </section>

      <section aria-labelledby="about-privacy">
        <h2 id="about-privacy" class="section-heading">
          Privatpersonen &amp; DSGVO
        </h2>
        <p class="mt-3 leading-relaxed text-ink-secondary">
          Stellungnahmen kommen auch von Privatpersonen, die auf
          parlament.gv.at namentlich erscheinen. Dass das Parlament diese Namen
          veröffentlicht, ist keine Rechtfertigung, sie systematisch
          weiterzuverbreiten. Der Monitor nennt deshalb keine Namen von
          Privatpersonen: Sie erscheinen hier als „Privatperson“ und fließen in
          die Zählungen ein. Organisationen – Kammern, Verbände, Vereine,
          Ministerien, Unternehmen – werden namentlich genannt. Im Zweifel wird
          ein Name als Privatperson behandelt.
        </p>
      </section>

      <section aria-labelledby="about-a11y">
        <h2 id="about-a11y" class="section-heading">
          Barrierefreiheit
        </h2>
        <p class="mt-3 leading-relaxed text-ink-secondary">
          Der Monitor zielt auf WCAG 2.2, Konformitätsstufe AAA: alle
          Textfarben erreichen mindestens ein Kontrastverhältnis von 7:1,
          Bedienelemente sind mindestens 44 Pixel groß, Bedeutung hängt nie an
          Farbe allein, und die Seite ist vollständig per Tastatur nutzbar.
          Reduzierte Bewegung wird respektiert. Links auf fremde Seiten öffnen
          durchgehend ein neues Fenster und sagen es an.
          Wer dennoch auf eine Barriere
          stößt, hilft dem Projekt mit einem Hinweis an
          <a
            href="mailto:kontakt@begutachtungs-monitor.at"
            class="link-inline"
          >kontakt@begutachtungs-monitor.at</a>.
        </p>
      </section>

      <section aria-labelledby="about-sovereignty">
        <h2 id="about-sovereignty" class="section-heading">
          Digitale Souveränität
        </h2>
        <p class="mt-3 leading-relaxed text-ink-secondary">
          Der Monitor lädt zur Laufzeit keine Ressourcen von Drittanbietern:
          keine externen Schriften, keine Icon- oder Skript-CDNs, keine
          Analytik. Betrieb und Hosting sind auf europäische, EU-eigene
          Infrastruktur ausgelegt; die beiden Amtsquellen oben sind
          österreichische.
        </p>
      </section>

      <section aria-labelledby="about-history">
        <h2 id="about-history" class="section-heading">
          Vorgeschichte
        </h2>
        <p class="mt-3 leading-relaxed text-ink-secondary">
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
      </section>

      <!-- Concrete limits rather than a blanket label: the label devalued the
           metadata, which mirror the official interface unaltered, and warned
           nobody about the text comparison, where an error can actually arise.
           Keep it current as the site grows — this list IS the status
           report. -->
      <section aria-labelledby="about-status">
        <h2 id="about-status" class="section-heading">Status</h2>
        <p class="mt-3 leading-relaxed text-ink-secondary">
          Stand: September 2026. Der Monitor läuft im Dauerbetrieb; was er
          zeigt, stammt unverändert aus der amtlichen Schnittstelle und ist
          bei jeder Angabe dorthin verlinkt. Drei Grenzen sind derzeit
          bekannt:
        </p>
        <ul
          class="mt-3 list-disc space-y-2 pl-5 leading-relaxed text-ink-secondary marker:text-ink-muted"
        >
          <li>
            Der Textvergleich ist eine Ableitung, keine amtliche Fassung. Bei
            Novellen vergleicht er die Änderungs<em>anweisungen</em>, nicht
            den Gesetzestext, wie er danach lautet. Im Zweifel gilt das
            verlinkte Original.
          </li>
          <li>
            Benachrichtigungen gibt es nur als Feed und Kalender, nicht per
            E-Mail.
          </li>
          <li>
            Es wird keine Historie geführt: Fristverlängerungen und das
            Anwachsen der Stellungnahmen sind im Nachhinein nicht ablesbar.
            Angekündigte, noch nicht gestartete Begutachtungen kennt die
            Schnittstelle nicht.
          </li>
        </ul>
        <p class="mt-3 leading-relaxed text-ink-secondary">
          „Begutachtungs-Monitor“ ist ein Arbeitstitel. Das Projekt ist ein
          unabhängiges Civic-Tech-Vorhaben und steht in keiner Verbindung zum
          Parlament oder zu Bundesministerien.
        </p>
      </section>

      <section aria-labelledby="about-contact">
        <h2 id="about-contact" class="section-heading">
          Kontakt
        </h2>
        <p class="mt-3 leading-relaxed text-ink-secondary">
          Fragen, Hinweise und Feedback:
          <a
            href="mailto:kontakt@begutachtungs-monitor.at"
            class="link-inline"
          >kontakt@begutachtungs-monitor.at</a>. Fehler und Vorschläge gerne auch als
          <ExternalLink
            href="https://github.com/mmeindl/begutachtungs-monitor/issues"
            class="link-inline"
          >GitHub-Issue</ExternalLink>.
        </p>
      </section>
    </div>
  </div>
</template>

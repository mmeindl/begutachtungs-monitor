<script setup lang="ts">
/**
 * Offenlegung under § 25 MedienG.
 *
 * Why at all: a website is a periodisches elektronisches Medium (§ 1 Abs 1
 * Z 5a lit c MedienG). The disclosure duty does not depend on commercial
 * operation — the ECG with its "in der Regel gegen Entgelt" does not (yet)
 * apply here, the MedienG does.
 *
 * Why the full disclosure: the "kleine Website" relief of § 25 Abs 5 applies
 * only to sites without content capable of influencing public opinion. That
 * is exactly this project's purpose — claiming the relief would mean arguing
 * against our own case. So including Beteiligungsverhältnisse (§ 25 Abs 2)
 * and grundlegende Richtung (§ 25 Abs 4).
 *
 * Why the Wohnort and no postal address: § 25 Abs 2 asks for the Wohnort, not
 * the delivery address. A full address first becomes necessary when
 *   (a) the ECG applies — funding, donations, advertising; § 5 ECG wants the
 *       geographic address —, or
 *   (b) e-mail notifications arrive: a mailing list is a wiederkehrendes
 *       elektronisches Medium (§ 1 Abs 1 Z 5a lit d) and triggers § 24 Abs 3
 *       MedienG (name AND address).
 * Both are foreseeable, neither has happened.
 *
 * § 25 Abs 1 asks for "ständig leicht und unmittelbar auffindbar": hence the
 * footer link on every page. Not in the main navigation — that is capped at
 * four entries, and nobody looks for this page there.
 */
useSeoMeta({
  title: 'Impressum & Offenlegung',
  description:
    'Offenlegung nach § 25 Mediengesetz: Medieninhaber, Unternehmensgegenstand, Beteiligungsverhältnisse und grundlegende Richtung des Begutachtungs-Monitors.',
})
</script>

<template>
  <div class="mx-auto w-full max-w-2xl">
    <h1 class="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
      Impressum &amp; Offenlegung
    </h1>
    <p class="mt-4 leading-relaxed text-ink-secondary">
      Offenlegung nach § 25 Mediengesetz.
    </p>

    <div class="mt-10 space-y-20">
      <section aria-labelledby="imp-owner">
        <h2 id="imp-owner" class="section-heading">
          Medieninhaber &amp; Herausgeber
        </h2>
        <!-- <address> is the semantic element for the contact block of its
             nearest section; the browser default italic is the only reason
             for not-italic. -->
        <address class="mt-3 not-italic leading-relaxed text-ink-secondary">
          Manuel Meindl<br>
          Wohnort: Linz, Österreich<br>
          E-Mail:
          <a
            href="mailto:kontakt@begutachtungs-monitor.at"
            class="link-inline"
          >kontakt@begutachtungs-monitor.at</a>
        </address>
        <p class="mt-3 leading-relaxed text-ink-secondary">
          Der Begutachtungs-Monitor ist ein privates, nichtkommerzielles
          Civic-Tech-Projekt einer Einzelperson. Er steht in keiner Verbindung
          zum Parlament, zu einem Bundesministerium oder zum Arbeitgeber des
          Medieninhabers.
        </p>
      </section>

      <section aria-labelledby="imp-object">
        <h2 id="imp-object" class="section-heading">
          Unternehmensgegenstand
        </h2>
        <p class="mt-3 leading-relaxed text-ink-secondary">
          Betrieb einer nichtkommerziellen Informationsplattform zum
          österreichischen Begutachtungsverfahren: Aufbereitung öffentlich
          zugänglicher Daten zu Ministerialentwürfen, Begutachtungsfristen und
          Stellungnahmen sowie Nachverfolgung des weiteren Verlaufs bis zur
          Kundmachung im Bundesgesetzblatt.
        </p>
      </section>

      <section aria-labelledby="imp-shares">
        <h2 id="imp-shares" class="section-heading">
          Beteiligungsverhältnisse
        </h2>
        <p class="mt-3 leading-relaxed text-ink-secondary">
          Medieninhaber ist eine natürliche Person. Es bestehen keine
          Beteiligungen anderer Personen oder Unternehmen, keine stillen
          Beteiligungen und keine Treuhandverhältnisse. Das Projekt wird nicht
          finanziert, weder durch Förderungen noch durch Spenden, Werbung oder
          Auftraggeber. Sollte sich das ändern, steht es hier.
        </p>
      </section>

      <section aria-labelledby="imp-line">
        <h2 id="imp-line" class="section-heading">
          Grundlegende Richtung (Blattlinie)
        </h2>
        <p class="mt-3 leading-relaxed text-ink-secondary">
          Der Begutachtungs-Monitor macht die Begutachtungsphase der
          österreichischen Gesetzgebung sichtbar und verfolgt nach, was aus
          den eingebrachten Stellungnahmen wird. Übernommene Anregungen
          werden so deutlich gezeigt wie übergangene.
        </p>
        <p class="mt-3 leading-relaxed text-ink-secondary">
          Der Monitor ist parteipolitisch unabhängig und keiner Regierung,
          Partei, Interessenvertretung, Kirche oder Behörde verbunden. Er
          bewertet Gesetzesvorhaben nicht inhaltlich und empfiehlt keine
          Positionen. Kennzahlen zu einzelnen Ministerien zeigt er dort, wo
          sie belegbar sind – aber stets für übernommene wie für übergangene
          Anregungen und nie als Rangliste. Was er zeigt, sind nachprüfbare Vorgänge: Fristen,
          Zahlen, Dokumente und die Unterschiede zwischen ihnen, jeweils mit
          Link auf die amtliche Quelle.
        </p>
        <p class="mt-3 leading-relaxed text-ink-secondary">
          Dahinter steht die Überzeugung, dass öffentliche Beteiligung nur
          dann etwas wert ist, wenn nachvollziehbar bleibt, was mit ihr
          geschieht – und dass diese Nachvollziehbarkeit heute an Aufwand
          scheitert, nicht an Geheimhaltung. Nachverfolgung statt Bewertung.
        </p>
      </section>

      <section aria-labelledby="imp-data">
        <h2 id="imp-data" class="section-heading">
          Hinweis zu den Daten
        </h2>
        <p class="mt-3 leading-relaxed text-ink-secondary">
          Der Monitor ist kein amtliches Angebot. Er bereitet Daten der
          Parlamentsdirektion auf und leitet daraus Darstellungen ab, etwa den
          Textvergleich zwischen Entwurf und Regierungsvorlage. Fehler in
          dieser Aufbereitung sind möglich; maßgeblich ist immer die
          Originalquelle auf
          <ExternalLink
            href="https://www.parlament.gv.at"
            class="link-inline"
          >parlament.gv.at</ExternalLink>, auf die jede Angabe verlinkt ist. Hinweise auf Fehler sind
          willkommen – per
          <a
            href="mailto:kontakt@begutachtungs-monitor.at"
            class="link-inline"
          >E-Mail</a>
          oder als
          <ExternalLink
            href="https://github.com/mmeindl/begutachtungs-monitor/issues"
            class="link-inline"
          >GitHub-Issue</ExternalLink>.
        </p>
        <p class="mt-3 leading-relaxed text-ink-secondary">
          Stellungnahmen von Privatpersonen werden nicht namentlich
          wiedergegeben; warum, steht
          <NuxtLink
            to="/ueber#about-privacy"
            class="link-inline"
          >auf der Über-Seite</NuxtLink>.
        </p>
      </section>

      <section aria-labelledby="imp-license">
        <h2 id="imp-license" class="section-heading">
          Urheberrecht &amp; Lizenzen
        </h2>
        <!-- Per dataset, not across the board: the monitor draws on two
             official sources whose terms of use are not the same. A shared
             line „Metadaten CC BY 4.0" levelled that and claimed for the
             Begutachtungsverfahren's data what Parliament excludes on its own
             licence page.

             And „ausschließlich Metadaten" was not true either (corrected
             19.09.2026): under „Worum geht es?" stands Parliament's
             Kurzinformation, and that is prose. The obvious escape — that it
             is only the Ressort's text, which RIS publishes under CC BY —
             does not survive measurement: over 337 drafts of GP XXVII, 53 %
             carry no prose at all but only the lists from the Vorblatt, and
             where there is prose a median 60 % of its eight-word windows
             occur verbatim in the Ressort's documents, for a third of them
             less than half (`pnpm corpus:kurzinfo`, docs/architecture.md
             §13.1). The Kurzinformation is therefore Parliament's editorial
             work on the Ressort's material — and belongs named rather than
             carried along under „Metadaten".

             A third block, 23.09.2026: the two comparisons read the draft's
             own Gesetzestext and its Erläuterungen from Parliament's copy
             wherever Parliament publishes one — for parser symmetry, because
             both sides then come out of the same Word template, and thus
             against the source order the Textgegenüberstellung follows,
             which reads RIS first for the licence. The same documents stand
             in RIS under CC BY, so the copy names what it shows rather than
             claiming a licence for it; whether the exclusion reaches these
             documents at all is part of the open question
             (docs/architecture.md §13.1). -->
        <p class="mt-3 leading-relaxed text-ink-secondary">
          Der Monitor bezieht Daten aus zwei amtlichen Quellen. Die
          Nutzungsbedingungen unterscheiden sich je nach Datensatz.
        </p>
        <dl class="mt-3 space-y-3 leading-relaxed text-ink-secondary">
          <div>
            <dt class="font-medium text-ink">
              Rechtsinformationssystem des Bundes (Bundeskanzleramt)
            </dt>
            <dd>
              Entwurfstexte und Erläuterungen der Ressorts,
              Textgegenüberstellungen, geltendes Bundesrecht und das
              Bundesgesetzblatt –
              <ExternalLink
                href="https://creativecommons.org/licenses/by/4.0/deed.de"
                class="link-inline"
              >CC BY 4.0</ExternalLink>.
            </dd>
          </div>
          <div>
            <dt class="font-medium text-ink">
              Parlamentsdirektion, Stationen nach der Begutachtung
            </dt>
            <dd>
              Regierungsvorlagen, Ausschuss- und Plenarfassungen und
              Verhandlungsgegenstände –
              <ExternalLink
                href="https://creativecommons.org/licenses/by/4.0/deed.de"
                class="link-inline"
              >CC BY 4.0</ExternalLink>.
            </dd>
          </div>
          <div>
            <dt class="font-medium text-ink">
              Parlamentsdirektion, Begutachtungsverfahren
            </dt>
            <dd>
              Ministerialentwürfe, Stellungnahmen und Zustimmungen – für diese
              Daten weist das Parlament keine Open-Data-Lizenz aus und nimmt
              sie von der Weiterverwendung als Open Data ausdrücklich aus. Der
              Monitor zeigt daraus Metadaten – Fristen, Geschäftszahlen,
              Anzahl der Einreichungen und die Namen einreichender
              Organisationen – und die Kurzinformation, die das Parlament zu
              einem Entwurf veröffentlicht (Ziele, Inhalt, Hauptgesichtspunkte;
              auf der Entwurfsseite unter „Worum geht es?“).
              Dazu kommen im Textvergleich der Gesetzestext und die
              Erläuterungen des Entwurfs in der Fassung, die das Parlament
              veröffentlicht – Dokumente des Ressorts, die das RIS unter
              CC BY 4.0 führt. Ob der Ausschluss die Kurzinformation oder
              diese Dokumente erfasst, ist offen; wir haben die
              Parlamentsdirektion um Klärung gebeten, wie weit er reicht.
              Volltexte von Stellungnahmen übernimmt er nicht, sondern
              verlinkt sie auf
              <ExternalLink
                href="https://www.parlament.gv.at"
                class="link-inline"
              >parlament.gv.at</ExternalLink>. Namen von Privatpersonen veröffentlicht er nicht.
            </dd>
          </div>
        </dl>
        <p class="mt-3 leading-relaxed text-ink-secondary">
          Der Quellcode des Monitors ist unter der
          <ExternalLink
            href="https://github.com/mmeindl/begutachtungs-monitor"
            class="link-inline"
          >AGPL-3.0 veröffentlicht</ExternalLink>. Texte dieser Website dürfen unter Nennung der Quelle
          weiterverwendet werden.
        </p>
      </section>

      <section aria-labelledby="imp-privacy">
        <h2 id="imp-privacy" class="section-heading">
          Datenschutz
        </h2>
        <p class="mt-3 leading-relaxed text-ink-secondary">
          Welche Daten beim Besuch dieser Website verarbeitet werden – und
          welche nicht – steht in der
          <NuxtLink
            to="/datenschutz"
            class="link-inline"
          >Datenschutzerklärung</NuxtLink>.
        </p>
      </section>
    </div>
  </div>
</template>

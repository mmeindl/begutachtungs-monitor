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
usePageSeo({
  title: 'Impressum',
  description:
    'Offenlegung nach § 25 Mediengesetz: Medieninhaber, Unternehmensgegenstand, Beteiligungsverhältnisse und grundlegende Richtung des Begutachtungs-Monitors.',
})
</script>

<template>
  <div class="mx-auto w-full max-w-2xl">
    <h1 class="page-title">
      Impressum
    </h1>
    <p class="mt-4 leading-relaxed text-ink-secondary">
      Offenlegung nach § 25 Mediengesetz.
    </p>

    <ProseSection id="imp-owner" heading="Medieninhaber & Herausgeber" first>
      <!-- <address> is the semantic element for the contact block of its
           nearest section; `prose-flow` takes the browser's default italic
           back. -->
      <address>
        Manuel Meindl<br>
        Wohnort: Linz, Österreich<br>
        E-Mail:
        <a
          href="mailto:kontakt@begutachtungs-monitor.at"
          class="link-inline"
        >kontakt@begutachtungs-monitor.at</a>
      </address>
      <p>
        Der Begutachtungs-Monitor ist ein privates, nichtkommerzielles
        Civic-Tech-Projekt einer Einzelperson. Er steht in keiner Verbindung
        zum Parlament, zu einem Bundesministerium oder zum Arbeitgeber des
        Medieninhabers.
      </p>
    </ProseSection>

    <ProseSection id="imp-object" heading="Unternehmensgegenstand">
      <p>
        Betrieb einer nichtkommerziellen Informationsplattform zur
        Gesetzgebung in Österreich: Aufbereitung öffentlich zugänglicher
        Daten zu Entwürfen des Bundes und der Länder, ihren
        Begutachtungsfristen und Stellungnahmen, zum weiteren Verlauf bis zur
        Kundmachung, zum EU-Recht, das sie umsetzen, und zu den Anliegen an
        das Parlament.
      </p>
    </ProseSection>

    <!-- 16.11.2026: the sentence said „nicht finanziert, weder durch
         Förderungen noch durch Spenden", while /ueber has asked for donations
         since 04.10.2026. It now says what is true: donations, to the
         Medieninhaber as a private person. -->
    <ProseSection id="imp-shares" heading="Beteiligungsverhältnisse">
      <p>
        Medieninhaber ist eine natürliche Person. Es bestehen keine
        Beteiligungen anderer Personen oder Unternehmen, keine stillen
        Beteiligungen und keine Treuhandverhältnisse. Das Projekt erhält
        keine Förderungen und keine Werbeeinnahmen und hat keine
        Auftraggeber. Freiwillige
        <NuxtLink to="/ueber#about-support" class="link-inline">Spenden</NuxtLink>
        gehen an den Medieninhaber als Privatperson. Ändert sich daran etwas,
        steht es hier.
      </p>
    </ProseSection>

    <ProseSection id="imp-line" heading="Grundlegende Richtung (Blattlinie)">
      <p>
        Der Begutachtungs-Monitor macht sichtbar, wie Gesetze in Österreich
        entstehen und wo man sich beteiligen kann, und verfolgt nach, was aus
        den eingebrachten Stellungnahmen wird. Übernommene Anregungen werden
        so deutlich gezeigt wie übergangene. Nachverfolgung statt Bewertung.
      </p>
      <p>
        Der Monitor ist parteipolitisch unabhängig und keiner Regierung,
        Partei, Interessenvertretung, Kirche oder Behörde verbunden. Er
        bewertet Gesetzesvorhaben nicht inhaltlich, empfiehlt keine
        Positionen und erstellt keine Ranglisten. Was er zeigt, sind
        nachprüfbare Vorgänge: Fristen, Zahlen, Dokumente und die
        Unterschiede zwischen ihnen, jeweils mit Link auf die amtliche
        Quelle.
      </p>
      <p>
        Dahinter steht die Überzeugung, dass öffentliche Beteiligung nur
        dann etwas wert ist, wenn nachvollziehbar bleibt, was mit ihr
        geschieht – und dass diese Nachvollziehbarkeit heute an Aufwand
        scheitert, nicht an Geheimhaltung.
      </p>
    </ProseSection>

    <ProseSection id="imp-data" heading="Kein amtliches Angebot">
      <p>
        Der Monitor bereitet Daten amtlicher Quellen auf und leitet daraus
        Darstellungen ab, etwa den Textvergleich zwischen Entwurf und
        Regierungsvorlage. Fehler in dieser Aufbereitung sind möglich;
        maßgeblich ist immer die amtliche Quelle, auf die jede Angabe
        verlinkt ist. Hinweise auf Fehler sind willkommen – per
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
    </ProseSection>

    <!-- The register of sources moved to /quellen on 16.11.2026. The section
         and its id stay: `/impressum#imp-license` is linked from outside, and
         a fragment cannot be redirected. -->
    <ProseSection id="imp-license" heading="Urheberrecht & Lizenzen">
      <p>
        Welche Quelle unter welcher Lizenz steht, zeigt die Seite
        <NuxtLink to="/quellen" class="link-inline">Quellen &amp; Lizenzen</NuxtLink>.
        Der Quellcode des Monitors ist unter der
        <ExternalLink
          href="https://github.com/mmeindl/begutachtungs-monitor"
          class="link-inline"
        >AGPL-3.0 veröffentlicht</ExternalLink>.
      </p>
    </ProseSection>

    <ProseSection id="imp-privacy" heading="Datenschutz">
      <p>
        Welche Daten beim Besuch dieser Website verarbeitet werden – und
        welche nicht – steht in der
        <NuxtLink
          to="/datenschutz"
          class="link-inline"
        >Datenschutzerklärung</NuxtLink>.
      </p>
    </ProseSection>
  </div>
</template>

<script setup lang="ts">
/**
 * Offenlegung nach § 25 MedienG.
 *
 * Warum überhaupt: Eine Website ist ein periodisches elektronisches Medium
 * (§ 1 Abs 1 Z 5a lit c MedienG). Die Offenlegungspflicht hängt nicht an
 * Gewerblichkeit — das ECG mit seinem "in der Regel gegen Entgelt" greift
 * hier (noch) nicht, das MedienG schon.
 *
 * Warum die volle Offenlegung: Die "kleine Website"-Erleichterung des
 * § 25 Abs 5 gilt nur für Seiten ohne Inhalt, der geeignet ist, die
 * öffentliche Meinungsbildung zu beeinflussen. Genau das ist der Zweck
 * dieses Projekts — die Erleichterung zu beanspruchen hieße, gegen die
 * eigene Sache zu argumentieren. Also inklusive Beteiligungsverhältnissen
 * (§ 25 Abs 2) und grundlegender Richtung (§ 25 Abs 4).
 *
 * Warum Wohnort und keine Anschrift: § 25 Abs 2 verlangt den Wohnort, nicht
 * die Zustelladresse. Eine vollständige Anschrift wird erst nötig, wenn
 *   (a) das ECG greift — Förderung, Spenden, Werbung; § 5 ECG will die
 *       geografische Anschrift —, oder
 *   (b) E-Mail-Benachrichtigungen kommen: ein Verteiler ist ein
 *       wiederkehrendes elektronisches Medium (§ 1 Abs 1 Z 5a lit d) und
 *       löst § 24 Abs 3 MedienG aus (Name UND Anschrift).
 * Beides ist absehbar, aber noch nicht eingetreten.
 *
 * § 25 Abs 1 verlangt "ständig leicht und unmittelbar auffindbar": daher der
 * Footer-Link auf jeder Seite. Nicht in die Hauptnavigation — die ist bei
 * vier Einträgen gedeckelt, und dort sucht diese Seite auch niemand.
 */
useSeoMeta({
  title: 'Impressum & Offenlegung',
  description:
    'Offenlegung nach § 25 Mediengesetz: Medieninhaber, Unternehmensgegenstand, Beteiligungsverhältnisse und grundlegende Richtung des Begutachtungs-Monitors.',
})

const linkClasses =
  'rounded text-accent-deep underline underline-offset-2 hover:no-underline'
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
          <a href="mailto:kontakt@begutachtungs-monitor.at" :class="linkClasses"
            >kontakt@begutachtungs-monitor.at</a
          >
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
          den eingebrachten Stellungnahmen wird – in beide Richtungen.
          Übernommene Anregungen werden so deutlich gezeigt wie übergangene.
        </p>
        <p class="mt-3 leading-relaxed text-ink-secondary">
          Der Monitor ist parteipolitisch unabhängig und keiner Regierung,
          Partei, Interessenvertretung, Kirche oder Behörde verbunden. Er
          bewertet Gesetzesvorhaben nicht inhaltlich und empfiehlt keine
          Positionen. Kennzahlen zu einzelnen Ministerien zeigt er dort, wo
          sie belegbar sind – aber stets in beide Richtungen und nie als
          Rangliste. Was er zeigt, sind nachprüfbare Vorgänge: Fristen,
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
          <ExternalLink href="https://www.parlament.gv.at" :class="linkClasses"
            >parlament.gv.at</ExternalLink
          >, auf die jede Angabe verlinkt ist. Hinweise auf Fehler sind
          willkommen – per
          <a href="mailto:kontakt@begutachtungs-monitor.at" :class="linkClasses"
            >E-Mail</a
          >
          oder als
          <ExternalLink
            href="https://github.com/mmeindl/begutachtungs-monitor/issues"
            :class="linkClasses"
          >GitHub-Issue</ExternalLink>.
        </p>
        <p class="mt-3 leading-relaxed text-ink-secondary">
          Stellungnahmen von Privatpersonen werden nicht namentlich
          wiedergegeben; warum, steht
          <NuxtLink to="/ueber#about-privacy" :class="linkClasses"
            >auf der Über-Seite</NuxtLink
          >.
        </p>
      </section>

      <section aria-labelledby="imp-license">
        <h2 id="imp-license" class="section-heading">
          Urheberrecht &amp; Lizenzen
        </h2>
        <p class="mt-3 leading-relaxed text-ink-secondary">
          Die Metadaten stammen von der Parlamentsdirektion und stehen unter
          <ExternalLink
            href="https://creativecommons.org/licenses/by/4.0/deed.de"
            :class="linkClasses"
          >CC BY 4.0</ExternalLink>. Der Quellcode des Monitors ist unter der
          <ExternalLink
            href="https://github.com/mmeindl/begutachtungs-monitor"
            :class="linkClasses"
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
          <NuxtLink to="/datenschutz" :class="linkClasses"
            >Datenschutzerklärung</NuxtLink
          >.
        </p>
      </section>
    </div>
  </div>
</template>

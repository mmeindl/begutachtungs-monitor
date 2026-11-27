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
 * Why the full postal address (since 16.11.2026; before, the Wohnort alone):
 * § 25 Abs 2 asks only for the Wohnort. A full address becomes necessary when
 *   (a) the ECG applies — funding, donations, advertising; § 5 ECG wants the
 *       geographic address —, or
 *   (b) e-mail notifications arrive: a mailing list is a wiederkehrendes
 *       elektronisches Medium (§ 1 Abs 1 Z 5a lit d) and triggers § 24 Abs 3
 *       MedienG (name AND address).
 * /ueber has asked for donations since 04.10.2026. Whether voluntary
 * donations to a private person make the site a service „in der Regel gegen
 * Entgelt" is not settled; with the address published the question no longer
 * matters, and (b) and later funding are covered too. The address is the
 * maintainer's own decision and a deliberate exception to „no personal data
 * in the repository", like the name here and the IBAN on /ueber.
 *
 * § 25 Abs 1 asks for "ständig leicht und unmittelbar auffindbar": hence the
 * footer link on every page. Not in the main navigation — that is capped at
 * four entries, and nobody looks for this page there.
 *
 * The Medieninhaber is the Verein (since 25.11.2026; before, the maintainer
 * as a private person). § 25 Abs 2 asks a Verein for its board and its
 * purpose. Name, register number, address and board:
 * `app/utils/publisher.ts`; the purpose stands in `#purpose` in the
 * statutes' own words. The maintainer pays the running costs privately
 * for now, and while the Verein has no bank account donations go to him
 * personally: `#shares` says both, in the same words as `/ueber#support`
 * and `/datenschutz#donations`. Change the three together.
 */
import { PUBLISHER, boardLineOf } from '~/utils/publisher'

usePageSeo({
  title: 'Impressum',
  description:
    'Offenlegung nach § 25 Mediengesetz: Medieninhaber, Unternehmensgegenstand, Beteiligungsverhältnisse und grundlegende Richtung des Begutachtungs-Monitors.',
})

const contact = useContact()
const boardLine = boardLineOf(PUBLISHER.board)
</script>

<template>
  <div class="mx-auto w-full max-w-2xl">
    <h1 class="page-title">
      Impressum
    </h1>
    <p class="mt-4 leading-relaxed text-ink-secondary">
      Offenlegung nach § 25 Mediengesetz.
    </p>

    <ProseSection id="owner" heading="Medieninhaber & Herausgeber" first>
      <PublisherAddress />
      <p>
        Vorstand: {{ boardLine }}.
      </p>
      <p>
        Der Begutachtungs-Monitor ist ein nichtkommerzielles
        Civic-Tech-Projekt. Betrieben wird er von einem gemeinnützigen
        Verein. Der Monitor steht in keiner Verbindung zum Parlament, zu
        einem Bundesministerium oder zum Arbeitgeber des Obmanns.
      </p>
    </ProseSection>

    <!-- 25.11.2026: the Vereinszweck, which § 25 Abs 2 asks of a Verein that
         is Medieninhaber. § 2 of the statutes word for word and whole: a
         shortened purpose would be our reading of it. The statutes number
         the three items; the page's lists have bullets, and the numbers
         carry nothing here. -->
    <ProseSection id="purpose" heading="Unternehmensgegenstand & Vereinszweck">
      <p>
        Betrieb einer nichtkommerziellen Informationsplattform zur
        Gesetzgebung in Österreich: Aufbereitung öffentlich zugänglicher
        Daten zu Entwürfen des Bundes und der Länder, ihren
        Begutachtungsfristen und Stellungnahmen, zum weiteren Verlauf bis zur
        Kundmachung, zum EU-Recht, das sie umsetzen, und zu den Anliegen an
        das Parlament.
      </p>
      <p>
        Der Zweck des Vereins, im Wortlaut seiner Statuten (§ 2):
      </p>
      <p>
        Der Verein, dessen Tätigkeit nicht auf Gewinn gerichtet ist, verfolgt
        ausschließlich und unmittelbar gemeinnützige Zwecke im Sinn der
        §§ 34 ff BAO. Er ist überparteilich.
      </p>
      <p>
        Zweck des Vereins ist die Förderung des demokratischen Staatswesens
        durch staatsbürgerliche Bildung, die Förderung der Erwachsenenbildung
        sowie die Förderung von Wissenschaft und Forschung, jeweils auf dem
        Gebiet der Rechtsetzung und der Beteiligung der Bevölkerung daran.
        Der Verein fördert dabei insbesondere
      </p>
      <ul>
        <li>
          die Transparenz und Nachvollziehbarkeit der Rechtsetzung von ihrer
          Vorbereitung in der Verwaltung über die Begutachtung bis zur
          Evaluierung, vor allem der Begutachtungs- und
          Konsultationsverfahren zu Gesetzes- und Verordnungsentwürfen in
          Österreich, in anderen europäischen Staaten und in der Europäischen
          Union: welche Entwürfe zur Begutachtung stehen, wie sie danach
          verändert werden und was aus den Stellungnahmen dazu wird;
        </li>
        <li>
          den einfachen und verständlichen Zugang der Bevölkerung zu
          Gesetzesentwürfen, Fristen und Verfahren und ihre Beteiligung an
          der Rechtsetzung und an anderen demokratischen
          Entscheidungsverfahren;
        </li>
        <li>
          die Verfügbarkeit und Nutzbarkeit offener Daten der öffentlichen
          Hand über Rechtsetzung und Beteiligung.
        </li>
      </ul>
    </ProseSection>

    <!-- 16.11.2026: the sentence said „nicht finanziert, weder durch
         Förderungen noch durch Spenden", while /ueber has asked for donations
         since 04.10.2026. It now says what is true: donations, to a private
         person. 25.11.2026: the Medieninhaber is the Verein; who pays the
         costs for now and why donations still go to a person stands here,
         because the reader who finds a Verein above expects its account
         below. -->
    <ProseSection id="shares" heading="Beteiligungsverhältnisse">
      <p>
        Medieninhaber ist ein Verein. An ihm bestehen keine Beteiligungen,
        keine stillen Beteiligungen und keine Treuhandverhältnisse. Das
        Projekt erhält keine Förderungen und keine Werbeeinnahmen und hat
        keine Auftraggeber. Die Kosten für Server und Domain trägt bisher
        Manuel Meindl als Privatperson. Der Verein hat noch kein eigenes
        Konto: Freiwillige
        <NuxtLink to="/ueber#support" class="link-inline">Spenden</NuxtLink>
        gehen deshalb an ihn persönlich, nicht an den Verein. Ändert sich
        daran etwas, steht es hier.
      </p>
    </ProseSection>

    <ProseSection id="editorial-line" heading="Grundlegende Richtung (Blattlinie)">
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

    <ProseSection id="unofficial" heading="Kein amtliches Angebot">
      <p>
        Der Monitor bereitet Daten amtlicher Quellen auf und leitet daraus
        Darstellungen ab, etwa den Textvergleich zwischen Entwurf und
        Regierungsvorlage. Fehler in dieser Aufbereitung sind möglich;
        maßgeblich ist immer die amtliche Quelle, auf die jede Angabe
        verlinkt ist. Hinweise auf Fehler sind willkommen – per
        <a
          :href="contact.mailto"
          class="link-inline"
        >E-Mail</a>
        oder als
        <ExternalLink
          href="https://github.com/viewyourstate-org/begutachtungs-monitor/issues"
          class="link-inline"
        >GitHub-Issue</ExternalLink>.
      </p>
    </ProseSection>

    <!-- The register of sources moved to /quellen on 16.11.2026. The section
         stays: `/impressum#imp-license` is linked from outside, and a
         fragment cannot be redirected. Its anchor is `#license` since
         24.11.2026; the old id keeps answering through `former-id`. -->
    <ProseSection id="license" former-id="imp-license" heading="Urheberrecht & Lizenzen">
      <p>
        Welche Quelle unter welcher Lizenz steht, zeigt die Seite
        <NuxtLink to="/quellen" class="link-inline">Quellen &amp; Lizenzen</NuxtLink>.
        Der Quellcode des Monitors ist unter der
        <ExternalLink
          href="https://github.com/viewyourstate-org/begutachtungs-monitor"
          class="link-inline"
        >AGPL-3.0 veröffentlicht</ExternalLink>.
      </p>
    </ProseSection>

    <ProseSection id="privacy" heading="Datenschutz">
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

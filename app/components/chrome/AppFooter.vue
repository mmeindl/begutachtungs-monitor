<script setup lang="ts">
/**
 * Kolophon, keine Marketingfläche.
 *
 * Das Abo-Angebot stand hier als Kasten auf jeder Seite und war die fünfte
 * Kopie derselben Einladung: Startseite unter dem Hero, Startseite im
 * Leerzustand, Ressort-Feed in der Liste, Abonnieren-Abschnitt auf /ueber.
 * "Subscribe at need" ist auf den Seiten passiert — der Kasten war das, was
 * davor übrig blieb. Dazu trug er mark-wash, den Ton, der laut main.css
 * "was aus dem Input wurde" bedeutet; unter einer Datenschutzerklärung war
 * er ohnehin fehl am Platz. Die Einladung steht jetzt auf der Liste, wo der
 * Bedarf entsteht.
 *
 * Was bleibt, bleibt aus einem Grund pro Zeile:
 *   - Quellen + Verweis auf die Lizenzangaben — Lizenzauflage, keine
 *     Höflichkeit. Genannt werden BEIDE Quellen: ein Teil der Daten kommt
 *     aus dem RIS des Bundes (Bundeskanzleramt), nicht von der
 *     Parlamentsdirektion, und CC BY verlangt die Nennung des Lizenzgebers.
 *     Die Lizenz selbst steht hier NICHT mehr: sie ist je Datensatz
 *     verschieden (Impressum, §„Urheberrecht & Lizenzen"), und eine Zeile,
 *     die für alle Daten CC BY behauptete, behauptete es auch für die des
 *     Begutachtungsverfahrens — die das Parlament ausdrücklich von der
 *     Weiterverwendung als Open Data ausnimmt. CC BY 4.0 § 3 a (2) lässt
 *     die Erfüllung der Namensnennung ausdrücklich per Link auf eine Seite
 *     zu, die die Angaben trägt; genau das ist dieser Verweis;
 *   - "Kein amtliches Angebot" — die tragende Zeile auf einer .at-Adresse
 *     über Ministerien;
 *   - Quellcode — AGPL § 13 verlangt, Nutzern bei Netzwerkinteraktion den
 *     Quelltext anzubieten: dieser Link ist die Umsetzung, kein Extra;
 *   - Kontakt — die Adressaten des Projekts sollen dafür nicht erst ins
 *     Impressum gehen müssen;
 *   - Impressum/Datenschutz — § 25 Abs 1 MedienG, "ständig leicht und
 *     unmittelbar auffindbar".
 *
 * Nicht mehr hier: das Wort „Prototyp". Es entwertete die Metadaten, die
 * eine unveränderte Spiegelung der amtlichen Schnittstelle sind, und warnte
 * zugleich nicht vor dem Textvergleich, wo ein Fehler tatsächlich entstehen
 * kann. Der Vorbehalt steht jetzt konkret im Impressum, die echten Grenzen
 * im Status-Abschnitt auf /ueber.
 */
</script>

<template>
  <footer class="border-t border-hairline">
    <div class="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <div class="flex flex-col gap-2 text-sm leading-relaxed text-ink-muted">
        <p>
          Datenquellen: Republik Österreich – Parlamentsdirektion
          (<ExternalLink
            href="https://www.parlament.gv.at"
            class="underline underline-offset-2 hover:no-underline"
          >parlament.gv.at</ExternalLink>) und Rechtsinformationssystem des Bundes
          (<ExternalLink
            href="https://www.ris.bka.gv.at"
            class="underline underline-offset-2 hover:no-underline"
          >ris.bka.gv.at</ExternalLink>).
          <NuxtLink
            to="/impressum#imp-license"
            class="underline underline-offset-2 hover:no-underline"
          >Lizenzen im Impressum</NuxtLink>. Kein amtliches Angebot.
        </p>
        <p>
          <ExternalLink
            href="https://github.com/mmeindl/begutachtungs-monitor"
            class="underline underline-offset-2 hover:no-underline"
          >Quellcode auf GitHub</ExternalLink>
          · Kontakt:
          <a
            href="mailto:kontakt@begutachtungs-monitor.at"
            class="underline underline-offset-2 hover:no-underline"
          >kontakt@begutachtungs-monitor.at</a>
        </p>
        <nav aria-label="Rechtliches">
          <ul class="flex flex-wrap items-center gap-x-4">
            <li>
              <NuxtLink
                to="/impressum"
                class="tap-target rounded underline underline-offset-2 hover:no-underline"
              >Impressum &amp; Offenlegung</NuxtLink>
            </li>
            <li>
              <NuxtLink
                to="/datenschutz"
                class="tap-target rounded underline underline-offset-2 hover:no-underline"
              >Datenschutz</NuxtLink>
            </li>
          </ul>
        </nav>
      </div>
    </div>
  </footer>
</template>

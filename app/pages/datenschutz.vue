<script setup lang="ts">
/**
 * Datenschutzerklärung — Art 13 und 14 DSGVO.
 *
 * Bewusst kein Generator-Text: fast jede Standardklausel (Cookies,
 * Analytik, Newsletter, Social-Media-Plugins, Server-Logs mit 7-tägiger
 * Aufbewahrung) beschreibt etwas, das dieses Projekt nicht tut. Eine
 * Erklärung, die Verarbeitungen behauptet, die es nicht gibt, ist genauso
 * falsch wie eine, die welche verschweigt.
 *
 * Belege für die Aussagen hier, damit sie beim nächsten Infrastruktur-
 * wechsel mitgeändert werden:
 *   - keine Access-Logs: der Caddyfile in deploy/bootstrap.sh hat keine
 *     `log`-Direktive, Caddy schreibt ohne sie kein Zugriffsprotokoll;
 *   - keine Drittanbieter zur Laufzeit: Schriften liegen in public/fonts,
 *     kein CDN, keine Analytik, keine Cookies;
 *   - Auftragsverarbeiter und Standorte: deploy/infrastructure.md;
 *   - Privatpersonen ohne Namen: server/utils/privacy.ts.
 * Art 14 (Daten aus dem Parlament) ist der Teil, den Standardtexte gar
 * nicht kennen — er ist hier der eigentliche Inhalt.
 */
useSeoMeta({
  title: 'Datenschutz',
  description:
    'Welche Daten der Begutachtungs-Monitor verarbeitet: keine Cookies, kein Tracking, keine Zugriffsprotokolle – und wie mit den Namen aus den Parlamentsdaten umgegangen wird.',
})

const linkClasses =
  'rounded text-accent-deep underline underline-offset-2 hover:no-underline'
</script>

<template>
  <div class="mx-auto w-full max-w-2xl">
    <h1 class="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
      Datenschutz
    </h1>
    <p class="mt-4 leading-relaxed text-ink-secondary">
      Der Monitor kennt keine Konten, setzt keine Cookies, bindet keine
      Drittanbieter ein und führt keine Zugriffsprotokolle. Deshalb ist diese
      Erklärung kurz – und sie beschreibt nur, was tatsächlich passiert.
    </p>

    <div class="mt-10 space-y-20">
      <section aria-labelledby="dse-controller">
        <h2 id="dse-controller" class="section-heading">
          Verantwortlicher
        </h2>
        <address class="mt-3 not-italic leading-relaxed text-ink-secondary">
          Manuel Meindl<br>
          Wohnort: Linz, Österreich<br>
          E-Mail:
          <a href="mailto:kontakt@begutachtungs-monitor.at" :class="linkClasses"
            >kontakt@begutachtungs-monitor.at</a
          >
        </address>
        <p class="mt-3 leading-relaxed text-ink-secondary">
          Ein Datenschutzbeauftragter ist nicht bestellt; die Voraussetzungen
          des Art 37 DSGVO liegen nicht vor. Die vollständigen Angaben zum
          Medieninhaber stehen im
          <NuxtLink to="/impressum" :class="linkClasses">Impressum</NuxtLink>.
        </p>
      </section>

      <section aria-labelledby="dse-visit">
        <h2 id="dse-visit" class="section-heading">
          Beim Aufruf dieser Website
        </h2>
        <p class="mt-3 leading-relaxed text-ink-secondary">
          Damit eine Seite ausgeliefert werden kann, verarbeitet der Server
          technisch notwendig die IP-Adresse des Geräts, die angefragte
          Adresse und die vom Browser mitgeschickten Angaben. Diese Daten
          werden nur für die Dauer der Anfrage verarbeitet und
          <strong class="font-semibold text-ink">nicht protokolliert</strong>:
          Der Webserver führt kein Zugriffsprotokoll. Es entsteht also keine
          Aufzeichnung, wer wann welche Seite aufgerufen hat.
        </p>
        <p class="mt-3 leading-relaxed text-ink-secondary">
          Rechtsgrundlage ist Art 6 Abs 1 lit f DSGVO – das berechtigte
          Interesse, eine Website betreiben und gegen Angriffe schützen zu
          können. Die Verbindung ist durchgehend TLS-verschlüsselt.
        </p>
      </section>

      <section aria-labelledby="dse-none">
        <h2 id="dse-none" class="section-heading">
          Was nicht passiert
        </h2>
        <ul
          class="mt-3 list-disc space-y-2 pl-5 leading-relaxed text-ink-secondary marker:text-ink-muted"
        >
          <li>Keine Cookies und keine vergleichbare Speicherung im Browser.</li>
          <li>
            Keine Reichweitenmessung, keine Analytik, kein Tracking, keine
            Profilbildung, keine automatisierte Entscheidungsfindung.
          </li>
          <li>
            Keine Ressourcen von Drittanbietern: Schriften werden vom eigenen
            Server geliefert, es gibt kein CDN, keine eingebetteten Karten,
            Videos oder Social-Media-Elemente. Beim Aufruf einer Seite wird
            deshalb keine Verbindung zu einem anderen Anbieter aufgebaut.
          </li>
          <li>
            Keine Benutzerkonten und keine Registrierung, daher auch keine
            Zugangsdaten.
          </li>
          <li>
            Keine Weitergabe von Daten an Dritte und keine Übermittlung in
            Drittstaaten außerhalb der EU.
          </li>
        </ul>
        <p class="mt-3 leading-relaxed text-ink-secondary">
          Die Daten des Parlaments holt der Server selbst. Der Aufruf einer
          Seite erzeugt also keine Verbindung des Geräts zu
          parlament.gv.at – dort wird nicht sichtbar, wer welchen Entwurf
          liest. Erst ein Klick auf einen der Quellenlinks führt dorthin;
          dann gelten die Bestimmungen der jeweiligen Seite.
        </p>
      </section>

      <section aria-labelledby="dse-feeds">
        <h2 id="dse-feeds" class="section-heading">
          RSS-Feed &amp; Fristen-Kalender
        </h2>
        <p class="mt-3 leading-relaxed text-ink-secondary">
          Feed und Kalender werden bewusst ohne Anmeldung angeboten: Das
          Programm auf dem Gerät ruft die Adresse regelmäßig ab, genau wie
          eine normale Seite. Es gibt keine Abonnentenliste, keine E-Mail-
          Adressen und nichts, was gespeichert würde – auch nicht, wie viele
          Personen abonniert haben.
        </p>
      </section>

      <section aria-labelledby="dse-mail">
        <h2 id="dse-mail" class="section-heading">
          Kontaktaufnahme per E-Mail
        </h2>
        <p class="mt-3 leading-relaxed text-ink-secondary">
          Wer an kontakt@begutachtungs-monitor.at schreibt, übermittelt damit
          Absenderadresse, Betreff und Inhalt der Nachricht. Diese werden
          ausschließlich zur Beantwortung verwendet. Rechtsgrundlage ist
          Art 6 Abs 1 lit f DSGVO (berechtigtes Interesse an der Beantwortung
          von Anfragen). Die Nachrichten werden gelöscht, sobald sie nicht
          mehr gebraucht werden, spätestens nach zwei Jahren.
        </p>
        <p class="mt-3 leading-relaxed text-ink-secondary">
          Die Adresse ist eine reine Weiterleitung ohne eigenes Postfach; sie
          wird von der INWX GmbH &amp; Co. KG (Berlin, Deutschland) betrieben
          und leitet an ein privates Postfach weiter.
        </p>
      </section>

      <section aria-labelledby="dse-hosting">
        <h2 id="dse-hosting" class="section-heading">
          Hosting
        </h2>
        <p class="mt-3 leading-relaxed text-ink-secondary">
          Die Website läuft auf einem Server der netcup GmbH (Karlsruhe,
          Deutschland) im Rechenzentrum Nürnberg. Domain, DNS und
          E-Mail-Weiterleitung liegen bei der INWX GmbH &amp; Co. KG (Berlin,
          Deutschland). Beide sind Auftragsverarbeiter im Sinn des Art 28
          DSGVO und verarbeiten ausschließlich innerhalb der EU. Eine eigene
          Datenbank gibt es nicht; die Parlamentsdaten liegen nur im
          Arbeitsspeicher des Servers und in einer kleinen Datei mit dem
          zuletzt erfolgreich abgerufenen Stand.
        </p>
      </section>

      <section aria-labelledby="dse-parliament">
        <h2 id="dse-parliament" class="section-heading">
          Namen aus den Parlamentsdaten
        </h2>
        <p class="mt-3 leading-relaxed text-ink-secondary">
          Der Monitor zeigt Daten, die die Parlamentsdirektion auf
          parlament.gv.at veröffentlicht. Darin kommen Namen vor: als
          Einbringer von Stellungnahmen erscheinen dort auch Privatpersonen.
          Das ist eine Verarbeitung personenbezogener Daten, die nicht bei
          den Betroffenen selbst erhoben wurden – dafür gilt Art 14 DSGVO.
        </p>
        <ul
          class="mt-3 list-disc space-y-2 pl-5 leading-relaxed text-ink-secondary marker:text-ink-muted"
        >
          <li>
            <strong class="font-semibold text-ink">Privatpersonen werden
              nicht namentlich genannt.</strong>
            Sie erscheinen als „Privatperson“ und fließen ausschließlich in
            Zählungen ein. Im Zweifel wird ein Name als Privatperson
            behandelt.
          </li>
          <li>
            Namentlich genannt werden Organisationen – Kammern, Verbände,
            Vereine, Behörden, Unternehmen – sowie Ministerien als
            Absender von Entwürfen. Rechtsgrundlage ist Art 6 Abs 1 lit f
            DSGVO: das öffentliche Interesse an der Nachvollziehbarkeit von
            Gesetzgebung überwiegt hier, weil es um die Beteiligung an einem
            öffentlichen Verfahren geht, nicht um private Lebensführung.
          </li>
          <li>
            Es werden keine Profile gebildet, keine Personen über Verfahren
            hinweg verknüpft und keine Volltexte von Stellungnahmen
            gespeichert oder wiedergegeben.
          </li>
          <li>
            Quelle aller Daten ist ausschließlich die offene Schnittstelle
            der Parlamentsdirektion, abrufbar unter
            <ExternalLink
              href="https://www.parlament.gv.at/recherchieren/open-data/"
              :class="linkClasses"
            >parlament.gv.at/recherchieren/open-data</ExternalLink>.
          </li>
        </ul>
        <p class="mt-3 leading-relaxed text-ink-secondary">
          Wer trotzdem findet, dass ein Name hier nicht stehen sollte,
          bekommt das ohne Diskussion korrigiert – eine kurze
          <a href="mailto:kontakt@begutachtungs-monitor.at" :class="linkClasses"
            >E-Mail</a
          >
          genügt. Auf parlament.gv.at bleibt der Eintrag davon unberührt;
          dafür ist die Parlamentsdirektion zuständig.
        </p>
      </section>

      <section aria-labelledby="dse-rights">
        <h2 id="dse-rights" class="section-heading">
          Rechte der Betroffenen
        </h2>
        <p class="mt-3 leading-relaxed text-ink-secondary">
          Es besteht das Recht auf Auskunft (Art 15), Berichtigung (Art 16),
          Löschung (Art 17), Einschränkung der Verarbeitung (Art 18),
          Datenübertragbarkeit (Art 20) und Widerspruch gegen Verarbeitungen
          auf Grundlage berechtigter Interessen (Art 21 DSGVO). Eine
          formlose Nachricht an
          <a href="mailto:kontakt@begutachtungs-monitor.at" :class="linkClasses"
            >kontakt@begutachtungs-monitor.at</a
          >
          reicht.
        </p>
        <p class="mt-3 leading-relaxed text-ink-secondary">
          Unabhängig davon besteht ein Beschwerderecht bei der
          <ExternalLink href="https://www.dsb.gv.at" :class="linkClasses"
            >österreichischen Datenschutzbehörde</ExternalLink>, Barichgasse 40–42, 1030 Wien,
          <a href="mailto:dsb@dsb.gv.at" :class="linkClasses">dsb@dsb.gv.at</a>.
        </p>
      </section>

      <section aria-labelledby="dse-status">
        <h2 id="dse-status" class="section-heading">Stand</h2>
        <p class="mt-3 leading-relaxed text-ink-secondary">
          September 2026. Ändert sich etwas an der Verarbeitung – etwa mit
          den geplanten E-Mail-Benachrichtigungen zu Fristen –, wird diese
          Erklärung vorher angepasst.
        </p>
      </section>
    </div>
  </div>
</template>

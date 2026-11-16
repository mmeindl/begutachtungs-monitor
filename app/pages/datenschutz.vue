<script setup lang="ts">
/**
 * Datenschutzerklärung — Art 13 and 14 GDPR.
 *
 * Deliberately no generated text: almost every standard clause (cookies,
 * analytics, newsletter, social-media plugins, server logs kept for 7 days)
 * describes something this project does not do. A statement claiming
 * processing that does not happen is as wrong as one that conceals some.
 *
 * Evidence for the claims here, so it can be changed along at the next
 * infrastructure change:
 *   - no access logs: the Caddyfile in deploy/bootstrap.sh has no `log`
 *     directive, and without one Caddy writes no access log;
 *   - no third parties at runtime: the fonts live in public/fonts, no CDN,
 *     no analytics service;
 *   - page views counted as daily sums and nothing else (30.10.2026):
 *     server/plugins/zaehlung.ts and server/utils/zaehlung/ — the class of
 *     the page, a bot flag from the user agent, the referrer's host; no
 *     address, no user agent, no cookie is stored. Files under the
 *     StateDirectory, deploy/infrastructure.md; published whole on
 *     /statistik;
 *   - one cookie, `quellen`, and only after a source chip was pressed:
 *     app/composables/useSourceChoice.ts (22.10.2026). The only browser
 *     storage on the site — grep for localStorage/useCookie before changing
 *     the sentence;
 *   - processors and locations: deploy/infrastructure.md;
 *   - private individuals without names: server/utils/parliament/privacy.ts
 *     for Parliament and the Länder, `namedOrganisationOf` in
 *     server/utils/eu/portalFeedback.ts for the Commission's portal (its
 *     limits and the six hours in memory stood in the Impressum's licence
 *     entry until 16.11.2026), and docs/decisions.md, „Anliegen an den
 *     Nationalrat", for who is never named there.
 * Art 14 (names from the official sources) is the part standard texts do not
 * know at all — here it is the actual content, in one section (`dse-names`),
 * which is also where the pages' „Warum ohne Namen" links lead.
 */
usePageSeo({
  title: 'Datenschutz',
  description:
    'Welche Daten der Begutachtungs-Monitor verarbeitet: kein Tracking, keine Zugriffsprotokolle, Seitenaufrufe nur als Summe je Tag, ein Cookie nur für die Auswahl der Quellen – und warum Privatpersonen nicht namentlich genannt werden.',
})
</script>

<template>
  <div class="mx-auto w-full max-w-2xl">
    <h1 class="page-title">
      Datenschutz
    </h1>
    <p class="mt-4 leading-relaxed text-ink-secondary">
      Der Monitor kennt keine Konten, bindet keine Drittanbieter ein und
      führt keine Zugriffsprotokolle. Er zählt Seitenaufrufe, aber nur als
      Summe je Tag. Ein Cookie setzt er nur, wenn Sie
      auswählen, aus welchen Quellen die Liste der Entwürfe stammt. Deshalb ist diese
      Erklärung kurz – und sie beschreibt nur, was tatsächlich passiert.
    </p>

    <ProseSection id="dse-controller" heading="Verantwortlicher" first>
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
        Ein Datenschutzbeauftragter ist nicht bestellt; die Voraussetzungen
        des Art 37 DSGVO liegen nicht vor. Die vollständigen Angaben zum
        Medieninhaber stehen im
        <NuxtLink to="/impressum" class="link-inline">Impressum</NuxtLink>.
      </p>
    </ProseSection>

    <ProseSection id="dse-visit" heading="Beim Aufruf dieser Website">
      <p>
        Damit eine Seite ausgeliefert werden kann, verarbeitet der Server
        technisch notwendig die IP-Adresse des Geräts, die angefragte
        Adresse und die vom Browser mitgeschickten Angaben. Diese Daten
        werden nur für die Dauer der Anfrage verarbeitet und
        <strong class="font-semibold text-ink">nicht protokolliert</strong>:
        Der Webserver führt kein Zugriffsprotokoll. Es entsteht also keine
        Aufzeichnung, wer wann welche Seite aufgerufen hat.
      </p>
      <p>
        Rechtsgrundlage ist Art 6 Abs 1 lit f DSGVO – das berechtigte
        Interesse, eine Website betreiben und gegen Angriffe schützen zu
        können. Die Verbindung ist durchgehend TLS-verschlüsselt.
      </p>
      <p>
        Was bleibt, ist eine Zahl: Der Aufruf erhöht die Zählung der
        Seitenaufrufe des Tages, beschrieben im nächsten Abschnitt.
      </p>
    </ProseSection>

    <ProseSection id="dse-zaehlung" heading="Zählung der Seitenaufrufe">
      <p>
        Der Monitor zählt Seitenaufrufe je Seite und Tag, und er zählt, von
        welcher Domain ein Besuch kam – die Adresse der verweisenden Seite
        ohne Pfad, also etwa <code>www.parlament.gv.at</code>, nicht die
        Unterseite. Gespeichert werden dabei keine IP-Adresse, kein Cookie,
        keine Gerätemerkmale und keine Kennung, und auch kein Zeitpunkt
        genauer als der Tag. Einzelne Besuche lassen sich aus den Zahlen
        nicht rekonstruieren.
      </p>
      <p>
        Zugriffe bekannter Programme – Suchmaschinen, Vorschaudienste,
        Prüfdienste – werden getrennt gezählt. Ob ein Zugriff von einem
        Programm kommt, erkennt der Server an der Browserangabe
        (User-Agent), die jede Anfrage mitschickt; sie wird dafür gelesen,
        aber nicht gespeichert.
      </p>
      <p>
        Die Zahlen sind öffentlich unter
        <NuxtLink to="/statistik" class="link-inline">Statistik</NuxtLink>.
        Die gespeicherten Zahlen sind keine personenbezogenen Daten. Dass
        Browserangabe und verweisende Adresse während der Anfrage kurz
        ausgewertet werden, gehört zur Verarbeitung beim Aufruf und stützt
        sich auf dieselbe Rechtsgrundlage, Art 6 Abs 1 lit f DSGVO – das
        berechtigte Interesse zu wissen, ob und wie der Monitor genutzt wird.
      </p>
    </ProseSection>

    <ProseSection id="dse-cookie" heading="Wenn Sie Quellen auswählen">
      <p>
        Ändern Sie über „Entwürfe von“ die Auswahl – Bund und Länder –,
        merkt sich der Monitor sie in einem Cookie namens
        <code>quellen</code>. Es enthält nur die Kürzel der gewählten
        Quellen (etwa <code>bund,sbg</code>), keine Kennung und nichts, was
        Sie von anderen Besucherinnen und Besuchern unterscheidet. Es wird nur
        gesetzt, wenn Sie die Auswahl ändern, und gilt ein Jahr. Der Server
        liest es, um die Liste gleich mit Ihrer Auswahl auszuliefern.
      </p>
      <p>
        Das Cookie ist für eine Funktion nötig, die Sie selbst aufrufen;
        dafür braucht es keine Einwilligung (§ 165 Abs 3 TKG 2021). Löschen
        können Sie es in Ihrem Browser oder indem Sie zur Grundauswahl
        zurückkehren, nur den Bund. Die Auswahl steht außerdem in der Adresse
        (<code>?quellen=bund,sbg</code>), sodass ein geteilter Link dieselbe
        Liste zeigt.
      </p>
    </ProseSection>

    <ProseSection id="dse-none" heading="Was nicht passiert">
      <ul>
        <li>Kein weiteres Cookie und keine andere Speicherung im Browser.</li>
        <li>
          Kein Tracking, keine Analytik-Dienste, keine Profilbildung, keine
          automatisierte Entscheidungsfindung.
        </li>
        <li>
          Keine Ressourcen von Drittanbietern: keine fremden Schriften, kein
          CDN, keine eingebetteten Karten, Videos oder Social-Media-Elemente.
        </li>
        <li>Keine Benutzerkonten und keine Registrierung.</li>
        <li>
          Keine Weitergabe von Daten an Dritte und keine Übermittlung in
          Drittstaaten außerhalb der EU.
        </li>
      </ul>
      <p>
        Die Daten der amtlichen Quellen holt der Server selbst. Der Aufruf
        einer Seite erzeugt also keine Verbindung des Geräts zu
        parlament.gv.at oder einer anderen Quelle – dort wird nicht sichtbar,
        wer welchen Entwurf liest. Erst ein Klick auf einen Quellenlink führt
        dorthin; dann gelten die Bestimmungen der jeweiligen Seite.
      </p>
    </ProseSection>

    <ProseSection id="dse-feeds" heading="RSS-Feed & Fristen-Kalender">
      <p>
        Feed und Kalender werden bewusst ohne Anmeldung angeboten: Das
        Programm auf dem Gerät ruft die Adresse regelmäßig ab, genau wie
        eine normale Seite. Es gibt keine Abonnentenliste und keine E-Mail-
        Adressen. Die Abrufe fließen in die
        <a href="#dse-zaehlung" class="link-inline">Zählung</a> ein; wie viele
        Personen abonniert haben, lässt sich daraus nicht ablesen und wird
        nirgends gespeichert.
      </p>
    </ProseSection>

    <ProseSection id="dse-mail" heading="Kontaktaufnahme per E-Mail">
      <p>
        Wer an kontakt@begutachtungs-monitor.at schreibt, übermittelt damit
        Absenderadresse, Betreff und Inhalt der Nachricht. Diese werden
        ausschließlich zur Beantwortung verwendet. Rechtsgrundlage ist
        Art 6 Abs 1 lit f DSGVO (berechtigtes Interesse an der Beantwortung
        von Anfragen). Die Nachrichten werden gelöscht, sobald sie nicht
        mehr gebraucht werden, spätestens nach zwei Jahren.
      </p>
      <p>
        Die Adresse ist eine reine Weiterleitung ohne eigenes Postfach; sie
        wird von der INWX GmbH &amp; Co. KG (Berlin, Deutschland) betrieben
        und leitet an ein privates Postfach weiter.
      </p>
    </ProseSection>

    <ProseSection id="dse-donations" heading="Spenden">
      <p>
        Wer per Überweisung spendet, übermittelt Name, IBAN und Betrag an das
        Konto des Medieninhabers. Diese Angaben stehen nur in seinem
        Kontoauszug und werden nicht weiterverwendet. Liberapay ist ein
        eigener Dienst mit eigener Datenschutzerklärung; der Monitor
        verlinkt ihn nur.
      </p>
    </ProseSection>

    <ProseSection id="dse-hosting" heading="Hosting">
      <p>
        Die Website läuft auf einem Server der netcup GmbH (Karlsruhe,
        Deutschland) im Rechenzentrum Nürnberg. Domain, DNS und
        E-Mail-Weiterleitung liegen bei der INWX GmbH &amp; Co. KG (Berlin,
        Deutschland). Beide sind Auftragsverarbeiter im Sinn des Art 28
        DSGVO und verarbeiten ausschließlich innerhalb der EU. Eine eigene
        Datenbank gibt es nicht; die Parlamentsdaten liegen im
        Arbeitsspeicher des Servers und in einer kleinen Datei mit dem
        zuletzt erfolgreich abgerufenen Stand. Veröffentlichte Gesetzes-
        und Entwurfstexte aus dem Parlament und dem RIS werden zusätzlich
        bis zu 30 Tage auf dem Server zwischengespeichert; Stellungnahmen
        sind nicht darunter. Die Zählung der
        Seitenaufrufe liegt als eine kleine Datei je Tag auf demselben
        Server.
      </p>
    </ProseSection>

    <ProseSection id="dse-names" heading="Namen aus den amtlichen Quellen">
      <p>
        Stellungnahmen kommen auch von Privatpersonen, und die amtlichen
        Quellen veröffentlichen ihre Namen. Das ist kein Grund, sie
        weiterzuverbreiten:
        <strong class="font-semibold text-ink">Der Monitor nennt keine
          Privatperson.</strong>
        Ihre Stellungnahmen stehen „Ohne Namen“ und werden gezählt.
      </p>
      <ul>
        <li>
          Im Zweifel steht eine Stellungnahme ohne Namen – auch die einer
          Organisation, die der Monitor nicht sicher als solche erkennt.
        </li>
        <li>
          Namentlich genannt werden Organisationen – Kammern, Verbände,
          Vereine, Behörden, Unternehmen – und Ministerien als Absender von
          Entwürfen. Rechtsgrundlage ist Art 6 Abs 1 lit f DSGVO: das
          öffentliche Interesse an der Nachvollziehbarkeit von Gesetzgebung
          überwiegt, weil es um die Beteiligung an einem öffentlichen
          Verfahren geht, nicht um private Lebensführung.
        </li>
        <li>
          Bei Petitionen und Bürgerinitiativen nennt der Monitor weder, wer
          sie als Erste oder Erster unterzeichnet hat, noch welche
          Abgeordneten eine Petition überreichen – nur deren Klub. Die Liste
          der Unterstützenden liest er nicht.
        </li>
        <li>
          Wer der Europäischen Kommission eine Rückmeldung gegeben hat, liest
          der Monitor erst, wenn jemand danach fragt: zunächst die neuesten
          1.000 Rückmeldungen, weitere nur, wenn jemand sie anfordert,
          höchstens 5.000 je Frist. Die Namen der
          Organisationen hält er höchstens sechs Stunden im Arbeitsspeicher
          und speichert sie nicht.
        </li>
        <li>
          Es werden keine Profile gebildet, keine Personen über Verfahren
          hinweg verknüpft und keine Texte von Stellungnahmen gespeichert
          oder wiedergegeben.
        </li>
      </ul>
      <p>
        Weil diese Daten nicht bei den Betroffenen erhoben wurden, gilt
        Art 14 DSGVO. Sie stammen von der Parlamentsdirektion
        (<ExternalLink
          href="https://www.parlament.gv.at/recherchieren/open-data/"
          class="link-inline"
        >parlament.gv.at</ExternalLink>), von den Seiten der Länder
        Burgenland, Kärnten, Oberösterreich, Salzburg, Tirol und Wien, der
        Landtage Steiermark und Tirol und vom Portal „Ihre Meinung zählt“
        der Europäischen Kommission; die Adressen stehen unter
        <NuxtLink to="/quellen" class="link-inline">Quellen &amp; Lizenzen</NuxtLink>.
      </p>
      <p>
        Wer findet, dass ein Name hier nicht stehen sollte, bekommt das ohne
        Diskussion korrigiert – eine kurze
        <a
          href="mailto:kontakt@begutachtungs-monitor.at"
          class="link-inline"
        >E-Mail</a>
        genügt. Bei der Quelle bleibt der Eintrag davon unberührt; dafür ist
        sie zuständig.
      </p>
    </ProseSection>

    <ProseSection id="dse-rights" heading="Rechte der Betroffenen">
      <p>
        Es besteht das Recht auf Auskunft (Art 15), Berichtigung (Art 16),
        Löschung (Art 17), Einschränkung der Verarbeitung (Art 18),
        Datenübertragbarkeit (Art 20) und Widerspruch gegen Verarbeitungen
        auf Grundlage berechtigter Interessen (Art 21 DSGVO). Eine
        formlose Nachricht an
        <a
          href="mailto:kontakt@begutachtungs-monitor.at"
          class="link-inline"
        >kontakt@begutachtungs-monitor.at</a>
        reicht.
      </p>
      <p>
        Unabhängig davon besteht ein Beschwerderecht bei der
        <ExternalLink
          href="https://www.dsb.gv.at"
          class="link-inline"
        >österreichischen Datenschutzbehörde</ExternalLink>, Barichgasse 40–42, 1030 Wien,
        <a href="mailto:dsb@dsb.gv.at" class="link-inline">dsb@dsb.gv.at</a>.
      </p>
    </ProseSection>

    <ProseSection id="dse-status" heading="Stand">
      <p>
        16. November 2026. Ändert sich etwas an der Verarbeitung, wird diese
        Erklärung vorher angepasst.
      </p>
    </ProseSection>
  </div>
</template>

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
  title: 'Impressum & Offenlegung',
  description:
    'Offenlegung nach § 25 Mediengesetz: Medieninhaber, Unternehmensgegenstand, Beteiligungsverhältnisse und grundlegende Richtung des Begutachtungs-Monitors.',
})
</script>

<template>
  <div class="mx-auto w-full max-w-2xl">
    <h1 class="page-title">
      Impressum &amp; Offenlegung
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
        Betrieb einer nichtkommerziellen Informationsplattform zum
        österreichischen Begutachtungsverfahren: Aufbereitung öffentlich
        zugänglicher Daten zu Ministerialentwürfen, Begutachtungsfristen und
        Stellungnahmen sowie Nachverfolgung des weiteren Verlaufs bis zur
        Kundmachung im Bundesgesetzblatt.
      </p>
    </ProseSection>

    <ProseSection id="imp-shares" heading="Beteiligungsverhältnisse">
      <p>
        Medieninhaber ist eine natürliche Person. Es bestehen keine
        Beteiligungen anderer Personen oder Unternehmen, keine stillen
        Beteiligungen und keine Treuhandverhältnisse. Das Projekt wird nicht
        finanziert, weder durch Förderungen noch durch Spenden, Werbung oder
        Auftraggeber. Sollte sich das ändern, steht es hier.
      </p>
    </ProseSection>

    <ProseSection id="imp-line" heading="Grundlegende Richtung (Blattlinie)">
      <p>
        Der Begutachtungs-Monitor macht die Begutachtungsphase der
        österreichischen Gesetzgebung sichtbar und verfolgt nach, was aus
        den eingebrachten Stellungnahmen wird. Übernommene Anregungen
        werden so deutlich gezeigt wie übergangene.
      </p>
      <p>
        Der Monitor ist parteipolitisch unabhängig und keiner Regierung,
        Partei, Interessenvertretung, Kirche oder Behörde verbunden. Er
        bewertet Gesetzesvorhaben nicht inhaltlich und empfiehlt keine
        Positionen. Kennzahlen zu einzelnen Ministerien zeigt er dort, wo
        sie belegbar sind – aber stets für übernommene wie für übergangene
        Anregungen und nie als Rangliste. Was er zeigt, sind nachprüfbare Vorgänge: Fristen,
        Zahlen, Dokumente und die Unterschiede zwischen ihnen, jeweils mit
        Link auf die amtliche Quelle.
      </p>
      <p>
        Dahinter steht die Überzeugung, dass öffentliche Beteiligung nur
        dann etwas wert ist, wenn nachvollziehbar bleibt, was mit ihr
        geschieht – und dass diese Nachvollziehbarkeit heute an Aufwand
        scheitert, nicht an Geheimhaltung. Nachverfolgung statt Bewertung.
      </p>
    </ProseSection>

    <ProseSection id="imp-data" heading="Hinweis zu den Daten">
      <p>
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
      <p>
        Stellungnahmen von Privatpersonen werden nicht namentlich
        wiedergegeben; warum, steht
        <NuxtLink
          to="/ueber#about-privacy"
          class="link-inline"
        >auf der Über-Seite</NuxtLink>.
      </p>
    </ProseSection>

    <ProseSection id="imp-license" heading="Urheberrecht & Lizenzen">
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
           less than half (`pnpm corpus:kurzinfo`).
           The Kurzinformation is therefore Parliament's editorial
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
           documents at all is part of the open licence question
           (docs/decisions.md, Open questions).

           And the Beteiligungen became a block of their own the same day,
           after the dataset pages were read line by line: Parliament
           licenses the result lists of Beteiligungen as CC BY 4.0 and
           excludes only those zu Ministerialentwürfen, so the
           Stellungnahmen zur Regierungsvorlage and those zum Entwurf
           cannot stand under one heading. The same reading narrowed the
           exclusion sentence here — it names the Stellungnahmen, not the
           Ministerialentwürfe — and moved the documents of the
           parliamentary stations out of CC BY: Parliament calls them
           freie Werke and licenses the lists around them.

           The Beteiligungen half of that reading was wrong (corrected
           30.09.2026). The Beteiligungen dataset is „Aktuelle
           Beteiligungen" (list 143): initiatives, Bürgerinitiativen and
           petitions open for participation on the day of the query, and
           its page says „Ministerialentwürfe und Stellungnahmen fallen
           nicht darunter". Its CC BY grant never reached list 142. The
           Regierungsvorlagen page excludes „sämtliche Informationen zu
           Stellungnahmen" from free use and licensing alike, for data
           protection and copyright — so the Stellungnahmen zur
           Regierungsvorlage stand where those zum Entwurf stand: no
           licence, and the same open question. -->
      <p>
        Der Monitor bezieht Daten aus amtlichen Quellen. Die
        Nutzungsbedingungen unterscheiden sich je nach Datensatz. Unter
        jedem Text auf einer Entwurfsseite steht, aus welcher Quelle er
        stammt; Gliederung und Markierung sind vom Monitor.
      </p>
      <!-- 15.11.2026: the Länder entries said documents are only linked.
           The comparisons of a Land's draft read its PDFs (draft text,
           Erläuterungen, Textgegenüberstellung, the Landtag's Vorlagen:
           `server/utils/laender/texts/read.ts`, `landExplanations.ts`,
           `landTgu.ts`) and show passages of them. Said once here, not
           nine times below. -->
      <p>
        Für die Vergleiche auf den Seiten der Landesentwürfe liest der
        Monitor die Dokumente der Länder und Landtage – Entwurf,
        Erläuterungen, Textgegenüberstellung, Vorlage – und zeigt daraus
        die verglichenen Stellen, jeweils mit Link auf das Dokument.
      </p>
      <dl>
        <div>
          <dt>
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
          <dt>
            Parlamentsdirektion, Stationen nach der Begutachtung
          </dt>
          <dd>
            Regierungsvorlagen, Anträge von Abgeordneten, Ausschüssen und des
            Bundesrates, Staatsverträge, Ausschussberichte und Beschlüsse,
            samt den Abstimmungen nach Klubs: Ergebnislisten und
            Geschichtsseiten, ausgenommen alles zu Stellungnahmen –
            <ExternalLink
              href="https://creativecommons.org/licenses/by/4.0/deed.de"
              class="link-inline"
            >CC BY 4.0</ExternalLink>. Die Dokumente selbst bezeichnet das Parlament als freie
            Werke, „ohne Lizenzierung frei nutzbar“.
          </dd>
        </div>
        <!-- Anliegen since 15.11.2026. Parliament's dataset pages
             „Petitionen" and „Bürgerinitiativen" (read 14. and 15.11.2026):
             result lists and Geschichtsseiten CC BY 4.0, the statements
             area excluded, documents free works; the Petitionen dataset
             names both chambers. No dataset is named for Volksbegehren. -->
        <div>
          <dt>
            Parlamentsdirektion, Petitionen, Bürgerinitiativen und Volksbegehren
          </dt>
          <dd>
            Petitionen an den Nationalrat und an den Bundesrat und
            parlamentarische Bürgerinitiativen, samt der Zahl der
            Unterstützungen: Ergebnislisten und Geschichtsseiten, ausgenommen
            alles zu Stellungnahmen –
            <ExternalLink
              href="https://creativecommons.org/licenses/by/4.0/deed.de"
              class="link-inline"
            >CC BY 4.0</ExternalLink>. Für Volksbegehren führt das Parlament keinen eigenen
            Datensatz; der Monitor behandelt sie wie die Gegenstände oben.
            Für die Stellungnahmen gilt der folgende Eintrag.
          </dd>
        </div>
        <div>
          <dt>
            Parlamentsdirektion, Stellungnahmen im parlamentarischen Verfahren
          </dt>
          <dd>
            Keine Open-Data-Lizenz: Das Parlament nimmt „sämtliche
            Informationen zu Stellungnahmen“ von der freien Nutzung und
            Lizenzierung aus. Der Monitor zeigt Anzahl, Datum, Zustimmungen
            und die Namen einreichender Organisationen und verlinkt die
            Stellungnahme.
          </dd>
        </div>
        <div>
          <dt>
            Parlamentsdirektion, Begutachtungsverfahren
          </dt>
          <dd>
            Ministerialentwürfe, Stellungnahmen und Zustimmungen: keine
            Open-Data-Lizenz; die Stellungnahmen nimmt das Parlament von der
            Weiterverwendung ausdrücklich aus. Der Monitor zeigt Fristen,
            Geschäftszahlen, die Anzahl der Einreichungen, die Namen
            einreichender Organisationen und die Kurzinformation des
            Parlaments zu einem Entwurf; im Textvergleich außerdem
            Gesetzestext und Erläuterungen in der Fassung des Parlaments –
            Dokumente des Ressorts, die das RIS unter CC BY 4.0 führt. Die Texte von Stellungnahmen übernimmt der Monitor
            nicht; er verlinkt sie auf
            <ExternalLink
              href="https://www.parlament.gv.at"
              class="link-inline"
            >parlament.gv.at</ExternalLink>.
          </dd>
        </div>
        <!-- EUR-Lex and the Cellar since 04.11.2026. EUR-Lex's
             legal notice (read in a browser on 04.11.2026 — scripts get a
             bot check) dedicates EUR-Lex METADATA to the public domain
             (CC0 1.0); legal documents are reusable under Decision
             2011/833/EU, editorial content under CC BY 4.0, the logo not at
             all. What the monitor takes is metadata — dates — and a link:
             no text of an act, no logo. The wording below says exactly that
             and no more. Since 15.11.2026 the act's procedure joins it: its
             number, the Commission proposal's number and the dated steps,
             metadata from the same Cellar. -->
        <div id="imp-eurlex">
          <dt>
            Amt für Veröffentlichungen der Europäischen Union (EUR-Lex, Cellar)
          </dt>
          <dd>
            Titel, Beschlussdatum, Umsetzungsfrist und Fundstelle im Amtsblatt
            von EU-Rechtsakten, die Tage des Inkrafttretens und des
            Geltungsbeginns, zum Verfahren eines Rechtsakts dessen Nummer,
            die Nummer des Vorschlags der Kommission und die Schritte mit
            ihrem Datum, zu einem Vorschlag der Kommission dessen Titel und
            Datum, sein Verfahren mit dem Stand, den der Cellar dafür angibt,
            und die Rechtsakte, die daraus hervorgegangen sind, die Liste der
            Richtlinien mit ihren Umsetzungsfristen, und zu einer Richtlinie
            die Maßnahmen, die Österreich der Kommission als Umsetzung
            gemeldet hat (Titel, Art, Tag der Meldung, Fundstelle), aus dem
            Cellar, und der Link auf
            <ExternalLink
              href="https://eur-lex.europa.eu"
              class="link-inline"
            >EUR-Lex</ExternalLink> – Metadaten, die das Amt laut seinem
            <ExternalLink
              href="https://eur-lex.europa.eu/content/legal-notice/legal-notice.html?locale=de"
              class="link-inline"
            >rechtlichen Hinweis</ExternalLink> der Public Domain widmet
            (CC0 1.0). Die Texte der Rechtsakte verlinkt der Monitor.
          </dd>
        </div>
        <!-- The Commission's portal „Ihre Meinung zählt" (15.11.2026, step 2
             of the EU cycle): data of an initiative — stage, feedback
             period, number of contributions — read from the portal's own
             JSON addresses; the Commission's legal notice licenses its
             content CC BY 4.0. A contribution's text is never kept. Since
             step 4 (15.11.2026) the list of contributions is read on demand:
             organisations named, persons counted (`docs/decisions.md`,
             „Who gave feedback on the Commission's portal"). -->
        <div id="imp-kommission">
          <dt>
            Europäische Kommission, Portal „Ihre Meinung zählt“
          </dt>
          <dd>
            Die Liste der Vorhaben, zu denen gerade Rückmeldungen möglich sind,
            und zu einzelnen Vorhaben und Vorschlägen der Kommission: Titel,
            das Stadium, die vorgesehene Art des Rechtsakts, der Zeitraum, in
            dem Rückmeldungen möglich sind oder waren, und ihre Zahl, abgefragt
            vom Portal
            <ExternalLink
              href="https://ec.europa.eu/info/law/better-regulation/have-your-say_de"
              class="link-inline"
            >„Ihre Meinung zählt“</ExternalLink>. Inhalte der Kommission stehen
            laut ihrem
            <ExternalLink
              href="https://commission.europa.eu/legal-notice_de"
              class="link-inline"
            >rechtlichen Hinweis</ExternalLink> unter CC BY 4.0; der Monitor
            gibt sie gekürzt und in eigener Darstellung wieder. Beiträge
            selbst übernimmt er nicht, er verlinkt das Portal. Wer sich zu
            einer Frist geäußert hat, liest der Monitor erst, wenn jemand
            danach fragt, und höchstens die neuesten 500 Rückmeldungen:
            Organisationen nennt er mit dem Namen, den das Portal
            veröffentlicht, Privatpersonen zählt er und nennt sie nicht. Die
            Namen hält er höchstens sechs Stunden im Arbeitsspeicher und
            speichert sie nicht.
          </dd>
        </div>
        <!-- The Länder since 22.10.2026 (Salzburg, then Wien and
             Oberösterreich the same day; Kärnten and Tirol on 23.10.2026;
             Burgenland, Niederösterreich, Steiermark and Vorarlberg on
             30.10.2026),
             read off each Land's own list
             (`server/utils/laender/`). No licence claimed where none is
             stated for those lists — Wien states CC BY 4.0 for its pages
             since its relaunch (seen 30.10.2026), and the entry says how far. What the monitor takes is a title, a date and a
             link — the documents stay on the Land's site. -->
        <div>
          <dt>
            Land Salzburg, Gesetz- und Verordnungsentwürfe in Begutachtung
          </dt>
          <dd>
            Titel und Begutachtungsfrist der Entwürfe und die einreichenden
            Organisationen der Stellungnahmen, von
            <ExternalLink
              href="https://service.salzburg.gv.at/pub/list/gesetz_entw/landesrecht-list"
              class="link-inline"
            >service.salzburg.gv.at</ExternalLink>. Eine Open-Data-Lizenz weist das Land für diese Seiten nicht aus; Dokumente und Stellungnahmen verlinkt der Monitor beim Land.
          </dd>
        </div>
        <div>
          <dt>
            Stadt Wien, Entwürfe von Landesgesetzen und Verordnungen
          </dt>
          <dd>
            Titel, Auflagefrist, zuständige Magistratsabteilung und die
            einreichenden Organisationen der Stellungnahmen, von
            <ExternalLink
              href="https://www.wien.gv.at/recht/landesgesetze-entwuerfe"
              class="link-inline"
            >wien.gv.at</ExternalLink> –
            <ExternalLink
              href="https://creativecommons.org/licenses/by/4.0/deed.de"
              class="link-inline"
            >CC BY 4.0</ExternalLink>. Ob das auch für die verlinkten Entwürfe und
            Stellungnahmen gilt, sagen die Seiten nicht; der Monitor verlinkt
            sie bei der Stadt.
          </dd>
        </div>
        <div>
          <dt>
            Land Oberösterreich und Oö. Landtag, Begutachtungsentwürfe
          </dt>
          <dd>
            Titel, Begutachtungsfrist, die Kurzinformation des Landes, die
            einreichenden Organisationen der Stellungnahmen und die Schritte
            im Landtag, von
            <ExternalLink
              href="https://www.land-oberoesterreich.gv.at/35987.htm"
              class="link-inline"
            >land-oberoesterreich.gv.at</ExternalLink> und aus dem
            Landtagsinformationssystem. Eine Open-Data-Lizenz weist das Land für diese Seiten nicht aus; Dokumente verlinkt der Monitor beim Land.
          </dd>
        </div>
        <div>
          <dt>
            Land Kärnten, Verfassungsdienst, Begutachtungen von Landesgesetzen
          </dt>
          <dd>
            Titel und Begutachtungsfrist der Gesetzes- und
            Verordnungsentwürfe, die einreichenden Organisationen der
            Stellungnahmen, Regierungsvorlagen und Gesetzesbeschlüsse des
            Landtags, von
            <ExternalLink
              href="https://www.ktn.gv.at/Verwaltung/Amt-der-Kaerntner-Landesregierung/Verfassungsdienst/Landesgesetzgebung/akt%5fBeg%5fLG"
              class="link-inline"
            >ktn.gv.at</ExternalLink>. Eine Open-Data-Lizenz weist das Land für diese Seiten nicht aus; Dokumente verlinkt der Monitor beim Land.
          </dd>
        </div>
        <div>
          <dt>
            Land Tirol und Tiroler Landtag, Gesetzentwürfe in Begutachtung
          </dt>
          <dd>
            Titel und Begutachtungsfrist von
            <ExternalLink
              href="https://www.tirol.gv.at/buergerservice/landesgesetze-verordnungen-und-richtlinien/gesetzentwuerfe-in-begutachtung/"
              class="link-inline"
            >tirol.gv.at</ExternalLink>, die einreichenden Organisationen der
            Stellungnahmen und die Schritte im Landtag aus der
            <ExternalLink
              href="https://lte.tirol.gv.at/public/index.xhtml"
              class="link-inline"
            >Landtagsevidenz</ExternalLink>. Eine Open-Data-Lizenz weist das Land für diese Seiten nicht aus; Dokumente verlinkt der Monitor beim Land.
            Die Verordnungsentwürfe der Landesregierung stammen aus dem
            <ExternalLink
              href="https://www.data.gv.at/datasets?query=%22Verordnungsbegutachtungen+Tirol%22"
              class="link-inline"
            >Informationsregister auf data.gv.at</ExternalLink>; ihre Dokumente stellt das Land dort unter
            CC BY 4.0 bereit.
          </dd>
        </div>
        <div>
          <dt>
            Land Burgenland, Begutachtungsentwürfe
          </dt>
          <dd>
            Titel und Begutachtungsfrist der Entwürfe seit 2007 und die
            einreichenden Organisationen der Stellungnahmen, von
            <ExternalLink
              href="https://apps.bgld.gv.at/web/landesrecht.nsf/begutachtungen_aktuell.xsp"
              class="link-inline"
            >apps.bgld.gv.at</ExternalLink>. Eine Open-Data-Lizenz weist das Land für diese Seiten nicht aus; Dokumente verlinkt der Monitor beim Land.
          </dd>
        </div>
        <div>
          <dt>
            Land Niederösterreich, Bürgerbegutachtung
          </dt>
          <dd>
            Titel, Begutachtungsfrist und die Adresse für Stellungnahmen der
            laufenden Begutachtungen, von
            <ExternalLink
              href="https://www.noe.gv.at/noe/Kontakt-Landesverwaltung/Buergerbegutachtung.html"
              class="link-inline"
            >noe.gv.at</ExternalLink>. Eine Open-Data-Lizenz weist das Land für diese Seiten nicht aus; Dokumente verlinkt der Monitor beim Land.
          </dd>
        </div>
        <div>
          <dt>
            Landtag Steiermark, Begutachtungsverfahren (§ 24 GeoLT iVm Art 68 L-VG)
          </dt>
          <dd>
            Titel und Begutachtungsfrist der Entwürfe seit Juni 2015 und die
            einreichenden Organisationen der Stellungnahmen, aus
            <ExternalLink
              href="https://pallast2.stmk.gv.at/pallast-p/pub/documents?type=BEGUTACHTUNGSVERFAHREN&sort=tssubmit&order=desc"
              class="link-inline"
            >PALLAST</ExternalLink>, dem Dokumentensystem des Landtags. Eine
            Open-Data-Lizenz weist der Landtag für diese Seiten nicht aus;
            Dokumente verlinkt der Monitor beim Landtag.
          </dd>
        </div>
        <div>
          <dt>
            Land Vorarlberg, aktuelle Begutachtungsentwürfe
          </dt>
          <dd>
            Titel und Begutachtungsfrist der laufenden Begutachtungen, von
            <ExternalLink
              href="https://vorarlberg.at/-/aktuelle-begutachtungsverfahren"
              class="link-inline"
            >vorarlberg.at</ExternalLink>. Eine Open-Data-Lizenz weist das Land für diese Seiten nicht aus; Dokumente verlinkt der Monitor beim Land.
          </dd>
        </div>
      </dl>
      <p>
        Der Quellcode des Monitors ist unter der
        <ExternalLink
          href="https://github.com/mmeindl/begutachtungs-monitor"
          class="link-inline"
        >AGPL-3.0 veröffentlicht</ExternalLink>. Texte dieser Website dürfen unter Nennung der Quelle
        weiterverwendet werden.
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

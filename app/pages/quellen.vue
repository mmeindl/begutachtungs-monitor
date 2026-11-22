<script setup lang="ts">
/**
 * Quellen & Lizenzen: which source the monitor reads and under which terms
 * (16.11.2026). Until then this was a section of the Impressum, and by then
 * 420 of its 576 lines.
 *
 * One entry per source, and each says three things in this order: the
 * licence, what is taken, the link. What a source publishes and what it does
 * not is `/datenlage`; how names are handled is `/datenschutz#dse-names`.
 * Neither is repeated here.
 *
 * Per dataset, never across the board. How each reading came about, so the
 * wording is not levelled again:
 *   - RIS (22.11.2026): the entry names the Land law in force and the
 *     Landesgesetzblätter too. The pages of a Land's laws and the Länder's
 *     comparisons read both from the same open data (`LrKons`, `LgblAuth`;
 *     the dataset „RIS Daten" licenses all its distributions CC BY 4.0,
 *     docs/api-exploration.md), and until then the entry said „geltendes
 *     Bundesrecht und das Bundesgesetzblatt" alone.
 *   - Parliament. The dataset pages were read line by line (23.09.2026,
 *     corrected 30.09.2026): result lists and Geschichtsseiten of the
 *     stations after the Begutachtung are CC BY 4.0, the documents are
 *     „freie Werke"; the Begutachtung's own data carries no grant; and the
 *     Regierungsvorlagen page excludes „sämtliche Informationen zu
 *     Stellungnahmen" from free use and licensing alike. „Aktuelle
 *     Beteiligungen" (list 143) says „Ministerialentwürfe und Stellungnahmen
 *     fallen nicht darunter", so its grant never reached list 142.
 *   - The Kurzinformation is Parliament's editorial work on the Ressort's
 *     material, not metadata (19.09.2026, `pnpm corpus:kurzinfo`), so it is
 *     named.
 *   - The comparisons read the draft's Gesetzestext and Erläuterungen from
 *     Parliament's copy where one exists (23.09.2026). The same documents
 *     stand in RIS under CC BY; the entry names what is shown instead of
 *     claiming a licence. Open: docs/decisions.md, „Open questions".
 *   - Petitionen and Bürgerinitiativen (dataset pages read 14. and
 *     15.11.2026): lists and Geschichtsseiten CC BY 4.0, the statements area
 *     excluded. No dataset is named for Volksbegehren, so none is claimed.
 *   - EUR-Lex (legal notice read in a browser on 04.11.2026): metadata is
 *     CC0 1.0; what is taken is metadata and a link, no text of an act.
 *   - The Commission's portal and the register of the European Citizens'
 *     Initiative (legal notices checked 14./15.11.2026): EU-owned content is
 *     CC BY 4.0, third parties' content is not covered, logos excluded.
 *   - The Länder (22.–30.10.2026): no licence is claimed where none is
 *     stated. Wien states CC BY 4.0 for its pages; Tirol's
 *     Verordnungsentwürfe come from data.gv.at under CC BY 4.0. That the
 *     comparisons read the Länder's documents is said once (15.11.2026).
 *
 * A new source ships only with its entry here (CLAUDE.md, „Legal").
 */
usePageSeo({
  title: 'Quellen & Lizenzen',
  description:
    'Aus welchen amtlichen Quellen der Begutachtungs-Monitor seine Daten bezieht und unter welcher Lizenz jede steht: RIS, Parlament, die neun Länder, EUR-Lex und die Europäische Kommission.',
})

const CC_BY = 'https://creativecommons.org/licenses/by/4.0/deed.de'

/** The Länder that state no open-data licence for the pages the monitor reads. */
const LAENDER_WITHOUT_LICENCE: { name: string; label: string; href: string }[] = [
  { name: 'Burgenland', label: 'apps.bgld.gv.at', href: 'https://apps.bgld.gv.at/web/landesrecht.nsf/begutachtungen_aktuell.xsp' },
  { name: 'Kärnten', label: 'ktn.gv.at', href: 'https://www.ktn.gv.at/Verwaltung/Amt-der-Kaerntner-Landesregierung/Verfassungsdienst/Landesgesetzgebung/akt%5fBeg%5fLG' },
  { name: 'Niederösterreich', label: 'noe.gv.at', href: 'https://www.noe.gv.at/noe/Kontakt-Landesverwaltung/Buergerbegutachtung.html' },
  { name: 'Oberösterreich', label: 'land-oberoesterreich.gv.at', href: 'https://www.land-oberoesterreich.gv.at/35987.htm' },
  { name: 'Salzburg', label: 'service.salzburg.gv.at', href: 'https://service.salzburg.gv.at/pub/list/gesetz_entw/landesrecht-list' },
  { name: 'Steiermark', label: 'PALLAST, das Dokumentensystem des Landtags', href: 'https://pallast2.stmk.gv.at/pallast-p/pub/documents?type=BEGUTACHTUNGSVERFAHREN&sort=tssubmit&order=desc' },
  { name: 'Tirol', label: 'tirol.gv.at', href: 'https://www.tirol.gv.at/buergerservice/landesgesetze-verordnungen-und-richtlinien/gesetzentwuerfe-in-begutachtung/' },
  { name: 'Vorarlberg', label: 'vorarlberg.at', href: 'https://vorarlberg.at/-/aktuelle-begutachtungsverfahren' },
]
</script>

<template>
  <div class="mx-auto w-full max-w-2xl">
    <h1 class="page-title">
      Quellen &amp; Lizenzen
    </h1>
    <p class="mt-4 leading-relaxed text-ink-secondary">
      Alle Daten stammen aus amtlichen Quellen, und jede hat eigene
      Bedingungen. Unter jedem Text auf einer Entwurfsseite steht, woher er
      stammt; Gliederung und Markierung sind vom Monitor. Was eine Quelle
      veröffentlicht und was nicht, steht in der
      <NuxtLink to="/datenlage" class="link-inline">Datenlage</NuxtLink>.
    </p>

    <ProseSection id="bund" heading="Bund" first>
      <dl>
        <div id="ris">
          <dt>Rechtsinformationssystem des Bundes (Bundeskanzleramt)</dt>
          <dd>
            <ExternalLink :href="CC_BY" class="link-inline">CC BY 4.0</ExternalLink>.
            Entwurfstexte und Erläuterungen der Ministerien,
            Textgegenüberstellungen, geltendes Bundes- und Landesrecht, das
            Bundesgesetzblatt und die Landesgesetzblätter.
          </dd>
        </div>
        <div id="parlament-stationen">
          <dt>Parlamentsdirektion: Stationen nach der Begutachtung</dt>
          <dd>
            Ergebnislisten und Geschichtsseiten:
            <ExternalLink :href="CC_BY" class="link-inline">CC BY 4.0</ExternalLink>.
            Die Dokumente selbst bezeichnet das Parlament als freie Werke,
            „ohne Lizenzierung frei nutzbar“. Regierungsvorlagen, Anträge,
            Staatsverträge, Ausschussberichte und Beschlüsse, samt den
            Abstimmungen nach Klubs.
          </dd>
        </div>
        <div id="parlament-anliegen">
          <dt>Parlamentsdirektion: Petitionen und Bürgerinitiativen</dt>
          <dd>
            Ergebnislisten und Geschichtsseiten:
            <ExternalLink :href="CC_BY" class="link-inline">CC BY 4.0</ExternalLink>.
            Petitionen an den Nationalrat und an den Bundesrat und
            parlamentarische Bürgerinitiativen, samt der Zahl der
            Unterstützungen. Für Volksbegehren führt das Parlament keinen
            eigenen Datensatz und nennt keine Lizenz.
          </dd>
        </div>
        <div id="parlament-begutachtung">
          <dt>Parlamentsdirektion: Begutachtungsverfahren</dt>
          <dd>
            Keine Open-Data-Lizenz. Der Monitor zeigt Fristen,
            Geschäftszahlen, die Zahl der Einreichungen und Zustimmungen und
            die Kurzinformation des Parlaments zu einem Entwurf. Im
            Textvergleich zeigt er Gesetzestext und Erläuterungen in der
            Fassung des Parlaments – Dokumente des Ministeriums, die das RIS unter
            CC BY 4.0 führt.
          </dd>
        </div>
        <div id="parlament-stellungnahmen">
          <dt>Parlamentsdirektion: Stellungnahmen</dt>
          <dd>
            Keine Open-Data-Lizenz: Das Parlament nimmt „sämtliche
            Informationen zu Stellungnahmen“ von der freien Nutzung und
            Lizenzierung aus, in der Begutachtung wie im parlamentarischen
            Verfahren. Der Monitor zeigt Zahl, Datum und die Namen
            einreichender Organisationen. Die Texte übernimmt er nicht; er
            verlinkt sie auf
            <ExternalLink href="https://www.parlament.gv.at" class="link-inline">parlament.gv.at</ExternalLink>.
          </dd>
        </div>
      </dl>
    </ProseSection>

    <ProseSection id="laender" heading="Länder">
      <p>
        Von den Seiten der Länder und Landtage liest der Monitor Titel und
        Frist der Entwürfe, die einreichenden Organisationen der
        Stellungnahmen und die Schritte im Landtag – je Land so weit, wie es
        sie veröffentlicht, in Oberösterreich auch die Kurzinformation des
        Landes. Für die Vergleiche liest er außerdem Entwurf,
        Erläuterungen, Textgegenüberstellung und Vorlage und zeigt daraus die
        verglichenen Stellen, jeweils mit Link auf das Dokument.
        Stellungnahmen verlinkt er beim Land.
      </p>
      <dl>
        <div id="wien">
          <dt>Stadt Wien</dt>
          <dd>
            <ExternalLink :href="CC_BY" class="link-inline">CC BY 4.0</ExternalLink>
            für die Seiten auf
            <ExternalLink href="https://www.wien.gv.at/recht/landesgesetze-entwuerfe" class="link-inline">wien.gv.at</ExternalLink>.
            Ob das auch für die verlinkten Entwürfe und Stellungnahmen gilt,
            sagen die Seiten nicht.
          </dd>
        </div>
        <div id="tirol-verordnungen">
          <dt>Land Tirol: Verordnungsentwürfe der Landesregierung</dt>
          <dd>
            <ExternalLink :href="CC_BY" class="link-inline">CC BY 4.0</ExternalLink>,
            aus dem
            <ExternalLink
              href="https://www.data.gv.at/datasets?query=%22Verordnungsbegutachtungen+Tirol%22"
              class="link-inline"
            >Informationsregister auf data.gv.at</ExternalLink>.
          </dd>
        </div>
        <div id="laender-ohne-lizenz">
          <dt>Alle anderen Seiten der Länder</dt>
          <dd>
            Keine Open-Data-Lizenz ausgewiesen:
            <template v-for="(land, i) in LAENDER_WITHOUT_LICENCE" :key="land.name"><template v-if="i">, </template>{{ land.name }}
              (<ExternalLink :href="land.href" class="link-inline">{{ land.label }}</ExternalLink><template v-if="land.name === 'Tirol'">
                und
                <ExternalLink href="https://lte.tirol.gv.at/public/index.xhtml" class="link-inline">Landtagsevidenz</ExternalLink></template>)</template>.
          </dd>
        </div>
      </dl>
    </ProseSection>

    <ProseSection id="eu" heading="Europäische Union">
      <dl>
        <div id="eurlex">
          <dt>Amt für Veröffentlichungen der EU (EUR-Lex, Cellar)</dt>
          <dd>
            Metadaten, die das Amt laut seinem
            <ExternalLink
              href="https://eur-lex.europa.eu/content/legal-notice/legal-notice.html?locale=de"
              class="link-inline"
            >rechtlichen Hinweis</ExternalLink>
            der Public Domain widmet (CC0 1.0). Zu Rechtsakten und Vorschlägen
            der Kommission: Titel, Nummern, Daten, Fristen, Fundstellen und die
            Schritte des Verfahrens; zu Richtlinien die Maßnahmen, die
            Österreich als Umsetzung gemeldet hat. Die Texte der Rechtsakte
            verlinkt der Monitor auf
            <ExternalLink href="https://eur-lex.europa.eu" class="link-inline">EUR-Lex</ExternalLink>.
          </dd>
        </div>
        <div id="kommission">
          <dt>Europäische Kommission: Portal „Ihre Meinung zählt“</dt>
          <dd>
            <ExternalLink :href="CC_BY" class="link-inline">CC BY 4.0</ExternalLink>
            für Inhalte der Kommission, laut ihrem
            <ExternalLink href="https://commission.europa.eu/legal-notice_de" class="link-inline">rechtlichen Hinweis</ExternalLink>;
            der Monitor gibt sie gekürzt und in eigener Darstellung wieder.
            Vorhaben mit offener Rückmeldefrist und je Vorhaben Titel,
            Stadium, Art des Rechtsakts, Zeitraum und Zahl der Rückmeldungen,
            vom
            <ExternalLink
              href="https://ec.europa.eu/info/law/better-regulation/have-your-say_de"
              class="link-inline"
            >Portal</ExternalLink>.
            Die Rückmeldungen selbst stammen von Dritten: Ihre Texte übernimmt
            der Monitor nicht; er nennt einreichende Organisationen und
            verlinkt die Rückmeldung im Portal.
          </dd>
        </div>
        <div id="buergerinitiative">
          <dt>Europäische Kommission: Register der Europäischen Bürgerinitiative</dt>
          <dd>
            <ExternalLink :href="CC_BY" class="link-inline">CC BY 4.0</ExternalLink>
            für Inhalte der Europäischen Union, laut ihrem
            <ExternalLink href="https://european-union.europa.eu/legal-notice_de" class="link-inline">rechtlichen Hinweis</ExternalLink>;
            der Monitor gibt sie gekürzt und in eigener Darstellung wieder.
            Titel, Stand, die Tage des Verfahrens, die Zahl der
            Unterstützungen und die Links zum Sammelsystem und zur Antwort der
            Kommission, vom
            <ExternalLink href="https://citizens-initiative.europa.eu/_de" class="link-inline">Register</ExternalLink>.
            Namen von Organisatorinnen, Organisatoren und Geldgebern, Logos
            und die Texte der Initiativen übernimmt der Monitor nicht.
          </dd>
        </div>
      </dl>
    </ProseSection>

    <ProseSection id="eigenes" heading="Der Monitor selbst">
      <p>
        Der Quellcode ist unter der
        <ExternalLink
          href="https://github.com/mmeindl/begutachtungs-monitor"
          class="link-inline"
        >AGPL-3.0 veröffentlicht</ExternalLink>.
      </p>
      <!-- 16.11.2026, decided by the maintainer: a licence in place of
           „dürfen unter Nennung der Quelle weiterverwendet werden", which
           left open whether a text may be shortened or translated and how
           to credit it. Only the monitor's own writing: the sources keep
           their terms, and the name and the § mark are not licensed. A CC
           grant cannot be withdrawn for what was published under it. -->
      <p id="eigene-texte">
        Die eigenen Texte des Monitors – Erklärungen, Methodentexte, die
        Beschreibung der Wege und der Datenlage – stehen unter
        <ExternalLink :href="CC_BY" class="link-inline">CC BY 4.0</ExternalLink>.
        Als Quellenangabe genügt „Begutachtungs-Monitor“ mit einem Link auf
        die Seite. Das gilt nicht für das Material der amtlichen Quellen, für
        das die Bedingungen oben gelten, und nicht für den Namen und das
        Zeichen des Monitors.
      </p>
      <p>
        Wie der Monitor mit Namen aus diesen Quellen umgeht, steht in der
        <NuxtLink to="/datenschutz#dse-names" class="link-inline">Datenschutzerklärung</NuxtLink>.
      </p>
    </ProseSection>
  </div>
</template>

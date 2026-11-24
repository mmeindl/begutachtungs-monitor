<!--
  How the comparison after the Begutachtung works — the „Methode" of
  `LawDiffSection`, opened under its credit line (14.11.2026; until then
  /so-funktionierts#vergleich).

  A `<dl>` in the caller's `prose-flow`, each term the answer itself
  (docs/decisions.md, „A method text is the credit line in full sentences").
  „redaktionell" is not defined here; its pill opens the definition at the
  row (`TermNote`, `app/utils/terms.ts`).
-->
<template>
  <dl>
    <div>
      <dt>Den Vergleich machen wir selbst</dt>
      <dd>
        Nach der Begutachtung halten wir die veröffentlichten Texte
        gegeneinander und markieren, was sich geändert hat.
      </dd>
    </div>
    <div>
      <dt>Verglichen wird Schritt für Schritt</dt>
      <dd>
        Der Entwurf mit der Regierungsvorlage, im Parlament die
        Regierungsvorlage mit der Fassung des Ausschusses und diese mit der
        des Plenums. So steht bei jedem Vergleich fest, wer geändert hat. Beim
        Bundesgesetzblatt halten wir den ganzen Weg gegeneinander, vom Entwurf
        bis zum kundgemachten Gesetz.
      </dd>
    </div>
    <div>
      <dt>Anweisung für Anweisung oder Paragraph für Paragraph</dt>
      <dd>
        Ein Gesetz, das ein bestehendes ändert, besteht aus nummerierten
        Änderungsanweisungen (Z&nbsp;1, Z&nbsp;2&nbsp;…); verglichen wird dann
        Anweisung für Anweisung. Ein neues Gesetz vergleichen wir Paragraph
        für Paragraph.
      </dd>
    </div>
    <div>
      <dt>Auch die Begründungen vergleichen wir</dt>
      <dd>
        Verglichen werden nur Begründungen, die in beiden Fassungen zur selben
        Änderung stehen. Gezeigt wird eine Begründung an dieser Änderung, wenn
        das Ministerium sie geändert hat; Unterschiede nur in Satzzeichen,
        Leerzeichen oder Bindestrichen gelten nicht als Änderung. Steht eine
        Änderung in beiden Fassungen und können wir ihr keine Begründung
        sicher zuordnen, sagt das eine Zeile an der Änderung.
      </dd>
    </div>
    <div>
      <dt>Warum sich etwas geändert hat, sagt kein Vergleich</dt>
      <dd>
        Ob eine Änderung auf eine Stellungnahme zurückgeht, sagt keiner der
        beiden Vergleiche.
      </dd>
    </div>
    <!-- How often it holds, and what its check does not catch: measured,
         on /genauigkeit (19.11.2026); the method stays here, the figures
         stand there once. -->
    <div>
      <dt>Wie oft das stimmt, ist gemessen</dt>
      <dd>
        Auf der Seite
        <NuxtLink to="/genauigkeit#stationen" class="link-inline">Genauigkeit</NuxtLink>,
        samt den Fehlern, die die Prüfung nicht fängt.
      </dd>
    </div>
  </dl>
</template>

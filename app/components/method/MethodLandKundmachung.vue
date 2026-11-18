<!--
  How a Land's draft is matched to its Kundmachung — the „Methode" of
  `LandLawDiffSection` where it compares against the Landesgesetzblatt
  (14.11.2026; until then a paragraph of /so-funktionierts#laender).

  A `<dl>` in the caller's `prose-flow`, each term the answer itself
  (docs/decisions.md, „A method text is the credit line in full sentences").
-->
<template>
  <dl>
    <div>
      <dt>Nennt das Land die Kundmachung nicht, suchen wir sie</dt>
      <dd>
        Der Monitor sucht sie im Landesgesetzblatt des
        Rechtsinformationssystems: über den Titel, in Salzburg entschieden
        über den Text der Regierungsvorlage, in Kärnten über das Datum des
        Landtagsbeschlusses. Ist die Zuordnung unsere, sagt die Seite das.
      </dd>
    </div>
    <div>
      <dt>Nichts gefunden heißt nicht: nicht kundgemacht</dt>
      <dd>
        Findet die Suche nichts, heißt das nur, dass wir die Kundmachung nicht
        gefunden haben.
      </dd>
    </div>
    <div>
      <dt>Verglichen wird nur eine gesicherte Kundmachung</dt>
      <dd>
        Eine, die das Land nennt oder deren Zuordnung die Texte bestätigen.
      </dd>
    </div>
  </dl>
</template>

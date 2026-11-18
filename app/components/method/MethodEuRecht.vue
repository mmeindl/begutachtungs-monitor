<!--
  How the monitor reads whether a draft carries out EU law, which act and by
  when — the „Methode" under the EU fact of a draft (`EntwurfFrame`), the
  map /eu-recht and an act's page (14.11.2026; until then
  /so-funktionierts#eu-recht).

  A `<dl>` in the caller's `prose-flow`, each term the answer itself
  (docs/decisions.md, „A method text is the credit line in full sentences").
  The measured shares (04.11.2026) and what each Land's documents allow are
  coverage facts, not method: they stand on /datenlage.
-->
<template>
  <dl>
    <div>
      <dt>Ob ein Entwurf EU-Recht umsetzt, sagt sein Vorblatt</dt>
      <dd>
        Fast jedem Entwurf liegt ein Vorblatt mit der wirkungsorientierten
        Folgenabschätzung bei. Unter „Verhältnis zu den Rechtsvorschriften der
        Europäischen Union“ steht dort einer von wenigen festen Sätzen, die
        das Werkzeug der Ministerien vorgibt, etwa „Das Vorhaben dient der Umsetzung einer EU-Richtlinie“ oder „Das
        Vorhaben enthält die erforderlichen flankierenden Regelungen zu
        Verordnungen der Europäischen Union“. Diesen Satz lesen wir aus dem
        PDF des Vorblatts. Er entscheidet, ob bei einem Entwurf „Setzt EU-Recht
        um“ oder „Begleitet EU-Verordnungen“ steht.
      </dd>
    </div>
    <div>
      <dt>Wo das Vorblatt mehr oder Widersprüchliches sagt</dt>
      <dd>
        Sagt das Vorblatt, der Entwurf gehe über eine verpflichtende Umsetzung
        hinaus, zitieren wir den Satz wörtlich. Widersprechen sich zwei
        Vorblätter eines Entwurfs, zeigen wir nichts, solange der Gesetzestext
        keinen Rechtsakt nennt.
      </dd>
    </div>
    <div>
      <dt>Welcher Rechtsakt gemeint ist, sagt der Gesetzestext</dt>
      <dd>
        Das Vorblatt nennt ihn fast nie. Den Namen lesen wir aus dem
        Umsetzungshinweis im Gesetzestext des Entwurfs, etwa „Mit diesem
        Bundesgesetz wird die Richtlinie (EU) 2024/1069 … umgesetzt“, sonst
        aus seinem Titel. Kurznamen wie „IE-Richtlinie“ lösen wir nicht auf;
        dann bleibt der Akt ungenannt.
      </dd>
    </div>
    <div>
      <dt>Die Umsetzungsfrist kommt aus EUR-Lex</dt>
      <dd>
        EUR-Lex ist die Rechtsdatenbank der Europäischen Union. Für manche
        Richtlinien nennt es mehrere Daten, ohne zu sagen, welches die
        allgemeine Frist ist; wir nennen das späteste als Umsetzungsfrist und
        die übrigen in einer Fußnote als Fristen für einzelne Bestimmungen.
        Setzt ein Entwurf mehrere Richtlinien um, trägt jedes Datum auf dem
        Zeitstrahl eine Hochzahl, und dieselbe Hochzahl steht im Satz bei
        seiner Richtlinie. Verordnungen gelten unmittelbar und haben keine
        Umsetzungsfrist. Woher die Daten stammen und unter welchen
        Bedingungen, steht
        <NuxtLink to="/quellen#eurlex" class="link-inline">unter Quellen &amp; Lizenzen</NuxtLink>.
      </dd>
    </div>
    <div>
      <dt>Eine Frist steht nur bei einem Akt, der noch nirgends umgesetzt ist</dt>
      <dd>
        Eine Novelle wiederholt oft den ganzen Umsetzungshinweis samt
        Richtlinien, die vor Jahren umgesetzt wurden. Solche Akte nennen wir,
        aber ohne Frist: Eine Frist steht nur bei einem Akt, den das geltende
        Bundesrecht (beim Land: das Landesrecht) am ersten Tag der
        Begutachtung noch nirgends umsetzt.
      </dd>
    </div>
    <div>
      <dt>Ob ein Ministerium zu spät dran war, sagt die Seite nicht</dt>
      <dd>
        Sie stellt zwei Daten nebeneinander, die Umsetzungsfrist und den
        Beginn der Begutachtung laut RIS, und überlässt die Rechnung den
        Lesenden – ein Entwurf kann der zweite Schritt einer Umsetzung sein,
        und welches Datum die eigentliche Frist ist, sagt EUR-Lex nicht immer.
        Der Zeitstrahl zeigt die Umsetzungsfrist als Strich, die Begutachtung
        als Band und einen Punkt dort, wo das Verfahren heute steht.
      </dd>
    </div>
    <div>
      <dt>Bei einem Landesentwurf lesen wir die Dokumente des Landes</dt>
      <dd>
        Ein Werkzeug mit festen Sätzen haben die Länder nicht, aber die
        meisten sagen es an eigener Stelle, und die Akte lesen wir sonst aus
        dem Gesetzestext. Wo welches Land es sagt und was der Monitor davon
        lesen kann, steht unter
        <NuxtLink to="/datenlage" class="link-inline">Datenlage</NuxtLink>.
      </dd>
    </div>
    <div>
      <dt>Die Seite EU-Recht kennt nur die laufende Gesetzgebungsperiode</dt>
      <dd>
        Die Seite
        <NuxtLink to="/eu-recht" class="link-inline">EU-Recht</NuxtLink>
        liest nur die Begutachtungen, die in der laufenden
        Gesetzgebungsperiode begonnen haben, und nur die, die der Monitor
        kennt. Dass ein Land dort keinen Entwurf zu einem Rechtsakt hat, heißt
        nicht, dass es ihn nicht umsetzt.
      </dd>
    </div>
  </dl>
</template>

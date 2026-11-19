<!--
  How the Lesefassung („Ganzer Paragraph in der vorgeschlagenen Fassung
  (nicht amtlich)") is made —
  opened in place under the line „Wie dieser Text entsteht" in
  `LesefassungDisclosure` (14.11.2026; until then
  /so-funktionierts#lesefassung).

  A `<dl>` in the caller's `prose-flow`, each term the answer itself
  (docs/decisions.md, „A method text is the credit line in full sentences").
-->
<template>
  <dl>
    <div>
      <dt>Keine amtliche Fassung</dt>
      <dd>
        Wir nehmen den geltenden Text aus dem RIS und wenden die Anweisungen
        des Entwurfs darauf an.
      </dd>
    </div>
    <div>
      <dt>Gezeigt nur, wo die Gegenüberstellung des Ministeriums sie stützt</dt>
      <dd>
        <ul>
          <li>Was sie als geltend abdruckt, steht so im RIS.</li>
          <li>Was sie als neu abdruckt, steht in unserem Ergebnis.</li>
          <li>Die Absätze, die sie nennt, stehen in derselben Reihenfolge.</li>
          <li>Unser Ergebnis ändert nichts, was sie nicht zeigt.</li>
        </ul>
        Weil die Gegenüberstellung oft nur Auszüge druckt, kann sie nur
        bestätigen, was sie abdruckt.
      </dd>
    </div>
    <div>
      <dt>Fehlt dieser Text, steht am Paragraphen, warum</dt>
      <dd>
        Etwa weil sich eine Anweisung des Entwurfs nicht sicher anwenden ließ,
        weil unser Ergebnis von der Beilage abweicht, weil wir das Gesetz oder
        den Paragraphen im RIS nicht fanden oder weil die Beilage an dieser
        Stelle nichts zeigt, woran sich unser Ergebnis prüfen ließe. Fehlt dieser
        Text, heißt das nie, dass der Paragraph gleich bleibt.
      </dd>
    </div>
    <div>
      <dt>Paragraphen ohne Gegenüberstellung stehen am Ende ihres Gesetzes</dt>
      <dd>
        Das sind Paragraphen, die der Entwurf ändert, zu denen wir in der
        Beilage aber keine Gegenüberstellung fanden.
      </dd>
    </div>
    <!-- How often it holds, and what its check does not catch: measured,
         on /genauigkeit (19.11.2026); the method stays here, the figures
         stand there once. -->
    <div>
      <dt>Wie oft das stimmt, ist gemessen</dt>
      <dd>
        Auf der Seite
        <NuxtLink to="/genauigkeit#lesefassung" class="link-inline">Genauigkeit</NuxtLink>,
        samt den Fehlern, die die Prüfung nicht fängt.
      </dd>
    </div>
  </dl>
</template>

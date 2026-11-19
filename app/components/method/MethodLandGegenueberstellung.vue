<!--
  How „Was ändert der Entwurf?" reads a Land's Textgegenüberstellung — the
  „Methode" of `LandLawDiffSection` for the law in force against the draft
  (14.11.2026; until then a paragraph of /so-funktionierts#laender).

  A `<dl>` in the caller's `prose-flow`, each term the answer itself
  (docs/decisions.md, „A method text is the credit line in full sentences").
  Which Länder print a form the monitor reads is a coverage fact, not
  method: it stands on /datenlage.
-->
<template>
  <dl>
    <div>
      <dt>Der Text ist vom Land</dt>
      <dd>„Was ändert der Entwurf?“ liest die Textgegenüberstellung des Landes.</dd>
    </div>
    <div>
      <dt>Geprüft gegen das geltende Recht im Rechtsinformationssystem</dt>
      <dd>
        Einen Paragraphen zeigt der Monitor nur, wenn dessen geltende Fassung
        so, wie er sie gelesen hat, auch im Rechtsinformationssystem steht;
        die übrigen nennt die Seite, und die Textgegenüberstellung selbst
        steht unter den Dokumenten.
      </dd>
    </div>
    <!-- 19.11.2026: the rule had shipped since 12.11.2026
         (`landTguGuard.ts`, withheld as `notInDraft`) and this text did not
         say so; /genauigkeit measures it. -->
    <div>
      <dt>Und gegen den Entwurf</dt>
      <dd>
        Was die rechte Spalte als neu zeigt, muss im Entwurf des Landes
        stehen; sonst zeigt der Monitor den Paragraphen nicht.
      </dd>
    </div>
    <div>
      <dt>Jedes Land setzt sie anders</dt>
      <dd>
        Welche Form der Monitor bei welchem Land lesen kann, steht unter
        <NuxtLink to="/datenlage" class="link-inline">Datenlage</NuxtLink>.
      </dd>
    </div>
    <!-- How often it holds, and what its check does not catch: measured,
         on /genauigkeit (19.11.2026); the method stays here, the figures
         stand there once. -->
    <div>
      <dt>Wie oft das stimmt, ist gemessen</dt>
      <dd>
        Auf der Seite
        <NuxtLink to="/genauigkeit#land-gegenueberstellung" class="link-inline">Genauigkeit</NuxtLink>,
        samt den Fehlern, die die Prüfung nicht fängt.
      </dd>
    </div>
  </dl>
</template>

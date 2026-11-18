<!--
  What the list of drafts leaves out by design and how a row gets its span —
  the „Methode" at the foot of /entwuerfe (14.11.2026). The list's notes say
  only what is true of the list now (docs/decisions.md, „The list's notes");
  what holds always is here.

  A `<dl>` in the caller's `prose-flow`, each term the answer itself
  (docs/decisions.md, „A method text is the credit line in full sentences").
-->
<template>
  <dl>
    <div>
      <dt>Budgetgesetze stehen nicht unter den Gesetzen ohne Entwurf</dt>
      <dd>Beim Bund wie in Salzburg: Sie entstehen im Budgetverfahren.</dd>
    </div>
    <!-- What the one-line note above the rows names (`withoutDraftGapDe`,
         16.11.2026): the states it means, and where the Anträge stand. -->
    <div>
      <dt>Vorlagen und Anträge ohne Entwurf stehen nicht in jedem Stand in der Liste</dt>
      <dd>
        Regierungsvorlagen des Bundes ohne Entwurf, Ausschussanträge und
        Gesetzesanträge aus dem Bundesrat stehen in der Liste, solange eine
        Stellungnahme zu ihnen möglich ist, und wieder, sobald ihr Gesetz
        kundgemacht ist. Dazwischen fehlen sie: beschlossen und noch nicht
        kundgemacht, abgelehnt, zurückgezogen, miterledigt oder mit der
        Gesetzgebungsperiode verfallen. Initiativanträge stehen in jedem Stand
        unter „Alle Initiativanträge“, die offenen auch unter „Stellungnahme
        möglich“.
      </dd>
    </div>
    <div>
      <dt>In welchem Zeitraum eine Zeile steht</dt>
      <dd>
        Ein Entwurf eines Landes steht in dem Zeitraum, in dem seine
        Begutachtung begann, ein Landesgesetz in dem seiner Kundmachung; beim
        Bund zählt die Gesetzgebungsperiode, der das Parlament oder das RIS
        einen Entwurf oder ein Gesetz zuordnet.
      </dd>
    </div>
    <!-- „Eigener Zeitraum" (18.11.2026, `rowDay`): the day each row is cut by,
         and the one limit a team splitting its review by weeks needs to know. -->
    <div>
      <dt>„Eigener Zeitraum“ zählt ab dem Beginn der Begutachtung</dt>
      <dd>
        Für jeden Entwurf zählt der Tag, an dem seine Begutachtung begann, für
        ein Gesetz ohne Entwurf der Tag seiner Kundmachung. Wann ein Entwurf
        online ging, kennt der Monitor nicht: Meist ist es derselbe Tag, ein
        Land kann einen Entwurf aber auch später einstellen.
      </dd>
    </div>
    <div>
      <dt>Was jede Quelle veröffentlicht</dt>
      <dd>
        Das und wie weit der Monitor ihr folgt, steht in der
        <NuxtLink to="/datenlage" class="link-inline">Datenlage</NuxtLink>.
      </dd>
    </div>
  </dl>
</template>

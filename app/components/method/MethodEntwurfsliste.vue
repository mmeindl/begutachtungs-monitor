<!--
  What the list of drafts leaves out by design and how a row gets its span —
  the „Methode" at the foot of /entwuerfe (14.11.2026). The list's notes say
  only what is true of the list now (docs/decisions.md, „The list's notes");
  what holds always is here.

  Paragraphs only, without a wrapper: the caller's `prose-flow` styles its
  direct children.
-->
<template>
  <p>
    Budgetgesetze führt die Liste nicht unter den Gesetzen ohne Entwurf,
    beim Bund wie in Salzburg: Sie entstehen im Budgetverfahren.
  </p>
  <!-- What the one-line note above the rows names (`withoutDraftGapDe`,
       16.11.2026): the states it means, and where the Anträge stand. -->
  <p>
    Regierungsvorlagen des Bundes ohne Entwurf, Ausschussanträge und
    Gesetzesanträge aus dem Bundesrat stehen in der Liste, solange eine
    Stellungnahme zu ihnen möglich ist, und wieder, sobald ihr Gesetz
    kundgemacht ist. Dazwischen fehlen sie: beschlossen und noch nicht
    kundgemacht, abgelehnt, zurückgezogen, miterledigt oder mit der
    Gesetzgebungsperiode verfallen. Initiativanträge stehen in jedem Stand
    unter „Alle Initiativanträge“, die offenen auch unter „Stellungnahme
    möglich“.
  </p>
  <p>
    Ein Entwurf eines Landes steht in dem Zeitraum, in dem seine
    Begutachtung begann, ein Landesgesetz in dem seiner Kundmachung; beim
    Bund zählt die Gesetzgebungsperiode, der das Parlament oder das RIS
    einen Entwurf oder ein Gesetz zuordnet.
  </p>
  <p>
    Was jede Quelle veröffentlicht und wie weit der Monitor ihr folgt, steht
    in der <NuxtLink to="/datenlage" class="link-inline">Datenlage</NuxtLink>.
  </p>
</template>

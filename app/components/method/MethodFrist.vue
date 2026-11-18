<!--
  What a draft's Frist is held against — the „Methode" under the Frist and
  its bar (`FristBar`) in „Die Begutachtung" (14.11.2026; until then the
  Begutachtung station of /so-funktionierts#stationen).

  A `<dl>` in the caller's `prose-flow`, each term the answer itself
  (docs/decisions.md, „A method text is the credit line in full sentences").
  „voll" and „kurz" are said here because the bar prints neither word; where
  a tag does (`frist-voll`, `frist-kurz` in `app/utils/terms.ts`), it opens
  its own definition.
-->
<template>
  <dl>
    <div>
      <dt>Die Frist setzt das Ministerium</dt>
      <dd>
        Im Regelfall vorgesehen sind sechs Wochen (§&nbsp;9 Abs.&nbsp;3
        WFA-Grundsatz-Verordnung).
      </dd>
    </div>
    <div>
      <dt>„Voll“ und „kurz“ sind unsere Wörter</dt>
      <dd>
        Der Monitor nennt eine Frist ab sechs Wochen „voll“ und unter drei
        Wochen „kurz“.
      </dd>
    </div>
    <div>
      <dt>Der Vergleichswert ist der Median der Periode</dt>
      <dd>
        Der Balken zeigt den Median der Gesetzgebungsperiode, in der die Frist
        begann – seit 2013 in jeder Periode rund vier Wochen. Gemessen wird
        ein Entwurf so an der Praxis seiner eigenen Periode.
      </dd>
    </div>
  </dl>
</template>

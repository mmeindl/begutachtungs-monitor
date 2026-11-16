<!--
  How the list „Wer Rückmeldung gegeben hat" on an EU page is read, and who
  in it is counted without a name (step 4 of the EU cycle; under the list
  since 16.11.2026, when the paragraph left the list's foot) — the
  „Methode" under it, in the style of `MethodEuFenster`. The rule itself is
  the server's (`namedOrganisationOf`, `server/utils/eu/portalFeedback.ts`;
  docs/decisions.md, „Who gave feedback on the Commission's portal"); this
  text describes it and changes with it. Paragraphs only, without a
  wrapper: the caller's `prose-flow` styles its direct children.
-->
<template>
  <p>
    Die Liste kommt aus dem Portal „Ihre Meinung zählt“ der Europäischen
    Kommission. Der Monitor liest sie, sobald sie auf der Seite erscheint,
    eine Seite des Portals nach der anderen: zunächst die neuesten 1.000
    Rückmeldungen, mit „Weitere … lesen“ jeweils bis zu 500 mehr, höchstens
    5.000 je Frist. Organisationen nennt er mit dem Namen, den das Portal
    veröffentlicht, und verlinkt ihre Rückmeldung dort; Texte liest er keine.
  </p>
  <p>
    Privatpersonen werden gezählt, nie genannt: Bürgerinnen und Bürger je
    Land, ohne Namen. Ohne Namen zählt der Monitor auch Organisationen,
    hinter deren Namen eine einzelne Person stehen kann:
    Kleinstunternehmen und -organisationen ohne Nummer im
    Transparenzregister und Organisationen, deren Name den Namen der
    meldenden Person enthält. Ebenso gezählt wird, wo statt eines Namens
    eine Nummer, eine Adresse oder eine längere Beschreibung steht.
    Rückmeldungen ohne Angabe einer Organisationsart („Sonstige“) und
    solche, die das Portal nicht als veröffentlicht führt, stehen ebenfalls
    nur als Zahl.
  </p>
</template>

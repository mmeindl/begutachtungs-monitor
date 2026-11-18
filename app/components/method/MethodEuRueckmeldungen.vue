<!--
  How the list „Wer Rückmeldung gegeben hat" on an EU page is read, and who
  in it is counted without a name (step 4 of the EU cycle; under the list
  since 16.11.2026, when the paragraph left the list's foot) — the
  „Methode" under it, in the style of `MethodEuFenster`. The rule itself is
  the server's (`namedOrganisationOf`, `server/utils/eu/portalFeedback.ts`;
  docs/decisions.md, „Who gave feedback on the Commission's portal"); this
  text describes it and changes with it. A `<dl>` in the caller's
  `prose-flow`, each term the answer itself (docs/decisions.md, „A method
  text is the credit line in full sentences"). The sentence with the
  figures is pinned to the constants (`tests/euFeedback.test.ts`).
-->
<template>
  <dl>
    <div>
      <dt>Die Liste kommt aus dem Portal „Ihre Meinung zählt“</dt>
      <dd>
        Die Europäische Kommission betreibt das Portal. Der Monitor liest die
        Liste, sobald sie auf der Seite erscheint, eine Seite des Portals nach
        der anderen: zunächst die neuesten 1.000 Rückmeldungen, mit „Weitere …
        lesen“ jeweils bis zu 500 mehr, höchstens 5.000 je Frist.
      </dd>
    </div>
    <div>
      <dt>Organisationen werden genannt</dt>
      <dd>
        Mit dem Namen, den das Portal veröffentlicht, und mit einem Link zu
        ihrer Rückmeldung dort. Texte liest der Monitor keine.
      </dd>
    </div>
    <div>
      <dt>Privatpersonen werden gezählt, nie genannt</dt>
      <dd>Bürgerinnen und Bürger je Land, ohne Namen.</dd>
    </div>
    <div>
      <dt>Auch manche Organisationen werden nur gezählt</dt>
      <dd>
        Nur als Zahl stehen Organisationen, hinter deren Namen eine einzelne
        Person stehen kann, und einige weitere Einträge:
        <ul>
          <li>
            Kleinstunternehmen und -organisationen ohne Nummer im
            Transparenzregister,
          </li>
          <li>
            Organisationen, deren Name den Namen der meldenden Person enthält,
          </li>
          <li>
            Einträge, bei denen statt eines Namens eine Nummer, eine Adresse
            oder eine längere Beschreibung steht,
          </li>
          <li>
            Rückmeldungen ohne Angabe einer Organisationsart („Sonstige“),
          </li>
          <li>
            Rückmeldungen, die das Portal nicht als veröffentlicht führt.
          </li>
        </ul>
      </dd>
    </div>
  </dl>
</template>

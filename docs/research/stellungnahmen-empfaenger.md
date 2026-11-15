# Who receives a Stellungnahme filed at Parliament

Question (15.11.2026): the Regierungsvorlage's Stellungnahmen panel says, behind
„Was mit ihnen geschieht" (`RvStatements.vue`, `routeNote`), that released
Stellungnahmen go „an die parlamentarischen Klubs und an das zuständige
Ministerium". Parliament's form on a Regierungsvorlage names only the Klubs.
Which is right?

## What Parliament says, by source

Read on 15.11.2026 from the rendered pages (headless Chrome, DOM text).

| Source | Scope | Recipients named |
|---|---|---|
| Form on 162/ME XXVIII (both forms) | the item | Klubs **and „dem zuständigen Ressort"** |
| Form on 688 d.B. (Regierungsvorlage) | the item | Klubs only |
| Form on 684 d.B. (Ausschussantrag) | the item | Klubs only |
| Form on 21/PET, 7/BI | the item | Klubs only |
| FAQ, „Was passiert mit meiner Stellungnahme?" (`/beteiligen/hilfe/haeufige-fragen#stellungnahmen`) | every item kind, listed above it: Vorlagen, Anträge, Gesetzesanträge des Bundesrates, Volksbegehren, BI, Petitionen, Ministerialentwürfe | Klubs **and „dem zuständigen Bundesministerium"** |
| „Stellung nehmen" pages (`/beteiligen/stellung-nehmen/`, `…/ministerialentwuerfe/`) | as the FAQ, the same paragraph | Klubs and the ministry |

The forms' wording, verbatim: „Ihre Stellungnahme wird den parlamentarischen
Klubs [und dem zuständigen Ressort] für ihre Arbeit zur Verfügung gestellt.
Mit Ihrem Einverständnis wird sie auch auf der Parlamentswebsite
veröffentlicht." (The organisation's variant: „… wird auf der
Parlamentswebsite veröffentlicht und dadurch den parlamentarischen Klubs
[und dem zuständigen Ressort] für ihre Arbeit zur Verfügung gestellt.")

§ 23b GOG-NR rules the publication and nothing about forwarding
(`begutachtung-uebersprungen.md` §4c; commit 98b88da).

## Reading

- **Agreed by every source:** the Klubs receive it, and it is published at
  the item (a private person's only with consent).
- **Disputed:** the ministry, for everything after the Begutachtung. The
  general pages name it for all kinds in one sentence; the item's own form,
  which differs by kind and so was written per kind, names it only for a
  Ministerialentwurf. For a Petition or a Bürgerinitiative there is often no
  „zuständiges Bundesministerium" at all, which suggests the general sentence
  was written with the Begutachtung in mind and stretched over the list.
- Neither source is a measurement. Which one describes the practice only the
  Parlamentsdirektion can say (Infoteam, named on the FAQ page).

## Consequence for the monitor

- The door cards quote the form of the item (`app/utils/statementQuote.ts`):
  what the reader is told at the moment of filing, by the page they file on.
- The panel's `routeNote` and the homepage's „Jetzt im Parlament" named the
  ministry as fact. Since 15.11.2026 both say only what every source
  supports: the Klubs, and the publication at the item (the panel).
- Open: ask the Parlamentsdirektion whether Stellungnahmen on a
  Regierungsvorlage (and on Anträge, Petitionen, Bürgerinitiativen) are
  forwarded to the responsible ministry.

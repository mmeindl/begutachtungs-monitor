# Germany: where the drafts are published

**As of 2026-11-03.** Research memo answering one question: where would a
monitor for Germany read Referentenentwürfe and the statements on them, and
how hard is each source? Germany is the next country after Austria
(`CLAUDE.md`, "What this is"). This is a first pass, not a survey: eleven of
sixteen federal ministries were read, each from page 1 of its list and one
example. Nothing here is built.

## Findings in four sentences

1. **There is no central source.** Each ministry publishes its own drafts on
   its own website, and no overview of Referentenentwürfe exists on
   bundesregierung.de.
2. **The deadline is not a field anywhere.** It appears twice in running text
   and otherwise not at all. In Austria, Parliament's list 81 carries it as a
   column, and the deadline is the core of a consultation monitor.
3. **For the monitor, Germany is like the Austrian Länder, not like the Bund:**
   one reader per publisher, each with its own page structure.
4. **Statements name organisations, not persons:** they are published only
   with the association's consent (§ 47 Abs. 3 GGO), so the privacy position
   differs from Parliament's list 142.

## Background (web search of 2026-10-23, not exhaustive)

- A cabinet decision of 2018 has each ministry publish its
  Referentenentwürfe and the associations' statements on its own website. The
  central platform promised with it had not been delivered by 2022.
- The Lobbyregister requires since its amendment of March 2024 that
  fundamental statements be uploaded, but expressly not statements from the
  federal government's formal participation procedures. It is therefore
  incomplete exactly here.
- No civil-society tracker across all ministries was found. Not finding one
  is not proof that none exists.
- Switzerland, for comparison: Demokratis (an association, open platform)
  lists Vernehmlassungen of the Bund and the cantons and lets organisations
  submit statements. It has no public accountability layer; Art. 8 VlG
  already obliges the authorities to publish a report on the results.

## The ministries read

Read automatically on 2026-11-03: page 1 of the list and one example each;
feeds were not opened.

| Ministry | Drafts / statements | List | Deadline | Verdict |
| --- | --- | --- | --- | --- |
| BMV | yes / according to the text | one page per legislative period, 42 in the 21st, "RefE:" / "Kabinett:" / "Bundesrat:" with date | no | easy |
| BMWSB | yes / yes (17 in the example) | 2 pages, teasers dated, detail page with stages and dates | no | easy |
| BMUKN | yes / according to the text | 630 entries, 32 pages, stable IDs `/GE<n>`, category "Entwürfe laufende Vorhaben" | running text | easy to medium |
| BMVg | yes / yes, paired per procedure | one page, years 2014–2026, no dates | no | easy to find, dates only on detail pages |
| BMG | yes / yes (~100 PDFs in the example) | 221 entries, type filter "Laufendes Verfahren", detail page with stage dates | no | medium |
| BMJV | status "Entwurf" / "Gesetz" / "Eckpunkte"; statements not in the list | 82 entries, date = last update | no | medium |
| BMFTR | yes / yes (detail page) | 12 entries, no dates, stages as text | no | medium |
| BMDS | yes / yes (17 in the example) | 2 pages, dated, stages numbered on the detail page | running text | medium |
| BMBFSFJ | not in the list / yes (1,321 PDFs) | list without dates, only a date filter | no | medium to hard |
| BMLEH | according to the text / not visible | 235 entries, no stages | no | hard |
| BMAS | no (only laws and Verordnungen) | ~400 entries | no | hard for this purpose |

## What could not be shown

- **Three ministries could not be fetched:** BMI (HTTP 400), BMF (HTTP 503)
  and BMWE (bot block). The blocks were not worked around; these pages need a
  read in a browser.
- **Two ministries had no legislation page that was found:** AA and BMZ.
- **The DIP API of the Bundestag** (the parliamentary end of the chain): its
  documentation renders only in a browser. Key, entities and licence are
  unchecked.
- **The linked RSS feeds** (BMG, BMUKN, BMVg): whether they carry legislation
  was not checked.
- **Licences were not checked for any source.** A source ships only with its
  licence checked and stated (`CLAUDE.md`, "Legal").

## What is cheaper than expected

Many sites run on two CMS families: Government Site Builder (`/SharedDocs/`,
`/SiteGlobals/`: BMJV, BMLEH, BMV, BMWSB, BMFTR, BMAS) and TYPO3 (`tx_…`
parameters: BMG, BMUKN, BMDS). That lowers the technique, not the number of
readers: every list has its own structure.

## Consequence

The cheapest entry is an overview of drafts and deadlines from the four easy
ministries plus the DIP chain behind them, stated as partial coverage with
the table of gaps public — the same rule as for the Länder
(`docs/research/laender-luecken.md`). Open before any of it: the five gaps
above, the DIP API, the feeds and the licences.

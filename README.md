# Begutachtungs-Monitor

An open-source tool that follows a law through its making in Austria and shows where people can take part. *View your state – state your view.*

Before a draft law reaches Parliament, the ministry publishes it for consultation (the *Begutachtung*), and anyone may send a statement (a *Stellungnahme*). Whoever writes one today cannot see whether it changed anything. Ministries often change their drafts after the consultation, but nowhere is that visible. The monitor makes it visible.

**Live since August 2026:** <https://begutachtungs-monitor.at> (the site is in German; English follows)

## What the monitor does today

- **[Drafts and laws](https://begutachtungs-monitor.at/entwuerfe)**: every draft of a legislative period, in consultation and closed, laws and regulations, for the federal level and all nine states (Länder), with its deadline and the number of statements. Also the laws for which no consulted draft is known.
- **What happened afterwards**: for each draft, the way through the government bill (Regierungsvorlage) and Parliament's decision to the Federal Law Gazette, and section by section what changed between the draft and the government bill.
- **How the law would read**: the consolidated text of the changed sections, shown only where the ministry's own comparison document (Textgegenüberstellung) confirms it.
- **[EU law](https://begutachtungs-monitor.at/eu-recht)**: what the European Commission is taking feedback on now, which directives Austria has to transpose, and which draft carries out which act.
- **[Requests to Parliament](https://begutachtungs-monitor.at/anliegen)**: petitions, citizens' initiatives and popular initiatives (Volksbegehren), and where one can support them or send a statement now.
- **Subscribe to deadlines**: as an [RSS feed](https://begutachtungs-monitor.at/feed.xml) and a [calendar](https://begutachtungs-monitor.at/kalender.ics), without an account.

On the site: [the routes a law can take](https://begutachtungs-monitor.at/wege) · [what each source publishes](https://begutachtungs-monitor.at/datenlage) · [sources and licences](https://begutachtungs-monitor.at/quellen) · [about the project](https://begutachtungs-monitor.at/ueber)

## What it does not do

It does not judge drafts, recommend positions or rank ministries. It shows what can be checked: deadlines, counts, documents and the differences between them, each linked to the official source. Changes made after a consultation are shown as clearly as standstill. Private persons who send a statement are counted, never named.

## Documentation

- [Why this tool?](docs/why-this-tool.md): what the monitor adds over the official sites, why it should work, what it does not do
- [Decisions](docs/decisions.md): standing rules, the measurements behind the product's claims, rejected alternatives
- [Upstream APIs](docs/api-exploration.md): how the interfaces of Parliament, RIS and the EU's Cellar behave, with endpoints, field maps and the traps that return a wrong answer without an error

## Development

Nuxt 4 (Vue 3, TypeScript), Tailwind, pnpm. No database and no accounts: the site reads the official sources (Parliament, RIS, the nine Länder, the EU) and caches what it derives.

```sh
pnpm install
pnpm dev      # http://localhost:3000
pnpm test
```

Deployment on a single small server is described in [deploy/](deploy/). Anyone should be able to run a copy for under €100 a year.

## Licence and sources

The code is licensed under [AGPL-3.0-or-later](LICENSE). The monitor's own texts on the site are licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/); credit "Begutachtungs-Monitor" with a link. Neither covers the material of the official sources, nor the name and the § mark.

The data comes from official sources: the Austrian Parliament ([parlament.gv.at](https://www.parlament.gv.at)), the Federal Legal Information System ([ris.bka.gv.at](https://www.ris.bka.gv.at)), the nine Länder and their parliaments, the Publications Office of the EU (EUR-Lex, Cellar) and the European Commission. The terms differ per source; which licence applies to which dataset is stated at [begutachtungs-monitor.at/quellen](https://begutachtungs-monitor.at/quellen).

**Contact:** <kontakt@begutachtungs-monitor.at>

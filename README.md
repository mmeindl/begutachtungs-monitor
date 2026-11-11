# Begutachtungs-Monitor

Ein quelloffenes Werkzeug für das österreichische Begutachtungsverfahren: laufende Begutachtungen, Fristen, Stellungnahmen – und die Frage, was aus dem Entwurf danach geworden ist.

Wer heute eine Stellungnahme schreibt, sieht nicht, ob sie etwas bewirkt hat. Ministerien ändern ihre Entwürfe nach der Begutachtung oft – nur sichtbar ist es nirgends. Das soll sich ändern.

**Läuft seit August 2026:** <https://begutachtungs-monitor.at>

## Was der Monitor heute kann

- **[Entwürfe in Begutachtung](https://begutachtungs-monitor.at/entwuerfe)** – Ministerialentwürfe des Bundes und Begutachtungsentwürfe aller neun Länder, mit Frist und Zahl der Stellungnahmen.
- **Was danach geschah** – je Entwurf der Weg über Regierungsvorlage und Beschluss bis zum Bundesgesetzblatt, und Paragraph für Paragraph, was sich zwischen Entwurf und Regierungsvorlage geändert hat.
- **Wie das Gesetz danach lauten würde** – die Lesefassung der geänderten Paragraphen, gezeigt nur dort, wo die Textgegenüberstellung des Ressorts sie bestätigt.
- **EU-Bezug** – ob ein Entwurf EU-Recht umsetzt, und welchen Rechtsakt.
- **Fristen abonnieren** – als [RSS-Feed](https://begutachtungs-monitor.at/feed.xml) und als [Kalender](https://begutachtungs-monitor.at/kalender.ics), ohne Konto.

Wie das Verfahren abläuft und was der Monitor davon zeigt: [So funktioniert's](https://begutachtungs-monitor.at/so-funktionierts) · Worum es geht: [Über](https://begutachtungs-monitor.at/ueber)

---

*An open-source monitor for Austria's pre-parliamentary law consultation stage (Begutachtungsverfahren): running consultations at federal and state level, deadlines, statements — and what became of each draft afterwards, down to the individual section.*

## Documentation (English)

- [Why this tool?](docs/why-this-tool.md) — what the monitor adds over parlament.gv.at, roadmap, non-goals
- [Decisions](docs/decisions.md) — standing rules, the measurements behind the product's claims, rejected alternatives
- [API exploration](docs/api-exploration.md) — verified reference for the Parliament filter API and RIS OGD API
- [RIS-Join and diff layer](docs/ris-join.md) — how Parliament's drafts are matched to their RIS texts, and the section-level comparison built on it

Research memos:

- [How much legislation never sees a Begutachtung?](docs/begutachtung-uebersprungen.md)
- [Has anyone tried to reform the Begutachtungsverfahren?](docs/begutachtung-reformvorschlaege.md)
- [Volksbegehren](docs/volksbegehren.md) — could the monitor track Volksbegehren too? Verdict, data paths, and an outcome table for all 81

## Development

Nuxt 4 (Vue 3, TypeScript), Tailwind, pnpm. No database, no accounts: the site reads the Parliament and RIS APIs and caches what it derives.

```sh
pnpm install
pnpm dev      # http://localhost:3000
pnpm test
```

Deployment (a single small VPS) is described in [deploy/](deploy/).

---

**Lizenz:** [AGPL-3.0-or-later](LICENSE) · Datenquellen: Republik Österreich – Parlamentsdirektion ([parlament.gv.at](https://www.parlament.gv.at)) und Rechtsinformationssystem des Bundes ([ris.bka.gv.at](https://www.ris.bka.gv.at)), die neun Länder und ihre Landtage, das Amt für Veröffentlichungen der EU (EUR-Lex, Cellar); welche Lizenz für welchen Datensatz gilt, steht auf [begutachtungs-monitor.at/impressum](https://begutachtungs-monitor.at/impressum#imp-license) · **Kontakt:** <kontakt@begutachtungs-monitor.at>

# Begutachtungs-Monitor

Ein quelloffenes Werkzeug, das die Gesetzgebung in Österreich nachverfolgbar macht: Entwürfe in Begutachtung, Fristen, Stellungnahmen – die Frage, was aus dem Entwurf danach geworden ist – und die Gesetze, die ohne Begutachtung beschlossen wurden.

Wer heute eine Stellungnahme schreibt, sieht nicht, ob sie etwas bewirkt hat. Ministerien ändern ihre Entwürfe nach der Begutachtung oft – nur sichtbar ist es nirgends. Das soll sich ändern.

**Läuft seit August 2026:** <https://begutachtungs-monitor.at>

## Was der Monitor heute kann

- **[Entwürfe und Gesetze](https://begutachtungs-monitor.at/entwuerfe)** – alle Entwürfe einer Gesetzgebungsperiode, in Begutachtung und abgeschlossen, Gesetzes- wie Verordnungsentwürfe, für den Bund und alle neun Länder, mit Frist und Zahl der Stellungnahmen – und die Gesetze, zu denen kein Entwurf in Begutachtung bekannt ist.
- **Was danach geschah** – je Entwurf der Weg über Regierungsvorlage und Beschluss bis zum Bundesgesetzblatt, und Paragraph für Paragraph, was sich zwischen Entwurf und Regierungsvorlage geändert hat.
- **Wie das Gesetz danach lauten würde** – die Lesefassung der geänderten Paragraphen, gezeigt nur dort, wo die Textgegenüberstellung des Ressorts sie bestätigt.
- **EU-Bezug** – ob ein Entwurf EU-Recht umsetzt, und welchen Rechtsakt.
- **Fristen abonnieren** – als [RSS-Feed](https://begutachtungs-monitor.at/feed.xml) und als [Kalender](https://begutachtungs-monitor.at/kalender.ics), ohne Konto.

Wie das Verfahren abläuft und was der Monitor davon zeigt: [So funktioniert's](https://begutachtungs-monitor.at/so-funktionierts) · Worum es geht: [Über](https://begutachtungs-monitor.at/ueber)

---

*An open-source tool that makes lawmaking in Austria traceable: drafts in consultation (Begutachtung) at federal and state level, deadlines, statements, what became of each draft afterwards, down to the individual section — and the laws that were passed without a consultation.*

## Documentation (English)

- [Why this tool?](docs/why-this-tool.md) — what the monitor adds over the official sites, why it should work, what it does not do
- [Decisions](docs/decisions.md) — standing rules, the measurements behind the product's claims, rejected alternatives
- [Upstream APIs](docs/api-exploration.md) — how the interfaces of Parliament, RIS and the EU's Cellar behave: endpoints, field maps and the traps that return a wrong answer without an error

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

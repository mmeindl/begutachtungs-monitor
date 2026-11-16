<script setup lang="ts">
/**
 * A colophon, not a marketing surface. The subscription box that used to sit
 * here was the fifth copy of one invitation, and it carried `mark-wash` — the
 * tone `main.css` reserves for „what became of the input". The invitation now
 * stands on the list, where the need arises.
 *
 * What remains, one reason per line:
 *   - „Quellen und Lizenzen" (`/quellen`, a page of its own since 16.11.2026; before, „… im Impressum") — the pointer, no longer the
 *     naming (03.10.2026). The two sources stood here by name on every page;
 *     they are named where their material actually shows (the draft page's
 *     credit lines, under each section), and what may be claimed per source
 *     stands once, in the Impressum. The licence was never stated here: it
 *     differs per dataset, and a blanket claim would cover the
 *     Begutachtungsverfahren's data too. This link is still a licence
 *     condition, not a courtesy: on the pages without credit lines — the
 *     lists, which show facts, not documents — it is the CC-BY attribution
 *     for the RIS rows, which CC BY 4.0 § 3 a (2) expressly allows to be a
 *     link to the page carrying it;
 *   - „Datenlage" — what each source publishes, the pages' gaps by source;
 *   - „Kein amtliches Angebot" — the load-bearing line on a .at address about
 *     ministries;
 *   - source code — AGPL § 13 requires offering users the source on network
 *     interaction: this link is the implementation, not an extra;
 *   - contact — the project's addressees should not have to go to the
 *     Impressum first;
 *   - „Projekt unterstützen" — a pointer to /ueber, not a donate button:
 *     the ask, its channels and the no-deductibility caveat stand together
 *     there; the footer carries the pointer, not the pitch;
 *   - Impressum/Datenschutz — § 25 Abs 1 MedienG, „ständig leicht und
 *     unmittelbar auffindbar".
 *
 * No longer here: the word „Prototyp". It devalued the metadata, which are an
 * unaltered mirror of the official interface, while not warning about the
 * text comparison, where an error can actually arise. The caveat now stands
 * concretely in the Impressum, the real limits in the status section on
 * /ueber. Nor „Anliegen an das Parlament" (15. to 16.11.2026): it stood here
 * while the section had no header label; it has one since, and a colophon
 * repeats no navigation.
 */
</script>

<template>
  <footer class="border-t border-hairline">
    <div class="page-frame py-8">
      <div class="flex flex-col gap-2 text-sm leading-relaxed text-ink-muted">
        <p>
          <NuxtLink
            to="/quellen"
            class="link-muted"
          >Quellen und Lizenzen</NuxtLink>
          ·
          <NuxtLink
            to="/datenlage"
            class="link-muted"
          >Datenlage: was die Quellen veröffentlichen</NuxtLink>. Kein amtliches Angebot.
        </p>
        <p>
          <ExternalLink
            href="https://github.com/mmeindl/begutachtungs-monitor"
            class="link-muted"
          >Quellcode auf GitHub</ExternalLink>
          · Kontakt:
          <a
            href="mailto:kontakt@begutachtungs-monitor.at"
            class="link-muted"
          >kontakt@begutachtungs-monitor.at</a>
          ·
          <NuxtLink
            to="/ueber#about-support"
            class="link-muted"
          >Projekt unterstützen</NuxtLink>
        </p>
        <nav aria-label="Rechtliches">
          <ul class="flex flex-wrap items-center gap-x-4">
            <li>
              <NuxtLink
                to="/impressum"
                class="tap-target link-muted"
              >Impressum</NuxtLink>
            </li>
            <li>
              <NuxtLink
                to="/datenschutz"
                class="tap-target link-muted"
              >Datenschutz</NuxtLink>
            </li>
          </ul>
        </nav>
      </div>
    </div>
  </footer>
</template>

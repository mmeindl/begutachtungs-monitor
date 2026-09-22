<script setup lang="ts">
/**
 * A colophon, not a marketing surface. The subscription box that used to sit
 * here was the fifth copy of one invitation, and it carried `mark-wash` — the
 * tone `main.css` reserves for „what became of the input". The invitation now
 * stands on the list, where the need arises.
 *
 * What remains, one reason per line:
 *   - Sources plus a link to the licence statements — a licence condition,
 *     not a courtesy. BOTH sources are named: part of the data comes from the
 *     federal RIS (Bundeskanzleramt), not from the Parlamentsdirektion, and
 *     CC BY requires the licensor to be named. The licence itself is NOT
 *     stated here: it differs per dataset (Impressum, §„Urheberrecht &
 *     Lizenzen"), and a line claiming CC BY for all data would claim it for
 *     the Begutachtungsverfahren's too — which Parliament expressly excludes
 *     from reuse as open data. CC BY 4.0 § 3 a (2) expressly allows the
 *     attribution to be satisfied by a link to a page carrying it, which is
 *     exactly what this reference is;
 *   - „Kein amtliches Angebot" — the load-bearing line on a .at address about
 *     ministries;
 *   - source code — AGPL § 13 requires offering users the source on network
 *     interaction: this link is the implementation, not an extra;
 *   - contact — the project's addressees should not have to go to the
 *     Impressum first;
 *   - Impressum/Datenschutz — § 25 Abs 1 MedienG, „ständig leicht und
 *     unmittelbar auffindbar".
 *
 * No longer here: the word „Prototyp". It devalued the metadata, which are an
 * unaltered mirror of the official interface, while not warning about the
 * text comparison, where an error can actually arise. The caveat now stands
 * concretely in the Impressum, the real limits in the status section on
 * /ueber.
 */
</script>

<template>
  <footer class="border-t border-hairline">
    <div class="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <div class="flex flex-col gap-2 text-sm leading-relaxed text-ink-muted">
        <p>
          Datenquellen: Republik Österreich – Parlamentsdirektion
          (<ExternalLink
            href="https://www.parlament.gv.at"
            class="underline underline-offset-2 hover:no-underline"
          >parlament.gv.at</ExternalLink>) und Rechtsinformationssystem des Bundes
          (<ExternalLink
            href="https://www.ris.bka.gv.at"
            class="underline underline-offset-2 hover:no-underline"
          >ris.bka.gv.at</ExternalLink>).
          <NuxtLink
            to="/impressum#imp-license"
            class="underline underline-offset-2 hover:no-underline"
          >Lizenzen im Impressum</NuxtLink>. Kein amtliches Angebot.
        </p>
        <p>
          <ExternalLink
            href="https://github.com/mmeindl/begutachtungs-monitor"
            class="underline underline-offset-2 hover:no-underline"
          >Quellcode auf GitHub</ExternalLink>
          · Kontakt:
          <a
            href="mailto:kontakt@begutachtungs-monitor.at"
            class="underline underline-offset-2 hover:no-underline"
          >kontakt@begutachtungs-monitor.at</a>
        </p>
        <nav aria-label="Rechtliches">
          <ul class="flex flex-wrap items-center gap-x-4">
            <li>
              <NuxtLink
                to="/impressum"
                class="tap-target rounded underline underline-offset-2 hover:no-underline"
              >Impressum &amp; Offenlegung</NuxtLink>
            </li>
            <li>
              <NuxtLink
                to="/datenschutz"
                class="tap-target rounded underline underline-offset-2 hover:no-underline"
              >Datenschutz</NuxtLink>
            </li>
          </ul>
        </nav>
      </div>
    </div>
  </footer>
</template>

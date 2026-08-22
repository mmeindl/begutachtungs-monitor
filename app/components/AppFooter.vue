<script setup lang="ts">
const { webcalUrl, googleCalUrl, icsDisplayUrl } = useFeedUrls()
</script>

<template>
  <footer class="border-t border-hairline">
    <div class="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <section aria-labelledby="subscribe-heading" class="rounded-xl bg-accent-wash p-5">
        <h2 id="subscribe-heading" class="text-base font-semibold text-ink">
          Keine Frist verpassen
        </h2>
        <!-- Only ink + accent-deep are AAA on accent-wash (see main.css). -->
        <div class="mt-2 space-y-1.5 text-sm leading-relaxed text-ink">
          <p>
            <UIcon
              name="i-lucide-calendar-plus"
              class="me-1 inline-block size-4 align-text-bottom"
              aria-hidden="true"
            />
            Fristen-Kalender abonnieren:
            <a :href="webcalUrl" class="tap-target rounded font-medium text-accent-deep underline underline-offset-2 hover:no-underline">Apple/Outlook</a>
            ·
            <ExternalLink :href="googleCalUrl" class="tap-target rounded font-medium text-accent-deep underline underline-offset-2 hover:no-underline">Google Kalender</ExternalLink>
            · manuell:
            <span class="select-all font-medium">{{ icsDisplayUrl }}</span>
          </p>
          <p>
            <UIcon
              name="i-lucide-rss"
              class="me-1 inline-block size-4 align-text-bottom"
              aria-hidden="true"
            />
            Neue Begutachtungen verfolgen:
            <a href="/feed.xml" class="tap-target rounded font-medium text-accent-deep underline underline-offset-2 hover:no-underline">RSS-Feed</a>
          </p>
        </div>
      </section>

      <div class="mt-6 flex flex-col gap-2 text-sm leading-relaxed text-ink-muted">
        <p>
          Datenquelle: Republik Österreich – Parlamentsdirektion
          (<ExternalLink
            href="https://www.parlament.gv.at"
            class="underline underline-offset-2 hover:text-ink"
            >parlament.gv.at</ExternalLink
          >), Lizenz
          <ExternalLink
            href="https://creativecommons.org/licenses/by/4.0/deed.de"
            class="underline underline-offset-2 hover:text-ink"
            >CC BY 4.0</ExternalLink
          >. Kein amtliches Angebot.
        </p>
        <p>
          Prototyp in Entwicklung –
          <ExternalLink
            href="https://github.com/mmeindl/begutachtungs-monitor"
            class="underline underline-offset-2 hover:text-ink"
            >Quellcode auf GitHub</ExternalLink
          >
          · Kontakt:
          <a
            href="mailto:kontakt@begutachtungs-monitor.at"
            class="underline underline-offset-2 hover:text-ink"
            >kontakt@begutachtungs-monitor.at</a
          >
        </p>
      </div>
    </div>
  </footer>
</template>

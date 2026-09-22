export default defineNuxtConfig({
  compatibilityDate: '2026-08-15',
  modules: ['@nuxt/ui', '@nuxt/eslint'],
  // One tool for lint and formatting, no Prettier (docs/refactor-plan.md §2).
  // The stylistic options are not a taste decision — each one was measured
  // against the existing code so the linter enforces what is already there:
  // 2-space indent, single quotes, no semicolons, trailing commas in
  // multiline literals, `} else {` on one line, parens around a single arrow
  // parameter, and a key quoted only where the key needs it. The rules that
  // this factory has no option for are in `eslint.config.mjs`, with the
  // count in the tree that argues for each of them.
  eslint: {
    config: {
      stylistic: {
        indent: 2,
        quotes: 'single',
        semi: false,
        commaDangle: 'always-multiline',
        braceStyle: '1tbs',
        arrowParens: true,
        quoteProps: 'as-needed',
        blockSpacing: true,
      },
    },
  },
  runtimeConfig: {
    // Absolute base for links in RSS/ICS feeds; override via NUXT_PUBLIC_SITE_URL.
    public: { siteUrl: 'https://begutachtungs-monitor.at' },
  },
  css: ['~/assets/css/main.css'],
  // Cached-function storage, split by provenance (server/utils/cacheBase.ts):
  // the default `cache` mount keeps documents we fetched and stays on disk,
  // `derived` keeps what we computed and is memory, so a parser change shows
  // on the next request instead of in 24 hours. Production mounts neither —
  // there both are memory already.
  nitro: { devStorage: { derived: { driver: 'memory' } } },
  // The object of a detail page is the Entwurf, not the Begutachtung, and
  // the URL now says so. Links from the first weeks are in circulation —
  // the RSS feed, the calendar, shared links — and they are the only thing
  // this project has that it cannot re-issue, so they keep working.
  // 301, because the move is permanent.
  routeRules: {
    '/begutachtungen': { redirect: { to: '/entwuerfe', statusCode: 301 } },
    '/begutachtungen/**': { redirect: { to: '/entwuerfe/**', statusCode: 301 } },
    // The Begutachtungen without a Gegenstand had their own list for a few
    // hours on 17.09.2026 and their own detail path until 18.09.2026; the
    // list is a filter on /entwuerfe and the pages are `/entwuerfe/:id`
    // (docs/architecture.md §12.19). They are still their own kind of
    // object with their own page anatomy (§12.16) — that difference belongs
    // in the page, not in a second URL prefix that calls two thirds of the
    // corpus „weitere". Both rules: the bare path lands on the filter, and
    // everything beneath it — detail pages and their `.ics` — keeps its
    // suffix.
    '/weitere-entwuerfe': { redirect: { to: '/entwuerfe?art=verordnung', statusCode: 301 } },
    '/weitere-entwuerfe/**': { redirect: { to: '/entwuerfe/**', statusCode: 301 } },
    // `/suche` war vom 19. bis 22.09.2026 eine eigene Seite. Seit das Feld
    // auf `/entwuerfe` beide Antworten gibt (§12.31), wäre sie eine zweite
    // Adresse für dieselbe Frage — genau das, was dort abgeschafft wurde.
    // Der 301 bleibt trotzdem: Die Seite stand in der sitemap, und ein Link
    // ist das einzige, was dieses Projekt nicht neu ausstellen kann. `?q=`
    // reist mit, weil Nitro die Query an das Ziel anhängt — wer einen
    // geteilten Link öffnet, sieht Treffer und kein leeres Feld.
    '/suche': { redirect: { to: '/entwuerfe', statusCode: 301 } },
  },
  ui: {
    // Light-only prototype: Nuxt UI's color-mode integration would flip its
    // tokens dark on OS preference while our custom tokens stay light.
    colorMode: false,
    // System sans only (architecture.md §8) — no font module, no web fonts.
    fonts: false,
  },
  // EU sovereignty: icons come exclusively from the locally installed
  // @iconify-json/lucide bundle — never at runtime from api.iconify.design.
  icon: { fallbackToApi: false },
  // Dev watchers on polling: chokidar 5 uses fs.watch (no FSEvents anymore),
  // and this machine's watch capacity is exhausted by parallel dev servers
  // → EMFILE on startup. Only project files are polled (node_modules is
  // ignored), so the cost is negligible.
  vite: { server: { watch: { usePolling: true, interval: 300 } } },
  watchers: { chokidar: { usePolling: true, interval: 300 } },
  // Components register by plain file name (<StatTile>, not <UiStatTile>) —
  // keep file names globally unique across component subfolders.
  components: [{ path: '~/components', pathPrefix: false }],
  app: {
    head: {
      htmlAttrs: { lang: 'de-AT' },
      meta: [
        {
          name: 'description',
          content:
            'Laufende Begutachtungen österreichischer Gesetzes- und Verordnungsentwürfe: Fristen und Stellungnahmen – und danach: Regierungsvorlage, Bundesgesetzblatt.',
        },
      ],
      link: [
        {
          // § on the marker-yellow tile — the one identity mark (also the
          // header brand and the og:image). Inline SVG, zero external assets.
          rel: 'icon',
          href: 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect width=%22100%22 height=%22100%22 rx=%2220%22 fill=%22%23ffd84d%22/><text x=%2250%22 y=%2274%22 font-family=%22Georgia,serif%22 font-size=%2268%22 text-anchor=%22middle%22 fill=%22%230b0b0b%22>%C2%A7</text></svg>',
        },
        {
          rel: 'alternate',
          type: 'application/rss+xml',
          title: 'Begutachtungs-Monitor – RSS',
          href: '/feed.xml',
        },
      ],
    },
  },
  typescript: { strict: true },
})

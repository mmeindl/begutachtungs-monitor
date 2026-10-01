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
  // Cached-function storage, split by provenance (server/utils/cache/base.ts):
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
    // `/suche` was its own page from 19. to 22.09.2026. Now that the field
    // on `/entwuerfe` gives both answers (docs/architecture.md §12.31) it
    // would be a second address for the same question — the very thing
    // abolished there. The 301 stays anyway: the page stood in the sitemap,
    // and a link is the one thing this project cannot re-issue. `?q=` travels
    // along, because Nitro appends the query to the target — whoever opens a
    // shared link sees hits and not an empty field.
    '/suche': { redirect: { to: '/entwuerfe', statusCode: 301 } },
    // The font carries no hash in its name, so Nitro sends it without a
    // Cache-Control and browsers guess a lifetime from Last-Modified — which
    // every deploy resets, so returning readers revalidated it over and over.
    // A year and immutable is safe because the face does not change, and a
    // different face would be a different file name.
    '/fonts/**': { headers: { 'cache-control': 'public, max-age=31536000, immutable' } },
  },
  ui: {
    // Light-only prototype: Nuxt UI's color-mode integration would flip its
    // tokens dark on OS preference while our custom tokens stay light.
    colorMode: false,
    // Disables the @nuxt/fonts module, not web fonts: the one face, Source
    // Serif 4 SemiBold for headings, has been self-hosted from public/fonts
    // since 2026-08-27 (app/assets/css/main.css). Body text stays system
    // sans, and nothing is fetched from a third party at runtime.
    fonts: false,
    // Theme CSS only for the Nuxt UI components the app uses (five of
    // them), instead of all of Nuxt UI's. The one render-blocking
    // stylesheet goes from 208 to 85 KB, 28,7 to 14,4 KB gzipped (measured
    // 30.09.2026). Checked on production builds, 12 pages at 1280 and 390
    // px: no computed style and no box of any element changed, and every
    // class on the rendered pages still has its rule. What it does take
    // away: a utility our templates use only by accident of standing in a
    // Nuxt UI theme too. Such a class must be written out in full in our
    // own source, as Tailwind requires anyway; a class assembled from a
    // string is not found.
    experimental: { componentDetection: true },
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
  // Components register by plain file name (<SectionCredits>, not
  // <UiSectionCredits>) — keep file names globally unique across the
  // component subfolders.
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
        // § on the marker-yellow tile — the one identity mark (also the
        // header brand and the og:image). The § is the Source Serif 4
        // SemiBold glyph of the header, as a path: an SVG favicon that names
        // a font renders in whatever serif the visitor happens to have.
        // `favicon.svg` is the source; the .ico (16/32/48, the 16 with a
        // larger glyph so it stays legible) and the 180px touch icon (full
        // bleed — iOS rounds the corners itself) are renders of it. The
        // .ico is for everything that asks `/favicon.ico` without reading
        // the HTML: feed readers, bookmark lists, link-preview bots.
        { rel: 'icon', href: '/favicon.ico', sizes: '32x32' },
        { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
        // The heading face, preloaded: the wordmark in the header uses it on
        // every page, above the fold, and the browser would otherwise find
        // the file only once the stylesheet is parsed — the wordmark and the
        // H1 then paint in Georgia first and swap. `crossorigin` is required
        // for a font preload even on the same origin, or the browser fetches
        // the file twice.
        {
          rel: 'preload',
          href: '/fonts/SourceSerif4-Semibold.woff2',
          as: 'font',
          type: 'font/woff2',
          crossorigin: '',
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

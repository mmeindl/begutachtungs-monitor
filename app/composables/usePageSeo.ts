/**
 * A page's title and description, for the search result and the link
 * preview alike.
 *
 * Open Graph does not fall back to `<title>` and the meta description
 * everywhere: Signal, WhatsApp and LinkedIn read `og:*` and show a bare URL
 * or the site name without them. Setting both pairs in one call is what
 * keeps a new page from having one without the other. A page whose preview
 * should say something else than its search result (the home page, a draft)
 * overrides the `og:*` half with its own `useSeoMeta` after this.
 */
import type { MaybeRefOrGetter } from 'vue'

export function usePageSeo(meta: {
  title: MaybeRefOrGetter<string>
  description: MaybeRefOrGetter<string | undefined>
}): void {
  useSeoMeta({
    title: meta.title,
    description: meta.description,
    ogTitle: meta.title,
    ogDescription: meta.description,
  })
}

export default defineAppConfig({
  ui: {
    colors: {
      // 'accent' is our own scale in main.css, derived from the validated
      // sequential blue ramp (500 = #2a78d6, 600 = #1c5cab).
      primary: 'accent',
      // Warm gray, closest Tailwind match to the ink/hairline tokens.
      neutral: 'stone',
    },
    // The form-control hover (main.css, hover grammar): the edge darkens
    // to `hover-edge`, the same as TokenSelect's. These are appended to
    // Nuxt UI's own compound variants (`tv({ extend })`), which already
    // give the button its ink tint and leave the text input without one.
    // Only `outline`: a `subtle` button is a selected toggle, and its ink
    // ring must not turn grey under the pointer.
    button: {
      compoundVariants: [
        {
          color: 'neutral',
          variant: 'outline',
          class: 'not-disabled:not-aria-disabled:hover:ring-hover-edge',
        },
      ],
    },
    // Every text input here is the default `primary`, which differs from
    // neutral only in its focus ring, so this one matches by variant alone.
    input: {
      compoundVariants: [
        {
          variant: 'outline',
          class: 'not-disabled:hover:ring-hover-edge',
        },
      ],
    },
  },
})

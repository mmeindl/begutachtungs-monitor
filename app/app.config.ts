export default defineAppConfig({
  ui: {
    colors: {
      // 'accent' is our own scale in main.css, derived from the validated
      // sequential blue ramp (500 = #2a78d6, 600 = #1c5cab).
      primary: 'accent',
      // Warm gray, closest Tailwind match to the ink/hairline tokens.
      neutral: 'stone',
    },
  },
})

import type { ComputedRef, Ref } from 'vue'

/**
 * Copy a string, and say that it happened (22.10.2026) — the mechanics of
 * `CiteButton`, shared since the e-mail address of a Land's draft became
 * copyable too (`CopyButton`).
 *
 * `copied` holds for 2,5 s, for the button's label; `announcement` is what a
 * status region says, empty when mounted and filled afterwards, so a screen
 * reader hears the result and not only the click. Where the browser refuses
 * the clipboard (an insecure context, a denied permission) a prompt holds
 * the text, selected, for a manual copy.
 */
export function useClipboardCopy(
  text: () => string,
  describe: { prompt: string; done: string },
): { copied: Ref<boolean>; announcement: ComputedRef<string>; copy: () => Promise<void> } {
  const copied = ref(false)
  let timer: ReturnType<typeof setTimeout> | undefined

  async function copy() {
    try {
      await navigator.clipboard.writeText(text())
    } catch {
      window.prompt(describe.prompt, text())
      return
    }
    copied.value = true
    clearTimeout(timer)
    timer = setTimeout(() => { copied.value = false }, 2500)
  }

  onBeforeUnmount(() => clearTimeout(timer))

  return {
    copied,
    announcement: computed(() => (copied.value ? `${describe.done}: ${text()}` : '')),
    copy,
  }
}

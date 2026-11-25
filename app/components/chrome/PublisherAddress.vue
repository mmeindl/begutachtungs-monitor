<script setup lang="ts">
/**
 * The publisher's contact block (25.11.2026): the Medieninhaber on
 * `/impressum` and the controller on `/datenschutz`. Both pages render this
 * one block, so the two cannot drift apart. What it shows and why:
 * `app/utils/publisher.ts`.
 *
 * `<address>` is the semantic element for the contact block of its nearest
 * section. It has to stay the component's root: `prose-flow` spaces and
 * colours the direct children of a `ProseSection`, and takes the browser's
 * default italic back.
 */
import { PUBLISHER } from '~/utils/publisher'

const contact = useContact()
</script>

<template>
  <address>
    {{ PUBLISHER.name }}<br>
    c/o {{ PUBLISHER.careOf }}<br>
    {{ PUBLISHER.street }}<br>
    {{ PUBLISHER.place }}<br>
    ZVR-Zahl: {{ PUBLISHER.zvr }}<br>
    E-Mail:
    <a
      :href="contact.mailto"
      class="link-inline"
    >{{ contact.email }}</a>
  </address>
</template>

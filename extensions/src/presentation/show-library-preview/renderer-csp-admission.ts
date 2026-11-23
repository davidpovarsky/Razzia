import { z } from "zod"

// Zod 4 captures its object-parser JIT policy while schemas are constructed.
// Build the payload's schemas without its caught Function probe under strict CSP.
// Restore the host's configuration after dependency initialization, before mount.
const configuration = z.config()
const previous = configuration.jitless
z.config({ jitless: true })
let restored = false

export function restoreNativeCspConfiguration() {
  if (restored) {
    return
  }

  restored = true

  if (previous === undefined) {
    delete configuration.jitless
  } else {
    configuration.jitless = previous
  }
}

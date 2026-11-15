import { z } from "zod"

// Zod captures object-parser JIT policy at schema construction. Initialize this
// page's pure DTO dependencies without a caught Function probe under strict CSP,
// then restore the existing host configuration before the component acts.
const configuration = z.config()
const previous = configuration.jitless
z.config({ jitless: true })
let restored = false
export function restoreNativeSaveCspConfiguration() {
  if (restored) return
  restored = true
  if (previous === undefined) delete configuration.jitless
  else configuration.jitless = previous
}

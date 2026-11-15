import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { isAbsolute, join, resolve, sep } from "node:path"

/** Optional SERVER-only evidence sink. No real account/config data is read.
 * The runtime plan sets this to the own /evidence/review-witnesses bind mount. */
export function preserveWitness(
  name: string,
  data: unknown,
  syntheticDb?: string,
) {
  const requested = process.env.MCP_SYNTHETIC_REVIEW_EVIDENCE
  if (!requested) return
  const root = resolve(requested)
  if (
    process.platform !== "linux" ||
    !isAbsolute(requested) ||
    !root.startsWith("/evidence/") ||
    !/^[a-z0-9-]+$/u.test(name)
  ) {
    throw new Error("Owned synthetic /evidence directory required")
  }
  mkdirSync(root, { recursive: true, mode: 0o700 })
  writeFileSync(
    join(root, name + ".json"),
    JSON.stringify(data, null, 2) + "\n",
    { mode: 0o600 },
  )
  if (syntheticDb) {
    const file = resolve(syntheticDb)
    if (
      !file.includes(sep + "tadazz-m3a-synthetic-") ||
      !file.endsWith(sep + "drafts.sqlite")
    )
      throw new Error("Synthetic private draft DB required")
    writeFileSync(join(root, name + ".sqlite"), readFileSync(file), {
      mode: 0o600,
    })
  }
}

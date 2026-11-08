import { readFile, writeFile, mkdir } from "node:fs/promises"
import { resolve } from "node:path"
import { z } from "zod"
import { showThemeDefinitionSchema } from "../src/core/show-themes/definition"
import {
  readManifest,
  validateThemePackage,
} from "../src/server/show-themes/validate-package"

const [command, ...args] = process.argv.slice(2)

if (command === "schema") {
  const target = resolve(
    args[0] ??
      ".agents/skills/tadazz-theme-creator/assets/theme-template/theme-manifest.schema.json",
  )
  await mkdir(resolve(target, ".."), { recursive: true })
  await writeFile(
    target,
    `${JSON.stringify(
      z.toJSONSchema(showThemeDefinitionSchema, { unrepresentable: "any" }),
      null,
      2,
    )}\n`,
  )
  console.log(target)
} else if (command === "validate") {
  const [file, publicRoot, mode] = args

  if (!file || !publicRoot) {
    throw new Error(
      "Usage: theme-authoring.ts validate manifest.json asset-root [--trusted-repository]",
    )
  }

  const result = await validateThemePackage(
    await readManifest(file),
    publicRoot,
    { trustedRepository: mode === "--trusted-repository" },
  )
  console.log(
    JSON.stringify(
      {
        status: "VALIDATED_NOT_INSTALLED",
        manifestSha256: result.manifestSha256,
        assetCount: result.assetCount,
        assetBytes: result.assetBytes,
      },
      null,
      2,
    ),
  )
} else if (command === "scaffold") {
  const [target, id] = args

  if (!target || !id || !/^[a-z][a-z0-9-]{1,79}$/u.test(id)) {
    throw new Error(
      "Usage: theme-authoring.ts scaffold new-directory stable-theme-id",
    )
  }

  const manifest = showThemeDefinitionSchema.parse(
    JSON.parse(
      await readFile(
        new URL(
          "../src/core/show-themes/classic.manifest.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ),
  )
  manifest.id = id
  manifest.kind = "declarative"
  manifest.provenance =
    "DRAFT: Classic trusted-renderer starter; requires client rights, concept review, runtime QA and approval. Not registered or installed."
  for (const group of [
    ...Object.values(manifest.slots),
    ...Object.values(manifest.audioEvents),
  ] as Array<{ defaultVariantId: string; variants: Array<{ id: string }> }>) {
    group.defaultVariantId = group.defaultVariantId.replace(
      "tadazz-classic.",
      `${id}.`,
    )
    for (const choice of group.variants) {
      choice.id = choice.id.replace("tadazz-classic.", `${id}.`)
    }
  }
  for (const cue of Object.values(manifest.choreographyCues) as Array<{
    variantId: string
  }>) {
    cue.variantId = cue.variantId.replace("tadazz-classic.", `${id}.`)
  }
  const directory = resolve(target)
  await mkdir(directory, { recursive: true })
  await writeFile(
    resolve(directory, "manifest.json"),
    `${JSON.stringify(showThemeDefinitionSchema.parse(manifest), null, 2)}\n`,
    { flag: "wx" },
  )
  console.log(`DRAFT_ONLY: ${directory}`)
} else {
  throw new Error(
    "Supported authoring commands: schema, validate, scaffold. No installer or publisher is exposed.",
  )
}

/* oxlint-disable eslint/no-await-in-loop -- Read the eight local starter dictionaries in a deterministic bounded sequence. */
import { readFile, writeFile, mkdir } from "node:fs/promises"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { z } from "zod"
import {
  showThemeDefinitionSchema,
  SHOW_THEME_LOCALES,
} from "../src/core/show-themes/definition"
import { runThemeRemote } from "./theme-remote"
import {
  readManifest,
  validateThemePackage,
} from "../src/server/show-themes/validate-package"

const [command, ...args] = process.argv.slice(2)

if (command === "schema") {
  const target = resolve(
    args[0] ??
      fileURLToPath(
        new URL(
          "../../.agents/skills/tadazz-theme-creator/assets/theme-template/theme-manifest.schema.json",
          import.meta.url,
        ),
      ),
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
  manifest.localizations = {} as NonNullable<typeof manifest.localizations>
  const labelKeys = [
    manifest.nameKey,
    manifest.descriptionKey,
    ...Object.values(manifest.slots).flatMap((group) =>
      group.variants.map((choice) => choice.labelKey),
    ),
    ...Object.values(manifest.audioEvents).flatMap((group) =>
      group.variants.map((choice) => choice.labelKey),
    ),
  ]
  for (const locale of SHOW_THEME_LOCALES) {
    const resources: unknown = JSON.parse(
      await readFile(
        new URL(`../src/locales/${locale}/extensions.json`, import.meta.url),
        "utf8",
      ),
    )
    const values: Record<string, string> = {}
    for (const key of labelKeys) {
      let value: unknown = resources
      for (const part of key.split(":")[1].split(".")) {
        value =
          typeof value === "object" && value !== null
            ? (value as Record<string, unknown>)[part]
            : undefined
      }

      if (typeof value !== "string") {
        throw new Error(`Missing starter translation: ${locale}/${key}`)
      }

      values[key] = value
    }
    values[manifest.nameKey] = id
    manifest.localizations[locale] = values
  }
  const directory = resolve(target)
  await mkdir(directory, { recursive: true })
  await writeFile(
    resolve(directory, "manifest.json"),
    `${JSON.stringify(showThemeDefinitionSchema.parse(manifest), null, 2)}\n`,
    { flag: "wx" },
  )
  console.log(`DRAFT_ONLY: ${directory}`)
} else if (
  command &&
  [
    "package",
    "upload",
    "revise",
    "list",
    "audit",
    "preview",
    "qa",
    "request-review",
    "approve",
    "reject",
    "stage",
    "publish",
    "rollback",
  ].includes(command)
) {
  console.log(JSON.stringify(await runThemeRemote(command, args), null, 2))
} else {
  throw new Error(
    "Supported commands: schema, validate, scaffold, package, upload, revise, list, audit, preview, qa, request-review, approve, reject, stage, publish, rollback.",
  )
}

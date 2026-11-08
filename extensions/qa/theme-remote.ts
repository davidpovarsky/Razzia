/* oxlint-disable eslint/no-await-in-loop, eslint/max-params, eslint/no-nested-ternary, eslint/init-declarations -- Upload validation and installation transitions are sequential; the private request helper separates JSON and raw bytes. */
import { readFile, writeFile, lstat } from "node:fs/promises"
import { resolve } from "node:path"
import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { z } from "zod"
import { showThemeDefinitionSchema } from "../src/core/show-themes/definition"
import { themeApprovalSchema } from "../src/server/show-themes/installation"
import {
  inspectAuthoringDirectory,
  readManifest,
  validateThemeAssetBytes,
  validateThemePackage,
} from "../src/server/show-themes/validate-package"

export const themePackageSchema = z.strictObject({
  format: z.literal("tadazz-theme-package-v1"),
  manifest: showThemeDefinitionSchema,
  assets: z
    .array(
      z.strictObject({
        id: z.string().max(160),
        contentBase64: z.string().max(133_333_336),
      }),
    )
    .max(256),
})

async function boundedJson(file: string, max: number) {
  const stat = await lstat(file)

  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > max) {
    throw new Error("Unsafe or oversized input file")
  }

  return JSON.parse(await readFile(file, "utf8")) as unknown
}
function target() {
  const value = process.env.TADAZZ_THEME_SERVER
  const token = process.env.TADAZZ_THEME_TOKEN

  if (!value || !token) {
    throw new Error(
      "Set TADAZZ_THEME_SERVER and TADAZZ_THEME_TOKEN; credentials are never command-line arguments",
    )
  }

  const url = new URL(value)

  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    (url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
      ))
  ) {
    throw new Error(
      "Use an HTTPS origin, or a loopback origin inside the remote QA environment",
    )
  }

  const tenant = process.env.TADAZZ_THEME_WORKSPACE

  if (!tenant || !/^(platform|[a-f0-9-]{36})$/u.test(tenant)) {
    throw new Error("Set an assigned TADAZZ_THEME_WORKSPACE")
  }

  return {
    url,
    token,
    tenant,
    path: `/api/themes/workspaces/${encodeURIComponent(tenant)}/drafts`,
  }
}

export async function runThemeRemote(command: string, args: string[]) {
  if (command === "package") {
    const [file, assetRoot, output] = args

    if (!file || !assetRoot || !output) {
      throw new Error(
        "Usage: package manifest.json asset-root output.theme.json",
      )
    }

    await inspectAuthoringDirectory(assetRoot)
    const { definition } = await validateThemePackage(
      await readManifest(file),
      assetRoot,
    )

    if (!definition.localizations) {
      throw new Error("All eight theme label translations are required")
    }

    const assets = []
    for (const asset of definition.assets) {
      const bytes = await readFile(resolve(assetRoot, `.${asset.url}`))
      validateThemeAssetBytes(asset, bytes, { embeddedResourcesOnly: true })
      assets.push({ id: asset.id, contentBase64: bytes.toString("base64") })
    }
    const packaged = themePackageSchema.parse({
      format: "tadazz-theme-package-v1",
      manifest: definition,
      assets,
    })
    await writeFile(output, `${JSON.stringify(packaged)}\n`, {
      flag: "wx",
      mode: 0o600,
    })

    return { status: "PACKAGED_NOT_INSTALLED", file: resolve(output) }
  }

  const endpoint = target()
  const request = async (
    path: string,
    body?: unknown,
    bytes?: Buffer,
    method?: "PUT",
  ) => {
    const response = await fetch(new URL(path, endpoint.url), {
      method: method ?? (bytes ? "PUT" : body ? "POST" : "GET"),
      redirect: "error",
      headers: {
        Authorization: `Bearer ${endpoint.token}`,
        ...(bytes
          ? { "Content-Type": "application/octet-stream" }
          : body
            ? { "Content-Type": "application/json" }
            : {}),
      },
      body: bytes
        ? new Uint8Array(bytes)
        : body
          ? JSON.stringify(body)
          : undefined,
      signal: AbortSignal.timeout(120_000),
    })

    if (!response.ok) {
      const errorBody = (await response.json()) as { error?: unknown }
      const message =
        typeof errorBody.error === "string" ? errorBody.error : "operation-rejected"
      throw new Error(
        `Theme operation failed: HTTP ${response.status} ${message}`,
      )
    }

    return (await response.json()) as Record<string, unknown>
  }

  if (command === "list") {
    return request(endpoint.path.replace(/\/drafts$/u, ""))
  }

  if (command === "audit") {
    return request(endpoint.path.replace(/\/drafts$/u, "/audit"))
  }

  if (command === "upload" || command === "revise") {
    const file = command === "upload" ? args[0] : args[1]

    if (!file) {
      throw new Error(
        "Usage: upload package.theme.json OR revise artifact-id package.theme.json expected-revision",
      )
    }

    const pkg = themePackageSchema.parse(await boundedJson(file, 215_000_000))
    const ids = new Set(pkg.assets.map((asset) => asset.id))

    if (
      ids.size !== pkg.assets.length ||
      ids.size !== pkg.manifest.assets.length
    ) {
      throw new Error("Package asset set mismatch")
    }

    const uploads = pkg.manifest.assets.map((asset) => {
      const item = pkg.assets.find((value) => value.id === asset.id)

      if (!item || !/^[A-Za-z0-9+/]*={0,2}$/u.test(item.contentBase64)) {
        throw new Error("Invalid package asset encoding")
      }

      const bytes = Buffer.from(item.contentBase64, "base64")

      if (bytes.toString("base64") !== item.contentBase64) {
        throw new Error("Noncanonical package encoding")
      }

      validateThemeAssetBytes(asset, bytes, { embeddedResourcesOnly: true })

      return { asset, bytes }
    })
    let id: string

    if (command === "revise") {
      id = z.uuid().parse(args[0])
      const expectedRevision = z.coerce.number().int().positive().parse(args[2])
      await request(
        `${endpoint.path}/${id}`,
        { expectedRevision, manifest: pkg.manifest },
        undefined,
        "PUT",
      )
    } else {
      const created = await request(endpoint.path, pkg.manifest)
      id = z.uuid().parse(created.artifactId)
    }

    for (const { asset, bytes } of uploads) {
      await request(
        `${endpoint.path}/${id}/assets/${encodeURIComponent(asset.id)}`,
        undefined,
        bytes,
      )
    }
    await request(`${endpoint.path}/${id}/actions`, { action: "validate" })

    return {
      status: "VALIDATED_PRIVATE_DRAFT",
      artifactId: id,
      tenantId: endpoint.tenant,
      ...(await request(`${endpoint.path}/${id}`)),
    }
  }

  const id = z.uuid().parse(args[0])

  if (command === "preview") {
    const preview = await request(`${endpoint.path}/${id}/preview`)
    const definition = showThemeDefinitionSchema.parse(preview.definition)

    return {
      status: "PRIVATE_PREVIEW",
      id: definition.id,
      version: definition.version,
      revision: preview.revision,
      manifestSha256: preview.manifestSha256,
      url: new URL(`/manager/themes/${endpoint.tenant}/${id}`, endpoint.url)
        .href,
    }
  }

  if (command === "approve") {
    if (!args[1]) {
      throw new Error("Usage: approve artifact-id human-review-evidence.json")
    }

    return request(
      `${endpoint.path}/${id}/approval`,
      themeApprovalSchema.parse(await boundedJson(args[1], 2000)),
    )
  }

  if (command === "reject") {
    if (!args[1]) {
      throw new Error("Usage: reject artifact-id review-rejection.json")
    }

    const input = z
      .strictObject({
        expectedRevision: z.number().int().positive(),
        reason: z.string().trim().min(1).max(1000),
      })
      .parse(await boundedJson(args[1], 4000))

    return request(`${endpoint.path}/${id}/rejection`, input)
  }

  if (command === "qa") {
    if (process.env.TADAZZ_REMOTE_QA !== "1") {
      throw new Error(
        "Run browser/audio QA only in the authorized remote QA environment",
      )
    }

    if (!args[1]) {
      throw new Error("Usage: qa artifact-id private-evidence-directory")
    }

    const output = resolve(args[1])
    const preview = await request(`${endpoint.path}/${id}/preview`)
    const expectedRevision = z.number().int().positive().parse(preview.revision)
    const manifestSha256 = z
      .string()
      .regex(/^[a-f0-9]{64}$/u)
      .parse(preview.manifestSha256)
    execFileSync(
      "pnpm",
      [
        "exec",
        "playwright",
        "test",
        "--config",
        "playwright.theme-preview.config.ts",
      ],
      {
        cwd: resolve(import.meta.dirname, "../../packages/e2e"),
        stdio: ["ignore", process.stderr, process.stderr],
        env: {
          ...process.env,
          TADAZZ_THEME_ARTIFACT: id,
          TADAZZ_THEME_QA_OUTPUT: output,
          TADAZZ_THEME_EXPECTED_REVISION: String(expectedRevision),
          TADAZZ_THEME_EXPECTED_MANIFEST: manifestSha256,
        },
      },
    )
    const report = await readFile(resolve(output, "report.json"))

    return {
      status: "REMOTE_BROWSER_QA_PASSED",
      qaEvidenceSha256: createHash("sha256").update(report).digest("hex"),
      expectedRevision,
      manifestSha256,
      output,
    }
  }

  if (["request-review", "stage", "publish", "rollback"].includes(command)) {
    return request(`${endpoint.path}/${id}/actions`, { action: command })
  }

  throw new Error("Unknown theme operation")
}

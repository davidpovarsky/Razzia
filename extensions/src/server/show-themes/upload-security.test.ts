/* oxlint-disable eslint/no-plusplus, typescript/no-non-null-assertion -- The bounded malicious-fixture builder addresses known generated keys and bytes. */
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { expect, it } from "vitest"
import {
  showThemeDefinitionSchema,
  type ThemeAsset,
} from "../../core/show-themes/definition"
import { createInstallationFixture, picture } from "./installation.fixture"
import { validateThemeAssetBytes } from "./validate-package"

const root = resolve(import.meta.dirname, "../../../../packages/web/public")
function asset(
  bytes: Buffer,
  extension = "png",
  kind: ThemeAsset["kind"] = "image",
): ThemeAsset {
  return {
    id: "untrusted",
    url: `/media/input.${extension}`,
    kind,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    bytes: bytes.length,
    rights: "owner-authorized",
    provenance: "Adversarial test only",
    preload: "slot",
  }
}
const validate = (
  bytes: Buffer,
  extension = "png",
  kind: ThemeAsset["kind"] = "image",
) =>
  validateThemeAssetBytes(asset(bytes, extension, kind), bytes, {
    embeddedResourcesOnly: true,
  })

it("accepts existing real PNG, JPEG and WebP raster bytes within the decoded budget", () => {
  expect(() => validate(picture)).not.toThrow()
  expect(() =>
    validate(
      readFileSync(resolve(root, "tadazz-show/v4/teaser-screen.jpg")),
      "jpg",
    ),
  ).not.toThrow()
  expect(() =>
    validate(
      readFileSync(resolve(root, "tadazz-show/v4/show-stage.webp")),
      "webp",
    ),
  ).not.toThrow()
  const gif = Buffer.from(
    "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
    "base64",
  )
  expect(() => validate(gif, "gif")).not.toThrow()
})
it("rejects spoofed SVG/HTML and archive bytes even with a matching claimed SHA256", () => {
  for (const bytes of [
    Buffer.from("<svg onload='alert(1)'/>"),
    Buffer.from("<html><script>evil()</script>"),
    Buffer.from([80, 75, 3, 4, 0, 0, 0, 0]),
  ]) {
    expect(() => validate(bytes)).toThrow("signature")
  }
})
it("rejects oversized decoded canvases and truncated image chunks", () => {
  const bomb = Buffer.from(picture)
  bomb.writeUInt32BE(100_000, 16)
  expect(() => validate(bomb)).toThrow("decoded budget")
  expect(() => validate(picture.subarray(0, 24))).toThrow("Truncated PNG")
  const webp = readFileSync(resolve(root, "tadazz-show/v4/show-stage.webp"))
  expect(() => validate(webp.subarray(0, 30), "webp")).toThrow()
})
it("rejects Lottie expressions, remote/relative resources, SVG data and render-budget bombs", () => {
  const base = {
    v: "5.7.0",
    fr: 30,
    ip: 0,
    op: 60,
    w: 100,
    h: 100,
    layers: [],
    assets: [],
  }
  const check = (input: unknown) =>
    validate(Buffer.from(JSON.stringify(input)), "json", "lottie")
  expect(() => check(base)).not.toThrow()
  for (const input of [
    { ...base, layers: [{ x: "fetch('https://evil.invalid')" }] },
    { ...base, assets: [{ p: "https://evil.invalid/pixel.png" }] },
    { ...base, assets: [{ p: "relative.png" }] },
    { ...base, assets: [{ p: "data:image/svg+xml,<svg/>" }] },
    { ...base, fonts: { list: [{ fPath: "https://evil.invalid/font.woff" }] } },
    { ...base, w: 100_000 },
    { ...base, op: 30_000 },
  ]) {
    expect(() => check(input)).toThrow()
  }
})
it("requires eight complete locale maps and bounds the actual runtime manifest", () => {
  const definition = createInstallationFixture()
  const missing = structuredClone(definition)
  delete (missing.localizations as Record<string, unknown>).de
  expect(showThemeDefinitionSchema.safeParse(missing).success).toBe(false)
  const oversized = structuredClone(definition)
  for (let i = 0; i < 1100; i++) {
    oversized.localizations!.en[`extra${i}`] = "x".repeat(100)
  }
  expect(() => showThemeDefinitionSchema.parse(oversized)).toThrow(
    "runtime budget",
  )
})

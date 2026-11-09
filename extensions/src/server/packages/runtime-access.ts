/* oxlint-disable eslint/max-params -- Capabilities explicitly bind authority, principal, upload and domain-separated signing secret. */
/* oxlint-disable typescript/no-non-null-assertion -- A cache key is evicted only after the nonempty size guard. */
import { createHmac, timingSafeEqual } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { packageSha } from "./archive"
import { PackageError, type PackageStore } from "./store"
import type { ThemePrincipal } from "../show-themes/review"
type RuntimeBundle = Partial<
  Record<string, { js: string; css: string; assets: Record<string, string> }>
>
const bundles = new Map<string, RuntimeBundle>()

/** Short-lived read-only show-content capability. Never an account/session token. */
export function issueRuntimeAccess(
  store: PackageStore,
  p: ThemePrincipal,
  upload: string,
  secret: string,
) {
  const row = store.own(p, upload)

  if (!["preview-ready", "installed"].includes(row.phase) || !row.build) {
    throw new PackageError("PACKAGE_RUNTIME_NOT_READY", 409)
  }

  const claim = {
    tenant: row.tenant,
    upload,
    source: row.source,
    build: row.build,
    exp: Date.now() + 300_000,
  }
  const payload = Buffer.from(JSON.stringify(claim)).toString("base64url")

  return `${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`
}

export function readRuntimeAccess(
  store: PackageStore,
  token: string,
  secret: string,
) {
  if (token.length > 2000) {
    throw new PackageError("PACKAGE_CAPABILITY", 403)
  }

  const parts = token.split(".")
  const payload = parts.at(0) ?? ""
  const signature = parts.at(1) ?? ""
  const extra = parts.at(2)
  const expected = createHmac("sha256", secret).update(payload).digest()
  const got = Buffer.from(signature, "base64url")

  if (
    extra ||
    got.length !== expected.length ||
    !timingSafeEqual(got, expected)
  ) {
    throw new PackageError("PACKAGE_CAPABILITY", 403)
  }

  const claim = JSON.parse(Buffer.from(payload, "base64url").toString()) as {
    tenant: string
    upload: string
    source: string
    build: string
    exp: number
  }
  const row = store.own(
    { tenantId: claim.tenant, userId: "scoped-runtime", grants: [] },
    claim.upload,
  )

  if (
    !Number.isFinite(claim.exp) ||
    claim.exp < Date.now() ||
    claim.exp > Date.now() + 300_000 ||
    row.source !== claim.source ||
    row.build !== claim.build ||
    !["installed", "preview-ready"].includes(row.phase)
  ) {
    throw new PackageError("PACKAGE_CAPABILITY", 403)
  }

  const key = `${store.tenantRoot(row.tenant)}:${row.build}`
  let bundle = bundles.get(key)

  if (!bundle) {
    const bytes = fs.readFileSync(
      path.join(store.tenantRoot(row.tenant), `${row.build}.build.json`),
    )

    if (bytes.length > 8_000_000 || packageSha(bytes) !== row.build) {
      throw new PackageError("PACKAGE_BUILD_DIGEST", 409)
    }

    bundle = JSON.parse(bytes.toString()) as RuntimeBundle

    if (bundles.size >= 8) {
      bundles.delete(bundles.keys().next().value!)
    }

    bundles.set(key, bundle)
  }

  return { row, bundle }
}

export function sandboxDocument(js: string, css: string, parentOrigin: string) {
  const scriptHash = `sha256-${Buffer.from(packageSha(js), "hex").toString("base64")}`
  const styleHash = `sha256-${Buffer.from(packageSha(css), "hex").toString("base64")}`
  const csp = `default-src 'none'; script-src '${scriptHash}'; style-src '${styleHash}'; style-src-attr 'unsafe-inline'; img-src data:; font-src data:; media-src 'none'; connect-src 'none'; worker-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors ${parentOrigin}; sandbox allow-scripts`

  // Esbuild output uses escaped <; style closing tags are rejected by the builder.
  return {
    csp,
    html: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="root"></div><script>${js}</script></body></html>`,
  }
}

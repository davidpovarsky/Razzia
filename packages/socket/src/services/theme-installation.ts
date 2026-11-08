/* oxlint-disable eslint/max-params -- Preview tickets explicitly bind claims, workspace, artifact and revision. */
/** Server-owned installation policy. Nothing here trusts tenant/grants from JSON. */
import { createHmac } from "node:crypto"
import { resolve } from "node:path"
import { z } from "zod"
import {
  demoThemeDefinitions,
  ThemeInstallationError,
  ThemeInstallationStore,
  type TrustedThemeBuild,
  type ThemePrincipal,
} from "@razzia/extensions/server"
import type { ShowThemeDefinition } from "@razzia/extensions/core"
import { resolveConfigRoot } from "./config-scope"
import { accountsEnabled } from "./account-scope"
import { sign, verify } from "hono/jwt"
import { jwtSecret } from "@razzia/socket/env"
import { isAccountSessionValid } from "./account-auth"
import type { SessionClaims } from "@razzia/common/types/auth"

const assignmentSchema = z.record(
  z.uuid(),
  z.record(
    z.string().regex(/^(platform|[a-f0-9-]{36})$/u),
    z.array(z.enum(["author", "review", "publish", "platform"])).max(4),
  ),
)
// Code-backed additions require a reviewed, committed build record here AND a
// source-controlled renderer registration. HTTP uploads cannot populate this map.
const TRUSTED_THEME_BUILDS: ReadonlyMap<string, TrustedThemeBuild> = new Map()
let store: ThemeInstallationStore | undefined = undefined
let storeRoot: string | undefined = undefined

/** Operator-owned demo catalog, deliberately independent of customer publication. */
export const demoCatalogEnabled = () =>
  process.env.TADAZZ_DEMO_CATALOG_ENABLED === "true"

export const enabledDemoThemes = () =>
  demoCatalogEnabled() ? demoThemeDefinitions : []

export const themeInstallerEnabled = () =>
  process.env.TADAZZ_THEME_INSTALLER_ENABLED === "true" && accountsEnabled()

export function themeInstallationStore() {
  if (!themeInstallerEnabled()) {
    throw new ThemeInstallationError("Not found", 404)
  }

  const secret = process.env.JWT_SECRET

  if (!secret || secret.length < 32) {
    throw new Error("Persistent JWT_SECRET required for theme signing")
  }

  const root = resolveConfigRoot()

  if (!store || storeRoot !== root) {
    store?.close()
    store = new ThemeInstallationStore(
      resolve(root, "extensions/theme-installation.sqlite"),
      createHmac("sha256", secret)
        .update("tadazz-theme-installation-v1")
        .digest(),
      TRUSTED_THEME_BUILDS,
    )
    storeRoot = root
  }

  return store
}

export function themeWorkspaceAssignments(
  userId: string,
): Record<string, ThemePrincipal["grants"]> {
  const input = process.env.TADAZZ_THEME_WORKSPACE_GRANTS
  const configured = input ? assignmentSchema.parse(JSON.parse(input)) : {}

  return { [userId]: ["author"], ...(configured[userId] ?? {}) }
}

export function themeWorkspacePrincipal(
  userId: string,
  tenantId: string,
): ThemePrincipal {
  const grants = themeWorkspaceAssignments(userId)[tenantId]

  // oxlint-disable-next-line typescript/no-unnecessary-condition -- Runtime policy lookup can miss an unassigned workspace despite Record index typing.
  if (!grants || (tenantId === "platform" && !grants.includes("platform"))) {
    throw new ThemeInstallationError("Not found", 404)
  }

  return { userId, tenantId, grants }
}

/** Capture approved definitions once per room. Later publishing cannot mutate an active room. */
export function installedThemeForSelection(
  tenantId: string,
  selection: unknown,
): ShowThemeDefinition | null {
  if (!selection || typeof selection !== "object") {
    return null
  }

  const { id, version } = selection as { id?: unknown; version?: unknown }

  const demo = enabledDemoThemes().find(
    (theme) => theme.id === id && theme.version === version,
  )

  if (demo) {
    return demo
  }

  if (!themeInstallerEnabled()) {
    return null
  }

  return (
    themeInstallationStore()
      .catalog(tenantId)
      .concat(themeInstallationStore().catalog("platform"))
      .find((theme) => theme.id === id && theme.version === version) ?? null
  )
}

export function closeThemeInstallationStore() {
  store?.close()
  store = undefined
  storeRoot = undefined
}

export function readInstalledThemeMedia(ownerId: string, name: string) {
  if (!themeInstallerEnabled() || !name.startsWith("theme_")) {
    return null
  }

  const installation = themeInstallationStore()

  return (
    installation.readPublishedMedia(ownerId, name) ??
    installation.readPublishedMedia("platform", name)
  )
}

export function createThemePreviewTicket(
  claims: SessionClaims,
  tenantId: string,
  artifactId: string,
  revision: number,
) {
  if (!claims.sid) {
    throw new ThemeInstallationError("Account session required", 403)
  }

  return sign(
    {
      purpose: "theme-preview",
      actor: claims.sub,
      sid: claims.sid,
      tenantId,
      artifactId,
      revision,
      exp: Math.min(claims.exp, Math.floor(Date.now() / 1000) + 300),
    },
    jwtSecret,
    "HS256",
  )
}

export async function readThemePreviewMedia(ticket: string, name: string) {
  if (!themeInstallerEnabled() || !name.startsWith("theme_")) {
    return null
  }

  const value = await verify(ticket, jwtSecret, "HS256")

  if (
    value.purpose !== "theme-preview" ||
    typeof value.actor !== "string" ||
    typeof value.sid !== "string" ||
    typeof value.tenantId !== "string" ||
    typeof value.artifactId !== "string" ||
    typeof value.revision !== "number" ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 1 ||
    !isAccountSessionValid(value.actor, value.sid)
  ) {
    throw new ThemeInstallationError("Invalid preview access", 403)
  }

  const p = themeWorkspacePrincipal(value.actor, value.tenantId)

  return themeInstallationStore().readPreviewMedia(
    p,
    value.artifactId,
    name,
    value.revision,
  )
}

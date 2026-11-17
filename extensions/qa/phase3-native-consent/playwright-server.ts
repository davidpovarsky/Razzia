import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import {
  buildMcpOptions,
  createEphemeralOAuthKeys,
  createLoopbackTlsCertificate,
  installResendVerificationTrap,
} from "./harness.ts"

const rawSiteDist = process.env.TADAZZ_SITE_DIST_DIR

if (!rawSiteDist || !existsSync(join(rawSiteDist, "index.html"))) {
  throw new Error(
    "TADAZZ_SITE_DIST_DIR must point to a built Site dist directory containing index.html (build with VITE_TADAZZ_OAUTH_ISSUER_PATH=/oauth)",
  )
}

const siteDistDir = resolve(rawSiteDist)
const requestedPort = Number(process.env.TADAZZ_QA_PORT ?? "4193")
const selfCreatedRunDir =
  !process.env.TADAZZ_QA_RUN_DIR || process.env.TADAZZ_QA_OWNED_RUN_DIR === "1"
const runDir = realpathSync(
  process.env.TADAZZ_QA_RUN_DIR
    ? resolve(process.env.TADAZZ_QA_RUN_DIR)
    : mkdtempSync(join(tmpdir(), "tadazz-pw-native-consent-")),
)
const configRoot = join(runDir, "config-root")
const mailFile = join(runDir, "mail-codes.json")
const metaFile = join(runDir, "meta.json")

mkdirSync(configRoot, { recursive: true })

process.env.CONFIG_PATH = configRoot
process.env.TADAZZ_ACCOUNTS_ENABLED = "true"
process.env.JWT_SECRET = `pw-fixture-jwt-${"q".repeat(48)}`
process.env.RESEND_API_KEY = "test-not-a-real-api-key"
process.env.TADAZZ_AUTH_EMAIL_FROM = "Tadazz QA <auth@example.invalid>"

const mailRecords: Record<string, string> = {}
const persistMail = () => {
  const staging = `${mailFile}.tmp`

  writeFileSync(staging, JSON.stringify(mailRecords), "utf8")
  renameSync(staging, mailFile)
}
const mailTrap = installResendVerificationTrap((email, code) => {
  mailRecords[email] = code
  persistMail()
})

persistMail()

const tls = createLoopbackTlsCertificate()
const keys = createEphemeralOAuthKeys()
const expectedOrigin = `https://127.0.0.1:${requestedPort}`
const nativeHostMod = await import("../../src/mcp-app/native-host/index.ts")
const host = await nativeHostMod.createNativeConsentHost({
  enabled: true,
  configRoot,
  siteDistDir,
  initializeNativeRuntime: true,
  mcp: buildMcpOptions({
    origin: expectedOrigin,
    keys,
    redirectUris: [
      `${expectedOrigin}/oauth/callback`,
      "https://chatgpt.com/connector_platform_oauth_redirect",
    ],
  }),
})
const httpServer = await nativeHostMod.listenNativeConsentHost(host, {
  host: "127.0.0.1",
  port: requestedPort,
  tls,
  attachSocketServer: true,
})

writeFileSync(
  metaFile,
  JSON.stringify({
    origin: httpServer.origin,
    port: httpServer.port,
    certPem: tls.cert,
    configRoot,
    mailFile,
  }),
  "utf8",
)

let shuttingDown = false
const shutdown = async () => {
  if (shuttingDown) {
    return
  }

  shuttingDown = true
  mailTrap.restore()
  await httpServer.close()

  if (selfCreatedRunDir) {
    rmSync(runDir, { recursive: true, force: true })
  }

  process.exit(0)
}

process.on("SIGINT", () => {
  void shutdown()
})
process.on("SIGTERM", () => {
  void shutdown()
})

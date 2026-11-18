// Explicit downstream production entry. The original server remains the OFF path.
import { readProductionMcpConfiguration } from "./production-config.ts"

declare const __TADAZZ_FULL_SHOW_MANIFEST_SHA256__: string

async function start() {
  const crypto = readProductionMcpConfiguration()

  if (!crypto) {
    await import("@razzia/socket/index")

    return
  }

  const rawPort = process.env.SOCKET_PORT ?? "3001"

  if (!/^[1-9][0-9]{0,4}$/u.test(rawPort) || Number(rawPort) > 65535) {
    throw new Error("MCP production port rejected")
  }

  const [
    { createNativeConsentHost, listenNativeConsentHost },
    { createPrincipalRateLimiter },
    { createProductionMcpCapabilities },
    { readProductionFullShowArtifacts },
    { createFullShowPreviewPortV3 },
  ] = await Promise.all([
    import("./index.ts"),
    import("../first-party/index.ts"),
    import("./production-capabilities.ts"),
    import("./production-artifacts.ts"),
    import("../server/full-show-frame.ts"),
  ])
  const { origin } = new URL(crypto.config.issuer)
  const capabilities = await createProductionMcpCapabilities({
    clientIds: new Set(crypto.clients.map((client) => client.clientId)),
  })
  const preview = readProductionFullShowArtifacts({
    artifactDirectory: "/app/mcp",
    manifestSha256: __TADAZZ_FULL_SHOW_MANIFEST_SHA256__,
    publicDirectory: "/app/web",
    origin,
  })
  const host = await createNativeConsentHost({
    enabled: true,
    configRoot: process.env.CONFIG_PATH,
    siteDistDir: "/app/web",
    initializeNativeRuntime: true,
    mcp: {
      ...crypto,
      consentPageUrl: `${origin}/studio/oauth-consent`,
      allowedOrigins: [origin],
      ...capabilities,
      fullShowPreviewV3: (drafts) =>
        createFullShowPreviewPortV3(
          { drafts, authoring: capabilities.authoring },
          {
            rendererBuildId: preview.rendererBuildId,
            assertAssets: preview.assertAssets,
          },
        ),
      fullShowUiResourceV3: preview.resource,
      rateLimit: createPrincipalRateLimiter(),
      nativeSave: { consentPageUrl: `${origin}/studio/native-save-consent` },
    },
  })

  try {
    const listener = await listenNativeConsentHost(host, {
      host: "127.0.0.1",
      port: Number(rawPort),
      attachSocketServer: true,
    })
    let closing = false
    const shutdown = () => {
      if (closing) {
        return
      }

      closing = true
      const deadline = setTimeout(() => process.exit(1), 35000)
      void import("@razzia/socket/services/registry")
        .then(async ({ default: Registry }) => {
          Registry.getInstance().cleanup()
          await listener.close()
          clearTimeout(deadline)
        })
        .catch(() => {
          console.error("MCP production shutdown failed")
          process.exitCode = 1
        })
    }
    process.once("SIGTERM", shutdown)
    process.once("SIGINT", shutdown)
    console.log("Tadazz protected native host listening on loopback")
  } catch {
    await host.close()
    throw new Error("MCP production listener failed")
  }
}
void start().catch(() => {
  // Native/OAuth errors may contain credentials or account details. No raw dump.
  console.error("Tadazz production startup failed")
  process.exitCode = 1
})

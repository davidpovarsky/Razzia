// Explicit downstream production entry. The original server remains the OFF path.
import { readProductionMcpConfiguration } from "./production-config.ts"

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
  ] = await Promise.all([
    import("./index.ts"),
    import("../first-party/index.ts"),
  ])
  const { origin } = new URL(crypto.config.issuer)
  const host = await createNativeConsentHost({
    enabled: true,
    configRoot: process.env.CONFIG_PATH,
    siteDistDir: "/app/web",
    initializeNativeRuntime: true,
    mcp: {
      ...crypto,
      consentPageUrl: `${origin}/studio/oauth-consent`,
      allowedOrigins: [origin],
      authoring: { allowedPublicAssetUrls: new Set<string>() },
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

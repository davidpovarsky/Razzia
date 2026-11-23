"use strict"
const http = require("node:http")
const fs = require("node:fs")
const path = require("node:path")

async function checkUrl(url, options = {}) {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), options.timeout || 2000)
    const res = await fetch(url, { ...options, signal: controller.signal })
    clearTimeout(timer)
    const text = await res.text().catch(() => "")
    return { ok: true, status: res.status, body: text }
  } catch (err) {
    return {
      ok: false,
      error:
        err.name === "AbortError"
          ? "TIMEOUT"
          : err.cause?.code || err.code || "CONNREFUSED",
    }
  }
}

async function runDiagnostics() {
  const report = {
    timestamp: new Date().toISOString(),
    layers: {},
    summary: "",
  }

  // 1. Secret storage
  const localAppData = process.env.LOCALAPPDATA || ""
  const secretPath = path.join(
    localAppData,
    "Tada",
    "Secrets",
    "pilot-route.dpapi",
  )
  const secretExists = fs.existsSync(secretPath)
  const envSecretPresent = Boolean(
    process.env.TADA_PILOT_SECRET && process.env.TADA_PILOT_SECRET.length >= 32,
  )
  report.layers.secret = {
    dpapiFileExists: secretExists,
    dpapiFilePath: secretPath,
    envSecretConfigured: envSecretPresent,
    status: secretExists || envSecretPresent ? "OK" : "MISSING",
  }

  // 2. Local Razzia API Server (3001)
  const apiUrl =
    process.env.TADA_RAZZIA_API_URL ||
    "http://127.0.0.1:3001/api/games/pilot-phone"
  const apiProbe = await checkUrl(apiUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action: "join_or_poll",
      callId: "diagnostics-probe-call",
    }),
  })
  report.layers.backendApi = {
    targetUrl: apiUrl,
    reachable: apiProbe.ok,
    status: apiProbe.ok ? `HTTP_${apiProbe.status}` : apiProbe.error,
    diagnosis: apiProbe.ok
      ? apiProbe.status === 401
        ? "REACHABLE_AUTH_ENFORCED"
        : "REACHABLE_HEALTHY"
      : "BACKEND_NOT_RUNNING",
  }

  // 3. Audio Gateway Service (38991)
  const gwPort = process.env.TADA_PILOT_PORT || 38991
  const gwHealthUrl = `http://127.0.0.1:${gwPort}/health`
  const gwProbe = await checkUrl(gwHealthUrl)
  report.layers.gateway = {
    port: Number(gwPort),
    healthUrl: gwHealthUrl,
    running: gwProbe.ok && gwProbe.body?.includes("TADA_PHONE_AUDIO_V1"),
    rawStatus: gwProbe.ok ? `HTTP_${gwProbe.status}` : gwProbe.error,
    diagnosis:
      gwProbe.ok && gwProbe.body?.includes("TADA_PHONE_AUDIO_V1")
        ? "GATEWAY_HEALTHY_RUNNING"
        : "GATEWAY_STOPPED",
  }

  // 4. Tunnel Inspector (ngrok 4040)
  const ngrokProbe = await checkUrl("http://127.0.0.1:4040/api/tunnels")
  if (ngrokProbe.ok) {
    try {
      const data = JSON.parse(ngrokProbe.body)
      const tunnels = data.tunnels || []
      const gwTunnel = tunnels.find((t) =>
        t.config?.addr?.includes(String(gwPort)),
      )
      const otherTunnels = tunnels.map((t) => ({
        proto: t.proto,
        addr: t.config?.addr,
      }))
      report.layers.tunnel = {
        ngrokRunning: true,
        gatewayTunnelFound: Boolean(gwTunnel),
        gatewayTunnelPublicUrl: gwTunnel
          ? `${gwTunnel.public_url.slice(0, 16)}...`
          : null,
        otherActiveTunnels: otherTunnels,
        diagnosis: gwTunnel
          ? "TUNNEL_BOUND_TO_GATEWAY"
          : tunnels.length > 0
            ? "TUNNEL_POINTING_TO_OTHER_SERVICE"
            : "NO_ACTIVE_TUNNEL",
      }
    } catch {
      report.layers.tunnel = {
        ngrokRunning: true,
        diagnosis: "TUNNEL_PARSE_ERROR",
      }
    }
  } else {
    report.layers.tunnel = {
      ngrokRunning: false,
      diagnosis: "NGROK_INSPECTOR_NOT_RUNNING",
    }
  }

  // 5. Synthesis
  const issues = []
  if (report.layers.backendApi.diagnosis === "BACKEND_NOT_RUNNING") {
    issues.push("Razzia socket backend is not listening on 3001")
  }
  if (report.layers.gateway.diagnosis === "GATEWAY_STOPPED") {
    issues.push("Audio gateway is not listening on 38991")
  }
  if (report.layers.tunnel.diagnosis === "TUNNEL_POINTING_TO_OTHER_SERVICE") {
    issues.push(
      `ngrok tunnel is pointing to another service (${report.layers.tunnel.otherActiveTunnels?.map((t) => t.addr).join(", ")}), NOT port 38991`,
    )
  } else if (
    report.layers.tunnel.diagnosis === "NO_ACTIVE_TUNNEL" ||
    report.layers.tunnel.diagnosis === "NGROK_INSPECTOR_NOT_RUNNING"
  ) {
    issues.push("No active public tunnel to audio gateway")
  }

  report.summary =
    issues.length === 0
      ? "ALL_PILOT_LAYERS_OPERATIONAL"
      : `BLOCKED: ${issues.join("; ")}`
  return report
}

if (require.main === module) {
  runDiagnostics().then((r) => {
    console.log(JSON.stringify(r, null, 2))
  })
}

module.exports = { runDiagnostics }

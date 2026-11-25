/** Synthetic local TLS for the isolated package browser fixture only. */
import { spawn } from "node:child_process"
import fs from "node:fs"
import http from "node:http"
import https from "node:https"
import path from "node:path"
import type { Socket } from "node:net"

const configPath = process.env.CONFIG_PATH

if (
  process.platform !== "linux" ||
  process.env.TADAZZ_REMOTE_QA !== "1" ||
  !configPath ||
  !/^\/evidence\/package-staging-[a-z0-9-]+$/u.test(configPath) ||
  process.env.TADAZZ_PACKAGE_RUNTIME_ORIGIN !== "https://localhost:3192" ||
  process.env.TADAZZ_PACKAGE_PARENT_ORIGIN !== "http://127.0.0.1:3190"
) {
  throw new Error("Isolated synthetic TLS runtime only")
}

const repositoryRoot = path.resolve(import.meta.dirname, "../..")
const tlsDirectory = path.join(configPath, "runtime-tls")
const server = https.createServer(
  {
    key: fs.readFileSync(path.join(tlsDirectory, "runtime.key")),
    cert: fs.readFileSync(path.join(tlsDirectory, "runtime.crt")),
    minVersion: "TLSv1.2",
  },
  (request, response) => {
    const upstream = http.request(
      {
        hostname: "127.0.0.1",
        port: 3194,
        path: request.url,
        method: request.method,
        headers: request.headers,
      },
      (reply) => {
        response.writeHead(reply.statusCode ?? 502, reply.headers)
        reply.pipe(response)
      },
    )
    upstream.on("error", () => {
      if (!response.headersSent) {
        response.writeHead(503, { "Content-Type": "text/plain" })
        response.end("Synthetic runtime starting")
      } else {
        response.destroy()
      }
    })
    request.on("aborted", () => upstream.destroy())
    response.on("close", () => {
      if (!response.writableFinished) {
        upstream.destroy()
      }
    })
    request.pipe(upstream)
  },
)

const sockets = new Set<Socket>()
server.on("connection", (socket) => {
  sockets.add(socket)
  socket.once("close", () => sockets.delete(socket))
})
const renderer = spawn(
  process.execPath,
  [
    "--import",
    path.join(repositoryRoot, "extensions/node_modules/tsx/dist/loader.mjs"),
    path.join(repositoryRoot, "extensions/qa/package-runtime-server.ts"),
  ],
  {
    cwd: repositoryRoot,
    env: { ...process.env, TADAZZ_PACKAGE_RUNTIME_PORT: "3194" },
    stdio: ["ignore", "inherit", "inherit"],
  },
)
const rendererDone = new Promise<void>((resolve) => {
  renderer.once("exit", () => resolve())
  renderer.once("error", () => resolve())
})
let stopping = false

async function stop(code: number) {
  if (stopping) {
    return
  }

  stopping = true
  const closed = new Promise<void>((resolve) => {
    server.close(() => resolve())
  })
  renderer.kill("SIGTERM")
  const force = setTimeout(() => {
    renderer.kill("SIGKILL")
    for (const socket of sockets) {
      socket.destroy()
    }
  }, 2000)
  force.unref()
  await Promise.allSettled([closed, rendererDone])
  clearTimeout(force)
  process.exit(code)
}

renderer.once("exit", (code) => void stop(code ?? 1))
renderer.once("error", (error) => {
  console.error(error)
  void stop(1)
})
server.once("error", (error) => {
  console.error(error)
  void stop(1)
})
process.once("SIGTERM", () => void stop(0))
process.once("SIGINT", () => void stop(0))
server.listen(3192, "0.0.0.0")

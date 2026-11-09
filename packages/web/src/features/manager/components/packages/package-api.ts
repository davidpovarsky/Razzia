import { ensureSession } from "@razzia/web/lib/session"

export interface PackageReceipt {
  uploadId: string
  sourceDigest: string
  phase: string
  revision: number
  buildDigest: string | null
  reviewed: boolean
  manifest: {
    id: string
    version: string
    displayName: string
    author: string
    contents: Array<{ id: string; kind: string; path: string; demo: boolean }>
  }
  code: boolean
  type: string
  assetCount: number
  totalBytes: number
  installedGames: string[]
}

export async function packageRequest(path: string, options: RequestInit = {}) {
  const { token } = await ensureSession()
  const headers = new Headers(options.headers)
  headers.set("Authorization", `Bearer ${token}`)
  const workspace = new URLSearchParams(window.location.search).get(
    "packageWorkspace",
  )

  if (workspace) {
    headers.set("X-Tadazz-Workspace", workspace)
  }

  const response = await fetch(`/api/packages${path}`, {
    ...options,
    headers,
    cache: "no-store",
    redirect: "error",
  })

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? `PACKAGE_HTTP_${response.status}`)
  }

  return response
}

export async function packageJson<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  return (await packageRequest(path, options)).json() as Promise<T>
}

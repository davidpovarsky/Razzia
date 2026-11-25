import build from "../../../core/show-library/application-preview-build.json" with { type: "json" }
import type { ApplicationPreviewFrame } from "../../../core/show-library/application-preview-schema"
import { getToken } from "@razzia/web/lib/session"

export interface ApplicationPreviewMount {
  update(frame: ApplicationPreviewFrame): Promise<void>
  mediaElement(): HTMLMediaElement | null
  dispose(): void
}

interface NativeModule {
  mount: (
    element: HTMLElement,
    css: string,
    unavailable: () => void,
  ) => ApplicationPreviewMount
}
// Only immutable public application code is reused. Sources, grants, frames,
// stages and callbacks remain per activation and are never stored here.
let loaded: { key: string; module: NativeModule; css: string } | undefined =
  undefined

export async function loadApplicationPreviewRuntime(
  signal: AbortSignal,
  publicExample = false,
) {
  if (!build.available) {
    throw new Error("Unbuilt preview runtime")
  }

  const files = build.files as Array<{
    name: string
    bytes: number
    sha256: string
  }>
  const key = files.map((file) => `${file.name}:${file.sha256}`).join("|")
  const lease = (value: NonNullable<typeof loaded>) => ({
    mount: (element: HTMLElement, unavailable: () => void) =>
      value.module.mount(element, value.css, unavailable),
    dispose() {
      /* The activation disposes its root. The self-contained module URL is already revoked. */
    },
  })
  signal.throwIfAborted()

  if (loaded?.key === key) {
    return lease(loaded)
  }

  const read = async (name: string) => {
    const file = files.find((entry) => entry.name === name)
    const token = getToken()

    if (!file || (!token && !publicExample)) {
      throw new Error("Preview unavailable")
    }

    const response = await fetch(
      `/api/extensions/preview/${publicExample ? "public-runtime" : "runtime"}/${file.sha256}/${name}`,
      {
        headers:
          token && !publicExample ? { Authorization: `Bearer ${token}` } : {},
        signal,
        credentials: "same-origin",
        cache: "no-store",
        redirect: "error",
      },
    )

    if (
      !response.ok ||
      Number(response.headers.get("Content-Length")) > 10_000_000
    ) {
      throw new Error("Preview unavailable")
    }

    const bytes = await response.arrayBuffer()
    const digest = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
      (n) => n.toString(16).padStart(2, "0"),
    ).join("")

    if (bytes.byteLength !== file.bytes || digest !== file.sha256) {
      throw new Error("Preview artifact changed")
    }

    return bytes
  }
  const [module, cssBytes] = await Promise.all([
    read("renderer.mjs"),
    read("renderer.css"),
  ])
  signal.throwIfAborted()

  if (loaded?.key === key) {
    return lease(loaded)
  }

  const url = URL.createObjectURL(
    new Blob([module], { type: "text/javascript" }),
  )

  try {
    // Only bytes matching the source-controlled SHA above reach the module loader.
    // oxlint-disable-next-line eslint/no-inline-comments -- Vite requires this pragma inside the dynamic import.
    const runtime = (await import(/* @vite-ignore */ url)) as NativeModule
    signal.throwIfAborted()

    if (typeof runtime.mount !== "function") {
      throw new Error("Preview unavailable")
    }

    loaded = { key, module: runtime, css: new TextDecoder().decode(cssBytes) }

    return lease(loaded)
  } finally {
    URL.revokeObjectURL(url)
  }
}

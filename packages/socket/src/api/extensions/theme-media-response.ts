/* oxlint-disable typescript/no-non-null-assertion -- Regex group is read only after the explicit successful range match. */
import type { Context } from "hono"
import type { ShowThemeDefinition } from "@razzia/extensions/core"
const mime: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  ogg: "audio/ogg",
  mp4: "video/mp4",
  webm: "video/webm",
  json: "application/json",
  lottie: "application/zip",
}

export function themeMediaResponse(
  c: Context,
  media: { asset: ShowThemeDefinition["assets"][number]; bytes: Buffer },
) {
  const { asset, bytes } = media
  c.header(
    "Content-Type",
    mime[asset.url.split(".").at(-1)!] ?? "application/octet-stream",
  )
  c.header("Cache-Control", "private, no-store")
  c.header("X-Content-Type-Options", "nosniff")
  c.header("Cross-Origin-Resource-Policy", "same-origin")
  c.header("Content-Security-Policy", "default-src 'none'; sandbox")
  c.header("Accept-Ranges", "bytes")
  const range = c.req.header("Range")

  if (!range) {
    c.header("Content-Length", String(bytes.length))

    return c.body(Uint8Array.from(bytes).buffer, 200)
  }

  const match = /^bytes=(\d*)-(\d*)$/u.exec(range)
  let start = 0
  let end = bytes.length - 1

  if (match && (match[1] || match[2])) {
    if (!match[1]) {
      start = Math.max(0, bytes.length - Number(match[2]))
    } else {
      start = Number(match[1])

      if (match[2]) {
        end = Math.min(end, Number(match[2]))
      }
    }
  }

  if (
    !match ||
    (!match[1] && !match[2]) ||
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start > end ||
    start >= bytes.length
  ) {
    c.header("Content-Range", `bytes */${bytes.length}`)

    return c.body(null, 416)
  }

  const chunk = bytes.subarray(start, end + 1)
  c.header("Content-Range", `bytes ${start}-${end}/${bytes.length}`)
  c.header("Content-Length", String(chunk.length))

  return c.body(Uint8Array.from(chunk).buffer, 206)
}

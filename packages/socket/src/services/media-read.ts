import fs from "node:fs"
import { extname } from "node:path"
import { getPath } from "./config"
import { withAccount } from "./account-scope"
const types: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".json": "application/json",
  ".lottie": "application/zip",
}

export function allowedMediaName(name: string): boolean {
  return /^[A-Za-z0-9_-]+\.(png|jpg|jpeg|webp|gif|mp3|ogg|wav|m4a|mp4|webm|json|lottie)$/u.test(
    name,
  )
}

export /* oxlint-disable require-await, typescript/require-await -- Retain promise-returning API and rejection semantics for synchronous implementations. */
async function readAccountMedia(
  ownerId: string | null,
  name: string,
): Promise<{
  bytes: Uint8Array
  type: string
} | null> {
  if (!allowedMediaName(name)) {
    return null
  }

  return withAccount(ownerId ?? "", () => {
    const path = getPath(`media/${name}`)

    try {
      if (!fs.lstatSync(path).isFile()) {
        return null
      }

      return {
        bytes: new Uint8Array(fs.readFileSync(path)),
        type: types[extname(name)] ?? "application/octet-stream",
      }
    } catch {
      return null
    }
  })
}
/* oxlint-enable require-await, typescript/require-await */

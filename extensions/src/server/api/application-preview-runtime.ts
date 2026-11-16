import fs from "node:fs"
import path from "node:path"
import { createHash } from "node:crypto"
import build from "../../core/show-library/application-preview-build.json" with { type: "json" }

/** Fixed source-controlled first-party runtime only; no caller path or uploaded JS. */
export function readApplicationPreviewRuntime(digest: string, name: string) {
  if (!build.available || !["renderer.mjs", "renderer.css"].includes(name)) {
    return null
  }

  const file = (
    build.files as Array<{ name: string; bytes: number; sha256: string }>
  ).find((entry) => entry.name === name && entry.sha256 === digest)

  if (!file) {
    return null
  }

  const directories = process.env.TADAZZ_APPLICATION_PREVIEW_DIR
    ? [process.env.TADAZZ_APPLICATION_PREVIEW_DIR]
    : [
        ...(typeof import.meta.dirname === "string"
          ? [
              path.resolve(
                import.meta.dirname,
                "../../../../extensions/dist/application-preview",
              ),
            ]
          : []),
        "/app/web/tadazz-application-runtime",
      ]
  for (const directory of directories) {
    try {
      const filename = path.join(directory, file.name)

      if (!fs.lstatSync(filename).isFile()) {
        continue
      }

      const bytes = fs.readFileSync(filename)

      if (
        bytes.length !== file.bytes ||
        createHash("sha256").update(bytes).digest("hex") !== file.sha256
      ) {
        continue
      }

      return {
        bytes,
        type: name.endsWith(".css")
          ? "text/css; charset=utf-8"
          : "text/javascript; charset=utf-8",
      }
    } catch {
      /* Try the fixed packaged application directory. */
    }
  }

  return null
}

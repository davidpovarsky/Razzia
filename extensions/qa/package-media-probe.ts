/* oxlint-disable typescript/no-non-null-assertion -- Media filenames and inventory are validated before sandbox decode. */
/** Decoders run only in the same disposable networkless, budgeted build sandbox. */
import fs from "node:fs"
import path from "node:path"
import { execFileSync } from "node:child_process"
import type { PortablePackage } from "../src/server/packages/archive"

export function probePackageMedia(pkg: PortablePackage) {
  if (process.env.TADAZZ_BUILD_SANDBOX !== "1") {
    throw new Error("Decoder sandbox required")
  }

  const dir = fs.mkdtempSync("/tmp/tadazz-media-")
  for (const file of pkg.manifest.files.filter((f) =>
    ["image", "audio", "video", "font"].includes(f.kind),
  )) {
    const target = path.join(dir, `media.${file.path.split(".").at(-1)}`)
    fs.writeFileSync(target, pkg.files.get(file.path)!)

    if (file.kind === "font") {
      // FreeType opens/decompresses WOFF2 inside the same memory/time-limited worker.
      execFileSync(
        "python3",
        [
          "-c",
          `import ctypes,sys
lib=ctypes.CDLL('libfreetype.so.6')
library=ctypes.c_void_p(); face=ctypes.c_void_p()
assert lib.FT_Init_FreeType(ctypes.byref(library)) == 0
data=open(sys.argv[1],'rb').read(); buf=ctypes.create_string_buffer(data)
assert lib.FT_New_Memory_Face(library,buf,len(data),0,ctypes.byref(face)) == 0
lib.FT_Done_Face(face); lib.FT_Done_FreeType(library)
`,
          target,
        ],
        { timeout: 5000, maxBuffer: 100_000 },
      )
      fs.unlinkSync(target)

      continue
    }

    const result = JSON.parse(
      execFileSync(
        "ffprobe",
        [
          "-v",
          "error",
          "-protocol_whitelist",
          "file,pipe",
          "-show_streams",
          "-show_format",
          "-of",
          "json",
          target,
        ],
        { timeout: 5000, maxBuffer: 1_000_000, encoding: "utf8" },
      ),
    ) as {
      streams: Array<Record<string, string | number | undefined>>
      format: { duration?: string }
    }

    if (!result.streams.length || result.streams.length > 8) {
      throw new Error("Media stream budget")
    }

    for (const stream of result.streams) {
      if (!["audio", "video"].includes(String(stream.codec_type))) {
        throw new Error("Media stream type")
      }

      const duration = Number(stream.duration ?? result.format.duration ?? 0)

      if (
        !Number.isFinite(duration) ||
        duration < 0 ||
        duration > (file.kind === "audio" ? 7200 : 1800)
      ) {
        throw new Error("Media duration budget")
      }

      if (
        stream.codec_type === "audio" &&
        (Number(stream.channels) > 8 || Number(stream.sample_rate) > 96_000)
      ) {
        throw new Error("Audio decoded budget")
      }

      if (stream.codec_type === "video") {
        const width = Number(stream.width),
          height = Number(stream.height)

        if (
          !(width > 0 && height > 0) ||
          width > 8192 ||
          height > 8192 ||
          width * height > 16_777_216
        ) {
          throw new Error("Video/image decoded budget")
        }
      }
    }
    // Actually decode a bounded frame/audio segment, not only a MIME/magic claim.
    execFileSync(
      "ffmpeg",
      [
        "-v",
        "error",
        "-nostdin",
        "-xerror",
        "-protocol_whitelist",
        "file,pipe",
        "-i",
        target,
        "-t",
        "0.1",
        "-frames:v",
        "1",
        "-f",
        "null",
        "-",
      ],
      { timeout: 5000, maxBuffer: 100_000 },
    )
    fs.unlinkSync(target)
  }
  fs.rmdirSync(dir)
}

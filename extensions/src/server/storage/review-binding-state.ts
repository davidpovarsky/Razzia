import fs from "node:fs"
import path from "node:path"
import { byteHash } from "./native-binding-fixture"

export function reviewBindingState(root: string) {
  const files: Record<string, unknown> = {}
  const walk = (relative: string) => {
    const file = path.join(root, relative)

    if (!fs.existsSync(file)) {
      return
    }

    const stat = fs.lstatSync(file, { bigint: true })

    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(file).sort()) {
        walk(`${relative}/${name}`)
      }
    } else {
      const bytes = fs.readFileSync(file)
      files[relative] = {
        dev: String(stat.dev),
        ino: String(stat.ino),
        mode: Number(stat.mode & 0o777n),
        sha256: byteHash(bytes),
        length: bytes.length,
        hex: bytes.toString("hex"),
      }
    }
  }
  for (const directory of ["quizz", "extensions", "media"]) {
    walk(directory)
  }

  return files
}

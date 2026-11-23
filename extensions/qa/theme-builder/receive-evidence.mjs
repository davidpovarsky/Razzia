// Stream the owned live tmpfs evidence to a new local file; no remote disk copy.
import { spawn } from "node:child_process"
import { createWriteStream, createReadStream, writeFileSync } from "node:fs"
import { pipeline } from "node:stream/promises"
import { createHash } from "node:crypto"
import { resolve } from "node:path"
const [, , name] = process.argv,
  output = resolve(process.argv[3] ?? "")

if (
  !/^tadazz-show-ui-E-[a-zA-Z0-9-]+$/u.test(name ?? "") ||
  (!output.startsWith(
    `${resolve("docs/extensions/qa-evidence/show-ui-20261115")}/`,
  ) &&
    !output.startsWith(
      `${resolve("docs/extensions/qa-evidence/show-ui-20261115")}\\`,
    ))
) {
  throw new Error("Invalid owned evidence destination")
}

const command = [
  "-o",
  "StrictHostKeyChecking=yes",
  "-o",
  "BatchMode=yes",
  "-i",
  "C:/Users/DAVID/.ssh/tadazz_oracle_2026",
  "ubuntu@132.145.25.168",
  `sudo -n docker exec ${name} tar -czf - -C /out .`,
]
const child = spawn("ssh", command, { stdio: ["ignore", "pipe", "inherit"] })
const exited = new Promise((accept, reject) => {
  child.on("error", reject)
  child.on("exit", (code) =>
    code === 0 ? accept() : reject(new Error(`SSH exit ${code}`)),
  )
})
await pipeline(child.stdout, createWriteStream(output, { flags: "wx" }))
await exited
const hash = createHash("sha256")
let bytes = 0
for await (const chunk of createReadStream(output)) {
  hash.update(chunk)
  bytes += chunk.length
}
const receipt = {
  container: name,
  output,
  bytes,
  sha256: hash.digest("hex"),
  receivedUtc: new Date().toISOString(),
  remoteArchiveWritten: false,
}
writeFileSync(`${output}.receipt.json`, JSON.stringify(receipt, null, 2), {
  flag: "wx",
})
process.stdout.write(`${JSON.stringify(receipt)}\n`)

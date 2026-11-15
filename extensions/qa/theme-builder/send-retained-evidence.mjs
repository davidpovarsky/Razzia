import { spawn } from "node:child_process"
import { createReadStream } from "node:fs"
import { pipeline } from "node:stream/promises"
const name = process.argv[2]
const custody = process.argv[4] ?? "retained11"
if (!/^tadazz-show-ui-E-[a-zA-Z0-9-]+$/u.test(name ?? ""))
  throw new Error("Invalid owned container")
if (!["retained11", "retained14", "retained16"].includes(custody))
  throw new Error("Invalid retained evidence namespace")
const child = spawn("ssh", [
  "-o", "StrictHostKeyChecking=yes", "-o", "BatchMode=yes",
  "-i", "C:/Users/DAVID/.ssh/tadazz_oracle_2026", "ubuntu@132.145.25.168",
  `sudo -n docker exec -i ${name} tar -xzf - -C /tmp/${custody}`,
], { stdio: ["pipe", "ignore", "inherit"] })
const completed = new Promise((resolve, reject) => {
  child.on("error", reject)
  child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`SSH exit ${code}`)))
})
await pipeline(createReadStream(process.argv[3]), child.stdin)
await completed

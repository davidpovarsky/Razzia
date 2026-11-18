// Pure evidence parser, not an application test or a replacement syscall tracer.
import fs from "node:fs"
const [traceFile, logFile, output] = process.argv.slice(2)
if (!traceFile || !logFile || !output)
  throw new Error("trace/log/output required")
const frames = fs
  .readFileSync(logFile, "utf8")
  .split("\n")
  .filter((line) => line.startsWith("{"))
  .map((line) => JSON.parse(line))
const begin = frames.find((frame) => frame.phase === "GET_BEGIN")
const end = frames.find((frame) => frame.phase === "GET_END")
if (!begin || !end || !begin.root.startsWith("/ram/tmp/tadazz-m3a-synthetic-"))
  throw new Error("Actual synthetic GET frames missing")
const lines = fs.readFileSync(traceFile, "utf8").split("\n")
const start = lines.findIndex((line) => line.includes("GET_BEGIN"))
const finish = lines.findIndex(
  (line, index) => index > start && line.includes("GET_END"),
)
if (start < 0 || finish < 0) throw new Error("Actual trace interval missing")
const interval = lines.slice(start + 1, finish)
const family = (line) =>
  line.includes(begin.root + "/tenants") ||
  line.includes(begin.root + "/native-sentinels")
const mutator =
  /\b(?:write|writev|pwrite64|pwritev|pwritev2|truncate|ftruncate|unlink|unlinkat|rename|renameat|renameat2|mkdir|mkdirat|rmdir|link|linkat|symlink|symlinkat|fallocate|msync|fsync|fdatasync|chmod|fchmod|fchmodat|chown|fchown|fchownat|utimensat)\(/u
const writeOpen = /\b(?:open|openat|creat)\(/u
const findings = interval.filter(
  (line) =>
    family(line) &&
    (mutator.test(line) ||
      (writeOpen.test(line) &&
        /O_(?:WRONLY|RDWR|CREAT|TRUNC|APPEND)/u.test(line)) ||
      (/\bmmap\(/u.test(line) &&
        line.includes("PROT_WRITE") &&
        line.includes("MAP_SHARED"))),
)
const receipt = {
  kind: "ACTUAL_GET_SYSCALL_INTERVAL_ANALYSIS",
  mode: begin.mode,
  intervalLines: interval.length,
  privateOrNativeLines: interval.filter(family).length,
  status: findings.length
    ? "FAIL_PRIVATE_OR_NATIVE_WRITE_ATTEMPT"
    : "NO_PRIVATE_OR_NATIVE_WRITE_SYSCALL_OBSERVED",
  findings,
  expectedHttpStatus: begin.expected,
  actualHttpStatus: end.status,
  snapshotEqual: end.snapshotEqual,
  accountAuthWalShmExcluded: true,
  osAccessTimesExcluded: true,
  limitation:
    "Observed traced child process interval only; no claim about other processes or unobserved mmap stores",
}
fs.writeFileSync(output, JSON.stringify(receipt, null, 2) + "\n")
if (findings.length || end.status !== begin.expected || !end.snapshotEqual)
  process.exit(1)

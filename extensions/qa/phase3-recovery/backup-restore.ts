import { createHash, randomUUID } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { DatabaseSync } from "node:sqlite"

export interface BackupEntry {
  relativePath: string
  bytes: number
  sha256: string
  kind: "file" | "sqlite"
}

export interface BackupManifest {
  version: 1
  kind: "tadazz-phase3-recovery-disposable-backup"
  createdAt: number
  accountsMode: "accounts" | "legacy-global-only"
  ownerIds: string[]
  totalBytes: number
  entries: BackupEntry[]
  manifestDigest: string
}

export interface CaptureBackupOptions {
  sourceRoot: string
  backupDir: string
  ownerIds: string[]
  accountsMode: "accounts" | "legacy-global-only"
  maxTotalBytes?: number
}

export interface RestoreBackupOptions {
  backupDir: string
  targetRoot: string
}

const DEFAULT_MAX_BACKUP_BYTES = 4 * 1024 * 1024
const UUID_PATTERN = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/iu
const HEX64_PATTERN = /^[a-f0-9]{64}$/u
const SQLITE_HEADER = "SQLite format 3\0"
const maybeNoFollow = Reflect.get(fs.constants, "O_NOFOLLOW")
const O_NOFOLLOW = typeof maybeNoFollow === "number" ? maybeNoFollow : 0

const FIXTURE_METADATA_BASENAMES = new Set([
  ".c1-fixture.json",
  ".c1-interrupted.json",
  ".phase3-recovery-fixture.json",
  ".recovery-checkpoint.json",
  ".process-fixture.json",
  ".process-boundary.json",
  ".native-fixture.json",
  ".native-interrupted.json",
])

function isFixtureMetadataFile(relativePath: string): boolean {
  if (FIXTURE_METADATA_BASENAMES.has(relativePath)) {
    return true
  }

  return /^\.(?:c1-recovery|recovery-startup|recovery-op|recovery-verify|process-recovery|native-recovery)-[A-Za-z0-9_-]+\.json$/u.test(
    relativePath,
  )
}

function sha256Buffer(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex")
}

function syncFileIfLinux(filePath: string): void {
  if (process.platform !== "linux") {
    return
  }

  const fd = fs.openSync(filePath, fs.constants.O_RDONLY | O_NOFOLLOW)

  try {
    fs.fsyncSync(fd)
  } finally {
    fs.closeSync(fd)
  }
}

function syncDirectoryIfLinux(directory: string): void {
  if (process.platform !== "linux") {
    return
  }

  const fd = fs.openSync(
    directory,
    fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | O_NOFOLLOW,
  )

  try {
    fs.fsyncSync(fd)
  } finally {
    fs.closeSync(fd)
  }
}

function ensureSafeDirectoryChain(
  rootDir: string,
  relativeParts: string[],
): string {
  if (fs.realpathSync(rootDir) !== path.resolve(rootDir)) {
    throw new Error(`Unsafe linked root directory: ${rootDir}`)
  }

  let current = path.resolve(rootDir)

  for (const part of relativeParts) {
    current = path.join(current, part)

    try {
      const stat = fs.lstatSync(current)

      if (stat.isSymbolicLink() || !stat.isDirectory()) {
        throw new Error(`Unsafe linked or non-directory path: ${current}`)
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error
      }

      fs.mkdirSync(current, { mode: 0o700 })
      syncDirectoryIfLinux(path.dirname(current))
    }
  }

  return current
}

export function assertSafeRelativePath(relativePath: string): string[] {
  if (
    typeof relativePath !== "string" ||
    relativePath.length === 0 ||
    relativePath.includes("\\") ||
    relativePath.includes(":") ||
    relativePath.includes("\0") ||
    relativePath.startsWith("/") ||
    relativePath.endsWith("/")
  ) {
    throw new Error(`Unsafe backup relative path: ${relativePath}`)
  }

  const parts = relativePath.split("/")

  if (parts.some((part) => !part || part === "." || part === "..")) {
    throw new Error(`Path traversal segment rejected: ${relativePath}`)
  }

  return parts
}

export function assertNoSymlinksInTree(rootDir: string): void {
  const resolvedRoot = path.resolve(rootDir)
  const rootStat = fs.lstatSync(resolvedRoot)

  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
    throw new Error(`Root is not a real directory: ${resolvedRoot}`)
  }

  if (fs.realpathSync(resolvedRoot) !== resolvedRoot) {
    throw new Error(`Root path contains symlinked ancestor: ${resolvedRoot}`)
  }

  const walk = (dir: string): void => {
    for (const name of fs.readdirSync(dir).sort()) {
      const fullPath = path.join(dir, name)
      const stat = fs.lstatSync(fullPath)

      if (stat.isSymbolicLink()) {
        throw new Error(`Symlink rejected in protected tree: ${fullPath}`)
      }

      if (stat.isDirectory()) {
        walk(fullPath)
      } else if (!stat.isFile()) {
        throw new Error(`Non-regular entry rejected: ${fullPath}`)
      }
    }
  }

  walk(resolvedRoot)
}

function readVerifiedRegularFile(filePath: string): Buffer {
  const before = fs.lstatSync(filePath, { bigint: true })

  if (before.isSymbolicLink() || !before.isFile()) {
    throw new Error(`Target is not a regular file: ${filePath}`)
  }

  if (process.platform === "linux" && before.nlink !== 1n) {
    throw new Error(`Unexpected hardlink count on file: ${filePath}`)
  }

  const fd = fs.openSync(filePath, fs.constants.O_RDONLY | O_NOFOLLOW)

  try {
    const opened = fs.fstatSync(fd, { bigint: true })

    if (opened.dev !== before.dev || opened.ino !== before.ino) {
      throw new Error(`File identity changed while opening: ${filePath}`)
    }

    return fs.readFileSync(fd)
  } finally {
    fs.closeSync(fd)
  }
}

function writeVerifiedExclusive(filePath: string, bytes: Buffer): void {
  const fd = fs.openSync(
    filePath,
    fs.constants.O_WRONLY |
      fs.constants.O_CREAT |
      fs.constants.O_EXCL |
      O_NOFOLLOW,
    0o600,
  )

  try {
    let offset = 0

    while (offset < bytes.length) {
      const written = fs.writeSync(fd, bytes, offset, bytes.length - offset)

      if (written <= 0) {
        throw new Error(`Short write to ${filePath}`)
      }

      offset += written
    }

    if (process.platform === "linux") {
      fs.fsyncSync(fd)
    }
  } finally {
    fs.closeSync(fd)
  }

  syncDirectoryIfLinux(path.dirname(filePath))
}

function assertSqliteIntegrity(
  sqlitePath: string,
  expectedOwners?: readonly string[],
): void {
  const header = Buffer.alloc(100)
  const fd = fs.openSync(sqlitePath, fs.constants.O_RDONLY | O_NOFOLLOW)

  try {
    if (fs.readSync(fd, header, 0, 100, 0) < 100) {
      throw new Error(`Truncated SQLite file: ${sqlitePath}`)
    }
  } finally {
    fs.closeSync(fd)
  }

  if (header.subarray(0, 16).toString("binary") !== SQLITE_HEADER) {
    throw new Error(`Invalid SQLite header in ${sqlitePath}`)
  }

  const db = new DatabaseSync(sqlitePath, { readOnly: true, timeout: 3000 })

  try {
    const quick = db.prepare("PRAGMA quick_check").all() as Array<{
      quick_check?: string
    }>

    if (quick.some((row) => row.quick_check !== "ok")) {
      throw new Error(`SQLite quick_check failed for ${sqlitePath}`)
    }

    if (expectedOwners) {
      const schema = db
        .prepare(
          "SELECT type FROM sqlite_schema WHERE name='accounts' AND type='table'",
        )
        .all()

      if (schema.length !== 1) {
        throw new Error(`Missing accounts table in ${sqlitePath}`)
      }

      const rows = db.prepare("SELECT id FROM accounts").all() as Array<{
        id?: unknown
      }>
      const actualIds = rows.map((row) => String(row.id)).sort()
      const expectedSorted = [...expectedOwners].sort()

      if (JSON.stringify(actualIds) !== JSON.stringify(expectedSorted)) {
        throw new Error(
          `Backed-up accounts mismatch: expected ${expectedSorted.join(",")}, got ${actualIds.join(",")}`,
        )
      }
    }
  } finally {
    db.close()
  }
}

function assertNoPendingRecoveryState(sourceRoot: string): void {
  const walk = (dir: string, relPrefix: string): void => {
    for (const name of fs.readdirSync(dir).sort()) {
      const rel = relPrefix ? `${relPrefix}/${name}` : name

      if (isFixtureMetadataFile(rel)) {
        continue
      }

      const fullPath = path.join(dir, name)
      const stat = fs.lstatSync(fullPath)

      if (stat.isSymbolicLink()) {
        throw new Error(`Symlink rejected in backup source: ${fullPath}`)
      }

      if (stat.isDirectory()) {
        if (
          rel.startsWith(".tadazz-creation-v1/") &&
          (path.basename(path.dirname(rel)) === "active" ||
            path.basename(path.dirname(rel)) === "resolved")
        ) {
          throw new Error(
            `Refusing backup with pending C1 creation slot: ${rel}`,
          )
        }

        walk(fullPath, rel)

        continue
      }

      if (
        name.endsWith(".journal.json") ||
        name.endsWith(".media-journal.json")
      ) {
        throw new Error(`Refusing backup with pending journal: ${rel}`)
      }

      if (
        (rel.startsWith(".tadazz-creation-operations-v1/") ||
          rel.includes("/.tadazz-creation-operations-v1/")) &&
        name === "operation.json"
      ) {
        let parsed: { phase?: unknown } = {}

        try {
          parsed = JSON.parse(
            readVerifiedRegularFile(fullPath).toString("utf8"),
          ) as { phase?: unknown }
        } catch (error) {
          throw new Error(
            `Refusing backup with corrupt C1 operation ${rel}: ${error instanceof Error ? error.message : String(error)}`,
          )
        }

        if (parsed.phase !== "committed") {
          throw new Error(
            `Refusing backup with unresolved C1 operation (${String(parsed.phase)}): ${rel}`,
          )
        }
      }

      if (name.endsWith(".sqlite-journal") && stat.size > 0) {
        throw new Error(
          `Refusing backup with active SQLite rollback journal: ${rel}`,
        )
      }
    }
  }

  walk(sourceRoot, "")
}

function computeManifestDigest(
  payload: Omit<BackupManifest, "manifestDigest" | "createdAt">,
): string {
  return sha256Buffer(JSON.stringify(payload))
}

function listTreeFiles(
  rootDir: string,
  skipFixtureMetadata: boolean,
): string[] {
  const files: string[] = []

  const walk = (dir: string, prefix: string): void => {
    for (const name of fs.readdirSync(dir).sort()) {
      const rel = prefix ? `${prefix}/${name}` : name

      if (skipFixtureMetadata && isFixtureMetadataFile(rel)) {
        continue
      }

      const fullPath = path.join(dir, name)
      const stat = fs.lstatSync(fullPath)

      if (stat.isSymbolicLink()) {
        throw new Error(`Symlink rejected while scanning ${fullPath}`)
      }

      if (stat.isDirectory()) {
        walk(fullPath, rel)
      } else if (stat.isFile()) {
        files.push(rel)
      } else {
        throw new Error(`Non-regular entry rejected: ${fullPath}`)
      }
    }
  }

  walk(rootDir, "")

  return files.sort()
}

function snapshotSqliteFile(
  sourceFile: string,
  destinationFile: string,
): Buffer {
  const db = new DatabaseSync(sourceFile, { readOnly: true, timeout: 3000 })

  try {
    db.prepare("VACUUM INTO ?").run(destinationFile)
  } finally {
    db.close()
  }

  syncFileIfLinux(destinationFile)
  syncDirectoryIfLinux(path.dirname(destinationFile))
  assertSqliteIntegrity(destinationFile)

  return readVerifiedRegularFile(destinationFile)
}

export function captureVerifiedBackup(
  options: CaptureBackupOptions,
): BackupManifest {
  const sourceRoot = path.resolve(options.sourceRoot)
  const backupDir = path.resolve(options.backupDir)
  const maxTotalBytes = options.maxTotalBytes ?? DEFAULT_MAX_BACKUP_BYTES

  if (
    backupDir === sourceRoot ||
    backupDir.startsWith(`${sourceRoot}${path.sep}`)
  ) {
    throw new Error("Backup directory must be outside the source root")
  }

  assertNoSymlinksInTree(sourceRoot)
  assertNoSymlinksInTree(backupDir)
  assertNoPendingRecoveryState(sourceRoot)

  if (fs.readdirSync(backupDir).length > 0) {
    throw new Error(`Backup directory must be empty: ${backupDir}`)
  }

  for (const ownerId of options.ownerIds) {
    if (!UUID_PATTERN.test(ownerId)) {
      throw new Error(`Invalid owner UUID in backup request: ${ownerId}`)
    }
  }

  const payloadDir = path.join(backupDir, "payload")
  fs.mkdirSync(payloadDir, { mode: 0o700 })
  syncDirectoryIfLinux(backupDir)

  const sourceFiles = listTreeFiles(sourceRoot, true)
  const sqliteSet = new Set(
    sourceFiles.filter((file) => file.endsWith(".sqlite")),
  )
  const entries: BackupEntry[] = []
  let totalBytes = 0

  for (const rel of sourceFiles) {
    if (
      (rel.endsWith("-wal") || rel.endsWith("-shm")) &&
      sqliteSet.has(rel.slice(0, -4))
    ) {
      continue
    }

    if (rel.endsWith("-journal") && sqliteSet.has(rel.slice(0, -8))) {
      continue
    }

    const parts = assertSafeRelativePath(rel)
    const srcPath = path.join(sourceRoot, ...parts)
    const dstParent = ensureSafeDirectoryChain(payloadDir, parts.slice(0, -1))
    const dstPath = path.join(dstParent, parts[parts.length - 1])
    const kind: "file" | "sqlite" = rel.endsWith(".sqlite") ? "sqlite" : "file"
    const bytes =
      kind === "sqlite"
        ? snapshotSqliteFile(srcPath, dstPath)
        : (() => {
            const raw = readVerifiedRegularFile(srcPath)
            writeVerifiedExclusive(dstPath, raw)

            return raw
          })()

    totalBytes += bytes.length

    if (totalBytes > maxTotalBytes) {
      throw new Error(
        `Backup size ${totalBytes} exceeds bounded limit ${maxTotalBytes}`,
      )
    }

    entries.push({
      relativePath: rel,
      bytes: bytes.length,
      sha256: sha256Buffer(bytes),
      kind,
    })
  }

  entries.sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath),
  )

  const manifestCore = {
    version: 1 as const,
    kind: "tadazz-phase3-recovery-disposable-backup" as const,
    accountsMode: options.accountsMode,
    ownerIds: [...options.ownerIds],
    totalBytes,
    entries,
  }
  const manifest: BackupManifest = {
    ...manifestCore,
    createdAt: Date.now(),
    manifestDigest: computeManifestDigest(manifestCore),
  }

  writeVerifiedExclusive(
    path.join(backupDir, "backup-manifest.json"),
    Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8"),
  )

  return verifyBackupBundle(backupDir)
}

function validateManifestShape(raw: unknown): BackupManifest {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Invalid backup manifest object")
  }

  const {
    version,
    kind,
    createdAt,
    accountsMode,
    ownerIds,
    entries: rawEntries,
    totalBytes,
    manifestDigest,
  } = raw as Record<string, unknown>

  if (
    version !== 1 ||
    kind !== "tadazz-phase3-recovery-disposable-backup" ||
    typeof createdAt !== "number" ||
    !Number.isSafeInteger(createdAt) ||
    (accountsMode !== "accounts" && accountsMode !== "legacy-global-only") ||
    !Array.isArray(ownerIds) ||
    !Array.isArray(rawEntries) ||
    rawEntries.length === 0 ||
    typeof totalBytes !== "number" ||
    !Number.isSafeInteger(totalBytes) ||
    typeof manifestDigest !== "string" ||
    !HEX64_PATTERN.test(manifestDigest)
  ) {
    throw new Error("Malformed or incomplete backup manifest metadata")
  }

  const validatedOwnerIds: string[] = []

  for (const ownerId of ownerIds as unknown[]) {
    if (typeof ownerId !== "string" || !UUID_PATTERN.test(ownerId)) {
      throw new Error(`Invalid owner ID in backup manifest: ${String(ownerId)}`)
    }

    validatedOwnerIds.push(ownerId)
  }

  const validatedEntries: BackupEntry[] = []
  let computedTotal = 0

  for (const rawEntry of rawEntries as unknown[]) {
    if (!rawEntry || typeof rawEntry !== "object" || Array.isArray(rawEntry)) {
      throw new Error("Malformed backup manifest entry")
    }

    const entry = rawEntry as Record<string, unknown>

    if (
      typeof entry.relativePath !== "string" ||
      typeof entry.bytes !== "number" ||
      !Number.isSafeInteger(entry.bytes) ||
      entry.bytes < 0 ||
      typeof entry.sha256 !== "string" ||
      !HEX64_PATTERN.test(entry.sha256) ||
      (entry.kind !== "file" && entry.kind !== "sqlite")
    ) {
      throw new Error("Malformed backup manifest entry")
    }

    assertSafeRelativePath(entry.relativePath)
    computedTotal += entry.bytes
    validatedEntries.push({
      relativePath: entry.relativePath,
      bytes: entry.bytes,
      sha256: entry.sha256,
      kind: entry.kind,
    })
  }

  if (computedTotal !== totalBytes) {
    throw new Error("Backup manifest totalBytes mismatch")
  }

  if (
    accountsMode === "accounts" &&
    !validatedEntries.some(
      (entry) => entry.relativePath === "tadazz-accounts.sqlite",
    )
  ) {
    throw new Error("Incomplete backup: missing tadazz-accounts.sqlite")
  }

  const expectedDigest = computeManifestDigest({
    version,
    kind,
    accountsMode,
    ownerIds: validatedOwnerIds,
    totalBytes,
    entries: validatedEntries,
  })

  if (expectedDigest !== manifestDigest) {
    throw new Error("Backup manifest integrity digest mismatch")
  }

  return {
    version,
    kind,
    createdAt,
    accountsMode,
    ownerIds: validatedOwnerIds,
    totalBytes,
    entries: validatedEntries,
    manifestDigest,
  }
}

export function verifyBackupBundle(backupDirInput: string): BackupManifest {
  const backupDir = path.resolve(backupDirInput)

  assertNoSymlinksInTree(backupDir)

  const manifestFile = path.join(backupDir, "backup-manifest.json")

  if (!fs.existsSync(manifestFile)) {
    throw new Error("Incomplete backup: missing backup-manifest.json")
  }

  const parsedManifest = JSON.parse(
    readVerifiedRegularFile(manifestFile).toString("utf8"),
  ) as unknown
  const manifest = validateManifestShape(parsedManifest)

  const payloadDir = path.join(backupDir, "payload")

  if (
    !fs.existsSync(payloadDir) ||
    fs.lstatSync(payloadDir).isSymbolicLink() ||
    !fs.lstatSync(payloadDir).isDirectory()
  ) {
    throw new Error("Incomplete backup: missing payload directory")
  }

  const actualFiles = listTreeFiles(payloadDir, false)
  const expectedFiles = manifest.entries.map((e) => e.relativePath).sort()

  if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) {
    throw new Error(
      `Incomplete or unexpected files in backup payload: expected ${expectedFiles.length}, got ${actualFiles.length}`,
    )
  }

  for (const entry of manifest.entries) {
    const parts = assertSafeRelativePath(entry.relativePath)
    const entryPath = path.join(payloadDir, ...parts)
    const bytes = readVerifiedRegularFile(entryPath)

    if (bytes.length !== entry.bytes) {
      throw new Error(
        `Backup byte length mismatch for ${entry.relativePath}: expected ${entry.bytes}, got ${bytes.length}`,
      )
    }

    if (sha256Buffer(bytes) !== entry.sha256) {
      throw new Error(`Backup checksum mismatch for ${entry.relativePath}`)
    }

    if (entry.kind === "sqlite") {
      assertSqliteIntegrity(
        entryPath,
        entry.relativePath === "tadazz-accounts.sqlite"
          ? manifest.ownerIds
          : undefined,
      )
    }
  }

  return manifest
}

export function restoreBackupToDisposableRoot(
  options: RestoreBackupOptions,
): BackupManifest {
  const backupDir = path.resolve(options.backupDir)
  const targetRoot = path.resolve(options.targetRoot)
  const manifest = verifyBackupBundle(backupDir)

  assertNoSymlinksInTree(targetRoot)

  for (const reserved of [
    "quizz",
    "extensions",
    "tenants",
    "media",
    "tadazz-accounts.sqlite",
    ".tadazz-creation-v1",
    ".tadazz-creation-operations-v1",
  ]) {
    if (fs.existsSync(path.join(targetRoot, reserved))) {
      throw new Error(
        `Disposable restore root is not clean; found existing ${reserved}`,
      )
    }
  }

  const payloadDir = path.join(backupDir, "payload")

  for (const entry of manifest.entries) {
    const parts = assertSafeRelativePath(entry.relativePath)
    const srcPath = path.join(payloadDir, ...parts)
    const dstParent = ensureSafeDirectoryChain(targetRoot, parts.slice(0, -1))
    const dstPath = path.join(dstParent, parts[parts.length - 1])
    const bytes = readVerifiedRegularFile(srcPath)

    writeVerifiedExclusive(dstPath, bytes)

    const restoredBytes = readVerifiedRegularFile(dstPath)

    if (
      restoredBytes.length !== entry.bytes ||
      sha256Buffer(restoredBytes) !== entry.sha256
    ) {
      throw new Error(
        `Restored checksum verification failed for ${entry.relativePath}`,
      )
    }
  }

  return manifest
}

function removeEmptySubdirectories(dir: string, rootDir: string): void {
  for (const name of fs.readdirSync(dir)) {
    const child = path.join(dir, name)

    if (fs.lstatSync(child).isDirectory()) {
      removeEmptySubdirectories(child, rootDir)
    }
  }

  if (dir !== rootDir && fs.readdirSync(dir).length === 0) {
    fs.rmdirSync(dir)
    syncDirectoryIfLinux(path.dirname(dir))
  }
}

export function rollbackSyntheticRootFromBackup(
  options: RestoreBackupOptions,
): BackupManifest {
  const backupDir = path.resolve(options.backupDir)
  const targetRoot = path.resolve(options.targetRoot)
  const manifest = verifyBackupBundle(backupDir)

  assertNoSymlinksInTree(targetRoot)

  const stageDirName = `.phase3-rollback-stage-${randomUUID()}`
  const stageDir = path.join(targetRoot, stageDirName)

  fs.mkdirSync(stageDir, { mode: 0o700 })
  syncDirectoryIfLinux(targetRoot)

  const payloadDir = path.join(backupDir, "payload")
  const manifestPaths = new Set(
    manifest.entries.map((entry) => entry.relativePath),
  )

  try {
    for (const entry of manifest.entries) {
      const parts = assertSafeRelativePath(entry.relativePath)
      const srcPath = path.join(payloadDir, ...parts)
      const stageParent = ensureSafeDirectoryChain(stageDir, parts.slice(0, -1))
      const stageFile = path.join(stageParent, parts[parts.length - 1])
      const bytes = readVerifiedRegularFile(srcPath)

      writeVerifiedExclusive(stageFile, bytes)

      const stagedBytes = readVerifiedRegularFile(stageFile)

      if (
        stagedBytes.length !== entry.bytes ||
        sha256Buffer(stagedBytes) !== entry.sha256
      ) {
        throw new Error(
          `Staged rollback verification failed for ${entry.relativePath}`,
        )
      }
    }

    for (const entry of manifest.entries) {
      const parts = assertSafeRelativePath(entry.relativePath)
      const stageFile = path.join(stageDir, ...parts)
      const dstParent = ensureSafeDirectoryChain(targetRoot, parts.slice(0, -1))
      const dstPath = path.join(dstParent, parts[parts.length - 1])

      if (entry.kind === "sqlite") {
        for (const suffix of ["-wal", "-shm", "-journal"]) {
          const sidecarPath = `${dstPath}${suffix}`

          if (fs.existsSync(sidecarPath)) {
            fs.unlinkSync(sidecarPath)
          }
        }
      }

      fs.renameSync(stageFile, dstPath)
      syncDirectoryIfLinux(dstParent)
    }

    for (const currentRel of listTreeFiles(targetRoot, true)) {
      if (currentRel.startsWith(`${stageDirName}/`)) {
        continue
      }

      if (!manifestPaths.has(currentRel)) {
        const parts = assertSafeRelativePath(currentRel)
        const extraPath = path.join(targetRoot, ...parts)

        fs.unlinkSync(extraPath)
        syncDirectoryIfLinux(path.dirname(extraPath))
      }
    }

    removeEmptySubdirectories(targetRoot, targetRoot)
  } finally {
    if (fs.existsSync(stageDir)) {
      fs.rmSync(stageDir, { recursive: true, force: true })
      syncDirectoryIfLinux(targetRoot)
    }
  }

  for (const entry of manifest.entries) {
    const parts = assertSafeRelativePath(entry.relativePath)
    const verified = readVerifiedRegularFile(path.join(targetRoot, ...parts))

    if (
      verified.length !== entry.bytes ||
      sha256Buffer(verified) !== entry.sha256
    ) {
      throw new Error(
        `Post-rollback checksum mismatch for ${entry.relativePath}`,
      )
    }
  }

  return manifest
}

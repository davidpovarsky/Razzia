import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from "node:crypto"
import {
  constants,
  closeSync,
  existsSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs"
import { isAbsolute, join, resolve } from "node:path"
import {
  GATEWAY_KEY_PURPOSE,
  type GatewayPrivateKeyPort,
  type GatewayTarget,
} from "./contracts"
import { deny, digest, exact, id, object, scopeText, target } from "./codec"

export const PRIVATE_RECORD_SPEC = Object.freeze({
  call: Object.freeze({
    purpose: "tadazz-phone-call-precommit-v1",
    marker: "TADAZZ_PHONE_CALL_PRECOMMIT_V1",
    content: "private-call-precommit-v1\n",
  }),
  operation: Object.freeze({
    purpose: "tadazz-phone-operation-precommit-v1",
    marker: "TADAZZ_PHONE_OPERATION_PRECOMMIT_V1",
    content: "private-operation-precommit-v1\n",
  }),
})
export interface ImmutableRecordOptions {
  enabled?: boolean
  root: string
  installationId: string
  keyId: string
  target: GatewayTarget
  key: GatewayPrivateKeyPort
  kind: keyof typeof PRIVATE_RECORD_SPEC
  expectedText: string
}
type Stamp = { dev: number; ino: number }
export interface ImmutableRecord {
  body: unknown
  stamp: Stamp
  ciphertextHash: string
}
const same = (a: Stamp, b: Stamp) => a.dev === b.dev && a.ino === b.ino
function authorize(check: () => void) {
  if ((check() as unknown) !== undefined) deny()
}

// Internal file primitive. Callers supply real synchronous reauthorization, never
// a callback with a service secret. This class grants no permission from a file.
export class PrivateImmutableRecord {
  private readonly root: string
  private readonly installation: string
  private readonly keyId: string
  private readonly scope: GatewayTarget
  private readonly spec: (typeof PRIVATE_RECORD_SPEC)[keyof typeof PRIVATE_RECORD_SPEC]
  private readonly kind: "call" | "operation"
  private readonly expected: string
  private rootStamp?: Stamp
  private poisoned = false
  constructor(private readonly options: ImmutableRecordOptions) {
    if (
      options.enabled !== true ||
      !isAbsolute(options.root) ||
      resolve(options.root) !== options.root ||
      !["call", "operation"].includes(options.kind) ||
      typeof options.expectedText !== "string" ||
      options.expectedText.length > 4096
    )
      deny()
    this.root = options.root
    this.installation = id(options.installationId)
    this.keyId = id(options.keyId)
    this.scope = target(options.target)
    this.kind = options.kind
    this.spec = PRIVATE_RECORD_SPEC[options.kind]
    this.expected = options.expectedText
  }
  private path(suffix: string) {
    return join(this.root, this.kind + suffix)
  }
  private stat(path: string) {
    const stat = lstatSync(path)
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      stat.nlink !== 1 ||
      (stat.mode & 0o077) !== 0 ||
      stat.size > 16384
    )
      deny()
    return stat
  }
  private readFile(path: string) {
    const before = this.stat(path),
      fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW)
    try {
      if (!same(before, fstatSync(fd))) deny()
      const bytes = readFileSync(fd)
      if (bytes.length > 16384 || !same(before, this.stat(path))) {
        bytes.fill(0)
        deny()
      }
      return { bytes, stamp: { dev: before.dev, ino: before.ino } }
    } finally {
      try {
        closeSync(fd)
      } catch {
        this.poisoned = true
        deny()
      }
    }
  }
  private rootCheck() {
    if (this.poisoned || !constants.O_NOFOLLOW) deny()
    const stat = lstatSync(this.root)
    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      (stat.mode & 0o077) !== 0 ||
      realpathSync(this.root) !== this.root ||
      (this.rootStamp && !same(stat, this.rootStamp))
    )
      deny()
    this.rootStamp = { dev: stat.dev, ino: stat.ino }
    const marker = this.readFile(join(this.root, this.spec.marker))
    try {
      if (marker.bytes.toString() !== this.spec.content) deny()
    } finally {
      marker.bytes.fill(0)
    }
  }
  private noUncertainty() {
    if (existsSync(this.path(".writer-lock")) || existsSync(this.path(".next")))
      deny()
  }
  private syncDir() {
    const fd = openSync(
      this.root,
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
    )
    try {
      fsyncSync(fd)
    } finally {
      try {
        closeSync(fd)
      } catch {
        this.poisoned = true
        deny()
      }
    }
  }
  private withKey<T>(work: (key: Buffer) => T): T {
    const handle = this.options.key.open()
    let key: Buffer | undefined
    try {
      if (
        !handle ||
        "then" in handle ||
        handle.purpose !== GATEWAY_KEY_PURPOSE ||
        handle.installationId !== this.installation ||
        handle.keyId !== this.keyId ||
        !Buffer.isBuffer(handle.bytes) ||
        handle.bytes.length !== 32 ||
        typeof handle.close !== "function"
      )
        deny()
      key = Buffer.from(
        hkdfSync(
          "sha256",
          handle.bytes,
          Buffer.from(digest(scopeText(this.scope))),
          Buffer.from(
            JSON.stringify([
              this.spec.purpose,
              this.installation,
              this.keyId,
              this.expected,
            ]),
          ),
          32,
        ),
      )
      return work(key)
    } finally {
      key?.fill(0)
      try {
        if (
          typeof handle?.close !== "function" ||
          (handle.close() as unknown) !== undefined
        )
          deny()
      } catch {
        this.poisoned = true
        deny()
      } finally {
        if (Buffer.isBuffer(handle?.bytes)) handle.bytes.fill(0)
      }
    }
  }
  private aad() {
    return Buffer.from(
      JSON.stringify([
        this.spec.purpose,
        this.installation,
        this.keyId,
        scopeText(this.scope),
        this.expected,
      ]),
    )
  }
  private seal(key: Buffer, body: unknown) {
    object(body)
    const iv = randomBytes(12),
      cipher = createCipheriv("aes-256-gcm", key, iv),
      plain = Buffer.from(JSON.stringify(body))
    if (plain.length > 7000) {
      plain.fill(0)
      deny()
    }
    try {
      cipher.setAAD(this.aad())
      const data = Buffer.concat([cipher.update(plain), cipher.final()])
      return Buffer.from(
        JSON.stringify({
          schema: 1,
          iv: iv.toString("hex"),
          tag: cipher.getAuthTag().toString("hex"),
          data: data.toString("hex"),
        }) + "\n",
      )
    } finally {
      plain.fill(0)
    }
  }
  private barrier() {
    this.poisoned = true
    try {
      if (!existsSync(this.path(".writer-lock"))) {
        const fd = openSync(this.path(".writer-lock"), "wx", 0o600)
        try {
          writeFileSync(fd, "uncertain immutable precommit\n")
          fsyncSync(fd)
        } finally {
          closeSync(fd)
        }
        this.syncDir()
      }
    } catch {
      /* No automatic repair. */
    }
  }
  prepare(makeBody: () => unknown, check: () => void): void {
    let lock: number | undefined,
      committed = false
    try {
      authorize(check)
      this.rootCheck()
      this.noUncertainty()
      if (
        existsSync(this.path(".initialized")) ||
        existsSync(this.path(".enc"))
      )
        deny()
      lock = openSync(this.path(".writer-lock"), "wx", 0o600)
      writeFileSync(lock, "explicit immutable precommit\n")
      fsyncSync(lock)
      this.syncDir()
      this.withKey((key) => {
        authorize(check)
        const marker = openSync(this.path(".initialized"), "wx", 0o600)
        try {
          writeFileSync(marker, this.spec.content)
          fsyncSync(marker)
        } finally {
          closeSync(marker)
        }
        this.syncDir()
        const bytes = this.seal(key, makeBody()),
          fd = openSync(this.path(".next"), "wx", 0o600)
        try {
          writeFileSync(fd, bytes)
          fsyncSync(fd)
        } finally {
          bytes.fill(0)
          closeSync(fd)
        }
        authorize(check)
        renameSync(this.path(".next"), this.path(".enc"))
        this.syncDir()
        committed = true
        authorize(check)
      })
    } catch {
      deny()
    } finally {
      if (lock !== undefined) {
        try {
          closeSync(lock)
          if (committed && !this.poisoned) {
            unlinkSync(this.path(".writer-lock"))
            this.syncDir()
          }
        } catch {
          this.barrier()
          deny()
        }
        if (!committed || this.poisoned) {
          this.barrier()
          deny()
        }
      }
    }
  }
  read(check: () => void): ImmutableRecord {
    try {
      authorize(check)
      this.rootCheck()
      this.noUncertainty()
      return this.withKey((key) => {
        const initialized = this.readFile(this.path(".initialized"))
        try {
          if (initialized.bytes.toString() !== this.spec.content) deny()
        } finally {
          initialized.bytes.fill(0)
        }
        const file = this.readFile(this.path(".enc"))
        let plain: Buffer | undefined
        try {
          const row = exact(JSON.parse(file.bytes.toString()), [
            "schema",
            "iv",
            "tag",
            "data",
          ])
          if (
            row.schema !== 1 ||
            typeof row.iv !== "string" ||
            !/^[a-f0-9]{24}$/u.test(row.iv) ||
            typeof row.tag !== "string" ||
            !/^[a-f0-9]{32}$/u.test(row.tag) ||
            typeof row.data !== "string" ||
            !/^(?:[a-f0-9]{2})+$/u.test(row.data)
          )
            deny()
          const decipher = createDecipheriv(
            "aes-256-gcm",
            key,
            Buffer.from(row.iv, "hex"),
          )
          decipher.setAAD(this.aad())
          decipher.setAuthTag(Buffer.from(row.tag, "hex"))
          plain = Buffer.concat([
            decipher.update(Buffer.from(row.data, "hex")),
            decipher.final(),
          ])
          const body = object(JSON.parse(plain.toString()))
          authorize(check)
          this.noUncertainty()
          return {
            body,
            stamp: file.stamp,
            ciphertextHash: digest(file.bytes.toString()),
          }
        } finally {
          file.bytes.fill(0)
          plain?.fill(0)
        }
      })
    } catch {
      return deny()
    }
  }
  assertUnchanged(record: ImmutableRecord, check: () => void) {
    try {
      authorize(check)
      this.rootCheck()
      this.noUncertainty()
      const file = this.readFile(this.path(".enc"))
      try {
        if (
          !same(file.stamp, record.stamp) ||
          digest(file.bytes.toString()) !== record.ciphertextHash
        )
          deny()
      } finally {
        file.bytes.fill(0)
      }
    } catch {
      deny()
    }
  }
}

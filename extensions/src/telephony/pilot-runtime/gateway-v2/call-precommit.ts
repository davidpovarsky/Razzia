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
import { normalizePhoneE164 } from "@razzia/extensions/core"
import type {
  Receipt,
  RegistrationInput,
} from "../../../server/phone-lifecycle-v2/contracts"
import { registrationReceipt } from "./adapter"
import {
  GATEWAY_KEY_PURPOSE,
  type GatewayBinding,
  type GatewayPrivateKeyPort,
  type GatewayRegistrationDispatcher,
  type GatewayTarget,
} from "./contracts"
import {
  binding,
  credential,
  deny,
  digest,
  exact,
  id,
  immutableText,
  integer,
  scopeText,
  target,
} from "./codec"

export const CALL_PRECOMMIT_PURPOSE = "tadazz-phone-call-precommit-v1"
export const CALL_PRECOMMIT_MARKER = "TADAZZ_PHONE_CALL_PRECOMMIT_V1"
export const CALL_PRECOMMIT_CONTENT = "private-call-precommit-v1\n"
export interface GatewayCallAttempt {
  readonly requestId: string
  readonly providerReference: string
  readonly phone: string
  readonly expectedPredecessor: number
}
export interface GatewayCallPrecommitOptions {
  readonly enabled?: boolean
  readonly root: string
  readonly installationId: string
  readonly keyId: string
  readonly target: GatewayTarget
  readonly key: GatewayPrivateKeyPort
  readonly dispatcher: GatewayRegistrationDispatcher
  readonly attempt: GatewayCallAttempt
}
type Stamp = { dev: number; ino: number }
interface StoredCall {
  binding: GatewayBinding
  input: RegistrationInput
  stamp: Stamp
  ciphertextHash: string
}
const sameStamp = (a: Stamp, b: Stamp) => a.dev === b.dev && a.ino === b.ino
const attemptText = (value: GatewayCallAttempt) =>
  JSON.stringify([
    value.requestId,
    value.providerReference,
    value.phone,
    value.expectedPredecessor,
  ])
function attempt(input: unknown): GatewayCallAttempt {
  const row = exact(input, [
    "requestId",
    "providerReference",
    "phone",
    "expectedPredecessor",
  ])
  const phone =
    typeof row.phone === "string" ? normalizePhoneE164(row.phone) : null
  if (!phone) deny()
  const predecessor = integer(row.expectedPredecessor)
  if (predecessor >= Number.MAX_SAFE_INTEGER) deny()
  return Object.freeze({
    requestId: id(row.requestId),
    providerReference: id(row.providerReference),
    phone,
    expectedPredecessor: predecessor,
  })
}

// One immutable call tuple per separately injected root. This is not a provider
// identity verifier, operation executor or recovery/permission cache.
export class PrivateCallPrecommit {
  private readonly root: string
  private readonly installation: string
  private readonly keyId: string
  private readonly scope: GatewayTarget
  private readonly expected: GatewayCallAttempt
  private rootStamp?: Stamp
  private poisoned = false
  constructor(private readonly options: GatewayCallPrecommitOptions) {
    if (
      options.enabled !== true ||
      !isAbsolute(options.root) ||
      resolve(options.root) !== options.root
    )
      deny()
    this.root = options.root
    this.installation = id(options.installationId)
    this.keyId = id(options.keyId)
    this.scope = target(options.target)
    this.expected = attempt(options.attempt)
  }
  private path(name: string) {
    return join(this.root, name)
  }
  private current(): GatewayBinding {
    const value = binding(this.options.dispatcher.current())
    if (
      scopeText(value) !== scopeText(this.scope) ||
      value.expiresAt <= Date.now()
    )
      deny()
    return value
  }
  private matches(stored: GatewayBinding): GatewayBinding {
    const current = this.current()
    if (
      immutableText(stored) !== immutableText(current) ||
      stored.version > current.version
    )
      deny()
    return current
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
  private readFile(name: string) {
    const path = this.path(name),
      before = this.stat(path)
    const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW)
    try {
      if (!sameStamp(before, fstatSync(fd))) deny()
      const bytes = readFileSync(fd)
      if (bytes.length > 16384 || !sameStamp(before, this.stat(path))) {
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
  private checkRoot() {
    if (this.poisoned || !constants.O_NOFOLLOW) deny()
    const stat = lstatSync(this.root)
    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      (stat.mode & 0o077) !== 0 ||
      realpathSync(this.root) !== this.root ||
      (this.rootStamp && !sameStamp(stat, this.rootStamp))
    )
      deny()
    this.rootStamp = { dev: stat.dev, ino: stat.ino }
    const marker = this.readFile(CALL_PRECOMMIT_MARKER)
    try {
      if (marker.bytes.toString() !== CALL_PRECOMMIT_CONTENT) deny()
    } finally {
      marker.bytes.fill(0)
    }
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
  private noUncertainty() {
    if (
      existsSync(this.path("call.writer-lock")) ||
      existsSync(this.path("call.next"))
    )
      deny()
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
              CALL_PRECOMMIT_PURPOSE,
              this.installation,
              this.keyId,
              attemptText(this.expected),
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
        CALL_PRECOMMIT_PURPOSE,
        this.installation,
        this.keyId,
        scopeText(this.scope),
        attemptText(this.expected),
      ]),
    )
  }
  private seal(key: Buffer, value: GatewayBinding, input: RegistrationInput) {
    const iv = randomBytes(12),
      cipher = createCipheriv("aes-256-gcm", key, iv)
    cipher.setAAD(this.aad())
    const plain = Buffer.from(
      JSON.stringify({ schema: 1, binding: value, input }),
    )
    try {
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
  private decode(key: Buffer): StoredCall {
    const installed = this.readFile("call.initialized")
    try {
      if (installed.bytes.toString() !== CALL_PRECOMMIT_CONTENT) deny()
    } finally {
      installed.bytes.fill(0)
    }
    const file = this.readFile("call.enc")
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
      const payload = exact(JSON.parse(plain.toString()), [
        "schema",
        "binding",
        "input",
      ])
      if (payload.schema !== 1) deny()
      const value = binding(payload.binding),
        body = exact(payload.input, [
          "requestId",
          "providerReference",
          "phone",
          "expectedPredecessor",
          "capability",
        ])
      const input = Object.freeze({
        ...attempt({
          requestId: body.requestId,
          providerReference: body.providerReference,
          phone: body.phone,
          expectedPredecessor: body.expectedPredecessor,
        }),
        capability: credential(body.capability),
      })
      if (input.phone !== body.phone) deny() // Stored canonical identity must not silently change on reopen.
      if (attemptText(input) !== attemptText(this.expected)) deny()
      this.matches(value)
      return {
        binding: value,
        input,
        stamp: file.stamp,
        ciphertextHash: digest(file.bytes.toString()),
      }
    } finally {
      file.bytes.fill(0)
      plain?.fill(0)
    }
  }
  private barrier() {
    this.poisoned = true
    try {
      if (!existsSync(this.path("call.writer-lock"))) {
        const fd = openSync(this.path("call.writer-lock"), "wx", 0o600)
        try {
          writeFileSync(fd, "uncertain call precommit\n")
          fsyncSync(fd)
        } finally {
          closeSync(fd)
        }
        this.syncDir()
      }
    } catch {
      /* No automatic reconciliation; poisoned instance denies. */
    }
  }
  prepare(
    input: GatewayCallAttempt,
  ): Readonly<{ requestId: string; precommitted: true }> {
    let lock: number | undefined,
      started = false,
      committed = false
    try {
      const expected = this.current(),
        canonical = attempt(input)
      if (attemptText(canonical) !== attemptText(this.expected)) deny()
      this.checkRoot()
      this.noUncertainty()
      if (
        existsSync(this.path("call.initialized")) ||
        existsSync(this.path("call.enc"))
      )
        deny()
      lock = openSync(this.path("call.writer-lock"), "wx", 0o600)
      started = true
      writeFileSync(lock, "explicit call precommit\n")
      fsyncSync(lock)
      this.syncDir()
      this.withKey((key) => {
        this.matches(expected)
        const marker = openSync(this.path("call.initialized"), "wx", 0o600)
        try {
          writeFileSync(marker, CALL_PRECOMMIT_CONTENT)
          fsyncSync(marker)
        } finally {
          closeSync(marker)
        }
        this.syncDir()
        const request = Object.freeze({
          ...canonical,
          capability: randomBytes(32).toString("hex"),
        })
        const bytes = this.seal(key, expected, request),
          fd = openSync(this.path("call.next"), "wx", 0o600)
        try {
          writeFileSync(fd, bytes)
          fsyncSync(fd)
        } finally {
          bytes.fill(0)
          closeSync(fd)
        }
        this.matches(expected)
        renameSync(this.path("call.next"), this.path("call.enc"))
        this.syncDir()
        committed = true
        this.matches(expected)
      })
      return Object.freeze({
        requestId: canonical.requestId,
        precommitted: true,
      })
    } catch {
      return deny()
    } finally {
      if (lock !== undefined) {
        try {
          closeSync(lock)
          if (committed && !this.poisoned) {
            unlinkSync(this.path("call.writer-lock"))
            this.syncDir()
          }
        } catch {
          this.barrier()
          deny()
        }
        if ((started && !committed) || this.poisoned) {
          this.barrier()
          deny()
        }
      }
    }
  }
  async register(): Promise<Receipt> {
    try {
      this.current() // Actual ACTIVE register proof before call key/files.
      this.checkRoot()
      this.noUncertainty()
      const stored = this.withKey((key) => this.decode(key))
      const result = await this.options.dispatcher.register(stored.input)
      this.matches(stored.binding)
      this.checkRoot()
      this.noUncertainty()
      const after = this.readFile("call.enc")
      try {
        if (
          !sameStamp(after.stamp, stored.stamp) ||
          digest(after.bytes.toString()) !== stored.ciphertextHash
        )
          deny()
      } finally {
        after.bytes.fill(0)
      }
      return registrationReceipt(result, [stored.input.capability])
    } catch {
      return deny()
    }
  }
}

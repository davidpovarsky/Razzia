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
  GATEWAY_ROOT_CONTENT,
  GATEWAY_ROOT_MARKER,
  type GatewayBinding,
  type GatewayCustodyOptions,
  type GatewayDeliveryAck,
} from "./contracts"
import {
  binding,
  bindingText,
  credential,
  deny,
  digest,
  exact,
  id,
  immutableText,
  integer,
  sameCredential,
  scopeText,
  target,
} from "./codec"

type Stamp = { dev: number; ino: number }
export interface SealedCredential {
  readonly binding: GatewayBinding
  readonly credential: string | null
  readonly storedVersion: number
  readonly deliveryId: string
  readonly stamp: Stamp
  readonly ciphertextDigest: string
}
const MAX_BYTES = 16384
const sameStamp = (a: Stamp, b: Stamp) => a.dev === b.dev && a.ino === b.ino
const encode = (value: Buffer) => value.toString("base64url")
function decode(value: unknown, length?: number): Buffer {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/u.test(value)) deny()
  const bytes = Buffer.from(value, "base64url")
  if (
    encode(bytes) !== value ||
    (length !== undefined && bytes.length !== length)
  )
    deny()
  return bytes
}

// Internal synchronous file boundary. Only ciphertext and public custody metadata
// cross it. No directory/key creation, repair or credential/permission cache.
export class PrivateGatewayCustody {
  private readonly root: string
  private readonly installation: string
  private readonly keyId: string
  private readonly scope: ReturnType<typeof target>
  private rootStamp?: Stamp
  private poisoned = false
  constructor(private readonly options: GatewayCustodyOptions) {
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
  }
  private path(name: string) {
    return join(this.root, name)
  }
  private stamp(path: string): Stamp {
    const stat = lstatSync(path)
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      stat.nlink !== 1 ||
      (stat.mode & 0o077) !== 0 ||
      stat.size > MAX_BYTES
    )
      deny()
    return stat
  }
  private readFile(name: string): { bytes: Buffer; stamp: Stamp } {
    const path = this.path(name),
      before = this.stamp(path)
    const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW)
    try {
      if (!sameStamp(before, fstatSync(fd))) deny()
      const bytes = readFileSync(fd)
      if (bytes.length > MAX_BYTES || !sameStamp(before, this.stamp(path))) {
        bytes.fill(0)
        deny()
      }
      return { bytes, stamp: before }
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
      (this.rootStamp && !sameStamp(stat, this.rootStamp))
    )
      deny()
    this.rootStamp = { dev: stat.dev, ino: stat.ino }
    const marker = this.readFile(GATEWAY_ROOT_MARKER)
    try {
      if (marker.bytes.toString() !== GATEWAY_ROOT_CONTENT) deny()
    } finally {
      marker.bytes.fill(0)
    }
  }
  private syncDirectory() {
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
      existsSync(this.path("custody.writer-lock")) ||
      existsSync(this.path("credential.next"))
    )
      deny()
  }
  private installed() {
    const marker = this.readFile("custody.initialized")
    try {
      if (marker.bytes.toString() !== "explicit-gateway-custody-v1\n") deny()
    } finally {
      marker.bytes.fill(0)
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
              GATEWAY_KEY_PURPOSE,
              this.installation,
              this.keyId,
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
  private header(
    value: GatewayBinding,
    storedVersion: number,
    deliveryId: string,
  ) {
    return {
      schema: 1,
      purpose: GATEWAY_KEY_PURPOSE,
      installationId: this.installation,
      keyId: this.keyId,
      targetDigest: digest(scopeText(this.scope)),
      storedVersion,
      deliveryId,
      bindingDigest: digest(bindingText(value)),
    }
  }
  private seal(
    key: Buffer,
    value: GatewayBinding,
    secret: string | null,
    version: number,
    deliveryId: string,
  ): Buffer {
    const header = this.header(value, version, deliveryId),
      iv = randomBytes(12)
    const cipher = createCipheriv("aes-256-gcm", key, iv)
    cipher.setAAD(Buffer.from(JSON.stringify(header)))
    const plaintext = Buffer.from(
      JSON.stringify({ binding: value, credential: secret }),
    )
    try {
      const encrypted = Buffer.concat([
        cipher.update(plaintext),
        cipher.final(),
      ])
      return Buffer.from(
        JSON.stringify({
          header,
          iv: encode(iv),
          tag: encode(cipher.getAuthTag()),
          data: encode(encrypted),
        }) + "\n",
      )
    } finally {
      plaintext.fill(0)
    }
  }
  private unseal(key: Buffer): SealedCredential {
    this.installed()
    const file = this.readFile("credential.enc")
    let plaintext: Buffer | undefined
    try {
      const row = exact(JSON.parse(file.bytes.toString()), [
        "header",
        "iv",
        "tag",
        "data",
      ])
      const header = exact(row.header, [
        "schema",
        "purpose",
        "installationId",
        "keyId",
        "targetDigest",
        "storedVersion",
        "deliveryId",
        "bindingDigest",
      ])
      const version = integer(header.storedVersion),
        deliveryId = id(header.deliveryId)
      if (
        header.schema !== 1 ||
        header.purpose !== GATEWAY_KEY_PURPOSE ||
        header.installationId !== this.installation ||
        header.keyId !== this.keyId ||
        header.targetDigest !== digest(scopeText(this.scope))
      )
        deny()
      const decipher = createDecipheriv("aes-256-gcm", key, decode(row.iv, 12))
      decipher.setAAD(Buffer.from(JSON.stringify(header)))
      decipher.setAuthTag(decode(row.tag, 16))
      plaintext = Buffer.concat([
        decipher.update(decode(row.data)),
        decipher.final(),
      ])
      const body = exact(JSON.parse(plaintext.toString()), [
          "binding",
          "credential",
        ]),
        value = binding(body.binding)
      if (
        header.bindingDigest !== digest(bindingText(value)) ||
        scopeText(value) !== scopeText(this.scope) ||
        (version === 0 ? body.credential !== null : value.version !== version)
      )
        deny()
      return {
        binding: value,
        credential: version === 0 ? null : credential(body.credential),
        storedVersion: version,
        deliveryId,
        stamp: file.stamp,
        ciphertextDigest: digest(file.bytes.toString()),
      }
    } finally {
      file.bytes.fill(0)
      plaintext?.fill(0)
    }
  }
  private barrier() {
    this.poisoned = true
    try {
      if (!existsSync(this.path("custody.writer-lock"))) {
        const fd = openSync(this.path("custody.writer-lock"), "wx", 0o600)
        try {
          writeFileSync(fd, "uncertain gateway custody\n")
          fsyncSync(fd)
        } finally {
          closeSync(fd)
        }
        this.syncDirectory()
      }
    } catch {
      /* Poisoned in-process state still denies. No repair path. */
    }
  }
  private mutate<T>(
    work: (key: Buffer, publish: (bytes: Buffer) => void) => T,
  ): T {
    let lock: number | undefined,
      uncertain = false
    try {
      this.rootCheck()
      this.noUncertainty()
      lock = openSync(this.path("custody.writer-lock"), "wx", 0o600)
      uncertain = true
      writeFileSync(lock, "explicit gateway custody mutation\n")
      fsyncSync(lock)
      this.syncDirectory()
      uncertain = false
      return this.withKey((key) =>
        work(key, (bytes) => {
          uncertain = true
          const fd = openSync(this.path("credential.next"), "wx", 0o600)
          try {
            writeFileSync(fd, bytes)
            fsyncSync(fd)
          } finally {
            closeSync(fd)
          }
          renameSync(this.path("credential.next"), this.path("credential.enc"))
          this.syncDirectory()
          uncertain = false
        }),
      )
    } catch {
      return deny()
    } finally {
      if (lock !== undefined) {
        try {
          closeSync(lock)
          if (!uncertain && !this.poisoned) {
            unlinkSync(this.path("custody.writer-lock"))
            this.syncDirectory()
          }
        } catch {
          uncertain = true
        }
        if (uncertain || this.poisoned) {
          this.barrier()
          deny()
        }
      }
    }
  }
  initialize(value: GatewayBinding, recheck: () => void): void {
    this.mutate((key, publish) => {
      recheck()
      if (
        existsSync(this.path("credential.enc")) ||
        existsSync(this.path("custody.initialized"))
      )
        deny()
      // This irreversible marker distinguishes missing custody from a fresh install.
      const fd = openSync(this.path("custody.initialized"), "wx", 0o600)
      try {
        writeFileSync(fd, "explicit-gateway-custody-v1\n")
        fsyncSync(fd)
      } catch {
        this.poisoned = true
        deny()
      } finally {
        try {
          closeSync(fd)
        } catch {
          this.poisoned = true
          deny()
        }
      }
      try {
        this.syncDirectory()
      } catch {
        this.poisoned = true
        deny()
      }
      const bytes = this.seal(key, value, null, 0, "empty")
      try {
        publish(bytes)
      } finally {
        bytes.fill(0)
      }
      recheck()
    })
  }
  accept(
    value: GatewayBinding,
    secret: string,
    expected: number,
    deliveryId: string,
    recheck: () => void,
  ): GatewayDeliveryAck {
    return this.mutate((key, publish) => {
      recheck()
      const prior = this.unseal(key)
      if (immutableText(prior.binding) !== immutableText(value)) deny()
      if (prior.storedVersion === value.version) {
        if (
          prior.deliveryId !== deliveryId ||
          bindingText(prior.binding) !== bindingText(value) ||
          prior.credential === null ||
          !sameCredential(prior.credential, secret)
        )
          deny()
      } else {
        if (
          prior.storedVersion !== expected ||
          value.version <= prior.storedVersion
        )
          deny()
        const bytes = this.seal(key, value, secret, value.version, deliveryId)
        try {
          recheck()
          publish(bytes)
        } finally {
          bytes.fill(0)
        }
      }
      recheck()
      return this.ack({
        storedVersion: value.version,
        deliveryId,
        binding: value,
      })
    })
  }
  read(value: GatewayBinding): SealedCredential {
    try {
      this.rootCheck()
      this.noUncertainty()
      return this.withKey((key) => {
        const sealed = this.unseal(key)
        if (
          sealed.credential === null ||
          bindingText(sealed.binding) !== bindingText(value)
        )
          deny()
        this.assertUnchanged(sealed)
        return sealed
      })
    } catch {
      return deny()
    }
  }
  assertUnchanged(sealed: SealedCredential) {
    this.rootCheck()
    this.noUncertainty()
    this.installed()
    const file = this.readFile("credential.enc")
    try {
      if (
        !sameStamp(sealed.stamp, file.stamp) ||
        digest(file.bytes.toString()) !== sealed.ciphertextDigest
      )
        deny()
    } finally {
      file.bytes.fill(0)
    }
  }
  ack(
    sealed: Pick<SealedCredential, "storedVersion" | "deliveryId" | "binding">,
  ): GatewayDeliveryAck {
    return Object.freeze({
      protocol: 1,
      deliveryId: sealed.deliveryId,
      installationId: this.installation,
      service: sealed.binding.service,
      storedVersion: sealed.storedVersion,
    })
  }
}

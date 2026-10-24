/**
 * Canonical JSON stringification:
 * Recursively sorts all object keys in lexicographical order.
 * Ensures deterministic serialized string representation across environments.
 */
export const canonicalJsonStringify = (value: unknown): string => {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value)
  }

  if (Array.isArray(value)) {
    const serializedElements = value.map((element) =>
      element === undefined ? "null" : canonicalJsonStringify(element),
    )

    return `[${serializedElements.join(",")}]`
  }

  const record = value as Record<string, unknown>
  const sortedKeys = Object.keys(record).sort()
  const entries: string[] = []

  for (const key of sortedKeys) {
    const propertyValue = record[key]

    if (
      propertyValue !== undefined &&
      typeof propertyValue !== "function" &&
      typeof propertyValue !== "symbol"
    ) {
      entries.push(
        `${JSON.stringify(key)}:${canonicalJsonStringify(propertyValue)}`,
      )
    }
  }

  return `{${entries.join(",")}}`
}

// SHA-256 constants: cube roots of first 64 primes
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])

const rotr = (n: number, b: number): number => (n >>> b) | (n << (32 - b))

/**
 * Standard pure-TypeScript SHA-256 implementation (FIPS 180-4).
 * Runs synchronously in any JavaScript engine (Node, browser, workers)
 * with zero dependencies or server-specific filesystem imports.
 */
export const sha256Hex = (input: string): string => {
  const bytes = new TextEncoder().encode(input)
  const bitLength = bytes.length * 8

  // Padding: message + 0x80 + zeros + 64-bit big-endian length
  const remainder = (bytes.length + 9) % 64
  const paddingLength = remainder === 0 ? 0 : 64 - remainder
  const totalLength = bytes.length + 1 + paddingLength + 8
  const buffer = new Uint8Array(totalLength)

  buffer.set(bytes, 0)
  buffer[bytes.length] = 0x80

  // 64-bit length at end (big-endian)
  const view = new DataView(buffer.buffer)
  // Higher 32 bits (bitLength can exceed 32 bits if >512MB, but safe for string)
  const highBits = Math.floor(bitLength / 0x100000000)
  const lowBits = bitLength >>> 0
  view.setUint32(totalLength - 8, highBits, false)
  view.setUint32(totalLength - 4, lowBits, false)

  let h0 = 0x6a09e667
  let h1 = 0xbb67ae85
  let h2 = 0x3c6ef372
  let h3 = 0xa54ff53a
  let h4 = 0x510e527f
  let h5 = 0x9b05688c
  let h6 = 0x1f83d9ab
  let h7 = 0x5be0cd19

  const w = new Uint32Array(64)

  for (let offset = 0; offset < totalLength; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      w[i] = view.getUint32(offset + i * 4, false)
    }

    for (let i = 16; i < 64; i += 1) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3)
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10)
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0
    }

    let a = h0
    let b = h1
    let c = h2
    let d = h3
    let e = h4
    let f = h5
    let g = h6
    let h = h7

    for (let i = 0; i < 64; i += 1) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)
      const ch = (e & f) ^ (~e & g)
      const temp1 = (h + s1 + ch + K[i] + w[i]) >>> 0
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const temp2 = (s0 + maj) >>> 0

      h = g
      g = f
      f = e
      e = (d + temp1) >>> 0
      d = c
      c = b
      b = a
      a = (temp1 + temp2) >>> 0
    }

    h0 = (h0 + a) >>> 0
    h1 = (h1 + b) >>> 0
    h2 = (h2 + c) >>> 0
    h3 = (h3 + d) >>> 0
    h4 = (h4 + e) >>> 0
    h5 = (h5 + f) >>> 0
    h6 = (h6 + g) >>> 0
    h7 = (h7 + h) >>> 0
  }

  const toHex = (n: number) => n.toString(16).padStart(8, "0")

  return (
    toHex(h0) +
    toHex(h1) +
    toHex(h2) +
    toHex(h3) +
    toHex(h4) +
    toHex(h5) +
    toHex(h6) +
    toHex(h7)
  )
}

/**
 * Computes deterministic SHA-256 base digest of a canonical validated quiz.
 */
export const computeCanonicalBaseDigest = (quiz: unknown): string => {
  const canonicalString = canonicalJsonStringify(quiz)

  return sha256Hex(canonicalString)
}

/**
 * Verifies if the computed base digest of a quiz matches expected digest.
 */
export const verifyBaseDigest = (
  quiz: unknown,
  expectedDigest: string,
): boolean => {
  if (typeof expectedDigest !== "string" || expectedDigest.length !== 64) {
    return false
  }

  return computeCanonicalBaseDigest(quiz) === expectedDigest
}

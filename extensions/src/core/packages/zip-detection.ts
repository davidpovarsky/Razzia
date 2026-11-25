/** Inspect only a bounded central directory; never decode/decompress the whole ZIP. */
export function zipInventoryHasEntry(bytes: Uint8Array, name: string): boolean {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

  if (bytes.length < 22) {
    return false
  }

  let end = bytes.length - 22
  const minimum = Math.max(0, end - 65535)

  while (end >= minimum && view.getUint32(end, true) !== 0x06054b50) {
    end -= 1
  }

  if (end < minimum) {
    return false
  }

  const count = view.getUint16(end + 10, true),
    size = view.getUint32(end + 12, true)
  let cursor = view.getUint32(end + 16, true)

  if (count > 4096 || cursor + size > end) {
    return false
  }

  const decoder = new TextDecoder()
  for (let i = 0; i < count; i += 1) {
    if (cursor + 46 > end || view.getUint32(cursor, true) !== 0x02014b50) {
      return false
    }

    const length = view.getUint16(cursor + 28, true),
      extra = view.getUint16(cursor + 30, true),
      comment = view.getUint16(cursor + 32, true)

    if (cursor + 46 + length + extra + comment > end) {
      return false
    }

    if (
      decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + length)) === name
    ) {
      return true
    }

    cursor += 46 + length + extra + comment
  }

  return false
}

import {
  generateRosterPlayerId,
  normalizePhoneE164,
  type RosterParticipant,
} from "./phone-roster"

export interface RosterImportRowError {
  rowNumber: number
  rawName: string
  rawPhone: string
  reasonKey: string
  reasonMessage: string
}

export interface RosterImportPreviewRow {
  rowNumber: number
  rosterPlayerId: string
  displayName: string
  phoneE164: string | null
  phoneRaw: string
  status: "valid" | "error"
  valid: boolean
  error?: string
  errorMessage?: string
  errorKey?: string
}

export interface RosterImportResult {
  ok: boolean
  valid: boolean
  filename: string
  totalRows: number
  validCount: number
  invalidCount: number
  errorCount: number
  participants: RosterParticipant[]
  validParticipants: RosterParticipant[]
  rows: RosterImportPreviewRow[]
  errors: RosterImportRowError[]
  fatalError?: string
}

const MAX_IMPORT_BYTES = 5 * 1024 * 1024
const MAX_IMPORT_ROWS = 2000

const utf8Encoder = new TextEncoder()
const utf8Decoder = new TextDecoder("utf-8")

const NAME_HEADERS = new Set([
  "name",
  "displayname",
  "display_name",
  "player",
  "playername",
  "player_name",
  "participant",
  "fullname",
  "full_name",
  "username",
  "שם",
  "שם מלא",
  "משתתף",
  "שחקן",
])

const PHONE_HEADERS = new Set([
  "phone",
  "phonenumber",
  "phone_number",
  "telephone",
  "mobile",
  "cell",
  "tel",
  "phonee164",
  "phone_e164",
  "טלפון",
  "נייד",
  "מספר טלפון",
  "מספר",
  "פלאפון",
])

function normalizeHeaderKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replaceAll(/[\s\-_()]/gu, "")
}

/**
 * Generates a downloadable CSV template string with UTF-8 BOM.
 */
export function generateRosterCsvTemplate(): string {
  return "\uFEFFname,phone\nAlice Cohen,+972501234567\nBob Levi,052-765-4321\nCharlie Smith,+447911123456\n"
}

/**
 * Exports a roster participant list to CSV string.
 */
export function exportRosterToCsv(participants: RosterParticipant[]): string {
  const escapeCsvCell = (val: string): string => {
    // Prevent CSV formula injection when opened in spreadsheet tools, but allow valid E.164 phone numbers (+digits)
    const isFormulaPrefix = /^[=+\-@]/u.test(val) && !/^\+\d{7,15}$/u.test(val)
    const safeVal = isFormulaPrefix ? `'${val}` : val

    if (
      safeVal.includes(",") ||
      safeVal.includes('"') ||
      safeVal.includes("\n") ||
      safeVal.includes("\r")
    ) {
      return `"${safeVal.replaceAll('"', '""')}"`
    }

    return safeVal
  }

  const lines = ["name,phone"]
  for (const p of participants) {
    lines.push(
      `${escapeCsvCell(p.displayName)},${escapeCsvCell(p.phoneE164 ?? p.phoneRaw ?? "")}`,
    )
  }

  return `\uFEFF${lines.join("\n")}\n`
}

/**
 * Parses RFC 4180 CSV text into rows of string cells.
 */
export function parseCsvCells(csvText: string): string[][] {
  const content = csvText.startsWith("\uFEFF") ? csvText.slice(1) : csvText
  const rows: string[][] = []
  let currentRow: string[] = []
  let currentCell = ""
  let inQuotes = false

  for (let i = 0; i < content.length; i += 1) {
    const ch = content[i]

    if (inQuotes) {
      if (ch === '"') {
        if (content[i + 1] === '"') {
          currentCell += '"'
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        currentCell += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ",") {
      currentRow.push(currentCell)
      currentCell = ""
    } else if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && content[i + 1] === "\n") {
        i += 1
      }

      currentRow.push(currentCell)
      currentCell = ""

      if (currentRow.some((c) => c.trim().length > 0)) {
        rows.push(currentRow)
      }

      currentRow = []
    } else {
      currentCell += ch
    }
  }

  if (inQuotes) {
    throw new Error("errors:extensions.corruptCsvUnclosedQuote")
  }

  currentRow.push(currentCell)

  if (currentRow.some((c) => c.trim().length > 0)) {
    rows.push(currentRow)
  }

  return rows
}

// ── Pure TypeScript RFC 1951 Deflate Inflator (Browser & Node Safe) ──────

const FIXED_LEN_BASE = [
  3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67,
  83, 99, 115, 131, 163, 195, 227, 258,
]
const FIXED_LEN_EXTRA = [
  0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5,
  5, 5, 0,
]
const FIXED_DIST_BASE = [
  1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769,
  1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577,
]
const FIXED_DIST_EXTRA = [
  0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11,
  11, 12, 12, 13, 13,
]
const CLEN_ORDER = [
  16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15,
]

interface HuffmanTable {
  counts: Uint16Array
  symbols: Uint16Array
}

function buildHuffman(lengths: Uint8Array, maxSymbol: number): HuffmanTable {
  const counts = new Uint16Array(16)
  for (let i = 0; i < maxSymbol; i += 1) {
    const len = lengths[i]

    if (len > 0) {
      counts[len] += 1
    }
  }

  const offsets = new Uint16Array(16)
  let code = 0
  for (let bits = 1; bits <= 15; bits += 1) {
    offsets[bits] = code
    code += counts[bits]
  }

  const symbols = new Uint16Array(code)
  for (let i = 0; i < maxSymbol; i += 1) {
    const len = lengths[i]

    if (len > 0) {
      symbols[offsets[len]] = i
      offsets[len] += 1
    }
  }

  return { counts, symbols }
}

function inflateRawBytes(
  src: Uint8Array,
  maxOutputLength = 25 * 1024 * 1024,
): Uint8Array {
  let bytePos = 0
  let bitBuf = 0
  let bitCnt = 0

  const needBits = (n: number) => {
    while (bitCnt < n) {
      if (bytePos >= src.length) {
        throw new Error("errors:extensions.corruptXlsxFile")
      }

      bitBuf |= src[bytePos] << bitCnt
      bytePos += 1
      bitCnt += 8
    }
  }

  const readBits = (n: number): number => {
    needBits(n)
    const val = bitBuf & ((1 << n) - 1)
    bitBuf >>>= n
    bitCnt -= n

    return val
  }

  const decodeSymbol = (table: HuffmanTable): number => {
    let code = 0
    let first = 0
    let index = 0
    for (let len = 1; len <= 15; len += 1) {
      code |= readBits(1)
      const count = table.counts[len]

      if (code - count < first) {
        return table.symbols[index + (code - first)]
      }

      index += count
      first += count
      first <<= 1
      code <<= 1
    }
    throw new Error("errors:extensions.corruptXlsxFile")
  }

  const fixedLitLengths = new Uint8Array(288)
  for (let i = 0; i <= 143; i += 1) {
    fixedLitLengths[i] = 8
  }
  for (let i = 144; i <= 255; i += 1) {
    fixedLitLengths[i] = 9
  }
  for (let i = 256; i <= 279; i += 1) {
    fixedLitLengths[i] = 7
  }
  for (let i = 280; i <= 287; i += 1) {
    fixedLitLengths[i] = 8
  }
  const fixedDistLengths = new Uint8Array(32)
  fixedDistLengths.fill(5)

  const fixedLitTable = buildHuffman(fixedLitLengths, 288)
  const fixedDistTable = buildHuffman(fixedDistLengths, 32)

  let out = new Uint8Array(
    Math.min(maxOutputLength, Math.max(4096, src.length * 3)),
  )
  let outPos = 0

  const ensureOut = (extra: number) => {
    if (outPos + extra > maxOutputLength) {
      throw new Error("errors:extensions.xlsxTooLarge")
    }

    if (outPos + extra > out.length) {
      let nextLen = out.length * 2

      while (nextLen < outPos + extra) {
        nextLen *= 2
      }

      const next = new Uint8Array(Math.min(maxOutputLength, nextLen))
      next.set(out.subarray(0, outPos))
      out = next
    }
  }

  let isFinal = 0

  while (!isFinal) {
    isFinal = readBits(1)
    const btype = readBits(2)

    if (btype === 0) {
      // Uncompressed block
      bitBuf = 0
      bitCnt = 0

      if (bytePos + 4 > src.length) {
        throw new Error("errors:extensions.corruptXlsxFile")
      }

      const len = src[bytePos] | (src[bytePos + 1] << 8)
      const nlen = src[bytePos + 2] | (src[bytePos + 3] << 8)
      bytePos += 4

      if ((len ^ 0xffff) !== nlen) {
        throw new Error("errors:extensions.corruptXlsxFile")
      }

      if (bytePos + len > src.length) {
        throw new Error("errors:extensions.corruptXlsxFile")
      }

      ensureOut(len)
      out.set(src.subarray(bytePos, bytePos + len), outPos)
      outPos += len
      bytePos += len
    } else if (btype === 1 || btype === 2) {
      let litTable = fixedLitTable
      let distTable = fixedDistTable

      if (btype === 2) {
        const hlit = readBits(5) + 257
        const hdist = readBits(5) + 1
        const hclen = readBits(4) + 4
        const clenLengths = new Uint8Array(19)
        for (let i = 0; i < hclen; i += 1) {
          clenLengths[CLEN_ORDER[i]] = readBits(3)
        }
        const clenTable = buildHuffman(clenLengths, 19)
        const allLengths = new Uint8Array(hlit + hdist)
        let idx = 0

        while (idx < hlit + hdist) {
          const sym = decodeSymbol(clenTable)

          if (sym < 16) {
            allLengths[idx] = sym
            idx += 1
          } else if (sym === 16) {
            if (idx === 0) {
              throw new Error("errors:extensions.corruptXlsxFile")
            }

            const prev = allLengths[idx - 1]
            let rep = readBits(2) + 3

            while (rep > 0) {
              allLengths[idx] = prev
              idx += 1
              rep -= 1
            }
          } else if (sym === 17) {
            let rep = readBits(3) + 3

            while (rep > 0) {
              allLengths[idx] = 0
              idx += 1
              rep -= 1
            }
          } else {
            let rep = readBits(7) + 11

            while (rep > 0) {
              allLengths[idx] = 0
              idx += 1
              rep -= 1
            }
          }
        }

        litTable = buildHuffman(allLengths.subarray(0, hlit), hlit)
        distTable = buildHuffman(allLengths.subarray(hlit), hdist)
      }

      let sym = decodeSymbol(litTable)

      while (sym !== 256) {
        if (sym < 256) {
          ensureOut(1)
          out[outPos] = sym
          outPos += 1
        } else {
          const lenIdx = sym - 257

          if (lenIdx < 0 || lenIdx >= FIXED_LEN_BASE.length) {
            throw new Error("errors:extensions.corruptXlsxFile")
          }

          const length =
            FIXED_LEN_BASE[lenIdx] + readBits(FIXED_LEN_EXTRA[lenIdx])
          const distSym = decodeSymbol(distTable)

          if (distSym < 0 || distSym >= FIXED_DIST_BASE.length) {
            throw new Error("errors:extensions.corruptXlsxFile")
          }

          const dist =
            FIXED_DIST_BASE[distSym] + readBits(FIXED_DIST_EXTRA[distSym])

          if (dist > outPos) {
            throw new Error("errors:extensions.corruptXlsxFile")
          }

          ensureOut(length)
          for (let k = 0; k < length; k += 1) {
            out[outPos] = out[outPos - dist]
            outPos += 1
          }
        }

        sym = decodeSymbol(litTable)
      }
    } else {
      throw new Error("errors:extensions.corruptXlsxFile")
    }
  }

  return out.subarray(0, outPos)
}

// ── Binary Helpers ────────────────────────────────────────────────────────

function readU16LE(buf: Uint8Array, offset: number): number {
  return buf[offset] | (buf[offset + 1] << 8)
}

function readU32LE(buf: Uint8Array, offset: number): number {
  return (
    (buf[offset] |
      (buf[offset + 1] << 8) |
      (buf[offset + 2] << 16) |
      (buf[offset + 3] << 24)) >>>
    0
  )
}

function writeU16LE(buf: Uint8Array, offset: number, val: number): void {
  buf[offset] = val & 0xff
  buf[offset + 1] = (val >>> 8) & 0xff
}

function writeU32LE(buf: Uint8Array, offset: number, val: number): void {
  buf[offset] = val & 0xff
  buf[offset + 1] = (val >>> 8) & 0xff
  buf[offset + 2] = (val >>> 16) & 0xff
  buf[offset + 3] = (val >>> 24) & 0xff
}

function concatUint8Arrays(arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((acc, a) => acc + a.byteLength, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const a of arrays) {
    out.set(a, offset)
    offset += a.byteLength
  }

  return out
}

function decodeXmlEntities(str: string): string {
  return str
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&")
    .replaceAll(/&#x([0-9a-fA-F]+);/gu, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replaceAll(/&#(\d+);/gu, (_, dec: string) =>
      String.fromCodePoint(Number.parseInt(dec, 10)),
    )
}

function escapeXml(str: string): string {
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;")
}

function colLettersToIndex(letters: string): number {
  let idx = 0
  for (let i = 0; i < letters.length; i += 1) {
    idx = idx * 26 + (letters.charCodeAt(i) - 64)
  }

  return idx - 1
}

/**
 * Extracts entries from a ZIP buffer (supports method 0 Stored and method 8 Deflate).
 */
function extractZipEntries(zipBuf: Uint8Array): Map<string, Uint8Array> {
  if (zipBuf.byteLength < 22) {
    throw new Error("errors:extensions.corruptXlsxFile")
  }

  let eocdOffset = -1
  const minEocd = Math.max(0, zipBuf.byteLength - 65557)
  for (let i = zipBuf.byteLength - 22; i >= minEocd; i -= 1) {
    if (readU32LE(zipBuf, i) === 0x06054b50) {
      eocdOffset = i

      break
    }
  }

  if (eocdOffset < 0) {
    throw new Error("errors:extensions.corruptXlsxFile")
  }

  const totalEntries = readU16LE(zipBuf, eocdOffset + 10)
  const cdOffset = readU32LE(zipBuf, eocdOffset + 16)

  if (cdOffset >= zipBuf.byteLength) {
    throw new Error("errors:extensions.corruptXlsxFile")
  }

  const entries = new Map<string, Uint8Array>()
  let ptr = cdOffset

  for (let i = 0; i < totalEntries; i += 1) {
    if (ptr + 46 > zipBuf.byteLength || readU32LE(zipBuf, ptr) !== 0x02014b50) {
      throw new Error("errors:extensions.corruptXlsxFile")
    }

    const compressionMethod = readU16LE(zipBuf, ptr + 10)
    const compressedSize = readU32LE(zipBuf, ptr + 20)
    const uncompressedSize = readU32LE(zipBuf, ptr + 24)
    const fileNameLen = readU16LE(zipBuf, ptr + 28)
    const extraLen = readU16LE(zipBuf, ptr + 30)
    const commentLen = readU16LE(zipBuf, ptr + 32)
    const localHeaderOffset = readU32LE(zipBuf, ptr + 42)

    if (uncompressedSize > 25 * 1024 * 1024) {
      throw new Error("errors:extensions.xlsxTooLarge")
    }

    const fileName = utf8Decoder.decode(
      zipBuf.subarray(ptr + 46, ptr + 46 + fileNameLen),
    )

    ptr += 46 + fileNameLen + extraLen + commentLen

    if (
      localHeaderOffset + 30 > zipBuf.byteLength ||
      readU32LE(zipBuf, localHeaderOffset) !== 0x04034b50
    ) {
      throw new Error("errors:extensions.corruptXlsxFile")
    }

    const localNameLen = readU16LE(zipBuf, localHeaderOffset + 26)
    const localExtraLen = readU16LE(zipBuf, localHeaderOffset + 28)
    const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen
    const dataEnd = dataStart + compressedSize

    if (dataEnd > zipBuf.byteLength) {
      throw new Error("errors:extensions.corruptXlsxFile")
    }

    const compressedData = zipBuf.subarray(dataStart, dataEnd)

    if (compressionMethod === 0) {
      entries.set(fileName, new Uint8Array(compressedData))
    } else if (compressionMethod === 8) {
      const inflated = inflateRawBytes(compressedData, 25 * 1024 * 1024)
      entries.set(fileName, inflated)
    } else {
      throw new Error("errors:extensions.unsupportedXlsxCompression")
    }
  }

  return entries
}

export interface ParsedCell {
  value: string
  hasFormula: boolean
  isNumeric: boolean
}

/**
 * Parses an `.xlsx` Uint8Array into a 2D array of ParsedCell objects.
 * Preserves string cells and leading zeros accurately, detects formula cells (`<f>`).
 */
export function parseXlsxCells(buffer: Uint8Array): ParsedCell[][] {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)

  if (buf.byteLength > MAX_IMPORT_BYTES) {
    throw new Error("errors:extensions.fileTooLarge")
  }

  const entries = extractZipEntries(buf)

  const sharedStrings: string[] = []
  const sharedStringsBytes = entries.get("xl/sharedStrings.xml")
  const sharedStringsXml = sharedStringsBytes
    ? utf8Decoder.decode(sharedStringsBytes)
    : ""

  if (sharedStringsXml) {
    const siRegex = /<si\b[^>]*>([\s\S]*?)<\/si>/gu
    let siMatch = siRegex.exec(sharedStringsXml)

    while (siMatch !== null) {
      const [, inner] = siMatch
      const tRegex = /<t(?:\s+[^>]*)?>([\s\S]*?)<\/t>/gu
      let text = ""
      let tMatch = tRegex.exec(inner)

      while (tMatch !== null) {
        text += decodeXmlEntities(tMatch[1])
        tMatch = tRegex.exec(inner)
      }

      sharedStrings.push(text)
      siMatch = siRegex.exec(sharedStringsXml)
    }
  }

  let sheetBytes = entries.get("xl/worksheets/sheet1.xml")

  if (!sheetBytes) {
    for (const [name, content] of entries.entries()) {
      if (name.startsWith("xl/worksheets/") && name.endsWith(".xml")) {
        sheetBytes = content

        break
      }
    }
  }

  if (!sheetBytes) {
    throw new Error("errors:extensions.corruptXlsxMissingSheet")
  }

  const sheetXml = utf8Decoder.decode(sheetBytes)
  const rows: ParsedCell[][] = []
  const rowRegex = /<row\b[^>]*>([\s\S]*?)<\/row>/gu
  let rowMatch = rowRegex.exec(sheetXml)

  while (rowMatch !== null) {
    const [, rowInner] = rowMatch
    const rowCells: ParsedCell[] = []
    const cellRegex = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/gu
    let cellMatch = cellRegex.exec(rowInner)
    let nextColIdx = 0

    while (cellMatch !== null) {
      const [, attrs, rawCellInner] = cellMatch
      const cellInner = (rawCellInner as string | undefined) ?? ""

      const refMatch = /\br="([A-Z]+)\d+"/u.exec(attrs)
      const colIdx = refMatch ? colLettersToIndex(refMatch[1]) : nextColIdx

      while (rowCells.length < colIdx) {
        rowCells.push({ value: "", hasFormula: false, isNumeric: false })
      }

      nextColIdx = colIdx + 1

      const typeMatch = /\bt="([^"]+)"/u.exec(attrs)
      const cellType = typeMatch ? typeMatch[1] : "n"

      const hasFormula = /<f\b/u.test(cellInner)
      let cellValue = ""
      let isNumeric = false

      if (cellType === "inlineStr") {
        const tRegex = /<t(?:\s+[^>]*)?>([\s\S]*?)<\/t>/gu
        let tMatch = tRegex.exec(cellInner)

        while (tMatch !== null) {
          cellValue += decodeXmlEntities(tMatch[1])
          tMatch = tRegex.exec(cellInner)
        }
      } else {
        const vMatch = /<v(?:\s+[^>]*)?>([\s\S]*?)<\/v>/u.exec(cellInner)
        const rawV = vMatch ? decodeXmlEntities(vMatch[1]) : ""

        if (cellType === "s") {
          const sIdx = Number.parseInt(rawV, 10)
          cellValue =
            !Number.isNaN(sIdx) && sIdx >= 0 && sIdx < sharedStrings.length
              ? sharedStrings[sIdx]
              : rawV
        } else if (cellType === "str" || cellType === "b" || cellType === "e") {
          cellValue = rawV
        } else {
          cellValue = rawV
          isNumeric = rawV.length > 0
        }
      }

      rowCells[colIdx] = {
        value: cellValue,
        hasFormula,
        isNumeric,
      }

      cellMatch = cellRegex.exec(rowInner)
    }

    if (rowCells.some((c) => c.value.trim().length > 0 || c.hasFormula)) {
      rows.push(rowCells)
    }

    rowMatch = rowRegex.exec(sheetXml)
  }

  return rows
}

// ── Minimal Valid XLSX Generator (Method 0 Store ZIP — Browser & Node Safe) ─

function crc32(buf: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < buf.byteLength; i += 1) {
    crc ^= buf[i]
    for (let j = 0; j < 8; j += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
    }
  }

  return (crc ^ 0xffffffff) >>> 0
}

function createZipArchive(
  files: Array<{ name: string; data: Uint8Array }>,
): Uint8Array {
  const localParts: Uint8Array[] = []
  const centralParts: Uint8Array[] = []
  let offset = 0

  for (const file of files) {
    const nameBuf = utf8Encoder.encode(file.name)
    const uncompressed = file.data
    const crc = crc32(uncompressed)

    const localHeader = new Uint8Array(30 + nameBuf.byteLength)
    writeU32LE(localHeader, 0, 0x04034b50)
    writeU16LE(localHeader, 4, 20)
    writeU16LE(localHeader, 6, 0)
    // Method 0: Stored
    writeU16LE(localHeader, 8, 0)
    writeU16LE(localHeader, 10, 0)
    writeU16LE(localHeader, 12, 0)
    writeU32LE(localHeader, 14, crc)
    writeU32LE(localHeader, 18, uncompressed.byteLength)
    writeU32LE(localHeader, 22, uncompressed.byteLength)
    writeU16LE(localHeader, 26, nameBuf.byteLength)
    writeU16LE(localHeader, 28, 0)
    localHeader.set(nameBuf, 30)

    localParts.push(localHeader, uncompressed)

    const centralHeader = new Uint8Array(46 + nameBuf.byteLength)
    writeU32LE(centralHeader, 0, 0x02014b50)
    writeU16LE(centralHeader, 4, 20)
    writeU16LE(centralHeader, 6, 20)
    writeU16LE(centralHeader, 8, 0)
    // Method 0: Stored
    writeU16LE(centralHeader, 10, 0)
    writeU16LE(centralHeader, 12, 0)
    writeU16LE(centralHeader, 14, 0)
    writeU32LE(centralHeader, 16, crc)
    writeU32LE(centralHeader, 20, uncompressed.byteLength)
    writeU32LE(centralHeader, 24, uncompressed.byteLength)
    writeU16LE(centralHeader, 28, nameBuf.byteLength)
    writeU16LE(centralHeader, 30, 0)
    writeU16LE(centralHeader, 32, 0)
    writeU16LE(centralHeader, 34, 0)
    writeU16LE(centralHeader, 36, 0)
    writeU32LE(centralHeader, 38, 0)
    writeU32LE(centralHeader, 42, offset)
    centralHeader.set(nameBuf, 46)

    centralParts.push(centralHeader)
    offset += localHeader.byteLength + uncompressed.byteLength
  }

  const centralDirSize = centralParts.reduce((acc, b) => acc + b.byteLength, 0)
  const eocd = new Uint8Array(22)
  writeU32LE(eocd, 0, 0x06054b50)
  writeU16LE(eocd, 4, 0)
  writeU16LE(eocd, 6, 0)
  writeU16LE(eocd, 8, files.length)
  writeU16LE(eocd, 10, files.length)
  writeU32LE(eocd, 12, centralDirSize)
  writeU32LE(eocd, 16, offset)
  writeU16LE(eocd, 20, 0)

  return concatUint8Arrays([...localParts, ...centralParts, eocd])
}

/**
 * Builds a valid `.xlsx` Uint8Array from rows of string/cell definitions.
 */
export function buildXlsxBuffer(
  rows: Array<
    Array<string | { value: string; formula?: string; numeric?: boolean }>
  >,
): Uint8Array {
  const indexToColLetters = (colIdx: number): string => {
    let n = colIdx + 1
    let letters = ""

    while (n > 0) {
      const rem = (n - 1) % 26
      letters = String.fromCharCode(65 + rem) + letters
      n = Math.floor((n - 1) / 26)
    }

    return letters
  }

  const rowXmls: string[] = []

  for (let r = 0; r < rows.length; r += 1) {
    const row = rows[r]
    const cellXmls: string[] = []
    for (let c = 0; c < row.length; c += 1) {
      const item = row[c]
      const ref = `${indexToColLetters(c)}${r + 1}`

      if (typeof item === "string") {
        cellXmls.push(
          `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(item)}</t></is></c>`,
        )
      } else if (item.formula) {
        cellXmls.push(
          `<c r="${ref}" t="str"><f>${escapeXml(item.formula)}</f><v>${escapeXml(item.value)}</v></c>`,
        )
      } else if (item.numeric) {
        cellXmls.push(`<c r="${ref}"><v>${escapeXml(item.value)}</v></c>`)
      } else {
        cellXmls.push(
          `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(item.value)}</t></is></c>`,
        )
      }
    }
    rowXmls.push(`<row r="${r + 1}">${cellXmls.join("")}</row>`)
  }

  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>${rowXmls.join("")}</sheetData>
</worksheet>`

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`

  const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Participants" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`

  const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`

  return createZipArchive([
    { name: "[Content_Types].xml", data: utf8Encoder.encode(contentTypesXml) },
    { name: "_rels/.rels", data: utf8Encoder.encode(relsXml) },
    { name: "xl/workbook.xml", data: utf8Encoder.encode(workbookXml) },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: utf8Encoder.encode(workbookRelsXml),
    },
    { name: "xl/worksheets/sheet1.xml", data: utf8Encoder.encode(sheetXml) },
  ])
}

/**
 * Generates a downloadable `.xlsx` template Uint8Array.
 */
export function generateRosterXlsxTemplate(): Uint8Array {
  return buildXlsxBuffer([
    ["name", "phone"],
    ["Alice Cohen", "+972501234567"],
    ["Bob Levi", "052-765-4321"],
    ["Charlie Smith", "+447911123456"],
  ])
}

// ── Unified Validation & Preview Pipeline ─────────────────────────────────

function makeFailureResult(
  filename: string,
  reasonKey: string,
  reasonMessage: string,
): RosterImportResult {
  return {
    ok: false,
    valid: false,
    filename,
    totalRows: 0,
    validCount: 0,
    invalidCount: 1,
    errorCount: 1,
    participants: [],
    validParticipants: [],
    rows: [],
    errors: [
      {
        rowNumber: 1,
        rawName: "",
        rawPhone: "",
        reasonKey,
        reasonMessage,
      },
    ],
    fatalError: reasonMessage,
  }
}

function validateParsedGrid(
  filename: string,
  grid: ParsedCell[][],
  existingPhones = new Set<string>(),
): RosterImportResult {
  if (grid.length === 0) {
    return makeFailureResult(
      filename,
      "errors:extensions.emptyImportFile",
      "File contains no participant rows",
    )
  }

  const [firstRow] = grid
  let nameCol = 0
  let phoneCol = 1
  let hasHeader = false

  const h0 = normalizeHeaderKey(firstRow[0]?.value ?? "")
  const h1 = normalizeHeaderKey(firstRow[1]?.value ?? "")

  if (
    NAME_HEADERS.has(h0) ||
    PHONE_HEADERS.has(h0) ||
    NAME_HEADERS.has(h1) ||
    PHONE_HEADERS.has(h1)
  ) {
    hasHeader = true
    nameCol = -1
    phoneCol = -1
    for (let c = 0; c < firstRow.length; c += 1) {
      const key = normalizeHeaderKey(firstRow[c]?.value ?? "")

      if (nameCol < 0 && NAME_HEADERS.has(key)) {
        nameCol = c
      } else if (phoneCol < 0 && PHONE_HEADERS.has(key)) {
        phoneCol = c
      }
    }

    if (nameCol < 0 || phoneCol < 0) {
      return makeFailureResult(
        filename,
        "errors:extensions.invalidImportHeaders",
        "Missing required 'name' and 'phone' column headers",
      )
    }
  }

  const dataStartIdx = hasHeader ? 1 : 0
  const dataRows = grid.slice(dataStartIdx)

  if (dataRows.length === 0) {
    return makeFailureResult(
      filename,
      "errors:extensions.emptyImportFile",
      "No participant rows found below header",
    )
  }

  if (dataRows.length > MAX_IMPORT_ROWS) {
    return {
      ...makeFailureResult(
        filename,
        "errors:extensions.tooManyImportRows",
        `Row count (${dataRows.length}) exceeds maximum limit of ${MAX_IMPORT_ROWS}`,
      ),
      totalRows: dataRows.length,
    }
  }

  const seenPhonesInFile = new Map<string, number>()
  const participants: RosterParticipant[] = []
  const previewRows: RosterImportPreviewRow[] = []
  const errors: RosterImportRowError[] = []

  for (let i = 0; i < dataRows.length; i += 1) {
    const rowNumber = dataStartIdx + i + 1
    const row = dataRows[i]
    const nameCell = row[nameCol] ?? {
      value: "",
      hasFormula: false,
      isNumeric: false,
    }
    const phoneCell = row[phoneCol] ?? {
      value: "",
      hasFormula: false,
      isNumeric: false,
    }

    const rawName = nameCell.value.trim()
    const rawPhone = phoneCell.value.trim()

    let errorKey: string | undefined = undefined
    let errorMessage: string | undefined = undefined
    let normalizedPhone: string | null = null

    if (nameCell.hasFormula || phoneCell.hasFormula) {
      errorKey = "errors:extensions.formulaNotAllowed"
      errorMessage = `Row ${rowNumber}: Spreadsheet formulas are not allowed`
    } else if (
      /^[=+\-@]/u.test(rawName) ||
      (/^[=+\-@]/u.test(rawPhone) && !/^\+\d/u.test(rawPhone))
    ) {
      errorKey = "errors:extensions.formulaNotAllowed"
      errorMessage = `Row ${rowNumber}: Formula prefix is not allowed`
    } else if (!rawName) {
      errorKey = "errors:extensions.missingParticipantName"
      errorMessage = `Row ${rowNumber}: Participant name is required`
    } else if (rawName.length > 40) {
      errorKey = "errors:extensions.participantNameTooLong"
      errorMessage = `Row ${rowNumber}: Name exceeds 40 characters`
    } else if (!rawPhone) {
      errorKey = "errors:extensions.missingPhoneNumber"
      errorMessage = `Row ${rowNumber}: Phone number is required`
    } else if (/\d+\.\d+[eE][+-]?\d+/u.test(rawPhone)) {
      errorKey = "errors:extensions.scientificNotationPhone"
      errorMessage = `Row ${rowNumber}: Phone number is corrupted by scientific notation (${rawPhone}). Format column as text.`
    } else {
      normalizedPhone = normalizePhoneE164(rawPhone)

      if (!normalizedPhone) {
        errorKey = "errors:extensions.invalidPhoneNumber"
        errorMessage = `Row ${rowNumber}: Invalid telephone number '${rawPhone}'`
      } else if (seenPhonesInFile.has(normalizedPhone)) {
        const firstRowNum = seenPhonesInFile.get(normalizedPhone)
        errorKey = "errors:extensions.duplicatePhoneInImport"
        errorMessage = `Row ${rowNumber}: Duplicate phone number ${normalizedPhone} (already on row ${firstRowNum})`
      } else if (existingPhones.has(normalizedPhone)) {
        errorKey = "errors:extensions.duplicatePhoneInRoster"
        errorMessage = `Row ${rowNumber}: Phone number ${normalizedPhone} already exists in roster`
      }
    }

    const rosterPlayerId = generateRosterPlayerId()

    if (errorKey && errorMessage) {
      errors.push({
        rowNumber,
        rawName,
        rawPhone,
        reasonKey: errorKey,
        reasonMessage: errorMessage,
      })
      previewRows.push({
        rowNumber,
        rosterPlayerId,
        displayName: rawName || "—",
        phoneE164: null,
        phoneRaw: rawPhone,
        status: "error",
        valid: false,
        error: errorMessage,
        errorKey,
        errorMessage,
      })
    } else if (normalizedPhone) {
      seenPhonesInFile.set(normalizedPhone, rowNumber)
      const participant: RosterParticipant = {
        rosterPlayerId,
        displayName: rawName,
        phoneE164: normalizedPhone,
        phoneRaw: rawPhone,
      }
      participants.push(participant)
      previewRows.push({
        rowNumber,
        rosterPlayerId,
        displayName: rawName,
        phoneE164: normalizedPhone,
        phoneRaw: rawPhone,
        status: "valid",
        valid: true,
      })
    }
  }

  return {
    ok: participants.length > 0,
    valid: errors.length === 0 && participants.length > 0,
    filename,
    totalRows: dataRows.length,
    validCount: participants.length,
    invalidCount: errors.length,
    errorCount: errors.length,
    participants,
    validParticipants: participants,
    rows: previewRows,
    errors,
  }
}

export interface ParseRosterImportOptions {
  filename: string
  content: Uint8Array | string
  existingRoster?: RosterParticipant[]
}

/**
 * Parses and validates either a `.csv` or `.xlsx` file into a previewable `RosterImportResult`.
 * Supports both `(content, filename, existingRoster)` and `({ filename, content, existingRoster })`.
 */
export function parseRosterImportFile(
  arg1: ParseRosterImportOptions | Uint8Array | string,
  arg2?: string,
  arg3?: RosterParticipant[],
): RosterImportResult {
  let filename = arg2 ?? "import.csv"
  let content: Uint8Array | string = ""
  let existingRoster: RosterParticipant[] = arg3 ?? []

  if (
    typeof arg1 === "object" &&
    !(arg1 instanceof Uint8Array) &&
    "filename" in arg1
  ) {
    ;({ filename, content, existingRoster = [] } = arg1)
  } else {
    content = arg1
  }

  const existingPhones = new Set<string>()
  for (const p of existingRoster) {
    if (p.phoneE164) {
      existingPhones.add(p.phoneE164)
    }
  }

  const lowerName = filename.trim().toLowerCase()
  const byteLength =
    typeof content === "string"
      ? utf8Encoder.encode(content).byteLength
      : content.byteLength

  if (byteLength > MAX_IMPORT_BYTES) {
    return makeFailureResult(
      filename,
      "errors:extensions.fileTooLarge",
      "File exceeds maximum allowed size of 5 MB",
    )
  }

  if (byteLength === 0) {
    return makeFailureResult(
      filename,
      "errors:extensions.emptyImportFile",
      "Uploaded file is empty",
    )
  }

  try {
    if (lowerName.endsWith(".xlsx")) {
      const bytes =
        typeof content === "string"
          ? Uint8Array.from(atob(content), (c) => c.charCodeAt(0))
          : content
      const grid = parseXlsxCells(bytes)

      return validateParsedGrid(filename, grid, existingPhones)
    }

    if (lowerName.endsWith(".csv")) {
      const text =
        typeof content === "string" ? content : utf8Decoder.decode(content)
      const rawRows = parseCsvCells(text)
      const grid: ParsedCell[][] = rawRows.map((row) =>
        row.map((cell) => ({
          value: cell,
          hasFormula: false,
          isNumeric: false,
        })),
      )

      return validateParsedGrid(filename, grid, existingPhones)
    }

    return makeFailureResult(
      filename,
      "errors:extensions.unsupportedFileFormat",
      "Only .xlsx and .csv files are supported",
    )
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "errors:extensions.corruptImportFile"

    return makeFailureResult(
      filename,
      msg.startsWith("errors:") ? msg : "errors:extensions.corruptImportFile",
      `Failed to parse spreadsheet: ${msg}`,
    )
  }
}

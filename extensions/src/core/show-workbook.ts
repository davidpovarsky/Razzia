import {
  tadaShowV1Schema,
  type AuthoredAnswer,
  type AuthoredCard,
  type AuthoredSetting,
  type TadaShowV1,
} from "./show-authoring-schema"
import { nativeBundleToAuthoredShow } from "./show-authoring-convert"
import {
  cardAudioOverridesSchema,
  cardBackgroundOverrideSchema,
  cardStageAnimationsSchema,
  questionDecorationSchema,
  type CardAudioOverrides,
  type CardBackgroundOverride,
  type CardStageAnimations,
  type QuestionDecoration,
} from "./card-appearance"
import { interludeSchema, type Interlude } from "./media"
import { questionEntranceSchema, type QuestionEntrance } from "./quiz-extras"
import {
  sceneAudioSchema,
  type AnswerRecapMode,
  type SceneAdvanceMode,
  type SceneAudio,
} from "./studio-timeline-schema"
import { cinematicOverlayAnimationsArraySchema } from "./cinematic-overlays"
import type { AnyQuizExtras } from "./index"
import { MAX_ANSWERS } from "@razzia/common/constants"

const MAX_WORKBOOK_BYTES = 5 * 1024 * 1024 // 5 MB
const MAX_INFLATED_BYTES = 25 * 1024 * 1024 // 25 MB
const MAX_ROWS = 2000
const MAX_WORKBOOK_ENTRIES = 50

const utf8Encoder = new TextEncoder()
const utf8Decoder = new TextDecoder("utf-8")

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
  const totalLength = arrays.reduce((acc, a) => acc + a.byteLength, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const arr of arrays) {
    result.set(arr, offset)
    offset += arr.byteLength
  }

  return result
}

// ── Pure TypeScript RFC 1951 Deflate Inflator ──────────────────────────────

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

const FIXED_LEN_BASE = [
  3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67,
  83, 99, 115, 131, 163, 195, 227, 258,
]
const FIXED_LEN_EXTRA = [
  0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5,
  5, 5, 0,
]
const FIXED_DIST_BASE = [
  1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513,
  769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577,
]
const FIXED_DIST_EXTRA = [
  0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11,
  11, 12, 12, 13, 13,
]
const CLEN_ORDER = [
  16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15,
]

function inflateRawBytes(
  src: Uint8Array,
  maxOutputLength = MAX_INFLATED_BYTES,
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
  for (let i = 0; i <= 143; i += 1) {fixedLitLengths[i] = 8}
  for (let i = 144; i <= 255; i += 1) {fixedLitLengths[i] = 9}
  for (let i = 256; i <= 279; i += 1) {fixedLitLengths[i] = 7}
  for (let i = 280; i <= 287; i += 1) {fixedLitLengths[i] = 8}
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
      bitBuf = 0
      bitCnt = 0
      if (bytePos + 4 > src.length) {
        throw new Error("errors:extensions.corruptXlsxFile")
      }
      const len = src[bytePos] | (src[bytePos + 1] << 8)
      const nlen = src[bytePos + 2] | (src[bytePos + 3] << 8)
      bytePos += 4
      if ((len ^ 0xffff) !== nlen || bytePos + len > src.length) {
        throw new Error("errors:extensions.corruptXlsxFile")
      }
      ensureOut(len)
      out.set(src.subarray(bytePos, bytePos + len), outPos)
      bytePos += len
      outPos += len
    } else if (btype === 1 || btype === 2) {
      let litTable = fixedLitTable
      let distTable = fixedDistTable

      if (btype === 2) {
        const hlit = readBits(5) + 257
        const hdist = readBits(5) + 1
        const hclen = readBits(4) + 4
        const codeLengths = new Uint8Array(19)
        for (let i = 0; i < hclen; i += 1) {
          codeLengths[CLEN_ORDER[i]] = readBits(3)
        }
        const clenTable = buildHuffman(codeLengths, 19)
        const totalLengths = hlit + hdist
        const litDistLens = new Uint8Array(totalLengths)
        let curIdx = 0
        while (curIdx < totalLengths) {
          const sym = decodeSymbol(clenTable)
          if (sym < 16) {
            litDistLens[curIdx] = sym
            curIdx += 1
          } else if (sym === 16) {
            if (curIdx === 0) {
              throw new Error("errors:extensions.corruptXlsxFile")
            }
            const prev = litDistLens[curIdx - 1]
            const repeat = readBits(2) + 3
            litDistLens.fill(prev, curIdx, curIdx + repeat)
            curIdx += repeat
          } else if (sym === 17) {
            const repeat = readBits(3) + 3
            litDistLens.fill(0, curIdx, curIdx + repeat)
            curIdx += repeat
          } else if (sym === 18) {
            const repeat = readBits(7) + 11
            litDistLens.fill(0, curIdx, curIdx + repeat)
            curIdx += repeat
          }
        }
        litTable = buildHuffman(litDistLens.subarray(0, hlit), hlit)
        distTable = buildHuffman(litDistLens.subarray(hlit), hdist)
      }

      while (true) {
        const sym = decodeSymbol(litTable)
        if (sym < 256) {
          ensureOut(1)
          out[outPos] = sym
          outPos += 1
        } else if (sym === 256) {
          break
        } else if (sym <= 285) {
          const lenCode = sym - 257
          const length = FIXED_LEN_BASE[lenCode] + readBits(FIXED_LEN_EXTRA[lenCode])
          const distSym = decodeSymbol(distTable)
          if (distSym >= 30) {
            throw new Error("errors:extensions.corruptXlsxFile")
          }
          const dist = FIXED_DIST_BASE[distSym] + readBits(FIXED_DIST_EXTRA[distSym])
          if (dist > outPos) {
            throw new Error("errors:extensions.corruptXlsxFile")
          }
          ensureOut(length)
          let copySrc = outPos - dist
          for (let k = 0; k < length; k += 1) {
            out[outPos] = out[copySrc]
            outPos += 1
            copySrc += 1
          }
        } else {
          throw new Error("errors:extensions.corruptXlsxFile")
        }
      }
    } else {
      throw new Error("errors:extensions.corruptXlsxFile")
    }
  }

  return out.subarray(0, outPos)
}

export function extractZipEntries(zipBuf: Uint8Array): Map<string, Uint8Array> {
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

  if (cdOffset >= zipBuf.byteLength || totalEntries > MAX_WORKBOOK_ENTRIES) {
    throw new Error("errors:extensions.corruptXlsxFile")
  }

  const entries = new Map<string, Uint8Array>()
  let ptr = cdOffset
  let cumulativeInflated = 0

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

    cumulativeInflated += uncompressedSize
    if (cumulativeInflated > MAX_INFLATED_BYTES) {
      throw new Error("errors:extensions.xlsxTooLarge")
    }

    const fileName = utf8Decoder.decode(
      zipBuf.subarray(ptr + 46, ptr + 46 + fileNameLen),
    )

    // Security: Block path traversal and absolute paths
    if (
      fileName.includes("..") ||
      fileName.startsWith("/") ||
      fileName.startsWith("\\")
    ) {
      throw new Error("errors:extensions.corruptXlsxFile")
    }

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
      const inflated = inflateRawBytes(compressedData, MAX_INFLATED_BYTES)
      entries.set(fileName, inflated)
    } else {
      throw new Error("errors:extensions.unsupportedXlsxCompression")
    }
  }

  return entries
}

function colLettersToIndex(letters: string): number {
  let idx = 0
  for (let i = 0; i < letters.length; i += 1) {
    idx = idx * 26 + (letters.charCodeAt(i) - 64)
  }

  return idx - 1
}

function indexToColLetters(colIdx: number): string {
  let n = colIdx + 1
  let letters = ""
  while (n > 0) {
    const rem = (n - 1) % 26
    letters = String.fromCharCode(65 + rem) + letters
    n = Math.floor((n - 1) / 26)
  }

  return letters
}

// ── Zip Writer (Method 0 Stored) ──────────────────────────────────────────

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

export function createZipArchive(
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

// ── Multi-Sheet Workbook Parser ───────────────────────────────────────────

function normalizeKind(rawKind: string): string {
  const lower = rawKind.trim().toLowerCase()
  if (lower === "interimresults" || lower === "interim_results") {
    return "interimResults"
  }
  if (
    lower === "answerrecap" ||
    lower === "answer_recap" ||
    lower === "recap"
  ) {
    return "answerRecap"
  }

  return lower
}

interface SheetCell {
  value: string
  hasFormula: boolean
}

function parseSheetRows(
  sheetXml: string,
  sharedStrings: string[],
  sheetName: string,
): SheetCell[][] {
  const rows: SheetCell[][] = []
  const rowRegex = /<row\b[^>]*>([\s\S]*?)<\/row>/gu
  let rowMatch = rowRegex.exec(sheetXml)
  let rowCount = 0

  while (rowMatch !== null) {
    rowCount += 1
    if (rowCount > MAX_ROWS) {
      throw new Error(`errors:extensions.sheetRowsExceeded:${sheetName}`)
    }

    const [, rowInner] = rowMatch
    const rowCells: SheetCell[] = []
    const cellRegex = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/gu
    let cellMatch = cellRegex.exec(rowInner)
    let nextColIdx = 0

    while (cellMatch !== null) {
      const [, attrs, rawCellInner] = cellMatch
      const cellInner = (rawCellInner as string | undefined) ?? ""

      const refMatch = /\br="([A-Z]+)(\d+)"/u.exec(attrs)
      const colIdx = refMatch ? colLettersToIndex(refMatch[1]) : nextColIdx
      const cellRowStr = refMatch ? refMatch[2] : String(rowCount)

      while (rowCells.length < colIdx) {
        rowCells.push({ value: "", hasFormula: false })
      }
      nextColIdx = colIdx + 1

      // Security Check: strictly forbid formula tags `<f>`
      if (/<f\b/u.test(cellInner)) {
        throw new Error(
          `errors:extensions.formulaCellForbidden:${sheetName}!${indexToColLetters(colIdx)}${cellRowStr}`,
        )
      }

      const typeMatch = /\bt="([^"]+)"/u.exec(attrs)
      const cellType = typeMatch ? typeMatch[1] : "n"

      let cellValue = ""
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
        } else {
          cellValue = rawV
        }
      }

      // Check for formula injection indicators at cell start or strip safety escape apostrophe
      if (cellValue.startsWith("'") && /^[=+\-@\t\r]/u.test(cellValue.slice(1))) {
        cellValue = cellValue.slice(1)
      } else if (
        /^[=+\-@\t\r]/u.test(cellValue) &&
        !/^[+\-]?\d+(\.\d+)?$/u.test(cellValue)
      ) {
        throw new Error(
          `errors:extensions.formulaCellForbidden:${sheetName}!${indexToColLetters(colIdx)}${cellRowStr}`,
        )
      }

      rowCells[colIdx] = {
        value: cellValue.trim(),
        hasFormula: false,
      }

      cellMatch = cellRegex.exec(rowInner)
    }

    if (rowCells.some((c) => c.value.length > 0)) {
      rows.push(rowCells)
    }

    rowMatch = rowRegex.exec(sheetXml)
  }

  return rows
}

/**
 * Parses an official multi-sheet `Tada Show v1` Excel buffer into a validated `TadaShowV1`.
 */
export function parseTadaShowWorkbook(buffer: Uint8Array): TadaShowV1 {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)

  if (buf.byteLength > MAX_WORKBOOK_BYTES) {
    throw new Error("errors:extensions.fileTooLarge")
  }

  const entries = extractZipEntries(buf)

  // 1. Shared Strings
  const sharedStrings: string[] = []
  const sharedStringsBytes = entries.get("xl/sharedStrings.xml")
  if (sharedStringsBytes) {
    const xml = utf8Decoder.decode(sharedStringsBytes)
    const siRegex = /<si\b[^>]*>([\s\S]*?)<\/si>/gu
    let siMatch = siRegex.exec(xml)
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
      siMatch = siRegex.exec(xml)
    }
  }

  // 2. Map Sheet Names to Target Files via workbook.xml and workbook.xml.rels
  const workbookXmlBytes = entries.get("xl/workbook.xml")
  if (!workbookXmlBytes) {
    throw new Error("errors:extensions.corruptXlsxMissingWorkbook")
  }
  const workbookXml = utf8Decoder.decode(workbookXmlBytes)

  const workbookRelsBytes = entries.get("xl/_rels/workbook.xml.rels")
  if (!workbookRelsBytes) {
    throw new Error("errors:extensions.corruptXlsxMissingWorkbook")
  }
  const workbookRelsXml = utf8Decoder.decode(workbookRelsBytes)

  const relIdToTarget = new Map<string, string>()
  const relRegex =
    /<Relationship\b[^>]*\bId="([^"]+)"[^>]*\bTarget="([^"]+)"/gu
  let relMatch = relRegex.exec(workbookRelsXml)
  while (relMatch !== null) {
    relIdToTarget.set(relMatch[1], relMatch[2])
    relMatch = relRegex.exec(workbookRelsXml)
  }

  const sheetNameToTarget = new Map<string, string>()
  const sheetRegex =
    /<sheet\b[^>]*\bname="([^"]+)"[^>]*\br:id="([^"]+)"/gu
  let sheetMatch = sheetRegex.exec(workbookXml)
  while (sheetMatch !== null) {
    const rawName = sheetMatch[1].trim()
    const rId = sheetMatch[2]
    const target = relIdToTarget.get(rId)
    if (target) {
      // Target is relative to xl/
      const normalizedPath = target.startsWith("/")
        ? target.slice(1)
        : target.startsWith("xl/")
          ? target
          : `xl/${target}`
      sheetNameToTarget.set(rawName.toLowerCase(), normalizedPath)
    }
    sheetMatch = sheetRegex.exec(workbookXml)
  }

  const loadSheet = (name: string): SheetCell[][] => {
    const targetPath = sheetNameToTarget.get(name.toLowerCase())
    if (!targetPath) {
      return []
    }
    const bytes = entries.get(targetPath)
    if (!bytes) {
      return []
    }

    return parseSheetRows(utf8Decoder.decode(bytes), sharedStrings, name)
  }

  // ── Sheet: Show ──────────────────────────────────────────────────────────
  const showRows = loadSheet("Show")
  if (showRows.length === 0) {
    throw new Error("errors:extensions.missingSheet:Show")
  }

  const showMap = new Map<string, string>()
  for (const row of showRows) {
    if (row.length >= 2) {
      const key = row[0].value.trim()
      const val = key === "note" ? row[1].value : row[1].value.trim()
      if (key) {
        showMap.set(key, val)
      }
    }
  }

  const format = showMap.get("format") ?? "tada-show"
  const versionStr = showMap.get("version") ?? "1"
  const version = Number.parseInt(versionStr, 10)
  const title = showMap.get("title") ?? ""
  const defaultQuestionMode = (showMap.get("defaultQuestionMode") ??
    "quiz") as "quiz" | "survey"
  const defaultAdvance = (showMap.get("defaultAdvance") ?? "auto") as
    | "auto"
    | "manual"
  const leaderboardPolicy = (showMap.get("leaderboardPolicy") ?? "cardOnly") as
    | "cardOnly"
    | "everyN"
    | "upstream"
    | "disabled"
  const baseGameMode = (showMap.get("baseGameMode") ?? "quiz") as
    | "quiz"
    | "survey"
  const note = showMap.has("note") ? showMap.get("note") || undefined : undefined

  let defaultStageAnimations: CardStageAnimations | undefined
  const defaultStageAnimationsStr = showMap.get("defaultStageAnimationsJson")
  if (defaultStageAnimationsStr) {
    try {
      defaultStageAnimations = cardStageAnimationsSchema.parse(
        JSON.parse(defaultStageAnimationsStr),
      )
    } catch {
      throw new Error("errors:extensions.invalidDefaultStageAnimationsJson")
    }
  }

  let defaultQuestionDecoration: QuestionDecoration | undefined
  const defaultQuestionDecorationStr = showMap.get(
    "defaultQuestionDecorationJson",
  )
  if (defaultQuestionDecorationStr) {
    try {
      defaultQuestionDecoration = questionDecorationSchema.parse(
        JSON.parse(defaultQuestionDecorationStr),
      )
    } catch {
      throw new Error("errors:extensions.invalidDefaultQuestionDecorationJson")
    }
  }

  if (format !== "tada-show" || version !== 1) {
    throw new Error("errors:extensions.unsupportedShowFormat")
  }
  if (!title) {
    throw new Error("errors:quizz.subjectEmpty")
  }

  // ── Sheet: Questions ─────────────────────────────────────────────────────
  const questionRows = loadSheet("Questions")
  if (questionRows.length === 0) {
    throw new Error("errors:extensions.missingSheet:Questions")
  }

  const qHeaders = questionRows[0].map((c) => c.value.trim().toLowerCase())
  const qColMap = new Map<string, number>()
  for (let i = 0; i < qHeaders.length; i += 1) {
    qColMap.set(qHeaders[i], i)
  }

  const getQVal = (row: SheetCell[], colName: string): string => {
    const idx = qColMap.get(colName.toLowerCase())
    if (idx === undefined || idx >= row.length) {
      return ""
    }

    return row[idx].value.trim()
  }

  interface IntermediateQuestion {
    key: string
    type: "single" | "multi" | "estimation"
    playMode: "quiz" | "survey"
    question: string
    category?: string
    note?: string
    timeSeconds: number
    cooldownSeconds: number
    maxPoints: number
    penalty: number
    media?: { type?: "image" | "video" | "audio"; url: string }
    correctAnswerNumbers: number[]
    options?: any
    reveal?: any
    interlude?: Interlude
    questionEntrance?: QuestionEntrance
    background?: CardBackgroundOverride
    audioCues?: CardAudioOverrides
    stageAnimations?: CardStageAnimations
    questionDecoration?: QuestionDecoration
    extraJson?: Record<string, unknown>
    answers: AuthoredAnswer[]
  }

  const questionsByKey = new Map<string, IntermediateQuestion>()

  for (let r = 1; r < questionRows.length; r += 1) {
    const row = questionRows[r]
    const key = getQVal(row, "questionKey")
    if (!key) {
      continue
    }

    if (questionsByKey.has(key)) {
      throw new Error(`errors:extensions.duplicateQuestionKey:${key}`)
    }

    const typeStr = getQVal(row, "questionType").toLowerCase() || "single"
    const playModeStr =
      getQVal(row, "playMode").toLowerCase() || defaultQuestionMode || "quiz"
    const questionText = getQVal(row, "question")
    const category = getQVal(row, "category") || undefined
    const noteVal = getQVal(row, "note") || undefined
    const timeVal = getQVal(row, "timeSeconds")
    const cooldownVal = getQVal(row, "cooldownSeconds")
    const maxPointsVal = getQVal(row, "maxPoints")
    const penaltyVal = getQVal(row, "penalty")
    const mediaTypeStr = getQVal(row, "mediaType").toLowerCase()
    const mediaUrl = getQVal(row, "mediaUrl")
    const correctAnsStr = getQVal(row, "correctAnswers")
    const optionsJsonStr = getQVal(row, "optionsJson")
    const revealEffect = getQVal(row, "revealEffect").toLowerCase()
    const revealDurationVal = getQVal(row, "revealDurationMs")
    const revealTrigger = getQVal(row, "revealTrigger").toLowerCase()
    const revealAudience = getQVal(row, "revealAudience").toLowerCase()
    const extraJsonStr = getQVal(row, "extraJson")
    const interludeJsonStr = getQVal(row, "interludeJson")

    const correctAnsNums = correctAnsStr
      ? correctAnsStr
          .split(/[;,]/)
          .map((s) => Number.parseInt(s.trim(), 10))
          .filter((n) => !Number.isNaN(n))
      : []

    let mediaObj: IntermediateQuestion["media"]
    if (mediaUrl) {
      mediaObj = {
        type:
          mediaTypeStr === "video"
            ? "video"
            : mediaTypeStr === "audio"
              ? "audio"
              : "image",
        url: mediaUrl,
      }
    }

    let revealObj: any
    if (revealEffect && revealEffect !== "none") {
      revealObj = {
        effect: revealEffect,
        durationMs: revealDurationVal
          ? Number.parseInt(revealDurationVal, 10)
          : 2000,
        trigger: revealTrigger === "manual" ? "manual" : "automatic",
        audience: revealAudience === "manager" ? "manager" : "all",
      }
    }

    let optionsObj: any
    if (optionsJsonStr) {
      try {
        optionsObj = JSON.parse(optionsJsonStr)
      } catch {
        throw new Error(`errors:extensions.invalidOptionsJson:${key}`)
      }
    }

    let extraJsonObj: Record<string, unknown> | undefined
    if (extraJsonStr) {
      try {
        extraJsonObj = JSON.parse(extraJsonStr)
      } catch {
        throw new Error(`errors:extensions.invalidExtraJson:${key}`)
      }
    }

    let interludeObj: Interlude | undefined
    if (interludeJsonStr) {
      try {
        const rawInterlude = JSON.parse(interludeJsonStr)
        const parsed = interludeSchema.safeParse(rawInterlude)
        if (!parsed.success) {
          throw new Error(`errors:extensions.invalidInterludeJson:Questions!T${r + 1}`)
        }
        interludeObj = parsed.data
      } catch (err: any) {
        if (err.message && err.message.startsWith("errors:extensions.invalidInterludeJson:Questions!T")) {
          throw err
        }
        throw new Error(`errors:extensions.invalidInterludeJson:Questions!T${r + 1}`)
      }
    }

    const entrancePresetRaw = getQVal(row, "entrancePreset").toLowerCase()
    const entranceDurationRaw = getQVal(row, "entranceDurationMs")
    let questionEntranceObj: QuestionEntrance | undefined

    if (entrancePresetRaw && entrancePresetRaw !== "none") {
      const durationParsed = entranceDurationRaw
        ? Number.parseInt(entranceDurationRaw, 10)
        : 800
      const parsedEntrance = questionEntranceSchema.safeParse({
        preset: entrancePresetRaw,
        durationMs: Number.isNaN(durationParsed) ? 800 : durationParsed,
      })
      if (!parsedEntrance.success) {
        throw new Error(`errors:extensions.invalidEntrancePreset:Questions!U${r + 1}`)
      }
      questionEntranceObj = parsedEntrance.data
    }

    const backgroundJsonStr = getQVal(row, "backgroundJson")
    let backgroundObj: CardBackgroundOverride | undefined
    if (backgroundJsonStr) {
      try {
        backgroundObj = cardBackgroundOverrideSchema.parse(
          JSON.parse(backgroundJsonStr),
        )
      } catch {
        throw new Error(
          `errors:extensions.invalidBackgroundJson:Questions!W${r + 1}`,
        )
      }
    }

    const audioCuesJsonStr = getQVal(row, "audioCuesJson")
    let audioCuesObj: CardAudioOverrides | undefined
    if (audioCuesJsonStr) {
      try {
        audioCuesObj = cardAudioOverridesSchema.parse(
          JSON.parse(audioCuesJsonStr),
        )
      } catch {
        throw new Error(
          `errors:extensions.invalidAudioCuesJson:Questions!X${r + 1}`,
        )
      }
    }

    const stageAnimationsJsonStr = getQVal(row, "stageAnimationsJson")
    let stageAnimationsObj: CardStageAnimations | undefined
    if (stageAnimationsJsonStr) {
      try {
        stageAnimationsObj = cardStageAnimationsSchema.parse(
          JSON.parse(stageAnimationsJsonStr),
        )
      } catch {
        throw new Error(
          `errors:extensions.invalidStageAnimationsJson:Questions!Y${r + 1}`,
        )
      }
    }

    const questionDecorationJsonStr = getQVal(row, "questionDecorationJson")
    let questionDecorationObj: QuestionDecoration | undefined
    if (questionDecorationJsonStr) {
      try {
        questionDecorationObj = questionDecorationSchema.parse(
          JSON.parse(questionDecorationJsonStr),
        )
      } catch {
        throw new Error(
          `errors:extensions.invalidQuestionDecorationJson:Questions!Z${r + 1}`,
        )
      }
    }

    const parseNumOrDefault = (str: string, fallback: number): number => {
      if (!str) return fallback
      const parsed = Number.parseInt(str, 10)
      return Number.isNaN(parsed) ? fallback : parsed
    }

    questionsByKey.set(key, {
      key,
      type: (typeStr as any) || "single",
      playMode: playModeStr === "survey" ? "survey" : "quiz",
      question: questionText,
      category,
      note: noteVal,
      timeSeconds: parseNumOrDefault(timeVal, 20),
      cooldownSeconds: parseNumOrDefault(cooldownVal, 3),
      maxPoints: parseNumOrDefault(
        maxPointsVal,
        playModeStr === "survey" ? 0 : 1000,
      ),
      penalty: parseNumOrDefault(penaltyVal, 0),
      media: mediaObj,
      correctAnswerNumbers: correctAnsNums,
      options: optionsObj,
      reveal: revealObj,
      interlude: interludeObj,
      questionEntrance: questionEntranceObj,
      background: backgroundObj,
      audioCues: audioCuesObj,
      stageAnimations: stageAnimationsObj,
      questionDecoration: questionDecorationObj,
      extraJson: extraJsonObj,
      answers: [],
    })
  }

  // ── Sheet: Answers ───────────────────────────────────────────────────────
  const answerRows = loadSheet("Answers")
  if (answerRows.length === 0) {
    throw new Error("errors:extensions.missingSheet:Answers")
  }
  if (questionsByKey.size > 0 && answerRows.length < 2) {
    throw new Error("errors:extensions.missingAnswers")
  }

  const aHeaders = answerRows[0].map((c) => c.value.trim().toLowerCase())
  const aColMap = new Map<string, number>()
  for (let i = 0; i < aHeaders.length; i += 1) {
    aColMap.set(aHeaders[i], i)
  }

  const getAVal = (row: SheetCell[], colName: string): string => {
    const idx = aColMap.get(colName.toLowerCase())
    if (idx === undefined || idx >= row.length) {
      return ""
    }

    return row[idx].value.trim()
  }

  const answersGrouped = new Map<
    string,
    Array<{ num: number; ans: AuthoredAnswer }>
  >()

  for (let r = 1; r < answerRows.length; r += 1) {
    const row = answerRows[r]
    const qKey = getAVal(row, "questionKey")
    const ansNumStr = getAVal(row, "answerNumber")
    const ansText = getAVal(row, "answerText")
    const displayStr = getAVal(row, "display").toLowerCase() || "text"
    const imageUrl = getAVal(row, "imageUrl")
    const alt = getAVal(row, "alt")

    if (!qKey || !ansNumStr) {
      continue
    }

    const ansNum = Number.parseInt(ansNumStr, 10)
    if (Number.isNaN(ansNum) || ansNum < 1 || ansNum > MAX_ANSWERS) {
      throw new Error(`errors:extensions.invalidAnswerNumber:${qKey}#${ansNumStr}`)
    }

    const authoredAns: AuthoredAnswer = {
      text: ansText,
      display: (displayStr as any) || "text",
      imageUrl: imageUrl || undefined,
      alt: alt || undefined,
    }

    let list = answersGrouped.get(qKey)
    if (!list) {
      list = []
      answersGrouped.set(qKey, list)
    }
    list.push({ num: ansNum, ans: authoredAns })
  }

  for (const [qKey, qItem] of questionsByKey.entries()) {
    const rawList = answersGrouped.get(qKey) ?? []
    rawList.sort((a, b) => a.num - b.num)

    // Verify consecutive 1..N
    for (let i = 0; i < rawList.length; i += 1) {
      if (rawList[i].num !== i + 1) {
        throw new Error(
          `errors:extensions.nonConsecutiveAnswerNumber:${qKey} expected ${i + 1} got ${rawList[i].num}`,
        )
      }
    }

    qItem.answers = rawList.map((item) => item.ans)
  }

  // ── Sheet: Timeline ──────────────────────────────────────────────────────
  const timelineRows = loadSheet("Timeline")
  if (timelineRows.length === 0) {
    throw new Error("errors:extensions.missingSheet:Timeline")
  }
  if (questionsByKey.size > 0 && timelineRows.length < 2) {
    throw new Error("errors:extensions.missingTimeline")
  }

  const tHeaders = timelineRows[0].map((c) => c.value.trim().toLowerCase())
  const tColMap = new Map<string, number>()
  for (let i = 0; i < tHeaders.length; i += 1) {
    tColMap.set(tHeaders[i], i)
  }

  const getTVal = (row: SheetCell[], colName: string): string => {
    const idx = tColMap.get(colName.toLowerCase())
    if (idx === undefined || idx >= row.length) {
      return ""
    }

    return row[idx].value.trim()
  }

  interface IntermediateTimelineRow {
    order: number
    cardKey: string
    kind: string
    row: SheetCell[]
  }

  const intermediateCards: IntermediateTimelineRow[] = []

  for (let r = 1; r < timelineRows.length; r += 1) {
    const row = timelineRows[r]
    const orderStr = getTVal(row, "order")
    const cardKey = getTVal(row, "cardKey")
    const kind = getTVal(row, "kind").toLowerCase()

    if (!cardKey || !kind) {
      continue
    }

    const order = orderStr ? Number.parseInt(orderStr, 10) : r
    intermediateCards.push({ order, cardKey, kind: normalizeKind(kind), row })
  }

  intermediateCards.sort((a, b) => a.order - b.order)

  if (
    intermediateCards.some(
      (c) => c.kind === "quiz" || c.kind === "survey",
    ) &&
    questionRows.length < 2
  ) {
    throw new Error("errors:extensions.missingQuestions")
  }

  const cards: AuthoredCard[] = []

  for (const item of intermediateCards) {
    const { cardKey, kind, row } = item
    const titleVal = getTVal(row, "title")
    const descriptionVal = getTVal(row, "description")
    const questionKeyVal = getTVal(row, "questionKey")
    const playModeVal = getTVal(row, "playMode").toLowerCase()
    const durationMsVal = getTVal(row, "durationMs")
    const durationSecondsVal = getTVal(row, "durationSeconds")
    const advanceRaw =
      getTVal(row, "advance").toLowerCase() || defaultAdvance || "auto"
    const advanceVal: SceneAdvanceMode =
      advanceRaw === "manual"
        ? "manual"
        : advanceRaw === "onmediaend" ||
            advanceRaw === "on_media_end" ||
            advanceRaw === "on-media-end"
          ? "onMediaEnd"
          : "auto"
    const presetVal = getTVal(row, "preset") || "spotlight"
    const rawMediaTypeVal = getTVal(row, "mediaType").toLowerCase()
    const mediaTypeVal: "image" | "video" | "audio" =
      rawMediaTypeVal === "video"
        ? "video"
        : rawMediaTypeVal === "audio"
          ? "audio"
          : "image"
    const mediaUrlVal = getTVal(row, "mediaUrl")
    const subtitleVal = getTVal(row, "subtitle")
    const extraJsonStr = getTVal(row, "extraJson")
    const sceneConfigJsonStr = getTVal(row, "sceneConfigJson")

    let sceneConfigExtras: Record<string, any> | undefined
    if (sceneConfigJsonStr) {
      try {
        const parsed = JSON.parse(sceneConfigJsonStr)
        if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
          if (parsed.overlayAnimations !== undefined) {
            parsed.overlayAnimations = cinematicOverlayAnimationsArraySchema.parse(
              parsed.overlayAnimations,
            )
          }
          sceneConfigExtras = parsed
        } else {
          throw new Error("not-object")
        }
      } catch {
        throw new Error(`errors:extensions.invalidSceneConfigJson:${cardKey}`)
      }
    }

    let extraJson: Record<string, unknown> | undefined
    if (extraJsonStr) {
      try {
        extraJson = JSON.parse(extraJsonStr)
      } catch {
        throw new Error(`errors:extensions.invalidExtraJson:${cardKey}`)
      }
    }

    const tBackgroundJsonStr = getTVal(row, "backgroundJson")
    let tBackground: CardBackgroundOverride | undefined
    if (tBackgroundJsonStr) {
      try {
        tBackground = cardBackgroundOverrideSchema.parse(
          JSON.parse(tBackgroundJsonStr),
        )
      } catch {
        throw new Error(`errors:extensions.invalidBackgroundJson:${cardKey}`)
      }
    }

    const tAudioJsonStr = getTVal(row, "audioJson")
    let tAudio: SceneAudio | undefined
    if (tAudioJsonStr) {
      try {
        tAudio = sceneAudioSchema.parse(JSON.parse(tAudioJsonStr))
      } catch {
        throw new Error(`errors:extensions.invalidAudioJson:${cardKey}`)
      }
    }

    const tStageAnimationsJsonStr = getTVal(row, "stageAnimationsJson")
    let tStageAnimations: CardStageAnimations | undefined
    if (tStageAnimationsJsonStr) {
      try {
        tStageAnimations = cardStageAnimationsSchema.parse(
          JSON.parse(tStageAnimationsJsonStr),
        )
      } catch {
        throw new Error(
          `errors:extensions.invalidStageAnimationsJson:${cardKey}`,
        )
      }
    }

    const sceneAppearance = {
      ...(tBackground ? { background: tBackground } : {}),
      ...(tAudio ? { audio: tAudio } : {}),
      ...(tStageAnimations ? { stageAnimations: tStageAnimations } : {}),
    }

    if (kind === "quiz" || kind === "survey") {
      const qRef = questionKeyVal || cardKey
      const qData = questionsByKey.get(qRef)
      if (!qData) {
        throw new Error(`errors:extensions.orphanTimelineQuestionKey:${qRef}`)
      }

      if (kind === "survey") {
        cards.push({
          key: cardKey,
          kind: "survey",
          questionType: qData.type,
          question: qData.question,
          category: qData.category,
          note: qData.note,
          timeSeconds: qData.timeSeconds,
          cooldownSeconds: qData.cooldownSeconds,
          maxPoints: 0,
          penalty: 0,
          media: qData.media,
          answers: qData.answers,
          options: qData.options,
          reveal: qData.reveal,
          interlude: qData.interlude,
          questionEntrance: qData.questionEntrance,
          background: qData.background ?? tBackground,
          audioCues: qData.audioCues,
          stageAnimations: qData.stageAnimations ?? tStageAnimations,
          questionDecoration: qData.questionDecoration,
          extraJson,
        })
      } else {
        cards.push({
          key: cardKey,
          kind: "quiz",
          questionType: qData.type,
          question: qData.question,
          category: qData.category,
          note: qData.note,
          timeSeconds: qData.timeSeconds,
          cooldownSeconds: qData.cooldownSeconds,
          maxPoints: qData.maxPoints,
          penalty: qData.penalty,
          media: qData.media,
          answers: qData.answers,
          correctAnswers:
            qData.correctAnswerNumbers.length > 0
              ? qData.correctAnswerNumbers
              : [1],
          options: qData.options,
          reveal: qData.reveal,
          interlude: qData.interlude,
          questionEntrance: qData.questionEntrance,
          background: qData.background ?? tBackground,
          audioCues: qData.audioCues,
          stageAnimations: qData.stageAnimations ?? tStageAnimations,
          questionDecoration: qData.questionDecoration,
          extraJson,
        })
      }
    } else {
      switch (kind) {
        case "transition":
          cards.push({
            key: cardKey,
            kind: "transition",
            title: titleVal || undefined,
            description: descriptionVal || undefined,
            durationMs: durationMsVal
              ? Number.parseInt(durationMsVal, 10)
              : 5000,
            advance: advanceVal,
            ...sceneAppearance,
            extraJson,
          })
          break
        case "animation":
          cards.push({
            key: cardKey,
            kind: "animation",
            preset: presetVal,
            title: titleVal || undefined,
            durationMs: durationMsVal
              ? Number.parseInt(durationMsVal, 10)
              : 3000,
            advance: advanceVal,
            ...(sceneConfigExtras?.lottieUrl
              ? { lottieUrl: sceneConfigExtras.lottieUrl }
              : {}),
            ...(sceneConfigExtras?.lottieFit
              ? { lottieFit: sceneConfigExtras.lottieFit }
              : {}),
            ...(sceneConfigExtras?.lottieLoop !== undefined
              ? { lottieLoop: sceneConfigExtras.lottieLoop }
              : {}),
            ...(sceneConfigExtras?.lottieSpeed !== undefined
              ? { lottieSpeed: sceneConfigExtras.lottieSpeed }
              : {}),
            ...sceneAppearance,
            extraJson,
          })
          break
        case "media":
          cards.push({
            key: cardKey,
            kind: "media",
            mediaUrl: mediaUrlVal,
            mediaType: mediaTypeVal,
            title: titleVal || undefined,
            ...(subtitleVal ? { subtitle: subtitleVal } : {}),
            ...(sceneConfigExtras?.stageLayout
              ? { stageLayout: sceneConfigExtras.stageLayout }
              : {}),
            ...(sceneConfigExtras?.textOverlay !== undefined
              ? { textOverlay: sceneConfigExtras.textOverlay }
              : {}),
            ...(sceneConfigExtras?.endBehavior
              ? { endBehavior: sceneConfigExtras.endBehavior }
              : {}),
            durationMs: durationMsVal
              ? Number.parseInt(durationMsVal, 10)
              : 5000,
            ...(sceneConfigExtras?.mediaEndFallbackMs !== undefined
              ? { mediaEndFallbackMs: sceneConfigExtras.mediaEndFallbackMs }
              : {}),
            advance: advanceVal,
            ...(sceneConfigExtras?.volume !== undefined
              ? { volume: sceneConfigExtras.volume }
              : {}),
            ...(sceneConfigExtras?.loop !== undefined
              ? { loop: sceneConfigExtras.loop }
              : {}),
            ...(sceneConfigExtras?.muted !== undefined
              ? { muted: sceneConfigExtras.muted }
              : {}),
            ...(sceneConfigExtras?.showControls !== undefined
              ? { showControls: sceneConfigExtras.showControls }
              : {}),
            ...(sceneConfigExtras?.mediaFit
              ? { mediaFit: sceneConfigExtras.mediaFit }
              : {}),
            ...(sceneConfigExtras?.overlayAnimations
              ? { overlayAnimations: sceneConfigExtras.overlayAnimations }
              : {}),
            ...sceneAppearance,
            extraJson,
          })
          break
        case "leaderboard":
          cards.push({
            key: cardKey,
            kind: "leaderboard",
            title: titleVal || undefined,
            durationMs: durationMsVal
              ? Number.parseInt(durationMsVal, 10)
              : 5000,
            advance: advanceVal,
            ...sceneAppearance,
            extraJson,
          })
          break
        case "interimResults":
          cards.push({
            key: cardKey,
            kind: "interimResults",
            title: titleVal || undefined,
            durationMs: durationMsVal
              ? Number.parseInt(durationMsVal, 10)
              : 5000,
            advance: advanceVal,
            ...sceneAppearance,
            extraJson,
          })
          break
        case "answerRecap": {
          const rawRecapMode =
            getTVal(row, "preset") ||
            playModeVal ||
            sceneConfigExtras?.mode ||
            "mostSelected"
          const recapMode: AnswerRecapMode =
            rawRecapMode === "correctanswer" ||
            rawRecapMode === "correct_answer" ||
            rawRecapMode === "correctAnswer"
              ? "correctAnswer"
              : "mostSelected"
          const startQKey =
            questionKeyVal || sceneConfigExtras?.startQuestionKey || undefined
          cards.push({
            key: cardKey,
            kind: "answerRecap",
            title: titleVal || undefined,
            ...(startQKey ? { startQuestionKey: startQKey } : {}),
            mode: recapMode,
            ...(sceneConfigExtras?.maxItemsPerPage !== undefined
              ? { maxItemsPerPage: sceneConfigExtras.maxItemsPerPage }
              : {}),
            ...(sceneConfigExtras?.showCounts !== undefined
              ? { showCounts: sceneConfigExtras.showCounts }
              : {}),
            ...(sceneConfigExtras?.showPercentages !== undefined
              ? { showPercentages: sceneConfigExtras.showPercentages }
              : {}),
            durationMs: durationMsVal
              ? Number.parseInt(durationMsVal, 10)
              : 8000,
            advance: advanceVal,
            ...sceneAppearance,
            extraJson,
          })
          break
        }
        case "countdown":
          cards.push({
            key: cardKey,
            kind: "countdown",
            durationSeconds: durationSecondsVal
              ? Number.parseInt(durationSecondsVal, 10)
              : 10,
            title: titleVal || undefined,
            advance: advanceVal,
            ...sceneAppearance,
            extraJson,
          })
          break
        case "opening":
          cards.push({
            key: cardKey,
            kind: "opening",
            title: titleVal || "Welcome",
            subtitle: subtitleVal || undefined,
            mediaUrl: mediaUrlVal || undefined,
            ...(rawMediaTypeVal ? { mediaType: mediaTypeVal } : {}),
            ...(sceneConfigExtras ?? {}),
            durationMs: durationMsVal
              ? Number.parseInt(durationMsVal, 10)
              : 5000,
            advance: advanceVal,
            ...sceneAppearance,
            extraJson,
          })
          break
        case "closing":
          cards.push({
            key: cardKey,
            kind: "closing",
            title: titleVal || "Thank you!",
            subtitle: subtitleVal || undefined,
            mediaUrl: mediaUrlVal || undefined,
            ...(rawMediaTypeVal ? { mediaType: mediaTypeVal } : {}),
            ...(sceneConfigExtras ?? {}),
            durationMs: durationMsVal
              ? Number.parseInt(durationMsVal, 10)
              : 5000,
            advance: advanceVal,
            ...sceneAppearance,
            extraJson,
          })
          break
        default:
          throw new Error(`errors:extensions.unsupportedTimelineKind:${kind}`)
      }
    }
  }

  // ── Sheet: Settings ──────────────────────────────────────────────────────
  const settingsRows = loadSheet("Settings")
  const settings: AuthoredSetting[] = []

  if (settingsRows.length >= 2) {
    const sHeaders = settingsRows[0].map((c) => c.value.trim().toLowerCase())
    const sColMap = new Map<string, number>()
    for (let i = 0; i < sHeaders.length; i += 1) {
      sColMap.set(sHeaders[i], i)
    }

    const getSVal = (row: SheetCell[], colName: string): string => {
      const idx = sColMap.get(colName.toLowerCase())
      if (idx === undefined || idx >= row.length) {
        return ""
      }

      return row[idx].value.trim()
    }

    const seenSettings = new Set<string>()
    for (let r = 1; r < settingsRows.length; r += 1) {
      const row = settingsRows[r]
      const scope = getSVal(row, "scope").toLowerCase()
      const targetKey = getSVal(row, "targetKey")
      const property = getSVal(row, "property")
      const valueJsonStr = getSVal(row, "valueJson")

      if (!scope && !targetKey && !property && !valueJsonStr) {
        continue
      }

      if (targetKey !== "show") {
        throw new Error(
          `errors:extensions.invalidSettingTargetKey:Settings!B${r + 1}`,
        )
      }

      if (!scope || !property || !valueJsonStr) {
        continue
      }

      let parsedVal: unknown
      try {
        parsedVal = JSON.parse(valueJsonStr)
      } catch {
        throw new Error(
          `errors:extensions.invalidSettingJson:${scope}.${property}`,
        )
      }

      const settingKey = `${scope}::${property}::${targetKey}`
      if (seenSettings.has(settingKey)) {
        throw new Error(
          `errors:extensions.duplicateSetting:Settings!A${r + 1}`,
        )
      }
      seenSettings.add(settingKey)

      settings.push({
        scope: scope as any,
        targetKey,
        property,
        valueJson: parsedVal,
      })
    }
  }

  const rawAuthoredShow: TadaShowV1 = {
    format: "tada-show",
    version: 1,
    title,
    note,
    baseGameMode,
    defaults: {
      newQuestionMode: defaultQuestionMode,
      leaderboardPolicy,
      advanceMode: defaultAdvance,
      ...(defaultStageAnimations
        ? { stageAnimations: defaultStageAnimations }
        : {}),
      ...(defaultQuestionDecoration
        ? { questionDecoration: defaultQuestionDecoration }
        : {}),
    },
    cards,
    settings,
  }

  return tadaShowV1Schema.parse(rawAuthoredShow)
}

// ── Multi-Sheet Workbook Generator ────────────────────────────────────────

function buildWorksheetXml(rows: string[][]): string {
  const rowXmls: string[] = []
  for (let r = 0; r < rows.length; r += 1) {
    const row = rows[r]
    const cellXmls: string[] = []
    for (let c = 0; c < row.length; c += 1) {
      const val = row[c] ?? ""
      const ref = `${indexToColLetters(c)}${r + 1}`

      // Formula injection defense: escape prefixes =, +, -, @, \t, \r if text
      const isFormulaPrefix =
        /^[=+\-@\t\r]/u.test(val) && !/^[+\-]?\d+(\.\d+)?$/u.test(val)
      const safeVal = isFormulaPrefix ? `'${val}` : val

      cellXmls.push(
        `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(safeVal)}</t></is></c>`,
      )
    }
    rowXmls.push(`<row r="${r + 1}">${cellXmls.join("")}</row>`)
  }

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>${rowXmls.join("")}</sheetData>
</worksheet>`
}

/**
 * Exports a `TadaShowV1` or native bundle into a canonical multi-sheet `.xlsx` buffer.
 */
export function exportTadaShowWorkbook(
  input: TadaShowV1 | { quizz: unknown; extras: AnyQuizExtras },
): Uint8Array {
  const show: TadaShowV1 =
    "format" in input && input.format === "tada-show"
      ? (input as TadaShowV1)
      : nativeBundleToAuthoredShow(input as any)

  // 1. Sheet: Show
  const showData: string[][] = [
    ["key", "value"],
    ["format", "tada-show"],
    ["version", "1"],
    ["title", show.title],
    ["defaultQuestionMode", show.defaults?.newQuestionMode ?? "quiz"],
    ["defaultAdvance", show.defaults?.advanceMode ?? "auto"],
    ["leaderboardPolicy", show.defaults?.leaderboardPolicy ?? "cardOnly"],
    ["baseGameMode", show.baseGameMode ?? "quiz"],
    ["note", show.note ?? ""],
  ]
  if (show.defaults?.stageAnimations) {
    showData.push([
      "defaultStageAnimationsJson",
      JSON.stringify(show.defaults.stageAnimations),
    ])
  }
  if (show.defaults?.questionDecoration) {
    showData.push([
      "defaultQuestionDecorationJson",
      JSON.stringify(show.defaults.questionDecoration),
    ])
  }

  // 2. Sheet: Timeline
  const timelineData: string[][] = [
    [
      "order",
      "cardKey",
      "kind",
      "title",
      "description",
      "questionKey",
      "playMode",
      "durationMs",
      "durationSeconds",
      "advance",
      "preset",
      "mediaType",
      "mediaUrl",
      "subtitle",
      "extraJson",
      "backgroundJson",
      "audioJson",
      "stageAnimationsJson",
      "sceneConfigJson",
    ],
  ]

  // 3. Sheet: Questions
  const questionsData: string[][] = [
    [
      "questionKey",
      "questionType",
      "playMode",
      "question",
      "category",
      "note",
      "timeSeconds",
      "cooldownSeconds",
      "maxPoints",
      "penalty",
      "mediaType",
      "mediaUrl",
      "correctAnswers",
      "optionsJson",
      "revealEffect",
      "revealDurationMs",
      "revealTrigger",
      "revealAudience",
      "extraJson",
      "interludeJson",
      "entrancePreset",
      "entranceDurationMs",
      "backgroundJson",
      "audioCuesJson",
      "stageAnimationsJson",
      "questionDecorationJson",
    ],
  ]

  // 4. Sheet: Answers
  const answersData: string[][] = [
    [
      "questionKey",
      "answerNumber",
      "answerText",
      "display",
      "imageUrl",
      "alt",
    ],
  ]

  for (let idx = 0; idx < show.cards.length; idx += 1) {
    const card = show.cards[idx]
    const orderNum = String(idx + 1)

    if (card.kind === "quiz" || card.kind === "survey") {
      timelineData.push([
        orderNum,
        card.key,
        card.kind,
        "",
        "",
        card.key,
        card.kind,
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        card.extraJson ? JSON.stringify(card.extraJson) : "",
        "",
        "",
        "",
        "",
      ])

      const correctAnsStr =
        card.kind === "quiz" ? card.correctAnswers.join(";") : ""

      questionsData.push([
        card.key,
        card.questionType ?? "single",
        card.kind,
        card.question,
        card.category ?? "",
        card.note ?? "",
        card.timeSeconds !== undefined ? String(card.timeSeconds) : "20",
        card.cooldownSeconds !== undefined
          ? String(card.cooldownSeconds)
          : "3",
        card.maxPoints !== undefined
          ? String(card.maxPoints)
          : card.kind === "survey"
            ? "0"
            : "1000",
        card.penalty !== undefined ? String(card.penalty) : "0",
        card.media?.type ?? "",
        card.media?.url ?? "",
        correctAnsStr,
        card.options ? JSON.stringify(card.options) : "",
        card.reveal?.effect ?? "",
        card.reveal?.durationMs ? String(card.reveal.durationMs) : "",
        card.reveal?.trigger ?? "",
        card.reveal?.audience ?? "",
        card.extraJson ? JSON.stringify(card.extraJson) : "",
        card.interlude ? JSON.stringify(card.interlude) : "",
        card.questionEntrance?.preset ?? "",
        card.questionEntrance?.durationMs
          ? String(card.questionEntrance.durationMs)
          : "",
        card.background ? JSON.stringify(card.background) : "",
        card.audioCues ? JSON.stringify(card.audioCues) : "",
        card.stageAnimations ? JSON.stringify(card.stageAnimations) : "",
        card.questionDecoration ? JSON.stringify(card.questionDecoration) : "",
      ])

      for (let a = 0; a < card.answers.length; a += 1) {
        const ans = card.answers[a]
        answersData.push([
          card.key,
          String(a + 1),
          ans.text,
          ans.display ?? "text",
          ans.imageUrl ?? "",
          ans.alt ?? "",
        ])
      }
    } else {
      let title = ""
      let desc = ""
      let questionKeyCol = ""
      let durationMs = ""
      let durationSeconds = ""
      let advance = card.advance ?? "auto"
      let preset = ""
      let mediaType = ""
      let mediaUrl = ""
      let subtitle = ""
      let sceneConfigObj: Record<string, unknown> | undefined

      switch (card.kind) {
        case "transition":
          title = card.title ?? ""
          desc = card.description ?? ""
          durationMs = String(card.durationMs ?? 5000)
          break
        case "animation":
          title = card.title ?? ""
          preset = card.preset ?? "spotlight"
          durationMs = String(card.durationMs ?? 3000)
          if (
            card.lottieUrl ||
            card.lottieFit ||
            card.lottieLoop !== undefined ||
            card.lottieSpeed !== undefined
          ) {
            sceneConfigObj = {
              ...(card.lottieUrl ? { lottieUrl: card.lottieUrl } : {}),
              ...(card.lottieFit ? { lottieFit: card.lottieFit } : {}),
              ...(card.lottieLoop !== undefined
                ? { lottieLoop: card.lottieLoop }
                : {}),
              ...(card.lottieSpeed !== undefined
                ? { lottieSpeed: card.lottieSpeed }
                : {}),
            }
          }
          break
        case "media":
          title = card.title ?? ""
          subtitle = card.subtitle ?? ""
          mediaUrl = card.mediaUrl ?? ""
          mediaType = card.mediaType ?? "image"
          durationMs = String(card.durationMs ?? 5000)
          if (
            card.stageLayout !== undefined ||
            card.textOverlay !== undefined ||
            card.endBehavior !== undefined ||
            card.mediaEndFallbackMs !== undefined ||
            card.volume !== undefined ||
            card.loop !== undefined ||
            card.muted !== undefined ||
            card.showControls !== undefined ||
            card.mediaFit !== undefined ||
            card.overlayAnimations !== undefined
          ) {
            sceneConfigObj = {
              ...(card.stageLayout ? { stageLayout: card.stageLayout } : {}),
              ...(card.textOverlay !== undefined
                ? { textOverlay: card.textOverlay }
                : {}),
              ...(card.endBehavior ? { endBehavior: card.endBehavior } : {}),
              ...(card.mediaEndFallbackMs !== undefined
                ? { mediaEndFallbackMs: card.mediaEndFallbackMs }
                : {}),
              ...(card.volume !== undefined ? { volume: card.volume } : {}),
              ...(card.loop !== undefined ? { loop: card.loop } : {}),
              ...(card.muted !== undefined ? { muted: card.muted } : {}),
              ...(card.showControls !== undefined
                ? { showControls: card.showControls }
                : {}),
              ...(card.mediaFit ? { mediaFit: card.mediaFit } : {}),
              ...(card.overlayAnimations
                ? { overlayAnimations: card.overlayAnimations }
                : {}),
            }
          }
          break
        case "leaderboard":
          title = card.title ?? ""
          durationMs = String(card.durationMs ?? 5000)
          break
        case "interimResults":
          title = card.title ?? ""
          durationMs = String(card.durationMs ?? 5000)
          break
        case "answerRecap":
          title = card.title ?? ""
          questionKeyCol = card.startQuestionKey ?? ""
          preset = card.mode ?? "mostSelected"
          durationMs = String(card.durationMs ?? 8000)
          if (
            card.maxItemsPerPage !== undefined ||
            card.showCounts !== undefined ||
            card.showPercentages !== undefined
          ) {
            sceneConfigObj = {
              ...(card.maxItemsPerPage !== undefined
                ? { maxItemsPerPage: card.maxItemsPerPage }
                : {}),
              ...(card.showCounts !== undefined
                ? { showCounts: card.showCounts }
                : {}),
              ...(card.showPercentages !== undefined
                ? { showPercentages: card.showPercentages }
                : {}),
            }
          }
          break
        case "countdown":
          title = card.title ?? ""
          durationSeconds = String(card.durationSeconds ?? 10)
          break
        case "opening":
        case "closing": {
          title = card.title
          subtitle = card.subtitle ?? ""
          mediaUrl = card.mediaUrl ?? ""
          mediaType = card.mediaType ?? ""
          durationMs = String(card.durationMs ?? 5000)
          const bookendCfg: Record<string, unknown> = {
            ...(card.stageLayout ? { stageLayout: card.stageLayout } : {}),
            ...(card.mediaFit ? { mediaFit: card.mediaFit } : {}),
            ...(card.logoPosition ? { logoPosition: card.logoPosition } : {}),
            ...(card.textOverlay !== undefined
              ? { textOverlay: card.textOverlay }
              : {}),
            ...(card.endBehavior ? { endBehavior: card.endBehavior } : {}),
            ...(card.mediaEndFallbackMs !== undefined
              ? { mediaEndFallbackMs: card.mediaEndFallbackMs }
              : {}),
            ...(card.volume !== undefined ? { volume: card.volume } : {}),
            ...(card.loop !== undefined ? { loop: card.loop } : {}),
            ...(card.muted !== undefined ? { muted: card.muted } : {}),
            ...(card.showControls !== undefined
              ? { showControls: card.showControls }
              : {}),
            ...(card.lottieUrl ? { lottieUrl: card.lottieUrl } : {}),
            ...(card.lottieFit ? { lottieFit: card.lottieFit } : {}),
            ...(card.lottieLoop !== undefined
              ? { lottieLoop: card.lottieLoop }
              : {}),
            ...(card.lottieSpeed !== undefined
              ? { lottieSpeed: card.lottieSpeed }
              : {}),
            ...(card.overlayAnimations
              ? { overlayAnimations: card.overlayAnimations }
              : {}),
          }
          if (Object.keys(bookendCfg).length > 0) {
            sceneConfigObj = bookendCfg
          }
          break
        }
      }

      timelineData.push([
        orderNum,
        card.key,
        card.kind,
        title,
        desc,
        questionKeyCol,
        "",
        durationMs,
        durationSeconds,
        advance,
        preset,
        mediaType,
        mediaUrl,
        subtitle,
        card.extraJson ? JSON.stringify(card.extraJson) : "",
        card.background ? JSON.stringify(card.background) : "",
        card.audio ? JSON.stringify(card.audio) : "",
        card.stageAnimations ? JSON.stringify(card.stageAnimations) : "",
        sceneConfigObj ? JSON.stringify(sceneConfigObj) : "",
      ])
    }
  }

  // 5. Sheet: Settings
  const settingsData: string[][] = [
    ["scope", "targetKey", "property", "valueJson"],
  ]
  if (show.settings) {
    for (const s of show.settings) {
      settingsData.push([
        s.scope,
        s.targetKey,
        s.property,
        JSON.stringify(s.valueJson),
      ])
    }
  }

  // 6. Sheet: Help
  const helpData: string[][] = [
    ["Section", "Description (English)", "הסבר (עברית)"],
    [
      "Show",
      "Defines show title, defaults and game mode. Keep format=tada-show and version=1.",
      "מגדיר את כותרת השעשועון, ברירות מחדל ומצב המשחק. יש לשמור על format=tada-show ו-version=1.",
    ],
    [
      "Timeline",
      "Defines the exact card presentation sequence. Kinds: opening, countdown, quiz, survey, transition, animation, media, interimResults, leaderboard, closing.",
      "מגדיר את סדר הכרטיסים במופע. סוגים: פתיחה, ספירה לאחור, שאלה, סקר, מעברון, אנימציה, מדיה, תוצאות ביניים, דירוג, סיום.",
    ],
    [
      "Questions",
      "Question text, timer, scoring, media, optional column T (interludeJson) for per-question interludes, and optional columns U (entrancePreset: none|fade|slide-up|slide-side|zoom-soft|spotlight|curtain) and V (entranceDurationMs) for question stage entrance effects. For quiz, correctAnswers uses 1-based answer numbers (e.g. 2 or 1;3). Survey questions have no correct answers.",
      "שאלות, טיימר, ניקוד, מדיה, עמודה T למעברון בין שאלות, ועמודות U (אפקט כניסה) ו-V (משך אנימציה במילישניות) עבור אפקט כניסת השאלה לבמה. בשאלות טריוויה מציינים תשובות נכונות במספרים 1-5 (למשל 2 או 1;3). בסקר עמודת התשובות הנכונות ריקה.",
    ],
    [
      "Answers",
      "2-5 answer options per question. Display can be text, image, or both. For image or both, safe HTTPS or /media/ imageUrl and alt are mandatory.",
      "2 עד 5 תשובות לכל שאלה. תצוגה: text, image או both. בתמונות יש לספק קישור מאובטח וטקסט חלופי alt חובה.",
    ],
    [
      "Settings",
      "Optional advanced channel for leaderboard policies, audio cues, teams, and roster parameters.",
      "ערוץ הגדרות מתקדם עבור לוח תוצאות, מוזיקה ואפקטים, צוותים ומשתתפים.",
    ],
  ]

  const sheetShowXml = buildWorksheetXml(showData)
  const sheetTimelineXml = buildWorksheetXml(timelineData)
  const sheetQuestionsXml = buildWorksheetXml(questionsData)
  const sheetAnswersXml = buildWorksheetXml(answersData)
  const sheetSettingsXml = buildWorksheetXml(settingsData)
  const sheetHelpXml = buildWorksheetXml(helpData)

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet4.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet5.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet6.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`

  const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Show" sheetId="1" r:id="rId1"/>
    <sheet name="Timeline" sheetId="2" r:id="rId2"/>
    <sheet name="Questions" sheetId="3" r:id="rId3"/>
    <sheet name="Answers" sheetId="4" r:id="rId4"/>
    <sheet name="Settings" sheetId="5" r:id="rId5"/>
    <sheet name="Help" sheetId="6" r:id="rId6"/>
  </sheets>
</workbook>`

  const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/>
  <Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet4.xml"/>
  <Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet5.xml"/>
  <Relationship Id="rId6" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet6.xml"/>
</Relationships>`

  return createZipArchive([
    { name: "[Content_Types].xml", data: utf8Encoder.encode(contentTypesXml) },
    { name: "_rels/.rels", data: utf8Encoder.encode(relsXml) },
    { name: "xl/workbook.xml", data: utf8Encoder.encode(workbookXml) },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: utf8Encoder.encode(workbookRelsXml),
    },
    { name: "xl/worksheets/sheet1.xml", data: utf8Encoder.encode(sheetShowXml) },
    {
      name: "xl/worksheets/sheet2.xml",
      data: utf8Encoder.encode(sheetTimelineXml),
    },
    {
      name: "xl/worksheets/sheet3.xml",
      data: utf8Encoder.encode(sheetQuestionsXml),
    },
    {
      name: "xl/worksheets/sheet4.xml",
      data: utf8Encoder.encode(sheetAnswersXml),
    },
    {
      name: "xl/worksheets/sheet5.xml",
      data: utf8Encoder.encode(sheetSettingsXml),
    },
    { name: "xl/worksheets/sheet6.xml", data: utf8Encoder.encode(sheetHelpXml) },
  ])
}

/**
 * Generates the official blank downloadable `TADA_Show_Template_v1.xlsx` buffer.
 * Contains 6 sheets with standard headers, validation notes, and 0 questions/cards.
 */
export function generateTadaShowWorkbookBlankTemplate(): Uint8Array {
  const blankShow: TadaShowV1 = {
    format: "tada-show",
    version: 1,
    title: "New Tada Show",
    note: "Official multi-sheet blank template for Tada Studio",
    baseGameMode: "quiz",
    defaults: {
      newQuestionMode: "quiz",
      leaderboardPolicy: "cardOnly",
      advanceMode: "auto",
    },
    cards: [],
    settings: [],
  }

  return exportTadaShowWorkbook(blankShow)
}

/**
 * Generates the official downloadable `TADA_Show_Template_v1.xlsx` buffer.
 */
export function generateTadaShowWorkbookTemplate(): Uint8Array {
  const sampleShow: TadaShowV1 = {
    format: "tada-show",
    version: 1,
    title: "Tada Show Template (Sample)",
    note: "Official multi-sheet authoring template for Tada Studio",
    baseGameMode: "quiz",
    defaults: {
      newQuestionMode: "quiz",
      leaderboardPolicy: "cardOnly",
      advanceMode: "auto",
    },
    cards: [
      {
        key: "INTRO",
        kind: "opening",
        title: "Welcome to Tada Show!",
        subtitle: "The ultimate interactive live experience",
        durationMs: 4000,
        advance: "auto",
      },
      {
        key: "COUNTDOWN",
        kind: "countdown",
        title: "Game starts in...",
        durationSeconds: 5,
        advance: "auto",
      },
      {
        key: "Q01",
        kind: "quiz",
        questionType: "single",
        question: "Which landmark is in Paris?",
        category: "Geography",
        timeSeconds: 20,
        cooldownSeconds: 3,
        maxPoints: 1000,
        penalty: 0,
        answers: [
          {
            text: "Eiffel Tower",
            display: "both",
            imageUrl: "https://example.com/paris.png",
            alt: "Eiffel Tower in Paris",
          },
          { text: "Big Ben", display: "text" },
          { text: "Colosseum", display: "text" },
          { text: "Statue of Liberty", display: "text" },
        ],
        correctAnswers: [1],
      },
      {
        key: "TRANSITION",
        kind: "transition",
        title: "Audience Poll",
        description: "Let's hear what everyone thinks!",
        durationMs: 3000,
        advance: "auto",
      },
      {
        key: "POLL01",
        kind: "survey",
        questionType: "single",
        question: "What is your favorite weekend activity?",
        category: "Lifestyle",
        timeSeconds: 15,
        cooldownSeconds: 3,
        maxPoints: 0,
        penalty: 0,
        answers: [
          { text: "Outdoor sports", display: "text" },
          { text: "Reading & learning", display: "text" },
          { text: "Gaming & movies", display: "text" },
          { text: "Relaxing with friends", display: "text" },
        ],
      },
      {
        key: "INTERIM",
        kind: "interimResults",
        title: "Poll Results",
        durationMs: 5000,
        advance: "auto",
      },
      {
        key: "ANIM",
        kind: "animation",
        preset: "spotlight",
        title: "Next Round!",
        durationMs: 3000,
        advance: "auto",
      },
      {
        key: "Q02",
        kind: "quiz",
        questionType: "single",
        question: "How many days are in a leap year?",
        category: "Trivia",
        timeSeconds: 15,
        cooldownSeconds: 3,
        maxPoints: 1000,
        penalty: 0,
        answers: [
          { text: "365", display: "text" },
          { text: "366", display: "text" },
          { text: "364", display: "text" },
        ],
        correctAnswers: [2],
      },
      {
        key: "MEDIA_CLIP",
        kind: "media",
        mediaUrl: "https://example.com/celebration.mp4",
        mediaType: "video",
        title: "Special Clip",
        durationMs: 8000,
        advance: "manual",
      },
      {
        key: "LEADERBOARD",
        kind: "leaderboard",
        title: "Final Leaderboard",
        durationMs: 7000,
        advance: "manual",
      },
      {
        key: "OUTRO",
        kind: "closing",
        title: "Thank You for Playing!",
        subtitle: "See you next week",
        durationMs: 4000,
        advance: "auto",
      },
    ],
    settings: [],
  }

  return exportTadaShowWorkbook(sampleShow)
}

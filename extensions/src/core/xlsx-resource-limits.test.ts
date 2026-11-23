import { crc32, deflateRawSync } from "node:zlib"
import { describe, expect, it } from "vitest"
import { parseXlsxCells } from "./roster-import"
import { extractZipEntries } from "./show-workbook"

interface Entry {
  name: string
  data: Uint8Array
  method?: 0 | 8
  declaredSize?: number
}

function archive(entries: Entry[]): Uint8Array {
  const local: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0
  for (const entry of entries) {
    const name = Buffer.from(entry.name)
    const method = entry.method ?? 8
    const body =
      method === 8 ? deflateRawSync(entry.data) : Buffer.from(entry.data)
    const size = entry.declaredSize ?? entry.data.byteLength
    const header = Buffer.alloc(30)
    header.writeUInt32LE(0x04034b50, 0)
    header.writeUInt16LE(20, 4)
    header.writeUInt16LE(method, 8)
    header.writeUInt32LE(crc32(entry.data), 14)
    header.writeUInt32LE(body.byteLength, 18)
    header.writeUInt32LE(size, 22)
    header.writeUInt16LE(name.byteLength, 26)
    local.push(header, name, body)

    const record = Buffer.alloc(46)
    record.writeUInt32LE(0x02014b50, 0)
    record.writeUInt16LE(20, 4)
    record.writeUInt16LE(20, 6)
    record.writeUInt16LE(method, 10)
    record.writeUInt32LE(crc32(entry.data), 16)
    record.writeUInt32LE(body.byteLength, 20)
    record.writeUInt32LE(size, 24)
    record.writeUInt16LE(name.byteLength, 28)
    record.writeUInt32LE(offset, 42)
    central.push(record, name)
    offset += header.byteLength + name.byteLength + body.byteLength
  }
  const directory = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(directory.byteLength, 12)
  end.writeUInt32LE(offset, 16)

  return Buffer.concat([...local, directory, end])
}

const worksheet: Entry = {
  name: "xl/worksheets/sheet1.xml",
  data: Buffer.from(
    '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>שם</t></is></c></row></sheetData></worksheet>',
  ),
}
const readers = [
  ["roster", (bytes: Uint8Array) => parseXlsxCells(bytes)],
  ["show", (bytes: Uint8Array) => extractZipEntries(bytes)],
] as const

describe.each(readers)("%s XLSX resource limits", (_name, read) => {
  it("accepts real stored and deflated entries with their exact declared size", () => {
    expect(() =>
      read(
        archive([
          worksheet,
          { name: "notes.txt", data: Buffer.from("אבג"), method: 0 },
        ]),
      ),
    ).not.toThrow()
  })

  it("rejects aggregate expanded data above25MiB before retaining another entry", () => {
    const megabyte = Buffer.alloc(1024 * 1024, 65)
    const bytes = archive([
      worksheet,
      ...Array.from({ length: 26 }, (_, index) => ({
        name: `padding-${index}.xml`,
        data: megabyte,
      })),
    ])
    expect(bytes.byteLength).toBeLessThan(5 * 1024 * 1024)
    expect(() => read(bytes)).toThrow("errors:extensions.xlsxTooLarge")
  })

  it("does not trust a tiny declared size for a larger deflated body", () => {
    const bytes = archive([
      worksheet,
      {
        name: "padding.xml",
        data: Buffer.alloc(1024 * 1024, 65),
        declaredSize: 1,
      },
    ])
    expect(() => read(bytes)).toThrow("errors:extensions.xlsxTooLarge")
  })

  it("rejects a stored entry whose actual size disagrees with the directory", () => {
    expect(() =>
      read(
        archive([
          worksheet,
          {
            name: "padding.xml",
            data: Buffer.from("abc"),
            method: 0,
            declaredSize: 1,
          },
        ]),
      ),
    ).toThrow("errors:extensions.corruptXlsxFile")
  })

  it("rejects a deflated entry shorter than its claimed expanded size", () => {
    expect(() =>
      read(
        archive([
          worksheet,
          { name: "padding.xml", data: Buffer.from("abc"), declaredSize: 100 },
        ]),
      ),
    ).toThrow("errors:extensions.corruptXlsxFile")
  })

  it("bounds the directory entry count even when every payload is empty", () => {
    expect(() =>
      read(
        archive([
          worksheet,
          ...Array.from({ length: 50 }, (_, index) => ({
            name: `empty-${index}.xml`,
            data: new Uint8Array(),
          })),
        ]),
      ),
    ).toThrow("errors:extensions.corruptXlsxFile")
  })
})

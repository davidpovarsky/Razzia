import { createHash } from "node:crypto"
import type { DatabaseSync } from "node:sqlite"
import { ToolError } from "../server/errors.ts"
import {
  COLUMNS,
  PRIMARY_INDEX,
  SCHEMA_OBJECT_SHA256,
  TABLE_SQL,
} from "./schema-manifest.ts"

const unavailable = () => new ToolError("DEPENDENCY_UNAVAILABLE")
const equal = (actual: unknown, expected: unknown) =>
  JSON.stringify(actual) === JSON.stringify(expected)

export function initialize(db: DatabaseSync, accountId: string) {
  db.exec("PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; BEGIN IMMEDIATE")
  try {
    // Exact original producer1 DDL, including checks and implicit PK indexes.
    db.exec(Object.values(TABLE_SQL).join(";\n") + ";")
    db.prepare("INSERT INTO metadata(owner,version) VALUES(?,1)").run(accountId)
    db.exec("PRAGMA user_version=1; COMMIT")
  } catch (error) {
    db.exec("ROLLBACK")
    throw error
  }
}

function inspectStructure(db: DatabaseSync) {
  const rows = db.prepare(
    "SELECT type,name,tbl_name,sql FROM sqlite_schema LIMIT 8",
  ).all()
  const objects = rows.map((row) => {
    if (
      typeof row.type !== "string" ||
      typeof row.name !== "string" ||
      typeof row.tbl_name !== "string" ||
      (row.sql !== null && typeof row.sql !== "string")
    ) throw unavailable()
    return [row.type, row.name, row.tbl_name, row.sql] as const
  }).sort((a, b) => a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0)
  // Hash exact stored object definitions. Never trim/normalize arbitrary DDL
  // into a supported version. Triggers/views/extra tables/indexes also fail.
  const fingerprint = createHash("sha256").update(JSON.stringify(objects)).digest("hex")
  if (fingerprint !== SCHEMA_OBJECT_SHA256) throw unavailable()

  for (const table of Object.keys(TABLE_SQL) as Array<keyof typeof TABLE_SQL>) {
    const columns = db.prepare(
      'SELECT cid,name,type,"notnull",dflt_value,pk,hidden FROM pragma_table_xinfo(?) ORDER BY cid',
    ).all(table).map((row) => [
      row.cid, row.name, row.type, row.notnull, row.dflt_value, row.pk, row.hidden,
    ])
    const expected = COLUMNS[table].map((column, cid) => [cid, ...column])
    if (!equal(columns, expected)) throw unavailable()

    const indexes = db.prepare(
      'SELECT name,"unique",origin,partial FROM pragma_index_list(?) ORDER BY name COLLATE BINARY',
    ).all(table).map((row) => [row.name, row.unique, row.origin, row.partial])
    const index = PRIMARY_INDEX[table]
    if (!equal(indexes, index ? [[index, 1, "pk", 0]] : [])) throw unavailable()
    if (index) {
      const keys = COLUMNS[table].map((column, cid) => ({ column, cid }))
        .filter(({ column }) => column[4] > 0)
        .sort((a, b) => a.column[4] - b.column[4])
      const expectedIndex: unknown[][] = keys.map(({ column, cid }, seq) => [
        seq, cid, column[0], 0, "BINARY", 1,
      ])
      expectedIndex.push([keys.length, -1, null, 0, "BINARY", 0])
      const actualIndex = db.prepare(
        'SELECT seqno,cid,name,"desc",coll,"key" FROM pragma_index_xinfo(?) ORDER BY seqno',
      ).all(index).map((row) => [
        row.seqno, row.cid, row.name, row.desc, row.coll, row.key,
      ])
      if (!equal(actualIndex, expectedIndex)) throw unavailable()
    }
  }
}

export function inspect(db: DatabaseSync, accountId: string) {
  const version = db.prepare("PRAGMA user_version").get()
  const journal = db.prepare("PRAGMA journal_mode").get()
  if (version?.user_version !== 1 || journal?.journal_mode !== "delete") throw unavailable()
  // Attest the schema before selecting any declared application table.
  inspectStructure(db)
  const owners = db.prepare("SELECT owner,version FROM metadata").all()
  const integrity = db.prepare("PRAGMA quick_check(1)").get()
  if (
    owners.length !== 1 || owners[0]?.owner !== accountId ||
    owners[0]?.version !== 1 || integrity?.quick_check !== "ok"
  ) throw unavailable()
}

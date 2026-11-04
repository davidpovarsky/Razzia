import { mkdirSync } from "node:fs"
import { join } from "node:path"
import { getAccountDb } from "./account-db"
import { getPath } from "./config"

export type AccountProfile = { id: string; email: string; verified: boolean }
export function getAccount(id: string): AccountProfile | null {
  const record = getAccountDb()
    .prepare("SELECT id,email,verified_at,disabled FROM accounts WHERE id=?")
    .get(id) as
    | {
        id: string
        email: string
        verified_at: number | null
        disabled: number
      }
    | undefined
  if (!record || !record.verified_at || record.disabled) return null
  return { id: record.id, email: record.email, verified: true }
}
export function ensureAccountStorage(id: string): void {
  const root = getPath("tenants/" + id)
  for (const folder of ["quizz", "results", "media", "extensions/quizzes"])
    mkdirSync(join(root, folder), { recursive: true })
}

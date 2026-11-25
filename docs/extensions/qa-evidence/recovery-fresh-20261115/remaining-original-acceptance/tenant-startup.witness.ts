import fs from "node:fs"
import path from "node:path"
import { createHash } from "node:crypto"
import { fileURLToPath } from "node:url"
import { expect, it } from "vitest"
import * as native from "../../../../../packages/socket/src/services/config"
import { activeAccount, withAccount } from "../../../../../packages/socket/src/services/account-scope"
import { recoverStartupJournals } from "../../../../../extensions/src/server/media-library"
import { createCreationFixture, removeCreationFixture } from "../../../../../extensions/src/server/storage/creation-fixture"

const evidence = fileURLToPath(new URL("./", import.meta.url))
const owner = "00000000-0000-4000-8000-0000000000A1"
const sha = (file: string) => createHash("sha256").update(fs.readFileSync(file)).digest("hex")

// Isolated diagnostic, excluded from ordinary product test discovery. These
// assertions encode the original startup fail-closed requirement and may fail.
it.each(["quiz-save", "media-delete"] as const)(
  "blocks ownerless startup with an unresolved %s journal in an enabled tenant",
  async (family) => {
    const previous = { config: process.env.CONFIG_PATH, accounts: process.env.TADAZZ_ACCOUNTS_ENABLED }
    const fixture = createCreationFixture()
    let receipt: Record<string, unknown> = { family, state: "STARTED" }
    try {
      process.env.TADAZZ_ACCOUNTS_ENABLED = "true"
      const tenantRoot = await withAccount(owner, () => native.getPath())
      expect(tenantRoot).toBe(path.join(fixture.root, "tenants", owner))
      const journalRoot = path.join(tenantRoot, "extensions/quizzes/.journal", ...(family === "media-delete" ? ["media-delete"] : []))
      fs.mkdirSync(journalRoot, { recursive: true, mode: 0o700 })
      const journal = path.join(journalRoot, "synthetic-unresolved.journal.json")
      fs.writeFileSync(journal, "{malformed synthetic journal", { flag: "wx" })
      const before = sha(journal)
      expect(activeAccount()).toBeUndefined()
      expect(native.getPath()).toBe(fixture.root)
      const options = { getPath: native.getPath, updateQuizz: native.updateQuizz, deleteQuizz: native.deleteQuizz }
      let globalResult: unknown, globalError: string | undefined
      try { globalResult = recoverStartupJournals(options) }
      catch (error) { globalError = error instanceof Error ? error.message : String(error) }
      const tenantResult = await withAccount(owner, () => recoverStartupJournals({ ...options, throwOnUnresolved: false }))
      expect(tenantResult.status).toBe("failed")
      expect(tenantResult.unresolvedCount).toBe(1)
      expect(sha(journal)).toBe(before)
      receipt = { family, owner, state: "MEASURED", root: fixture.root, tenantRoot,
        globalResult, globalError, tenantResult, preservedJournalSha256: before,
        currentTenantScopePositiveControlPassed: true }
      // Actual production startup uses this ownerless options object and must
      // throw before listen when critical existing tenant evidence is pending.
      expect(globalError ?? "", JSON.stringify(receipt)).toMatch(/startup blocked/i)
      receipt.state = "PASS"
    } finally {
      const attempt = process.env.RECOVERY_WITNESS_ATTEMPT
      if (!attempt || !/^[0-9]+$/u.test(attempt)) throw new Error("Require an explicit unique diagnostic attempt")
      fs.writeFileSync(path.join(evidence, `${family}.attempt${attempt}.receipt.json`), JSON.stringify(receipt, null, 2) + "\n", { flag: "wx" })
      removeCreationFixture(fixture.root, fixture.token)
      if (previous.config === undefined) delete process.env.CONFIG_PATH
      else process.env.CONFIG_PATH = previous.config
      if (previous.accounts === undefined) delete process.env.TADAZZ_ACCOUNTS_ENABLED
      else process.env.TADAZZ_ACCOUNTS_ENABLED = previous.accounts
    }
  },
)

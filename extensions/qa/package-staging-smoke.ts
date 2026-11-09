/* oxlint-disable no-await-in-loop -- Private staging objects are audited sequentially within a fixed resource budget. */
import fs from "node:fs"
import path from "node:path"
import { z } from "zod"
import { PackageStore, packageSha } from "../src/server/packages/index"

const config = fs.realpathSync(process.argv[2] ?? "")

if (
  process.platform !== "linux" ||
  process.env.TADAZZ_REMOTE_QA !== "1" ||
  !config.startsWith("/evidence/package-staging-")
) {
  throw new Error("Isolated package staging data required")
}

const store = new PackageStore(
  path.join(config, "extensions/packages"),
  "read-only-audit-no-signing-authority",
  (tenant) => path.join(config, "tenants", tenant),
  { readOnly: true },
)

try {
  const rows = z
    .array(
      z.object({ tenant: z.string(), upload: z.string(), games: z.string() }),
    )
    .parse(
      store.db
        .prepare(
          "SELECT tenant,upload,games FROM packages WHERE phase='installed'",
        )
        .all(),
    )

  if (!rows.length) {
    throw new Error("No installed packages to verify")
  }

  let games = 0,
    objects = 0
  for (const installed of rows) {
    const principal = {
      tenantId: installed.tenant,
      userId: "private-staging-read-only-audit",
      grants: [],
    }
    const row = store.own(principal, installed.upload)
    const pkg = store.readPackage(row)
    for (const file of pkg.manifest.files.filter(
      (f) => !["source", "style", "descriptor", "font"].includes(f.kind),
    )) {
      const bytes = fs.readFileSync(
        path.join(store.tenantRoot(installed.tenant), "objects", file.sha256),
      )

      if (packageSha(bytes) !== file.sha256) {
        throw new Error("Persisted object digest mismatch")
      }

      objects += 1
    }
    for (const id of z.array(z.uuid()).parse(JSON.parse(installed.games))) {
      for (const dir of ["quizz", "extensions/quizzes"]) {
        JSON.parse(
          fs.readFileSync(
            path.join(config, "tenants", installed.tenant, dir, `${id}.json`),
            "utf8",
          ),
        )
      }
      games += 1
    }
  }
  fs.writeFileSync(
    `${config}-smoke.json`,
    JSON.stringify(
      {
        passed: true,
        installedVersions: rows.length,
        games,
        verifiedObjects: objects,
        readOnly: true,
      },
      null,
      2,
    ),
  )
  console.log(
    JSON.stringify({
      passed: true,
      installedVersions: rows.length,
      games,
      verifiedObjects: objects,
    }),
  )
} finally {
  store.close()
}

import fs from "node:fs"
import os from "node:os"
import path from "node:path"

/** Runner-owned scratch only. Durable qualification MUST supply a persistent
 * same-filesystem bind, not an in-memory /tmp; default is for unqualified tests.
 */
export const creationFixtureParent = () => {
  const directory = path.resolve(process.env.C1_FIXTURE_ROOT ?? os.tmpdir())
  if (fs.realpathSync(directory) !== directory)
    throw new Error("Linked C1 fixture parent rejected")
  return directory
}

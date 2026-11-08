/** Downstream configuration root discovery and tenant boundary. */
import fs from "node:fs"
import { resolve } from "node:path"
import { resolveTenantFile } from "./account-scope"

export const resolveConfigRoot = () => {
  const configPath = process.env.CONFIG_PATH

  if (configPath) {
    return resolve(configPath)
  }

  if (fs.existsSync(resolve(process.cwd(), "config"))) {
    return resolve(process.cwd(), "config")
  }

  if (fs.existsSync(resolve(process.cwd(), "../config"))) {
    return resolve(process.cwd(), "../config")
  }

  return resolve(process.cwd(), "../../config")
}

export const resolveConfigFile = (path = "") =>
  resolveTenantFile(resolveConfigRoot(), path)

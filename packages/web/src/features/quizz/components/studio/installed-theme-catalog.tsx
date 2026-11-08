import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"
import {
  createShowThemeRegistry,
  showThemeRegistry,
  type ShowThemeRegistry,
  type ShowThemeDefinition,
} from "@razzia/extensions/core"
import Loader from "@razzia/web/components/Loader"
import { ensureSession, getClientId } from "@razzia/web/lib/session"

interface Catalog {
  registry: ShowThemeRegistry
  available: readonly ShowThemeDefinition[]
}
const bundled: Catalog = {
  registry: showThemeRegistry,
  available: showThemeRegistry.list(),
}
const ThemeCatalogContext = createContext<Catalog>(bundled)

export const useInstalledThemeCatalog = () =>
  useContext(ThemeCatalogContext).registry

export const useAvailableShowThemes = () =>
  useContext(ThemeCatalogContext).available

/** Each mounted account owns its catalog; no global registry or cross-account cache. */
export function InstalledThemeCatalogProvider({
  children,
}: {
  children: ReactNode
}) {
  const owner = getClientId()
  const [result, setResult] = useState<{
    owner: string
    catalog: Catalog
  } | null>(null)
  useEffect(() => {
    let alive = true
    void ensureSession()
      .then(async ({ token }) => {
        const response = await fetch("/api/themes/catalog", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
          signal: AbortSignal.timeout(10_000),
        })

        // Installer is OFF.
        if (response.status === 404) {
          return bundled
        }

        if (!response.ok) {
          throw new Error("Theme catalog unavailable")
        }

        const body = (await response.json()) as {
          definitions?: unknown
          available?: Array<{ id: string; version: string }>
        }

        if (
          !Array.isArray(body.definitions) ||
          !Array.isArray(body.available)
        ) {
          throw new Error("Invalid theme catalog")
        }

        const registry = createShowThemeRegistry(body.definitions)
        const offered = new Set(
          body.available.map((value) => `${value.id}@${value.version}`),
        )

        return {
          registry,
          available: registry
            .list()
            .filter(
              (value) =>
                Boolean(showThemeRegistry.get(value.id, value.version)) ||
                offered.has(`${value.id}@${value.version}`),
            ),
        }
      })
      .catch(() => bundled)
      .then((catalog) => {
        if (alive) {
          setResult({ owner, catalog })
        }
      })

    return () => {
      alive = false
    }
  }, [owner])

  if (!result || result.owner !== owner) {
    return <Loader />
  }

  return (
    <ThemeCatalogContext.Provider value={result.catalog}>
      {children}
    </ThemeCatalogContext.Provider>
  )
}

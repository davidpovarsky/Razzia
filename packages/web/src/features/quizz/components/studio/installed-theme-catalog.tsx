import {
  createContext,
  useCallback,
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
interface CatalogState extends Catalog {
  failed: boolean
  retry: () => void
}
const bundled: Catalog = {
  registry: showThemeRegistry,
  available: showThemeRegistry.list(),
}
const ThemeCatalogContext = createContext<CatalogState>({
  ...bundled,
  failed: false,
  retry: () => undefined,
})

export const useInstalledThemeCatalog = () =>
  useContext(ThemeCatalogContext).registry

export const useAvailableShowThemes = () =>
  useContext(ThemeCatalogContext).available

export const useThemeCatalogStatus = () => useContext(ThemeCatalogContext)

/** Each mounted account owns its catalog; no global registry or cross-account cache. */
export function InstalledThemeCatalogProvider({
  children,
}: {
  children: ReactNode
}) {
  const owner = getClientId()
  const [catalogRevision, setCatalogRevision] = useState(0)
  const retry = useCallback(() => setCatalogRevision((value) => value + 1), [])
  useEffect(() => {
    window.addEventListener("tadazz:packages-changed", retry)

    return () => window.removeEventListener("tadazz:packages-changed", retry)
  }, [retry])
  const [result, setResult] = useState<{
    owner: string
    catalog: Catalog
    failed: boolean
  } | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    void ensureSession()
      .then(async ({ token }) => {
        const response = await fetch("/api/themes/catalog", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(10_000),
          ]),
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
      .then((catalog) => {
        if (!controller.signal.aborted && getClientId() === owner) {
          setResult({ owner, catalog, failed: false })
        }
      })
      .catch(() => {
        if (!controller.signal.aborted && getClientId() === owner) {
          setResult((previous) => ({
            owner,
            catalog: previous?.owner === owner ? previous.catalog : bundled,
            failed: true,
          }))
        }
      })

    return () => controller.abort()
  }, [owner, catalogRevision])

  if (!result || result.owner !== owner) {
    return <Loader />
  }

  return (
    <ThemeCatalogContext.Provider
      value={{ ...result.catalog, failed: result.failed, retry }}
    >
      {children}
    </ThemeCatalogContext.Provider>
  )
}

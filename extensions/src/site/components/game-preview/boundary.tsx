import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { useReducedMotion } from "motion/react"
import { useTranslation } from "react-i18next"
import type { GamePreviewProvider, PreviewPreferences } from "./contracts"
import { createPreviewCoordinator } from "./coordinator"
import {
  createPreviewText,
  previewLocale,
  registerPreviewResources,
  type PreviewText,
} from "./i18n"

interface PreviewPage {
  enabled: boolean
  coordinator: ReturnType<typeof createPreviewCoordinator>
  provider?: GamePreviewProvider
  preferences: Readonly<PreviewPreferences>
  text: PreviewText
}

const Context = createContext<PreviewPage | null>(null)

/** OFF by default. Nested consumers inherit the one page owner and trusted adapter. */
export function InlineGamePreviewBoundary({
  children,
  enabled,
  provider,
  routeKey,
}: {
  children: ReactNode
  enabled?: boolean
  provider?: GamePreviewProvider
  routeKey?: string | object
}) {
  const parent = useContext(Context)
  const [coordinator] = useState(createPreviewCoordinator)
  const { i18n } = useTranslation()
  const reducedMotion = useReducedMotion()
  const locale = previewLocale(i18n)
  const optedIn =
    enabled ?? import.meta.env.VITE_TADAZZ_INLINE_GAME_PREVIEW === "true"
  const page = useMemo<PreviewPage>(
    () =>
      parent ?? {
        enabled: optedIn,
        coordinator,
        provider,
        preferences: Object.freeze({
          locale,
          reducedMotion: Boolean(reducedMotion),
        }),
        text: createPreviewText(i18n, locale),
      },
    [parent, optedIn, coordinator, provider, locale, reducedMotion, i18n],
  )
  const previousRoute = useRef(routeKey)

  useLayoutEffect(() => {
    if (page.enabled) {
      registerPreviewResources(i18n)
    }
  }, [page.enabled, i18n])

  useLayoutEffect(() => {
    if (previousRoute.current !== routeKey) {
      previousRoute.current = routeKey
      page.coordinator.dispose()
    }
  }, [routeKey, page.coordinator])

  useLayoutEffect(
    () => () => {
      if (!parent) {
        coordinator.dispose()
      }
    },
    [parent, coordinator],
  )

  return <Context.Provider value={page}>{children}</Context.Provider>
}

export const useGamePreviewPage = () => useContext(Context)

import type {
  ScopedThemeOverrides,
  ShowThemeSelection,
  ThemeOverrides,
} from "./selection"

export function collectThemeMediaUrls(overrides?: ThemeOverrides): string[] {
  if (!overrides) {
    return []
  }

  const groups = [overrides, ...Object.values(overrides.roles ?? {})]

  return [
    ...new Set(
      groups.flatMap((group) =>
        [
          ...Object.values(group.slots ?? {}),
          ...Object.values(group.audio ?? {}),
        ].flatMap((selection) =>
          selection.mediaUrl ? [selection.mediaUrl] : [],
        ),
      ),
    ),
  ]
}

/** Detach only media selections, retaining IDs, variants, mute and other scopes. */
export function detachThemeMedia(
  overrides: ThemeOverrides,
  url: string,
): ThemeOverrides {
  const copy = structuredClone(overrides)
  for (const group of [copy, ...Object.values(copy.roles ?? {})]) {
    for (const selection of [
      ...Object.values(group.slots ?? {}),
      ...Object.values(group.audio ?? {}),
    ]) {
      if (selection.mediaUrl === url) {
        delete selection.mediaUrl
      }
    }
  }

  return copy
}

interface ThemeMediaExtras {
  defaults?: {
    showTheme?: ShowThemeSelection
    themeHistory?: ShowThemeSelection[]
  }
  perQuestion?: Record<string, { themeOverrides?: ScopedThemeOverrides }>
  scenes?: Record<string, { themeOverrides?: ScopedThemeOverrides }>
}

export function collectThemeExtrasMedia(extras: ThemeMediaExtras): string[] {
  return [
    ...new Set([
      ...collectThemeMediaUrls(extras.defaults?.showTheme?.overrides),
      ...(extras.defaults?.themeHistory ?? []).flatMap((item) =>
        collectThemeMediaUrls(item.overrides),
      ),
      ...[
        ...Object.values(extras.perQuestion ?? {}),
        ...Object.values(extras.scenes ?? {}),
      ].flatMap((item) =>
        [item.themeOverrides, ...(item.themeOverrides?.history ?? [])].flatMap(
          (scope) => collectThemeMediaUrls(scope?.overrides),
        ),
      ),
    ]),
  ]
}

export function detachThemeExtrasMedia<T extends ThemeMediaExtras>(
  extras: T,
  url: string,
): T {
  if (!collectThemeExtrasMedia(extras).includes(url)) {
    return extras
  }

  const next = structuredClone(extras)
  const theme = next.defaults?.showTheme

  if (theme) {
    theme.overrides = detachThemeMedia(theme.overrides, url)
  }

  for (const archived of next.defaults?.themeHistory ?? []) {
    archived.overrides = detachThemeMedia(archived.overrides, url)
  }
  for (const item of [
    ...Object.values(next.perQuestion ?? {}),
    ...Object.values(next.scenes ?? {}),
  ]) {
    if (item.themeOverrides) {
      item.themeOverrides.overrides = detachThemeMedia(
        item.themeOverrides.overrides,
        url,
      )
    }

    for (const archived of item.themeOverrides?.history ?? []) {
      archived.overrides = detachThemeMedia(archived.overrides, url)
    }
  }

  return next
}

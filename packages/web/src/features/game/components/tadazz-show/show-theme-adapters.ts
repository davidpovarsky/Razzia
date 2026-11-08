import { TadazzShowView } from "./TadazzShowView"
import {
  ClassicShowThemePreview,
  type ShowThemePreviewProps,
} from "./ClassicShowThemePreview"
import type { ComponentType } from "react"
import type { ShowThemeDefinition } from "@razzia/extensions/core"

// Trusted, source-controlled React adapters. Imported manifests cannot add code.
export const SHOW_THEME_ADAPTERS = {
  "tadazz-classic-stage": TadazzShowView,
} as const

export const SHOW_THEME_PREVIEW_ADAPTERS: Readonly<
  Record<
    ShowThemeDefinition["rendererId"],
    ComponentType<ShowThemePreviewProps>
  >
> = {
  "tadazz-classic-stage": ClassicShowThemePreview,
}

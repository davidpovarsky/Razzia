import type { CSSProperties } from "react"

export const PLATFORM_TOKEN_VERSION = "1.0.0"
export const PLATFORM_CONTEXTS = [
  "platform.marketing",
  "platform.studio",
  "platform.host",
] as const
export type PlatformContext = (typeof PLATFORM_CONTEXTS)[number]
export type PlatformAppearance = "dark" | "light"

export const PRIMITIVE_TOKENS = {
  color: {
    ink: "#171029",
    midnight: "#0b0718",
    aubergine: "#10091e",
    purple: "#201333",
    elevated: "#2b1b3b",
    violet: "#9567d4",
    border: "#704399",
    lime: "#e7ff37",
    white: "#fbf7ff",
    muted: "#c5b0dc",
    danger: "#ffa7bf",
    success: "#7be0b0",
    warning: "#ffe08a",
    info: "#b7d4ff",
    paper: "#f7f4ff",
    snow: "#ffffff",
    lilac: "#ede6f8",
    lightText: "#241431",
    lightMuted: "#60526f",
    lightBorder: "#81738f",
    deepViolet: "#5d2b9c",
    deepDanger: "#9e2046",
    deepSuccess: "#146347",
    deepWarning: "#7a4c00",
    deepInfo: "#254c93",
  },
  font: {
    family: '"Rubik Variable", sans-serif',
    mono: 'ui-monospace, "Cascadia Code", monospace',
  },
  type: {
    caption: "0.75rem",
    label: "0.875rem",
    body: "1rem",
    title: "1.5rem",
    display: "clamp(2rem, 4vw, 4rem)",
  },
  weight: { regular: "400", label: "650", heading: "800" },
  space: {
    1: "0.25rem",
    2: "0.5rem",
    3: "0.75rem",
    4: "1rem",
    5: "1.25rem",
    6: "1.5rem",
    8: "2rem",
    12: "3rem",
  },
  radius: {
    small: "0.5rem",
    control: "0.75rem",
    card: "1.25rem",
    dialog: "1.5rem",
    round: "999px",
  },
  icon: { small: "1rem", normal: "1.25rem", large: "1.5rem" },
  shadow: {
    raised: "0 0.5rem 1.5rem #0003",
    dialog: "0 1.875rem 5rem #0008",
    focus: "0 0 0 0.1875rem #e7ff3740",
  },
  motion: {
    instant: "0ms",
    fast: "120ms",
    normal: "180ms",
    slow: "280ms",
    layout: "220ms",
    spinner: "800ms",
    easing: "cubic-bezier(.2,0,0,1)",
    exit: "cubic-bezier(.4,0,1,1)",
  },
  spring: { stiffness: 320, damping: 30, mass: 1 },
  z: {
    overlay: "1000",
    dialog: "1010",
    menu: "1020",
    tooltip: "1030",
    toast: "1040",
  },
  breakpoint: { phone: 480, tablet: 768, desktop: 1024, wide: 1440 },
} as const

const c = PRIMITIVE_TOKENS.color
const shared = {
  background: c.midnight,
  surface: c.purple,
  elevated: c.elevated,
  text: c.white,
  mutedText: c.muted,
  border: c.border,
  action: c.lime,
  actionText: c.ink,
  focus: c.lime,
  danger: c.danger,
  dangerText: c.ink,
  success: c.success,
  warning: c.warning,
  info: c.info,
  overlay: "#070312b3",
} as const

export const SEMANTIC_TOKENS = {
  "platform.marketing": { ...shared },
  "platform.studio": { ...shared },
  "platform.host": { ...shared, background: c.aubergine },
} as const satisfies Record<PlatformContext, Record<string, string>>
export type SemanticToken = keyof typeof shared
export type TokenOverrides = Partial<Record<SemanticToken, string>>
/** Platform preview/accessibility variant; never applied to editor.current. */
export const LIGHT_SEMANTIC_TOKENS: Record<SemanticToken, string> = {
  background: c.paper,
  surface: c.snow,
  elevated: c.lilac,
  text: c.lightText,
  mutedText: c.lightMuted,
  border: c.lightBorder,
  action: c.deepViolet,
  actionText: c.snow,
  focus: c.deepViolet,
  danger: c.deepDanger,
  dangerText: c.snow,
  success: c.deepSuccess,
  warning: c.deepWarning,
  info: c.deepInfo,
  overlay: shared.overlay,
}

export const COMPONENT_TOKENS = {
  menu: { offset: "8px" },
  tooltip: { delay: "300ms" },
  switch: {
    width: "2.75rem",
    height: "1.75rem",
    thumbSize: "1.25rem",
    offset: "0.1875rem",
  },
  button: {
    minHeight: "2.75rem",
    gap: PRIMITIVE_TOKENS.space[2],
    radius: PRIMITIVE_TOKENS.radius.control,
  },
  input: { minHeight: "2.75rem", radius: PRIMITIVE_TOKENS.radius.control },
  dialog: {
    width: "36rem",
    maxHeight: "min(88dvh, 60rem)",
    padding: PRIMITIVE_TOKENS.space[6],
  },
  table: { rowMinHeight: "2.75rem" },
} as const

const motionSeconds = (duration: string) => Number.parseFloat(duration) / 1000
const motionBezier = (easing: string) =>
  easing
    .slice(easing.indexOf("(") + 1, -1)
    .split(",")
    .map(Number) as [number, number, number, number]
/** React motion values generated from the same platform token source as CSS. */
export const PLATFORM_MOTION = {
  duration: {
    fast: motionSeconds(PRIMITIVE_TOKENS.motion.fast),
    normal: motionSeconds(PRIMITIVE_TOKENS.motion.normal),
    layout: motionSeconds(PRIMITIVE_TOKENS.motion.layout),
  },
  ease: {
    standard: motionBezier(PRIMITIVE_TOKENS.motion.easing),
    exit: motionBezier(PRIMITIVE_TOKENS.motion.exit),
  },
  spring: { type: "spring" as const, ...PRIMITIVE_TOKENS.spring },
  reduced: { duration: 0 },
} as const

/** Documentation only. Neither context is accepted by runtime platform scopes. */
export const INDEPENDENT_CONTEXTS = {
  "editor.current":
    "Frozen original Razzia/Rubik light editor; no runtime import or application of platform tokens.",
  "show.theme":
    "Existing immutable manifest + resolver; theme → show → role → card/scene → card-role precedence remains authoritative.",
} as const

const kebab = (key: string) =>
  key.replace(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`)
export function platformVariables(
  context: PlatformContext,
  overrides: TokenOverrides = {},
  appearance: PlatformAppearance = "dark",
): Record<string, string> {
  if (!PLATFORM_CONTEXTS.includes(context))
    throw new Error("Platform tokens cannot target editor or show contexts")
  const semantic = Object.fromEntries(
    Object.entries({
      ...(appearance === "light"
        ? LIGHT_SEMANTIC_TOKENS
        : SEMANTIC_TOKENS[context]),
      ...overrides,
    }).map(([key, value]) => [`--tds-${kebab(key)}`, value]),
  )
  const primitive = Object.fromEntries(
    Object.entries(PRIMITIVE_TOKENS).flatMap(([group, values]) =>
      Object.entries(values).map(([key, value]) => [
        `--tds-${group}-${kebab(key)}`,
        String(value),
      ]),
    ),
  )
  const component = Object.fromEntries(
    Object.entries(COMPONENT_TOKENS).flatMap(([group, values]) =>
      Object.entries(values).map(([key, value]) => [
        `--tds-${group}-${kebab(key)}`,
        value,
      ]),
    ),
  )
  return { ...primitive, ...component, ...semantic }
}

export const platformStyle = (
  context: PlatformContext,
  overrides?: TokenOverrides,
) => platformVariables(context, overrides) as CSSProperties
export const platformOverrideStyle = (overrides: TokenOverrides = {}) =>
  Object.fromEntries(
    Object.entries(overrides).map(([key, value]) => [
      `--tds-${kebab(key)}`,
      value,
    ]),
  ) as CSSProperties

/** All selectors require an owned scope. There are no root/body/preflight rules. */
export const platformTokenCss =
  PLATFORM_CONTEXTS.map((context) => {
    const declarations = Object.entries(platformVariables(context))
      .map(([key, value]) => `${key}:${value}`)
      .join(";")
    const bridge =
      context === "platform.host"
        ? ""
        : ";--bg:var(--tds-background);--text:var(--tds-text);--white:var(--tds-text);--lime:var(--tds-action);--muted:var(--tds-muted-text);--line:var(--tds-border);--line2:var(--tds-border);--font:var(--tds-font-family)"
    return `.tds-scope[data-platform-scope="${context}"]{${declarations}${bridge}}`
  }).join("\n") +
  `.tds-scope[data-platform-appearance="light"]{${Object.entries(
    LIGHT_SEMANTIC_TOKENS,
  )
    .map(([key, value]) => `--tds-${kebab(key)}:${value}`)
    .join(";")}}` +
  `
@media(prefers-reduced-motion:reduce){.tds-scope[data-platform-scope]{--tds-motion-fast:0ms;--tds-motion-normal:0ms;--tds-motion-slow:0ms;--tds-motion-layout:0ms}}
`

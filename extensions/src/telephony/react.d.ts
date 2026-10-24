// Ambient type definitions for React in the telephony module.
// Allows KeypadSimulator.tsx to compile in the extensions workspace package
// without requiring cross-package package.json edits.

declare namespace JSX {
  type IntrinsicElements = Record<string, unknown>

  interface Element {
    _brand?: unknown
  }
}

declare namespace React {
  export type FC<P = Record<string, unknown>> = (props: P) => unknown

  export function useState<T>(
    initialState: T | (() => T),
  ): [T, (newState: T | ((prev: T) => T)) => void]

  export function useEffect(
    effect: () => (() => void) | undefined,
    deps?: readonly unknown[],
  ): void
}

declare module "react" {
  export type FC<P = Record<string, unknown>> = (props: P) => unknown

  export function useState<T>(
    initialState: T | (() => T),
  ): [T, (newState: T | ((prev: T) => T)) => void]

  export function useEffect(
    effect: () => (() => void) | undefined,
    deps?: readonly unknown[],
  ): void

  const React: {
    FC: FC
    useState: typeof useState
    useEffect: typeof useEffect
  }

  export default React
}

declare module "react/jsx-runtime" {
  export const jsx: (...args: unknown[]) => unknown

  export const jsxs: (...args: unknown[]) => unknown

  export const Fragment: unknown
}

// Ambient type definitions for React in the telephony module.
// Allows KeypadSimulator.tsx to compile in the extensions workspace package
// without requiring cross-package package.json edits.

declare namespace JSX {
  interface IntrinsicElements {
    [elemName: string]: any
  }
  interface Element {}
}

declare namespace React {
  export interface FC<P = {}> {
    (props: P): any
  }
  export function useState<T>(
    initialState: T | (() => T),
  ): [T, (newState: T | ((prev: T) => T)) => void]
  export function useEffect(
    effect: () => void | (() => void),
    deps?: readonly any[],
  ): void
}

declare module "react" {
  export interface FC<P = {}> {
    (props: P): any
  }

  export function useState<T>(
    initialState: T | (() => T),
  ): [T, (newState: T | ((prev: T) => T)) => void]

  export function useEffect(
    effect: () => void | (() => void),
    deps?: readonly any[],
  ): void

  const React: {
    FC: FC
    useState: typeof useState
    useEffect: typeof useEffect
  }

  export default React
}

declare module "react/jsx-runtime" {
  export const jsx: any
  export const jsxs: any
  export const Fragment: any
}

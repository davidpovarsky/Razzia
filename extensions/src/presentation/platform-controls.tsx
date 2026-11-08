import {
  createContext,
  createElement,
  useContext,
  type ButtonHTMLAttributes,
  type ComponentType,
  type PropsWithChildren,
  type Ref,
} from "react"

/** A host component port. It owns no colors, typography, state or design variants. */
export type PlatformButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  size?: "sm" | "md" | "lg"
  classNameContent?: string
  ref?: Ref<HTMLButtonElement>
}

const ButtonContext = createContext<ComponentType<PlatformButtonProps> | null>(
  null,
)

export function PlatformControlsProvider({
  Button,
  children,
}: PropsWithChildren<{ Button: ComponentType<PlatformButtonProps> }>) {
  return (
    <ButtonContext.Provider value={Button}>{children}</ButtonContext.Provider>
  )
}

/** The web host supplies its real Razzia Button; no parallel button styling lives here. */
export function PlatformButton(props: PlatformButtonProps) {
  const NativeButton = useContext(ButtonContext)

  if (NativeButton) {
    return (
      <NativeButton
        {...props}
        className={`font-display ${props.className ?? ""}`}
        data-control-source="razzia"
      />
    )
  }

  // Keep independent presentation/SSR consumers usable without importing the web package.
  // This path is unstyled and is forbidden in the actual application by browser acceptance.
  const { size: _size, classNameContent: _content, ...htmlProps } = props

  return createElement("button", {
    ...htmlProps,
    "data-control-source": "standalone",
  })
}

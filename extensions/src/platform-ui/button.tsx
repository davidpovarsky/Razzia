import type { ButtonHTMLAttributes, ReactNode, Ref } from "react"

export type ButtonVariant =
  "primary" | "secondary" | "ghost" | "destructive" | "unstyled"
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: "sm" | "md" | "lg"
  loading?: boolean
  classNameContent?: string
  ref?: Ref<HTMLButtonElement>
}

export const buttonStyles = (className = "") => `tds-button ${className}`

/** The single new platform native button; no game state or transport ownership. */
export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  disabled,
  className = "",
  classNameContent,
  children,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      type={type}
      className={buttonStyles(className)}
      data-platform-component="button"
      data-control-source="tadazz"
      data-variant={variant}
      data-size={size}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {loading && <span className="tds-spinner" aria-hidden="true" />}
      <span
        className={classNameContent ?? "tds-button-content"}
        style={
          classNameContent === "contents" ? { display: "contents" } : undefined
        }
      >
        {children}
      </span>
    </button>
  )
}

export function IconButton({
  label,
  className = "",
  children,
  ...props
}: ButtonProps & { label: string; children: ReactNode }) {
  return (
    <Button
      {...props}
      aria-label={label}
      className={`tds-icon-button ${className}`}
    >
      {children}
    </Button>
  )
}

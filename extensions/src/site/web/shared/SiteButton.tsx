import { Button, type ButtonProps } from "@razzia/extensions/platform-ui"

// Transitional site adapter: canonical native behavior with the existing scoped skin.
export function SiteButton({
  className = "",
  variant = "unstyled",
  ...props
}: ButtonProps) {
  return (
    <Button
      {...props}
      className={`tadazz-site-button ${className}`}
      variant={variant}
      classNameContent="contents"
    />
  )
}

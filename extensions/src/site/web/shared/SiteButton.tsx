import {
  PlatformButton,
  type PlatformButtonProps,
} from "@razzia/extensions/presentation/platform-controls"

// Keep the real host primitive and its disabled/accessibility behavior. Scoped
// reference CSS supplies the owner's approved site appearance, never the editor.
export function SiteButton({ className = "", ...props }: PlatformButtonProps) {
  return (
    <PlatformButton
      {...props}
      className={`tadazz-site-button ${className}`}
      classNameContent="contents"
    />
  )
}

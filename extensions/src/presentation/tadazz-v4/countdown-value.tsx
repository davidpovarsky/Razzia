import { useState } from "react"

interface CountdownValueProps {
  as: "div" | "span"
  value: string
  motionOwned?: boolean
}

/**
 * Live motion owns this host's text after its initial React seed.
 * Keep the mode fixed for a mount. Standalone scenes remain declarative.
 */
export function CountdownValue({
  as: Tag,
  value,
  motionOwned = false,
}: CountdownValueProps) {
  const [initialValue] = useState(value)

  return (
    <Tag className="countdown-value" data-testid="tadazz-timer">
      {motionOwned ? initialValue : value}
    </Tag>
  )
}

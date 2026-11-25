import { useState } from "react"

const defaultPoster = "/tadazz-design-reference/marketing-stage.webp"

export function GamePoster({
  posterUrl,
  className,
}: {
  posterUrl?: string
  className?: string
}) {
  const [failedUrl, setFailedUrl] = useState<string>()
  const poster = posterUrl && posterUrl !== failedUrl ? posterUrl : undefined

  return (
    <img
      className={className}
      data-cover-source={poster ? "manifest" : "fallback"}
      src={poster ?? defaultPoster}
      onError={poster ? () => setFailedUrl(poster) : undefined}
      alt=""
    />
  )
}

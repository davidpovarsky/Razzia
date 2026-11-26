import { useEffect, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { getClientId } from "@razzia/web/lib/session"
import { useGamePreviewPage } from "../../components/game-preview/boundary"
import { captureGamePoster } from "../../components/game-preview/capture-poster"
import { createAccountPreviewProvider } from "../../components/game-preview/account-provider"
import type { QuizMeta } from "./MyGames"

const defaultPoster = "/tadazz-design-reference/marketing-stage.webp"

export function GamePoster({
  game,
  className,
}: {
  game: Pick<QuizMeta, "id" | "updatedAt" | "posterUrl">
  className?: string
}) {
  const { id, updatedAt, posterUrl } = game
  const page = useGamePreviewPage()
  const accountId = getClientId()
  const image = useRef<HTMLImageElement>(null)
  const [failedUrl, setFailedUrl] = useState<string>()
  const [inRange, setInRange] = useState(false)
  const [frame, setFrame] = useState<{ image: Blob; url: string }>()
  const poster = posterUrl && posterUrl !== failedUrl ? posterUrl : undefined
  const { data } = useQuery({
    queryKey: [
      accountId,
      "game-poster",
      id,
      updatedAt,
      page?.preferences.locale,
    ],
    enabled: Boolean(page?.enabled && page.provider && inRange && !poster),
    staleTime: Infinity,
    retry: false,
    async queryFn({ signal }) {
      if (!page?.provider) {
        return null
      }

      const request = {
        provider: page.provider,
        selection: { kind: "account-owned" as const, quizId: id },
        preferences: page.preferences,
      }

      return (
        (await captureGamePoster(request, signal)) ??
        captureGamePoster(
          {
            ...request,
            provider: createAccountPreviewProvider(accountId, "poster"),
          },
          signal,
        )
      )
    },
  })

  useEffect(() => {
    const target = image.current

    if (!target || inRange || poster) {
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInRange(true)
          observer.disconnect()
        }
      },
      { rootMargin: "120px" },
    )
    observer.observe(target)

    return () => observer.disconnect()
  }, [inRange, poster])

  useEffect(() => {
    if (data) {
      const url = URL.createObjectURL(data)
      setFrame({ image: data, url })

      return () => URL.revokeObjectURL(url)
    }
  }, [data])

  const captured = frame?.image === data ? frame?.url : undefined
  const generatedSource = captured ? "game-frame" : "fallback"

  return (
    <img
      ref={image}
      className={className}
      data-cover-source={poster ? "manifest" : generatedSource}
      src={poster ?? captured ?? defaultPoster}
      onError={poster ? () => setFailedUrl(poster) : undefined}
      alt=""
    />
  )
}

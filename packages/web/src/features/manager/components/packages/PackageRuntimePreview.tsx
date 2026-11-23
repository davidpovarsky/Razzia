import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { getClientId } from "@razzia/web/lib/session"
import Button from "@razzia/web/components/Button"
import { InlineGamePreviewBoundary } from "../../../../../../../extensions/src/site/components/game-preview/boundary"
import { GamePreviewSurface } from "../../../../../../../extensions/src/site/components/game-preview/game-preview-surface"
import { createPackagePreviewProvider } from "../../../../../../../extensions/src/site/components/game-preview/package-provider"
import { sha256 } from "../../../../../../../extensions/src/core/show-library/digest"
import { packageJson, type PackageReceipt } from "./package-api"
import { PackageThemeProbe } from "./PackageThemeProbe"

export function PackageRuntimePreview({
  receipt,
  initialGameId,
}: {
  receipt: PackageReceipt
  initialGameId?: string
}) {
  const { t } = useTranslation()
  const games = receipt.manifest.contents.filter(
    (content) => content.kind === "game",
  )
  const [gameId, setGameId] = useState(
    () => games.find((game) => game.id === initialGameId)?.id ?? games[0]?.id,
  )
  const [lobby, setLobby] = useState(false)
  const accountId = getClientId()
  const selectionId = `package-${sha256(`${receipt.uploadId}:${gameId ?? ""}`).slice(0, 40)}`
  const provider = useMemo(
    () =>
      createPackagePreviewProvider({
        accountId,
        selectionId,
        uploadId: receipt.uploadId,
        revision: receipt.revision,
        sourceDigest: receipt.sourceDigest,
        buildDigest: receipt.buildDigest,
        packageId: receipt.manifest.id,
        packageVersion: receipt.manifest.version,
        read: (signal) =>
          packageJson(
            `/uploads/${encodeURIComponent(receipt.uploadId)}/games/${encodeURIComponent(gameId ?? "")}/preview`,
            { signal },
          ),
      }),
    [
      accountId,
      selectionId,
      receipt.uploadId,
      receipt.revision,
      receipt.sourceDigest,
      receipt.buildDigest,
      receipt.manifest.id,
      receipt.manifest.version,
      gameId,
    ],
  )

  if (!games.length) {
    return <PackageThemeProbe receipt={receipt} />
  }

  if (!gameId || !games.some((game) => game.id === gameId)) {
    return <p role="status">{t("extensions:packages.runtimeFailed")}</p>
  }

  return (
    <div
      className="space-y-3"
      data-testid="package-preview"
      data-package-preview-kind="full-game"
    >
      <div className="flex flex-wrap gap-2">
        {games.length > 1 &&
          games.map((game) => (
            <Button
              type="button"
              size="sm"
              key={game.id}
              aria-pressed={game.id === gameId}
              onClick={() => {
                setGameId(game.id)
                setLobby(false)
              }}
            >
              {game.id}
            </Button>
          ))}
        <Button
          type="button"
          size="sm"
          aria-pressed={lobby}
          onClick={() => setLobby(true)}
        >
          {t("extensions:packages.phases.lobby")}
        </Button>
        <Button
          type="button"
          size="sm"
          aria-pressed={!lobby}
          onClick={() => setLobby(false)}
        >
          {t("extensions:packages.preview")}
        </Button>
      </div>
      <InlineGamePreviewBoundary
        enabled
        isolate
        provider={provider}
        routeKey={`${accountId}:${receipt.uploadId}:${receipt.revision}:${gameId}`}
      >
        <div className="border-accent overflow-hidden rounded-xl border">
          <GamePreviewSurface
            key={`${selectionId}:${lobby ? "lobby" : "game"}`}
            selection={{ kind: "account-owned", quizId: selectionId }}
            label={receipt.manifest.displayName}
            initiallyOpen
            dismissOnOutside={false}
            initialPhase={lobby ? "lobby" : undefined}
          >
            <div
              style={{
                aspectRatio: "16 / 9",
                minHeight: 280,
                display: "grid",
                placeContent: "center",
                textAlign: "center",
                padding: 28,
                background: "#241a36",
                color: "#fff7e9",
              }}
            >
              <strong style={{ fontSize: "clamp(20px, 3vw, 42px)" }}>
                {receipt.manifest.displayName}
              </strong>
              <span style={{ marginTop: 16 }}>
                {t("extensions:packages.preview")}
              </span>
            </div>
          </GamePreviewSurface>
        </div>
      </InlineGamePreviewBoundary>
    </div>
  )
}

import { CompositeApiClient } from "@razzia/extensions/editor"
import { EmptyState, Select } from "@razzia/extensions/platform-ui"
import { ShowImportModal } from "@razzia/web/features/manager/components/configurations/ShowImportModal"
import { useShowFileActions } from "@razzia/web/features/manager/components/configurations/use-show-file-actions"
import { AnimatePresence } from "motion/react"
import { useCallback, useRef, useState } from "react"
import { useSiteText } from "../../locales"
import { SiteButton } from "../shared/SiteButton"
import { SiteLink } from "../shared/SiteLink"
import { GameCard } from "./GameCard"
import { PackageTools } from "./PackageTools"

export interface QuizMeta {
  id: string
  subject: string
}

export function MyGames({
  games,
  search,
  limit,
  refresh,
}: {
  games: QuizMeta[]
  search: string
  limit?: number
  refresh: () => Promise<unknown>
}) {
  const t = useSiteText()
  const [sort, setSort] = useState("asc"),
    [layout, setLayout] = useState("grid")
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("")
  const busyRef = useRef(false),
    grid = useRef<HTMLDivElement>(null)
  const focusAfterDeletion = useRef(false)
  const [packageFile, setPackageFile] = useState<File | null>(null)
  const consumeFile = useCallback(() => setPackageFile(null), [])
  const onError = () =>
    setError("Your request could not be completed. Please try again.")
  const files = useShowFileActions({ invalidate: refresh, onError })
  const run = async (action: () => Promise<unknown>) => {
    if (busyRef.current) {
      return false
    }

    busyRef.current = true
    setBusy(true)
    setError("")

    try {
      await action()
      await refresh()

      return true
    } catch {
      onError()

      return false
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }
  const filtered = games
    .filter((game) =>
      game.subject.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
    )
    .sort(
      (a, b) => (sort === "asc" ? 1 : -1) * a.subject.localeCompare(b.subject),
    )
  const duplicate = (game: QuizMeta) =>
    run(async () => {
      const client = new CompositeApiClient()
      const bundle = await client.exportQuizBundle(game.id)
      // Existing import remaps quiz/question IDs and preserves all extras.
      await client.importQuizBundle(bundle)
    })

  return (
    <>
      {!limit && (
        <div className="list-toolbar">
          <div className="button-row">
            <SiteButton
              className="btn ghost"
              onClick={() => files.fileInputRef.current?.click()}
            >
              {t("Import")}
            </SiteButton>
            <SiteButton
              className="btn ghost"
              onClick={files.handleDownloadTemplate}
            >
              {t("Download template")}
            </SiteButton>
            <Select
              label={t("Sort")}
              value={sort}
              onChange={(event) => setSort(event.target.value)}
            >
              <option value="asc">{t("Name A–Z")}</option>
              <option value="desc">{t("Name Z–A")}</option>
            </Select>
            <SiteButton
              className="btn ghost"
              aria-pressed={layout === "list"}
              onClick={() => setLayout(layout === "grid" ? "list" : "grid")}
            >
              {t(layout === "grid" ? "List view" : "Gallery view")}
            </SiteButton>
          </div>
        </div>
      )}
      <input
        ref={files.fileInputRef}
        hidden
        type="file"
        accept=".json,.xlsx,.tadazz"
        aria-label={t("Import game file")}
        onChange={(event) => {
          const file = event.target.files?.[0]

          if (file?.name.toLowerCase().endsWith(".tadazz")) {
            setPackageFile(file)
            event.target.value = ""
          } else {
            void files.handleImportFileSelect(event)
          }
        }}
      />
      {error && (
        <p role="alert" className="site-error">
          {t(error)}
        </p>
      )}
      <div
        ref={grid}
        tabIndex={-1}
        role="region"
        aria-label={t("My Games")}
        className={`games-grid ${layout === "list" ? "site-game-list" : ""}`}
        aria-busy={busy}
      >
        <AnimatePresence
          initial={false}
          onExitComplete={() => {
            if (focusAfterDeletion.current) {
              focusAfterDeletion.current = false
              grid.current?.focus({ preventScroll: true })
            }
          }}
        >
          {filtered.slice(0, limit).map((game) => (
            <GameCard
              key={game.id}
              game={game}
              busy={busy}
              showActions={!limit}
              onDuplicate={() => void duplicate(game)}
              onDelete={async () => {
                focusAfterDeletion.current = true
                const success = await run(() =>
                  new CompositeApiClient().deleteQuizComposite(game.id),
                )

                if (!success) {
                  focusAfterDeletion.current = false
                  throw new Error("Composite deletion did not complete")
                }
              }}
              exports={{
                legacy: () => void files.handleExportLegacy(game.id)(),
                enhanced: () => void files.handleExportEnhanced(game.id)(),
                xlsx: () =>
                  void files.handleExportXlsx(game.id, game.subject)(),
                authored: () =>
                  void files.handleExportTadaJson(game.id, game.subject)(),
              }}
            />
          ))}
        </AnimatePresence>
        {filtered.length === 0 && (
          <div className="site-games-empty">
            <EmptyState
              title={t(search ? "No games found" : "Your shows start here.")}
              description={t(
                search
                  ? "Try another search."
                  : "Create a game or import an existing show.",
              )}
            />
          </div>
        )}
        {games.length === 0 && !search && (
          <SiteLink className="game-card new-card" href="/manager/quizz">
            <div className="newicon">+</div>
            <h3>{t("Create game")}</h3>
          </SiteLink>
        )}
      </div>
      {!limit && (
        <PackageTools
          file={packageFile}
          onFileConsumed={consumeFile}
          onImported={refresh}
        />
      )}
      <ShowImportModal
        open={files.isImportModalOpen}
        onOpenChange={files.setIsImportModalOpen}
        preflight={files.preflightData}
        isImporting={files.isImporting}
        onConfirm={() => void files.handleCommitImport()}
      />
    </>
  )
}

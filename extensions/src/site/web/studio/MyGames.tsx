import { SiteLink } from "../shared/SiteLink"
import { SiteButton } from "../shared/SiteButton"
import { useCallback, useState } from "react"
import { CompositeApiClient } from "@razzia/extensions/editor"
import { useShowFileActions } from "@razzia/web/features/manager/components/configurations/use-show-file-actions"
import { ShowImportModal } from "@razzia/web/features/manager/components/configurations/ShowImportModal"
import { PackageTools } from "./PackageTools"
import { SiteDialog } from "../shared/Dialog"
import { useSiteText } from "../../locales"

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
  const [sort, setSort] = useState("asc")
  const [layout, setLayout] = useState("grid")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [pendingDelete, setPendingDelete] = useState<QuizMeta | null>(null)
  const [packageFile, setPackageFile] = useState<File | null>(null)
  const consumeFile = useCallback(() => setPackageFile(null), [])
  const onError = () =>
    setError("Your request could not be completed. Please try again.")
  const files = useShowFileActions({ invalidate: refresh, onError })
  const run = async (action: () => Promise<unknown>) => {
    if (busy) {
      return
    }

    setBusy(true)
    setError("")

    try {
      await action()
      await refresh()
    } catch {
      onError()
    } finally {
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
      // Existing import contract generates new quiz/question IDs and remaps extras.
      // Preserve subject and all metadata instead of silently stripping enhancements.
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
            <label>
              {t("Sort")}{" "}
              <select
                value={sort}
                onChange={(event) => setSort(event.target.value)}
              >
                <option value="asc">{t("Name A–Z")}</option>
                <option value="desc">{t("Name Z–A")}</option>
              </select>
            </label>
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
        className={`games-grid ${layout === "list" ? "site-game-list" : ""}`}
        aria-busy={busy}
      >
        {filtered.slice(0, limit).map((game) => (
          <article className="game-card" key={game.id} data-game-id={game.id}>
            <img
              className="site-game-cover"
              src="/tadazz-design-reference/marketing-stage.webp"
              alt=""
            />
            <div className="site-game-body">
              <h3 className="game-title">{game.subject}</h3>
              <p className="muted">{t("Account-owned game")}</p>
              <div className="button-row">
                <SiteLink
                  className="btn ghost"
                  href={`/manager/quizz/${encodeURIComponent(game.id)}`}
                >
                  {t("Edit game")}
                </SiteLink>
                <SiteLink
                  className="btn ghost"
                  href={`/studio/prepare?quiz=${encodeURIComponent(game.id)}`}
                >
                  {t("Prepare show")}
                </SiteLink>
              </div>
              {!limit && (
                <div className="site-game-actions">
                  <SiteButton
                    disabled={busy}
                    className="text-link"
                    onClick={() => void duplicate(game)}
                  >
                    {t("Duplicate")}
                  </SiteButton>
                  <details>
                    <summary>{t("Export")}</summary>
                    <div className="site-export-menu">
                      <SiteButton
                        onClick={() => void files.handleExportLegacy(game.id)()}
                      >
                        {t("Legacy JSON")}
                      </SiteButton>
                      <SiteButton
                        onClick={() =>
                          void files.handleExportEnhanced(game.id)()
                        }
                      >
                        {t("Enhanced bundle")}
                      </SiteButton>
                      <SiteButton
                        onClick={() =>
                          void files.handleExportXlsx(game.id, game.subject)()
                        }
                      >
                        {t("Excel workbook")}
                      </SiteButton>
                      <SiteButton
                        onClick={() =>
                          void files.handleExportTadaJson(
                            game.id,
                            game.subject,
                          )()
                        }
                      >
                        {t("TADAZZ JSON")}
                      </SiteButton>
                    </div>
                  </details>
                  <SiteButton
                    disabled={busy}
                    className="text-link site-danger"
                    onClick={() => setPendingDelete(game)}
                  >
                    {t("Delete")}
                  </SiteButton>
                </div>
              )}
            </div>
          </article>
        ))}
        {filtered.length === 0 && (
          <div className="empty">
            <h3>{t(search ? "No games found" : "Your shows start here.")}</h3>
            <p>{t("Create a game or import an existing show.")}</p>
          </div>
        )}
        <SiteLink className="game-card new-card" href="/manager/quizz">
          <div className="newicon">+</div>
          <h3>{t("Create game")}</h3>
        </SiteLink>
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
      {pendingDelete && (
        <SiteDialog
          title={t("Delete game?")}
          onClose={() => setPendingDelete(null)}
        >
          <p>{pendingDelete.subject}</p>
          <p>{t("This permanently removes the game and its enhancements.")}</p>
          {error && <p role="alert">{t(error)}</p>}
          <SiteButton
            disabled={busy}
            className="btn primary"
            onClick={() =>
              void run(async () => {
                await new CompositeApiClient().deleteQuizComposite(
                  pendingDelete.id,
                )
                setPendingDelete(null)
              })
            }
          >
            {t(busy ? "Please wait…" : "Confirm delete")}
          </SiteButton>
        </SiteDialog>
      )}
    </>
  )
}

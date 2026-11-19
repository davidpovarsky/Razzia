import {
  exportRosterToCsv,
  formatFullPhoneDisplay,
  generateRosterCsvTemplate,
  generateRosterXlsxTemplate,
  normalizePhoneE164,
  parseRosterImportFile,
  type HostPlayerStatus,
  type HostPresenceSnapshot,
  type RosterImportResult,
} from "@razzia/extensions/core"
import {
  DialogPortal,
  PlatformThemeProvider,
  usePlatformTheme,
  HostRosterPolicy,
  HostRosterRemove,
  Button as NativeButton,
  IconButton,
  Input,
  SearchInput,
  Select,
} from "@razzia/extensions/platform-ui"
import { ApiError } from "@razzia/web/lib/api"
import { localizeRosterError } from "./roster-error-text"
import { useManagerStore } from "@razzia/web/features/game/stores/manager"
import {
  commitGameRosterParticipants,
  deleteGameRosterParticipant,
  fetchGameRoster,
  updateGameRosterSettings,
  upsertGameRosterParticipant,
} from "@razzia/web/features/manager/roster-queries"
import { STATUS } from "@razzia/common/types/game/status"
import "./host-players-modal.css"
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Edit2,
  FileSpreadsheet,
  Globe,
  Phone,
  Plus,
  Settings2,
  Upload,
  Users,
  X,
} from "lucide-react"
import { Dialog } from "radix-ui"
import { useEffect, useId, useMemo, useRef, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

type FilterTab =
  "all" | "connected" | "disconnected" | "not_joined" | "phone" | "web"

function triggerFileDownload(
  filename: string,
  content: Uint8Array | string,
  mimeType: string,
) {
  const blob =
    typeof content === "string"
      ? new Blob([content], { type: mimeType })
      : new Blob([content.buffer as ArrayBuffer], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

interface Props {
  open: boolean
  onOpenChange: (_open: boolean) => void
}

const HostPlayersModal = ({ open, onOpenChange }: Props) => {
  const { t, i18n } = useTranslation()
  const platformTheme = usePlatformTheme()
  const { gameId, players, settings, status, hostPresence, updateManager } =
    useManagerStore()

  const [filterTab, setFilterTab] = useState<FilterTab>("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [nameInput, setNameInput] = useState("")
  const [phoneInput, setPhoneInput] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [isBusy, setIsBusy] = useState(false)
  const [importPreview, setImportPreview] = useState<RosterImportResult | null>(
    null,
  )

  const [editorOpen, setEditorOpen] = useState(false)
  const [managementOpen, setManagementOpen] = useState(false)
  const [rosterLoadError, setRosterLoadError] = useState(false)
  const [fetchAttempt, setFetchAttempt] = useState(0)
  const editorWasOpen = useRef(false)
  const editorId = useId()
  const managementId = useId()
  const nameInputRef = useRef<HTMLInputElement | null>(null)
  const addButtonRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (editorOpen) {
      nameInputRef.current?.focus()
    } else if (editorWasOpen.current) {
      addButtonRef.current?.focus()
    }

    editorWasOpen.current = editorOpen
  }, [editorOpen, editingId])

  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    let active = true

    if (open && gameId) {
      void fetchGameRoster(gameId)
        .then(({ presence }) => {
          if (!active) {
            return
          }

          const current = useManagerStore.getState().hostPresence

          if (
            !current ||
            current.gameId !== presence.gameId ||
            current.seq <= presence.seq
          ) {
            updateManager({ hostPresence: presence })
          }

          setRosterLoadError(false)
        })
        .catch(() => {
          if (active) {
            setRosterLoadError(true)
          }
        })
    }

    return () => {
      active = false
    }
  }, [open, gameId, updateManager, fetchAttempt])

  const snapshot: HostPresenceSnapshot = useMemo(() => {
    if (hostPresence?.gameId === gameId) {
      return hostPresence
    }

    const fallbackPlayers: HostPlayerStatus[] = players.map((p) => ({
      rosterPlayerId: p.clientId || p.id,
      clientId: p.clientId,
      displayName: p.username,
      phoneE164: null,
      source: "web",
      status: p.connected ? "connected" : "disconnected",
      points: p.points,
      answeredCurrentQuestion: false,
    }))

    const connectedNow = fallbackPlayers.filter(
      (p) => p.status === "connected",
    ).length
    const disconnectedNow = fallbackPlayers.filter(
      (p) => p.status === "disconnected",
    ).length

    return {
      v: 1,
      gameId: gameId ?? "",
      seq: 0,
      phoneInviteOnly: settings.phoneInviteOnly ?? false,
      registeredTotal: fallbackPlayers.length,
      connectedNow,
      disconnectedNow,
      notJoinedNow: 0,
      players: fallbackPlayers,
    }
  }, [hostPresence, players, gameId, settings.phoneInviteOnly])

  const filteredPlayers = useMemo(
    () =>
      snapshot.players.filter((p) => {
        if (filterTab === "connected" && p.status !== "connected") {
          return false
        }

        if (filterTab === "disconnected" && p.status !== "disconnected") {
          return false
        }

        if (filterTab === "not_joined" && p.status !== "not_joined") {
          return false
        }

        if (filterTab === "phone" && p.source !== "phone" && !p.phoneE164) {
          return false
        }

        if (filterTab === "web" && p.source !== "web") {
          return false
        }

        if (searchQuery.trim()) {
          const q = searchQuery.trim().toLowerCase()
          const matchName = p.displayName.toLowerCase().includes(q)
          const matchPhone = (p.phoneE164 ?? "").toLowerCase().includes(q)

          return matchName || matchPhone
        }

        return true
      }),
    [snapshot.players, filterTab, searchQuery],
  )

  const handleToggleInviteOnly = async (nextVal: boolean) => {
    if (!gameId || isBusy) {
      return
    }

    setIsBusy(true)

    try {
      const { presence } = await updateGameRosterSettings({
        gameId,
        phoneInviteOnly: nextVal,
      })
      updateManager({ hostPresence: presence })
    } catch (error) {
      toast.error(t("errors:route.description"))
      throw error
    } finally {
      setIsBusy(false)
    }
  }

  const handleSaveParticipant = async () => {
    if (!gameId || isBusy) {
      return
    }

    setFormError(null)
    const trimmedName = nameInput.trim()

    if (!trimmedName || trimmedName.length > 40) {
      setFormError(
        trimmedName
          ? "extensions:roster.errors.participantNameTooLong"
          : "extensions:roster.errors.missingParticipantName",
      )

      return
    }

    const trimmedPhone = phoneInput.trim()

    if (trimmedPhone) {
      const normalized = normalizePhoneE164(trimmedPhone)

      if (!normalized) {
        setFormError("extensions:roster.errors.invalidPhoneNumber")

        return
      }
    }

    setIsBusy(true)

    try {
      const { presence } = await upsertGameRosterParticipant({
        gameId,
        rosterPlayerId: editingId ?? undefined,
        displayName: trimmedName,
        phone: trimmedPhone || null,
      })
      updateManager({ hostPresence: presence })
      setEditingId(null)
      setNameInput("")
      setPhoneInput("")
      setEditorOpen(false)
      addButtonRef.current?.focus()
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.key : "errors:route.description",
      )
    } finally {
      setIsBusy(false)
    }
  }

  const handleEdit = (p: HostPlayerStatus) => {
    setEditorOpen(true)
    setManagementOpen(false)
    setEditingId(p.rosterPlayerId)
    setNameInput(p.displayName)
    setPhoneInput(p.phoneE164 ?? "")
    setFormError(null)
  }

  const handleRemove = async (rosterPlayerId: string) => {
    if (!gameId || isBusy) {
      return
    }

    setIsBusy(true)

    try {
      const { presence } = await deleteGameRosterParticipant({
        gameId,
        rosterPlayerId,
      })
      updateManager({ hostPresence: presence })

      if (editingId === rosterPlayerId) {
        setEditorOpen(false)
        setEditingId(null)
        setNameInput("")
        setPhoneInput("")
      }
    } catch (error) {
      toast.error(t("errors:route.description"))
      throw error
    } finally {
      setIsBusy(false)
    }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]

    if (!file) {
      return
    }

    try {
      const buf = await file.arrayBuffer()
      const existing = snapshot.players
        .filter((p) => p.phoneE164 !== null)
        .map((p) => ({
          rosterPlayerId: p.rosterPlayerId,
          displayName: p.displayName,
          phoneE164: p.phoneE164,
        }))
      const parsed = parseRosterImportFile(
        new Uint8Array(buf),
        file.name,
        existing,
      )
      setImportPreview(parsed)
    } catch {
      setFormError("extensions:roster.errors.importReadFailed")
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    }
  }

  const handleApproveImport = async () => {
    if (!gameId || !importPreview || !importPreview.ok || isBusy) {
      return
    }

    setIsBusy(true)

    try {
      const { presence } = await commitGameRosterParticipants({
        gameId,
        participants: importPreview.validParticipants,
      })
      updateManager({ hostPresence: presence })
      setImportPreview(null)
    } catch {
      toast.error(t("errors:route.description"))
    } finally {
      setIsBusy(false)
    }
  }

  const closeEditor = () => {
    setEditorOpen(false)
    setEditingId(null)
    setNameInput("")
    setPhoneInput("")
    setFormError(null)
    addButtonRef.current?.focus()
  }
  const showActivity = Boolean(status && status.name !== STATUS.SHOW_ROOM)
  const showAnswers =
    status?.name === STATUS.SELECT_ANSWER ||
    status?.name === STATUS.SHOW_RESPONSES

  return (
    <PlatformThemeProvider {...platformTheme} dir={i18n.dir()}>
      <Dialog.Root open={open} onOpenChange={onOpenChange}>
        <DialogPortal
          legacy
          returnFocusTo='[data-testid="host-bottom-players-btn"]'
        >
          <Dialog.Overlay className="tds-overlay" />
          <Dialog.Content
            className="host-roster-dialog"
            data-testid="host-players-modal"
          >
            <header className="host-roster-header">
              <div>
                <Dialog.Title className="host-roster-title">
                  <Users className="size-5" aria-hidden="true" />
                  {t("extensions:roster.playersButton", "Players")}
                </Dialog.Title>
                <Dialog.Description className="host-roster-summary">
                  <span data-testid="kpi-registered">
                    {snapshot.registeredTotal}{" "}
                    {t("extensions:roster.registeredTotal", "Registered")}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span data-testid="kpi-connected">
                    {snapshot.connectedNow}{" "}
                    {t("extensions:roster.connectedNow", "Connected Now")}
                  </span>
                </Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <IconButton
                  label={t("common:close")}
                  variant="ghost"
                  data-testid="host-players-close-btn"
                >
                  <X className="size-5" />
                </IconButton>
              </Dialog.Close>
            </header>

            <div className="host-roster-toolbar">
              <div className="host-roster-search">
                <SearchInput
                  value={searchQuery}
                  aria-label={t("extensions:roster.searchPlaceholder")}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder={t(
                    "extensions:roster.searchPlaceholder",
                    "Search by name or phone number...",
                  )}
                  data-testid="host-modal-search-input"
                />
              </div>
              <Select
                aria-label={t(
                  "extensions:roster.filterPlayers",
                  "Filter players",
                )}
                value={filterTab}
                onChange={(event) =>
                  setFilterTab(event.target.value as FilterTab)
                }
                data-testid="host-modal-filter"
              >
                <option value="all">
                  {t("extensions:roster.filterAll", "All")} (
                  {snapshot.registeredTotal})
                </option>
                <option value="connected">
                  {t("extensions:roster.filterConnected", "Connected")} (
                  {snapshot.connectedNow})
                </option>
                <option value="disconnected">
                  {t("extensions:roster.filterDisconnected", "Disconnected")} (
                  {snapshot.disconnectedNow})
                </option>
                <option value="not_joined">
                  {t("extensions:roster.filterNotJoined", "Not joined")} (
                  {snapshot.notJoinedNow ?? 0})
                </option>
                <option value="phone">
                  {t("extensions:roster.filterPhone", "Phone")}
                </option>
                <option value="web">
                  {t("extensions:roster.filterWeb", "Web")}
                </option>
              </Select>
              <NativeButton
                ref={addButtonRef}
                size="sm"
                variant="primary"
                disabled={!gameId || isBusy}
                onClick={() => {
                  setEditingId(null)
                  setNameInput("")
                  setPhoneInput("")
                  setFormError(null)
                  setEditorOpen(true)
                  setManagementOpen(false)
                }}
                aria-expanded={editorOpen}
                aria-controls={editorId}
                data-testid="host-modal-add-btn"
              >
                <Plus className="size-4" aria-hidden="true" />
                {t("extensions:roster.addParticipant", "Add Participant")}
              </NativeButton>
              <IconButton
                label={t("extensions:roster.manageList", "Manage list")}
                onClick={() => {
                  setManagementOpen((value) => !value)
                  setEditorOpen(false)
                }}
                aria-expanded={managementOpen}
                aria-controls={managementId}
                data-testid="host-modal-manage-btn"
              >
                <Settings2 className="size-4" />
              </IconButton>
            </div>

            {managementOpen && (
              <section
                id={managementId}
                className="host-roster-management"
                aria-label={t("extensions:roster.manageList", "Manage list")}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.csv"
                  onChange={handleFileChange}
                  hidden
                  data-testid="host-modal-file-input"
                />
                <div className="host-roster-file-actions">
                  <NativeButton
                    size="sm"
                    disabled={isBusy || !gameId}
                    onClick={() => fileInputRef.current?.click()}
                    data-testid="host-modal-import-btn"
                  >
                    <Upload className="size-4" aria-hidden="true" />
                    {t(
                      "extensions:roster.importExcelCsv",
                      "Import Excel / CSV",
                    )}
                  </NativeButton>
                  <NativeButton
                    size="sm"
                    onClick={() =>
                      triggerFileDownload(
                        "tada-roster-template.xlsx",
                        generateRosterXlsxTemplate(),
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                      )
                    }
                    data-testid="host-modal-xlsx-template-btn"
                  >
                    <FileSpreadsheet className="size-4" aria-hidden="true" />
                    {t(
                      "extensions:roster.downloadXlsxTemplate",
                      "Template (.xlsx)",
                    )}
                  </NativeButton>
                  <NativeButton
                    size="sm"
                    onClick={() =>
                      triggerFileDownload(
                        "tada-roster-template.csv",
                        generateRosterCsvTemplate(),
                        "text/csv;charset=utf-8",
                      )
                    }
                    data-testid="host-modal-csv-template-btn"
                  >
                    <Download className="size-4" aria-hidden="true" />
                    {t(
                      "extensions:roster.downloadCsvTemplate",
                      "Template (.csv)",
                    )}
                  </NativeButton>
                  <NativeButton
                    size="sm"
                    disabled={snapshot.players.length === 0}
                    onClick={() =>
                      triggerFileDownload(
                        "tada-live-roster.csv",
                        exportRosterToCsv(
                          snapshot.players.map((p) => ({
                            rosterPlayerId: p.rosterPlayerId,
                            displayName: p.displayName,
                            phoneE164: p.phoneE164,
                          })),
                        ),
                        "text/csv;charset=utf-8",
                      )
                    }
                    data-testid="host-modal-export-csv-btn"
                  >
                    <Download className="size-4" aria-hidden="true" />
                    {t("extensions:roster.exportCsv", "Export (.csv)")}
                  </NativeButton>
                </div>
                <HostRosterPolicy
                  checked={snapshot.phoneInviteOnly}
                  disabled={isBusy || !gameId}
                  onChange={handleToggleInviteOnly}
                />
              </section>
            )}

            {editorOpen && (
              <form
                id={editorId}
                className="host-roster-editor"
                onSubmit={(event) => {
                  event.preventDefault()
                  void handleSaveParticipant()
                }}
              >
                <Input
                  ref={nameInputRef}
                  label={t("extensions:roster.nameLabel")}
                  value={nameInput}
                  maxLength={40}
                  onChange={(event) => setNameInput(event.target.value)}
                  placeholder={t(
                    "extensions:roster.namePlaceholder",
                    "Enter full display name",
                  )}
                  data-testid="host-modal-name-input"
                />
                <Input
                  type="tel"
                  dir="ltr"
                  label={t("extensions:roster.phoneLabel")}
                  value={phoneInput}
                  onChange={(event) => setPhoneInput(event.target.value)}
                  placeholder={t(
                    "extensions:roster.phonePlaceholder",
                    "+972501234567 or 050-123-4567",
                  )}
                  data-testid="host-modal-phone-input"
                />
                <div className="host-roster-editor-actions">
                  <NativeButton
                    size="sm"
                    type="submit"
                    variant="primary"
                    loading={isBusy}
                    disabled={!gameId}
                    data-testid="host-modal-save-participant-btn"
                  >
                    {editingId
                      ? t("extensions:roster.saveParticipant", "Save")
                      : t(
                          "extensions:roster.addParticipant",
                          "Add Participant",
                        )}
                  </NativeButton>
                  <NativeButton
                    size="sm"
                    onClick={closeEditor}
                    disabled={isBusy}
                  >
                    {t("extensions:roster.cancel", "Cancel")}
                  </NativeButton>
                </div>
                {formError && (
                  <p
                    role="alert"
                    className="tds-field-error host-roster-form-error"
                    data-testid="host-modal-form-error"
                  >
                    {localizeRosterError(t, formError)}
                  </p>
                )}
              </form>
            )}

            {!editorOpen && formError && (
              <p
                role="alert"
                className="tds-field-error"
                data-testid="host-modal-form-error"
              >
                {localizeRosterError(t, formError)}
              </p>
            )}

            {rosterLoadError && (
              <div className="host-roster-load-error" role="alert">
                <span>{t("errors:route.description")}</span>
                <NativeButton
                  size="sm"
                  onClick={() => setFetchAttempt((value) => value + 1)}
                >
                  {t("common:retry", "Retry")}
                </NativeButton>
              </div>
            )}

            {/* Import Preview Box */}
            {importPreview && (
              <div
                className="host-roster-import-preview"
                data-testid="host-modal-import-preview"
              >
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold">
                    {t("extensions:roster.previewTitle", "Import Preview")} —{" "}
                    <span className="font-mono">{importPreview.filename}</span>{" "}
                    (
                    {t("extensions:roster.previewSummary", {
                      valid: importPreview.validCount,
                      total: importPreview.totalRows,
                      invalid: importPreview.invalidCount,
                    })}
                    )
                  </div>
                  <div className="flex items-center gap-2">
                    <NativeButton
                      size="sm"
                      type="button"
                      onClick={() => setImportPreview(null)}
                      className="border-border rounded border px-2.5 py-1 text-xs font-semibold"
                      data-testid="host-modal-import-cancel-btn"
                    >
                      {t("extensions:roster.cancelImport", "Cancel Import")}
                    </NativeButton>
                    {importPreview.ok && importPreview.validCount > 0 && (
                      <NativeButton
                        size="sm"
                        type="button"
                        onClick={handleApproveImport}
                        variant="primary"
                        disabled={isBusy}
                        className="bg-primary rounded px-3 py-1 text-xs font-bold text-white"
                        data-testid="host-modal-import-approve-btn"
                      >
                        {t("extensions:roster.approveImport", {
                          count: importPreview.validCount,
                          defaultValue: `Approve & Import (${importPreview.validCount})`,
                        })}
                      </NativeButton>
                    )}
                  </div>
                </div>
                {importPreview.fatalError && (
                  <p className="text-xs font-bold text-red-600">
                    {localizeRosterError(t, importPreview.errors[0]?.reasonKey)}
                  </p>
                )}
                {importPreview.rows.length > 0 && (
                  <div className="max-h-36 overflow-y-auto rounded border border-neutral-200 text-xs dark:border-neutral-800">
                    <table className="w-full text-start">
                      <thead className="sticky top-0 bg-neutral-100 font-bold dark:bg-neutral-800">
                        <tr>
                          <th className="px-2 py-1">#</th>
                          <th className="px-2 py-1">
                            {t("extensions:roster.colName")}
                          </th>
                          <th className="px-2 py-1">
                            {t("extensions:roster.colPhone")}
                          </th>
                          <th className="px-2 py-1">
                            {t("extensions:roster.colStatus")}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {importPreview.rows.map((r) => (
                          <tr
                            key={r.rowNumber}
                            className={
                              r.valid
                                ? ""
                                : "bg-red-50/70 text-red-700 dark:bg-red-950/30"
                            }
                          >
                            <td className="px-2 py-1 font-mono">
                              {r.rowNumber}
                            </td>
                            <td className="px-2 py-1 font-semibold">
                              {r.displayName || "—"}
                            </td>
                            <td className="px-2 py-1 font-mono" dir="ltr">
                              {r.phoneE164 ?? r.phoneRaw}
                            </td>
                            <td className="px-2 py-1">
                              {r.valid
                                ? t("extensions:roster.statusValid")
                                : localizeRosterError(t, r.errorKey)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            <div className="host-roster-list" data-testid="host-roster-list">
              {filteredPlayers.length === 0 ? (
                <p className="host-roster-empty" data-testid="host-modal-empty">
                  {t(
                    searchQuery || filterTab !== "all"
                      ? "extensions:roster.noSearchResults"
                      : "extensions:roster.emptyRoster",
                  )}
                </p>
              ) : (
                <table
                  className="host-roster-table"
                  data-testid="host-modal-players-table"
                >
                  <thead>
                    <tr>
                      <th scope="col">
                        {t("extensions:roster.colName", "Name")}
                      </th>
                      <th scope="col">
                        {t("extensions:roster.colStatus", "Status")}
                      </th>
                      {showActivity && (
                        <th scope="col">
                          {t("extensions:roster.colPoints", "Points")}
                        </th>
                      )}
                      <th scope="col" className="host-roster-actions-heading">
                        {t("extensions:roster.colActions")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPlayers.map((person) => (
                      <tr
                        key={person.rosterPlayerId}
                        data-testid={`host-player-row-${person.rosterPlayerId}`}
                      >
                        <td className="host-roster-person">
                          <strong
                            data-testid={`host-player-name-${person.rosterPlayerId}`}
                          >
                            {person.displayName}
                          </strong>
                          <div className="host-roster-person-details">
                            {person.phoneE164 ? (
                              <span
                                dir="ltr"
                                data-testid={`host-player-phone-${person.rosterPlayerId}`}
                              >
                                <Phone className="size-3" aria-hidden="true" />
                                {formatFullPhoneDisplay(person.phoneE164)}
                              </span>
                            ) : (
                              <span>
                                {person.source === "phone" ? (
                                  <Phone
                                    className="size-3"
                                    aria-hidden="true"
                                  />
                                ) : (
                                  <Globe
                                    className="size-3"
                                    aria-hidden="true"
                                  />
                                )}
                                {t(
                                  person.source === "phone"
                                    ? "extensions:roster.sourcePhone"
                                    : "extensions:roster.sourceWeb",
                                )}
                              </span>
                            )}
                            {person.tableNumber !== undefined && (
                              <span>
                                {t("extensions:roster.tableNumber", {
                                  number: person.tableNumber,
                                  defaultValue: "Table {{number}}",
                                })}
                              </span>
                            )}
                          </div>
                        </td>
                        <td
                          className="host-roster-connection"
                          data-testid={`host-player-status-${person.rosterPlayerId}`}
                        >
                          <span
                            className="host-roster-status"
                            data-status={person.status}
                          >
                            {person.status === "connected" && (
                              <CheckCircle2
                                className="size-3.5"
                                aria-hidden="true"
                              />
                            )}
                            {person.status === "disconnected" && (
                              <AlertCircle
                                className="size-3.5"
                                aria-hidden="true"
                              />
                            )}
                            {person.status === "not_joined" && (
                              <span
                                className="host-roster-status-dot"
                                aria-hidden="true"
                              />
                            )}
                            {t(
                              {
                                connected: "extensions:roster.statusConnected",
                                disconnected:
                                  "extensions:roster.statusDisconnected",
                                not_joined: "extensions:roster.statusNotJoined",
                              }[person.status],
                            )}
                          </span>
                        </td>
                        {showActivity && (
                          <td className="host-roster-activity">
                            <strong
                              data-testid={`host-player-points-${person.rosterPlayerId}`}
                            >
                              {person.points}{" "}
                              <span className="host-roster-mobile-label">
                                {t("extensions:roster.colPoints", "Points")}
                              </span>
                            </strong>
                            {showAnswers && (
                              <span>
                                {t(
                                  person.answeredCurrentQuestion
                                    ? "extensions:roster.answeredYes"
                                    : "extensions:roster.answeredNo",
                                )}
                              </span>
                            )}
                          </td>
                        )}
                        <td className="host-roster-row-actions">
                          <IconButton
                            size="sm"
                            variant="ghost"
                            disabled={isBusy || !gameId}
                            label={`${t("extensions:roster.editParticipant")} · ${person.displayName}`}
                            onClick={() => handleEdit(person)}
                            data-testid={`host-player-edit-${person.rosterPlayerId}`}
                          >
                            <Edit2 className="size-4" />
                          </IconButton>
                          <HostRosterRemove
                            name={person.displayName}
                            participantId={person.rosterPlayerId}
                            disabled={isBusy || !gameId}
                            onConfirm={() =>
                              handleRemove(person.rosterPlayerId)
                            }
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <p className="host-roster-count" role="status">
              {t("extensions:roster.showingPlayers", {
                shown: filteredPlayers.length,
                total: snapshot.registeredTotal,
                defaultValue: "{{shown}} of {{total}} players",
              })}
            </p>
          </Dialog.Content>
        </DialogPortal>
      </Dialog.Root>
    </PlatformThemeProvider>
  )
}

export default HostPlayersModal

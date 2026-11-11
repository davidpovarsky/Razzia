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
  HostRosterPolicy,
  HostRosterRemove,
  Button as NativeButton,
} from "@razzia/extensions/platform-ui"
import { useManagerStore } from "@razzia/web/features/game/stores/manager"
import {
  commitGameRosterParticipants,
  deleteGameRosterParticipant,
  fetchGameRoster,
  updateGameRosterSettings,
  upsertGameRosterParticipant,
} from "@razzia/web/features/manager/roster-queries"
import clsx from "clsx"
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Edit2,
  FileSpreadsheet,
  Globe,
  Phone,
  Plus,
  Search,
  Upload,
  Users,
  X,
} from "lucide-react"
import { Dialog } from "radix-ui"
import { useEffect, useMemo, useRef, useState } from "react"
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
  const { t } = useTranslation()
  const { gameId, players, settings, hostPresence, updateManager } =
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

  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (open && gameId) {
      fetchGameRoster(gameId)
        .then(({ presence }) => {
          updateManager({ hostPresence: presence })
        })
        .catch(() => undefined)
    }
  }, [open, gameId, updateManager])

  const snapshot: HostPresenceSnapshot = useMemo(() => {
    if (hostPresence) {
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
      setFormError("Player name is required (1–40 characters)")

      return
    }

    const trimmedPhone = phoneInput.trim()

    if (trimmedPhone) {
      const normalized = normalizePhoneE164(trimmedPhone)

      if (!normalized) {
        setFormError(
          "Invalid phone number. Use +972501234567, 050-123-4567, or +442079460999",
        )

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
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Failed to save participant",
      )
    } finally {
      setIsBusy(false)
    }
  }

  const handleEdit = (p: HostPlayerStatus) => {
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
      setFormError("Failed to parse file")
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

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <DialogPortal
        legacy
        returnFocusTo='[data-testid="host-bottom-players-btn"]'
      >
        <Dialog.Overlay className="data-[state=open]:animate-fade fixed inset-0 z-50 bg-black/60 backdrop-blur-xs" />

        <Dialog.Content
          aria-describedby={undefined}
          data-testid="host-players-modal"
          className="tds-roster-dialog bg-background data-[state=open]:animate-fade fixed top-1/2 left-1/2 z-50 flex max-h-[88dvh] w-[95vw] max-w-4xl -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl border border-neutral-200 p-6 shadow-2xl dark:border-neutral-800"
        >
          <Dialog.Close
            data-testid="host-players-close-btn"
            aria-label={t("common:close")}
            className="hover:bg-muted text-muted-foreground hover:text-foreground absolute top-5 right-5 rounded-md p-1.5"
          >
            <X className="size-5" />
          </Dialog.Close>

          <div className="flex flex-wrap items-center justify-between gap-4 pr-10">
            <div className="flex items-center gap-2.5">
              <Users className="text-primary size-6" />
              <Dialog.Title className="text-foreground text-xl font-bold">
                {t(
                  "extensions:roster.liveModalTitle",
                  "Players & Live Connection Status",
                )}
              </Dialog.Title>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.csv"
                onChange={handleFileChange}
                className="hidden"
                data-testid="host-modal-file-input"
              />
              <NativeButton
                size="sm"
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold"
                data-testid="host-modal-import-btn"
              >
                <Upload className="size-3.5" />
                {t("extensions:roster.importExcelCsv", "Import Excel / CSV")}
              </NativeButton>

              <NativeButton
                size="sm"
                type="button"
                onClick={() =>
                  triggerFileDownload(
                    "tada-roster-template.xlsx",
                    generateRosterXlsxTemplate(),
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                  )
                }
                className="border-border bg-background text-foreground hover:bg-accent flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold"
                data-testid="host-modal-xlsx-template-btn"
              >
                <FileSpreadsheet className="size-3.5" />
                {t(
                  "extensions:roster.downloadXlsxTemplate",
                  "Template (.xlsx)",
                )}
              </NativeButton>

              <NativeButton
                size="sm"
                type="button"
                onClick={() =>
                  triggerFileDownload(
                    "tada-roster-template.csv",
                    generateRosterCsvTemplate(),
                    "text/csv;charset=utf-8",
                  )
                }
                className="border-border bg-background text-foreground hover:bg-accent flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold"
                data-testid="host-modal-csv-template-btn"
              >
                <Download className="size-3.5" />
                {t("extensions:roster.downloadCsvTemplate", "Template (.csv)")}
              </NativeButton>

              {snapshot.players.length > 0 && (
                <NativeButton
                  size="sm"
                  type="button"
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
                  className="border-border bg-background text-foreground hover:bg-accent flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold"
                  data-testid="host-modal-export-csv-btn"
                >
                  <Download className="size-3.5" />
                  {t("extensions:roster.exportCsv", "Export (.csv)")}
                </NativeButton>
              )}
            </div>
          </div>

          {/* Live metrics; phone policy is a separate setting. */}
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div
              className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-900"
              data-testid="kpi-registered"
            >
              <div className="text-xs font-semibold text-neutral-500">
                {t("extensions:roster.registeredTotal", "Registered")}
              </div>
              <div className="text-xl font-black text-neutral-900 dark:text-white">
                {snapshot.registeredTotal}
              </div>
            </div>

            <div
              className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3"
              data-testid="kpi-connected"
            >
              <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                {t("extensions:roster.connectedNow", "Connected Now")}
              </div>
              <div className="text-xl font-black text-emerald-700 dark:text-emerald-300">
                {snapshot.connectedNow}
              </div>
            </div>

            <div
              className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3"
              data-testid="kpi-disconnected"
            >
              <div className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                {t("extensions:roster.disconnectedNow", "Disconnected")}
              </div>
              <div className="text-xl font-black text-amber-700 dark:text-amber-300">
                {snapshot.disconnectedNow}
              </div>
            </div>

            <div
              className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-900"
              data-testid="kpi-not-joined"
            >
              <div className="text-xs font-semibold text-neutral-500">
                {t("extensions:roster.notJoinedNow", "Not Joined")}
              </div>
              <div className="text-xl font-black text-neutral-700 dark:text-neutral-300">
                {snapshot.notJoinedNow}
              </div>
            </div>
          </div>
          <HostRosterPolicy
            checked={snapshot.phoneInviteOnly}
            disabled={isBusy || !gameId}
            onChange={handleToggleInviteOnly}
          />

          {/* Import Preview Box */}
          {importPreview && (
            <div
              className="border-primary/40 bg-card mt-4 flex flex-col gap-3 rounded-xl border-2 p-3"
              data-testid="host-modal-import-preview"
            >
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold">
                  {t("extensions:roster.previewTitle", "Import Preview")} —{" "}
                  <span className="font-mono">{importPreview.filename}</span> (
                  {importPreview.validCount} valid / {importPreview.totalRows}{" "}
                  total)
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
                  {importPreview.fatalError}
                </p>
              )}
              {importPreview.rows.length > 0 && (
                <div className="max-h-36 overflow-y-auto rounded border border-neutral-200 text-xs dark:border-neutral-800">
                  <table className="w-full text-left">
                    <thead className="sticky top-0 bg-neutral-100 font-bold dark:bg-neutral-800">
                      <tr>
                        <th className="px-2 py-1">#</th>
                        <th className="px-2 py-1">Name</th>
                        <th className="px-2 py-1">Phone</th>
                        <th className="px-2 py-1">Status</th>
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
                          <td className="px-2 py-1 font-mono">{r.rowNumber}</td>
                          <td className="px-2 py-1 font-semibold">
                            {r.displayName || "—"}
                          </td>
                          <td className="px-2 py-1 font-mono" dir="ltr">
                            {r.phoneE164 ?? r.phoneRaw}
                          </td>
                          <td className="px-2 py-1">
                            {r.valid ? "OK" : r.error}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Quick Add / Edit Row */}
          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50/70 p-2.5 dark:border-neutral-800 dark:bg-neutral-900/50">
            <input
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder={t(
                "extensions:roster.namePlaceholder",
                "Enter full display name",
              )}
              className="border-border bg-background text-foreground min-w-44 flex-1 rounded-lg border px-3 py-1.5 text-xs font-semibold"
              data-testid="host-modal-name-input"
            />
            <input
              type="text"
              dir="ltr"
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
              placeholder={t(
                "extensions:roster.phonePlaceholder",
                "+972501234567 or 050-123-4567",
              )}
              className="border-border bg-background text-foreground min-w-48 flex-1 rounded-lg border px-3 py-1.5 font-mono text-xs"
              data-testid="host-modal-phone-input"
            />
            <NativeButton
              size="sm"
              type="button"
              disabled={isBusy}
              onClick={handleSaveParticipant}
              variant="primary"
              className="bg-primary flex items-center gap-1 rounded-lg px-3.5 py-1.5 text-xs font-bold text-white"
              data-testid="host-modal-save-participant-btn"
            >
              <Plus className="size-3.5" />
              {editingId
                ? t("extensions:roster.saveParticipant", "Save")
                : t("extensions:roster.addParticipant", "Add Participant")}
            </NativeButton>
            {editingId && (
              <NativeButton
                size="sm"
                type="button"
                onClick={() => {
                  setEditingId(null)
                  setNameInput("")
                  setPhoneInput("")
                }}
                className="border-border bg-background rounded-lg border px-2.5 py-1.5 text-xs font-semibold"
              >
                {t("extensions:roster.cancel", "Cancel")}
              </NativeButton>
            )}
            {formError && (
              <span
                className="w-full text-xs font-bold text-red-600"
                data-testid="host-modal-form-error"
              >
                {formError}
              </span>
            )}
          </div>

          {/* Search & Filter Bar */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1">
              {(
                [
                  ["all", t("extensions:roster.filterAll", "All")],
                  [
                    "connected",
                    t("extensions:roster.filterConnected", "Connected"),
                  ],
                  [
                    "disconnected",
                    t("extensions:roster.filterDisconnected", "Disconnected"),
                  ],
                  [
                    "not_joined",
                    t("extensions:roster.filterNotJoined", "Not Joined"),
                  ],
                  ["phone", t("extensions:roster.filterPhone", "Phone")],
                  ["web", t("extensions:roster.filterWeb", "Web")],
                ] as Array<[FilterTab, string]>
              ).map(([tabId, label]) => (
                <NativeButton
                  size="sm"
                  key={tabId}
                  type="button"
                  onClick={() => setFilterTab(tabId)}
                  variant={filterTab === tabId ? "primary" : "secondary"}
                  aria-pressed={filterTab === tabId}
                  data-testid={`host-filter-${tabId}`}
                  className={clsx(
                    "rounded-lg px-2.5 py-1 text-xs font-bold transition-colors",
                    filterTab === tabId
                      ? "bg-primary text-white"
                      : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300",
                  )}
                >
                  {label}
                </NativeButton>
              ))}
            </div>

            <div className="relative min-w-56">
              <Search className="absolute top-2 left-2.5 size-3.5 text-neutral-400" />
              <input
                type="text"
                value={searchQuery}
                aria-label={t("extensions:roster.searchPlaceholder")}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t(
                  "extensions:roster.searchPlaceholder",
                  "Search by name or phone number...",
                )}
                className="border-border bg-background text-foreground w-full rounded-lg border py-1 pr-3 pl-8 text-xs"
                data-testid="host-modal-search-input"
              />
            </div>
          </div>

          {/* Players Table */}
          <div className="tds-roster-table-scroll mt-3 min-h-0 flex-1 overflow-auto rounded-xl border border-neutral-200 dark:border-neutral-800">
            {filteredPlayers.length === 0 ? (
              <div
                className="p-8 text-center text-sm text-neutral-500"
                data-testid="host-modal-empty"
              >
                {t(
                  "extensions:roster.emptyRoster",
                  "No participants registered yet.",
                )}
              </div>
            ) : (
              <table
                className="w-full text-left text-xs"
                data-testid="host-modal-players-table"
              >
                <thead className="sticky top-0 bg-neutral-100 font-bold text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200">
                  <tr>
                    <th className="px-3 py-2.5">
                      {t("extensions:roster.colName", "Name")}
                    </th>
                    <th className="px-3 py-2.5">
                      {t("extensions:roster.colPhone", "Phone Number")}
                    </th>
                    <th className="px-3 py-2.5">
                      {t("extensions:roster.colSource", "Source")}
                    </th>
                    <th className="px-3 py-2.5">
                      {t("extensions:roster.colStatus", "Status")}
                    </th>
                    <th className="px-3 py-2.5">
                      {t("extensions:roster.colAnswered", "Current Q")}
                    </th>
                    <th className="px-3 py-2.5">
                      {t("extensions:roster.colPoints", "Points")}
                    </th>
                    <th className="px-3 py-2.5 text-right">
                      {t("extensions:roster.colActions")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                  {filteredPlayers.map((p) => (
                    <tr
                      key={p.rosterPlayerId}
                      data-testid={`host-player-row-${p.rosterPlayerId}`}
                      className="bg-white hover:bg-neutral-50 dark:bg-neutral-900 dark:hover:bg-neutral-800/60"
                    >
                      <td
                        className="px-3 py-2 font-bold text-neutral-900 dark:text-white"
                        data-testid={`host-player-name-${p.rosterPlayerId}`}
                      >
                        {p.displayName}
                      </td>
                      <td
                        className="px-3 py-2 font-mono text-neutral-800 dark:text-neutral-200"
                        dir="ltr"
                        data-testid={`host-player-phone-${p.rosterPlayerId}`}
                      >
                        {formatFullPhoneDisplay(p.phoneE164)}
                      </td>
                      <td className="px-3 py-2">
                        {p.source === "phone" || p.phoneE164 ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-blue-500/10 px-2 py-0.5 font-semibold text-blue-700 dark:text-blue-300">
                            <Phone className="size-3" />
                            {t("extensions:roster.sourcePhone", "Phone")}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-md bg-neutral-500/10 px-2 py-0.5 font-semibold text-neutral-700 dark:text-neutral-300">
                            <Globe className="size-3" />
                            {t("extensions:roster.sourceWeb", "Web")}
                          </span>
                        )}
                      </td>
                      <td
                        className="px-3 py-2"
                        data-testid={`host-player-status-${p.rosterPlayerId}`}
                      >
                        {p.status === "connected" && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 font-bold text-emerald-700 dark:text-emerald-300">
                            <span className="size-2 rounded-full bg-emerald-500" />
                            {t(
                              "extensions:roster.statusConnected",
                              "Connected",
                            )}
                          </span>
                        )}
                        {p.status === "disconnected" && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-0.5 font-bold text-amber-700 dark:text-amber-300">
                            <AlertCircle className="size-3" />
                            {t(
                              "extensions:roster.statusDisconnected",
                              "Disconnected",
                            )}
                          </span>
                        )}
                        {p.status === "not_joined" && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-neutral-200 px-2.5 py-0.5 font-semibold text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                            {t(
                              "extensions:roster.statusNotJoined",
                              "Not joined",
                            )}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {p.answeredCurrentQuestion ? (
                          <span className="inline-flex items-center gap-1 font-bold text-emerald-600">
                            <CheckCircle2 className="size-3.5" />
                            {t("extensions:roster.answeredYes", "Answered")}
                          </span>
                        ) : (
                          <span className="text-neutral-400">
                            {t("extensions:roster.answeredNo", "Waiting")}
                          </span>
                        )}
                      </td>
                      <td
                        className="px-3 py-2 font-mono font-bold"
                        data-testid={`host-player-points-${p.rosterPlayerId}`}
                      >
                        {p.points}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="inline-flex items-center gap-1">
                          <NativeButton
                            size="sm"
                            type="button"
                            onClick={() => handleEdit(p)}
                            aria-label={t("extensions:roster.editParticipant")}
                            className="hover:bg-accent rounded p-1 text-neutral-600 hover:text-neutral-900 dark:text-neutral-400"
                            title={t(
                              "extensions:roster.editParticipant",
                              "Edit Participant",
                            )}
                            data-testid={`host-player-edit-${p.rosterPlayerId}`}
                          >
                            <Edit2 className="size-3.5" />
                          </NativeButton>
                          <HostRosterRemove
                            name={p.displayName}
                            participantId={p.rosterPlayerId}
                            disabled={isBusy || !gameId}
                            onConfirm={() => handleRemove(p.rosterPlayerId)}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Dialog.Content>
      </DialogPortal>
    </Dialog.Root>
  )
}

export default HostPlayersModal

import {PlatformButton} from "../../presentation/platform-controls"
import {
  createDefaultRosterExtras,
  exportRosterToCsv,
  formatFullPhoneDisplay,
  generateRosterCsvTemplate,
  generateRosterPlayerId,
  generateRosterXlsxTemplate,
  normalizePhoneE164,
  parseRosterImportFile,
  type QuizExtrasV1,
  type RosterImportResult,
  type RosterParticipant,
} from "@razzia/extensions/core"
import {
  CheckCircle2,
  Download,
  Edit2,
  FileSpreadsheet,
  Phone,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
  AlertCircle,
} from "lucide-react"
import { useRef, useState } from "react"

interface Props {
  extras: QuizExtrasV1
  onChange: (_updated: QuizExtrasV1) => void
  tr: (_key: string, _fallback: string) => string
}

function triggerDownload(
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

export const RosterSection = ({ extras, onChange, tr }: Props) => {
  const roster = extras.roster ?? createDefaultRosterExtras()
  const participants: RosterParticipant[] = roster.participants
  const {phoneInviteOnly} = roster

  const [nameInput, setNameInput] = useState("")
  const [phoneInput, setPhoneInput] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [importPreview, setImportPreview] = useState<RosterImportResult | null>(
    null,
  )

  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const updateRoster = (
    nextParticipants: RosterParticipant[],
    nextInviteOnly = phoneInviteOnly,
  ) => {
    onChange({
      ...extras,
      roster: {
        phoneInviteOnly: nextInviteOnly,
        participants: nextParticipants,
      },
    })
  }

  const handleToggleInviteOnly = (enabled: boolean) => {
    updateRoster(participants, enabled)
  }

  const handleSaveParticipant = () => {
    setFormError(null)
    const trimmedName = nameInput.trim()

    if (!trimmedName || trimmedName.length > 40) {
      setFormError("Player name is required (1–40 characters)")

      return
    }

    let normalizedPhone: string | null = null
    const trimmedPhone = phoneInput.trim()

    if (trimmedPhone) {
      normalizedPhone = normalizePhoneE164(trimmedPhone)

      if (!normalizedPhone) {
        setFormError(
          "Invalid phone number. Use full format like +972501234567, 050-123-4567, or +442079460999",
        )

        return
      }

      const duplicate = participants.find(
        (p) =>
          p.phoneE164 === normalizedPhone && p.rosterPlayerId !== editingId,
      )

      if (duplicate) {
        setFormError(
          `Duplicate phone number ${normalizedPhone} (already assigned to ${duplicate.displayName})`,
        )

        return
      }
    }

    if (editingId) {
      const updated = participants.map((p) =>
        p.rosterPlayerId === editingId
          ? {
              ...p,
              displayName: trimmedName,
              phoneE164: normalizedPhone,
              phoneRaw: trimmedPhone || undefined,
            }
          : p,
      )
      updateRoster(updated)
      setEditingId(null)
    } else {
      const newParticipant: RosterParticipant = {
        rosterPlayerId: generateRosterPlayerId(),
        displayName: trimmedName,
        phoneE164: normalizedPhone,
        phoneRaw: trimmedPhone || undefined,
      }
      updateRoster([...participants, newParticipant])
    }

    setNameInput("")
    setPhoneInput("")
  }

  const handleStartEdit = (participant: RosterParticipant) => {
    setEditingId(participant.rosterPlayerId)
    setNameInput(participant.displayName)
    setPhoneInput(participant.phoneE164 ?? participant.phoneRaw ?? "")
    setFormError(null)
  }

  const handleCancelEdit = () => {
    setEditingId(null)
    setNameInput("")
    setPhoneInput("")
    setFormError(null)
  }

  const handleRemoveParticipant = (rosterPlayerId: string) => {
    updateRoster(
      participants.filter((p) => p.rosterPlayerId !== rosterPlayerId),
    )

    if (editingId === rosterPlayerId) {
      handleCancelEdit()
    }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]

    if (!file) {
      return
    }

    try {
      const arrayBuf = await file.arrayBuffer()
      const parsed = parseRosterImportFile(
        new Uint8Array(arrayBuf),
        file.name,
        participants,
      )
      setImportPreview(parsed)
    } catch {
      setFormError("Failed to read import file")
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    }
  }

  const handleApproveImport = () => {
    if (!importPreview || !importPreview.ok) {
      return
    }

    const byPhone = new Map<string, RosterParticipant>()
    const nextList: RosterParticipant[] = [...participants]

    for (const existing of nextList) {
      if (existing.phoneE164) {
        byPhone.set(existing.phoneE164, existing)
      }
    }

    for (const imported of importPreview.validParticipants) {
      const match = imported.phoneE164
        ? byPhone.get(imported.phoneE164)
        : undefined

      if (match) {
        match.displayName = imported.displayName
        match.phoneRaw = imported.phoneRaw
      } else {
        nextList.push(imported)

        if (imported.phoneE164) {
          byPhone.set(imported.phoneE164, imported)
        }
      }
    }

    updateRoster(nextList)
    setImportPreview(null)
  }

  const filteredParticipants = participants.filter((p) => {
    if (!searchQuery.trim()) {
      return true
    }

    const q = searchQuery.trim().toLowerCase()

    return (
      p.displayName.toLowerCase().includes(q) ||
      (p.phoneE164 ?? "").toLowerCase().includes(q) ||
      (p.phoneRaw ?? "").toLowerCase().includes(q)
    )
  })

  return (
    <div className="flex flex-col gap-6" data-testid="panel-roster">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
            {tr("roster.title", "Participants & Phone Roster")}
          </h3>
          <p className="text-xs text-neutral-500">
            {tr(
              "roster.description",
              "Pre-register participant names and full phone numbers (+972, +44, etc.) for instant caller recognition.",
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.csv"
            onChange={handleFileChange}
            className="hidden"
            data-testid="roster-file-input"
          />
          <PlatformButton size="sm"
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors"
            data-testid="roster-import-btn"
          >
            <Upload className="size-3.5" />
            {tr("roster.importExcelCsv", "Import Excel / CSV")}
          </PlatformButton>

          <PlatformButton size="sm"
            type="button"
            onClick={() =>
              triggerDownload(
                "tada-roster-template.xlsx",
                generateRosterXlsxTemplate(),
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
              )
            }
            className="border-border bg-background text-foreground hover:bg-accent flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors"
            data-testid="roster-download-xlsx-template"
          >
            <FileSpreadsheet className="size-3.5" />
            {tr("roster.downloadXlsxTemplate", "Template (.xlsx)")}
          </PlatformButton>

          <PlatformButton size="sm"
            type="button"
            onClick={() =>
              triggerDownload(
                "tada-roster-template.csv",
                generateRosterCsvTemplate(),
                "text/csv;charset=utf-8",
              )
            }
            className="border-border bg-background text-foreground hover:bg-accent flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors"
            data-testid="roster-download-csv-template"
          >
            <Download className="size-3.5" />
            {tr("roster.downloadCsvTemplate", "Template (.csv)")}
          </PlatformButton>

          {participants.length > 0 && (
            <PlatformButton size="sm"
              type="button"
              onClick={() =>
                triggerDownload(
                  "tada-roster-export.csv",
                  exportRosterToCsv(participants),
                  "text/csv;charset=utf-8",
                )
              }
              className="border-border bg-background text-foreground hover:bg-accent flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors"
              data-testid="roster-export-csv-btn"
            >
              <Download className="size-3.5" />
              {tr("roster.exportCsv", "Export (.csv)")}
            </PlatformButton>
          )}
        </div>
      </div>

      {/* Invite-only toggle */}
      <div className="border-border bg-card/60 flex items-center justify-between gap-4 rounded-xl border p-4">
        <div className="flex flex-col gap-0.5">
          <span className="text-foreground text-sm font-bold">
            {tr("roster.phoneInviteOnly", "Phone Invite Only")}
          </span>
          <span className="text-xs text-neutral-500">
            {tr(
              "roster.phoneInviteOnlyDesc",
              "Only allow pre-registered phone numbers to join by telephone. Unrecognized callers are rejected.",
            )}
          </span>
        </div>
        <input
          type="checkbox"
          checked={phoneInviteOnly}
          onChange={(e) => handleToggleInviteOnly(e.target.checked)}
          className="accent-primary size-5 cursor-pointer rounded"
          data-testid="toggle-phone-invite-only"
        />
      </div>

      {/* Import Preview Modal / Box */}
      {importPreview && (
        <div
          className="border-primary/40 bg-card flex flex-col gap-4 rounded-xl border-2 p-4 shadow-md"
          data-testid="roster-import-preview"
        >
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
                {tr("roster.previewTitle", "Import Preview")} —{" "}
                <span className="font-mono text-xs">{importPreview.filename}</span>
              </h4>
              {importPreview.fatalError ? (
                <p
                  className="mt-1 flex items-center gap-1.5 text-xs font-bold text-red-600"
                  data-testid="roster-import-fatal-error"
                >
                  <AlertCircle className="size-4" />
                  {importPreview.fatalError}
                </p>
              ) : (
                <p
                  className="text-xs text-neutral-600 dark:text-neutral-400"
                  data-testid="roster-import-summary"
                >
                  {tr(
                    "roster.previewSummary",
                    `${importPreview.validCount} valid of ${importPreview.totalRows} rows (${importPreview.invalidCount} with errors)`,
                  )
                    .replace("{{valid}}", String(importPreview.validCount))
                    .replace("{{total}}", String(importPreview.totalRows))
                    .replace("{{invalid}}", String(importPreview.invalidCount))}
                </p>
              )}
            </div>
            <PlatformButton size="sm"
              type="button"
              onClick={() => setImportPreview(null)}
              className="text-neutral-400 hover:text-neutral-700"
              aria-label={tr("roster.cancelImport", "Cancel Import")}
            >
              <X className="size-4" />
            </PlatformButton>
          </div>

          {importPreview.rows.length > 0 && (
            <div className="max-h-60 overflow-y-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-neutral-100 font-bold text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200">
                  <tr>
                    <th className="px-3 py-2">#</th>
                    <th className="px-3 py-2">
                      {tr("roster.colName", "Name")}
                    </th>
                    <th className="px-3 py-2">
                      {tr("roster.colPhone", "Phone Number")}
                    </th>
                    <th className="px-3 py-2">
                      {tr("roster.colStatus", "Status")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                  {importPreview.rows.map((row) => (
                    <tr
                      key={row.rowNumber}
                      data-testid={`import-preview-row-${row.rowNumber}`}
                      className={
                        row.valid
                          ? "bg-white dark:bg-neutral-900"
                          : "bg-red-50/70 dark:bg-red-950/30"
                      }
                    >
                      <td className="px-3 py-1.5 font-mono text-neutral-500">
                        {row.rowNumber}
                      </td>
                      <td className="px-3 py-1.5 font-semibold">
                        {row.displayName || "—"}
                      </td>
                      <td className="px-3 py-1.5 font-mono" dir="ltr">
                        {row.phoneE164 ?? (row.phoneRaw || "—")}
                      </td>
                      <td className="px-3 py-1.5">
                        {row.valid ? (
                          <span className="inline-flex items-center gap-1 font-bold text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="size-3.5" />
                            {tr("roster.statusValid", "Valid")}
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center gap-1 font-bold text-red-600 dark:text-red-400"
                            data-testid={`import-row-error-${row.rowNumber}`}
                          >
                            <AlertCircle className="size-3.5" />
                            {row.error}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex items-center justify-end gap-2">
            <PlatformButton size="sm"
              type="button"
              onClick={() => setImportPreview(null)}
              className="border-border bg-background text-foreground hover:bg-accent rounded-lg border px-3 py-1.5 text-xs font-bold"
              data-testid="roster-import-cancel-btn"
            >
              {tr("roster.cancelImport", "Cancel Import")}
            </PlatformButton>
            {importPreview.ok && importPreview.validCount > 0 && (
              <PlatformButton size="sm"
                type="button"
                onClick={handleApproveImport}
                className="bg-primary rounded-lg px-4 py-1.5 text-xs font-bold text-white shadow-sm hover:opacity-90"
                data-testid="roster-import-approve-btn"
              >
                {tr(
                  "roster.approveImport",
                  `Approve & Import (${importPreview.validCount})`,
                ).replace("{{count}}", String(importPreview.validCount))}
              </PlatformButton>
            )}
          </div>
        </div>
      )}

      {/* Add / Edit Participant Form */}
      <div className="border-border bg-card/60 flex flex-col gap-3 rounded-xl border p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
          <div className="sm:col-span-5">
            <label className="mb-1 block text-xs font-bold text-neutral-600 dark:text-neutral-300">
              {tr("roster.nameLabel", "Player Name")}
            </label>
            <input
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder={tr(
                "roster.namePlaceholder",
                "Enter full display name",
              )}
              className="border-accent bg-background text-foreground focus:ring-primary w-full rounded-lg border px-3 py-2 text-xs font-semibold focus:ring-2 focus:outline-none"
              data-testid="roster-name-input"
            />
          </div>

          <div className="sm:col-span-5">
            <label className="mb-1 block text-xs font-bold text-neutral-600 dark:text-neutral-300">
              {tr("roster.phoneLabel", "Phone Number")}
            </label>
            <input
              type="text"
              dir="ltr"
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
              placeholder={tr(
                "roster.phonePlaceholder",
                "+972501234567 or 050-123-4567",
              )}
              className="border-accent bg-background text-foreground focus:ring-primary w-full rounded-lg border px-3 py-2 font-mono text-xs focus:ring-2 focus:outline-none"
              data-testid="roster-phone-input"
            />
          </div>

          <div className="flex items-end gap-2 sm:col-span-2">
            <PlatformButton size="sm"
              type="button"
              onClick={handleSaveParticipant}
              className="bg-primary flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold text-white shadow-sm transition-opacity hover:opacity-90"
              data-testid="roster-save-participant-btn"
            >
              <Plus className="size-4" />
              {editingId
                ? tr("roster.saveParticipant", "Save")
                : tr("roster.addParticipant", "Add Participant")}
            </PlatformButton>
            {editingId && (
              <PlatformButton size="sm"
                type="button"
                onClick={handleCancelEdit}
                className="border-border bg-background text-foreground rounded-lg border px-2.5 py-2 text-xs font-semibold"
                data-testid="roster-cancel-edit-btn"
              >
                {tr("roster.cancel", "Cancel")}
              </PlatformButton>
            )}
          </div>
        </div>

        {formError && (
          <p
            className="text-xs font-bold text-red-600 dark:text-red-400"
            data-testid="roster-form-error"
          >
            {formError}
          </p>
        )}
      </div>

      {/* Participant List Table */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className=" absolute top-2.5 left-3 size-3.5 text-neutral-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={tr(
                "roster.searchPlaceholder",
                "Search by name or phone number...",
              )}
              className="border-border bg-background text-foreground w-full rounded-lg border py-1.5 pr-3 pl-8 text-xs focus:outline-none"
              data-testid="roster-search-input"
            />
          </div>
          <span
            className="text-xs font-bold text-neutral-500"
            data-testid="roster-count-badge"
          >
            {filteredParticipants.length} / {participants.length}
          </span>
        </div>

        {filteredParticipants.length === 0 ? (
          <div
            className="border-border rounded-xl border border-dashed p-6 text-center text-xs text-neutral-500"
            data-testid="roster-empty-state"
          >
            {tr(
              "roster.emptyRoster",
              "No participants registered yet. Add manually or import an Excel (.xlsx) or CSV file.",
            )}
          </div>
        ) : (
          <div className="max-h-72 overflow-y-auto rounded-xl border border-neutral-200 dark:border-neutral-800">
            <table
              className="w-full text-left text-xs"
              data-testid="roster-participants-table"
            >
              <thead className="sticky top-0 bg-neutral-100 font-bold text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200">
                <tr>
                  <th className="px-3 py-2.5">
                    {tr("roster.colName", "Name")}
                  </th>
                  <th className="px-3 py-2.5">
                    {tr("roster.colPhone", "Phone Number")}
                  </th>
                  <th className="px-3 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {filteredParticipants.map((participant) => (
                  <tr
                    key={participant.rosterPlayerId}
                    data-testid={`roster-row-${participant.rosterPlayerId}`}
                    className="bg-white hover:bg-neutral-50 dark:bg-neutral-900 dark:hover:bg-neutral-800/60"
                  >
                    <td className="px-3 py-2 font-bold text-neutral-900 dark:text-neutral-100">
                      {participant.displayName}
                    </td>
                    <td
                      className="px-3 py-2 font-mono text-neutral-700 dark:text-neutral-300"
                      dir="ltr"
                      data-testid={`roster-phone-${participant.rosterPlayerId}`}
                    >
                      <span className="inline-flex items-center gap-1.5">
                        {participant.phoneE164 && (
                          <Phone className="size-3 text-emerald-600" />
                        )}
                        {formatFullPhoneDisplay(participant.phoneE164)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="inline-flex items-center gap-1">
                        <PlatformButton size="sm"
                          type="button"
                          onClick={() => handleStartEdit(participant)}
                          className="hover:bg-accent rounded p-1 text-neutral-600 hover:text-neutral-900 dark:text-neutral-400"
                          title={tr(
                            "roster.editParticipant",
                            "Edit Participant",
                          )}
                          data-testid={`roster-edit-${participant.rosterPlayerId}`}
                        >
                          <Edit2 className="size-3.5" />
                        </PlatformButton>
                        <PlatformButton size="sm"
                          type="button"
                          onClick={() =>
                            handleRemoveParticipant(participant.rosterPlayerId)
                          }
                          className="hover:bg-accent rounded p-1 text-red-500 hover:text-red-700"
                          title={tr("roster.remove", "Remove")}
                          data-testid={`roster-remove-${participant.rosterPlayerId}`}
                        >
                          <Trash2 className="size-3.5" />
                        </PlatformButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

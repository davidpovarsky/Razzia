import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import Button from "@razzia/web/components/Button"
import { packageJson, packageRequest, type PackageReceipt } from "./package-api"
import { PackageRuntimePreview } from "./PackageRuntimePreview"
import { packageSaveText } from "./package-save-strings"

interface CatalogEntry {
  upload: string
  package_id: string
  version: string
  phase: string
}

export function PackageManager({
  file,
  onImported,
  onFileConsumed,
  themesOnly = false,
  initialUploadId,
  initialExpectedRevision,
  initialGameId,
  fullPage = false,
}: {
  file: File | null
  themesOnly?: boolean
  onImported: () => unknown
  onFileConsumed: () => void
  initialUploadId?: string
  initialExpectedRevision?: number
  initialGameId?: string
  fullPage?: boolean
}) {
  const { t, i18n } = useTranslation()
  const saveText = packageSaveText(i18n.resolvedLanguage ?? i18n.language)
  const [enabled, setEnabled] = useState(false)
  const [capabilityError, setCapabilityError] = useState(false)
  const [capabilityRevision, setCapabilityRevision] = useState(0)
  const [receipt, setReceipt] = useState<PackageReceipt | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [catalog, setCatalog] = useState<CatalogEntry[]>([])
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState(false)
  const [useClassic, setUseClassic] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const running = useRef(false)
  const reload = (signal?: AbortSignal) =>
    packageJson<{ packages: CatalogEntry[] }>("", { signal }).then((r) => {
      if (!signal?.aborted) {
        setCatalog(r.packages)
      }
    })
  useEffect(() => {
    const controller = new AbortController()
    void packageJson("/capabilities", { signal: controller.signal })
      .then(async () => {
        controller.signal.throwIfAborted()
        setEnabled(true)
        setCapabilityError(false)
        const initial =
          initialUploadId ??
          new URLSearchParams(window.location.search).get("packageUpload")

        if (initial && !themesOnly) {
          const result = await packageJson<PackageReceipt>(
            `/uploads/${encodeURIComponent(initial)}`,
            { signal: controller.signal },
          )

          controller.signal.throwIfAborted()

          if (
            result.uploadId !== initial ||
            (initialExpectedRevision !== undefined &&
              result.revision !== initialExpectedRevision) ||
            (initialGameId &&
              !result.manifest.contents.some(
                (content) =>
                  content.kind === "game" && content.id === initialGameId,
              ))
          ) {
            setError("PACKAGE_PREVIEW_STALE")

            return
          }

          setReceipt(result)
          setSelected(result.manifest.contents.map((c) => c.id))
          setPreview(true)
        }

        if (!themesOnly) {
          return reload(controller.signal)
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setCapabilityError(true)
        }
      })

    return () => {
      controller.abort()
    }
  }, [
    themesOnly,
    capabilityRevision,
    initialUploadId,
    initialExpectedRevision,
    initialGameId,
  ])
  const run = async (task: () => Promise<void>) => {
    if (running.current) {
      return
    }

    running.current = true
    setBusy(true)
    setError("")

    try {
      await task()
    } catch (e) {
      setError(e instanceof Error ? e.message : "PACKAGE_REQUEST_FAILED")
    } finally {
      running.current = false
      setBusy(false)
    }
  }
  const upload = (value: File) =>
    run(async () => {
      setPreview(false)
      const bytes = await value.arrayBuffer()
      await packageJson("/preflight", { method: "POST", body: bytes })
      const result = await packageJson<PackageReceipt>("/uploads", {
        method: "POST",
        body: bytes,
        headers: { "Idempotency-Key": crypto.randomUUID() },
      })
      setReceipt(result)
      const items = result.manifest.contents.filter((c) =>
        themesOnly ? c.kind !== "game" : !c.demo,
      )
      setSelected(items.map((c) => c.id))

      if (themesOnly && items.length === 0) {
        setError("PACKAGE_NO_THEMES")

        return
      }

      if (!themesOnly) {
        await reload()
      }
    })
  const uploadRef = useRef(upload)
  useLayoutEffect(() => {
    uploadRef.current = upload
  })
  useEffect(() => {
    if (!file) {
      return
    }

    let active = true
    queueMicrotask(() => {
      if (active) {
        void uploadRef.current(file).finally(onFileConsumed)
      }
    })

    return () => {
      active = false
    }
  }, [file, onFileConsumed])
  useEffect(() => {
    if (receipt?.phase !== "building") {
      return
    }

    const controller = new AbortController()
    const timer = setInterval(() => {
      void packageJson<PackageReceipt>(`/uploads/${receipt.uploadId}`, {
        signal: controller.signal,
      })
        .then((value) => {
          if (!controller.signal.aborted) {
            setReceipt(value)
          }
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setError("PACKAGE_BUILD_FAILED")
          }
        })
    }, 1500)

    return () => {
      controller.abort()
      clearInterval(timer)
    }
  }, [receipt?.uploadId, receipt?.phase])

  if (themesOnly && !enabled) {
    return (
      <div
        className="border-accent space-y-2 rounded-lg border p-3 text-sm"
        data-testid="theme-import-status"
      >
        <p role={capabilityError ? "alert" : "status"}>
          {t(
            capabilityError
              ? "extensions:themes.importUnavailable"
              : "common:loading",
          )}
        </p>
        {capabilityError && (
          <Button
            type="button"
            size="sm"
            onClick={() => setCapabilityRevision((value) => value + 1)}
          >
            {t("extensions:conflict.reload")}
          </Button>
        )}
      </div>
    )
  }

  if (!enabled && !file && !error && !fullPage) {
    return null
  }

  return (
    <section
      className={
        themesOnly
          ? "border-accent font-display space-y-3 rounded-xl border p-3"
          : `border-accent font-display mb-4 shrink-0 space-y-3 overflow-y-auto rounded-xl border p-3 ${fullPage ? "" : "max-h-[60dvh]"}`
      }
      data-testid="package-manager"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">
          {t(
            themesOnly
              ? "extensions:themes.importTheme"
              : "extensions:packages.title",
          )}
        </h2>
        <Button
          type="button"
          size="sm"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          {t(
            themesOnly
              ? "extensions:themes.chooseThemeFile"
              : "extensions:packages.installFile",
          )}
        </Button>
        <input
          ref={input}
          type="file"
          disabled={busy}
          accept=".tadazz"
          className="hidden"
          data-testid="package-file-input"
          onChange={(e) => {
            const value = e.target.files?.[0]

            if (value) {
              void upload(value)
            }

            e.target.value = ""
          }}
        />
      </div>
      {themesOnly && (
        <p className="text-muted-foreground text-sm">
          {t("extensions:themes.importHint")}
        </p>
      )}
      {error && (
        <p role="alert" className="text-red-600">
          {error === "PACKAGE_NO_THEMES" ? (
            t("extensions:themes.importEmpty")
          ) : (
            <>
              {t("extensions:packages.failed")} <code>{error}</code>
            </>
          )}
        </p>
      )}
      {busy && <p role="status">{t("extensions:packages.working")}</p>}
      {receipt && (
        <div className="space-y-3" data-testid="package-preflight">
          <p className="font-semibold">
            {receipt.manifest.displayName} · {receipt.manifest.version}
          </p>
          <p className="text-muted-foreground text-sm">
            {receipt.manifest.author} · {receipt.assetCount}{" "}
            {t("extensions:packages.assets")} ·{" "}
            {(receipt.totalBytes / 1024).toFixed(1)} KB
          </p>
          <p role="status">
            {t(`extensions:packages.states.${receipt.phase}`)}
          </p>
          {receipt.code && (
            <p className="text-sm">{t("extensions:packages.codeBoundary")}</p>
          )}
          {receipt.manifest.contents
            .filter((item) => !themesOnly || item.kind !== "game")
            .map((item) => (
              <label key={item.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selected.includes(item.id)}
                  disabled={busy || receipt.phase === "installed"}
                  onChange={(e) =>
                    setSelected((old) =>
                      e.target.checked
                        ? [...old, item.id]
                        : old.filter((id) => id !== item.id),
                    )
                  }
                />
                <span>
                  {item.id} ·{" "}
                  {t(
                    item.kind === "game"
                      ? "extensions:packages.game"
                      : "extensions:packages.theme",
                  )}
                  {item.demo ? ` · ${t("extensions:packages.demo")}` : ""}
                </span>
              </label>
            ))}
          {!themesOnly &&
            receipt.manifest.contents.some(
              (c) => c.kind !== "game" && !selected.includes(c.id),
            ) && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={useClassic}
                  onChange={(e) => setUseClassic(e.target.checked)}
                  disabled={busy}
                />
                {t("extensions:themes.select")} · TADAZZ Classic
              </label>
            )}
          <div className="flex flex-wrap gap-2">
            {selected.length > 0 &&
              ["validated", "failed"].includes(receipt.phase) && (
                <Button
                  type="button"
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await packageRequest(
                        `/uploads/${receipt.uploadId}/build`,
                        {
                          method: "POST",
                        },
                      )
                      setReceipt({ ...receipt, phase: "building" })
                    })
                  }
                >
                  {t("extensions:packages.build")}
                </Button>
              )}
            {receipt.manifest.contents.length > 0 &&
              ["preview-ready", "installed"].includes(receipt.phase) && (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setPreview((v) => !v)}
                >
                  {t("extensions:packages.preview")}
                </Button>
              )}
            <Button
              type="button"
              size="sm"
              data-testid="package-install-selected"
              disabled={
                busy || !selected.length || receipt.phase !== "preview-ready"
              }
              onClick={() =>
                void run(async () => {
                  const result = await packageJson<PackageReceipt>(
                    `/uploads/${receipt.uploadId}/install`,
                    {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        expectedRevision: receipt.revision,
                        selected,
                        useClassicWhenThemeSkipped: useClassic,
                      }),
                    },
                  )
                  setReceipt(result)

                  if (!themesOnly) {
                    await reload()
                  }

                  onImported()
                  window.dispatchEvent(new Event("tadazz:packages-changed"))
                })
              }
            >
              {t("extensions:packages.installSelected")}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const response = await packageRequest(
                    `/uploads/${receipt.uploadId}/export`,
                    { method: "POST" },
                  )
                  const url = URL.createObjectURL(await response.blob()),
                    link = document.createElement("a")
                  link.href = url
                  link.download = `${receipt.manifest.id}.tadazz`
                  link.click()
                  setTimeout(() => URL.revokeObjectURL(url), 1000)
                })
              }
            >
              {t("extensions:packages.export")}
            </Button>
          </div>
          {!themesOnly && receipt.installedGames.length > 0 && (
            <a
              href="/studio/games"
              className="inline-flex min-h-11 items-center font-semibold underline"
              data-testid="package-open-games"
            >
              {saveText.games}
            </a>
          )}
          {!["installed", "building"].includes(receipt.phase) && (
            <Button
              type="button"
              size="sm"
              className="bg-accent text-foreground"
              onClick={() =>
                void run(async () => {
                  await packageRequest(`/uploads/${receipt.uploadId}`, {
                    method: "DELETE",
                  })
                  setReceipt(null)
                  setPreview(false)
                  await reload()
                })
              }
            >
              {t("common:delete")}
            </Button>
          )}
          {preview && (
            <PackageRuntimePreview
              key={`${receipt.uploadId}:${receipt.revision}`}
              receipt={receipt}
              initialGameId={initialGameId}
            />
          )}
          {!themesOnly &&
            receipt.installedGames.map((quizId) => (
              <Button
                type="button"
                key={quizId}
                size="sm"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const response = await packageRequest(
                      `/uploads/${receipt.uploadId}/games/${quizId}/export`,
                      { method: "POST" },
                    )
                    const url = URL.createObjectURL(await response.blob()),
                      link = document.createElement("a")
                    link.href = url
                    link.download = `game-${quizId}.tadazz`
                    link.click()
                    setTimeout(() => URL.revokeObjectURL(url), 1000)
                  })
                }
              >
                {t("extensions:packages.export")} · {quizId.slice(0, 8)}
              </Button>
            ))}
        </div>
      )}
      {!themesOnly && catalog.length > 0 && (
        <ul
          className="space-y-2"
          aria-label={t("extensions:packages.installed")}
        >
          {catalog.map((item) => (
            <li
              key={item.upload}
              className="flex flex-wrap items-center gap-2 text-sm"
            >
              <Button
                type="button"
                size="sm"
                className="bg-accent text-foreground"
                onClick={() =>
                  void run(async () => {
                    const result = await packageJson<PackageReceipt>(
                      `/uploads/${item.upload}`,
                    )
                    setReceipt(result)
                    setSelected(result.manifest.contents.map((c) => c.id))
                    setPreview(false)
                  })
                }
              >
                {item.package_id} · {item.version}
              </Button>
              <span>{t(`extensions:packages.states.${item.phase}`)}</span>
              {item.phase === "installed" && (
                <Button
                  type="button"
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await packageRequest(`/uploads/${item.upload}/rollback`, {
                        method: "POST",
                      })
                      await reload()
                      onImported()
                    })
                  }
                >
                  {t("extensions:packages.rollback")}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

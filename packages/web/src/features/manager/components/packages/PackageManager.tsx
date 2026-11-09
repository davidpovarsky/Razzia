import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import Button from "@razzia/web/components/Button"
import { packageJson, packageRequest, type PackageReceipt } from "./package-api"
import { PackageRuntimePreview } from "./PackageRuntimePreview"

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
}: {
  file: File | null
  onImported: () => unknown
  onFileConsumed: () => void
}) {
  const { t } = useTranslation()
  const [enabled, setEnabled] = useState(false)
  const [receipt, setReceipt] = useState<PackageReceipt | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [catalog, setCatalog] = useState<CatalogEntry[]>([])
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState(false)
  const [useClassic, setUseClassic] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const reload = () =>
    packageJson<{ packages: CatalogEntry[] }>("").then((r) =>
      setCatalog(r.packages),
    )
  useEffect(() => {
    void packageJson("/capabilities")
      .then(async () => {
        setEnabled(true)
        const initial = new URLSearchParams(window.location.search).get(
          "packageUpload",
        )

        if (initial) {
          const result = await packageJson<PackageReceipt>(
            `/uploads/${encodeURIComponent(initial)}`,
          )
          setReceipt(result)
          setSelected(result.manifest.contents.map((c) => c.id))
          setPreview(true)
        }

        return reload()
      })
      .catch(() => undefined)
  }, [])
  const run = async (task: () => Promise<void>) => {
    setBusy(true)
    setError("")

    try {
      await task()
    } catch (e) {
      setError(e instanceof Error ? e.message : "PACKAGE_REQUEST_FAILED")
    } finally {
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
      setSelected(
        result.manifest.contents.filter((c) => !c.demo).map((c) => c.id),
      )
      await reload()
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

    const timer = setInterval(() => {
      void packageJson<PackageReceipt>(`/uploads/${receipt.uploadId}`)
        .then(setReceipt)
        .catch(() => setError("PACKAGE_BUILD_FAILED"))
    }, 1500)

    return () => clearInterval(timer)
  }, [receipt?.uploadId, receipt?.phase])

  if (!enabled && !file && !error) {
    return null
  }

  return (
    <section
      className="border-accent font-display mb-4 max-h-[60dvh] shrink-0 space-y-3 overflow-y-auto rounded-xl border p-3"
      data-testid="package-manager"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">{t("extensions:packages.title")}</h2>
        <Button
          size="sm"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          {t("extensions:packages.installFile")}
        </Button>
        <input
          ref={input}
          type="file"
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
      {error && (
        <p role="alert" className="text-red-600">
          {t("extensions:packages.failed")} <code>{error}</code>
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
          {receipt.manifest.contents.map((item) => (
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
          {receipt.manifest.contents.some(
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
            {["validated", "failed"].includes(receipt.phase) && (
              <Button
                size="sm"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await packageRequest(`/uploads/${receipt.uploadId}/build`, {
                      method: "POST",
                    })
                    setReceipt({ ...receipt, phase: "building" })
                  })
                }
              >
                {t("extensions:packages.build")}
              </Button>
            )}
            {receipt.manifest.contents.some((c) => c.kind !== "game") &&
              ["preview-ready", "installed"].includes(receipt.phase) && (
                <Button size="sm" onClick={() => setPreview((v) => !v)}>
                  {t("extensions:packages.preview")}
                </Button>
              )}
            <Button
              size="sm"
              disabled={
                busy ||
                !selected.length ||
                receipt.phase !== "preview-ready" ||
                (receipt.manifest.contents.some(
                  (c) => c.kind !== "game" && selected.includes(c.id),
                ) &&
                  !receipt.reviewed)
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
                  await reload()
                  onImported()
                  window.dispatchEvent(new Event("tadazz:packages-changed"))
                })
              }
            >
              {t("extensions:packages.installSelected")}
            </Button>
            <Button
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
          {receipt.manifest.contents.some((c) => c.kind !== "game") &&
            !receipt.reviewed && (
              <p className="text-muted-foreground text-sm">
                {t("extensions:packages.reviewRequired")}
              </p>
            )}
          {!["installed", "building"].includes(receipt.phase) && (
            <Button
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
          {preview && <PackageRuntimePreview receipt={receipt} />}
          {receipt.installedGames.map((quizId) => (
            <Button
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
      {catalog.length > 0 && (
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

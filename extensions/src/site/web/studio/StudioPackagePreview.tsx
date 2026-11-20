import { useParams } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"
import { PackageManager } from "@razzia/web/features/manager/components/packages/PackageManager"
import { PackageSaveConsent } from "@razzia/web/features/manager/components/packages/PackageSaveConsent"
import { SiteLink } from "../shared/SiteLink"

function PackagePage({ children }: { children: import("react").ReactNode }) {
  const { t } = useTranslation()
  return (
    <main
      className="font-display min-h-dvh p-4 md:p-8"
      style={{ maxWidth: 1400, marginInline: "auto" }}
    >
      <header className="mb-5 flex items-center justify-between gap-4">
        <SiteLink href="/studio/games" className="font-semibold">
          Tadazz
        </SiteLink>
        <SiteLink href="/studio/games">{t("common:back")}</SiteLink>
      </header>
      {children}
    </main>
  )
}

export function StudioPackagePreview() {
  const { t } = useTranslation()
  const {
    uploadId,
    revision: revisionText,
    gameId,
  } = useParams({ strict: false }) as Record<string, string | undefined>
  const revision = Number(revisionText)
  const valid =
    uploadId &&
    /^[A-Za-z0-9_-]{1,160}$/u.test(uploadId) &&
    gameId &&
    /^[A-Za-z0-9._-]{1,160}$/u.test(gameId) &&
    Number.isSafeInteger(revision) &&
    revision > 0
  return (
    <PackagePage>
      {valid ? (
        <PackageManager
          file={null}
          onImported={() => undefined}
          onFileConsumed={() => undefined}
          initialUploadId={uploadId}
          initialExpectedRevision={revision}
          initialGameId={gameId}
          fullPage
        />
      ) : (
        <p role="alert">{t("extensions:packages.runtimeFailed")}</p>
      )}
    </PackagePage>
  )
}

export function StudioPackageSaveConsent() {
  const { requestId } = useParams({ strict: false }) as Record<
    string,
    string | undefined
  >
  const { t } = useTranslation()
  return (
    <PackagePage>
      {requestId && /^[A-Za-z0-9_-]{1,160}$/u.test(requestId) ? (
        <PackageSaveConsent requestId={requestId} />
      ) : (
        <p role="alert">{t("extensions:packages.runtimeFailed")}</p>
      )}
    </PackagePage>
  )
}

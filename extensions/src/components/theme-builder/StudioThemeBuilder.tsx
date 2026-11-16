import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import {
  AlertDialog,
  Button,
  Input,
  PlatformScope,
  Select,
} from "../../platform-ui"
import { getNativeShowLibrary } from "../../core/show-library/native-library"
import { getToken } from "@razzia/web/lib/session"
import { siteRequest } from "../../site/adapters/client"
import type { PreviewLocale } from "../../presentation/show-library-preview/i18n"
import { createBuilderClient, type BuilderReceipt } from "./client"
import {
  ThemeBuilderShell,
  createNativeBuilderDocument,
} from "./ThemeBuilderShell"
import { builderText } from "./strings"
import { nativeBuilderText } from "./NativeLibraryPanel"

/** Mounted only after Studio's real account check. Server grants remain authoritative. */
export function StudioThemeBuilder({ accountId }: { accountId: string }) {
  // Drafts, permissions and in-flight work belong to one verified account.
  // A new account must never inherit the old account's editable document.
  return <AccountThemeBuilder key={accountId} accountId={accountId} />
}

function AccountThemeBuilder({ accountId }: { accountId: string }) {
  const { i18n } = useTranslation()
  const language = i18n.language.split("-")[0]
  const locale: PreviewLocale = [
    "en",
    "fr",
    "de",
    "es",
    "it",
    "ja",
    "tr",
    "vi",
  ].includes(language)
    ? (language as PreviewLocale)
    : "en"
  const text = builderText(locale),
    client = useMemo(
      () => createBuilderClient(accountId, async () => getToken() ?? ""),
      [accountId],
    )
  const [catalog, setCatalog] = useState<
    Array<{ id: string; name: string; revision: number }>
  >([])
  const [loaded, setLoaded] = useState(false),
    [failed, setFailed] = useState(false),
    [canAuthor, setCanAuthor] = useState(false)
  const [opened, setOpened] = useState<BuilderReceipt | null>(null),
    [dirty, setDirty] = useState(false),
    [pending, setPending] = useState(false)
  const [destination, setDestination] = useState<string | null>(null),
    [family, setFamily] = useState("razzia-original"),
    [name, setName] = useState(text("title"))
  const openRequest = useRef<AbortController | null>(null)
  useEffect(() => () => openRequest.current?.abort(), [])
  const changed = useCallback((value: boolean) => setDirty(value), [])
  const saved = useCallback(
    (receipt: BuilderReceipt) =>
      setCatalog((previous) => [
        {
          id: receipt.document.id,
          name: receipt.document.name,
          revision: receipt.revision,
        },
        ...previous.filter((item) => item.id !== receipt.document.id),
      ]),
    [],
  )
  useEffect(() => {
    const abort = new AbortController()
    setLoaded(false)
    setFailed(false)
    void siteRequest<{ workspaces: Record<string, string[]> }>(
      "/api/themes/workspaces",
      { signal: abort.signal },
    )
      .then(async (result) => {
        if (abort.signal.aborted) return
        if (!result.workspaces[accountId]?.includes("author")) {
          setCanAuthor(false)
          return
        }
        const documents = await client.list(abort.signal)
        if (!abort.signal.aborted) {
          setCanAuthor(true)
          setCatalog(documents)
        }
      })
      .catch(() => {
        if (!abort.signal.aborted) setFailed(true)
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoaded(true)
      })
    return () => abort.abort()
  }, [accountId, client])
  const open = async (id: string) => {
    if (openRequest.current) {
      return
    }

    const controller = new AbortController()
    openRequest.current = controller
    setPending(true)
    try {
      const receipt =
        id === "new"
          ? {
              document: createNativeBuilderDocument(family, name),
              revision: 0,
              digest: "",
            }
          : await client.read(
              id,
              AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]),
            )

      if (controller.signal.aborted) {
        return
      }
      setOpened(receipt)
      setDirty(false)
      setFailed(false)
    } catch {
      if (!controller.signal.aborted) {
        setFailed(true)
      }
    } finally {
      if (openRequest.current === controller) {
        openRequest.current = null
      }

      if (!controller.signal.aborted) {
        setPending(false)
        setDestination(null)
      }
    }
  }
  const choose = (id: string) => {
    if (dirty) setDestination(id)
    else void open(id)
  }
  return (
    <>
      <PlatformScope context="platform.studio" appearance="light">
        <div className="theme-builder-toolbar" style={{ padding: "1rem" }}>
          <a
            href="/studio"
            onClick={(event) => {
              if (dirty) {
                event.preventDefault()
                setDestination("back")
              }
            }}
          >
            {text("back")}
          </a>
          {!loaded ? (
            <p role="status">{text("loading")}</p>
          ) : (
            <>
              <Select
                label={text("screens")}
                value={opened?.document.id ?? ""}
                disabled={pending || !canAuthor}
                onChange={(event) => {
                  if (event.target.value) choose(event.target.value)
                }}
              >
                <option value="">{text("select")}</option>
                {catalog.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </Select>
              <Select
                label={text("title")}
                value={family}
                disabled={pending || !canAuthor}
                onChange={(event) => setFamily(event.target.value)}
              >
                {getNativeShowLibrary().families.map((item) => (
                  <option key={item.ref.id} value={item.ref.id}>
                    {nativeBuilderText(
                      locale,
                      item.definition.nameKey.replace(
                        /^extensions:themes\./u,
                        "",
                      ),
                    )}
                  </option>
                ))}
              </Select>
              <Input
                label={text("name")}
                value={name}
                maxLength={120}
                disabled={!canAuthor}
                onChange={(event) => setName(event.target.value)}
              />
              <Button
                disabled={!canAuthor || !name.trim() || pending}
                onClick={() => choose("new")}
              >
                {text("create")}
              </Button>
            </>
          )}
          {failed && <p role="alert">{text("unavailable")}</p>}
        </div>
        <AlertDialog
          open={Boolean(destination)}
          onOpenChange={(value) => {
            if (!value) setDestination(null)
          }}
          title={text("discard")}
          description={text("unsaved")}
          confirmLabel={text("confirm")}
          cancelLabel={text("cancel")}
          errorLabel={text("error")}
          onConfirm={() => {
            if (destination === "back") window.location.assign("/studio")
            else if (destination) return open(destination)
          }}
        />
      </PlatformScope>
      <ThemeBuilderShell
        key={opened?.document.id ?? "empty"}
        locale={locale}
        initialDocument={opened?.document}
        initialRevision={opened?.revision}
        client={client}
        canAuthor={canAuthor}
        tenantId={accountId}
        appearance="light"
        onDirtyChange={changed}
        onSaved={saved}
      />
    </>
  )
}

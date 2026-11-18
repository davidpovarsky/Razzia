// oxlint-disable typescript/no-unnecessary-condition -- Abort state may change across asynchronous catalogue callbacks.
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
import { InlineGamePreviewBoundary } from "../../site/components/game-preview/boundary"
import {
  createAccountPreviewProvider,
  createAccountPreviewAccess,
} from "../../site/components/game-preview/account-provider"

/** Mounted only after Studio's real account check. Server grants remain authoritative. */
export function StudioThemeBuilder({ accountId }: { accountId: string }) {
  // Drafts, permissions and in-flight work belong to one verified account.
  // A new account must never inherit the old account's editable document.
  return <AccountThemeBuilder key={accountId} accountId={accountId} />
}

function AccountThemeBuilder({ accountId }: { accountId: string }) {
  const [workspaceId, setWorkspaceId] = useState(accountId)
  const [workspaces, setWorkspaces] = useState<string[]>([accountId])
  const { i18n } = useTranslation()
  const [language] = i18n.language.split("-")
  const locale: PreviewLocale = [
    "en",
    "fr",
    "de",
    "es",
    "it",
    "ja",
    "tr",
    "vi",
    "he",
  ].includes(language)
    ? (language as PreviewLocale)
    : "en"
  const text = builderText(locale),
    client = useMemo(
      () =>
        createBuilderClient(workspaceId, () =>
          Promise.resolve(getToken() ?? ""),
        ),
      [workspaceId],
    )
  const [catalog, setCatalog] = useState<
    Array<{ id: string; name: string; revision: number }>
  >([])
  const provider = useMemo(
    () => createAccountPreviewProvider(accountId),
    [accountId],
  )
  const [games, setGames] = useState<Array<{ id: string; title: string }>>([])
  const [quizId, setQuizId] = useState("")
  const [cardScopes, setCardScopes] = useState<
    Array<{ id: string; key: string; label: string }>
  >([])
  const [gameScopeId, setGameScopeId] = useState("")
  useEffect(() => {
    const controller = new AbortController()
    setGameScopeId("")
    setCardScopes([])

    if (quizId) {
      void createAccountPreviewAccess(accountId)
        .readSource(quizId, controller.signal)
        .then((source) => {
          if (!controller.signal.aborted) {
            setCardScopes(
              source.show.cards.map((card, index) => ({
                id: source.scopeIds[card.key],
                key: card.key,
                label: `${index + 1}. ${card.kind === "quiz" || card.kind === "survey" ? card.question : (card.title ?? card.kind)}`,
              })),
            )
          }
        })
        .catch(() => undefined)
    }

    return () => controller.abort()
  }, [accountId, quizId])
  useEffect(() => {
    const controller = new AbortController()
    void siteRequest<{ games: Array<{ id: string; title: string }> }>(
      "/api/extensions/preview/catalogue",
      { signal: controller.signal },
    )
      .then((value) => {
        if (!controller.signal.aborted && Array.isArray(value.games)) {
          setGames(value.games)
          setQuizId(value.games[0]?.id ?? "")
        }
      })
      .catch(() => undefined)

    return () => controller.abort()
  }, [accountId])
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
    setCanAuthor(false)
    void siteRequest<{ workspaces: Record<string, string[]> }>(
      "/api/themes/workspaces",
      { signal: abort.signal },
    )
      .then(async (result) => {
        if (abort.signal.aborted) {
          return
        }

        setWorkspaces(
          Object.keys(result.workspaces).filter((id) =>
            result.workspaces[id]?.includes("author"),
          ),
        )

        if (!result.workspaces[workspaceId]?.includes("author")) {
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
        if (!abort.signal.aborted) {
          setFailed(true)
        }
      })
      .finally(() => {
        if (!abort.signal.aborted) {
          setLoaded(true)
        }
      })

    return () => abort.abort()
  }, [workspaceId, client])
  const switchWorkspace = (id: string) => {
    if (!workspaces.includes(id) || pending) {
      return
    }

    setOpened(null)
    setCatalog([])
    setDirty(false)
    setWorkspaceId(id)
    setDestination(null)
  }
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
    if (dirty) {
      setDestination(id)
    } else {
      void open(id)
    }
  }

  return (
    <InlineGamePreviewBoundary
      enabled
      provider={provider}
      routeKey={`${accountId}:${workspaceId}`}
    >
      <PlatformScope
        context="platform.studio"
        appearance="light"
        style={{ background: "var(--tds-background)" }}
      >
        <div className="theme-builder-toolbar" style={{ padding: "1rem" }}>
          {workspaces.length > 1 && (
            <Select
              label={text("workspace")}
              value={workspaceId}
              disabled={pending}
              onChange={(event) => {
                if (dirty) {
                  setDestination(`workspace:${event.target.value}`)
                } else {
                  switchWorkspace(event.target.value)
                }
              }}
            >
              {workspaces.map((id) => (
                <option key={id} value={id}>
                  {id === accountId ? text("personalWorkspace") : id}
                </option>
              ))}
            </Select>
          )}
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
                  if (event.target.value) {
                    choose(event.target.value)
                  }
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
                    {nativeBuilderText(locale, item.definition.nameKey)}
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
          <Select
            label={text("previewGame")}
            value={quizId}
            onChange={(event) => setQuizId(event.target.value)}
          >
            <option value="">{text("select")}</option>
            {games.map((game) => (
              <option key={game.id} value={game.id}>
                {game.title}
              </option>
            ))}
          </Select>
          <Select
            label={text("cardScope")}
            value={gameScopeId}
            disabled={!cardScopes.length || pending}
            onChange={(event) => setGameScopeId(event.target.value)}
          >
            <option value="">{text("allCards")}</option>
            {cardScopes.map((card) => (
              <option key={card.id} value={card.id}>
                {card.label}
              </option>
            ))}
          </Select>
        </div>
        <AlertDialog
          open={Boolean(destination)}
          onOpenChange={(value) => {
            if (!value) {
              setDestination(null)
            }
          }}
          title={text("discard")}
          description={text("unsaved")}
          confirmLabel={text("confirm")}
          cancelLabel={text("cancel")}
          errorLabel={text("error")}
          onConfirm={() => {
            if (destination === "back") {
              window.location.assign("/studio")
            } else if (destination?.startsWith("workspace:")) {
              switchWorkspace(destination.slice(10))
            } else if (destination) {
              return open(destination)
            }
          }}
        />
      </PlatformScope>
      <ThemeBuilderShell
        key={`${workspaceId}:${opened?.document.id ?? "empty"}`}
        locale={locale}
        initialDocument={opened?.document}
        initialRevision={opened?.revision}
        client={client}
        canAuthor={canAuthor}
        tenantId={workspaceId}
        appearance="light"
        onDirtyChange={changed}
        onSaved={saved}
        previewQuizId={quizId}
        gameScopeId={gameScopeId || undefined}
        previewAuthoredKey={
          cardScopes.find((card) => card.id === gameScopeId)?.key
        }
      />
    </InlineGamePreviewBoundary>
  )
}

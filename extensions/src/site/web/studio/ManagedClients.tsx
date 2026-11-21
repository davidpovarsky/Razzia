import { useRef, useState, type SubmitEvent } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Copy, Link, RefreshCw, UserPlus, X } from "lucide-react"
import {
  Badge,
  Button,
  Card,
  Input,
  Select,
  StatusState,
} from "@razzia/extensions/platform-ui"
import type {
  ManagedClientCodeResponse,
  ManagedClientGameSummary,
  ManagedClientListResponse,
  ManagedClientResponse,
  ManagedClientSummary,
} from "@razzia/common/types/managed-clients"
import { SiteApiError, siteKey, siteRequest } from "../../adapters/client"
import { useManagedClientText } from "../../locales/clients"
import styles from "../clients/managed-clients.css?inline"

export function ManagedClients({ accountId }: { accountId: string }) {
  const t = useManagedClientText()
  const queryClient = useQueryClient()
  const queryKey = siteKey(accountId, "managed-clients")
  const clients = useQuery({
    queryKey,
    queryFn: ({ signal }) =>
      siteRequest<ManagedClientListResponse>("/api/managed-clients", {
        signal,
      }),
    staleTime: 0,
    refetchOnWindowFocus: true,
  })
  const [name, setName] = useState("")
  const [search, setSearch] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<"error" | "createAlready" | null>(null)
  const [disclosed, setDisclosed] = useState<ManagedClientCodeResponse | null>(
    null,
  )
  const creation = useRef<string | null>(null)
  const pending = useRef(false)
  const refresh = () => queryClient.invalidateQueries({ queryKey })

  const create = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (pending.current || !name.trim()) {
      return
    }

    pending.current = true
    setBusy(true)
    setError(null)
    creation.current ??= crypto.randomUUID()

    try {
      const result = await siteRequest<ManagedClientCodeResponse>(
        "/api/managed-clients",
        {
          method: "POST",
          body: JSON.stringify({
            name: name.trim(),
            gameIds: [],
            requestId: creation.current,
          }),
        },
      )
      setDisclosed(result)
      setName("")
      creation.current = null
      await refresh()
    } catch (failure) {
      if (
        failure instanceof SiteApiError &&
        failure.code === "client-create-already-completed"
      ) {
        creation.current = null
        setName("")
        setError("createAlready")
        await refresh()
      } else {
        setError("error")
      }
    } finally {
      pending.current = false
      setBusy(false)
    }
  }

  const filtered =
    clients.data?.clients.filter((client) =>
      client.name
        .toLocaleLowerCase()
        .includes(search.trim().toLocaleLowerCase()),
    ) ?? []

  return (
    <section className="managed-clients" data-testid="managed-clients">
      <style>{styles}</style>
      <header className="client-access-form">
        <h1>{t("ownerTitle")}</h1>
        <p className="client-muted">{t("ownerDescription")}</p>
      </header>
      <Card className="client-card">
        <h2>{t("newClient")}</h2>
        <form
          className="client-create-form"
          onSubmit={(event) => void create(event)}
        >
          <Input
            label={t("name")}
            placeholder={t("namePlaceholder")}
            autoComplete="off"
            maxLength={120}
            required
            value={name}
            disabled={busy}
            onChange={(event) => setName(event.target.value)}
          />
          <Button
            type="submit"
            variant="primary"
            loading={busy}
            disabled={!name.trim()}
          >
            <UserPlus size={18} aria-hidden="true" />
            {t(busy ? "creating" : "create")}
          </Button>
        </form>
        {error && <p role="alert">{t(error)}</p>}
      </Card>
      {disclosed && (
        <ClientCode
          key={`${disclosed.client.id}:${disclosed.code}`}
          response={disclosed}
          onDismiss={() => setDisclosed(null)}
        />
      )}
      <Input
        type="search"
        label={t("searchClients")}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      {clients.isPending && <StatusState kind="loading" title={t("loading")} />}
      {clients.isError && (
        <StatusState
          kind="error"
          title={t("error")}
          action={
            <Button onClick={() => void clients.refetch()}>{t("retry")}</Button>
          }
        />
      )}
      {clients.isSuccess && (
        <div className="client-list">
          {filtered.map((client) => (
            <ManagedClientCard
              key={client.id}
              client={client}
              games={clients.data.games}
              refresh={refresh}
              onCode={(response) => setDisclosed(response)}
              onDisabled={() => {
                if (disclosed?.client.id === client.id) {
                  setDisclosed(null)
                }
              }}
            />
          ))}
          {!filtered.length && (
            <StatusState
              kind="empty"
              title={t(search ? "noMatches" : "emptyClients")}
            />
          )}
        </div>
      )}
    </section>
  )
}

function ClientCode({
  response,
  onDismiss,
}: {
  response: ManagedClientCodeResponse
  onDismiss: () => void
}) {
  const t = useManagedClientText()
  const [copied, setCopied] = useState<"code" | "link" | null>(null)
  const [failed, setFailed] = useState(false)
  const entryUrl = new URL("/client", window.location.origin).href
  const copy = async (part: "code" | "link") => {
    setFailed(false)

    try {
      await navigator.clipboard.writeText(
        part === "code" ? response.code : entryUrl,
      )
      setCopied(part)
    } catch {
      setFailed(true)
    }
  }

  return (
    <section
      className="client-code"
      aria-label={t("codeTitle")}
      data-testid="client-code-disclosure"
    >
      <div className="client-card-heading">
        <h2>{response.client.name}</h2>
        <Button variant="ghost" onClick={onDismiss}>
          {t("dismissCode")}
        </Button>
      </div>
      <p>{t("codeOnce")}</p>
      <output
        className="client-code-digits"
        aria-label={t("codeLabel")}
        dir="ltr"
      >
        {response.code}
      </output>
      <p className="client-muted">{t("entryLink")}</p>
      <span className="client-entry-url" dir="ltr">
        {entryUrl}
      </span>
      <div className="client-actions">
        <Button variant="primary" onClick={() => void copy("code")}>
          <Copy size={18} aria-hidden="true" />
          {t(copied === "code" ? "copied" : "copyCode")}
        </Button>
        <Button onClick={() => void copy("link")}>
          <Link size={18} aria-hidden="true" />
          {t(copied === "link" ? "copied" : "copyLink")}
        </Button>
      </div>
      {copied && <span role="status">{t("copied")}</span>}
      {failed && <p role="alert">{t("copyFailed")}</p>}
    </section>
  )
}

function ManagedClientCard({
  client,
  games,
  refresh,
  onCode,
  onDisabled,
}: {
  client: ManagedClientSummary
  games: ManagedClientGameSummary[]
  refresh: () => Promise<unknown>
  onCode: (response: ManagedClientCodeResponse) => void
  onDisabled: () => void
}) {
  const t = useManagedClientText()
  const [selection, setSelection] = useState("")
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [saved, setSaved] = useState(false)
  const pending = useRef(false)
  const path = `/api/managed-clients/${encodeURIComponent(client.id)}`
  const available = games.filter((game) => !client.gameIds.includes(game.id))
  const mutate = async (action: () => Promise<unknown>) => {
    if (pending.current) {
      return
    }

    pending.current = true
    setBusy(true)
    setFailed(false)
    setSaved(false)

    try {
      await action()
      await refresh()
      setSaved(true)
    } catch {
      setFailed(true)
    } finally {
      pending.current = false
      setBusy(false)
    }
  }
  const assign = (gameIds: string[]) =>
    siteRequest<ManagedClientResponse>(`${path}/games`, {
      method: "PUT",
      body: JSON.stringify({ gameIds }),
    })

  return (
    <Card
      className="client-card"
      data-testid="managed-client-card"
      aria-busy={busy}
    >
      <div className="client-card-heading">
        <h2>{client.name}</h2>
        <Badge tone={client.enabled ? "success" : "neutral"}>
          {t(client.enabled ? "enabled" : "disabled")}
        </Badge>
      </div>
      <h3>{t("assignedGames")}</h3>
      <ul className="client-assignment-list">
        {client.gameIds.map((id) => {
          const game = games.find((item) => item.id === id)
          const title = game?.title || t("unknownGame")

          return (
            <li key={id} className="client-assignment">
              <span>{title}</span>
              <Button
                variant="ghost"
                disabled={busy}
                aria-label={t("removeGame", { title })}
                onClick={() =>
                  void mutate(() =>
                    assign(client.gameIds.filter((item) => item !== id)),
                  )
                }
              >
                <X size={18} aria-hidden="true" />
              </Button>
            </li>
          )
        })}
      </ul>
      {!client.gameIds.length && (
        <p className="client-muted">{t("noAssignments")}</p>
      )}
      <form
        className="client-assign-form"
        onSubmit={(event) => {
          event.preventDefault()

          if (!selection || !available.some((game) => game.id === selection)) {
            return
          }

          void mutate(async () => {
            await assign([...client.gameIds, selection])
            setSelection("")
          })
        }}
      >
        <Select
          label={t("chooseGame")}
          value={selection}
          disabled={busy || !available.length}
          onChange={(event) => setSelection(event.target.value)}
        >
          <option value="">{t("chooseGame")}</option>
          {available.map((game) => (
            <option key={game.id} value={game.id}>
              {game.title}
            </option>
          ))}
        </Select>
        <Button type="submit" disabled={!selection || busy}>
          {t("assign")}
        </Button>
      </form>
      <div className="client-actions">
        <Button
          disabled={busy}
          onClick={() =>
            void mutate(async () => {
              const result = await siteRequest<ManagedClientCodeResponse>(
                `${path}/rotate-code`,
                {
                  method: "POST",
                  body: "{}",
                },
              )
              onCode(result)
            })
          }
        >
          <RefreshCw size={18} aria-hidden="true" />
          {t(client.enabled ? "rotate" : "enable")}
        </Button>
        {client.enabled && (
          <Button
            variant="destructive"
            disabled={busy}
            onClick={() =>
              void mutate(async () => {
                await siteRequest<ManagedClientResponse>(path, {
                  method: "PATCH",
                  body: JSON.stringify({ enabled: false }),
                })
                onDisabled()
              })
            }
          >
            {t("disable")}
          </Button>
        )}
      </div>
      <p className="client-muted">{t("rotateDescription")}</p>
      {saved && <p role="status">{t("updated")}</p>}
      {failed && <p role="alert">{t("error")}</p>}
    </Card>
  )
}

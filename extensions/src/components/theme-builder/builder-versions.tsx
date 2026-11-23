import { requireLibraryValue } from "../../core/show-library/required"
import { useEffect, useRef, useState } from "react"
import { Button, Input, Select } from "../../platform-ui"
import type { BuilderClient, BuilderReceipt, BuilderVersion } from "./client"
import type { BuilderTextKey } from "./strings"

/** Versioned composition authoring; runtime Publish keeps its independent review gate. */
export function BuilderVersions({
  client,
  id,
  revision,
  disabled,
  text,
  onRestored,
  onBusy,
}: {
  client?: BuilderClient
  id: string
  revision: number
  disabled: boolean
  text: (key: BuilderTextKey) => string
  onRestored: (receipt: BuilderReceipt) => void
  onBusy: (value: boolean) => void
}) {
  const [versions, setVersions] = useState<BuilderVersion[]>([])
  const [version, setVersion] = useState("1.0.0")
  const [selected, setSelected] = useState("")
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<BuilderTextKey | null>(null)
  const request = useRef<AbortController | null>(null)
  const supported = Boolean(
    client?.versions && client.createVersion && client.restoreVersion,
  )
  useEffect(() => {
    if (!revision || !client?.versions) {
      return
    }

    const abort = new AbortController()
    void client
      .versions(id, abort.signal)
      .then((result) => {
        if (!abort.signal.aborted) {
          setVersions(result)
          setSelected(result[0]?.version ?? "")
        }
      })
      .catch(() => {
        if (!abort.signal.aborted) {
          setStatus("error")
        }
      })

    return () => abort.abort()
  }, [client, id, revision])
  useEffect(() => () => request.current?.abort(), [])
  const perform = async (restore: boolean) => {
    if (!client || disabled || request.current || !revision || !supported) {
      return
    }

    const abort = new AbortController()
    request.current = abort
    setBusy(true)
    onBusy(true)
    setStatus(null)
    const signal = AbortSignal.any([abort.signal, AbortSignal.timeout(30_000)])

    try {
      if (restore) {
        const receipt = await requireLibraryValue(client.restoreVersion)(
          id,
          revision,
          selected,
          signal,
        )

        if (!abort.signal.aborted) {
          onRestored(receipt)
        }
      } else {
        await requireLibraryValue(client.createVersion)(
          id,
          revision,
          version,
          signal,
        )
        const next = await requireLibraryValue(client.versions)(id, signal)

        if (!abort.signal.aborted) {
          setVersions(next)
          setSelected(version)
          setStatus("authoringVersion")
        }
      }
    } catch (error) {
      if (!abort.signal.aborted) {
        setStatus(
          error instanceof Error && "status" in error && error.status === 409
            ? "conflict"
            : "error",
        )
      }
    } finally {
      request.current = null

      if (!abort.signal.aborted) {
        setBusy(false)
        onBusy(false)
      }
    }
  }

  return (
    <section aria-label={text("version")} data-testid="builder-versions">
      <div className="theme-builder-toolbar">
        <Input
          label={text("version")}
          value={version}
          disabled={disabled || busy || !supported}
          onChange={(event) => setVersion(event.target.value)}
        />
        <Button
          disabled={
            disabled ||
            busy ||
            !supported ||
            !revision ||
            !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u.test(version)
          }
          onClick={() => void perform(false)}
        >
          {text("saveVersion")}
        </Button>
        <Select
          label={text("restoreVersion")}
          value={selected}
          disabled={disabled || busy || !versions.length}
          onChange={(event) => setSelected(event.target.value)}
        >
          <option value="">{text("select")}</option>
          {versions.map((item) => (
            <option
              key={item.version}
              value={item.version}
              disabled={!item.restorable}
            >
              {item.version} · {item.revision}
            </option>
          ))}
        </Select>
        <Button
          disabled={disabled || busy || !selected || !supported}
          onClick={() => void perform(true)}
        >
          {text("restoreVersion")}
        </Button>
      </div>
      {status && (
        <p
          role={
            status === "error" || status === "conflict" ? "alert" : "status"
          }
        >
          {text(status)}
        </p>
      )}
    </section>
  )
}

import { requireLibraryValue } from "../../core/show-library/required"
import { useEffect, useRef, useState } from "react"
import { Button, Input, Select } from "../../platform-ui"
import {
  BuilderRequestError,
  type BuilderClient,
  type BuilderPublicationState,
} from "./client"
import type { BuilderTextKey } from "./strings"

export function BuilderPublication({
  client,
  id,
  revision,
  disabled,
  text,
  onBusy,
  onChanged,
}: {
  client?: BuilderClient
  id: string
  revision: number
  disabled: boolean
  text: (key: BuilderTextKey) => string
  onBusy: (busy: boolean) => void
  onChanged?: () => void
}) {
  const [state, setState] = useState<BuilderPublicationState | null>(null)
  const [version, setVersion] = useState("1.0.0"),
    [target, setTarget] = useState("")
  const versionInput = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false),
    [status, setStatus] = useState<BuilderTextKey | null>(null)
  const abort = useRef<AbortController | null>(null)
  useEffect(() => () => abort.current?.abort(), [])
  useEffect(() => {
    setState(null)

    if (!revision || !client?.publication) {
      return
    }

    const controller = new AbortController()
    abort.current = controller
    void client
      .publication(id, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) {
          setState(value)
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setStatus("unavailable")
        }
      })

    return () => controller.abort()
  }, [client, id, revision])
  const act = async (operation: "publish" | "rollback" | "archive") => {
    if (!state?.canPublish || !client || busy || disabled) {
      return
    }

    const controller = new AbortController()
    abort.current = controller
    const requestedVersion =
      operation === "rollback"
        ? target
        : (versionInput.current?.value ?? version)
    setBusy(true)
    onBusy(true)
    setStatus(null)

    try {
      const signal = AbortSignal.any([
        controller.signal,
        AbortSignal.timeout(30_000),
      ])
      const next =
        operation === "archive"
          ? await requireLibraryValue(client.archive)(
              id,
              revision,
              state.revision,
              !state.archived,
              signal,
            )
          : await requireLibraryValue(client.publish)(
              id,
              revision,
              state.revision,
              requestedVersion,
              operation === "rollback",
              signal,
            )

      if (!controller.signal.aborted) {
        setState(next)
        setStatus(next.archived ? "archived" : "published")
        onChanged?.()
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setStatus(
          error instanceof BuilderRequestError && error.status === 409
            ? "conflict"
            : "error",
        )
      }
    } finally {
      if (!controller.signal.aborted) {
        setBusy(false)
      }

      onBusy(false)
    }
  }
  let publicationLabel = text("unpublished")

  if (state?.activeVersion) {
    publicationLabel = `${text("published")} · ${state.activeVersion}`
  }

  if (state?.archived) {
    publicationLabel = text("archived")
  }

  if (status) {
    publicationLabel = text(status)
  }

  const archived = state?.archived ?? false

  const blocked = disabled || busy || !state?.canPublish

  return (
    <fieldset
      data-testid="builder-publication"
      className="theme-builder-toolbar"
    >
      <legend>{text("publication")}</legend>
      <Input
        ref={versionInput}
        label={text("publicationVersion")}
        defaultValue={version}
        disabled={blocked || archived}
        onInput={(event) => setVersion(event.currentTarget.value)}
        onChange={(event) => setVersion(event.currentTarget.value)}
      />
      <Button
        disabled={
          blocked ||
          archived ||
          !client?.publish ||
          !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u.test(version)
        }
        onClick={() => void act("publish")}
      >
        {text("publish")}
      </Button>
      <Select
        label={text("rollbackVersion")}
        value={target}
        disabled={blocked || archived}
        onChange={(event) => setTarget(event.target.value)}
      >
        <option value="">{text("select")}</option>
        {state?.versions.map((item) => (
          <option key={item.version} value={item.version}>
            {item.version}
          </option>
        ))}
      </Select>
      <Button
        disabled={
          blocked ||
          archived ||
          !target ||
          target === state.activeVersion ||
          !client?.publish
        }
        onClick={() => void act("rollback")}
      >
        {text("rollback")}
      </Button>
      <Button
        disabled={blocked || !client?.archive}
        onClick={() => void act("archive")}
      >
        {text(archived ? "unarchive" : "archive")}
      </Button>
      <p role="status">{publicationLabel}</p>
    </fieldset>
  )
}

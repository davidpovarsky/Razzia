import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { getClientId } from "@razzia/web/lib/session"
import { StudioSelect } from "@razzia/web/features/quizz/components/studio/studio-select"
import ConfigField from "@razzia/web/features/quizz/components/QuestionEditor/QuestionEditorConfig/ConfigField"
import { siteRequest } from "../../site/adapters/client"
import {
  applicationCompositionPinSchema,
  type ApplicationCompositionPin,
} from "../../core/show-library/application-composition-pin"
import type { ShowThemeSelection } from "../../core/show-themes/selection"
import { builderDigest, parseBuilderDocument } from "./document"
import { builderText } from "./strings"
import type { PreviewLocale } from "../../presentation/show-library-preview/i18n"

interface Choice {
  workspaceId: string
  id: string
  version: string
  digest: string
  name: string
}
const key = (value: Pick<Choice, "workspaceId" | "id" | "version">) =>
  `${value.workspaceId}:${value.id}:${value.version}`

/** Existing neutral editor control. Choosing a pin changes the unsaved draft only. */
export function PublishedCompositionSelect({
  pin,
  onSelect,
}: {
  pin?: ApplicationCompositionPin
  onSelect: (
    value: {
      pin: ApplicationCompositionPin
      selection: ShowThemeSelection
    } | null,
  ) => void
}) {
  const { i18n } = useTranslation(),
    [locale] = i18n.language.split("-")
  const text = builderText(
    (["en", "fr", "de", "es", "it", "ja", "tr", "vi"].includes(locale)
      ? locale
      : "en") as PreviewLocale,
  )
  const accountId = getClientId(),
    enabled = import.meta.env.VITE_TADAZZ_THEME_BUILDER_ENABLED === "true"
  const [choices, setChoices] = useState<Choice[]>([]),
    [pending, setPending] = useState(false),
    [failed, setFailed] = useState(false)
  const request = useRef<AbortController | null>(null)
  useEffect(() => {
    setChoices([])
    setFailed(false)

    if (!enabled || !accountId) {
      return
    }

    const abort = new AbortController()
    request.current = abort
    void siteRequest<{ workspaces: Record<string, string[]> }>(
      "/api/themes/workspaces",
      { signal: abort.signal },
    )
      .then(async (value) => {
        const workspaces = Object.keys(value.workspaces)
          .filter((id) => value.workspaces[id]?.includes("author"))
          .slice(0, 32)
        const results = await Promise.allSettled(
          workspaces.map(async (workspaceId) => {
            const catalogue = await siteRequest<{
              publications: Array<Omit<Choice, "workspaceId">>
            }>(
              `/api/themes/builder/${encodeURIComponent(workspaceId)}/publications`,
              { signal: abort.signal },
            )

            if (
              !Array.isArray(catalogue.publications) ||
              catalogue.publications.length > 128
            ) {
              throw new Error("Invalid publication catalogue")
            }

            const workspaceChoices: Choice[] = []
            for (const publication of catalogue.publications) {
              workspaceChoices.push({ ...publication, workspaceId })
            }

            return workspaceChoices
          }),
        )

        if (!abort.signal.aborted && getClientId() === accountId) {
          setChoices(
            results.flatMap((result) =>
              result.status === "fulfilled" ? result.value : [],
            ),
          )
        }
      })
      .catch(() => {
        if (!abort.signal.aborted) {
          setFailed(true)
        }
      })

    return () => {
      abort.abort()
      request.current?.abort()
    }
  }, [accountId, enabled])

  if (!enabled || !accountId) {
    return null
  }

  const value = pin
    ? key({
        workspaceId: pin.workspaceId,
        id: pin.documentId,
        version: pin.version,
      })
    : "inherit"

  return (
    <ConfigField>
      <ConfigField.Label label={text("publishedTheme")} />
      <StudioSelect
        value={value}
        ariaLabel={text("publishedTheme")}
        items={[
          { value: "inherit", label: text("inherited") },
          ...choices.map((choice) => ({
            value: key(choice),
            label: `${choice.name} · ${choice.version}`,
          })),
          ...(pin && !choices.some((choice) => key(choice) === value)
            ? [{ value, label: `${text("pinnedVersion")} · ${pin.version}` }]
            : []),
        ]}
        onChange={(next) => {
          if (pending) {
            return
          }

          if (next === "inherit") {
            onSelect(null)

            return
          }

          const choice = choices.find((candidate) => key(candidate) === next)

          if (!choice) {
            return
          }

          request.current?.abort()
          const controller = new AbortController()
          request.current = controller
          setPending(true)
          setFailed(false)
          void siteRequest<{
            document: unknown
            digest: string
            version: string
            admission: { rendererBuildSha256: string }
          }>(
            `/api/themes/builder/${encodeURIComponent(choice.workspaceId)}/documents/${encodeURIComponent(choice.id)}/published/${encodeURIComponent(choice.version)}`,
            { signal: controller.signal },
          )
            .then((result) => {
              const document = parseBuilderDocument(result.document)

              if (
                getClientId() !== accountId ||
                document.id !== choice.id ||
                result.version !== choice.version ||
                result.digest !== choice.digest ||
                builderDigest(document) !== choice.digest
              ) {
                throw new Error("Publication identity changed")
              }

              onSelect({
                selection: document.content.selection,
                pin: applicationCompositionPinSchema.parse({
                  workspaceId: choice.workspaceId,
                  documentId: choice.id,
                  version: choice.version,
                  digest: result.digest,
                  rendererBuildSha256: result.admission.rendererBuildSha256,
                }),
              })
            })
            .catch(() => {
              if (!controller.signal.aborted) {
                setFailed(true)
              }
            })
            .finally(() => {
              if (!controller.signal.aborted) {
                setPending(false)
              }
            })
        }}
      />
      {pending && (
        <p role="status" className="text-muted-foreground text-sm">
          {text("loading")}
        </p>
      )}
      {failed && (
        <p role="alert" className="text-muted-foreground text-sm">
          {text("unavailable")}
        </p>
      )}
    </ConfigField>
  )
}

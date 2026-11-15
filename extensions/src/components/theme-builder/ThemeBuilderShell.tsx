import { useEffect, useRef, useState, type ReactNode } from "react"
import {
  AlertDialog,
  Button,
  Card,
  Input,
  PlatformScope,
  Select,
} from "../../platform-ui"
import type { PreviewLocale } from "../../presentation/show-library-preview/i18n"
import { previewText } from "../../presentation/show-library-preview/ui-strings"
import { getNativeShowLibrary } from "../../core/show-library/native-library"
import { inspectCompositionReferences } from "../../core/show-library/composition-validation"
import { type assetDescriptorSchema } from "../../core/show-library/schemas"
import type { z } from "zod"
import { PreviewPanel } from "./PreviewPanel"
import {
  applyBuilderEdit,
  builderDigest,
  createBuilderHistory,
  parseBuilderDocument,
  redoBuilderEdit,
  undoBuilderEdit,
  type BuilderDocument,
  type BuilderEdit,
  type BuilderHistory,
  type BuilderNode,
} from "./document"
import {
  BuilderRequestError,
  type BuilderClient,
  type BuilderReceipt,
} from "./client"
import { builderText, type BuilderTextKey } from "./strings"
import { BuilderTree } from "./BuilderTree"
import { BuilderProperties } from "./BuilderProperties"
import { BuilderLibrary } from "./BuilderLibrary"
import { NativeLibraryPanel } from "./NativeLibraryPanel"
import { themeBuilderCss } from "./styles"

export interface ThemeBuilderShellProps {
  locale: PreviewLocale
  initialDocument?: BuilderDocument
  initialRevision?: number
  client?: BuilderClient
  canAuthor?: boolean
  tenantId?: string
  gameScopeId?: string
  assets?: Array<z.infer<typeof assetDescriptorSchema>>
  appearance?: "light" | "dark"
  dir?: "ltr" | "rtl"
  onDirtyChange?: (dirty: boolean) => void
  onSaved?: (receipt: BuilderReceipt) => void
}

/** Separate authoring UI. Candidate layout diagrams are distinct from live stage output. */
export function ThemeBuilderShell({
  locale,
  initialDocument,
  initialRevision = 0,
  client,
  canAuthor = false,
  tenantId,
  gameScopeId,
  assets = [],
  appearance = "dark",
  dir = "ltr",
  onDirtyChange,
  onSaved,
}: ThemeBuilderShellProps) {
  const text = builderText(locale),
    preview = previewText(locale)
  const [history, setHistory] = useState<BuilderHistory | null>(() => {
    if (!initialDocument) return null
    const h = createBuilderHistory(initialDocument)
    if (!initialRevision) h.savedDigest = ""
    return h
  })
  const current = useRef(history),
    saved = useRef(
      initialDocument && initialRevision
        ? parseBuilderDocument(initialDocument)
        : null,
    )
  const [revision, setRevision] = useState(initialRevision),
    [pending, setPending] = useState(false),
    busy = useRef(false),
    abort = useRef<AbortController | null>(null)
  const [status, setStatus] = useState<BuilderTextKey | null>(null),
    [replacement, setReplacement] = useState<BuilderDocument | null>(null)
  const [templateId, setTemplateId] = useState(
      initialDocument?.registry.templates[0]?.id ?? "",
    ),
    [selected, setSelected] = useState(
      initialDocument?.registry.templates[0]?.rootNodeId ?? "",
    )
  const [role, setRole] = useState<"all" | "manager" | "player" | "spectator">(
      "all",
    ),
    [viewport, setViewport] = useState("stage-16-9")
  const document = history?.present,
    dirty = Boolean(
      history && builderDigest(history.present) !== history.savedDigest,
    )
  const template = document?.registry.templates.find(
      (t) => t.id === templateId,
    ),
    node =
      template?.nodes.find((n) => n.nodeId === selected) ?? template?.nodes[0]
  const update = (next: BuilderHistory) => {
    current.current = next
    setHistory(next)
  }
  useEffect(() => {
    onDirtyChange?.(dirty)
  }, [dirty, onDirtyChange])
  useEffect(() => {
    const leave = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault()
        event.returnValue = ""
      }
    }
    window.addEventListener("beforeunload", leave)
    return () => window.removeEventListener("beforeunload", leave)
  }, [dirty])
  useEffect(() => () => abort.current?.abort(), [])
  const edit = (command: BuilderEdit) => {
    if (!canAuthor || !current.current) return
    try {
      update(applyBuilderEdit(current.current, command))
      setStatus(null)
    } catch {
      setStatus("error")
    }
  }
  const selectTemplate = (id: string) => {
    setTemplateId(id)
    setSelected(
      document?.registry.templates.find((t) => t.id === id)?.rootNodeId ?? "",
    )
  }
  const replace = (next: BuilderDocument) => {
    if (busy.current) return
    const fresh = createBuilderHistory(next)
    fresh.savedDigest = ""
    saved.current = null
    update(fresh)
    setRevision(0)
    setTemplateId(next.registry.templates[0]?.id ?? "")
    setSelected(next.registry.templates[0]?.rootNodeId ?? "")
    setStatus(null)
  }
  const requestReplace = (next: BuilderDocument) => {
    if (dirty) setReplacement(next)
    else replace(next)
  }
  const save = async () => {
    if (!client || !canAuthor || !current.current || busy.current) return
    const snapshot = structuredClone(current.current.present),
      expected = revision,
      controller = new AbortController()
    abort.current = controller
    busy.current = true
    setPending(true)
    try {
      const receipt = await client.save(
        snapshot,
        expected,
        AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]),
      )
      if (controller.signal.aborted) return
      if (
        receipt.revision !== expected + 1 ||
        receipt.digest !== builderDigest(snapshot) ||
        receipt.document.id !== snapshot.id
      )
        throw new BuilderRequestError(502)
      saved.current = snapshot
      setRevision(receipt.revision)
      if (current.current?.present.id === snapshot.id)
        update({ ...current.current, savedDigest: receipt.digest })
      onSaved?.(receipt)
      setStatus(
        current.current &&
          builderDigest(current.current.present) !== receipt.digest
          ? "unsaved"
          : "saved",
      )
    } catch (error) {
      if (!controller.signal.aborted)
        setStatus(
          error instanceof BuilderRequestError && error.status === 409
            ? "conflict"
            : "error",
        )
    } finally {
      busy.current = false
      if (!controller.signal.aborted) setPending(false)
    }
  }
  const move = (id: string, targetId: string) => {
    if (!template || id === targetId) return
    const parent = template.nodes.find((n) =>
      Object.values(n.children).flat().includes(targetId),
    )
    if (!parent) {
      setStatus("error")
      return
    }
    const port = (Object.keys(parent.children) as BuilderNode["port"][]).find(
        (p) => parent.children[p]?.includes(targetId),
      )!,
      before = parent.children[port]!,
      siblings = before.filter((n) => n !== id)
    edit({
      type: "move",
      templateId,
      nodeId: id,
      parentId: parent.nodeId,
      port,
      index:
        siblings.indexOf(targetId) +
        (before.indexOf(id) >= 0 &&
        before.indexOf(id) < before.indexOf(targetId)
          ? 1
          : 0),
    })
  }
  const layout = (id: string): ReactNode => {
    const item = template!.nodes.find((n) => n.nodeId === id)!
    return (
      <div
        key={id}
        className="theme-builder-node"
        data-selected={selected === id || undefined}
        onClick={(event) => {
          event.stopPropagation()
          setSelected(id)
        }}
      >
        <bdi>{item.component.id}</bdi>
        {Object.values(item.children).flat().length > 0 && (
          <div
            className="theme-builder-node-children"
            data-preset={item.layout.preset}
          >
            {Object.values(item.children).flat().map(layout)}
          </div>
        )}
      </div>
    )
  }
  return (
    <PlatformScope context="platform.studio" appearance={appearance} dir={dir}>
      <style>{themeBuilderCss}</style>
      <main
        className="theme-builder"
        data-testid="theme-builder"
        onKeyDown={(event) => {
          event.stopPropagation()
          if (
            (event.ctrlKey || event.metaKey) &&
            event.key.toLowerCase() === "s"
          ) {
            event.preventDefault()
            void save()
          }
        }}
      >
        <header className="theme-builder-toolbar">
          <h1>Tadazz · {text("title")}</h1>
          <Button
            disabled={!canAuthor || pending || !document}
            onClick={() => {
              if (document) {
                const next = structuredClone(document)
                next.id = `theme-${crypto.randomUUID()}`
                next.content.composition.sections = {}
                next.content.composition.roles = {}
                next.content.composition.scopes = []
                next.content.selection.overrides = {}
                next.content.scopes = []
                requestReplace(next)
              }
            }}
          >
            {text("create")}
          </Button>
          <Button
            disabled={!canAuthor || pending || !document}
            onClick={() => {
              if (document)
                requestReplace({
                  ...structuredClone(document),
                  id: `theme-${crypto.randomUUID()}`,
                })
            }}
          >
            {text("duplicate")}
          </Button>
          <Button
            variant="primary"
            disabled={!canAuthor || !client || !dirty || pending}
            loading={pending}
            onClick={() => void save()}
          >
            {text("save")}
          </Button>
          <Button
            disabled={!canAuthor || !history?.past.length}
            onClick={() => {
              if (current.current) update(undoBuilderEdit(current.current))
            }}
          >
            {text("undo")}
          </Button>
          <Button
            disabled={!canAuthor || !history?.future.length}
            onClick={() => {
              if (current.current) update(redoBuilderEdit(current.current))
            }}
          >
            {text("redo")}
          </Button>
          <Button
            disabled={!canAuthor || pending || !saved.current || !dirty}
            onClick={() => {
              if (saved.current) setReplacement(saved.current)
            }}
          >
            {text("revert")}
          </Button>
          <Button
            disabled={!document}
            onClick={() => {
              try {
                const checked = parseBuilderDocument(current.current!.present)
                const report = inspectCompositionReferences(
                  checked.content,
                  checked.registry,
                  {
                    role: role === "all" ? "spectator" : role,
                    phase: template?.phase ?? "question",
                    questionType: template?.questionType ?? "single",
                    playMode: template?.playMode ?? "quiz",
                    answerCount:
                      template?.questionType === "estimation" ? null : 5,
                    ...(gameScopeId ? { scopeId: gameScopeId } : {}),
                  },
                )
                setStatus(report.issues.length ? "error" : "valid")
              } catch {
                setStatus("error")
              }
            }}
          >
            {text("validate")}
          </Button>
          <Button disabled title={text("unavailable")}>
            {text("publish")}
          </Button>
          <Button disabled title={text("unavailable")}>
            {text("rollback")}
          </Button>
        </header>
        <p role="status">
          {status
            ? text(status)
            : dirty
              ? text("unsaved")
              : text(gameScopeId ? "local" : "shared")}
        </p>
        {!canAuthor && <p>{text("readonly")}</p>}
        {!document ? (
          <p>{text("empty")}</p>
        ) : (
          <>
            <Input
              label={text("name")}
              value={document.name}
              maxLength={120}
              disabled={!canAuthor}
              onChange={(event) =>
                edit({ type: "rename", name: event.target.value })
              }
            />
            <div className="theme-builder-toolbar">
              <Select
                label={text("role")}
                value={role}
                onChange={(event) => setRole(event.target.value as typeof role)}
              >
                <option value="all">{text("all")}</option>
                <option value="manager">{preview("manager")}</option>
                <option value="player">{text("player")}</option>
                <option value="spectator">{preview("spectator")}</option>
              </Select>
              <Select
                label={text("layout")}
                value={viewport}
                onChange={(event) => setViewport(event.target.value)}
              >
                <option value="stage-16-9">16:9</option>
                <option value="safe-4-3">4:3</option>
                <option value="narrow-player">{text("small")}</option>
              </Select>
            </div>
            <div className="theme-builder-workspace">
              <Card>
                <h2>{text("library")}</h2>
                <BuilderLibrary
                  document={document}
                  node={node}
                  templateId={templateId}
                  role={role}
                  scopeId={gameScopeId}
                  tenantId={tenantId}
                  assets={assets}
                  readOnly={!canAuthor}
                  edit={edit}
                  selectTemplate={selectTemplate}
                  text={text}
                />
                {template && (
                  <>
                    <h2>{text("tree")}</h2>
                    <BuilderTree
                      template={template}
                      selected={node?.nodeId ?? template.rootNodeId}
                      select={setSelected}
                      move={move}
                      readOnly={!canAuthor}
                      label={text("tree")}
                    />
                  </>
                )}
              </Card>
              <Card>
                <h2>{text("layout")}</h2>
                <div className="theme-builder-plan" data-layout={viewport}>
                  {template ? (
                    layout(template.rootNodeId)
                  ) : (
                    <p>{text("empty")}</p>
                  )}
                </div>
                <p>{text("unavailable")}</p>
                <div className="theme-builder-preview">
                  <PreviewPanel locale={locale} />
                </div>
              </Card>
              <Card className="theme-builder-properties-panel">
                <h2>{text("properties")}</h2>
                {node && template && (
                  <BuilderProperties
                    node={node}
                    templateId={template.id}
                    root={node.nodeId === template.rootNodeId}
                    edit={edit}
                    readOnly={!canAuthor}
                    text={text}
                  />
                )}
              </Card>
            </div>
            <Card>
              <NativeLibraryPanel
                document={document}
                locale={locale}
                role={role}
                scopeId={gameScopeId}
                edit={edit}
                readOnly={!canAuthor}
                text={text}
              />
            </Card>
          </>
        )}
        <AlertDialog
          open={Boolean(replacement)}
          onOpenChange={(open) => {
            if (!open) setReplacement(null)
          }}
          title={text("discard")}
          description={text("unsaved")}
          confirmLabel={text("confirm")}
          cancelLabel={text("cancel")}
          errorLabel={text("error")}
          onConfirm={() => {
            if (!replacement) return
            if (replacement === saved.current) {
              update(createBuilderHistory(replacement))
              setStatus(null)
            } else replace(replacement)
            setReplacement(null)
          }}
        />
      </main>
    </PlatformScope>
  )
}

/** Native family draft creation preserves the core document and manifests unchanged. */
export function createNativeBuilderDocument(
  familyId: string,
  name: string,
): BuilderDocument {
  const family = getNativeShowLibrary().families.find(
    (value) => value.ref.id === familyId,
  )
  if (!family) throw new Error("theme-builder:unknown-family")
  const id = `theme-${crypto.randomUUID()}`,
    registry = { id: `${id}.library`, version: "1.0.0" }
  return parseBuilderDocument({
    format: "tadazz-theme-builder-draft",
    formatVersion: 1,
    id,
    name,
    registry: {
      schemaVersion: 1,
      ...registry,
      components: [],
      templates: [],
      motions: [],
    },
    content: {
      format: "tadazz-show-composition",
      schemaVersion: 1,
      selection: { ...family.ref, overrides: {} },
      composition: {
        schemaVersion: 1,
        id,
        version: "1.0.0",
        baseTheme: family.ref,
        registry,
        sections: {},
        roles: {},
        scopes: [],
      },
      scopes: [],
    },
  })
}

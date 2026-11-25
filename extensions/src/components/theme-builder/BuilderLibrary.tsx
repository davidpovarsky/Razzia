import { builderSections } from "./builder-sections"
import { Button, Select } from "../../platform-ui"
import {
  sectionOverridesSchema,
  type assetDescriptorSchema,
} from "../../core/show-library/schemas"
import { checkAssetReference } from "../../core/show-library/assets"
import type { z } from "zod"
import type { BuilderDocument, BuilderEdit, BuilderNode } from "./document"
import type { BuilderTextKey } from "./strings"

export function BuilderLibrary({
  document,
  node,
  templateId,
  role,
  scopeId,
  tenantId,
  assets,
  readOnly,
  edit,
  selectTemplate,
  text,
  referenceLabel = (id: string) => id,
}: {
  document: BuilderDocument
  node?: BuilderNode
  templateId: string
  role: "all" | "manager" | "player" | "spectator"
  scopeId?: string
  tenantId?: string
  assets: Array<z.infer<typeof assetDescriptorSchema>>
  readOnly: boolean
  edit: (command: BuilderEdit) => void
  selectTemplate: (id: string) => void
  text: (key: BuilderTextKey) => string
  referenceLabel?: (id: string) => string
}) {
  const { composition } = document.content
  const sections = builderSections(composition, role, scopeId) ?? {}
  const change = (value: unknown) =>
    edit({
      type: "sections",
      role,
      ...(scopeId ? { scopeId } : {}),
      value: sectionOverridesSchema.parse(value),
    })
  const component = document.registry.components.find(
    (c) => c.id === node?.component.id && c.version === node.component.version,
  )

  return (
    <div className="theme-builder-library">
      <Select
        label={text("screens")}
        value={templateId}
        onChange={(event) => selectTemplate(event.target.value)}
      >
        <option value="">{text("select")}</option>
        {document.registry.templates.map((screen) => (
          <option key={`${screen.id}@${screen.version}`} value={screen.id}>
            {referenceLabel(screen.id)}
          </option>
        ))}
      </Select>
      <details>
        <summary>{text("components")}</summary>
        {document.registry.components.map((candidate) => {
          const port = component?.childPorts.find(
            (p) =>
              p.allowedComponents.some(
                (c) => c.id === candidate.id && c.version === candidate.version,
              ) && (node?.children[p.id]?.length ?? 0) < p.maxChildren,
          )

          return (
            <Button
              key={`${candidate.id}@${candidate.version}`}
              disabled={readOnly || !port || !node}
              onClick={() => {
                if (port && node) {
                  edit({
                    type: "add",
                    templateId,
                    parentId: node.nodeId,
                    port: port.id,
                    nodeId: `node-${crypto.randomUUID()}`,
                    component: { id: candidate.id, version: candidate.version },
                  })
                }
              }}
              title={text("add")}
            >
              <bdi>{referenceLabel(candidate.id)}</bdi>
            </Button>
          )
        })}
      </details>
      <details>
        <summary>{text("motion")}</summary>
        <Button
          disabled={readOnly || !node}
          onClick={() => {
            if (node) {
              edit({
                type: "motion",
                templateId,
                nodeId: node.nodeId,
                motion: null,
              })
            }
          }}
        >
          {text("none")}
        </Button>
        {document.registry.motions.map((motion) => (
          <Button
            key={`${motion.id}@${motion.version}`}
            disabled={
              readOnly ||
              !node ||
              !motion.ports.includes(node.port) ||
              !component?.motions.some(
                (m) => m.id === motion.id && m.version === motion.version,
              )
            }
            onClick={() => {
              if (node) {
                edit({
                  type: "motion",
                  templateId,
                  nodeId: node.nodeId,
                  motion: { id: motion.id, version: motion.version },
                })
              }
            }}
          >
            <bdi>{referenceLabel(motion.id)}</bdi>
          </Button>
        ))}
      </details>
      <details>
        <summary>{text("assets")}</summary>
        <Button
          onClick={(event) => {
            const panel = event.currentTarget
              .closest(".theme-builder")
              ?.querySelector<HTMLDetailsElement>(
                "[data-testid=builder-media-library]",
              )

            if (panel) {
              panel.open = true
              panel.scrollIntoView({ block: "nearest" })
              panel.querySelector<HTMLSelectElement>("select")?.focus()
            }
          }}
        >
          {text("assets")}
        </Button>
        <Button
          disabled={readOnly || !node}
          onClick={() => {
            if (node) {
              const next = { ...sections, assets: { ...sections.assets } }
              Reflect.deleteProperty(next.assets, node.nodeId)
              change(next)
            }
          }}
        >
          {text("reset")}
        </Button>
        {assets
          .filter(
            (asset) =>
              asset.kind !== "audio" &&
              checkAssetReference(asset, {
                ...(tenantId ? { tenantId } : {}),
                operation: "read",
              }).allowed,
          )
          .map((asset) => (
            <Button
              key={`${asset.assetId}/${asset.sha256}`}
              disabled={readOnly || !node}
              onClick={() => {
                if (node) {
                  change({
                    ...sections,
                    assets: {
                      ...sections.assets,
                      [node.nodeId]: {
                        assetId: asset.assetId,
                        sha256: asset.sha256,
                      },
                    },
                  })
                }
              }}
            >
              <bdi>
                {asset.assetId} · {asset.sha256.slice(0, 12)}
              </bdi>
            </Button>
          ))}
      </details>
    </div>
  )
}

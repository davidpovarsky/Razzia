import { Button, Select } from "../../platform-ui"
import type { BuilderEdit, BuilderNode } from "./document"
import type { BuilderTextKey } from "./strings"

export function BuilderProperties({
  node,
  templateId,
  root,
  edit,
  readOnly,
  text,
}: {
  node: BuilderNode
  templateId: string
  root: boolean
  edit: (edit: BuilderEdit) => void
  readOnly: boolean
  text: (key: BuilderTextKey) => string
}) {
  const layout = <K extends keyof BuilderNode["layout"]>(
    key: K,
    values: BuilderNode["layout"][K][],
    label: BuilderTextKey,
  ) => (
    <Select
      key={key}
      label={text(label)}
      disabled={readOnly}
      value={node.layout[key]}
      onChange={(event) =>
        edit({
          type: "layout",
          templateId,
          nodeId: node.nodeId,
          value: { ...node.layout, [key]: event.target.value },
        })
      }
    >
      {values.map((value) => (
        <option key={value} value={value}>
          {text(value as BuilderTextKey)}
        </option>
      ))}
    </Select>
  )
  return (
    <div className="theme-builder-properties">
      <p>
        <bdi>{node.component.id}</bdi>
      </p>
      {layout("preset", ["flow", "grid", "safe-overlay"], "layout")}
      {layout("alignment", ["start", "center", "end"], "alignment")}
      {layout("gap", ["none", "small", "medium", "large"], "gap")}
      <Select
        label={text("fit")}
        value={node.props.fit ?? "inherit"}
        disabled={readOnly}
        onChange={(event) => {
          const props = { ...node.props }
          if (event.target.value === "inherit") delete props.fit
          else props.fit = event.target.value as "contain" | "cover"
          edit({ type: "props", templateId, nodeId: node.nodeId, value: props })
        }}
      >
        <option value="inherit">{text("inherited")}</option>
        <option value="contain">{text("contain")}</option>
        <option value="cover">{text("cover")}</option>
      </Select>
      <Button
        disabled={readOnly}
        onClick={() =>
          edit({ type: "props", templateId, nodeId: node.nodeId, value: {} })
        }
      >
        {text("reset")}
      </Button>
      <Button
        variant="destructive"
        disabled={readOnly || root}
        onClick={() =>
          edit({ type: "remove", templateId, nodeId: node.nodeId })
        }
      >
        {text("remove")}
      </Button>
    </div>
  )
}

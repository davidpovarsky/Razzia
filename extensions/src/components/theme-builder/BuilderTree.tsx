import { requireLibraryValue } from "../../core/show-library/required"
// oxlint-disable typescript/no-unnecessary-condition -- Keyboard navigation can reach an array boundary; preserve runtime guards.
import type { BuilderNode, BuilderTemplate } from "./document"
import { useRef } from "react"

export function BuilderTree({
  template,
  selected,
  select,
  move,
  readOnly,
  label,
  referenceLabel = (id: string) => id,
}: {
  template: BuilderTemplate
  selected: string
  select: (id: string) => void
  move: (nodeId: string, targetId: string) => void
  readOnly: boolean
  label: string
  referenceLabel?: (id: string) => string
}) {
  const items = useRef(new Map<string, HTMLDivElement>())
  const ordered: BuilderNode[] = []
  const visit = (id: string) => {
    const node = requireLibraryValue(
      template.nodes.find((n) => n.nodeId === id),
    )
    ordered.push(node)
    for (const child of Object.values(node.children).flat()) {
      visit(child)
    }
  }
  visit(template.rootNodeId)
  const focus = (id: string) => {
    select(id)
    items.current.get(id)?.focus({ preventScroll: true })
  }
  const render = (id: string, level: number) => {
    const node = requireLibraryValue(
        template.nodes.find((n) => n.nodeId === id),
      ),
      children = Object.values(node.children).flat()

    return (
      <li key={id} role="none">
        <div
          ref={(element) => {
            if (element) {
              items.current.set(id, element)
            } else {
              items.current.delete(id)
            }
          }}
          id={`builder-tree-${id}`}
          role="treeitem"
          aria-level={level}
          aria-selected={selected === id}
          aria-expanded={children.length ? true : undefined}
          tabIndex={selected === id ? 0 : -1}
          draggable={!readOnly && id !== template.rootNodeId}
          data-node-id={id}
          onClick={() => select(id)}
          onFocus={() => select(id)}
          onDragStart={(event) => {
            event.dataTransfer.setData("application/x-tadazz-builder-node", id)
            event.dataTransfer.effectAllowed = "move"
          }}
          onDragOver={(event) => {
            if (
              !readOnly &&
              event.dataTransfer.types.includes(
                "application/x-tadazz-builder-node",
              )
            ) {
              event.preventDefault()
            }
          }}
          onDrop={(event) => {
            event.preventDefault()
            event.stopPropagation()
            const source = event.dataTransfer.getData(
              "application/x-tadazz-builder-node",
            )

            if (!readOnly && source) {
              move(source, id)
            }
          }}
          onKeyDown={(event) => {
            const index = ordered.findIndex((n) => n.nodeId === id)

            if (
              event.altKey &&
              !readOnly &&
              ["ArrowUp", "ArrowDown"].includes(event.key)
            ) {
              event.preventDefault()
              const target = ordered[index + (event.key === "ArrowUp" ? -1 : 1)]

              if (target) {
                move(id, target.nodeId)
              }

              return
            }

            if (["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
              event.preventDefault()
              let next = Math.max(
                0,
                Math.min(
                  ordered.length - 1,
                  index + (event.key === "ArrowUp" ? -1 : 1),
                ),
              )

              if (event.key === "Home") {
                next = 0
              } else if (event.key === "End") {
                next = ordered.length - 1
              }

              focus(ordered[next].nodeId)
            }

            if (event.key === "ArrowRight" && children.length) {
              event.preventDefault()
              focus(children[0])
            }

            if (event.key === "ArrowLeft") {
              const parent = ordered.find((n) =>
                Object.values(n.children).flat().includes(id),
              )

              if (parent) {
                event.preventDefault()
                focus(parent.nodeId)
              }
            }
          }}
        >
          <bdi>{referenceLabel(node.component.id)}</bdi>
        </div>
        {children.length > 0 && (
          <ul role="group">
            {children.map((child) => render(child, level + 1))}
          </ul>
        )}
      </li>
    )
  }

  return (
    <ul role="tree" aria-label={label} className="theme-builder-tree">
      {render(template.rootNodeId, 1)}
    </ul>
  )
}

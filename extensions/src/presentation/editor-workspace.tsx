import { useEffect, useId, useRef, useState, type ReactNode } from "react"
import { PanelLeft, PanelRight, X } from "lucide-react"
import NativeButton from "../../../packages/web/src/components/Button"
import "./editor-workspace.css"

export interface EditorWorkspacePanel {
  id: string
  label: string
  icon?: ReactNode
  content: ReactNode
  side?: "left" | "right"
  /** Keep one panel per side visible when the workspace has desktop space. */
  dock?: boolean
}

export interface EditorWorkspaceProps {
  children: ReactNode
  panels: readonly EditorWorkspacePanel[]
  toolbar?: ReactNode
  className?: string
  ariaLabel?: string
  defaultPanel?: string
  closeLabel?: string
}

/** Shared native-editor and MCP workspace. Closed panels retain their state. */
export function EditorWorkspace({
  children,
  panels,
  toolbar,
  className = "",
  ariaLabel,
  defaultPanel,
  closeLabel = "Close",
}: EditorWorkspaceProps) {
  const id = useId()
  const root = useRef<HTMLDivElement>(null)
  const panelElements = useRef(new Map<string, HTMLElement>())
  const trigger = useRef<HTMLButtonElement | null>(null)
  const [wide, setWide] = useState(false)
  const [active, setActive] = useState<string | null>(defaultPanel ?? null)
  const docked = new Set<string>()

  if (wide) {
    for (const side of ["left", "right"] as const) {
      const panel = panels.find(
        (item) => item.dock && (item.side ?? "right") === side,
      )

      if (panel) {
        docked.add(panel.id)
      }
    }
  }

  const modalPanel = active && !docked.has(active) ? active : null

  useEffect(() => {
    const element = root.current

    if (!element) {
      return
    }

    const update = () => setWide(element.clientWidth >= 1100)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)

    return () => observer.disconnect()
  }, [])

  const close = () => {
    setActive(null)
    trigger.current?.focus({ preventScroll: true })
  }

  useEffect(() => {
    if (!modalPanel) {
      return
    }

    const panel = panelElements.current.get(modalPanel)
    const frame = requestAnimationFrame(() => {
      panel
        ?.querySelector<HTMLButtonElement>("[data-editor-drawer-close]")
        ?.focus({ preventScroll: true })
    })

    return () => cancelAnimationFrame(frame)
  }, [modalPanel])

  return (
    <div
      ref={root}
      className={`editor-workspace ${className}`}
      data-testid="editor-workspace"
      data-layout={wide ? "wide" : "compact"}
      aria-label={ariaLabel}
      onKeyDown={(event) => {
        if (!modalPanel) {
          return
        }

        if (event.key === "Escape" && !event.defaultPrevented) {
          event.preventDefault()
          event.stopPropagation()
          close()
        }

        if (event.key === "Tab") {
          const panel = panelElements.current.get(modalPanel)

          // Leave focus to an open portal dialog (media library, confirmation).
          if (!panel?.contains(event.target as Node)) {
            return
          }

          const nodes = Array.from(
            panel.querySelectorAll<HTMLElement>(
              'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]',
            ),
          ).filter(
            (node) =>
              node.getClientRects().length > 0 && !node.closest("[inert]"),
          )
          const first = nodes.at(0)
          const last = nodes.at(-1)

          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault()
            last?.focus()
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault()
            first?.focus()
          }
        }
      }}
    >
      {(["left", "right"] as const).map((side) => (
        <nav
          key={side}
          className={`editor-workspace-rail editor-workspace-rail-${side}`}
          aria-label={ariaLabel}
        >
          {panels
            .filter((panel) => (panel.side ?? "right") === side)
            .map((panel) => (
              <NativeButton
                key={panel.id}
                type="button"
                size="sm"
                className="editor-workspace-toggle"
                classNameContent="editor-workspace-toggle-content"
                data-testid={`editor-panel-toggle-${panel.id}`}
                aria-label={panel.label}
                title={panel.label}
                aria-expanded={active === panel.id || docked.has(panel.id)}
                aria-controls={`${id}-${panel.id}`}
                onClick={(event) => {
                  trigger.current = event.currentTarget

                  if (docked.has(panel.id)) {
                    panelElements.current
                      .get(panel.id)
                      ?.querySelector<HTMLElement>(
                        "input,select,textarea,button",
                      )
                      ?.focus({ preventScroll: true })
                  } else {
                    setActive((current) =>
                      current === panel.id ? null : panel.id,
                    )
                  }
                }}
              >
                {panel.icon ??
                  (side === "left" ? (
                    <PanelLeft size={19} />
                  ) : (
                    <PanelRight size={19} />
                  ))}
                <span>{panel.label}</span>
              </NativeButton>
            ))}
        </nav>
      ))}
      <div className="editor-workspace-center" inert={Boolean(modalPanel)}>
        {toolbar && <div className="editor-workspace-toolbar">{toolbar}</div>}
        <div
          className="editor-workspace-canvas"
          data-testid="editor-workspace-canvas"
        >
          {children}
        </div>
      </div>
      {modalPanel && (
        <button
          type="button"
          className="editor-workspace-scrim"
          aria-label={closeLabel}
          tabIndex={-1}
          onClick={close}
        />
      )}
      {panels.map((panel) => {
        const isDocked = docked.has(panel.id)
        const visible = isDocked || active === panel.id

        return (
          <section
            key={panel.id}
            id={`${id}-${panel.id}`}
            ref={(element) => {
              if (element) {
                panelElements.current.set(panel.id, element)
              } else {
                panelElements.current.delete(panel.id)
              }
            }}
            className={`editor-workspace-panel editor-workspace-panel-${panel.side ?? "right"}`}
            data-testid={`editor-panel-${panel.id}`}
            data-docked={isDocked}
            hidden={!visible}
            inert={!visible}
            role={isDocked ? "region" : "dialog"}
            aria-modal={visible && !isDocked ? true : undefined}
            aria-label={panel.label}
          >
            <div className="editor-workspace-panel-heading">
              <strong>{panel.label}</strong>
              {!isDocked && (
                <NativeButton
                  type="button"
                  size="sm"
                  data-editor-drawer-close
                  data-testid={`editor-panel-close-${panel.id}`}
                  className="editor-workspace-close"
                  aria-label={closeLabel}
                  onClick={close}
                >
                  <X size={20} />
                </NativeButton>
              )}
            </div>
            <div className="editor-workspace-panel-body">{panel.content}</div>
          </section>
        )
      })}
    </div>
  )
}

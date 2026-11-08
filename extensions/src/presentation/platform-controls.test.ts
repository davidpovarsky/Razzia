import { createElement } from "react"
import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { readdirSync, readFileSync } from "node:fs"
import { resolve, relative } from "node:path"
import {
  PlatformButton,
  PlatformControlsProvider,
  type PlatformButtonProps,
} from "./platform-controls"
import primitives from "./native-button-primitives.json"

const root = resolve(import.meta.dirname, "../../..")
function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((item) => {
    const path = resolve(directory, item.name)

    if (item.isDirectory()) {
      return sourceFiles(path)
    }

    if (
      /\.[jt]sx?$/.test(item.name) &&
      !item.name.includes(".test.") &&
      !item.name.includes(".spec.")
    ) {
      return [path]
    }

    return []
  })
}

describe("native platform control contract", () => {
  it("delegates to the host component with interaction, accessibility and content intact", () => {
    const capture: { forwarded: PlatformButtonProps | null } = {
      forwarded: null,
    }
    const Host = (props: PlatformButtonProps) => {
      capture.forwarded = props

      return createElement(
        "button",
        {
          type: props.type,
          disabled: props.disabled,
          "aria-pressed": props["aria-pressed"],
        },
        props.children,
      )
    }
    const click = () => undefined
    const html = renderToStaticMarkup(
      createElement(
        PlatformControlsProvider,
        { Button: Host },
        createElement(
          PlatformButton,
          {
            type: "button",
            disabled: true,
            "aria-pressed": true,
            onClick: click,
          },
          "Keep this action",
        ),
      ),
    )
    expect(capture.forwarded?.onClick).toBe(click)
    expect(capture.forwarded?.className).toContain("font-display")
    expect(html).toContain('aria-pressed="true"')
    expect(html).toContain('disabled=""')
    expect(html.match(/Keep this action/g)).toHaveLength(1)
  })
  it("prevents feature code from introducing its own raw button implementation", () => {
    const unexpected: string[] = []
    for (const file of [
      ...sourceFiles(resolve(root, "packages/web/src")),
      ...sourceFiles(resolve(root, "extensions/src")),
    ]) {
      const name = relative(root, file).replaceAll("\\", "/")
      const text = readFileSync(file, "utf8")
      const count = [...text.matchAll(/<(?:button|motion\.button)\b/g)].length
      const original = (primitives as Record<string, number>)[name] ?? 0

      if (count > original) {
        unexpected.push(
          `${name}: ${count} raw controls, ${original} original primitive sites`,
        )
      }

      if (
        /<(?:div|span|article)\b[^>]*\brole=\{?[^}>]*["']button["']/.test(
          text,
        ) &&
        !(name in primitives)
      ) {
        unexpected.push(
          `${name}: feature action impersonates a button with a raw element`,
        )
      }

      if (
        name !== "extensions/src/presentation/platform-controls.tsx" &&
        /createElement\(\s*["']button["']/.test(text)
      ) {
        unexpected.push(`${name}: dynamic raw button`)
      }
    }
    expect(unexpected).toEqual([])
  })
})

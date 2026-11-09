import { createElement } from "react"
import { parse } from "@babel/parser"
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

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null
}

function inspectControls(source: string) {
  const result = { raw: 0, impersonated: false, dynamic: false }
  const visit = (value: unknown): void => {
    const node = record(value)

    if (!node) {
      return
    }

    if (node.type === "JSXOpeningElement") {
      const name = record(node.name)
      const tag = name?.type === "JSXIdentifier" ? name.name : null

      if (
        tag === "button" ||
        (name?.type === "JSXMemberExpression" &&
          record(name.object)?.name === "motion" &&
          record(name.property)?.name === "button")
      ) {
        result.raw += 1
      }

      if (["div", "span", "article"].includes(String(tag))) {
        for (const attribute of node.attributes as unknown[]) {
          const field = record(attribute)
          const content = record(field?.value)

          if (
            record(field?.name)?.name === "role" &&
            (content?.value === "button" ||
              record(content?.expression)?.value === "button")
          ) {
            result.impersonated = true
          }
        }
      }
    }

    if (node.type === "CallExpression") {
      const callee = record(node.callee)

      if (
        (callee?.name === "createElement" ||
          record(callee?.property)?.name === "createElement") &&
        record((node.arguments as unknown[])[0])?.value === "button"
      ) {
        result.dynamic = true
      }
    }

    for (const [key, child] of Object.entries(node)) {
      if (["loc", "start", "end", "comments", "tokens"].includes(key)) {
        continue
      }

      if (Array.isArray(child)) {
        for (const item of child as unknown[]) {
          visit(item)
        }
      } else {
        visit(child)
      }
    }
  }
  visit(
    parse(source, { sourceType: "unambiguous", plugins: ["typescript", "jsx"] })
      .program,
  )

  return result
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
      const controls = inspectControls(text)
      const count = controls.raw
      const original = (primitives as Record<string, number>)[name] ?? 0

      if (count > original) {
        unexpected.push(
          `${name}: ${count} raw controls, ${original} original primitive sites`,
        )
      }

      if (controls.impersonated && !(name in primitives)) {
        unexpected.push(
          `${name}: feature action impersonates a button with a raw element`,
        )
      }

      if (
        name !== "extensions/src/presentation/platform-controls.tsx" &&
        controls.dynamic
      ) {
        unexpected.push(`${name}: dynamic raw button`)
      }
    }
    expect(unexpected).toEqual([])
  })
})

import { describe, it, expect } from "vitest"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { Button, IconButton } from "./button"
import { Input, Select } from "./fields"
import {
  ErrorState,
  LoadingState,
  Table,
  TableBody,
  TableRow,
  TableCell,
} from "./surfaces"

describe("platform observable accessibility contracts", () => {
  it("pending is a genuinely disabled native button with the original accessible action text", () => {
    const html = renderToStaticMarkup(
      createElement(Button, { loading: true }, "Save changes"),
    )
    expect(html).toContain("<button")
    expect(html).toContain('type="button"')
    expect(html).toContain('disabled=""')
    expect(html).toContain('aria-busy="true"')
    expect(html.match(/Save changes/gu)).toHaveLength(1)
  })
  it("icon actions have a required accessible name", () => {
    const html = renderToStaticMarkup(
      createElement(IconButton, { label: "Open options", children: "+" }),
    )
    expect(html).toContain('aria-label="Open options"')
  })
  it("field label, description and error reference their unique native input", () => {
    const html = renderToStaticMarkup(
      createElement(Input, {
        label: "Email",
        description: "Account email",
        error: "Invalid email",
        id: "email-field",
      }),
    )
    expect(html).toContain('for="email-field"')
    expect(html).toContain(
      'aria-describedby="email-field-description email-field-error"',
    )
    expect(html).toContain('aria-invalid="true"')
    expect(html).toContain('role="alert"')
  })
  it("native select retains browser semantics and disabled state", () => {
    const html = renderToStaticMarkup(
      createElement(
        Select,
        { label: "Language", disabled: true },
        createElement("option", { value: "en" }, "English"),
      ),
    )
    expect(html).toContain("<select")
    expect(html).toContain('disabled=""')
  })
  it("async loading and errors announce their actual state without inventing data", () => {
    expect(
      renderToStaticMarkup(
        createElement(LoadingState, { title: "Loading games" }),
      ),
    ).toContain('aria-busy="true"')
    expect(
      renderToStaticMarkup(
        createElement(ErrorState, { title: "Network unavailable" }),
      ),
    ).toContain('role="alert"')
  })
  it("table uses a real caption and native rows/cells", () => {
    const html = renderToStaticMarkup(
      createElement(
        Table,
        { caption: "Registered participants" },
        createElement(
          TableBody,
          null,
          createElement(
            TableRow,
            null,
            createElement(TableCell, null, "Fixture"),
          ),
        ),
      ),
    )
    expect(html).toContain("<caption>Registered participants</caption>")
    expect(html).toContain("<tbody><tr><td>Fixture</td></tr></tbody>")
  })
})

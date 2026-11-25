import { it, expect } from "vitest"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { SeatingPlan } from "./SeatingPlan"

it("lights the actual table when either representative connects, without inventing demo seats", () => {
  const html = renderToStaticMarkup(
    createElement(SeatingPlan, {
      representatives: [
        { table: 1, name: "First Representative" },
        { table: 1, name: "Second Representative" },
      ],
      connectedTables: [1],
      dialNumber: "077-226-3533",
      pin: "123456",
      qr: null,
      labels: {
        call: "Call",
        pin: "PIN",
        stage: "Stage",
        production: "Production",
        entrance: "Entrance",
        connected: "1 / 31",
        table: "Table",
        noPhone: "No number",
      },
    }),
  )
  expect(html).toContain(
    'class="table-unit banquet west connected" data-table="1" data-connected="true"',
  )
  expect(html).toContain('data-table="2" data-connected="false"')
  expect(html).toContain("First R.")
  expect(html).toContain("Second R.")
  expect(html.match(/data-table=/g) ?? []).toHaveLength(31)
})

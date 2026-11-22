import { describe, expect, it } from "vitest"
import React from "react"
import { renderToString } from "react-dom/server"
import { CompanyOpening, GrandOpening } from "./FullShowScenes"
import { TadazzV4Stage } from "./TadazzV4Stage"

const clientArtwork = "/tadazz-show/second-library/creating-worlds-intro.png"
const productLogo = "/tadazz-show/v4/tadazz-brand-logo.png"
const cases = [
  {
    name: "company opening",
    artworkClass: "full-company-event",
    render: (eventArtworkUrl?: string) =>
      renderToString(
        React.createElement(CompanyOpening, { data: { eventArtworkUrl } }),
      ),
  },
  {
    name: "grand opening",
    artworkClass: "full-opening-event",
    render: (eventArtworkUrl?: string) =>
      renderToString(
        React.createElement(GrandOpening, { data: { eventArtworkUrl } }),
      ),
  },
  {
    name: "ordinary question stage",
    artworkClass: "stage-teaser",
    render: (eventArtworkUrl?: string) =>
      renderToString(
        React.createElement(TadazzV4Stage, {
          initialScene: "question",
          initialData: { question: "Which answer?", eventArtworkUrl },
        }),
      ),
  },
]

describe("Native default event artwork", () => {
  for (const example of cases) {
    it(`${example.name} does not inject client artwork by default`, () => {
      const html = example.render()
      expect(html).toContain(productLogo)
      expect(html).not.toContain("creating-worlds")
      expect(html).not.toContain("teaser-screen")
      expect(html).not.toContain(`class="${example.artworkClass}"`)
    })
    it(`${example.name} preserves explicitly authored client artwork`, () => {
      const html = example.render(clientArtwork)
      expect(html).toContain(productLogo)
      expect(html).toContain(`src="${clientArtwork}"`)
      expect(html).toContain(`class="${example.artworkClass}"`)
    })
  }
})

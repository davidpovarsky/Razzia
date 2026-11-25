import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { I18nextProvider } from "react-i18next"
import { describe, expect, it } from "vitest"
import {
  previewNativeLabels,
  type PreviewLocale,
} from "../show-library-preview/i18n"
import {
  FullShowSceneView,
  StoryCards,
  type FullShowInput,
  type FullShowScene,
} from "./FullShowScenes"

function renderScene(
  scene: FullShowScene,
  locale: PreviewLocale,
  data: FullShowInput = {},
) {
  const native = previewNativeLabels(locale)

  return renderToStaticMarkup(
    React.createElement(
      I18nextProvider,
      { i18n: native.i18n },
      React.createElement(FullShowSceneView, {
        scene,
        data: { ...data, labels: native.v4Labels },
      }),
    ),
  )
}

describe("Full show scene localization", () => {
  it.each(["en", "de", "es", "fr", "it", "ja", "tr", "vi", "he"] as const)(
    "uses the isolated preview provider for the directory in %s",
    (locale) => {
      const native = previewNativeLabels(locale)
      const html = renderScene("representative-directory", locale, {
        representatives: [{ table: 1, name: "Dana לוי" }],
        connectedTables: [1],
        dialNumber: "+972501234567",
      })
      expect(html).toContain(
        native.i18n.t("extensions:fullShow.directoryTitle"),
      )
      expect(html).toContain("Dana לוי")
      expect(html).toContain(
        'class="full-directory-dial-number" dir="ltr">+972501234567',
      )
      expect(html).not.toContain("{{")
      expect(html).not.toContain("fullShow.")
    },
  )

  it("translates Hebrew instructions, connection states, rounds and tie resolution", () => {
    const cases: Array<[FullShowScene, string]> = [
      ["phone-instructions", "מחייגים. ואז בוחרים."],
      ["connection-readiness", "השולחנות נדלקים"],
      ["story-progress", "העולם שלכם מקבל צורה"],
      ["tie-break", "הקהל חלוק בדעתו"],
      ["grand-opening", "הסיפור מתחיל בכם"],
      ["round-one", "הסיפור הראשון"],
      ["round-two", "עולם חדש לגמרי"],
    ]
    for (const [scene, text] of cases) {
      const html = renderScene(scene, "he", { completed: 2, voteCount: 4 })
      expect(html).toContain(text)
      expect(html).not.toMatch(
        /AWAITING THE VOTE|PHONE VOTING|KEYPAD VOTING|LIVE CONNECTIONS|EQUAL VOTES|ROUND 0[12]|Choice [12]/u,
      )
      expect(html).not.toContain("{{")
    }
    const phone = renderScene("phone-instructions", "he", {
      dialNumber: "+972501234567",
    })
    expect(phone).toContain('class="full-phone-keys" dir="ltr"')
    expect(phone).toContain(
      'class="full-phone-display-number" dir="ltr">+972501234567',
    )
    expect(renderScene("connection-readiness", "he")).toContain(
      "נתוני תצוגה מקדימה",
    )
    expect(
      renderScene("connection-readiness", "he", { isLive: true }),
    ).not.toContain("נתוני תצוגה מקדימה")
  })

  it("localizes default story roles while preserving authored content", () => {
    const native = previewNativeLabels("he")
    const html = renderToStaticMarkup(
      React.createElement(
        I18nextProvider,
        { i18n: native.i18n },
        React.createElement(StoryCards, {
          data: {
            winners: [{ title: "My custom choice" }],
            labels: native.v4Labels,
          },
        }),
      ),
    )
    expect(html).toContain("הדמות הראשית")
    expect(html).toContain("ממתינים להצבעה")
    expect(html).toContain("My custom choice")
    expect(html).not.toContain("Main Character")
    const authored = renderScene("grand-opening", "he", {
      title: "My event title",
      subtitle: "My subtitle",
    })
    expect(authored).toContain("My event title")
    expect(authored).toContain("My subtitle")
  })
})

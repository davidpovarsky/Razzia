import type { ReactNode } from "react"
import { Card } from "../index"
import { CATALOG_COMPONENTS, type StoryId } from "./registry"

export function Story({ id, children }: { id: StoryId; children: ReactNode }) {
  const entry = CATALOG_COMPONENTS[id]

  return (
    <Card id={`story-${id}`} data-catalog-story={id}>
      <h3>{entry.exports.join(" / ")}</h3>
      {entry.modules.map((module) => (
        <code key={module}>extensions/src/platform-ui/{module}</code>
      ))}
      <p className="catalog-description">{entry.props}</p>
      <div className="catalog-example">{children}</div>
      <p className="catalog-description">{entry.rule}</p>
    </Card>
  )
}

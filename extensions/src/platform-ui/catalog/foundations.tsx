import {
  PRIMITIVE_TOKENS,
  COMPONENT_TOKENS,
  SEMANTIC_TOKENS,
  LIGHT_SEMANTIC_TOKENS,
  type PlatformContext,
} from "../index"
export function Foundations({
  context,
  light,
}: {
  context: PlatformContext
  light: boolean
}) {
  const palette = light ? LIGHT_SEMANTIC_TOKENS : SEMANTIC_TOKENS[context]
  return (
    <section id="foundations" aria-labelledby="foundations-title">
      <h2 id="foundations-title">Foundations from production tokens</h2>
      <div className="catalog-palette">
        {Object.entries(palette).map(([name, value]) => (
          <div key={name} className="catalog-swatch">
            <span aria-hidden="true" style={{ background: value }} />
            <code>{name}</code>
            <code>{value}</code>
          </div>
        ))}
      </div>
      <div className="catalog-foundations">
        {Object.entries(PRIMITIVE_TOKENS)
          .filter(([name]) => name !== "color")
          .map(([name, values]) => (
            <details key={name}>
              <summary>{name}</summary>
              <dl>
                {Object.entries(values).map(([key, value]) => (
                  <div key={key}>
                    <dt>{key}</dt>
                    <dd>
                      <code>{String(value)}</code>
                    </dd>
                  </div>
                ))}
              </dl>
            </details>
          ))}
      </div>
      <div className="catalog-type-samples">
        {Object.entries(PRIMITIVE_TOKENS.type).map(([name, size]) => (
          <p key={name} style={{ fontSize: size }}>
            {name} · Rubik Aa 0123
          </p>
        ))}
      </div>
      <details>
        <summary>Component token source</summary>
        <pre>{JSON.stringify(COMPONENT_TOKENS, null, 2)}</pre>
      </details>
      <p>
        Platform scopes own control typography, spacing, radii, focus and
        motion. Editor styling and show.theme are independent. Reduced motion
        follows the system preference; no show timeline is changed.
      </p>
    </section>
  )
}

import { useState } from "react"
import { useTranslation } from "react-i18next"
import {
  PlatformScope,
  Select,
  Switch,
  Badge,
  PRIMITIVE_TOKENS,
  PLATFORM_TOKEN_VERSION,
  PLATFORM_CONTEXTS,
  type PlatformContext,
  type PlatformAppearance,
} from "../index"
import { catalogI18n, CATALOG_LOCALES } from "./i18n"
import { Foundations } from "./foundations"
import { ComponentStories } from "./stories"
import { Layouts } from "./layouts"
import { catalogCss } from "./styles"

export function Catalog() {
  const { i18n } = useTranslation()
  const [context, setContext] = useState<PlatformContext>("platform.studio")
  const [appearance, setAppearance] = useState<PlatformAppearance>("dark")
  const [rtl, setRtl] = useState(false),
    [action, setAction] = useState(false),
    [surface, setSurface] = useState(false)

  return (
    <PlatformScope
      context={context}
      appearance={appearance}
      dir={rtl ? "rtl" : "ltr"}
      className="tds-catalog"
      data-testid="catalog-scope"
      tokenOverrides={{
        ...(action ? { action: PRIMITIVE_TOKENS.color.info } : {}),
        ...(surface ? { surface: PRIMITIVE_TOKENS.color.elevated } : {}),
      }}
    >
      <style>{catalogCss}</style>
      <header className="catalog-header">
        <a href="#catalog-main" className="catalog-skip">
          Skip to examples
        </a>
        <div className="catalog-row">
          <strong>Tadazz Design System</strong>
          <Badge>v{PLATFORM_TOKEN_VERSION}</Badge>
          <Badge>Internal development</Badge>
        </div>
        <nav aria-label="Catalog sections" className="catalog-row">
          <a href="#foundations">Foundations</a>
          <a href="#components">Components</a>
          <a href="#layouts">Layouts</a>
          <a href="#governance">Usage rules</a>
        </nav>
      </header>
      <main id="catalog-main" className="catalog-main">
        <h1>One production library. Real interactive examples.</h1>
        <p>
          Private local development artifact. Example data stays in memory; this
          catalog has no account, game or provider connection. Documentation is
          in English; component content uses the existing eight locale
          resources.
        </p>
        <div
          className="catalog-controls"
          role="group"
          aria-label="Live preview controls"
        >
          <Select
            label="Platform context"
            value={context}
            onChange={(event) =>
              setContext(event.target.value as PlatformContext)
            }
          >
            {PLATFORM_CONTEXTS.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </Select>
          <Select
            label="Appearance"
            value={appearance}
            onChange={(event) =>
              setAppearance(event.target.value as PlatformAppearance)
            }
          >
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </Select>
          <Select
            label="Content language"
            value={i18n.resolvedLanguage ?? "en"}
            onChange={(event) => {
              document.documentElement.lang = event.target.value
              void catalogI18n.changeLanguage(event.target.value)
            }}
          >
            {CATALOG_LOCALES.map((language) => (
              <option key={language}>{language}</option>
            ))}
          </Select>
          <Switch label="RTL fixture" checked={rtl} onCheckedChange={setRtl} />
          <Switch
            label="Override action token"
            checked={action}
            onCheckedChange={setAction}
          />
        </div>
        <output data-testid="catalog-language">{i18n.resolvedLanguage}</output>
        <Foundations context={context} light={appearance === "light"} />
        <ComponentStories changeSurface={() => setSurface(!surface)} />
        <Layouts />
        <section id="governance" aria-labelledby="governance-title">
          <h2 id="governance-title">Usage and ownership</h2>
          <p>
            Import <code>@razzia/extensions/platform-ui</code>. Source and typed
            API are listed on each example. Use the existing account/game state
            and command handlers at the consumer; the design system owns
            presentation and interaction only.
          </p>
          <p>
            Use semantic tokens and scoped selectors. Do not introduce
            independent buttons/dialogs, raw brand colors, hidden DOM rewrites,
            fake successful operations, or platform CSS in the frozen editor.
            Keep show.theme and choreography independent.
          </p>
          <p>
            Source docs: <code>docs/extensions/plans/TDS_COMPONENTS.md</code>,{" "}
            <code>TDS_TOKENS.md</code>, <code>TDS_CATALOG.md</code>. Run{" "}
            <code>pnpm --dir extensions ui:check</code> and the documented
            remote browser checks before marking changes verified.
          </p>
          <p>
            Internal examples do not authorize a public catalog route,
            production writes, merge or deployment.
          </p>
        </section>
      </main>
    </PlatformScope>
  )
}

import "@fontsource-variable/rubik/wght.css"
import "@razzia/web/index.css"
import "@razzia/web/i18n"
import { createRoot } from "react-dom/client"
import { useState } from "react"
import NativeButton from "@razzia/web/components/Button"
import { PlatformControlsProvider } from "../src/presentation/platform-controls"
import { PlatformScope, SEMANTIC_TOKENS } from "../src/platform-ui"
import { ReferenceCanvas } from "../src/site/web/shared/ReferenceCanvas"
import { SiteButton } from "../src/site/web/shared/SiteButton"
import { resolveShowTheme } from "../src/core"
import { showThemeStyle } from "../src/presentation/show-themes/context"

function Fixture() {
  const [changed, setChanged] = useState(false)
  const action = changed ? SEMANTIC_TOKENS["platform.host"].info : undefined
  return (
    <PlatformControlsProvider Button={NativeButton}>
      <button data-testid="change-token" onClick={() => setChanged(!changed)}>
        Change scoped token
      </button>
      <NativeButton data-testid="original-control">
        Original control
      </NativeButton>
      <div
        data-testid="show-contract"
        style={showThemeStyle(resolveShowTheme({ role: "spectator" }))}
      >
        Actual independent show tokens
      </div>
      <ReferenceCanvas
        variant="studio"
        styles={
          ".tds-scope .btn{background:var(--lime);color:var(--tds-action-text);min-height:var(--tds-button-min-height)}"
        }
      >
        <PlatformScope
          context="platform.studio"
          tokenOverrides={action ? { action } : undefined}
        >
          <SiteButton className="btn" data-testid="site-consumer">
            Actual SiteButton
          </SiteButton>
        </PlatformScope>
        <PlatformScope context="platform.studio" appearance="light">
          <span
            data-testid="light-surface"
            style={{
              color: "var(--tds-text)",
              background: "var(--tds-surface)",
            }}
          >
            Platform light preview
          </span>
        </PlatformScope>
      </ReferenceCanvas>
      <PlatformScope
        context="platform.host"
        tokenOverrides={action ? { action } : undefined}
      >
        <style>
          {
            ".tds-scope .tds-token-consumer{background:var(--tds-action);color:var(--tds-action-text);min-height:var(--tds-button-min-height)}"
          }
        </style>
        <NativeButton
          className="tds-token-consumer"
          data-testid="host-consumer"
        >
          Actual host primitive
        </NativeButton>
        <span
          data-testid="motion-consumer"
          style={{ transitionDuration: "var(--tds-motion-normal)" }}
        >
          Motion timing
        </span>
      </PlatformScope>
    </PlatformControlsProvider>
  )
}
createRoot(document.getElementById("root")!).render(<Fixture />)

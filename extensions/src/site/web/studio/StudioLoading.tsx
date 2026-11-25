import studio from "../../../../site-assets/studio.css?inline"
import { ReferenceCanvas } from "../shared/ReferenceCanvas"
import { studioStyle } from "../../themes/studio"
import { corrections } from "../../themes/corrections"
import { useSiteText } from "../../locales"

export function StudioLoading() {
  const t = useSiteText()

  return (
    <ReferenceCanvas variant="studio" styles={studio}>
      <style>
        {corrections}
        {studioStyle}
      </style>
      <div
        className="workspace site-loading-shell"
        data-testid="studio-loading"
        role="status"
        aria-label={t("Loading your studio…")}
      >
        <aside className="sidebar" aria-hidden="true">
          <div className="side-brand">
            <img
              src="/tadazz-design-reference/marketing-logo.webp"
              alt=""
              width="169"
              height="70"
            />
          </div>
          <div className="site-skeleton-nav">
            {[0, 1, 2, 3, 4].map((item) => (
              <div key={item} className="site-skeleton" />
            ))}
          </div>
        </aside>
        <div className="main" aria-hidden="true">
          <div className="topbar">
            <div className="site-skeleton site-skeleton-title" />
          </div>
          <div className="content">
            <div className="site-skeleton site-skeleton-hero" />
            <div className="site-skeleton-grid">
              {[0, 1, 2].map((item) => (
                <div key={item} className="site-skeleton site-skeleton-card" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </ReferenceCanvas>
  )
}

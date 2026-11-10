import { siteText as t } from "../../locales"

/** Neutral public chrome only; never show cached account data before verification. */
export function SiteLoading() {
  return (
    <div
      data-testid="site-loading"
      role="status"
      aria-label={t("Loading page…")}
      style={{
        minHeight: "100dvh",
        background: "#0b0718",
        display: "grid",
        placeItems: "center",
      }}
    >
      <img
        src="/tadazz-design-reference/marketing-logo.webp"
        width="164"
        height="68"
        alt="TADAZZ!"
      />
    </div>
  )
}

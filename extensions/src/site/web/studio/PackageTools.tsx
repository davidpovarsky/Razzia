import { lazy, Suspense, useEffect, useState } from "react"
import { packageStyle } from "../../themes/packages"
import { useSiteText } from "../../locales"

const PackageManager = lazy(() =>
  import("@razzia/web/features/manager/components/packages/PackageManager").then(
    (module) => ({ default: module.PackageManager }),
  ),
)

export function PackageTools(props: {
  file: File | null
  onImported: () => unknown
  onFileConsumed: () => void
}) {
  const t = useSiteText()
  const [open, setOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    if (props.file) {
      setLoaded(true)
      setOpen(true)
    }
  }, [props.file])

  return (
    <div className="site-package-tools">
      <style>{packageStyle}</style>
      <details
        open={open}
        onToggle={(event) => {
          const next = event.currentTarget.open
          setOpen(next)

          if (next) {
            setLoaded(true)
          }
        }}
      >
        <summary data-testid="package-tools-toggle">
          <strong>{t("Advanced packages")}</strong>
          <span>{t("Install and manage game packages.")}</span>
        </summary>
        {(loaded || props.file) && (
          <Suspense
            fallback={
              <div
                className="site-skeleton site-skeleton-package"
                aria-hidden="true"
              />
            }
          >
            <PackageManager {...props} />
          </Suspense>
        )}
      </details>
    </div>
  )
}

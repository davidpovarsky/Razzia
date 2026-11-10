import { lazy, Suspense } from "react"
import { packageStyle } from "../../themes/packages"

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
  return (
    <div className="site-package-tools">
      <style>{packageStyle}</style>
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
    </div>
  )
}

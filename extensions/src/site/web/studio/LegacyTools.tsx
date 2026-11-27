import Configurations from "@razzia/web/features/manager/components/configurations"
import ManagerAuthBackground from "@razzia/web/features/manager/components/ManagerAuthBackground"
import { SiteLink } from "../shared/SiteLink"
import { useSiteText } from "../../locales"

export default function LegacyTools() {
  const t = useSiteText()

  return (
    <ManagerAuthBackground showLanguageSwitcher={false}>
      <div className="flex w-full max-w-md min-w-0 flex-col items-center gap-4">
        <SiteLink
          className="border-border bg-background text-foreground hover:bg-accent focus-visible:outline-primary inline-flex min-h-11 items-center rounded-lg border px-4 py-2 font-medium shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2"
          href="/studio/games"
        >
          {t("Back to My Studio")}
        </SiteLink>
        <Configurations />
      </div>
    </ManagerAuthBackground>
  )
}

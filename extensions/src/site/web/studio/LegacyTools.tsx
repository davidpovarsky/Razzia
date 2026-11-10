import Configurations from "@razzia/web/features/manager/components/configurations"
import ManagerAuthBackground from "@razzia/web/features/manager/components/ManagerAuthBackground"
import { SiteLink } from "../shared/SiteLink"
import { useSiteText } from "../../locales"

export default function LegacyTools() {
  const t = useSiteText()

  return (
    <ManagerAuthBackground showLanguageSwitcher={false}>
      <div className="flex flex-col items-center gap-4">
        <SiteLink href="/studio/games">{t("Back to My Studio")}</SiteLink>
        <Configurations />
      </div>
    </ManagerAuthBackground>
  )
}

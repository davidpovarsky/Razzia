import LanguageSwitcher from "@razzia/web/components/LanguageSwitcher"
import type { PropsWithChildren } from "react"

const TADAZZ_LOGO = "/tadazz-show/v4/tadazz-brand-logo.png"
const TADAZZ_STAGE = "/tadazz-show/v4/show-stage.webp"

const ManagerAuthBackground = ({
  children,
  showLanguageSwitcher = true,
}: PropsWithChildren<{ showLanguageSwitcher?: boolean }>) => (
  <section
    className="bg-secondary relative isolate flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 py-24 sm:px-6"
    data-testid="tadazz-manager-auth-background"
  >
    <img
      src={TADAZZ_STAGE}
      alt=""
      aria-hidden="true"
      className="absolute inset-0 -z-20 h-full w-full object-cover"
      data-testid="tadazz-manager-stage-background"
    />
    <div className="bg-secondary/70 absolute inset-0 -z-10" />

    {showLanguageSwitcher && (
      <div className="absolute top-4 right-4 z-20">
        <LanguageSwitcher />
      </div>
    )}

    <img
      src={TADAZZ_LOGO}
      alt="TADAZZ"
      className="mb-7 h-auto w-full max-w-72 drop-shadow-xl sm:max-w-80"
      data-testid="tadazz-manager-logo"
    />

    <main className="flex w-full justify-center">{children}</main>
  </section>
)

export default ManagerAuthBackground

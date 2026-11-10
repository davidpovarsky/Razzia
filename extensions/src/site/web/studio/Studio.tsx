import { SiteLink } from "../shared/SiteLink"
import { SiteButton } from "../shared/SiteButton"
import { lazy, Suspense, useEffect, useState } from "react"
import studio from "../../../../site-assets/studio.css?inline"
import { StudioLoading } from "./StudioLoading"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useRouter, useRouterState } from "@tanstack/react-router"
import {
  CalendarDays,
  HelpCircle,
  House,
  List,
  Menu,
  Plus,
  Search,
  Settings2,
  Store,
} from "lucide-react"
import { clearToken, getClientId } from "@razzia/web/lib/session"
import { socketClient } from "@razzia/web/features/game/contexts/socket-context"
import { useManagerStore } from "@razzia/web/features/game/stores/manager"
import { ReferenceCanvas } from "../shared/ReferenceCanvas"
import { SiteDialog } from "../shared/Dialog"
import { corrections } from "../../themes/corrections"
import { studioStyle } from "../../themes/studio"
import { sitePlatformStyle } from "../../themes/platform"
import {
  currentAccount,
  hasManagerSession,
  siteKey,
  siteRequest,
  type Account,
} from "../../adapters/client"
import { useSiteText } from "../../locales"
import { AccountPanel } from "./AccountPanel"
import type { QuizMeta } from "./MyGames"
import type { ResultMeta } from "./Events"

const LegacyTools = lazy(() => import("./LegacyTools"))
const MyGames = lazy(() =>
  import("./MyGames").then((module) => ({ default: module.MyGames })),
)
const Events = lazy(() =>
  import("./Events").then((module) => ({ default: module.Events })),
)
const Prepare = lazy(() =>
  import("./Events").then((module) => ({ default: module.Prepare })),
)

const navigation = [
  ["dashboard", "Dashboard", House],
  ["games", "My Games", List],
  ["explore", "Explore Games", Store],
  ["events", "My Events", CalendarDays],
  ["account", "Account & licences", Settings2],
] as const
const studioPath = (section: string) =>
  section === "dashboard" ? "/studio" : `/studio/${section}`

export function Studio() {
  const t = useSiteText()
  const router = useRouter()
  const path = useRouterState({ select: (state) => state.location.pathname })
  const queryClient = useQueryClient()
  const local = hasManagerSession()
  const profile = useQuery({
    queryKey: siteKey(getClientId(), "profile"),
    queryFn: ({ signal }) => currentAccount(signal),
    enabled: local,
    retry: false,
    staleTime: 30000,
    refetchOnMount: true,
    refetchOnWindowFocus: "always",
  })
  useEffect(() => {
    if (
      !local ||
      (profile.isError &&
        "status" in profile.error &&
        profile.error.status === 401)
    ) {
      void queryClient.cancelQueries().then(() => {
        queryClient.clear()
        void router.navigate({
          to: "/login",
          search: () => ({ returnTo: path }),
          replace: true,
        })
      })
    }
  }, [local, profile.isError, profile.error, queryClient, router, path])

  if (!local || profile.isPending) {
    return <StudioLoading />
  }

  if (profile.isError) {
    return (
      <ReferenceCanvas variant="studio" styles={studio}>
        <div className="empty" role="alert">
          <p>{t("Account service is unavailable.")}</p>
          <SiteButton
            className="btn primary"
            onClick={() => void profile.refetch()}
          >
            {t("Retry")}
          </SiteButton>
          <SiteLink className="btn ghost" href="/login">
            {t("Log in")}
          </SiteLink>
        </div>
      </ReferenceCanvas>
    )
  }

  if (path === "/studio/legacy") {
    return (
      <Suspense fallback={<StudioLoading />}>
        <LegacyTools />
      </Suspense>
    )
  }

  return <StudioWorkspace key={profile.data.id} account={profile.data} />
}

function StudioWorkspace({ account }: { account: Account }) {
  const t = useSiteText()
  const queryClient = useQueryClient()
  const path = useRouterState({ select: (state) => state.location.pathname })
  const requested = path.split("/").filter(Boolean).at(1) ?? "dashboard"
  const section = [...navigation.map(([id]) => id), "prepare"].includes(
    requested,
  )
    ? requested
    : "dashboard"
  const [search, setSearch] = useState("")
  const [menu, setMenu] = useState(false)
  const [help, setHelp] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [expired, setExpired] = useState(false)
  const quizzes = useQuery({
    queryKey: siteKey(account.id, "games"),
    queryFn: ({ signal }) =>
      siteRequest<{ quizz: QuizMeta[] }>("/api/quizz", { signal }),
    refetchOnWindowFocus: true,
    staleTime: 0,
    enabled: ["dashboard", "games", "prepare"].includes(section),
  })
  const results = useQuery({
    queryKey: siteKey(account.id, "results"),
    queryFn: ({ signal }) =>
      siteRequest<{ results: ResultMeta[] }>("/api/results", { signal }),
    refetchOnWindowFocus: true,
    enabled: ["dashboard", "events"].includes(section),
  })
  const refreshGames = () =>
    queryClient.invalidateQueries({ queryKey: siteKey(account.id, "games") })
  const refreshResults = () =>
    queryClient.invalidateQueries({ queryKey: siteKey(account.id, "results") })
  const games = quizzes.data?.quizz ?? []
  useEffect(() => {
    const check = () => {
      if (!hasManagerSession() || getClientId() !== account.id) {
        setExpired(true)
        void queryClient.cancelQueries()
        queryClient.clear()
        window.location.replace(
          `/login?returnTo=${encodeURIComponent(window.location.pathname)}`,
        )
      }
    }
    const timer = window.setInterval(check, 15000)
    const onStorage = (event: StorageEvent) => {
      if (event.key === "token") {
        setExpired(true)
        void queryClient.cancelQueries()
        queryClient.clear()
        window.location.reload()
      }
    }
    window.addEventListener("storage", onStorage)
    window.addEventListener("focus", check)
    const onPageShow = (event: PageTransitionEvent) => {
      check()

      if (event.persisted) {
        void queryClient.invalidateQueries({ queryKey: siteKey(account.id) })
      }
    }
    window.addEventListener("pageshow", onPageShow)

    return () => {
      clearInterval(timer)
      window.removeEventListener("storage", onStorage)
      window.removeEventListener("focus", check)
      window.removeEventListener("pageshow", onPageShow)
    }
  }, [account.id, queryClient])
  useEffect(() => {
    if (
      [quizzes.error, results.error].some(
        (error) => error && "status" in error && error.status === 401,
      )
    ) {
      setExpired(true)
      void queryClient.cancelQueries()
      queryClient.clear()
      window.location.replace("/login")
    }
  }, [quizzes.error, results.error, queryClient])
  const logout = async () => {
    if (loggingOut) {
      return
    }

    setLoggingOut(true)

    try {
      await siteRequest("/api/auth/logout", { method: "POST" })
    } catch {
      /* Always remove the local credential, including offline sign-out. */
    } finally {
      clearToken()
      socketClient.disconnect()
      useManagerStore.getState().resetManager()
      await queryClient.cancelQueries()
      queryClient.clear()
      window.location.assign("/")
    }
  }

  if (expired || loggingOut) {
    return <StudioLoading />
  }

  const title = navigation.find(([id]) => id === section)?.[1] ?? "Prepare show"

  return (
    <ReferenceCanvas variant="studio" styles={studio}>
      <style>
        {corrections}
        {studioStyle}
        {sitePlatformStyle}
      </style>
      <div className="workspace">
        <aside
          className={`sidebar ${menu ? "open" : ""}`}
          aria-label={t("Studio navigation")}
        >
          <SiteLink className="side-brand" href="/">
            <img
              src="/tadazz-design-reference/marketing-logo.webp"
              alt="Tadazz"
            />
          </SiteLink>
          <nav className="side-nav">
            {navigation.map(([id, label, Icon]) => (
              <SiteLink
                key={id}
                href={studioPath(id)}
                onClick={() => setMenu(false)}
                className={`nav-btn ${section === id ? "active" : ""}`}
                aria-current={section === id ? "page" : undefined}
              >
                <Icon size={18} />
                {t(label)}
              </SiteLink>
            ))}
          </nav>
          <div className="side-bottom">
            <div className="side-identity">
              <span className="avatar">
                {account.email.slice(0, 2).toUpperCase()}
              </span>
              <span>{account.email}</span>
            </div>
            <SiteButton className="side-account" onClick={() => void logout()}>
              <span className="who">{t("Sign out")}</span>
            </SiteButton>
          </div>
        </aside>
        {menu && (
          <SiteButton
            className="sidebar-shade"
            aria-label={t("Close navigation")}
            onClick={() => setMenu(false)}
          />
        )}
        <div className="main">
          <header className="topbar">
            <div className="top-left">
              <SiteButton
                className="circle-btn mobile-menu"
                aria-label={t("Toggle navigation")}
                aria-expanded={menu}
                onClick={() => setMenu(!menu)}
              >
                <Menu />
              </SiteButton>
              <strong>{t(title)}</strong>
            </div>
            <div className="top-actions">
              <label className="search-mini">
                <Search size={16} />
                <input
                  type="search"
                  placeholder={t("Search games")}
                  aria-label={t("Search games")}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
              <SiteButton
                className="circle-btn"
                aria-label={t("Help")}
                onClick={() => setHelp(true)}
              >
                <HelpCircle size={18} />
              </SiteButton>
              <SiteLink className="btn primary" href="/manager/quizz">
                <Plus size={16} />
                {t("Create game")}
              </SiteLink>
              <SiteLink
                className="avatar"
                href="/studio/account"
                aria-label={t("My account")}
              >
                {account.email.slice(0, 2).toUpperCase()}
              </SiteLink>
            </div>
          </header>
          <main className="content">
            <Suspense
              fallback={
                <div
                  className="site-skeleton site-skeleton-hero"
                  role="status"
                  aria-label={t("Loading your studio…")}
                />
              }
            >
              {section === "dashboard" && (
                <>
                  <section className="welcome">
                    <div className="welcome-copy">
                      <h1>
                        {t("Your")} <span>{t("shows.")}</span>
                      </h1>
                      <SiteLink className="welcome-link" href="/studio/explore">
                        {t("Explore Games")} →
                      </SiteLink>
                    </div>
                    <div className="welcome-art" aria-hidden="true">
                      <div className="zz-floor" />
                      <img
                        className="blue"
                        src="/tadazz-design-reference/marketing-zb.webp"
                        alt=""
                      />
                      <img
                        className="lime"
                        src="/tadazz-design-reference/marketing-zl.webp"
                        alt=""
                      />
                    </div>
                  </section>
                  <section className="spotlight-grid">
                    <article className="spotlight">
                      <div className="thumb">
                        <img
                          src="/tadazz-design-reference/marketing-worlds.webp"
                          alt=""
                        />
                      </div>
                      <div className="spotlight-info">
                        <h3>
                          {t("Welcome, {{name}}", {
                            name: account.email.split("@")[0],
                          })}
                        </h3>
                        <p>
                          {t("{{games}} games · {{events}} past events", {
                            games: quizzes.isSuccess ? games.length : "—",
                            events: results.isSuccess
                              ? results.data.results.length
                              : "—",
                          })}
                        </p>
                        <SiteLink
                          className="spotlight-action"
                          href="/studio/prepare"
                        >
                          {t("Prepare show")} →
                        </SiteLink>
                      </div>
                    </article>
                    {games[0] && (
                      <article className="spotlight editing">
                        <div className="thumb">
                          <img
                            src="/tadazz-design-reference/marketing-stage.webp"
                            alt=""
                          />
                        </div>
                        <div className="spotlight-info">
                          <h3>{games[0].subject}</h3>
                          <p>{t("Pick up where you left off")}</p>
                          <SiteLink
                            className="spotlight-action"
                            href={`/manager/quizz/${encodeURIComponent(games[0].id)}`}
                          >
                            {t("Continue editing")} →
                          </SiteLink>
                        </div>
                      </article>
                    )}
                  </section>
                  <div className="section-head">
                    <h2>{t("My Games")}</h2>
                    <SiteLink className="text-link" href="/studio/games">
                      {t("View all")} →
                    </SiteLink>
                  </div>
                </>
              )}
              {(section === "games" || section === "dashboard") && (
                <>
                  {section === "games" && (
                    <div className="pagehead">
                      <h1>{t("My Games")}</h1>
                    </div>
                  )}
                  {(() => {
                    if (quizzes.isPending) {
                      return <p role="status">{t("Loading your games…")}</p>
                    }

                    if (quizzes.isError) {
                      return (
                        <div className="empty" role="alert">
                          <p>{t("Could not load your games")}</p>
                          <SiteButton
                            className="btn ghost"
                            onClick={() => void quizzes.refetch()}
                          >
                            {t("Retry")}
                          </SiteButton>
                        </div>
                      )
                    }

                    return (
                      <MyGames
                        key={section}
                        games={games}
                        search={search}
                        limit={section === "dashboard" ? 3 : undefined}
                        refresh={refreshGames}
                      />
                    )
                  })()}
                </>
              )}
              {section === "events" &&
                (() => {
                  if (results.isPending) {
                    return <p role="status">{t("Please wait…")}</p>
                  }

                  if (results.isError) {
                    return (
                      <div role="alert">
                        <p>
                          {t(
                            "Your request could not be completed. Please try again.",
                          )}
                        </p>
                        <SiteButton
                          className="btn ghost"
                          onClick={() => void results.refetch()}
                        >
                          {t("Retry")}
                        </SiteButton>
                      </div>
                    )
                  }

                  return (
                    <Events
                      accountId={account.id}
                      results={results.data.results}
                      refresh={refreshResults}
                    />
                  )
                })()}
              {section === "prepare" &&
                (() => {
                  if (quizzes.isPending) {
                    return <p role="status">{t("Loading your games…")}</p>
                  }

                  if (quizzes.isError) {
                    return <p role="alert">{t("Could not load your games")}</p>
                  }

                  return <Prepare games={games} />
                })()}
              {section === "explore" && (
                <>
                  <div className="pagehead">
                    <h1>{t("Explore Games")}</h1>
                  </div>
                  <p className="muted">
                    {t(
                      "Illustrative catalogue. Template installation is unavailable.",
                    )}
                  </p>
                  <div className="games-grid">
                    {["Ready to play", "Make it yours", "Start fresh"].map(
                      (label, index) => (
                        <article className="game-card" key={label}>
                          <img
                            className="site-game-cover"
                            src={`/tadazz-design-reference/marketing-${index === 1 ? "worlds" : "stage"}.webp`}
                            alt=""
                          />
                          <div className="site-game-body">
                            <h3>{t(label)}</h3>
                            <SiteLink
                              className="btn ghost"
                              href={
                                index === 2 ? "/manager/quizz" : "/?view=store"
                              }
                            >
                              {t(
                                index === 2
                                  ? "Create game"
                                  : "Explore collection",
                              )}
                            </SiteLink>
                          </div>
                        </article>
                      ),
                    )}
                  </div>
                </>
              )}
              {section === "account" && <AccountPanel account={account} />}
            </Suspense>
          </main>
        </div>
        {help && (
          <SiteDialog title={t("Help")} onClose={() => setHelp(false)}>
            <p>
              {t(
                "Create or import a game in My Games. Edit it in the original editor, then open Prepare show to start a room.",
              )}
            </p>
            <SiteLink className="btn ghost" href="/studio/legacy">
              {t("Existing management tools")}
            </SiteLink>
            <SiteLink className="btn ghost" href="/game">
              {t("Join a game")}
            </SiteLink>
          </SiteDialog>
        )}
      </div>
    </ReferenceCanvas>
  )
}

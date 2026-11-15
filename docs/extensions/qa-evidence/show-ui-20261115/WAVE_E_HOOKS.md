# Lane E additive UI hooks

Recorded before editing upstream or Studio hook files. No production activation.

- `extensions/src/site/web/studio/Studio.tsx`: lazy authenticated `/studio/themes`
  branch after existing account validation; one link in current sidebar. Existing
  Studio rendering paths and A's route/marketing metadata remain unchanged.
- `packages/web/src/features/quizz/components/studio/show-theme-settings.tsx`:
  one `OpenThemeBuilderLink` beside the existing heading. No field/state/selection,
  layout or authoring workflow changes. Public presentation export supplies the link.
  Scoped render/import tests plus original source diff verify the additive boundary.
- Backend hook for manager integration: import `createThemeBuilderRoutes` from the
  existing server barrel and mount `.route("/builder", createThemeBuilderRoutes(...))`
  in `packages/socket/src/api/extensions/theme-routes.ts` after existing `requireManager`.
  Options use `themeInstallerEnabled`, `themeInstallationStore`, and
  `principal: (claims, tenantId) => themeWorkspacePrincipal(claims.sub, tenantId)`.
  E does not edit this backend-owned upstream file. Isolated source assembly may
  apply this exact hook for real authenticated route testing. The parent OFF gate
  and authenticated workspace principal remain the authority.

Acceptance/tests are pending until recorded in the run receipt; this ledger does
not claim a pass. Existing editor/pins/signed installation/publication stay intact.

2026-11-15 native WebKit correction, recorded before editing:
`extensions/src/presentation/tadazz-v4/motion.ts`, `TadazzV4Motion.play`: when
reduced motion is requested, finish finite decorative WAAPI/CSS animations before
awaiting their completion. Preserve the real countdown sweep and infinite ambient
animations. Run7 WebKit bootstrap remained hidden waiting for animation completion;
the isolated diagnostic advanced after finishing the pending finite animations.
Validation: existing full-show motion tests plus strengthened actual Chromium and
WebKit visibility, question transition, clock and disposal checks. Results pending.

V2 native visual primitive seams, recorded before editing:
- `packages/web/src/features/game/components/AnswerButton.tsx`, its four existing
  media helper imports: use the new exact `@razzia/extensions/media/answer-button`
  export pointing to the same implementation. Existing props/behavior stay intact.
- `extensions/package.json`: expose that additive leaf entry; keep all old exports.
- `extensions/src/media/rich-answer-card.tsx`: import the same existing media
  validation symbols directly from `core/media`, avoiding a root core barrel.
  This prevents producer/repository/transport code entering the V2 renderer through
  the actual upstream AnswerButton visual primitive. Actual graph/test proof pending.

WebKit diagnostic5: native animations stayed play-pending with null startTime while
the visible document timeline advanced. Assigning their startTime from that SAME
native timeline made them advance. Before successor edits: anchor new finite native
animations to their existing DocumentTimeline (no timer/alternate clock), and resume
only paused animations so finished q1 entrance effects are not restarted for q2.
Keep countdown timing unchanged. Reduced-motion decoration is finished explicitly;
its finish notification is not a prerequisite to showing a static frame.

OAuth consent hook, before edit: `Studio.tsx` adds a lazy `/studio/oauth-consent`
branch after its existing verified profile check. Trusted build configuration
`VITE_TADAZZ_OAUTH_ISSUER_PATH` supplies the same-origin issuer base; absent means
unavailable. The current `/studio/$section` route already mounts the path. Root
host owns actual HTTPS/OAuth mounting and must apply the additive consent headers
from `site/oauth-consent-headers.ts` to the actual HTML/HEAD route before activation.

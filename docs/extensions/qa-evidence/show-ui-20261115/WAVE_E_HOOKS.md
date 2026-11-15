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

# TADAZZ Next — Operational Rollback & Isolation Plan

> UPDATED AUTHORITY (2026-11-06): The user subsequently explicitly requested deployment. The historical no-deployment statement below no longer describes the current operation. The new deployment retains `tadazz-before-next-20261106` and a config backup under `/opt/tadazz-releases/next-20261106/`. See `CORRECTION_AND_DEPLOYMENT.md` for outcome.

**Date:** 2026-11-06
**Worktree:** `C:\Users\DAVID\Code\Razzia-worktrees\tadazz-next-20261105`
**Branch:** `agent/tadazz-next-20261105`
**Baseline Git Remote:** `davidpovarsky/Razzia`
**Starting Commit:** `9d8cd9f` (Session baseline)
**Protected Upstream Baseline:** Commit `5161eb7022144ee26d46a5f94cdbc714ec8b560d`

---

## 1. Safety & Isolation Guarantee

1. **Branch Isolation**:
   All work was performed exclusively on the local branch `agent/tadazz-next-20261105`. No branch has been pushed to remote (`origin` or `upstream`).
2. **Zero Production Mutation**:
   Live production (`https://tadazz.com`) was **strictly never contacted, modified, or deployed**. No production credentials, Docker configurations, tunnels, or remote hosts were altered.
3. **Worktree Isolation**:
   The primary checkout `C:\Users\DAVID\Code\Razzia-worktrees\tomer` and parallel worktree `tadazz-full-show` were preserved without modification.
4. **Upstream Source Protection**:
   Zero unauthorized modifications were made to protected files in `packages/**`. All implementation logic is strictly confined to `extensions/**`, and static assets to `packages/web/public/tadazz-show/`.
5. **Default-Off & Modular**:
   The full-show scenes and animations are activated solely when a show's timeline specifies animation presets or when `motionKit: "tadazz-v4"` is enabled. Standard Razzia quizzes run entirely untouched.

---

## 2. Step-by-Step Rollback Procedures

### Scenario A: Full Rollback (Discard Current Agent Session)
To completely revert the worktree back to starting commit `9d8cd9f`:
```bash
cd "C:\Users\DAVID\Code\Razzia-worktrees\tadazz-next-20261105"
git reset --hard 9d8cd9f
git clean -fd
```

### Scenario B: Deleting the Worktree
If this dedicated worktree is no longer needed after review:
```bash
# From main repository root or another worktree:
git worktree remove "C:\Users\DAVID\Code\Razzia-worktrees\tadazz-next-20261105" --force
```

### Scenario C: Selective Reversion of Components
If individual files need to be reverted while keeping others:
```bash
cd "C:\Users\DAVID\Code\Razzia-worktrees\tadazz-next-20261105"
# Revert card component layout & caption fixes:
git checkout 9d8cd9f -- extensions/src/presentation/tadazz-v4/components.tsx
git checkout 9d8cd9f -- extensions/src/presentation/tadazz-v4/tadazz-v4.css
# Revert stage adapter percentage retention:
git checkout 9d8cd9f -- extensions/src/presentation/tadazz-show/TadazzV4StageAdapter.tsx
# Revert full show scene components:
git checkout 9d8cd9f -- extensions/src/presentation/tadazz-v4/FullShowScenes.tsx
git checkout 9d8cd9f -- extensions/src/presentation/tadazz-v4/full-show.css
```

### Scenario D: Static Asset Cleanup
To remove only the static assets copied for the second library:
```powershell
Remove-Item -Path "C:\Users\DAVID\Code\Razzia-worktrees\tadazz-next-20261105\packages\web\public\tadazz-show\second-library" -Recurse -Force
Remove-Item -Path "C:\Users\DAVID\Code\Razzia-worktrees\tadazz-next-20261105\packages\web\public\tadazz-show\v4\curtain-left.png" -Force
Remove-Item -Path "C:\Users\DAVID\Code\Razzia-worktrees\tadazz-next-20261105\packages\web\public\tadazz-show\v4\curtain-right.png" -Force
Remove-Item -Path "C:\Users\DAVID\Code\Razzia-worktrees\tadazz-next-20261105\packages\web\public\tadazz-show\v4\creating-worlds-intro.png" -Force
Remove-Item -Path "C:\Users\DAVID\Code\Razzia-worktrees\tadazz-next-20261105\packages\web\public\tadazz-show\v4\teaser-screen-source.jpg" -Force
```

---

## 3. Verification Post-Rollback
Following any rollback action:
1. Run `pnpm --filter @razzia/extensions test` to verify that the test suite passes completely.
2. Run `pnpm exec tsc --noEmit -p packages/web/tsconfig.json` to verify zero typecheck regressions.
3. Verify git status is clean: `git status --short`.

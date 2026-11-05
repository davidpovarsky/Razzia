# TADAZZ Next — Operational Rollback & Isolation Plan

**Date:** 2026-11-06  
**Worktree:** `C:\Users\DAVID\Code\Razzia-worktrees\tadazz-next-20261105`  
**Branch:** `agent/tadazz-next-20261105`  
**Baseline Git Remote:** `davidpovarsky/Razzia`  
**Baseline Commit:** `ef4535a5ace49c0232ef36b15f376e5ea9227249` (HEAD of worktree before changes)  

---

## 1. Safety & Isolation Guarantee

1. **Branch Isolation**:
   All work was performed exclusively on the local branch `agent/tadazz-next-20261105`. No branch has been pushed to remote (`origin` or `upstream`).
2. **Production Safety**:
   Live production (`https://tadazz.com`) was not contacted, modified, or deployed. No production credentials or tunnels were touched.
3. **Worktree Isolation**:
   The existing worktree `C:\Users\DAVID\Code\Razzia-worktrees\tadazz-full-show` and primary checkout `C:\Users\DAVID\Code\Razzia-worktrees\tomer` were not modified.
4. **Upstream Source Protection**:
   Zero unauthorized modifications were made to protected files in `packages/**`. All new features are contained strictly within `extensions/**` and static asset paths in `packages/web/public/tadazz-show/`.
5. **Default-Off & Modular**:
   The full-show scenes and animations are triggered solely when a show's timeline specifies animation presets (such as `company-opening`, `grand-opening`, `representative-directory`, etc.) or when `motionKit: "tadazz-v4"` is enabled. Standard Razzia quizzes run entirely untouched.

---

## 2. Step-by-Step Rollback Procedures

### Scenario A: Full Rollback (Discard Current Agent Branch)
To completely revert the worktree back to the pristine baseline commit:
```bash
cd "C:\Users\DAVID\Code\Razzia-worktrees\tadazz-next-20261105"
git checkout -f ef4535a5ace49c0232ef36b15f376e5ea9227249
git branch -D agent/tadazz-next-20261105
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
# Revert timeline schema changes:
git checkout ef4535a -- extensions/src/core/studio-timeline-schema.ts
# Revert full show scene components:
git checkout ef4535a -- extensions/src/presentation/tadazz-v4/FullShowScenes.tsx
# Revert full show styling:
git checkout ef4535a -- extensions/src/presentation/tadazz-v4/full-show.css
# Revert motion choreography:
git checkout ef4535a -- extensions/src/presentation/tadazz-v4/motion.ts
```

### Scenario D: Static Asset Cleanup
To remove only the static assets copied for the second library:
```powershell
Remove-Item -Path "C:\Users\DAVID\Code\Razzia-worktrees\tadazz-next-20261105\packages\web\public\tadazz-show\second-library" -Recurse -Force
Remove-Item -Path "C:\Users\DAVID\Code\Razzia-worktrees\tadazz-next-20261105\packages\web\public\tadazz-show\v4\teaser-screen.jpg" -Force
```

---

## 3. Verification Post-Rollback
Following any rollback action:
1. Run `pnpm --filter @razzia/extensions test` to verify that the baseline test suite passes completely.
2. Run `pnpm exec tsc --noEmit -p packages/web/tsconfig.json` to verify zero typecheck regressions.
3. Verify git status is clean: `git status --short`.

# Phone S01 protected seam — pre-edit ledger

Recorded before applying the approved patch on 15 November 2026. Owner: telephony chat `01a1dd18-b62a-7321-88c2-6fafb71937cc`; worktree/branch `tadazz-hq-telephony-fresh-20261115` / `codex/tadazz-hq-telephony-fresh-20261115`. Clean starting HEAD `31c06c09d0667c2df52b31913dee075374613c31`.

Explicit manager authorization: `C:/Users/DAVID/Code/Codex-Agent-HQ/docs/tadazz/decisions/PHONE_S01_ROUTE_GUARDS_20261115.md` and the current ASSIGN/DISPOSITION. This grants ONLY the two reviewed S01 hunks, not any other backend/controller/storage/schema/config change. The exact approved artifact is `remote-api-fcd4813/S01_ROUTE_GUARDS_PROPOSED.patch`, SHA256 `26a6844036f025b754e26ec2c2adde01e5f59644e0d7ca2faf8a965dc0a70e42`.

Path: `packages/socket/src/api/extensions/game-routes.ts`; pre-edit Git blob `1b85ebe67e3cf1992d782847e51912a5debd900c`.

1. `/pilot-phone` authentication block: reject when expected secret is absent or supplied secret differs. Actual API02 previously created one roster entry with no configured key. Preserve configured matching-key behavior and constant existing error shape.
2. `join_or_poll`, existing connected roster branch: reject supplied cached roster when its activeCallId differs from the request callId, with 403/no joined/private identity. Actual API03/06 returned joined and private phone state for stale/unbound calls. A fresh different call without a supplied cached roster remains permitted registration under the existing contract.

Downstream composition was implemented first in `30280fa` (ordering/local tombstones/retirement); actual backend tests at `fcd4813` proved direct API callers bypass those local gates. This is the exact approved minimal seam, without a build-time rewrite, alias or hidden source mutation. Existing prior 544-file proof and all original thirteen assertions remain intact.

Validation planned: compare protected diff to this exact patch; scoped syntax/type/format checks; fresh immutable source package; all thirteen actual API cases plus configured initial/current poll, fresh redial without cached roster, stale supplied roster denial with no identity/state mutation, and valid disconnected rebind. Preserve residual API07/08/09/10/11 failures. The generic UI freeze guard may identify this separately approved API seam; record its actual result and verify the exact seam independently rather than broadening the UI allowlist.

Rollback: reverse only this approved patch on this branch after preserving evidence, if directed. No push/merge/deploy/provider operation is authorized.

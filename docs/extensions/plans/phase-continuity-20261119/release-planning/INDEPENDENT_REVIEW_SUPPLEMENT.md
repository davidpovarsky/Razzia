# Independent review supplement — trusted animation defaults and cache recovery

## Narrow animation-default projection fix

No blocking issue found in the two-file passthrough/regression change reviewed here.

The full-show server projector now passes source.defaults.stageAnimations to the existing resolveCardStageAnimations function. Its source defaults come from the verified, frozen native conversion returned by getHostSource; the same defaults object already supplies this projector's show theme and background settings.

The canonical native-preview-renderer-v2 producer supplies global stage animation defaults to this same resolver. The new argument restores that inheritance in the full-show producer without changing the resolver, precedence, payload schema, theme selection, or the source trust boundary. The resolver constructs normalized output slots; it does not expose or mutate the full defaults object. A missing global slot still reaches the existing fallback. The production change is one added argument property.

The new selection.nodecheck test uses the actual issuer repository, trusted authoring policy, normalizeDraft and full-show projection. It verifies trusted question, answer and result entrance presets across question, answerCards, voting, voteLocked and results. It also checks the omitted badge slot still defaults to none, raw per-card appearance remains rejected at the authoring boundary, and projection leaves the draft revision and authored content unchanged.

This test would fail without the new argument because those slots would resolve to the resolver's none fallback. It protects the specific observed inheritance omission rather than weakening the browser assertion that exposed it.

No globalDecoration change or additional appearance scope is recommended. The real normal-motion browser matrix remains necessary evidence that the restored nonzero entrances occur once and that phase transitions retain the existing nodes. This reviewer performed source review only and did not execute tests or rebuilds.

## Reviewed source hashes

| File | SHA256 |
|---|---|
| extensions/src/mcp-app/server/full-show-frame.ts | 4328c6e82c21d515107acd6131134387114bd19ee6260c66290ed00f53915b49 |
| extensions/qa/phase3-full-show/selection.nodecheck.ts | 6746137fa0a6653967767c541f1204d1605661e5fc510892bf114325937ebcee |
| extensions/src/core/show-library/native-preview-renderer-v2.ts | fa8d94d11faff8ab5868d60b409dfe69b5edaf0f6b4c8a4609fd5e0ff783d3b6 |
| extensions/src/core/card-appearance.ts | 1e84151840bb664826c449ec2c993a9fa46f8a12441c31baf8d940ba28b4c744 |
| extensions/src/mcp-app/server/full-show-selection.ts | cd0f3f27ca2c8a4ef16a2d15c699c196581c52d14297c6a3d5fb0326a745008d |

## Reviewed cache recovery

The root coordinator executed the reviewed recover_qa_cache_copy.py helper. The saved qa-cache-recovery-3f0491b2.json receipt was inspected locally and reports exit0/passed, exact2,042 source and target entries,97 symlinks and the accepted0d1e3e... manifest. It records unchanged source, production, gateway, runtime baseline, cache settings and worker preservation, and leaves the cache running for pin generation/qualification.

The failed Docker-copy helper and receipt are retained. The corrected copy works through the existing evidence bind inside the cache's mount namespace. The successful recovery does not qualify application source; normal final-source qualification remains unchanged.

No cache or other server mutation was performed by this reviewer.

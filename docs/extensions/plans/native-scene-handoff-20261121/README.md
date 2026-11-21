# Native prepared-scene handoff regression

The deployed native V4 adapter rendered its custom screen directly from the latest React prop, while the live director deliberately ignored a transient `wait:question-content` snapshot. When a prepared screen had already cleared the native scene, that missing prop removed the only painted content. The adapter now retains the last available custom React node until the director changes the visible mode. No clock, network, question, scoring, or timeline behavior changes.

The focused browser harness imports the actual `TadazzV4StageAdapter` and `show-director` from the deployed cd748 source (the application source in the fe88 unified parent), with only the candidate adapter overlaid. It runs genuine Chromium/WAAPI animation time and samples the results → prepared → split-content-wait → next-question handoff.

The same final harness produced a red baseline (all 8 sampled handoff frames empty) and green candidate (6 sampled frames, none empty, same prepared DOM node). All 6 candidate checks passed: one result question, retained prepared content, one replacement question, direct native next-question completion, fresh custom content replacing old content, and no browser errors. The gap fixture deliberately holds separately delivered content for 900 ms; it does not claim every deployment will have a 900 ms network delay.

Evidence: `/home/ubuntu/tadazz-native-handoff-08eb998b`, including before/after receipts and `handoff-gap.png` screenshots. The isolated QA container was stopped; no live room or customer data was used. The raw bounded qualification is preserved beside this note. This is focused regression proof, not a deployment receipt or substitute for mandatory release gates.

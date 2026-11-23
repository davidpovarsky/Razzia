import { readFileSync, writeFileSync } from "node:fs"
const p = "docs/extensions/qa-evidence/show-ui-20261115/"
let launch = readFileSync(p + "launch-wave-E-native20.py", "utf8").replaceAll("native20", "native21")
launch = launch.replace("tadazz-show-ui-E-native18", "tadazz-show-ui-E-native20")
launch = launch.replaceAll("renderer-entry.tsx", "NativePreviewStage.tsx")
writeFileSync(p + "launch-wave-E-native21.py", launch)
let run = readFileSync(p + "run-wave-E-native15.sh", "utf8")
run = run.replace("run tests node node_modules/vitest/vitest.mjs run --config /run7/vitest.config.mjs --configLoader native src/presentation/show-library-preview/preview-candidate.test.ts --maxWorkers=1\n", "")
run = run.replace(" --grep 'actual localized authored question/choices: (en|es)$|actual ref identity'", "")
writeFileSync(p + "run-wave-E-native21.sh", run)

import { readFileSync, writeFileSync } from "node:fs"
const p = "docs/extensions/qa-evidence/show-ui-20261115/"
let source = readFileSync(p + "launch-wave-E-native16.py", "utf8").replaceAll("native16", "native17")
source = source.replace("inspect','tadazz-show-ui-E-native15", "inspect','tadazz-show-ui-E-native16")
source = source.replace("or dest.startswith(consent+'/')", "or dest==consent or dest.startswith(consent+'/')")
source = source.replace("(packet/'launch.json').write_text", `original=next(m['Source'] for m in old['Mounts'] if m['Destination']=='/work/extensions/src/presentation/show-library-preview/renderer-entry-v2.tsx')
cmd[cmd.index('--entrypoint'):cmd.index('--entrypoint')]=['--mount',f'type=bind,src={original},dst=/original-v2-entry.tsx,readonly','--mount',f'type=bind,src={packet}/verify-native-v2-type-bridge.mjs,dst=/verify-native-v2-type-bridge.mjs,readonly']
(packet/'launch.json').write_text`)
if (!source.includes("inspect','tadazz-show-ui-E-native16")) throw new Error("incorrect retained container")
writeFileSync(p + "launch-wave-E-native17.py", source)
let run = readFileSync(p + "run-wave-E-native16.sh", "utf8")
const a = run.indexOf("run native-v2-inputs"), b = run.indexOf("result=0")
if (a < 0 || b < a) throw new Error("missing runner boundary")
run = run.slice(0,a) + `sha256sum /verify-native-v2-type-bridge.mjs >/out/verification-driver-sha256.txt
run native-v2-type-bridge node /verify-native-v2-type-bridge.mjs
run ui-build node node_modules/vite/bin/vite.js build --config qa/theme-builder/fixture.vite.config.ts --configLoader native
run server-build node node_modules/vite/bin/vite.js build --config qa/theme-builder/server.vite.config.ts --configLoader native
if [ "$(cat /out/ui-build.exit)" = 0 ] && [ "$(cat /out/server-build.exit)" = 0 ]; then
  start_host ui /out/server/server.js
  run oauth-component-browser node /work/node_modules/.pnpm/playwright@1.64.0/node_modules/playwright/cli.js test --config qa/theme-builder/oauth-playwright.config.ts --grep 'trusted native click|cancel discards|native session change|cancel during|expired ticket'
  stop_host
fi
` + run.slice(b)
run = run.replaceAll("retained14", "retained16")
writeFileSync(p + "run-wave-E-native17.sh", run)

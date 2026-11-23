import { readFileSync, writeFileSync } from "node:fs"
const p = "docs/extensions/qa-evidence/show-ui-20261115/"
let launch = readFileSync(p + "launch-wave-E-native18.py", "utf8").replaceAll("native18", "native20")
launch = launch.replace("tadazz-show-ui-E-native17", "tadazz-show-ui-E-native18")
launch = launch.replace("original=json.loads(subprocess.check_output(['sudo','-n','docker','inspect','tadazz-show-ui-E-native15']))[0]\n", "")
launch = launch.replace("target='/work/docs/extensions/qa-evidence/show-ui-20261115/qa-native.spec.ts'", "target='/work/extensions/src/presentation/show-library-preview/renderer-entry.tsx'")
launch = launch.replace("driver='/verify-native-v1-reuse.mjs'\n", "")
const a = launch.indexOf("originalStage="), b = launch.indexOf("(packet/'physical-mounts.json')")
if (a < 0 || b < a) throw new Error("missing native20 boundary")
launch = launch.slice(0,a) + `mounts.append({'source':str(packet/'renderer-entry.tsx'),'destination':target})
cmd+=['--mount',f'type=bind,src={packet}/renderer-entry.tsx,dst={target},readonly']
(packet/'source-sha256.json').write_text(json.dumps({target.removeprefix('/work/'):hashlib.sha256((packet/'renderer-entry.tsx').read_bytes()).hexdigest()},indent=2))
` + launch.slice(b)
writeFileSync(p + "launch-wave-E-native20.py", launch)
let run = readFileSync(p + "run-wave-E-native18.sh", "utf8")
run = run.replace("mkdir /tmp/retained14 /tmp/retained15", "mkdir /tmp/retained14")
run = run.replace("for retained in retained14 retained15", "for retained in retained14")
run = run.replace("run native-v1-reuse node /verify-native-v1-reuse.mjs", `cp /tmp/retained14/tsconfig-focused.json /out/tsconfig-focused.json
run typescript node node_modules/typescript/bin/tsc -p /out/tsconfig-focused.json
run format node qa/theme-builder/format.mjs
run native-build node node_modules/vite/bin/vite.js build --config ../docs/extensions/qa-evidence/show-ui-20261115/qa-native-receipt.vite.config.ts --configLoader native --outDir /out/native-candidate
run native-receipt node qa/theme-builder/native-build-receipt.mjs
run toolchain node qa/theme-builder/toolchain.mjs`)
run = run.replace('"$(cat /out/native-v1-reuse.exit)" = 0', '"$(cat /out/native-build.exit)" = 0')
run = run.replace(' && [ "$(cat /out/retained15-integrity.exit)" = 0 ]', '')
run = run.replace("  cp -r /tmp/retained15/native-candidate /out/native-candidate\n", "")
writeFileSync(p + "run-wave-E-native20.sh", run)

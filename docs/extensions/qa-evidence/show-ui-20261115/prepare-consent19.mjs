import { readFileSync, writeFileSync } from "node:fs"
const p = "docs/extensions/qa-evidence/show-ui-20261115/"
let launch = readFileSync(p + "launch-wave-E-native18.py", "utf8")
launch = launch.replaceAll("native18", "consent19")
launch = launch.replace("original=json.loads(subprocess.check_output(['sudo','-n','docker','inspect','tadazz-show-ui-E-native15']))[0]\n", "")
launch = launch.replace("target='/work/docs/extensions/qa-evidence/show-ui-20261115/qa-native.spec.ts'", "target='/work/extensions/src/components/oauth-consent/OAuthConsentPage.tsx'\ntestTarget='/work/extensions/qa/theme-builder/oauth-consent.spec.ts'")
launch = launch.replace("driver='/verify-native-v1-reuse.mjs'\n", "")
launch = launch.replace("'/out','/run.sh',target,", "'/out','/run.sh',target,testTarget,")
const a = launch.indexOf("originalStage="), b = launch.indexOf("(packet/'physical-mounts.json')")
if (a < 0 || b < a) throw new Error("missing launch boundary")
launch = launch.slice(0,a) + `for filename,dest in [('OAuthConsentPage.tsx',target),('oauth-consent.spec.ts',testTarget)]:
    mounts.append({'source':str(packet/filename),'destination':dest})
    cmd+=['--mount',f'type=bind,src={packet/filename},dst={dest},readonly']
(packet/'source-sha256.json').write_text(json.dumps({target.removeprefix('/work/'):hashlib.sha256((packet/'OAuthConsentPage.tsx').read_bytes()).hexdigest(),testTarget.removeprefix('/work/'):hashlib.sha256((packet/'oauth-consent.spec.ts').read_bytes()).hexdigest()},indent=2))
` + launch.slice(b)
writeFileSync(p + "launch-wave-E-consent19.py", launch)
let run = readFileSync(p + "run-wave-E-native17.sh", "utf8").replaceAll("retained16", "retained17")
run = run.replace("run tests node node_modules/vitest/vitest.mjs run --config /run7/vitest.config.mjs --configLoader native src/components/oauth-consent/login-handoff.test.ts --maxWorkers=1\n", "")
run = run.replace("sha256sum /verify-native-v2-type-bridge.mjs >/out/verification-driver-sha256.txt\nrun native-v2-type-bridge node /verify-native-v2-type-bridge.mjs\n", "")
run = run.replace("trusted native click|cancel discards|native session change|cancel during|expired ticket", "real cross-tab token replacement")
writeFileSync(p + "run-wave-E-consent19.sh", run)

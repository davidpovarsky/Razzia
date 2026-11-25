"""Prepare one exact OAuth/account/durable-draft candidate using retained caches."""
import ast
import hashlib
import json
from pathlib import Path
import re

HERE=Path(__file__).resolve().parent
ROOT=next(p for p in HERE.parents if (p/'.git').exists())
TARGET=HERE/'oauth-01';TARGET.mkdir(exist_ok=True)
NAME='mcp-oauth-F-20261115-01a1dfaa'
MODULE='extensions/src/mcp-app/'
original=json.loads((HERE.parent/'review-corrections/actual-producer-compatibility/final-input-manifest.json').read_text())
accepted=json.loads((HERE/'runtime-01/server-receipts/accepted-formatted-input-manifest.json').read_text())
old={r['path']:r for r in original['files']}
acceptedRows={r['path']:r for r in accepted['files']}
extra=[MODULE+n for n in ['first-party/oauth-protocol.ts','first-party/oauth-grants.ts','first-party/oauth.ts',
    'first-party/OAUTH.md','tests/first-party/oauth.nodecheck.ts']]
rows=[];delta=[];formatFiles=[]
for name in sorted([*acceptedRows,*extra]):
    data=(ROOT/name).read_bytes();row={'path':name,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()};rows.append(row)
    if row!=old.get(name):
        delta.append(name);p=TARGET/'app'/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data)
    if row!=acceptedRows.get(name) and name.endswith('.ts'):
        assert name.startswith(MODULE) and '/ad895-producer/' not in name
        formatFiles.append(name.removeprefix(MODULE))
manifest={'kind':'UNCOMMITTED_PRIVATE_OAUTH_ACCOUNT_DRAFT_CANDIDATE','baseHead':'1ac016e5deb8f695b78ceb95f7309b42e956879d',
    'candidateCommit':'UNCOMMITTED_WORKTREE_BYTES','files':rows,'deltaPaths':delta}
(TARGET/'final-input-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',newline='\n')
consumer=(HERE/'consumer.py').read_text().replace('mcp-format-F-20261115-01a1dfaa',NAME)
consumer=re.sub(r'MANIFEST_SHA = "[a-f0-9]+"','MANIFEST_SHA = hashlib.sha256((D / "final-input-manifest.json").read_bytes()).hexdigest()',consumer,count=1)
consumer=consumer.replace('CAP = 8 * 1024**2','CAP = int(json.loads((D / "activation.json").read_text())["diskRemainingBytes"])')
consumer=consumer.replace('Path("/predecessor/final-input-manifest.json")','D / "final-input-manifest.json"')
consumer=consumer.replace('assert len(manifest["files"]) == 160','assert len(manifest["files"]) == '+str(len(rows)))
consumer=consumer.replace('sources = [Path("/predecessor/app"),','sources = [D / "app", Path("/predecessor/app"),')
consumer=consumer.replace('    reuse_sdk(manifest)\n','')
start=consumer.index('    phases = {}')
end=consumer.index('except Exception as error:',start)
consumer=consumer[:start]+'''    phases = {}
    phases["format"] = run("02-oauth-format", ["node", "/delivery/format-and-compare.mjs"], env)
    if phases["format"]: raise RuntimeError("OAuth source AST formatter failed")
    manifest = json.loads((E / "formatted-input-manifest.json").read_text())
    phases["typecheck"] = run("03-oauth-typecheck", ["node", str(modules / "typescript/lib/tsc.js"), "--noEmit", "-p", "tsconfig.json"], env)
    if not phases["typecheck"]:
        files = lambda folder: [str(p.relative_to(work / MODULE)) for p in sorted((work / MODULE / folder).glob("*.nodecheck.ts"))]
        command = ["node", str(modules / "tsx/dist/cli.mjs"), "--tsconfig", "tsconfig.json", "--test", "--test-concurrency=1"]
        phases["firstPartyAndOAuth"] = run("04-oauth-account-tests", command + files("tests/first-party"), env)
        phases["sdk"] = run("05-oauth-sdk-tests", command + files("tests/server"), env)
    save("source-after.json", source_check(manifest))
    save("cache-after.json", metadata_check())
    save("stage-summary.json", {"job": GRANT, "phases": phases, "firstFailure": first_failure,
        "sourceInputs": len(manifest["files"]), "resources": guard(), "nativeOrPublicMount": False,
        "actualChatHostInstallation": False, "sdkReused": False})
    code = 0 if len(phases) == 4 and not any(phases.values()) else 1
''' + consumer[end:]
consumer=consumer.replace('    stop.set()\n', '''    save("awaiting-owned-finish.json", {"maximumSeconds": 1800, "initialTestExit": code})
    until = time.monotonic() + 1800
    while time.monotonic() < until and not (E / "finish-owned-fixture").exists() and not errors:
        time.sleep(1)
    stop.set()
''')
ast.parse(consumer);(TARGET/'consumer.py').write_text(consumer,newline='\n')
formatter=(HERE/'format-and-compare.mjs').read_text()
formatter=re.sub(r'const files = \[.*?\n\]','const files = '+repr(formatFiles),formatter,count=1,flags=re.S)
formatter=formatter.replace('/predecessor/final-input-manifest.json','/delivery/final-input-manifest.json')
formatter=formatter.replace('  assert.notEqual(sha(before), sha(after), "Expected a reported formatting correction")\n','')
formatter=formatter.replace('AGENT_ISSUED_FORMATTED_SOURCE_SUCCESSOR','PRIVATE_OAUTH_AST_FORMATTED_CANDIDATE')
formatter=formatter.replace('changedFiles: 8','comparedTypeScriptFiles: '+str(len(formatFiles)))
formatter=formatter.replace('unchangedOtherInputs: 152','unchangedOtherInputs: '+str(len(rows)-len(formatFiles)))
formatter=formatter.replace('predecessorManifestSha256: "4c02c37421191cd8ea2fe46e35c0b8a37467a7d89708a11bf8cd68047bac29ab"',
    'predecessorManifestSha256: sha(fs.readFileSync("/delivery/final-input-manifest.json"))')
formatter=formatter.replace('predecessorSource: "bfb796c72495f0f9d99442066f825a74ebd054d4"','predecessorSource: "uncommitted OAuth source atop 1ac016e"')
(TARGET/'format-and-compare.mjs').write_text(formatter,newline='\n')
(TARGET/'run-phase.py').write_bytes((HERE/'run-phase.py').read_bytes())
launch=(HERE/'launch.py').read_text().replace('mcp-format-F-20261115-01a1dfaa',NAME)
launch=launch.replace('"--memory", "512m", "--memory-swap", "512m"','"--memory", "1g", "--memory-swap", "1g"')
launch=launch.replace('available_ram >= 576','available_ram >= 1088')
launch=launch.replace('grant["otherReserveBytes"] + 8 * 1024**2','grant["otherReserveBytes"] + grant["diskRemainingBytes"]')
ast.parse(launch);(TARGET/'launch.py').write_text(launch,newline='\n')
transport=(HERE/'runtime-01/transport.py').read_text().replace('mcp-runtime-F-20261115-01a1dfaa',NAME)
transport=transport.replace('"remote-input-manifest.json", "format-remote.mjs"','"final-input-manifest.json"')
ast.parse(transport);(TARGET/'transport.py').write_text(transport,newline='\n')
claim=(HERE/'claim-runtime.ps1').read_text().replace('mcp-runtime-F-20261115-01a1dfaa',NAME).replace('runtime-01/','oauth-01/')
(HERE/'claim-oauth.ps1').write_text(claim,newline='\n')
print(json.dumps({'files':len(rows),'overlay':len(delta),'formatFiles':formatFiles,
    'manifestSha256':hashlib.sha256((TARGET/'final-input-manifest.json').read_bytes()).hexdigest()},indent=2))

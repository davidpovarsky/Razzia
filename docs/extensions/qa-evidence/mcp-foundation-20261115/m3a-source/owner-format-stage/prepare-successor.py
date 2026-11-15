"""Prepare a format-only successor. Never executes the preserved old dispatcher."""
import ast
import hashlib
import json
import os
from pathlib import Path

HERE = Path(__file__).resolve().parent
PRIOR = HERE.parent / "review-corrections/actual-producer-compatibility/server-validation"
THREAD = os.environ["CODEX_THREAD_ID"]
assert THREAD == "01a1dfaa-0f10-77b2-aa65-462ca5fe0a90"
NAME = "mcp-format-F-20261115-01a1dfaa"
sha = lambda data: hashlib.sha256(data).hexdigest()
old = (HERE / "consumer.py").read_bytes()
backup = HERE / "consumer.pre-restart.py.disabled"
if not backup.exists():
    backup.write_bytes(old)
else:
    assert backup.read_bytes() == (PRIOR / "consumer.py").read_bytes()
source = (PRIOR / "consumer.py").read_text()
source = source.replace('"""SERVER ONLY: one bound bfb160 run, fresh RAM, eight MiB physical allowance."""',
    '"""Format-only successor: isolated copy, eight AST-equal edits, TC and scoped tests."""')
source = source.replace('GRANT = "hq-mcp-bfb-87ffbfdbe45d43fdbe5e7f799c18036d"', 'GRANT = "' + NAME + '"')
source = source.replace('required = (2048 + 200 + 64) * 1024**2 + max(0, CAP - owned)',
    'required = int(json.loads((D / "activation.json").read_text())["otherReserveBytes"]) + max(0, CAP - owned)')
source = source.replace('grant = json.loads((D / "grant.json").read_text())\n    assert grant["grant_id"] == GRANT and grant["execution_authorized"] and grant["manifest160_sha256"] == MANIFEST_SHA\n    assert grant["new_additional_physical_mib_max"] == 8',
    'activation = json.loads((D / "activation.json").read_text())\n    assert activation["threadId"] == "' + THREAD + '"\n    assert activation["job"] == GRANT and activation["ownerActivation"] == "SINGLE_MANAGER_WAVE_RESTART_20261115"')
source = source.replace('"/all-own-source", "/all-own-evidence"]', '"/all-own-source", "/all-own-evidence", "/predecessor"]')
source = source.replace('D / "final-input-manifest.json"', 'Path("/predecessor/final-input-manifest.json")')
source = source.replace('sources = [D / "app",', 'sources = [Path("/predecessor/app"),')
start = source.index('    phases = {}')
end = source.index('    save("cache-after.json"', start)
source = source[:start] + '''    phases = {}
    phases["semanticFormat"] = run("02-semantic-format", ["node", "/delivery/format-and-compare.mjs"], env)
    if phases["semanticFormat"]:
        raise RuntimeError("Eight-file AST comparison failed; dependent phases not run")
    manifest = json.loads((E / "formatted-input-manifest.json").read_text())
    phases["typecheck"] = run("03-typecheck", ["pnpm", "run", "typecheck"], env)
    phases["firstParty34"] = run("04-first-party", ["pnpm", "run", "test:first-party"], env)
    phases["actualProducerCompatibility"] = run("05-actual-producer", ["pnpm", "exec", "tsx",
        "--tsconfig", "tsconfig.json", "tests/first-party/compatibility.observation.ts"], env)
    formatter = "/cleanup/node_modules/prettier/bin/prettier.cjs"
    assert Path(formatter).is_file()
    save("format-options.json", {"semi": False, "tabWidth": 2, "singleQuote": False,
        "printWidth": 80, "trailingComma": "all"})
    format_paths = [path.removeprefix(MODULE) for path in manifest["deltaPaths"]
        if path.startswith(MODULE) and "/ad895-producer/" not in path]
    assert len(format_paths) == 12
    phases["format"] = run("06-format", ["node", formatter, "--config", "/evidence/format-options.json",
        "--check", *format_paths], env)
    save("source-after.json", source_check(manifest))
''' + source[end:]
source = source.replace('manifest["candidateCommit"]', 'manifest.get("predecessorSource", "bfb796c72495f0f9d99442066f825a74ebd054d4")')
source = source.replace('"sourceInputsUnchanged": 160', '"unchangedOtherInputs": 152, "formattedAstEqualInputs": 8')
ast.parse(source)
(HERE / "consumer.py").write_text(source, newline="\n")
formatter = (HERE / "format-and-compare.mjs").read_text()
formatter = formatter.replace('/delivery/final-input-manifest.json', '/predecessor/final-input-manifest.json')
formatter = formatter.replace('01a1dd19-f64c-7193-8a74-9ad7b2c66e2d', THREAD)
formatter = formatter.replace('owner-urgent-management-correction-20261115', 'SINGLE_MANAGER_WAVE_RESTART_20261115')
(HERE / "format-and-compare.mjs").write_text(formatter, newline="\n")
launch = (PRIOR / "launch.py").read_text().replace('mcp-bfb160-87ffbfdbe45d43fdbe5e7f799c18036d', NAME)
launch = launch.replace('tadazz-hq-mcp-bfb160-87ffbfdbe45d', 'tadazz-hq-' + NAME)
start = launch.index('grant = ')
end = launch.index('descriptor = ', start)
launch = launch[:start] + 'grant = json.loads((SOURCE / "activation.json").read_text())\nassert grant["threadId"] == "' + THREAD + '"\n' + launch[end:]
launch = launch.replace('assert free >= 2320 * 1024**2', 'assert free >= grant["otherReserveBytes"] + 8 * 1024**2')
launch = launch.replace('available_ram >= 2112 * 1024**2', 'available_ram >= 1088 * 1024**2')
launch = launch.replace('"--memory", "2g", "--memory-swap", "2g"', '"--memory", "1g", "--memory-swap", "1g"')
launch = launch.replace('mounts = [', 'mounts = [\n    ("bind", str(BASE / "source/mcp-bfb160-87ffbfdbe45d43fdbe5e7f799c18036d"), "/predecessor", True),')
ast.parse(launch)
(HERE / "launch.py").write_text(launch, newline="\n")
(HERE / "preparation.json").write_text(json.dumps({"threadId": THREAD, "job": NAME,
    "preservedOldDraftSha256": sha(backup.read_bytes()),
    "consumerSha256": sha(source.encode()), "pythonSyntax": "PASS",
    "scope": "Eight authored files only; immutable ad895 snapshots excluded; TC+34+compat executed fresh; SDK41 matched reuse"}, indent=2) + "\n")
print("Prepared", NAME, "without executing application or old dispatcher")

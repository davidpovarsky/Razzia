"""Prepare the same AST-preserving formatter for the new remote source only."""
from pathlib import Path
import re

HERE = Path(__file__).resolve().parent
TARGET = HERE / "runtime-01"
source = (HERE / "format-and-compare.mjs").read_text()
files = ["server/access-token.ts", "server/http.ts", "server/factory.ts",
         "tests/server/access-token.nodecheck.ts", "tests/server/http.nodecheck.ts"]
source = re.sub(r"const files = \[.*?\n\]", "const files = " + repr(files), source, count=1, flags=re.S)
source = source.replace('/predecessor/final-input-manifest.json', '/delivery/remote-input-manifest.json')
source = source.replace('  assert.notEqual(sha(before), sha(after), "Expected a reported formatting correction")\n', '')
source = source.replace('/evidence/formatted', '/evidence/remote-formatted')
source = source.replace('AGENT_ISSUED_FORMATTED_SOURCE_SUCCESSOR', 'REMOTE_CANDIDATE_AST_FORMAT_SUCCESSOR')
source = source.replace('deltaPaths: manifest.deltaPaths', 'overlayPaths: manifest.overlayPaths')
source = source.replace('changedFiles: 8', 'comparedTypeScriptFiles: 5')
source = source.replace('unchangedOtherInputs: 152', 'unchangedOtherInputs: 160')
(TARGET / "format-remote.mjs").write_text(source, newline="\n")
print("Prepared five-file remote-source formatter; application not imported")

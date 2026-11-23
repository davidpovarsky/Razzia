"""Capture actual D/E/manager source seams without mutation or test reruns."""
from pathlib import Path
from datetime import datetime, timezone
import base64
import hashlib
import json
import subprocess

BASE = Path('C:/Users/DAVID/Code/Razzia-worktrees')
OUT = Path(__file__).resolve().parent
REPORT = OUT / 'SOURCE_SNAPSHOT.json'
assert not REPORT.exists()
targets = {
    'D': ('tadazz-hq-show-library-20261115', [
        'extensions/src/core/show-library/composition-preview-v2.ts',
        'extensions/src/core/show-library/native-preview-renderer-v2.ts',
        'extensions/src/core/show-library/native-preview-renderer-v2-schema.ts',
        'extensions/src/core/show-library/manifest.ts',
    ]),
    'E': ('tadazz-hq-show-ui-20261115', [
        'extensions/src/components/theme-builder/PreviewPanel.tsx',
        'extensions/src/components/theme-builder/PreviewControls.tsx',
        'extensions/src/presentation/show-library-preview/PreviewStageHost.tsx',
        'extensions/src/presentation/show-library-preview/renderer-entry-v2.tsx',
        'extensions/src/presentation/show-library-preview/native-theme-admission-v2.ts',
    ]),
    'manager': ('tadazz-hq-integration-20261115', [
        'extensions/src/mcp-app/server/dependencies.ts',
        'extensions/src/mcp-app/server/preview.ts',
        'extensions/src/mcp-app/server/composition-preview-v2.ts',
        'extensions/src/mcp-app/contracts/canonical.ts',
    ]),
}
records = []
for lane, (tree, paths) in targets.items():
    root = BASE / tree
    head_before = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip()
    files = []
    for name in paths:
        body = (root / name).read_bytes()
        tracked = subprocess.run(['git', 'show', head_before + ':' + name], cwd=root, capture_output=True)
        files.append({'path': name, 'bytes': len(body), 'sha256': hashlib.sha256(body).hexdigest(), 'bodyBase64': base64.b64encode(body).decode(), 'matchesHeadGitBlob': tracked.returncode == 0 and tracked.stdout == body})
    unchanged = all((root / entry['path']).read_bytes() == base64.b64decode(entry['bodyBase64']) for entry in files)
    head_after = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip()
    records.append({'lane': lane, 'worktree': str(root), 'headBefore': head_before, 'headAfter': head_after, 'headUnchangedDuringCapture': head_before == head_after, 'fileBytesUnchangedDuringCapture': unchanged, 'files': files})
report = {'capturedUtc': datetime.now(timezone.utc).isoformat(), 'kind': 'READ_ONLY_SOURCE_SEAM_OBSERVATION_NOT_EXECUTION_ACCEPTANCE', 'sources': records, 'testsRun': 0, 'sourceMutations': 0, 'runtimePinsAdded': 0, 'remoteJobs': 0, 'networkRequests': 0}
REPORT.write_bytes((json.dumps(report, indent=2) + '\n').encode())
assert all(record['headUnchangedDuringCapture'] and record['fileBytesUnchangedDuringCapture'] for record in records)
print(json.dumps([{'lane': record['lane'], 'head': record['headBefore'], 'files': len(record['files']), 'matchingGitBlobs': sum(entry['matchesHeadGitBlob'] for entry in record['files']), 'bytesUnchangedDuringCapture': record['fileBytesUnchangedDuringCapture']} for record in records]))

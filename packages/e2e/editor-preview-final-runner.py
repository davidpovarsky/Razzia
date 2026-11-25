"""Run the editor browser evidence drivers from this checkout."""

import os
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[2]
NODE = os.environ.get("TADAZZ_QA_NODE", "node")

for name in ['editor-live-preview-audit.mjs', 'editor-live-preview-mixed-audit.mjs']:
    subprocess.run([NODE, str(ROOT / "packages/e2e" / name)],
                   cwd=ROOT / "packages/e2e", check=True)

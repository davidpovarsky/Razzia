"""Local transport of a bounded read-only release inspection."""
import json
from pathlib import Path
import subprocess

here = Path(__file__).resolve().parent
ssh = ["ssh", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", "-o", "ConnectTimeout=10",
       "-i", "C:/Users/DAVID/.ssh/tadazz_oracle_2026", "ubuntu@132.145.25.168", "python3 -"]
result = subprocess.run(ssh, input=(here / "release-server.py").read_text(encoding="utf-8"), text=True, capture_output=True)
(here / "release-transport.json").write_text(json.dumps({"exit": result.returncode, "stdout": result.stdout, "stderr": result.stderr}, indent=2) + "\n", encoding="utf-8")
print(result.stdout)
if result.returncode:
    print(result.stderr)
raise SystemExit(result.returncode)

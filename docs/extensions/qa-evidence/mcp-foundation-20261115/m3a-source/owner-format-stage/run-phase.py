"""Bound captured command output, never RLIMIT_FSIZE of real dependency files."""
import hashlib
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import threading
import time

name, *command = sys.argv[1:]
if not command or "/" in name or name.startswith("."):
    raise SystemExit("Owned phase name and command required")
root = Path("/evidence")
limit = 1024 * 1024
written = observed = 0
overflow = False
timer = None
started = time.time()
process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, start_new_session=True)


def kill_group(sig):
    try: os.killpg(process.pid, sig)
    except ProcessLookupError: pass


with (root / (name + ".log")).open("wb") as output:
    for chunk in iter(lambda: process.stdout.read(65536), b""):
        observed += len(chunk)
        allowed = max(0, limit - 128 - written)
        if allowed:
            part = chunk[:allowed]
            output.write(part)
            output.flush()
            written += len(part)
        if observed > limit - 128 and not overflow:
            overflow = True
            kill_group(signal.SIGTERM)
            timer = threading.Timer(2, kill_group, [signal.SIGKILL])
            timer.start()
    if overflow:
        output.write(b"\n[LOG LIMIT EXCEEDED: command terminated; captured output is partial]\n")
code = process.wait()
if timer: timer.cancel()
shell_code = 125 if overflow else code if code >= 0 else 128 - code
result = {"command": command, "actualReturnCode": code, "shellExit": shell_code,
          "seconds": round(time.time() - started, 3), "outputLimitBytes": limit,
          "logTruncated": overflow, "observedOutputBytes": observed,
          "logSha256": hashlib.sha256((root / (name + ".log")).read_bytes()).hexdigest()}
(root / (name + ".exit")).write_text(str(shell_code) + "\n")
(root / (name + ".json")).write_text(json.dumps(result, indent=2) + "\n")
print(name, json.dumps(result), flush=True)
raise SystemExit(shell_code)

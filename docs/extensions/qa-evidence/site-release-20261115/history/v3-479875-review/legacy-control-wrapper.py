#!/usr/bin/env python3
"""Review-only cooperating legacy entrypoint; never installed or enabled.

The permanent legacy hold deliberately cannot be cleared by this wrapper.
Legacy descendants cannot yet be proven quiescent after coordinator loss.
"""
import hashlib
import importlib.util
import json
import os
import re
from pathlib import Path
import stat
import subprocess
import sys
import uuid

WRAPPER_GATE = False
LEGACY = {
    "legacy-20261110": ("/home/ubuntu/tadazz-unified-site-20261110-eeb973e/deploy-unified-site.py",
                         "82428d8259695b33eedd0997fccbf8a50da6fb965928a2a93175d04226d56113"),
    "legacy-20261112": ("/home/ubuntu/tadazz-unified-site-20261112-bff12a6/deploy-unified-site.py",
                         "82428d8259695b33eedd0997fccbf8a50da6fb965928a2a93175d04226d56113"),
}


def main(args):
    if not WRAPPER_GATE:
        raise ValueError("legacy wrapper review gate closed")
    if len(args) != 1 or args[0] not in {*LEGACY, "manual-start", "manual-stop", "manual-restart"}:
        raise ValueError("expected an exact approved cooperating action")
    spec = importlib.util.spec_from_file_location("atomic_reviewed", Path(__file__).with_name("atomic-web-publish.py"))
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    with module.DurableHold(module.LOCK_DIR, module.LOCK_NAME, owner_uid=1001) as hold:
        if hold.read() is not None:
            raise ValueError("existing operation hold")
        control = Path(module.LOCK_DIR)
        lease_raw = module.read_regular(control / "hq-lease.json", 65536, operator=control)
        lease = json.loads(lease_raw)
        wrapper_hash = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
        if (not isinstance(lease, dict) or lease.get("targetId") != module.CONTAINER
                or lease.get("image") != module.IMAGE or lease.get("started") != module.STARTED
                or lease.get("wrapper") != wrapper_hash
                or not isinstance(lease.get("nonce"), str)
                or not re.fullmatch(r"[0-9a-f]{32}", lease["nonce"])
                or not isinstance(lease.get("actions"), list) or args[0] not in lease["actions"]):
            raise ValueError("manager lease missing or does not match")
        module.inspect_identity()
        expected = None
        if args[0] in LEGACY:
            script, expected = LEGACY[args[0]]
            fd = os.open(script, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
            try:
                st = os.fstat(fd)
                if not stat.S_ISREG(st.st_mode) or st.st_size > 1024 * 1024:
                    raise ValueError("unsafe legacy script")
                h = hashlib.sha256()
                while True:
                    chunk = os.read(fd, 65536)
                    if not chunk:
                        break
                    h.update(chunk)
                if h.hexdigest() != expected:
                    raise ValueError("legacy script hash mismatch")
            finally:
                os.close(fd)
            command = ["python3", script]
        else:
            command = ["docker", args[0].removeprefix("manual-"), module.CONTAINER]
        hold.create({"phase": "legacy-unresolved", "nonce": uuid.uuid4().hex,
                     "action": args[0], "scriptHash": expected,
                     "targetId": module.CONTAINER, "leaseHash": hashlib.sha256(lease_raw).hexdigest(),
                     "wrapperHash": wrapper_hash})
        # The permanent hold survives wrapper/host loss; no auto-clear path.
        return subprocess.run(command, check=False).returncode


if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv[1:]))
    except Exception as error:
        print(type(error).__name__, file=sys.stderr)
        sys.exit(1)

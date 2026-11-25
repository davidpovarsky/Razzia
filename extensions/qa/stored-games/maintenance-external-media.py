"""Specific, private Example image repair; production writes require a stopped service.

Qualification sequence (production may continue running):
  plan --work /home/ubuntu/tadazz-example-media-repair-<hex>
       --backup-config INDEPENDENTLY_RESTORED_BACKUP ...
  qualify --plan WORK/plan.json --plan-sha256 SHA --backup-config VERIFIED_CLONE
  apply --plan WORK/plan.json --plan-sha256 SHA
        --qualification WORK/qualify/receipt.json --qualification-sha256 SHA

plan binds the exact production identity and an independently restored private
backup. qualify copies that backup into its own clone and uses the real candidate
native services without pausing production. apply requires identical input bytes,
the successful matching qualification, and exclusive stopped-app maintenance.
It never starts/stops production or restores customer files automatically.
Any failed apply requires recovery review before the caller restarts a service.
Pass --lock-fd for a deployment wrapper's inherited, already-held lock descriptor.
All plans/results/logs remain mode 0600 inside a new private mode-0700 directory.
"""
import argparse
import contextlib
import datetime as dt
import fcntl
import hashlib
import io
import json
import os
import pathlib
import re
import shutil
import signal
import sqlite3
import stat
import subprocess
import sys
import tarfile
import tempfile
import uuid

PNG_SHA = "80899a7fbb91160fc4c494f22c31dfd8face8c47b189d2528e6471f1f2207bcf"
PNG_SIZE = 7347
SOURCE_URL = "https://placehold.co/600x400.png"
QUIZ_ID = "TwGGo21j0nTD9XoSZAFzZ"
CONFIG_ROOT = pathlib.Path("/var/lib/tadazz-release-5312660/config")
DEPLOY_LOCK = pathlib.Path("/run/lock/tadazz-mcp-deploy.lock")
TOOLCHAIN_ID = "07b64bb4f99518e306a2e3f5a693266a6ca543fdd1676627161af7077e818872"
TOOLCHAIN_IMAGE = "sha256:612033cbc08ff303d04e2e7f9782a67bc03acfbcbe6141316296f0c056daf647"
MCP_DEPS = pathlib.Path("/home/ubuntu/tadazz-phase2-20261116/evidence/tadazz-codex-browser-c4125d58a746-8e0c29d3/mcp-deps")
MCP_DEPS_SHA = "0d1e3e9c089b66a75ff0e6b284f58b94ddb4e4b47b55129d82865980f62d67de"
NATIVE_FILE = "extensions/qa/stored-games/maintenance-external-media.mjs"
CONTROLLER_FILE = "extensions/qa/stored-games/maintenance-external-media.py"
HEX = re.compile(r"[a-f0-9]{64}\Z")
UUID = re.compile(r"[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\Z", re.I)


class GateError(Exception):
    pass


def require(condition, code):
    if not condition:
        raise GateError(code)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def encoded(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":")).encode()


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def private_write(file, value):
    data = json.dumps(value, indent=2, ensure_ascii=False).encode() + b"\n"
    fd = os.open(file, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "wb") as handle:
        handle.write(data)
        handle.flush()
        os.fsync(handle.fileno())
    descriptor = os.open(pathlib.Path(file).parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)
    return sha(data)


def safe_directory(path):
    path = pathlib.Path(path)
    require(path.is_absolute() and ".." not in path.parts, "ABSOLUTE_PATH_REQUIRED")
    for item in reversed([path, *path.parents]):
        info = item.lstat()
        require(stat.S_ISDIR(info.st_mode), "DIRECTORY_SYMLINK_OR_TYPE_REJECTED")
    return path


def read_file(path, limit=2 * 1024**3):
    path = pathlib.Path(path)
    safe_directory(path.parent)
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        before = os.fstat(fd)
        require(stat.S_ISREG(before.st_mode) and before.st_size <= limit, "FILE_TYPE_OR_SIZE_REJECTED")
        with os.fdopen(fd, "rb", closefd=False) as handle:
            data = handle.read(limit + 1)
        after = os.fstat(fd)
        current = path.lstat()
        key = lambda s: (s.st_dev, s.st_ino, s.st_size, s.st_mtime_ns, s.st_mode, s.st_uid, s.st_gid)
        require(len(data) == before.st_size and key(before) == key(after) == key(current), "FILE_CHANGED_DURING_READ")
        return data
    finally:
        os.close(fd)


def inventory(root):
    root = safe_directory(root)
    records = {}
    total = 0
    for directory, names, files in os.walk(root, followlinks=False):
        directory = pathlib.Path(directory)
        for item in [directory, *(directory / name for name in files)]:
            info = item.lstat()
            relative = str(item.relative_to(root))
            record = {"mode": stat.S_IMODE(info.st_mode), "uid": info.st_uid, "gid": info.st_gid}
            if stat.S_ISDIR(info.st_mode):
                record["kind"] = "directory"
            else:
                require(stat.S_ISREG(info.st_mode), "CONFIG_SPECIAL_FILE_REJECTED")
                data = read_file(item)
                record.update(kind="file", bytes=len(data), sha256=sha(data))
                total += len(data)
            records[relative] = record
            require(len(records) <= 20000 and total <= 2 * 1024**3, "CONFIG_INVENTORY_LIMIT")
        for name in names:
            require(not (directory / name).is_symlink(), "CONFIG_DIRECTORY_SYMLINK_REJECTED")
    return {"sha256": sha(encoded(records)), "bytes": total, "entries": records}


def docker(*arguments):
    result = subprocess.run(["docker", *arguments], stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=30)
    require(result.returncode == 0, "DOCKER_READ_OR_OPERATION_FAILED")
    return result.stdout


def inspect(container):
    require(HEX.fullmatch(container), "EXACT_CONTAINER_ID_REQUIRED")
    result = json.loads(docker("inspect", container))
    require(len(result) == 1 and result[0]["Id"] == container, "CONTAINER_IDENTITY_CHANGED")
    return result[0]


def production_identity(container, image, stopped=True):
    facts = inspect(container)
    require(not facts["State"].get("Restarting") and not facts["State"].get("Paused"), "PRODUCTION_STATE_UNSTABLE")
    require(not stopped or not facts["State"]["Running"], "PRODUCTION_MUST_BE_STOPPED")
    require(facts["Name"] == "/tadazz" and facts["Image"] == image, "PRODUCTION_IMAGE_OR_NAME_CHANGED")
    mounts = facts["Mounts"]
    require(len(mounts) == 1 and mounts[0]["Type"] == "bind" and mounts[0]["Destination"] == "/app/config" and mounts[0]["Source"] == str(CONFIG_ROOT) and mounts[0]["RW"] is True, "PRODUCTION_CONFIG_BINDING_CHANGED")
    entries = [value.split("=", 1) for value in facts["Config"].get("Env", []) if "=" in value]
    env = dict(entries)
    require(len(entries) == len(env), "PRODUCTION_ENVIRONMENT_DUPLICATE")
    require(env.get("TADAZZ_ACCOUNTS_ENABLED") == "true" and env.get("CONFIG_PATH") == "/app/config", "VERIFIED_ACCOUNT_SCOPE_REQUIRED")
    require(facts["Config"].get("User", "") in (None, "", "0", "0:0", "root"), "MAINTENANCE_USER_REQUIRES_REVIEW")
    info = safe_directory(CONFIG_ROOT).stat()
    return {"container": container, "image": image, "startedAt": facts["State"]["StartedAt"], "revision": facts["Config"].get("Labels", {}).get("org.opencontainers.image.revision"), "configRoot": str(CONFIG_ROOT), "directoryIdentity": {"dev": info.st_dev, "ino": info.st_ino}, "restartCount": facts["RestartCount"]}


def no_other_config_writer(root, excluded=()):
    ids = docker("ps", "--no-trunc", "--quiet").decode().split()
    if not ids:
        return
    for item in json.loads(docker("inspect", *ids)):
        if item["Id"] in excluded:
            continue
        for mount in item.get("Mounts", []):
            if mount.get("Type") != "bind" or not mount.get("RW"):
                continue
            source = pathlib.Path(mount["Source"])
            require(source != root and source not in root.parents and root not in source.parents, "OTHER_RUNNING_CONFIG_WRITER")


@contextlib.contextmanager
def deployment_lock(inherited):
    owned = inherited is None
    if owned:
        fd = os.open(DEPLOY_LOCK, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    else:
        fd = inherited
    try:
        info, named = os.fstat(fd), DEPLOY_LOCK.lstat()
        require(stat.S_ISREG(info.st_mode) and info.st_nlink == 1 and info.st_uid == 0 and stat.S_IMODE(info.st_mode) == 0o600 and (info.st_dev, info.st_ino) == (named.st_dev, named.st_ino), "DEPLOYMENT_LOCK_UNSAFE")
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise GateError("DEPLOYMENT_LOCK_BUSY") from error
        yield
    finally:
        if owned:
            os.close(fd)


def verify_source(source):
    root = safe_directory(source["root"])
    require(NATIVE_FILE in source["files"], "NATIVE_HELPER_NOT_IN_CANDIDATE_MANIFEST")
    require(source["files"].get(CONTROLLER_FILE) == sha(read_file(pathlib.Path(__file__).resolve())), "CONTROLLER_DIFFERS_FROM_CANDIDATE")
    for relative, digest in source["files"].items():
        require(isinstance(relative, str) and not pathlib.PurePosixPath(relative).is_absolute() and not any(part in ("", ".", "..") for part in relative.split("/")), "SOURCE_PATH_REJECTED")
        require(HEX.fullmatch(digest) and sha(read_file(root / relative)) == digest, "CANDIDATE_SOURCE_CHANGED")


def deployed_source_binding(source, production):
    require(source["revision"] == production.get("revision"), "REPAIR_SOURCE_DIFFERS_FROM_DEPLOYED_REVISION")


def validate_release_documents(source, production, stage, staged, host, deployed, stage_pin):
    """Bind the existing successful release proof, not a new deployment path."""
    deployed_source_binding(source, production)
    revision, image = source["revision"], production["image"]
    require(stage.get("format") == "tadazz-mcp-stage" and stage.get("version") == 2 and stage.get("sourceSha") == revision and stage.get("imageId") == image, "RELEASE_STAGE_IDENTITY_CHANGED")
    run = stage.get("sourceRun", "")
    require(re.fullmatch(r"tadazz-codex-" + revision[:12] + r"-[a-f0-9]{8}", run) and pathlib.Path(source["root"]).name == "source" and pathlib.Path(source["root"]).parent.name == run, "RELEASE_SOURCE_RUN_CHANGED")
    require(staged.get("ok") is True and staged.get("sourceSha") == revision and staged.get("imageId") == image and staged.get("stageManifestSha256") == stage_pin and staged.get("syntheticSmokePassed") is True and staged.get("runningContainersUnchanged") is True and staged.get("productionTouched") is False and staged.get("customerMountUsed") is False, "SUCCESSFUL_STAGE_PROOF_REQUIRED")
    require(host.get("sha") == revision and host.get("run") == run and host.get("suite") == "native-launch" and host.get("allHashesVerifiedBeforeAfter") is True and host.get("hashesBefore") == source["files"] and host.get("hashesAfter") == source["files"] and not host.get("changedSourcePaths") and host.get("productionChanged") is False and host.get("customerMountAccessed") is False, "QUALIFIED_SOURCE_PROOF_CHANGED")
    checks = host.get("checks")
    require(isinstance(checks, list) and checks and all(type(item.get("exit")) is int and item["exit"] == 0 for item in checks) and {"native-launch-build", "native-site-build"}.issubset({item.get("label") for item in checks}), "QUALIFIED_SOURCE_BUILD_NOT_PASSED")
    require(deployed.get("version") == 1 and deployed.get("success") is True and deployed.get("phase") == "verified" and deployed.get("revision") == revision and deployed.get("image") == image and deployed.get("replacementContainer") == production["container"] and deployed.get("mountsUnchanged") is True and deployed.get("hostConfigurationUnchanged") is True and deployed.get("otherContainersUnchanged") is True and deployed.get("customerContentPrinted") is False and deployed.get("dataRestorePerformed") is False and not deployed.get("rolledBack"), "SUCCESSFUL_EXACT_DEPLOYMENT_REQUIRED")
    backend = stage.get("backendSha256")
    size = stage.get("artifactBytes", {}).get("socket/index.cjs")
    require(isinstance(backend, str) and HEX.fullmatch(backend) and stage.get("artifacts", {}).get("socket/index.cjs") == backend and staged.get("backendSha256") == backend and type(size) is int and 0 < size < 8 * 1024**2, "QUALIFIED_BACKEND_PIN_CHANGED")
    return backend, size


def pinned_proof_file(path, pin):
    path = pathlib.Path(path)
    raw = read_file(path, 16 * 1024**2)
    info = path.lstat()
    require(info.st_uid == 0 and info.st_nlink == 1 and not stat.S_IMODE(info.st_mode) & 0o022, "RELEASE_PROOF_FILE_UNSAFE")
    require(isinstance(pin, str) and HEX.fullmatch(pin) and sha(raw) == pin, "RELEASE_PROOF_HASH_CHANGED")
    return json.loads(raw)


def verify_release_proof(proof, source, production):
    stage_path = pathlib.Path(proof["stageManifest"]["path"])
    stage_root = stage_path.parent
    require(stage_path.name == "stage-manifest.json" and re.fullmatch(r"/home/ubuntu/tadazz-mcp-(?:candidate|release)-[a-zA-Z0-9-]+", str(stage_root)), "RELEASE_STAGE_PATH_REJECTED")
    require(pathlib.Path(proof["stageResult"]["path"]) == stage_root / "stage-result.json" and pathlib.Path(proof["hostReceipt"]["path"]) == stage_root / "evidence/host-receipt.json", "RELEASE_PROOF_PATH_CHANGED")
    deployment = pathlib.Path(proof["deploymentReceipt"]["path"])
    require(deployment.name == "deployment-result.json" and deployment.parent.parent == stage_root and re.fullmatch(r"deployment-[0-9]{8}T[0-9]{6}Z-[a-f0-9]{8}", deployment.parent.name), "DEPLOYMENT_PROOF_PATH_CHANGED")
    documents = {key: pinned_proof_file(pathlib.Path(item["path"]), item["sha256"]) for key, item in proof.items()}
    stage = documents["stageManifest"]
    require(stage.get("receiptSha256", {}).get("host") == proof["hostReceipt"]["sha256"], "STAGED_HOST_RECEIPT_PIN_CHANGED")
    backend, size = validate_release_documents(source, production, stage, documents["stageResult"], documents["hostReceipt"], documents["deploymentReceipt"], proof["stageManifest"]["sha256"])
    # An image label alone is not the build proof: read the actual deployed
    # compiled backend without running any application code or writing files.
    archive_bytes = docker("cp", production["container"] + ":/app/socket/index.cjs", "-")
    require(len(archive_bytes) <= 9 * 1024**2, "DEPLOYED_BACKEND_ARCHIVE_LIMIT")
    with tarfile.open(fileobj=io.BytesIO(archive_bytes), mode="r:") as archive:
        members = archive.getmembers()
        require(len(members) == 1 and members[0].name == "index.cjs" and members[0].isfile() and members[0].size == size, "DEPLOYED_BACKEND_ARCHIVE_CHANGED")
        stream = archive.extractfile(members[0])
        require(stream is not None and sha(stream.read(size + 1)) == backend, "DEPLOYED_BACKEND_BYTES_CHANGED")


def admit_release_proof(args, source, production):
    stage_path = pathlib.Path(args.stage_manifest)
    require(stage_path.name == "stage-manifest.json" and re.fullmatch(r"/home/ubuntu/tadazz-mcp-(?:candidate|release)-[a-zA-Z0-9-]+", str(stage_path.parent)), "RELEASE_STAGE_PATH_REJECTED")
    stage = pinned_proof_file(stage_path, args.stage_manifest_sha256)
    result = stage_path.parent / "stage-result.json"
    proof = {
        "stageManifest": {"path": str(stage_path), "sha256": args.stage_manifest_sha256},
        "stageResult": {"path": str(result), "sha256": sha(read_file(result, 16 * 1024**2))},
        "hostReceipt": {"path": str(stage_path.parent / "evidence/host-receipt.json"), "sha256": stage.get("receiptSha256", {}).get("host")},
        "deploymentReceipt": {"path": args.deployment_receipt, "sha256": args.deployment_receipt_sha256},
    }
    verify_release_proof(proof, source, production)
    return proof


def verify_toolchain():
    facts = inspect(TOOLCHAIN_ID)
    require(facts["Image"] == TOOLCHAIN_IMAGE, "TOOLCHAIN_IMAGE_CHANGED")
    root = safe_directory(pathlib.Path("/var/lib/docker/rootfs/overlayfs") / TOOLCHAIN_ID / "cleanup")
    entries = {str(p.relative_to(MCP_DEPS)): ("link:" + str(p.readlink()) if p.is_symlink() else sha(read_file(p))) for p in MCP_DEPS.rglob("*") if p.is_file() or p.is_symlink()}
    require(len(entries) == 2042 and sha(json.dumps(entries, sort_keys=True).encode()) == MCP_DEPS_SHA, "QUALIFIED_DEPENDENCIES_CHANGED")
    return root


def canonical_accounts(config, work, expected):
    """Read only a private, byte-verified copy; never open live SQLite writable."""
    folder = pathlib.Path(tempfile.mkdtemp(prefix="account-read-", dir=work))
    names = ["tadazz-accounts.sqlite" + suffix for suffix in ("", "-wal", "-shm", "-journal")]
    pins = {name: expected["entries"].get(name) for name in names}
    require(pins[names[0]] is not None, "CANONICAL_ACCOUNT_STORE_MISSING")
    for name in names:
        pin = pins[name]
        if pin is None:
            continue
        data = read_file(config / name)
        require(pin.get("kind") == "file" and sha(data) == pin["sha256"], "ACCOUNT_STORE_CHANGED")
        (folder / name).write_bytes(data)
        (folder / name).chmod(0o600)
    db = sqlite3.connect((folder / names[0]).as_uri() + "?mode=ro", uri=True)
    try:
        db.execute("PRAGMA query_only=ON")
        require(db.execute("PRAGMA quick_check").fetchone() == ("ok",), "ACCOUNT_COPY_INTEGRITY_FAILED")
        rows = db.execute("SELECT id, verified_at, disabled FROM accounts").fetchall()
        require(all(isinstance(owner, str) and UUID.fullmatch(owner) and (verified is None or type(verified) is int and verified > 0) and type(disabled) is int and disabled in (0, 1) for owner, verified, disabled in rows), "CANONICAL_OWNER_STATE_INVALID")
        require(len({owner for owner, _, _ in rows}) == len(rows), "DUPLICATE_CANONICAL_OWNER")
        # withAccount supplies scope, not account eligibility. Preserve the
        # ordinary native login boundary before any administrative operation.
        return {owner: verified is not None and disabled == 0 for owner, verified, disabled in rows}, sha(encoded(pins))
    finally:
        db.close()
        # Keep the private copy as qualification evidence; it contains no new data.


def target_bindings(config, accounts, owner_hashes, expected_base):
    require(1 <= len(owner_hashes) <= 2 and len(set(owner_hashes)) == len(owner_hashes) and all(HEX.fullmatch(value) for value in owner_hashes), "EXPLICIT_OWNER_SELECTION_REQUIRED")
    targets = []
    for owner_hash in owner_hashes:
        owners = [owner for owner, verified in accounts.items() if verified and sha(owner.encode()) == owner_hash]
        require(len(owners) == 1, "VERIFIED_OWNER_NOT_UNIQUE")
        owner = owners[0]
        root = safe_directory(config / "tenants" / owner)
        require(root.stat().st_uid == 0, "OWNER_FILESYSTEM_USER_REQUIRES_REVIEW")
        found = []
        for file in sorted((root / "quizz").glob("*.json")):
            value = json.loads(read_file(file, 1_048_576))
            require(isinstance(value, dict) and isinstance(value.get("id"), str), "UNRELATED_LEGACY_ID_MIGRATION_RISK")
            if value["id"] == QUIZ_ID:
                found.append((file, value))
        require(len(found) == 1, "QUIZ_PHYSICAL_BINDING_NOT_UNIQUE")
        file, value = found[0]
        require(file.stat().st_nlink == 1 and sha(read_file(file)) == expected_base, "EXPECTED_BASE_CHANGED")
        questions = value.get("questions", [])
        require(len(questions) == 4, "EXAMPLE_SHAPE_CHANGED")
        references = [index for index, question in enumerate(questions) if isinstance(question, dict) and isinstance(question.get("media"), dict) and question["media"].get("url") == SOURCE_URL]
        require(references == [1, 2] and all(questions[index]["media"].get("type") == "image" for index in references), "EXAMPLE_IMAGE_BINDING_CHANGED")
        side = root / "extensions/quizzes" / (QUIZ_ID + ".json")
        side_bytes = read_file(side, 1_048_576) if side.exists() else None
        extras = json.loads(side_bytes) if side_bytes is not None else None
        require(extras is None or extras.get("quizId") == QUIZ_ID and type(extras.get("revision")) is int and extras["revision"] > 0, "SIDECAR_BINDING_REJECTED")
        journal = root / "extensions/quizzes/.journal"
        require(not journal.exists() or not any(p.is_file() for p in journal.rglob("*")), "UNRESOLVED_OWNER_JOURNAL")
        targets.append({"ownerId": owner, "ownerSha256": owner_hash, "quizId": QUIZ_ID, "baseRelative": str(file.relative_to(config)), "baseSha256": expected_base, "sidecarRelative": str(side.relative_to(config)), "sidecarSha256": sha(side_bytes) if side_bytes is not None else None, "expectedRevision": extras["revision"] if extras else None, "questionIndices": references})
    return targets


def read_plan(args):
    raw = read_file(pathlib.Path(args.plan), 4_000_000)
    require(HEX.fullmatch(args.plan_sha256) and sha(raw) == args.plan_sha256, "PLAN_HASH_CHANGED")
    plan = json.loads(raw)
    require(plan["kind"] == "tadazz-example-media-repair-plan" and plan["version"] == 1 and plan["sourceUrl"] == SOURCE_URL, "PLAN_KIND_CHANGED")
    work = safe_directory(pathlib.Path(args.plan).parent)
    require(work == pathlib.Path(plan["work"]) and work.stat().st_uid == 0 and stat.S_IMODE(work.stat().st_mode) == 0o700, "PRIVATE_OPERATION_ROOT_CHANGED")
    require(sha(read_file(work / "source.png", 8000)) == PNG_SHA, "FROZEN_MEDIA_CHANGED")
    deployed_source_binding(plan["source"], plan["production"])
    verify_source(plan["source"])
    verify_release_proof(plan["releaseProof"], plan["source"], plan["production"])
    verify_toolchain()
    return plan, work


def clone_backup(backup, destination, expected):
    backup = safe_directory(backup)
    require(backup != CONFIG_ROOT and CONFIG_ROOT not in backup.parents and backup not in CONFIG_ROOT.parents, "PRODUCTION_IS_NOT_A_BACKUP_CLONE")
    require(inventory(backup)["sha256"] == expected["sha256"], "BACKUP_DOES_NOT_MATCH_PLAN")
    for relative, record in sorted(expected["entries"].items(), key=lambda item: (len(pathlib.PurePosixPath(item[0]).parts), item[0])):
        file = destination / relative
        if record["kind"] == "directory":
            file.mkdir(mode=record["mode"], exist_ok=False)
        else:
            data = read_file(backup / relative)
            require(sha(data) == record["sha256"], "BACKUP_FILE_CHANGED_DURING_COPY")
            with file.open("xb") as handle:
                handle.write(data)
        os.chown(file, record["uid"], record["gid"])
        os.chmod(file, record["mode"])
    require(inventory(backup)["sha256"] == expected["sha256"] and inventory(destination)["sha256"] == expected["sha256"], "BACKUP_CHANGED_DURING_COPY")


def allowed_changes(plan, before, after, native):
    require(native.get("passed") is True and len(native["saves"]) == len(plan["targets"]), "NATIVE_RESULT_INCOMPLETE")
    allowed_files = set()
    allowed_dirs = set()
    media_files = set()
    for target in plan["targets"]:
        saves = [s for s in native["saves"] if s["ownerSha256"] == target["ownerSha256"]]
        require(len(saves) == 1 and saves[0].get("committed") and saves[0].get("nativePreviewVerified"), "OWNER_RESULT_NOT_VERIFIED")
        saved = saves[0]
        media = saved["uploadedAsset"]
        basename = pathlib.PurePosixPath(media["relative"]).name
        require(media["relative"] == "tenants/" + target["ownerId"] + "/media/" + basename and re.fullmatch(r"[A-Za-z0-9_-]+\.png", basename) and media["sha256"] == PNG_SHA and media["bytes"] == PNG_SIZE, "UPLOADED_ASSET_SCOPE_CHANGED")
        require(media["relative"] not in before["entries"], "UPLOAD_OVERWROTE_EXISTING_MEDIA")
        allowed_files.update((target["baseRelative"], target["sidecarRelative"], media["relative"]))
        media_files.add(media["relative"])
        for relative in (target["sidecarRelative"], media["relative"], "tenants/" + target["ownerId"] + "/extensions/quizzes/.journal/marker"):
            allowed_dirs.update(str(parent) for parent in pathlib.PurePosixPath(relative).parents)
        for relative, digest in ((target["baseRelative"], saved["baseSha256"]), (target["sidecarRelative"], saved["sidecarSha256"]), (media["relative"], PNG_SHA)):
            require(after["entries"].get(relative, {}).get("sha256") == digest, "NATIVE_OUTPUT_HASH_CHANGED")
    differences = []
    for relative in before["entries"].keys() | after["entries"].keys():
        old, new = before["entries"].get(relative), after["entries"].get(relative)
        if old == new:
            continue
        require(new is not None, "UNEXPECTED_FILE_REMOVAL")
        if new["kind"] == "directory":
            require(old is None and relative in allowed_dirs, "UNEXPECTED_DIRECTORY_CHANGE")
        else:
            require(relative in allowed_files, "UNRELATED_CONFIG_FILE_CHANGED")
            if old is not None:
                require(all(old[field] == new[field] for field in ("mode", "uid", "gid", "kind")), "EXISTING_FILE_OWNERSHIP_CHANGED")
        differences.append({"pathSha256": sha(relative.encode()), "kind": new["kind"]})
    require(len(media_files) == len(plan["targets"]), "UPLOAD_COUNT_CHANGED")
    return differences


def run_native(plan, work, config, mode, plan_sha, qualified_native=None):
    output = work / mode
    output.mkdir(mode=0o700, exist_ok=False)
    input_dir = work / (mode + "-input")
    input_dir.mkdir(mode=0o700)
    shutil.copyfile(work / "plan.json", input_dir / "plan.json")
    shutil.copyfile(work / "source.png", input_dir / "source.png")
    for file in input_dir.iterdir():
        file.chmod(0o400)
    native_sha = None
    if qualified_native:
        data = read_file(qualified_native, 4_000_000)
        native_sha = sha(data)
        (input_dir / "qualified-native-result.json").write_bytes(data)
        (input_dir / "qualified-native-result.json").chmod(0o400)
    cache = verify_toolchain()
    name = "tadazz-example-media-" + mode + "-" + plan["planId"][:12]
    mounts = [(pathlib.Path(plan["source"]["root"]), "/source", True), (cache, "/cleanup", True), (MCP_DEPS, "/tmp/phase3-999ed90c/deps", True), (input_dir, "/input", True), (output, "/output", False), (config, "/maintenance-config", False)]
    argv = ["run", "--detach", "--pull=never", "--init", "--read-only", "--name", name, "--network", "none", "--user", "0:0", "--cap-drop", "ALL", "--security-opt", "no-new-privileges", "--cpus", "1", "--memory", "1g", "--memory-swap", "1g", "--pids-limit", "128", "--tmpfs", "/tmp:rw,nosuid,nodev,size=268435456", "--label", "com.tadazz.maintenance.external-media-plan=" + plan_sha]
    for origin, target, readonly in mounts:
        argv += ["--mount", "type=bind,source=" + str(origin) + ",target=" + target + (",readonly" if readonly else "")]
    argv += ["--entrypoint", "/bin/sleep", TOOLCHAIN_IMAGE, "infinity"]
    require(not docker("ps", "--all", "--no-trunc", "--quiet", "--filter", "name=^/" + name + "$").strip(), "OWNED_WORKER_NAME_ALREADY_EXISTS")
    private_write(output / "dispatch-intent.json", {"name": name, "planSha256": plan_sha, "image": TOOLCHAIN_IMAGE, "mode": mode, "createdAt": now()})
    cid = docker(*argv).decode().strip()
    require(HEX.fullmatch(cid), "WORKER_ID_REJECTED")
    failure = None
    report = {"kind": "tadazz-example-media-" + mode, "version": 1, "planSha256": plan_sha, "worker": cid, "passed": False, "startedAt": now(), "productionMayHaveChanged": False, "productionStartStopPerformed": False, "committedOwners": None, "possibleOrphanAssets": None}
    try:
        worker = inspect(cid)
        require(worker["Config"].get("Labels", {}).get("com.tadazz.maintenance.external-media-plan") == plan_sha and worker["HostConfig"]["NetworkMode"] == "none" and worker["HostConfig"]["ReadonlyRootfs"], "WORKER_OWNERSHIP_CHANGED")
        actual_mounts = sorted((m["Source"], m["Destination"], m["RW"], m["Type"]) for m in worker["Mounts"])
        expected_mounts = sorted((str(origin), target, not readonly, "bind") for origin, target, readonly in mounts)
        require(actual_mounts == expected_mounts and worker["Image"] == TOOLCHAIN_IMAGE and worker["Config"]["User"] == "0:0", "WORKER_MOUNTS_OR_IMAGE_CHANGED")
        if mode == "apply":
            require(production_identity(plan["production"]["container"], plan["production"]["image"]) == plan["production"], "PRODUCTION_CHANGED_BEFORE_REPAIR")
            no_other_config_writer(CONFIG_ROOT, (cid,))
        else:
            require(all(mount[0] != CONFIG_ROOT and CONFIG_ROOT not in mount[0].parents for mount in mounts), "QUALIFICATION_MOUNTED_PRODUCTION")
        require(inventory(config)["sha256"] == plan["config"]["sha256"], "CONFIG_CHANGED_BEFORE_REPAIR")
        env = {"CONFIG_PATH": "/maintenance-config", "TADAZZ_ACCOUNTS_ENABLED": "true", "TADAZZ_NATIVE_MAINTENANCE_MODE": mode, "TADAZZ_PRIVATE_REPAIR_PLAN_SHA256": plan_sha, "TADAZZ_OWNED_MAINTENANCE_NONCE": plan["planId"], "TSX_DISABLE_CACHE": "1", "TMPDIR": "/tmp", "NODE_OPTIONS": "--max-old-space-size=700"}
        if native_sha:
            env["TADAZZ_QUALIFIED_NATIVE_SHA256"] = native_sha
        command = ["docker", "exec", "--workdir", "/source"]
        for key, value in env.items():
            command += ["--env", key + "=" + value]
        command += [cid, "node", "/cleanup/extensions/node_modules/tsx/dist/cli.mjs", "--tsconfig", "/source/tsconfig.json", "/source/" + NATIVE_FILE]
        if mode == "apply":
            private_write(output / "apply-started.json", {"planSha256": plan_sha, "productionContainer": plan["production"]["container"], "beforeConfigSha256": plan["config"]["sha256"], "worker": cid, "requiresSuccessfulReceiptBeforeRestart": True, "createdAt": now()})
        report["productionMayHaveChanged"] = mode == "apply"
        with (output / "native.stdout.log").open("xb") as stdout, (output / "native.stderr.log").open("xb") as stderr:
            result = subprocess.run(command, stdout=stdout, stderr=stderr, timeout=120)
        raw_native = read_file(output / "native-result.json", 4_000_000)
        native = json.loads(raw_native)
        report["nativeResultSha256"] = sha(raw_native)
        report["committedOwners"] = sum(bool(item.get("committed")) for item in native.get("saves", []))
        report["possibleOrphanAssets"] = sum(bool(item.get("mayBeOrphan")) for item in native.get("saves", []))
        require(result.returncode == 0 and native.get("passed") is True and native.get("planSha256") == plan_sha and native.get("mode") == mode, "NATIVE_REPAIR_FAILED")
        after = inventory(config)
        report["authorizedChanges"] = allowed_changes(plan, plan["config"], after, native)
        report["afterConfigSha256"] = after["sha256"]
        verify_source(plan["source"])
        require(sha(read_file(work / "plan.json", 4_000_000)) == plan_sha and sha(read_file(work / "source.png", 8000)) == PNG_SHA, "PRIVATE_INPUT_CHANGED")
        if mode == "apply":
            require(production_identity(plan["production"]["container"], plan["production"]["image"]) == plan["production"], "PRODUCTION_CHANGED_DURING_REPAIR")
            no_other_config_writer(CONFIG_ROOT, (cid,))
        report["passed"] = True
    except BaseException as error:
        failure = error
        report["failureCode"] = str(error) if isinstance(error, GateError) else type(error).__name__
        report["requiresRecoveryBeforeRestart"] = mode == "apply"
    finally:
        # Keep bounded worker shutdown and the private failure receipt together
        # when an operator interrupts the controller during a native write.
        previous_handlers = {sig: signal.signal(sig, signal.SIG_IGN) for sig in (signal.SIGTERM, signal.SIGINT)}
        try:
            docker("stop", "--time", "10", cid)
            report["workerStopped"] = not inspect(cid)["State"]["Running"]
        except BaseException:
            report["workerStopped"] = False
            report["passed"] = False
            report["requiresRecoveryBeforeRestart"] = mode == "apply"
            failure = GateError("OWNED_WORKER_STOP_NOT_VERIFIED")
        if report.get("workerStopped") and (output / "native-result.json").exists():
            try:
                final_raw = read_file(output / "native-result.json", 4_000_000)
                final_native = json.loads(final_raw)
                require(final_native.get("planSha256") == plan_sha, "FINAL_NATIVE_PLAN_CHANGED")
                report["nativeResultSha256"] = sha(final_raw)
                report["committedOwners"] = sum(bool(item.get("committed")) for item in final_native.get("saves", []))
                report["possibleOrphanAssets"] = sum(bool(item.get("mayBeOrphan")) for item in final_native.get("saves", []))
            except BaseException:
                report["passed"] = False
                failure = GateError("FINAL_NATIVE_RESULT_NOT_VERIFIED")
                report["requiresRecoveryBeforeRestart"] = mode == "apply"
        if report.get("passed") and report.get("workerStopped"):
            try:
                require(inventory(config)["sha256"] == report["afterConfigSha256"], "CONFIG_CHANGED_AFTER_WORKER_STOP")
                if mode == "apply":
                    require(production_identity(plan["production"]["container"], plan["production"]["image"]) == plan["production"], "PRODUCTION_CHANGED_AFTER_WORKER_STOP")
                    no_other_config_writer(CONFIG_ROOT)
                    report["originalContainerStayedStopped"] = True
            except BaseException as error:
                report["passed"] = False
                report["requiresRecoveryBeforeRestart"] = mode == "apply"
                report["failureCode"] = str(error) if isinstance(error, GateError) else type(error).__name__
                failure = error
        report["finishedAt"] = now()
        try:
            receipt_sha = private_write(output / "receipt.json", report)
        finally:
            for sig, handler in previous_handlers.items():
                signal.signal(sig, handler)
    print(json.dumps({"mode": mode, "passed": report["passed"], "receipt": str(output / "receipt.json"), "receiptSha256": receipt_sha, "committedOwners": report.get("committedOwners", 0), "requiresRecoveryBeforeRestart": report.get("requiresRecoveryBeforeRestart", False)}), flush=True)
    if failure:
        raise failure
    return report


def make_plan(args):
    require(HEX.fullmatch(args.production_container) and re.fullmatch(r"sha256:[a-f0-9]{64}", args.expected_production_image), "PRODUCTION_PINS_REQUIRED")
    require(HEX.fullmatch(args.expected_base_sha256) and HEX.fullmatch(args.manifest_sha256) and re.fullmatch(r"[a-f0-9]{40}", args.revision), "SOURCE_AND_BASE_PINS_REQUIRED")
    work = pathlib.Path(args.work)
    require(re.fullmatch(r"/home/ubuntu/tadazz-example-media-repair-[a-f0-9]{8,32}", str(work)), "OWNED_WORK_PATH_REQUIRED")
    safe_directory(work.parent)
    work.mkdir(mode=0o700, exist_ok=False)
    production = production_identity(args.production_container, args.expected_production_image, stopped=False)
    backup = safe_directory(pathlib.Path(args.backup_config))
    require(backup != CONFIG_ROOT and CONFIG_ROOT not in backup.parents and backup not in CONFIG_ROOT.parents, "INDEPENDENT_BACKUP_REQUIRED")
    config = inventory(backup)
    accounts, account_digest = canonical_accounts(backup, work, config)
    targets = target_bindings(backup, accounts, args.owner_sha256, args.expected_base_sha256)
    source_bytes = read_file(pathlib.Path(args.manifest), 4_000_000)
    require(sha(source_bytes) == args.manifest_sha256, "SOURCE_MANIFEST_CHANGED")
    manifest = json.loads(source_bytes)
    require(manifest["sha"] == args.revision and isinstance(manifest["files"], dict), "CANDIDATE_REVISION_CHANGED")
    source = {"root": str(safe_directory(pathlib.Path(args.source))), "revision": args.revision, "manifestSha256": args.manifest_sha256, "files": manifest["files"]}
    deployed_source_binding(source, production)
    verify_source(source)
    release_proof = admit_release_proof(args, source, production)
    verify_toolchain()
    png = read_file(pathlib.Path(args.png), 8000)
    require(len(png) == PNG_SIZE and sha(png) == PNG_SHA and png[:8] == bytes.fromhex("89504e470d0a1a0a") and int.from_bytes(png[16:20], "big") == 600 and int.from_bytes(png[20:24], "big") == 400, "FROZEN_PNG_PIN_CHANGED")
    with (work / "source.png").open("xb") as handle:
        handle.write(png)
    (work / "source.png").chmod(0o400)
    require(inventory(backup)["sha256"] == config["sha256"] and production_identity(args.production_container, args.expected_production_image, stopped=False) == production, "PLAN_INPUT_CHANGED")
    plan = {"kind": "tadazz-example-media-repair-plan", "version": 1, "planId": uuid.uuid4().hex, "createdAt": now(), "work": str(work), "production": production, "releaseProof": release_proof, "backupRoot": str(backup), "config": config, "accountStoreSha256": account_digest, "source": source, "sourceUrl": SOURCE_URL, "pngSha256": PNG_SHA, "pngBytes": PNG_SIZE, "targets": targets, "legacyScopeSelected": False}
    plan_sha = private_write(work / "plan.json", plan)
    print(json.dumps({"mode": "plan", "plan": str(work / "plan.json"), "planSha256": plan_sha, "configSha256": config["sha256"], "accountStoreSha256": account_digest, "targetOwners": [target["ownerSha256"] for target in targets], "targetCount": len(targets), "productionChanged": False}), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="mode", required=True)
    plan = sub.add_parser("plan")
    for name in ("work", "production-container", "expected-production-image", "source", "manifest", "manifest-sha256", "revision", "png", "expected-base-sha256", "backup-config", "stage-manifest", "stage-manifest-sha256", "deployment-receipt", "deployment-receipt-sha256"):
        plan.add_argument("--" + name, required=True)
    plan.add_argument("--owner-sha256", action="append", required=True)
    plan.add_argument("--lock-fd", type=int)
    for mode in ("qualify", "apply"):
        p = sub.add_parser(mode)
        p.add_argument("--plan", required=True)
        p.add_argument("--plan-sha256", required=True)
        p.add_argument("--lock-fd", type=int)
        if mode == "qualify":
            p.add_argument("--backup-config", required=True)
        else:
            p.add_argument("--qualification", required=True)
            p.add_argument("--qualification-sha256", required=True)
    args = parser.parse_args()
    require(sys.platform == "linux" and os.geteuid() == 0, "LINUX_OPERATOR_CONTEXT_REQUIRED")
    os.umask(0o077)
    def interrupted(_signum, _frame):
        raise GateError("OPERATOR_INTERRUPTED")
    for sig in (signal.SIGTERM, signal.SIGINT):
        signal.signal(sig, interrupted)
    # A qualified independent clone does not hold a deployment lock or prolong
    # downtime. The exact identity/input checks are repeated under the lock only
    # when applying to the stopped original service.
    lock = deployment_lock(args.lock_fd) if args.mode == "apply" else contextlib.nullcontext()
    with lock:
        if args.mode == "plan":
            make_plan(args)
            return
        plan, work = read_plan(args)
        if args.mode == "qualify":
            clone = work / "clone"
            clone.mkdir(mode=0o700, exist_ok=False)
            clone_config = clone / "config"
            clone_backup(pathlib.Path(args.backup_config), clone_config, plan["config"])
            accounts, account_digest = canonical_accounts(clone_config, clone, plan["config"])
            require(account_digest == plan["accountStoreSha256"] and all(accounts.get(target["ownerId"]) is True for target in plan["targets"]), "CLONE_OWNER_BINDING_CHANGED")
            run_native(plan, work, clone_config, "qualify", args.plan_sha256)
        else:
            qualification_path = pathlib.Path(args.qualification)
            require(qualification_path == work / "qualify/receipt.json", "QUALIFICATION_PATH_CHANGED")
            raw = read_file(qualification_path, 4_000_000)
            require(HEX.fullmatch(args.qualification_sha256) and sha(raw) == args.qualification_sha256, "QUALIFICATION_HASH_CHANGED")
            result = json.loads(raw)
            require(result.get("kind") == "tadazz-example-media-qualify" and result.get("passed") is True and result.get("workerStopped") is True and result.get("planSha256") == args.plan_sha256, "SUCCESSFUL_MATCHING_QUALIFICATION_REQUIRED")
            qualified_native = work / "qualify/native-result.json"
            require(sha(read_file(qualified_native, 4_000_000)) == result["nativeResultSha256"], "QUALIFIED_NATIVE_RESULT_CHANGED")
            require(production_identity(plan["production"]["container"], plan["production"]["image"]) == plan["production"], "STOPPED_PRODUCTION_IDENTITY_CHANGED")
            no_other_config_writer(CONFIG_ROOT)
            require(inventory(CONFIG_ROOT)["sha256"] == plan["config"]["sha256"], "CONFIG_CHANGED_SINCE_PLAN")
            accounts, account_digest = canonical_accounts(CONFIG_ROOT, work, plan["config"])
            require(account_digest == plan["accountStoreSha256"] and all(accounts.get(target["ownerId"]) is True for target in plan["targets"]), "VERIFIED_OWNER_CHANGED")
            run_native(plan, work, CONFIG_ROOT, "apply", args.plan_sha256, qualified_native)


if __name__ == "__main__":
    try:
        main()
    except BaseException as error:
        print(json.dumps({"passed": False, "failureCode": str(error) if isinstance(error, GateError) else type(error).__name__, "productionStartStopPerformed": False}), flush=True)
        raise SystemExit(1)

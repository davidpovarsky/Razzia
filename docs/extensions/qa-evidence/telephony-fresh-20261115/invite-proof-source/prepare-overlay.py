"""Immutable C consumer plus exactly two manager-routed B source blobs. No extraction."""
import hashlib
import io
import json
import pathlib
import subprocess
import sys
import tarfile

root = pathlib.Path(__file__).resolve().parents[5]

def git(*args):
    return subprocess.check_output(["git", *args], cwd=root)

sha = git("rev-parse", (sys.argv[1] if len(sys.argv) > 1 else "HEAD") + "^{commit}").decode().strip()
producer = "902412c347d39f38290fde2ef1307240cee7dc07"
assert len(sha) == 40 and all(c in "0123456789abcdef" for c in sha)
paths = [
    "extensions/src/server/phone-lifecycle-v2",
    "extensions/src/telephony/pilot-runtime/service-auth-v2",
    "extensions/src/telephony/pilot-runtime/gateway-v2",
    "docs/extensions/qa-evidence/telephony-fresh-20261115/gateway-source",
    "docs/extensions/qa-evidence/telephony-fresh-20261115/gameplay-source",
    "docs/extensions/qa-evidence/telephony-fresh-20261115/invite-proof-source",
    "docs/extensions/qa-evidence/telephony-fresh-20261115/auth-source",
    "docs/extensions/qa-evidence/telephony-fresh-20261115/remaining-source",
    "extensions/src/server/index.ts",
    "packages/socket/src/services/game/index.ts",
    "packages/socket/src/api/routes/games.ts",
    "packages/socket/src/api/extensions/game-routes.ts",
]
foreign = ["extensions/src/server/game/phone-controller.ts", "packages/socket/src/services/game/player-manager.ts"]
hash_bytes = lambda value: hashlib.sha256(value).hexdigest()
items = []
for source, selectors in [(sha, paths), (producer, foreign)]:
    for line in git("ls-tree", "-r", source, "--", *selectors).decode().strip().splitlines():
        meta, path = line.split("\t")
        mode, kind, blob = meta.split(" ")
        assert mode in ["100644", "100755"] and kind == "blob"
        data = git("cat-file", "blob", blob)
        items.append(({"path": path, "mode": mode, "source_sha": source, "bytes": len(data), "sha256": hash_bytes(data)}, data))
assert len({item[0]["path"] for item in items}) == len(items)
assert {row["path"] for row, _ in items if row["source_sha"] == producer} == set(foreign)
for name in ["contracts.ts", "store.ts", "prototype.ts", "game-facade.ts"]:
    path = "extensions/src/server/phone-lifecycle-v2/" + name
    assert git("show", sha + ":" + path) == git("show", "0ad2f09e25daf56dee3fa3c17d7b67b3b8407894:" + path)
for name in ["gameplay.node.ts", "actual-gameplay-backend.ts"]:
    path = "docs/extensions/qa-evidence/telephony-fresh-20261115/gameplay-source/" + name
    assert git("show", sha + ":" + path) == git("show", "ccb0c5c2add55b7ba13bff2f56f04a4295dfc867:" + path)
assert not git("diff", "--name-only", "b764b38222a872cf499419defc9d02e1a1cbdd94", sha, "--", "extensions", "packages").strip()
output = root / "docs/extensions/qa-evidence/telephony-fresh-20261115/delivery" / ("phone-invite-" + sha)
output.mkdir()
archive = output / "source.tar"
with tarfile.open(archive, "x", format=tarfile.USTAR_FORMAT) as tar:
    for row, data in sorted(items, key=lambda item: item[0]["path"]):
        entry = tarfile.TarInfo(row["path"])
        entry.size = len(data)
        entry.mode = int(row["mode"][-3:], 8)
        tar.addfile(entry, io.BytesIO(data))
assert archive.stat().st_size <= 524288
manifest = {
    "schema": 1, "review_sha": sha, "base_sha": "003cf88b6cba19989388dca20efcfaa01cc8f9ad",
    "accepted_core": "0ad2f09e25daf56dee3fa3c17d7b67b3b8407894",
    "components": [{"role": "C unchanged actual consumer", "sha": sha}, {"role": "B resolved roster admission", "sha": producer, "paths": foreign}],
    "historical_LIVE_not_recertified": True, "selection": "two existing INVITE-COMPOSED cases unchanged",
    "files": [row for row, _ in items],
}
body = (json.dumps(manifest, indent=2) + "\n").encode()
(output / "source-manifest.json").write_bytes(body)
extractor = git("show", sha + ":docs/extensions/qa-evidence/telephony-fresh-20261115/auth-source/safe-extract.py")
(output / "safe-extract.py").write_bytes(extractor)
receipt = {"sha": sha, "producer_sha": producer, "files": len(items), "archive_bytes": archive.stat().st_size,
    "archive_sha256": hash_bytes(archive.read_bytes()), "manifest_sha256": hash_bytes(body), "extractor_sha256": hash_bytes(extractor)}
(output / "delivery.json").write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8", newline="\n")
print(json.dumps({"output": str(output), **receipt}))

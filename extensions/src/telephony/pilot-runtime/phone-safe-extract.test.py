"""In-memory safety tests; never starts a server or extracts files."""
import hashlib
import importlib.util
import io
import json
import pathlib
import tarfile
import unittest

spec = importlib.util.spec_from_file_location("phone_extract", pathlib.Path(__file__).with_name("phone-safe-extract.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def packet(name="source/entry.ts", kind=tarfile.REGTYPE, duplicate=False, altered=False):
    contents = b"synthetic source\n"
    manifest = json.dumps({"review_sha": "a" * 40, "files": [{
        "path": name, "mode": "100644", "bytes": len(contents),
        "sha256": hashlib.sha256(contents).hexdigest(),
    }]}).encode()
    stream = io.BytesIO()
    with tarfile.open(fileobj=stream, mode="w:") as tar:
        member = tarfile.TarInfo(name)
        member.type = kind
        member.size = len(contents) if kind == tarfile.REGTYPE else 0
        member.linkname = "outside"
        body = b"x" * len(contents) if altered else contents
        tar.addfile(member, io.BytesIO(body) if member.isreg() else None)
        if duplicate:
            tar.addfile(member, io.BytesIO(body))
    archive = stream.getvalue()
    return archive, manifest, hashlib.sha256(archive).hexdigest(), hashlib.sha256(manifest).hexdigest()


class DeliverySafety(unittest.TestCase):
    def test_valid_regular_source(self):
        sha, files = module.verified_files(*packet())
        self.assertEqual(sha, "a" * 40)
        self.assertEqual(files, [("source/entry.ts", b"synthetic source\n", "100644")])

    def test_archive_hash_mismatch(self):
        args = list(packet())
        args[2] = "0" * 64
        with self.assertRaises(AssertionError):
            module.verified_files(*args)

    def test_manifest_hash_mismatch(self):
        args = list(packet())
        args[3] = "0" * 64
        with self.assertRaises(AssertionError):
            module.verified_files(*args)

    def test_traversal_even_when_manifested(self):
        with self.assertRaises(AssertionError):
            module.verified_files(*packet("../outside.ts"))

    def test_absolute_even_when_manifested(self):
        with self.assertRaises(AssertionError):
            module.verified_files(*packet("/outside.ts"))

    def test_links_and_special_files(self):
        for kind in [tarfile.SYMTYPE, tarfile.LNKTYPE, tarfile.FIFOTYPE, tarfile.CHRTYPE]:
            with self.subTest(kind=kind), self.assertRaises(AssertionError):
                module.verified_files(*packet(kind=kind))

    def test_duplicate_members(self):
        with self.assertRaises(AssertionError):
            module.verified_files(*packet(duplicate=True))

    def test_source_digest_mismatch(self):
        with self.assertRaises(AssertionError):
            module.verified_files(*packet(altered=True))


if __name__ == "__main__":
    unittest.main()

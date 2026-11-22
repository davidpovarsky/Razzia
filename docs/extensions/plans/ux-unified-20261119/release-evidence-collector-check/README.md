# Windows public evidence read integrity

The original collector stopped with LOCAL_FILE_CHANGED before any remote read.
The diagnostic records three actual coordinator files on Python 3.12.5/Windows.
For each, path.stat and os.fstat returned the same file identity, type, link
count, length and nanosecond modification time, but different st_ctime_ns
semantics. Each API was stable across its own before/after samples.

The repaired reader compares identity/type/link-count/size/mtime across all
four snapshots. It separately compares ctime and birthtime before/after within
each API. It still rejects a changed path, opened file, metadata clock, short
read, extra read bytes, symlink/reparse component, or file exceeding the limit.
The Linux public-file reader and the source, release, image, coordinator,
receipt, mode/ownership, hash, allowlist and atomic-write checks are unchanged.

verification.json records 26 passed guard cases and successful byte reads of
the actual three coordinator records. diagnosis.json records the actual API
disagreement. collect_release_evidence.py is the exact successful collector;
collector-read-integrity.diff is the narrow change. This tooling reads only the
five named public release result files. It never reads private backup/config,
environment files, production logs, or customer content.

The successful retrieval is ../release-evidence/retrieval-manifest.json.
It preserves actual remote disk bytes and verifies SHA-256 against the
accepted stage/qualification/deployment binding. No application code changed.

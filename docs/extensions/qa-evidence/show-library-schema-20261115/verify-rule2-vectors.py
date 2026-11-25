"""Independent Python/hashlib verification of the fixed JS UTF16 code-unit vectors."""
import json,hashlib,sys
from pathlib import Path
vectors=json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
for v in vectors:
 key="".join(chr(unit) for unit in v["keyCodeUnits"])
 encoded=key.encode("utf-16-be", "surrogatepass").hex()
 preimage=(v["kind"]+"\0utf16-hex-v2\0"+encoded).encode("ascii")
 assert encoded==v["keyHex"]
 assert preimage.hex()==v["preimageHex"]
 assert hashlib.sha256(preimage).hexdigest()==v["sha256"]
print(json.dumps({"status":"PASS","vectors":len(vectors),"encoder":"Python utf-16-be surrogatepass","hash":"hashlib.sha256"}))

import hashlib, json, pathlib, zipfile
root = pathlib.Path("/home/ubuntu/tadazz-hq-qa-20261115/fixtures/mcp-foundation-76634efa3162227a54c7b0cedaf6e28c0facab55f0e127a8b469a8e4b9f97ffc")
work = root / "format-work"
files = sorted(p for p in work.rglob("*") if p.is_file())
output = root / "formatted-output.zip"
rows = []
with zipfile.ZipFile(output, "x", zipfile.ZIP_DEFLATED) as archive:
    for p in files:
        name = p.relative_to(work).as_posix()
        assert name.startswith("extensions/src/mcp-app/") or name == "docs/extensions/plans/MCP_APP_ADOPTION_20261115.md"
        assert not p.is_symlink()
        content = p.read_bytes()
        rows.append({"path":name, "sha256":hashlib.sha256(content).hexdigest(), "lines":len(content.splitlines())})
        archive.writestr(name, content)
receipt = {"formatter":"Prettier3.9.10, image-installed tooling only, no stale app source",
           "options":{"semi":False,"tabWidth":2,"singleQuote":False,"printWidth":80,"trailingComma":"all"},
           "tailwindPlugin":"Not needed for TS/JSON/Markdown package without TSX/Tailwind classes",
           "files":rows,"zipSha256":hashlib.sha256(output.read_bytes()).hexdigest()}
(root / "formatted-output.json").write_text(json.dumps(receipt,indent=2)+"\n")
print(json.dumps({"files":len(rows),"zipSha256":receipt["zipSha256"],"largest":[r for r in rows if r["lines"]>240]}))


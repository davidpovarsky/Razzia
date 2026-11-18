#!/usr/bin/env python3
"""Build a pinned Tadazz MCP release from already-qualified immutable Linux output.

This creates a new root-owned staging tree, image and isolated synthetic test.
It never reads the production config, stops a live container, publishes a port,
changes a proxy, or deploys. All source builds and browser gates must precede it.
Failed staging artifacts and stopped test containers are retained for review.
"""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import secrets
import shutil
import stat
import subprocess
import sys
import tempfile
import time
import uuid


BASE_IMAGE = "sha256:417cc204da575626fb32c9a74435802e5222c3ef86fbce1578414bfa61ab4346"
EVIDENCE_ROOT = Path("/home/ubuntu/tadazz-phase2-20261116/evidence")
ORIGIN = "https://tadazz.com"
HASH = re.compile(r"[a-f0-9]{64}")
MAX_FILE = 64 * 1024 * 1024
MAX_TREE = 512 * 1024 * 1024
FULL_SHOW_CHECKS = (
    "native opening, five phases, transitions and closing",
    "title edit CAS and summary refresh through AppBridge",
    "tamper, cancellation and tool-context teardown",
    "CSP, native media resources and browser errors",
)


class GateError(Exception):
    pass


def need(condition, code):
    if not condition:
        raise GateError(code)


def safe_relative(value):
    need(isinstance(value, str), "RELATIVE_PATH_TYPE")
    path = PurePosixPath(value)
    need(value and not path.is_absolute() and str(path) == value and
         ".." not in path.parts and "\\" not in value and
         all(ord(char) >= 32 for char in value), "RELATIVE_PATH_REJECTED")
    return path


def plain(path, directory=False):
    path = Path(path)
    need(path.is_absolute() and str(path) == os.path.normpath(path), "PATH_NOT_CANONICAL")
    for ancestor in [*reversed(path.parents), path]:
        info = ancestor.lstat()
        need(not stat.S_ISLNK(info.st_mode), "PATH_SYMLINK")
        if ancestor != path or directory:
            need(stat.S_ISDIR(info.st_mode), "PATH_NOT_DIRECTORY")
        else:
            need(stat.S_ISREG(info.st_mode) and info.st_nlink == 1, "PATH_NOT_PLAIN_FILE")
    return path


def read_bytes(path, limit=MAX_FILE):
    path = plain(path)
    before = path.stat()
    need(before.st_size <= limit, "FILE_LIMIT")
    descriptor = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    with os.fdopen(descriptor, "rb") as stream:
        current = os.fstat(stream.fileno())
        need((current.st_dev, current.st_ino, current.st_size) ==
             (before.st_dev, before.st_ino, before.st_size), "FILE_CHANGED_WHILE_OPENING")
        data = stream.read(limit + 1)
        after = os.fstat(stream.fileno())
        need(len(data) == before.st_size and after.st_mtime_ns == before.st_mtime_ns and
             after.st_ctime_ns == before.st_ctime_ns, "FILE_CHANGED_WHILE_READING")
    return data


def digest(data):
    return hashlib.sha256(data).hexdigest()


def json_file(path):
    return json.loads(read_bytes(path, 32 * 1024 * 1024))


def write_new(path, data):
    path = Path(path)
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    plain(path.parent, directory=True)
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL |
                         getattr(os, "O_NOFOLLOW", 0), 0o600)
    with os.fdopen(descriptor, "wb") as stream:
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())


def write_json(path, value):
    write_new(path, (json.dumps(value, indent=2, sort_keys=True) + "\n").encode())


def copy_pinned(source, target, pin, size=None):
    data = read_bytes(source)
    need(digest(data) == pin and (size is None or len(data) == size), "ARTIFACT_CHANGED_DURING_COPY")
    write_new(target, data)


def tree(root):
    root = plain(root, directory=True)
    result, total = {}, 0
    for directory, dirs, files in os.walk(root, followlinks=False):
        for name in dirs:
            plain(Path(directory) / name, directory=True)
        for name in sorted(files):
            path = Path(directory) / name
            data = read_bytes(path)
            total += len(data)
            need(total <= MAX_TREE and len(result) < 10000, "TREE_LIMIT")
            relative = path.relative_to(root).as_posix()
            safe_relative(relative)
            result[relative] = {"sha256": digest(data), "bytes": len(data)}
    return dict(sorted(result.items()))


def verify_source(root, manifest):
    need(isinstance(manifest, dict) and 0 < len(manifest) <= 20000, "SOURCE_MANIFEST_EMPTY")
    for name, pin in manifest.items():
        relative = safe_relative(name)
        need(isinstance(pin, str) and HASH.fullmatch(pin), "SOURCE_PIN_INVALID")
        need(digest(read_bytes(root.joinpath(*relative.parts))) == pin, "SOURCE_HASH_MISMATCH")


def no_live_data(receipt, key="customerMountAccessed"):
    need(receipt.get("productionChanged") is False and receipt.get(key) is False,
         "RECEIPT_ISOLATION_MISSING")


def matrix_receipt(receipt, revision, source_run, suite, required):
    need(receipt.get("sha") == revision and receipt.get("run") == source_run and
         receipt.get("suite") == suite, "MATRIX_IDENTITY_MISMATCH")
    need(receipt.get("allHashesVerifiedBeforeAfter") is True and
         receipt.get("hashesBefore") == receipt.get("hashesAfter") and
         not receipt.get("changedSourcePaths"), "MATRIX_SOURCE_CHANGED")
    no_live_data(receipt)
    checks = receipt.get("checks")
    need(isinstance(checks, list) and checks and all(c.get("exit") == 0 for c in checks),
         "MATRIX_CHECK_FAILED")
    labels = [c.get("label") for c in checks]
    need(len(labels) == len(set(labels)) and required <= set(labels), "MATRIX_REQUIRED_CHECK_MISSING")
    http = next(c for c in checks if c["label"] == "native-http")
    tap_success(http.get("stdout", ""))
    return receipt["hashesBefore"]


def tap_success(output):
    need(re.search(r"^# pass [1-9][0-9]*\s*$", output, re.M) and
         re.search(r"^# fail 0\s*$", output, re.M) and
         re.search(r"^# skipped 0\s*$", output, re.M) and
         re.search(r"^# cancelled 0\s*$", output, re.M), "TAP_NOT_ALL_PASSED")


def verify_fullshow(receipt, revision, manifest_pin, widget):
    need(receipt.get("sha") == revision and receipt.get("exit") == 0 and
         receipt.get("network") == "none" and receipt.get("sourceReadOnly") is True,
         "FULL_SHOW_LINUX_GATE_MISSING")
    for name in ("allSourceHashesVerifiedBeforeAfter", "allWidgetHashesVerifiedBeforeAfter",
                 "sdkCacheHashesVerifiedBeforeAfter"):
        need(receipt.get(name) is True, "FULL_SHOW_INPUT_CHANGED")
    need(receipt.get("widgetManifestSha256") == manifest_pin and
         receipt.get("widgetHtmlSha256") == widget["sha256"], "FULL_SHOW_OUTER_ARTIFACT_MISMATCH")
    inner = receipt.get("fullShow", {})
    need(inner.get("sha") == revision and inner.get("widgetManifestSha256") == manifest_pin and
         inner.get("widgetHtmlSha256") == widget["sha256"] and
         inner.get("rendererBuildId") == widget["rendererBuildId"], "FULL_SHOW_INNER_ARTIFACT_MISMATCH")
    need(inner.get("failureCount") == 0 and inner.get("sourceHashesUnchanged") is True and
         inner.get("network") == "none" and inner.get("outboundDenied") == [],
         "FULL_SHOW_RUNTIME_FAILURE")
    no_live_data(inner)
    required = {f"{engine} / {family} {check}"
                for engine in ("chromium", "webkit")
                for family in ("tadazz-classic", "razzia-original")
                for check in FULL_SHOW_CHECKS}
    need(required <= set(inner.get("requiredChecks", [])), "FULL_SHOW_REQUIRED_CHECKS_MISSING")
    engines = inner.get("engines", [])
    need({e.get("name") for e in engines} == {"chromium", "webkit"}, "FULL_SHOW_ENGINE_MISSING")
    actual = set()
    for engine in engines:
        need(engine.get("version") and engine.get("outcomes"), "FULL_SHOW_ENGINE_EMPTY")
        for outcome in engine["outcomes"]:
            need(outcome.get("status") == "PASS" and not outcome.get("error"), "FULL_SHOW_SCENARIO_FAILED")
            need(outcome.get("name") not in actual, "FULL_SHOW_DUPLICATE_SCENARIO")
            actual.add(outcome["name"])
    need(required <= actual and set(inner["requiredChecks"]) <= actual,
         "FULL_SHOW_SCENARIO_MISSING")


def run(argv, *, timeout=30, input=None, log=None, env=None):
    if log:
        with open(log, "xb") as output:
            os.chmod(log, 0o600)
            result = subprocess.run(argv, input=input, stdout=output, stderr=subprocess.STDOUT,
                                    timeout=timeout, env=env)
        need(result.returncode == 0, "COMMAND_FAILED_SEE_PRIVATE_LOG")
        return b""
    result = subprocess.run(argv, input=input, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            timeout=timeout, env=env)
    need(result.returncode == 0, "COMMAND_FAILED")
    need(len(result.stdout) <= 8 * 1024 * 1024, "COMMAND_OUTPUT_LIMIT")
    return result.stdout


def docker_inspect(kind, name):
    result = json.loads(run(["docker", kind, "inspect", name]))
    need(len(result) == 1, "DOCKER_INSPECT_COUNT")
    return result[0]


def running_snapshot():
    identifiers = run(["docker", "ps", "--no-trunc", "--format", "{{.ID}}"]).decode().splitlines()
    return {identifier: {"image": facts["Image"], "startedAt": facts["State"]["StartedAt"]}
            for identifier in sorted(identifiers)
            for facts in [docker_inspect("container", identifier)]}


SMOKE_JS = r'''
const http=require('node:http'),fs=require('node:fs'),crypto=require('node:crypto');
const origin='https://tadazz.com',routes={};
function req(path,status=200,method='GET',body){return new Promise((resolve,reject)=>{
const q=http.request({host:'127.0.0.1',port:3000,path,method,
 headers:{Host:'tadazz.com',...(body?{'Content-Type':'text/plain;charset=UTF-8'}:{})},timeout:2500},r=>{
 let chunks=[],size=0;r.on('data',b=>{size+=b.length;if(size>8*1024*1024){q.destroy();reject(Error('limit'));}else chunks.push(b)});
 r.on('end',()=>{if(r.statusCode!==status)return reject(Error('status'));const value={body:Buffer.concat(chunks),headers:r.headers};
 routes[path]={status:r.statusCode,contentType:r.headers['content-type']??''};resolve(value)});
});q.on('timeout',()=>q.destroy(Error('timeout')));q.on('error',reject);q.end(body);});}
async function json(path,status=200){const r=await req(path,status);if(!r.headers['content-type']?.startsWith('application/json'))throw Error('type');return JSON.parse(r.body);}
const ok=(v)=>{if(!v)throw Error('probe')}, hash=b=>crypto.createHash('sha256').update(b).digest('hex');
(async()=>{
let ready=false;for(let i=0;i<120;i++){try{ready=(await json('/api/health')).status==='ok';if(ready)break}catch{}await new Promise(r=>setTimeout(r,250))}ok(ready);
ok((await json('/api/auth/mode')).accountsEnabled===true);ok((await json('/api/billing/config')).enabled===false);
for(const p of ['/api/billing','/api/quizz','/api/results','/api/accounts/me','/api/packages/capabilities'])await req(p,401);
const resource=await json('/.well-known/oauth-protected-resource');ok(resource.resource===origin+'/mcp'&&JSON.stringify(resource.authorization_servers)===JSON.stringify([origin+'/oauth']));
const issuer=await json('/.well-known/oauth-authorization-server/oauth');ok(issuer.issuer===origin+'/oauth'&&issuer.authorization_endpoint===origin+'/oauth/authorize'&&issuer.token_endpoint===origin+'/oauth/token'&&issuer.code_challenge_methods_supported.includes('S256'));
const key=crypto.createPublicKey(JSON.parse(fs.readFileSync('/app/config/extensions/mcp-service/runtime.json')).signingPrivateKeyPem).export({format:'jwk'});
const jwks=await json('/oauth/jwks.json');ok(jwks.keys?.length===1&&jwks.keys[0].x===key.x&&jwks.keys[0].crv==='Ed25519'&&!('d'in jwks.keys[0]));
const mcp=await req('/mcp',401);ok(mcp.headers['www-authenticate']==='Bearer resource_metadata="'+origin+'/.well-known/oauth-protected-resource", scope="tadazz.catalog.read"');ok(mcp.headers['content-type'].startsWith('application/json'));JSON.parse(mcp.body);
for(const p of ['/studio/oauth-consent?oauth_request=stage-smoke','/studio/native-save-consent/'+'a'.repeat(54)])for(const method of ['GET','HEAD']){
 const r=await req(p,200,method);ok(r.headers['content-type'].startsWith('text/html')&&r.headers['cache-control']==='no-store'&&r.headers['x-frame-options']==='DENY'&&r.headers['referrer-policy']==='no-referrer'&&r.headers['content-security-policy'].includes("frame-ancestors 'none'"));ok(method==='GET'?r.body.length>0:r.body.length===0);}
const index=fs.readFileSync('/app/web/index.html');ok(hash((await req('/')).body)===hash(index));
const assets=[...new Set([...index.toString().matchAll(/(?:src|href)=["'](\/assets\/[^"'?#]+)/g)].map(m=>m[1]))];ok(assets.length>0&&assets.length<100);
for(const p of assets)ok(hash((await req(p)).body)===hash(fs.readFileSync('/app/web'+p)));
const query='/ws/?EIO=4&transport=polling&t=stage-smoke';const packet=(await req(query)).body.toString();ok(packet[0]==='0');const handshake=JSON.parse(packet.slice(1));ok(/^[A-Za-z0-9_-]{1,256}$/.test(handshake.sid));await req(query+'&sid='+handshake.sid,200,'POST','1');
process.stdout.write(JSON.stringify({ok:true,routes,engineIoOpenClose:true,indexAndEntryAssets:assets.length}));
})().catch(()=>{process.stdout.write(JSON.stringify({ok:false,routes}));process.exitCode=1});
'''


def synthetic_smoke(stage, image, revision, suffix):
    private = stage / "evidence/synthetic-config"
    runtime = private / "extensions/mcp-service/runtime.json"
    key = run(["openssl", "genpkey", "-algorithm", "ed25519"])
    config = {"version": 1, "origin": ORIGIN, "keyId": "stage-synthetic-" + suffix,
              "signingPrivateKeyPem": key.decode(),
              "ticketEncryptionKey": base64.urlsafe_b64encode(secrets.token_bytes(32)).decode().rstrip("="),
              "clients": [{"clientId": "stage-synthetic-only", "redirectUris": ["https://example.invalid/callback"],
                           "scopes": ["tadazz.catalog.read", "tadazz.drafts.read", "tadazz.drafts.write"]}]}
    write_json(runtime, config)
    for directory in (private, private / "extensions", runtime.parent):
        os.chmod(directory, 0o700)
    name = "tadazz-mcp-stage-smoke-" + suffix
    environment = {"CONFIG_PATH": "/app/config", "SOCKET_PORT": "3001", "NODE_ENV": "production",
                   "TMPDIR": "/tmp", "TADAZZ_MCP_SERVICE_ENABLED": "true", "TADAZZ_ACCOUNTS_ENABLED": "true",
                   "JWT_SECRET": "synthetic-stage-" + secrets.token_hex(32),
                   "RESEND_API_KEY": "qa-no-network", "TADAZZ_AUTH_EMAIL_FROM": "qa@example.invalid"}
    command = ["docker", "create", "--pull=never", "--name", name, "--network", "none",
               "--cpus", "1", "--memory", "1g", "--memory-swap", "1g", "--pids-limit", "256",
               "--log-opt", "max-size=5m", "--log-opt", "max-file=1",
               "--label", "com.tadazz.mcp.staging=" + suffix,
               "--mount", f"type=bind,source={private},target=/app/config"]
    for item, value in environment.items():
        command += ["--env", item + "=" + value]
    command += [image]
    identifier = run(command).decode().strip()
    result = {"image": image, "sourceSha": revision, "productionTouched": False,
              "customerMountUsed": False, "network": "none", "container": identifier, "ok": False}
    try:
        facts = docker_inspect("container", identifier)
        need(facts["Image"] == image and facts["HostConfig"]["NetworkMode"] == "none" and
             not facts["HostConfig"].get("PortBindings"), "SMOKE_CONTAINER_NOT_ISOLATED")
        mounts = facts["Mounts"]
        need(len(mounts) == 1 and mounts[0]["Source"] == str(private) and
             mounts[0]["Destination"] == "/app/config" and mounts[0]["RW"] is True,
             "SMOKE_MOUNTS_NOT_ISOLATED")
        run(["docker", "start", identifier])
        probe = json.loads(run(["docker", "exec", "-i", identifier, "node", "-"],
                               input=SMOKE_JS.encode(), timeout=65))
        result.update(probe)
        need(result["ok"] is True, "SYNTHETIC_SMOKE_FAILED")
    finally:
        if docker_inspect("container", identifier)["State"]["Running"]:
            run(["docker", "stop", "--time", "30", identifier], timeout=40)
        result["retainedStopped"] = not docker_inspect("container", identifier)["State"]["Running"]
        write_json(stage / "synthetic-smoke-result.json", result)
    return result


def qualify_inputs(args):
    need(re.fullmatch(r"[a-f0-9]{40}", args.revision), "REVISION_NOT_EXACT")
    for value in (args.source_run, args.web_source_run):
        need(re.fullmatch(r"tadazz-codex-" + args.revision[:12] + r"-[a-f0-9]{8}", value), "SOURCE_RUN_NOT_EXACT")
    source = plain(EVIDENCE_ROOT / args.source_run / "source", directory=True)
    web_source = plain(EVIDENCE_ROOT / args.web_source_run / "source", directory=True)
    receipts = {key: json_file(getattr(args, key + "_receipt"))
                for key in ("host", "launch", "web", "browser", "full_show")}
    required = {"native-http", "native-types", "native-lint", "native-format"}
    manifest = matrix_receipt(receipts["host"], args.revision, args.source_run, "native-launch",
                              required | {"native-widget-build", "native-launch-build"})
    other = matrix_receipt(receipts["web"], args.revision, args.web_source_run, "native-consent",
                           required | {"native-site-build"})
    need(manifest == other, "SOURCE_INPUTS_DIFFER")
    verify_source(source, manifest)
    if web_source != source:
        verify_source(web_source, manifest)
    built = plain(EVIDENCE_ROOT / args.source_run / "fixtures/native-host-build", directory=True)
    artifact = json_file(built / "artifact.json")
    backend = read_bytes(built / "index.cjs")
    need(artifact.get("format") == "tadazz-native-host-artifact" and artifact.get("version") == 1 and
         artifact.get("bytes") == len(backend) and artifact.get("sha256") == digest(backend), "BACKEND_PIN_MISMATCH")
    widget_root = source / "extensions/src/mcp-app/widget/dist"
    widget_bytes = read_bytes(widget_root / "full-show-artifact.json")
    widget = json.loads(widget_bytes)
    widget_html = read_bytes(widget_root / "full-show.html", 4000000)
    widget_pin = digest(widget_bytes)
    need(artifact.get("fullShowManifestSha256") == widget_pin and widget.get("sha256") == digest(widget_html) and
         widget.get("bytes") == len(widget_html), "BACKEND_WIDGET_PIN_MISMATCH")
    need(widget.get("origin") == ORIGIN and widget.get("resourceUri") == "ui://tadazz/full-show/v3.html" and
         widget.get("mimeType") == "text/html;profile=mcp-app" and
         widget.get("csp") == {"connectDomains": [ORIGIN], "resourceDomains": [ORIGIN],
                               "frameDomains": [], "baseUriDomains": [ORIGIN]}, "WIDGET_RESOURCE_POLICY_MISMATCH")
    need(widget.get("rendererBuildId") == digest(json.dumps(widget["physicalSources"], ensure_ascii=False,
                                                           separators=(",", ":")).encode()), "WIDGET_BUILD_ID_MISMATCH")
    for group in ("physicalSources", "publicAssets"):
        entries = widget.get(group)
        need(isinstance(entries, list) and entries and len({e["path"] for e in entries}) == len(entries), "WIDGET_INPUTS_EMPTY")
        for entry in entries:
            relative = safe_relative(entry["path"])
            need(manifest.get(entry["path"]) == entry["sha256"] and
                 len(read_bytes(source.joinpath(*relative.parts))) == entry["bytes"], "WIDGET_SOURCE_MISMATCH")
    need({e["path"] for e in widget["publicAssets"]} == {p for p in manifest if p.startswith("packages/web/public/")},
         "WIDGET_PUBLIC_ASSET_INVENTORY_MISMATCH")
    launcher = receipts["launch"]
    need(launcher.get("sha") == args.revision and launcher.get("exit") == 0 and
         launcher.get("network") == "none" and launcher.get("allSourceHashesVerifiedBeforeAfter") is True and
         launcher.get("artifactHashUnchanged") is True and launcher.get("artifact") == artifact,
         "LAUNCH_GATE_MISMATCH")
    no_live_data(launcher, "customerDataAccessed")
    tap_success(launcher.get("stdout", ""))
    pinned_widget = launcher.get("widgetArtifact", {})
    need(pinned_widget.get("manifestSha256") == widget_pin and pinned_widget.get("htmlSha256") == widget["sha256"] and
         pinned_widget.get("readOnlyMountsVerified") is True and pinned_widget.get("hashesUnchanged") is True,
         "LAUNCH_WIDGET_PIN_MISMATCH")
    browser = receipts["browser"]
    need(browser.get("sha") == args.revision and browser.get("sourceRun") == args.web_source_run and
         browser.get("exit") == 0 and browser.get("network") == "none" and browser.get("sourceReadOnly") is True and
         browser.get("allSourceHashesVerifiedBeforeAfter") is True and browser.get("sdkCacheHashesVerifiedBeforeAfter") is True and
         browser.get("webArtifactsUnchanged") is True, "NATIVE_BROWSER_GATE_MISSING")
    no_live_data(browser)
    output = browser.get("stdout", "")
    need(re.search(r"\b[1-9][0-9]* passed\b", output) and not re.search(r"\b[1-9][0-9]* (?:failed|skipped|flaky)\b", output),
         "NATIVE_BROWSER_NOT_ALL_PASSED")
    for engine in ("chromium", "webkit"):
        for scenario in ("authenticated browser flow", "fail-closed negative cases", "all 8 locales"):
            need(any("[" + engine + "]" in line and scenario in line and "✓" in line for line in output.splitlines()),
                 "NATIVE_BROWSER_SCENARIO_MISSING")
    web_root = web_source / "packages/web/dist"
    web_files = tree(web_root)
    need(web_files == browser.get("webArtifacts") and "index.html" in web_files, "BROWSER_WEB_BYTES_MISMATCH")
    for asset in widget["publicAssets"]:
        relative = asset["path"].removeprefix("packages/web/public/")
        need(web_files.get(relative) == {"sha256": asset["sha256"], "bytes": asset["bytes"]},
             "WEB_WIDGET_PUBLIC_ASSET_MISMATCH")
    verify_fullshow(receipts["full_show"], args.revision, widget_pin, widget)
    return {"source": source, "webSource": web_source, "manifest": manifest, "built": built,
            "artifact": artifact, "widget": widget, "widgetPin": widget_pin, "widgetRoot": widget_root,
            "webRoot": web_root, "webFiles": web_files, "receipts": receipts}


def stage_release(args):
    need(os.name == "posix" and os.geteuid() == 0, "LINUX_ROOT_REQUIRED")
    need(args.base_image == BASE_IMAGE, "UNREVIEWED_BASE_IMAGE")
    need(re.fullmatch(r"/home/ubuntu/tadazz-mcp-(?:candidate|release)-[a-zA-Z0-9-]+", args.release_dir), "RELEASE_PATH_REJECTED")
    image_tag = re.fullmatch(r"tadazz:mcp-([a-f0-9]{7,40})-[0-9]{8}(?:-[a-f0-9]{1,8})?", args.image)
    need(image_tag and args.revision.startswith(image_tag.group(1)), "IMAGE_TAG_REJECTED")
    stage = Path(args.release_dir)
    need(not os.path.lexists(stage), "RELEASE_ALREADY_EXISTS")
    plain(stage.parent, directory=True)
    need(shutil.disk_usage(stage.parent).free > 2 * 1024**3, "INSUFFICIENT_STAGING_SPACE")
    inputs = qualify_inputs(args)
    base = docker_inspect("image", args.base_image)
    need(base["Id"] == BASE_IMAGE and base.get("Os") == "linux" and base.get("Architecture") == "arm64", "BASE_IMAGE_MISMATCH")
    # Refuse even a reversible tag overwrite: every candidate remains reviewable.
    probe = subprocess.run(["docker", "image", "inspect", args.image], capture_output=True, timeout=15)
    need(probe.returncode != 0, "IMAGE_TAG_ALREADY_EXISTS")
    before = running_snapshot()
    stage.mkdir(mode=0o700)
    report = {"sourceSha": args.revision, "productionTouched": False, "customerMountUsed": False,
              "ok": False, "releaseDir": str(stage)}
    suffix = args.revision[:12] + "-" + uuid.uuid4().hex[:8]
    try:
        evidence = stage / "evidence"
        evidence.mkdir(mode=0o700)
        for name, receipt in inputs["receipts"].items():
            write_json(evidence / (name + "-receipt.json"), receipt)
        copy_pinned(inputs["built"] / "index.cjs", stage / "socket/index.cjs",
                    inputs["artifact"]["sha256"], inputs["artifact"]["bytes"])
        copy_pinned(inputs["widgetRoot"] / "full-show.html", stage / "mcp/full-show.html",
                    inputs["widget"]["sha256"], inputs["widget"]["bytes"])
        copy_pinned(inputs["widgetRoot"] / "full-show-artifact.json", stage / "mcp/full-show-artifact.json", inputs["widgetPin"])
        nginx_source = "extensions/deployment/nginx-mcp-routes.conf"
        copy_pinned(inputs["source"] / nginx_source, stage / "nginx/mcp-routes.conf", inputs["manifest"][nginx_source])
        for name, spec in inputs["webFiles"].items():
            data = read_bytes(inputs["webRoot"] / name)
            need(digest(data) == spec["sha256"] and len(data) == spec["bytes"], "WEB_CHANGED_DURING_COPY")
            write_new(stage / "web" / name, data)
        extractor = "tadazz-mcp-stage-base-" + suffix
        run(["docker", "create", "--pull=never", "--network", "none", "--name", extractor,
             "--label", "com.tadazz.mcp.staging=" + suffix, args.base_image])
        run(["docker", "cp", extractor + ":/etc/nginx/http.d/default.conf", str(stage / "nginx/default-original.conf")])
        original = read_bytes(stage / "nginx/default-original.conf", 65536).decode()
        need(original.count("server {") == 1 and "mcp-routes.conf" not in original and
             "root /app/web;" in original and "listen 3000;" in original and
             "include /etc/nginx/tadazz/server.conf;" in original, "BASE_NGINX_SHAPE_CHANGED")
        os.chmod(stage / "nginx/default-original.conf", 0o600)
        write_new(stage / "nginx/default.conf", original.replace("server {", "server {\n    include /etc/nginx/tadazz/mcp-routes.conf;", 1).encode())
        write_new(stage / "nginx/000-mcp-upstream.conf", b"upstream tadazz_native_mcp { server 127.0.0.1:3001; }\n")
        dockerfile = f'''FROM {args.base_image}
LABEL org.opencontainers.image.revision={args.revision}
LABEL com.tadazz.mcp.channel=private
ENV TADAZZ_MCP_SERVICE_ENABLED=true
COPY web/ /app/web/
COPY socket/index.cjs /app/socket/index.cjs
COPY mcp/ /app/mcp/
COPY nginx/default.conf /etc/nginx/http.d/default.conf
COPY nginx/mcp-routes.conf /etc/nginx/tadazz/mcp-routes.conf
COPY nginx/000-mcp-upstream.conf /etc/nginx/http.d/000-mcp-upstream.conf
RUN chmod -R a+rX /app/web && chmod 600 /app/socket/index.cjs /app/mcp/full-show.html /app/mcp/full-show-artifact.json && nginx -t
'''
        write_new(stage / "Dockerfile", dockerfile.encode())
        write_new(stage / ".dockerignore", b"evidence/\n*-result.json\nstage-manifest.json\n")
        payload = {name: spec for name, spec in tree(stage).items() if not name.startswith("evidence/")}
        environment = {**os.environ, "DOCKER_BUILDKIT": "0"}
        run(["docker", "build", "--pull=false", "--network=none", "--memory=1g", "--memory-swap=1g",
             "--cpuset-cpus=0", "--tag", args.image, str(stage)], timeout=900,
             log=evidence / "docker-build.log", env=environment)
        built_image = docker_inspect("image", args.image)
        need(built_image["Config"].get("Labels", {}).get("org.opencontainers.image.revision") == args.revision,
             "BUILT_IMAGE_REVISION_MISMATCH")
        need(built_image.get("Os") == "linux" and built_image.get("Architecture") == "arm64", "BUILT_IMAGE_PLATFORM_MISMATCH")
        verify_source(inputs["source"], inputs["manifest"])
        need(tree(inputs["webRoot"]) == inputs["webFiles"], "WEB_CHANGED_DURING_BUILD")
        smoke = synthetic_smoke(stage, built_image["Id"], args.revision, suffix)
        need({name: spec for name, spec in tree(stage).items() if name in payload} == payload,
             "STAGED_PAYLOAD_CHANGED")
        stage_manifest = {
            "format": "tadazz-mcp-stage", "version": 2, "sourceSha": args.revision,
            "sourceRun": args.source_run, "webSourceRun": args.web_source_run,
            "baseImage": args.base_image, "image": args.image, "imageId": built_image["Id"],
            "backendSha256": inputs["artifact"]["sha256"],
            "widgetManifestSha256": inputs["widgetPin"], "widgetHtmlSha256": inputs["widget"]["sha256"],
            "rendererBuildId": inputs["widget"]["rendererBuildId"],
            "publicAssetCount": len(inputs["widget"]["publicAssets"]),
            "artifacts": {name: spec["sha256"] for name, spec in payload.items()},
            "artifactBytes": {name: spec["bytes"] for name, spec in payload.items()},
            "receiptSha256": {name: digest(read_bytes(evidence / (name + "-receipt.json"))) for name in inputs["receipts"]},
            "syntheticSmokeSha256": digest(read_bytes(stage / "synthetic-smoke-result.json")),
            "productionTouched": False, "customerMountUsed": False, "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }
        write_json(stage / "stage-manifest.json", stage_manifest)
        need(running_snapshot() == before, "RUNNING_CONTAINERS_CHANGED")
        report.update(ok=True, image=args.image, imageId=built_image["Id"],
                      stageManifestSha256=digest(read_bytes(stage / "stage-manifest.json")),
                      backendSha256=inputs["artifact"]["sha256"], widgetManifestSha256=inputs["widgetPin"],
                      payloadFiles=len(payload), syntheticSmokePassed=smoke["ok"], runningContainersUnchanged=True)
    except Exception as error:
        report["error"] = str(error) if isinstance(error, GateError) else type(error).__name__
        report["runningContainersUnchanged"] = running_snapshot() == before
        raise
    finally:
        write_json(stage / "stage-result.json", report)
        print(json.dumps(report, sort_keys=True))


def self_test():
    # Concrete gate witnesses: traversal, same-size tampering, and missing engine checks.
    for bad in ("../x", "/etc/passwd", "a/../b", "a\\b", "a//b"):
        try:
            safe_relative(bad)
        except GateError:
            pass
        else:
            raise AssertionError("traversal accepted")
    with tempfile.TemporaryDirectory(prefix="tadazz-stage-selftest-") as temporary:
        root = Path(temporary)
        write_new(root / "x", b"one")
        manifest = {"x": digest(b"one")}
        verify_source(root, manifest)
        (root / "x").write_bytes(b"two")
        try:
            verify_source(root, manifest)
        except GateError:
            pass
        else:
            raise AssertionError("tampering accepted")
        try:
            copy_pinned(root / "x", root / "unqualified", manifest["x"], 3)
        except GateError:
            need(not (root / "unqualified").exists(), "UNQUALIFIED_ARTIFACT_WRITTEN")
        else:
            raise AssertionError("changed-after-qualification artifact copied")
        (root / "link").symlink_to(root / "x")
        try:
            tree(root)
        except GateError:
            pass
        else:
            raise AssertionError("symlink accepted")
    tap_success("# pass 12\n# fail 0\n# cancelled 0\n# skipped 0\n")
    try:
        tap_success("# pass 11\n# fail 0\n# cancelled 0\n# skipped 1\n")
    except GateError:
        pass
    else:
        raise AssertionError("skipped release gate accepted")
    print(json.dumps({"selfTest": "PASS", "checks": ["traversal", "same-size-tamper", "changed-after-qualification-copy", "symlink", "no-skipped-gate"]}))


def main():
    if sys.argv[1:] == ["--self-test"]:
        self_test()
        return 0
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-run", required=True)
    parser.add_argument("--web-source-run")
    parser.add_argument("--revision", required=True)
    parser.add_argument("--release-dir", required=True)
    parser.add_argument("--image", required=True)
    parser.add_argument("--base-image", default=BASE_IMAGE)
    for name in ("host", "launch", "web", "browser", "full-show"):
        parser.add_argument("--" + name + "-receipt", required=True)
    args = parser.parse_args()
    args.web_source_run = args.web_source_run or args.source_run
    stage_release(args)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (GateError, OSError, ValueError, KeyError, subprocess.SubprocessError) as error:
        print(json.dumps({"ok": False, "gate": str(error) if isinstance(error, GateError) else type(error).__name__}), file=sys.stderr)
        raise SystemExit(1)

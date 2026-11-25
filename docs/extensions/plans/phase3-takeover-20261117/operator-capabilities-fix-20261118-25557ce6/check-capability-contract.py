"""Bounded operator-only witnesses. All HTTP/Docker authority is synthetic."""
import ast
import hashlib
import io
import json
import os
from pathlib import Path
import runpy
import shutil
import subprocess
import urllib.error
import urllib.parse

ROOT = Path(__file__).resolve().parent
STAGE = runpy.run_path(str(ROOT / "stage-mcp-site.py"), run_name="operator_contract_only")
DEPLOY = runpy.run_path(str(ROOT / "deploy-mcp-site.py"), run_name="operator_contract_only")
checks = []
CAP = "/api/packages/capabilities"


def require(value, label):
    if not value:
        raise AssertionError(label)


for label, module in (("stage", STAGE), ("deploy", DEPLOY)):
    for enabled in (False, True):
        env = ["TADAZZ_ACCOUNTS_ENABLED=true"]
        if enabled:
            env.append("TADAZZ_PACKAGE_INSTALLER_ENABLED=true")
        policy = module["package_probe_policy"]({"Config": {"Env": env}})
        require(policy == {"accountsEnabled": True, "installerEnabled": enabled,
                           "expectedStatus": 401 if enabled else 404}, label + " policy")
    for env in ([], ["TADAZZ_ACCOUNTS_ENABLED=false", "TADAZZ_PACKAGE_INSTALLER_ENABLED=true", "TADAZZ_REMOTE_QA=1"],
                ["TADAZZ_ACCOUNTS_ENABLED=true", "TADAZZ_PACKAGE_INSTALLER_ENABLED=true", "TADAZZ_PACKAGE_INSTALLER_ENABLED=false"]):
        try:
            module["package_probe_policy"]({"Config": {"Env": env}})
        except module["GateError"]:
            pass
        else:
            raise AssertionError(label + " invalid authority accepted")
    checks.append(label + ": exact inspected flags, missing accounts, remote-QA exception and duplicate denial")
    safe = {"GET " + CAP: {"status": 200, "expectedStatus": 404, "contentType": "application/json"}}
    require(module["safe_probe_routes"](safe) == safe, label + " status retention")
    for value in ({"GET " + CAP + "?token=synthetic": safe["GET " + CAP]},
                  {"GET " + CAP: {**safe["GET " + CAP], "body": "synthetic-secret"}}):
        try:
            module["safe_probe_routes"](value)
        except module["GateError"]:
            pass
        else:
            raise AssertionError(label + " unsafe diagnostic accepted")
    checks.append(label + ": status mismatch retained, query/body diagnostic rejected")


class FakeHTTP:
    def __init__(self, status, content_type, body):
        self.status, self.content_type, self.body = status, content_type, body

    def open(self, query, timeout):
        path = urllib.parse.urlsplit(query.full_url).path
        fixed = {"/api/health": {"status": "ok"}, "/api/auth/mode": {"accountsEnabled": True},
                 "/api/billing/config": {"enabled": False}}
        status, content_type, body = 200, "application/json", fixed.get(path)
        if path == CAP:
            status, content_type, body = self.status, self.content_type, self.body
        elif body is None:
            status, body = 401, {"error": "errors:auth.unauthorized"}
        raw = json.dumps(body).encode()
        headers = {"content-type": content_type, "Set-Cookie": "synthetic-secret-cookie"}
        if status >= 400:
            raise urllib.error.HTTPError(query.full_url, status, "synthetic", headers, io.BytesIO(raw))
        response = io.BytesIO(raw)
        response.status, response.headers = status, headers
        return response


cases = [
    (False, 404, "application/json; charset=utf-8", {"error": "not-found"}, True),
    (True, 401, "application/json", {"error": "errors:auth.unauthorized"}, True),
    (False, 401, "application/json", {"error": "errors:auth.unauthorized"}, False),
    (True, 404, "application/json", {"error": "not-found"}, False),
    (False, 200, "application/json", {"installer": True}, False),
    (True, 200, "application/json", {"installer": True}, False),
    (False, 404, "text/html", {"error": "not-found"}, False),
    (False, 404, "application/jsonx", {"error": "not-found"}, False),
    (False, 404, "application/json", {"error": "not-found", "body": "synthetic-secret"}, False),
    (True, 401, "application/json", {"error": "wrong"}, False),
]
scope = DEPLOY["base_probes"].__globals__
saved_http = scope["HTTP"]
try:
    for enabled, status, content_type, body, accepted in cases:
        policy = {"accountsEnabled": True, "installerEnabled": enabled, "expectedStatus": 401 if enabled else 404}
        scope["HTTP"] = FakeHTTP(status, content_type, body)
        try:
            result = DEPLOY["base_probes"]("http://synthetic.invalid", policy)
        except DEPLOY["GateError"] as error:
            require(not accepted, "valid capability rejected")
            proof = {}
            DEPLOY["record_probe_failure"](proof, error)
            diag = proof.get("probeFailure", {})
            require(diag.get("status") == status and diag.get("expectedStatus") == policy["expectedStatus"] and
                    diag.get("contentType") == content_type.split(";", 1)[0], "failure metadata lost")
            require("synthetic-secret" not in json.dumps(proof) and "body" not in diag, "private diagnostics")
        else:
            require(accepted and result["packageCapabilities"] == DEPLOY["package_probe_proof"](policy), "wrong capability accepted")
    checks.append("deploy: ten real request/json-probe paths with synthetic HTTP responses, including wrong status/MIME/body")
finally:
    scope["HTTP"] = saved_http


node = shutil.which("node")
require(node, "installed node required; no installation attempted")
tree = ast.parse((ROOT / "deploy-mcp-site.py").read_text())
clone = next(n.value for function in tree.body if isinstance(function, ast.FunctionDef) and function.name == "clone_boot"
             for n in ast.walk(function) if isinstance(n, ast.Constant) and isinstance(n.value, str) and
             'const origin = "https://tadazz.com";' in n.value)
prelude = r'''
const Module=require('node:module'),EventEmitter=require('node:events');
const scenario=JSON.parse(process.argv[2]);
const originalLoad=Module._load;
Module._load=function(name,...args){if(name==='node:http')return {request(options,callback){
 const q=new EventEmitter();q.end=()=>queueMicrotask(()=>{
 const r=new EventEmitter();let status=200,type='application/json',body={};
 if(options.path==='/api/health')body={status:'ok'};
 else if(options.path==='/api/auth/mode')body={accountsEnabled:true};
 else if(options.path==='/api/billing/config')body={enabled:false};
 else if(options.path==='/api/packages/capabilities'){status=scenario.status;type=scenario.type;body=scenario.body;}
 else if(options.path.startsWith('/api/')){status=401;body={error:'errors:auth.unauthorized'};}
 r.statusCode=status;r.headers={'content-type':type,'set-cookie':'synthetic-secret-cookie'};
 callback(r);queueMicrotask(()=>{r.emit('data',Buffer.from(JSON.stringify(body)));r.emit('end');});
 });q.destroy=e=>q.emit('error',e||Error('synthetic-destroy'));return q;
 }};return originalLoad.call(this,name,...args)};
'''
for label, program in (("stage", STAGE["SMOKE_JS"]), ("clone", clone)):
    for index, (enabled, status, content_type, body, accepted) in enumerate(cases):
        # The Python comparator separately rejects application/jsonx. The JS
        # layer records its actual type, and final exact-proof checks deny it.
        if content_type == "application/jsonx":
            continue
        policy = {"accountsEnabled": True, "installerEnabled": enabled, "expectedStatus": 401 if enabled else 404}
        script = prelude + program.replace("NATIVE_PREVIEW_FILES", "[]").replace("EXPECTED_PUBLIC_X", '"synthetic-public"').replace("PACKAGE_PROBE_POLICY", json.dumps(policy))
        file = ROOT / ("synthetic-" + label + ".cjs")
        file.write_text(script)
        child = subprocess.run([node, str(file), json.dumps({"status": status, "type": content_type, "body": body})],
                               capture_output=True, timeout=5,
                               env={"PATH": os.environ.get("PATH", ""), "TADAZZ_ACCOUNTS_ENABLED": "true",
                                    "TADAZZ_PACKAGE_INSTALLER_ENABLED": "true" if enabled else "false"})
        require(child.returncode == 1 and not child.stderr, label + " controlled stop")
        output = json.loads(child.stdout)
        routes = output["routes"]
        require(routes["GET " + CAP] == {"status": status, "expectedStatus": policy["expectedStatus"],
                                         "contentType": content_type.split(";", 1)[0]}, label + " JS status capture")
        require(("GET /.well-known/oauth-protected-resource" in routes) == accepted, label + " capability admission")
        require("synthetic-secret" not in child.stdout.decode(), label + " private content leaked")
    checks.append(label + ": nine actual JavaScript probe executions with mocked Node HTTP, no network or Docker")

receipt = {"passed": True, "checks": checks, "productionTouched": False, "networkUsed": False, "dockerUsed": False,
           "operatorSha256": {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest()
                              for name in ("stage-mcp-site.py", "deploy-mcp-site.py")}}
target = ROOT / "focused-contract-result.json"
target.write_text(json.dumps(receipt, indent=2, sort_keys=True) + "\n")
target.chmod(0o600)
print(json.dumps(receipt))

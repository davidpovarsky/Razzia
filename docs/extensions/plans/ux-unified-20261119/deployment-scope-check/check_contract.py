"""Bounded synthetic checks of the actual three deployment probe paths."""
import ast
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess


ROOT = Path(__file__).resolve().parents[3]
FILES = [ROOT / "extensions/deployment" / name for name in (
    "stage-mcp-site.py", "deploy-mcp-site.py",
)]
EXPECTED = ["tadazz.catalog.read", "tadazz.drafts.write", "tadazz.drafts.read",
            "tadazz.library.write", "tadazz.exports.read"]
ORIGIN = "https://tadazz.com"
CHALLENGE = ('Bearer resource_metadata="' + ORIGIN +
             '/.well-known/oauth-protected-resource", scope="' + " ".join(EXPECTED) + '"')


def load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    assert list(module.MCP_SCOPES) == EXPECTED
    assert module.MCP_CHALLENGE == CHALLENGE
    return module


stage, deploy = [load(path, "scope_check_" + str(i)) for i, path in enumerate(FILES)]
fixture = {
    "resource": {"resource": ORIGIN + "/mcp", "authorization_servers": [ORIGIN + "/oauth"],
                 "scopes_supported": EXPECTED},
    "issuer": {"issuer": ORIGIN + "/oauth", "authorization_endpoint": ORIGIN + "/oauth/authorize",
               "token_endpoint": ORIGIN + "/oauth/token", "code_challenge_methods_supported": ["S256"],
               "scopes_supported": EXPECTED},
    "challenge": CHALLENGE,
}
cases = [("exact-five-scope-contract", fixture, None)]
for label, field, value, failure in (
    ("old-single-scope-challenge", "challenge", CHALLENGE.replace(" ".join(EXPECTED), EXPECTED[0]), "MCP_CHALLENGE_MISMATCH"),
    ("extra-challenge-scope", "challenge", CHALLENGE[:-1] + ' tadazz.unexpected"', "MCP_CHALLENGE_MISMATCH"),
    ("wrong-resource-in-challenge", "challenge", CHALLENGE.replace("tadazz.com", "example.invalid"), "MCP_CHALLENGE_MISMATCH"),
    ("missing-challenge", "challenge", None, "MCP_CHALLENGE_MISMATCH"),
):
    changed = copy.deepcopy(fixture)
    changed[field] = value
    cases.append((label, changed, failure))
for field, failure in (("resource", "RESOURCE_SCOPES_MISMATCH"), ("issuer", "ISSUER_SCOPES_MISMATCH")):
    for label, scopes in (("missing", None), ("single", EXPECTED[:1]), ("extra", EXPECTED + ["tadazz.unexpected"]),
                          ("duplicate", EXPECTED + EXPECTED[:1]), ("reordered", EXPECTED[::-1])):
        changed = copy.deepcopy(fixture)
        changed[field]["scopes_supported"] = scopes
        cases.append((field + "-" + label + "-scopes", changed, failure))


class ReachedConsent(Exception):
    pass


checked = []
for label, data, expected_failure in cases:
    observed = []

    def json_probe(origin, path, status=200):
        observed.append((path, status))
        if path == "/.well-known/oauth-protected-resource":
            return data["resource"], {}
        if path == "/.well-known/oauth-authorization-server/oauth":
            return data["issuer"], {}
        if path == "/oauth/jwks.json":
            return {"keys": [{"kid": "synthetic", "kty": "OKP", "crv": "Ed25519", "x": "public-test"}]}, {}
        assert path == "/mcp" and status == 401
        return {}, {"headers": {"www-authenticate": data["challenge"]}}

    def request(origin, path, **kwargs):
        assert path == "/studio/oauth-consent?oauth_request=release-smoke"
        assert ("/mcp", 401) in observed
        raise ReachedConsent()

    deploy.json_probe, deploy.request = json_probe, request
    try:
        deploy.mcp_probes(ORIGIN, None, {"keyId": "synthetic"}, "public-test")
    except ReachedConsent:
        assert expected_failure is None, label
    except deploy.GateError as error:
        assert str(error) == expected_failure, (label, str(error), expected_failure)
    else:
        raise AssertionError("Probe unexpectedly completed")
    checked.append("python-mcp-probes/" + label)

deploy_tree = ast.parse(FILES[1].read_text())
clone = next(node.value for node in ast.walk(deploy_tree)
             if isinstance(node, ast.Constant) and isinstance(node.value, str)
             and "const expectedX = EXPECTED_PUBLIC_X;" in node.value)
for name, program in (("synthetic-smoke", stage.SMOKE_JS), ("restored-clone", clone)):
    program = (program.replace("EXPECTED_MCP_SCOPES", json.dumps(EXPECTED))
               .replace("EXPECTED_MCP_CHALLENGE", json.dumps(CHALLENGE))
               .replace("NATIVE_PREVIEW_FILES", "[]").replace("PACKAGE_PROBE_POLICY", "{}")
               .replace("EXPECTED_PUBLIC_X", '"public-test"'))
    syntax = subprocess.run(["node", "--check"], input=program, text=True, capture_output=True)
    assert syntax.returncode == 0, syntax.stderr
    if name == "synthetic-smoke":
        selected = [line for line in program.splitlines() if line.startswith((
            "const resource=", "ok(JSON.stringify(resource.scopes_supported)",
            "const issuer=", "ok(JSON.stringify(issuer.scopes_supported)", "const mcp=",
        ))]
        assert len(selected) == 5
    else:
        selected = [line for line in program.splitlines() if line.lstrip().startswith((
            "const metadata=", "if(metadata.resource", "if(JSON.stringify(metadata.scopes_supported)",
            "const mcp=", 'if(mcp.headers.get("www-authenticate")',
        ))]
        assert len(selected) == 5
    header = """
const assert=require('node:assert/strict');
const cases=__CASES__,origin=__ORIGIN__,expectedScopes=__SCOPES__,expectedChallenge=__CHALLENGE__;
const tested=[];
(async()=>{for(const [label,data,expectedFailure] of cases){
 const ok=(condition,code='probe')=>{if(!condition)throw Error(code)};
 const fail=(code='probe')=>{throw Error(code)};
 const json=async(path)=>path.includes('protected-resource')?data.resource:data.issuer;
 const req=async(path,status)=>{assert.equal(path,'/mcp');assert.equal(status,401);
  return {headers:{'www-authenticate':data.challenge,'content-type':'application/json',get:()=>data.challenge},body:'{}'}};
 let failure=null;try{__BODY__}catch(error){failure=error.message}
 assert.equal(failure,expectedFailure,label);tested.push(label);
}process.stdout.write(JSON.stringify({tested}));})().catch(error=>{console.error(error);process.exitCode=1});
"""
    # The restored-clone path reads resource metadata through req rather than json.
    if name == "restored-clone":
        header = header.replace("assert.equal(path,'/mcp');", "if(path==='/.well-known/oauth-protected-resource')return {json:async()=>data.resource};assert.equal(path,'/mcp');")
    applicable = [case for case in cases if name == "synthetic-smoke" or not case[0].startswith("issuer-")]
    script = (header.replace("__CASES__", json.dumps(applicable)).replace("__ORIGIN__", json.dumps(ORIGIN))
              .replace("__SCOPES__", json.dumps(EXPECTED)).replace("__CHALLENGE__", json.dumps(CHALLENGE))
              .replace("__BODY__", "\n".join(selected)))
    result = subprocess.run(["node", "-"], input=script, text=True, capture_output=True)
    assert result.returncode == 0, result.stderr
    checked.extend(name + "/" + case for case in json.loads(result.stdout)["tested"])

print(json.dumps({"passed": True, "checks": checked,
                  "sourceHashes": {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in FILES},
                  "networkUsed": False, "dockerUsed": False, "customerFilesRead": False}, indent=2))

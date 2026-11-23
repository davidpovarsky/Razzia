"""Check the declared E2E routing against real Playwright discovery and results.

This helper never starts a server, opts into private/live tests, or executes
operator cases. Their gate requires a trusted status for the same candidate.
"""
import argparse
from collections import Counter
import json
from pathlib import Path
import re
import subprocess
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parents[2]
LEDGER = ROOT / "packages/e2e/ci-case-routing.json"
OPERATOR_CONTEXT = "Tadazz / operator E2E"
OPERATOR_CREATOR = {"login": "davidpovarsky", "id": 202663769}


def identity(case):
    return case["file"], case["title"]


def read_ledger():
    ledger = json.loads(LEDGER.read_text(encoding="utf-8"))
    assert ledger["schemaVersion"] == 1
    old = [case for lane in ledger["lanes"] for case in lane["cases"]]
    old += [case for lane in ledger["operatorLanes"] for case in lane["cases"]]
    identities = [(case["file"], case["title"]) for case in old]
    assert len(identities) == len(set(identities)) == 153
    assert len({case["file"] for case in old}) == 46
    assert sum(len(lane["cases"]) for lane in ledger["operatorLanes"]) == 8
    normal = ledger["normalSpeedAcceptance"]
    assert len(normal["cases"]) == 7
    assert not set(map(identity, normal["cases"])) & set(identities)
    all_lanes = [*ledger["lanes"], *ledger["operatorLanes"], normal]
    names = [lane["name"] for lane in all_lanes]
    assert len(names) == len(set(names))
    for lane in all_lanes:
        assert set(lane["files"]) == {case["file"] for case in lane["cases"]}
        assert len(lane["files"]) == len(set(lane["files"]))
        assert all(re.fullmatch(r"[a-z0-9-]+\.(?:spec|acceptance)\.ts", name) for name in lane["files"])
        assert re.fullmatch(r"playwright(?:\.[a-z0-9-]+)?\.config\.ts", lane["config"])
        assert lane["projects"] and len(lane["projects"]) == len(set(lane["projects"]))
        assert all(isinstance(case["title"], str) and case["title"] for case in lane["cases"])
        assert set(map(identity, lane["existingGuardedCases"])) <= set(map(identity, lane["cases"]))
    guarded = [identity(case) for lane in all_lanes for case in lane["existingGuardedCases"]]
    assert len(guarded) == len(set(guarded)) == 7
    return ledger


def selected_lane(ledger, name):
    if name == "generic-discovery":
        return {
            "name": name,
            "projects": ["chromium"],
            "cases": [case for lane in [*ledger["lanes"], *ledger["operatorLanes"]] for case in lane["cases"]],
        }
    matches = [lane for lane in [*ledger["lanes"], ledger["normalSpeedAcceptance"]] if lane["name"] == name]
    assert len(matches) == 1, "Unknown or operator-only lane"
    return matches[0]


def expected_identities(lane):
    return [(project, *identity(case)) for project in lane["projects"] for case in lane["cases"]]


def require_exact_identities(actual, expected):
    assert len(actual) == len(set(actual)), "Duplicate case identity"
    assert Counter(actual) == Counter(expected), {
        "missing": list((Counter(expected) - Counter(actual)).elements()),
        "extra": list((Counter(actual) - Counter(expected)).elements()),
    }


def verify_list(lane, text):
    rows = []
    totals = []
    text = re.sub(r"\x1b\[[0-?]*[ -/]*[@-~]", "", text)
    for line in text.splitlines():
        match = re.fullmatch(r"\s*\[([^]]+)\] › ([^:]+):(\d+):(\d+) › (.+)", line)
        if match:
            rows.append((match[1], Path(match[2]).name, match[5]))
        total = re.fullmatch(r"Total: (\d+) tests? in (\d+) files?", line)
        if total:
            totals.append((int(total[1]), int(total[2])))
    require_exact_identities(rows, expected_identities(lane))
    assert totals == [(len(rows), len({row[1] for row in rows}))], "Missing or inconsistent actual collection total"
    return {"lane": lane["name"], "discoveryMatched": True, "sourceCases": len(lane["cases"]), "projectExecutions": len(rows), "projects": lane["projects"], "runtimeExecuted": False}


def report_cases(report):
    rows = []

    def visit(suite, ancestors, file_suite=False):
        titles = ancestors if file_suite else [*ancestors, suite["title"]]
        for spec in suite.get("specs", []):
            title = " › ".join([*titles, spec["title"]])
            for test in spec["tests"]:
                rows.append((test["projectName"], Path(spec["file"]).name, title, test))
        for child in suite.get("suites", []):
            visit(child, titles)

    for suite in report["suites"]:
        visit(suite, [], file_suite=True)
    return rows


def verify_result(lane, report):
    assert report["errors"] == [], "Playwright reported a global error"
    assert sorted(project["name"] for project in report["config"]["projects"]) == sorted(lane["projects"])
    rows = report_cases(report)
    require_exact_identities([row[:3] for row in rows], expected_identities(lane))
    guarded = {(project, *identity(case)) for project in lane["projects"] for case in lane["existingGuardedCases"]}
    for project, file, title, test in rows:
        expected_outcome = "skipped" if (project, file, title) in guarded else "expected"
        assert test["status"] == expected_outcome, (file, title, test["status"])
        assert test["results"], "No actual Playwright result"
        if expected_outcome == "expected":
            assert test["expectedStatus"] == "passed"
            assert all(result["status"] == "passed" for result in test["results"])
        else:
            assert all(result["status"] == "skipped" for result in test["results"])
    stats = report["stats"]
    for key in ["unexpected", "flaky", "skipped", "expected"]:
        assert type(stats[key]) is int and stats[key] >= 0
    assert stats["unexpected"] == 0 and stats["flaky"] == 0
    assert stats["skipped"] == len(guarded) and stats["expected"] == len(rows) - len(guarded)
    return {"lane": lane["name"], "runtimePassed": True, "actualExpected": stats["expected"], "existingGuardedSkips": len(guarded), "unexpected": 0, "flaky": 0, "allActualCaseIdentitiesMatched": True, "operatorAcceptanceAdmitted": False}


def verify_operator_status(revision, pages):
    assert re.fullmatch(r"[a-f0-9]{40}", revision)
    assert isinstance(pages, list) and pages, "No GitHub status response"
    assert all(page["sha"] == revision for page in pages), "Status belongs to a different revision"
    statuses = [status for page in pages for status in page["statuses"] if status["context"] == OPERATOR_CONTEXT]
    # The combined-status endpoint returns the latest status for each context.
    assert len(statuses) == 1, "OPERATOR_REQUIRED: no unique current operator status"
    status = statuses[0]
    assert status["state"] == "success", "OPERATOR_REQUIRED: eight cases are not qualified"
    assert all(status["creator"][key] == value for key, value in OPERATOR_CREATOR.items()), "Untrusted operator status creator"
    digest = re.fullmatch(r"8/8 same-head PASS; sha256:([a-f0-9]{64})", status["description"] or "")
    assert digest, "Missing full operator receipt digest"
    target = urlparse(status["target_url"] or "")
    assert target.scheme == "https" and target.netloc and not target.username and not target.password, "HTTPS operator evidence URL required"
    assert type(status["id"]) is int and status["id"] > 0
    return {"revision": revision, "context": OPERATOR_CONTEXT, "operatorStatusAccepted": True, "runtimeExecutedByGate": False, "sourceCases": 8, "statusId": status["id"], "creator": OPERATOR_CREATOR, "receiptSha256": digest[1], "evidenceUrl": status["target_url"]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    selectors = commands.add_parser("selectors")
    selectors.add_argument("lane")
    discovery = commands.add_parser("verify-list")
    discovery.add_argument("lane")
    discovery.add_argument("list_file", type=Path)
    runtime = commands.add_parser("verify-result")
    runtime.add_argument("lane")
    runtime.add_argument("report_file", type=Path)
    commands.add_parser("operator-contract")
    operator = commands.add_parser("verify-operator-status")
    operator.add_argument("revision")
    operator.add_argument("statuses_file", type=Path)
    args = parser.parse_args()
    ledger = read_ledger()
    if args.command == "operator-contract":
        revision = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
        assert re.fullmatch(r"[a-f0-9]{40}", revision)
        print(json.dumps({"revision": revision, "status": "OPERATOR_REQUIRED", "sourceCases": 8, "runtimeExecuted": False, "passed": False, "requiredStatusContext": OPERATOR_CONTEXT, "trustedStatusCreator": OPERATOR_CREATOR, "lanes": ledger["operatorLanes"]}, indent=2))
        return
    if args.command == "verify-operator-status":
        result = verify_operator_status(args.revision, json.loads(args.statuses_file.read_text(encoding="utf-8")))
        print(json.dumps(result, indent=2))
        return
    lane = selected_lane(ledger, args.lane)
    if args.command == "selectors":
        for name in lane["files"]:
            print(r"(^|/)" + re.escape(name) + "$")
        return
    if args.command == "verify-list":
        print(json.dumps(verify_list(lane, args.list_file.read_text(encoding="utf-8")), indent=2))
        return
    assert args.lane != "generic-discovery"
    report = json.loads(args.report_file.read_text(encoding="utf-8"))
    print(json.dumps(verify_result(lane, report), indent=2))


if __name__ == "__main__":
    main()

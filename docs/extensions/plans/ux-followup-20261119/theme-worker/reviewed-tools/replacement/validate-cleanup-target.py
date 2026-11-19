from pathlib import Path
import ast, hashlib, json
here = Path(__file__).resolve().parent
helper = here / "run_replacement_smoke.py"
tree = ast.parse(helper.read_text("utf-8"))
main = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == "main")
bindings = [node for node in ast.walk(main) if isinstance(node, ast.Name) and node.id == "name" and isinstance(node.ctx, ast.Store)]
assert len(bindings) == 1, "Docker name must have exactly one binding in main"
assignment = next(node for node in ast.walk(main) if isinstance(node, ast.Assign) and any(isinstance(target, ast.Name) and target.id == "name" for target in node.targets))
assert ast.unparse(assignment.value) == "'tadazz-ux-theme-worker-' + args.run_id", "Unexpected owned name derivation"
cleanup_calls = [node for node in ast.walk(main) if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == "clean_owned_container"]
assert len(cleanup_calls) == 1 and [ast.unparse(arg) for arg in cleanup_calls[0].args] == ["name", "owner"], "Cleanup must receive owned name and owner"
final_calls = [node for block in ast.walk(main) if isinstance(block, ast.Try) for final in block.finalbody for node in ast.walk(final) if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == "clean_owned_container"]
assert len(final_calls) == 1 and final_calls[0] is cleanup_calls[0], "Owned cleanup must remain in finally"
command = next(node for node in ast.walk(main) if isinstance(node, ast.Assign) and any(isinstance(target, ast.Name) and target.id == "command" for target in node.targets))
assert isinstance(command.value, ast.List)
args = command.value.elts
i = next(i for i, node in enumerate(args) if isinstance(node, ast.Constant) and node.value == "--name")
assert isinstance(args[i + 1], ast.Name) and args[i + 1].id == "name", "Docker launch and cleanup must use same name"
out = {"status":"PASS","helperSha256":hashlib.sha256(helper.read_bytes()).hexdigest(),"singleContainerNameBinding":True,"launchAndFinallyUseSameOwnedName":True,"containerExecuted":False,"guard":"Python AST binding and finally-call verification"}
(here / "cleanup-target-check.json").write_text(json.dumps(out, indent=2) + "\n", encoding="utf-8")
print(json.dumps(out))

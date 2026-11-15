"""Prepare one correction with real legacy-body accounting and a deadline."""
from pathlib import Path

HERE=Path(__file__).resolve().parent
source=(HERE/'correct-oauth-candidate.py').read_text()
replacements={
    "base=Path('/ram/work');root=Path('/ram/work-oauth-fixed')":"base=Path('/ram/work-oauth-fixed');root=Path('/ram/work-oauth-legacy')",
    "old=json.loads((E/'formatted-input-manifest.json').read_text())":"old=json.loads((E/'fixed-formatted-input-manifest.json').read_text())",
    "'/ram/work-oauth-fixed'":"'/ram/work-oauth-legacy'",
    'fixed-raw-input-manifest':'legacy-raw-input-manifest',
    'fixed-semantic-equivalence':'legacy-semantic-equivalence',
    'fixed-formatted':'legacy-formatted','format-fixed.mjs':'format-legacy.mjs',
    '06-fixed-format':'10-legacy-format','07-fixed-typecheck':'11-legacy-typecheck',
    '08-fixed-first-party-oauth':'12-legacy-first-party-oauth','09-fixed-sdk':'13-legacy-sdk',
    'fixed-candidate-summary':'legacy-candidate-summary','fixed-dispatch':'legacy-dispatch',
}
for before,after in replacements.items():source=source.replace(before,after)
source=source.replace("base=Path('/ram/work-oauth-legacy')","base=Path('/ram/work-oauth-fixed')")
source=source.replace("old=json.loads((E/'legacy-formatted-input-manifest.json').read_text())",
    "old=json.loads((E/'fixed-formatted-input-manifest.json').read_text())")
source=source.replace("'/ram/work-oauth-fixed').replace", "'/ram/work-oauth-legacy').replace")
insertion='''import ast,re
match=re.search(r'const files = (\\[.*?\\])',formatter,flags=re.S)
files=ast.literal_eval(match.group(1));files.append('tests/server/http.nodecheck.ts')
formatter=formatter[:match.start()]+"const files = "+repr(files)+formatter[match.end():]
formatter=formatter.replace('comparedTypeScriptFiles: 9','comparedTypeScriptFiles: 10').replace('unchangedOtherInputs: 161','unchangedOtherInputs: 160')
'''
source=source.replace("script=r'''",insertion+"\nscript=r'''",1)
(HERE/'validate-oauth-legacy.py').write_text(source,newline='\n')
print('Prepared legacy/OAuth exact correction runner')

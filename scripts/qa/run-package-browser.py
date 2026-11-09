"""Run private browser QA while an operator-side sandbox broker handles build jobs."""
import argparse, pathlib, re, subprocess, threading, time
parser = argparse.ArgumentParser()
parser.add_argument('--image', required=True)
parser.add_argument('--root', required=True, type=pathlib.Path)
parser.add_argument('--source-root', choices=['/cleanup', '/verify'], default='/cleanup')
parser.add_argument('--config-name', default='package-staging-config')
args = parser.parse_args()
if not re.fullmatch(r'package-staging-[a-z0-9-]+', args.config_name):
    raise SystemExit('Private QA configuration name required')
root = args.root.resolve(strict=True)
evidence = root/'evidence'
store = evidence/args.config_name/'extensions/packages'
stop = threading.Event()
worker = root/'package-build-worker.py'
def builds():
    with (evidence/'isolated-builder.log').open('a') as log:
        while not stop.is_set():
            if store.is_dir():
                subprocess.run(['python3',str(worker),str(store),'--image',args.image],stdout=log,stderr=subprocess.STDOUT)
            stop.wait(2)
thread = threading.Thread(target=builds)
thread.start()
try:
    with (evidence/'package-browser.log').open('w') as log:
        result = subprocess.run(['docker','exec','-e',f'TADAZZ_PACKAGE_QA_CONFIG_PATH=/evidence/{args.config_name}','-w',args.source_root,'tadazz-package-runtime-qa','pnpm','--filter','@razzia/e2e','exec','playwright','test','--config','playwright.package-runtime.config.ts'],stdout=log,stderr=subprocess.STDOUT)
    (evidence/'package-browser-exit.txt').write_text(str(result.returncode))
finally:
    stop.set()
    thread.join(timeout=60)
raise SystemExit(result.returncode)

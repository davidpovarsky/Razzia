"""Run private browser QA while an operator-side sandbox broker handles build jobs."""
import argparse, pathlib, subprocess, threading, time
parser = argparse.ArgumentParser()
parser.add_argument('--image', required=True)
parser.add_argument('--root', required=True, type=pathlib.Path)
args = parser.parse_args()
root = args.root.resolve(strict=True)
evidence = root/'evidence'
store = evidence/'package-staging-config/extensions/packages'
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
        result = subprocess.run(['docker','exec','-w','/cleanup','tadazz-package-runtime-qa','pnpm','--filter','@razzia/e2e','exec','playwright','test','--config','playwright.package-runtime.config.ts'],stdout=log,stderr=subprocess.STDOUT)
    (evidence/'package-browser-exit.txt').write_text(str(result.returncode))
finally:
    stop.set()
    thread.join(timeout=60)

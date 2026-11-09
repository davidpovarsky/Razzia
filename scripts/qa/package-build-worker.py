"""Operator-side broker. Never mount the Docker socket in the game process.

Input jobs live under STORE/<tenant-hash>/jobs/<upload-uuid>/. Source is read-only;
only output files are writable. No network, package scripts, npm or caller shell.
"""
import argparse, json, pathlib, subprocess, tempfile, os, shutil, uuid

parser = argparse.ArgumentParser()
parser.add_argument('store', type=pathlib.Path)
parser.add_argument('--image', required=True, help='Immutable toolchain sha256 image id')
args = parser.parse_args()
if not args.image.startswith('sha256:') or len(args.image) != 71:
    raise SystemExit('Pinned sha256 toolchain image required')
store = args.store.resolve(strict=True)
for request in store.glob('*/jobs/*/request.json'):
    job = request.parent.resolve(strict=True)
    if store not in job.parents or request.is_symlink() or (job/'source.tadazz').is_symlink():
        raise SystemExit('Unsafe job directory')
    if (job/'result.json').exists():
        continue
    with tempfile.TemporaryDirectory(prefix='tadazz-build-') as tmp, tempfile.TemporaryDirectory(prefix='tadazz-build-input-') as incoming:
        out = pathlib.Path(tmp)
        out.chmod(0o777)  # disposable output only; worker UID owns no other mount
        staged = pathlib.Path(incoming)
        staged.chmod(0o755)
        shutil.copyfile(job/'source.tadazz', staged/'source.tadazz')
        (staged/'source.tadazz').chmod(0o444)
        container = 'tadazz-package-build-' + uuid.uuid4().hex
        command = ['docker','run','--rm','--name',container,'--network','none','--read-only',
            '--user','65534:65534','--cap-drop','ALL','--security-opt','no-new-privileges',
            '--cpus','1','--memory','768m','--pids-limit','48','--ulimit','fsize=8388608:8388608',
            '--tmpfs','/tmp:rw,noexec,nosuid,size=64m',
            '-e','TADAZZ_BUILD_SANDBOX=1',
            '--mount',f'type=bind,src={staged},dst=/input,readonly',
            '--mount',f'type=bind,src={out},dst=/output',
            '--entrypoint','node',args.image,'--import','/cleanup/extensions/node_modules/tsx/dist/loader.mjs',
            '/cleanup/extensions/qa/package-builder.ts','/input/source.tadazz','/output']
        try:
            result = subprocess.run(command, timeout=45, capture_output=True)
            if result.returncode != 0 or not (out/'result.json').is_file():
                print('Private build diagnostic', job.name, result.returncode,
                      result.stderr.decode('utf8', errors='replace')[-4000:], flush=True)
                if not (out/'result.json').is_file():
                    (out/'result.json').write_text(json.dumps({'error':'BUILD_REJECTED'}))
        except subprocess.TimeoutExpired:
            (out/'result.json').write_text(json.dumps({'error':'BUILD_TIMEOUT'}))
        finally:
            subprocess.run(['docker','rm','-f',container], capture_output=True)
        for name in ['bundle.json','result.json']:
            file = out/name
            if file.exists():
                if file.is_symlink() or file.stat().st_size > 8_000_000:
                    raise SystemExit('Unsafe build output')
                target = job/name
                temporary = job/(name+'.tmp')
                temporary.write_bytes(file.read_bytes())
                os.replace(temporary, target)

"""NOT RUN. Application source e1fb1b2 accepted; corrected packet awaits review/grant."""
import pathlib
import sys
sys.dont_write_bytecode = True
from runner_host import Runner, D

if __name__ == '__main__':
    runner = Runner(pathlib.Path(__file__).resolve().parent)
    try:
        if len(sys.argv) != 2:
            raise RuntimeError('Pass the fresh ROOT-supplied host-only admission JSON path')
        runner.run(pathlib.Path(sys.argv[1]))
    except BaseException as error:
        # A failed admission/pre-existing evidence path is never claimed. It
        # receives no appended driver-error file, including in source inputs.
        if runner.evidence_fd is not None:
            try:
                runner.write('driver-error.json', {'kind': 'HOLD_OR_FAILURE', 'error': str(error),
                                                  'runtimePassClaimed': False})
            except BaseException as observation_error:
                print('Host observation refused: ' + str(observation_error), file=sys.stderr)
        else:
            print('Refused without an exclusive evidence claim; stderr only: ' + str(error), file=sys.stderr)
        raise
    finally:
        if runner.cid:
            try:
                runner.stop_owned()
                import json
                state = json.loads(runner.output(D + ['inspect', '--size', runner.cid]))[0]
                runner.write('runner-after-stop.json', {'id': runner.cid, 'state': state['State'],
                                                       'sizeRw': state.get('SizeRw', 0)})
            except BaseException as stop_error:
                print('Owned runner/observation cleanup failed: ' + str(stop_error), file=sys.stderr)
                raise

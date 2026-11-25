from pathlib import Path
import json,hashlib
folder=Path(__file__).resolve().parent
helper=folder/"activate_and_verify_timer_r2.py"
source=helper.read_bytes();namespace={"__name__":"systemd_monotonic_offline","__file__":str(helper)}
exec(compile(source,str(helper),"exec"),namespace)
parse=namespace["monotonic_microseconds"]
valid={"1343961755332":1343961755332,"2w 1d 13h 19min 21.755332s":1343961755332,"2w 1d 13h 19min 8.755471s":1343948755471,"745.122ms":745122,"1y 1month":34187400000000,"1us":1,"0":0,"18446744073709551614":18446744073709551614}
for value,expected in valid.items():assert parse(value)==expected,value
invalid=["n/a","infinity","-1s","1foo","1s 1s","1s 1min","1min  1s","1e3s","1.1us","18446744073709551615","18446744073709551616","1s trailing"," 1s","1s ","1.5s 2ms"]
for value in invalid:
    try:parse(value)
    except RuntimeError:pass
    else:raise AssertionError("Invalid or infinite value accepted: "+value)
assert parse("2w 1d 13h 19min 21.755332s")>parse("2w 1d 13h 19min 8.755471s")
report={"status":"PASS","helperSha256":hashlib.sha256(source).hexdigest(),"validCases":valid,"rejectedCases":invalid,"validCount":len(valid),"rejectedCount":len(invalid),"strictObservedOrdering":True,"finiteUint64Only":True,"linuxCommandExecuted":False,"serviceChanged":False,"sources":["https://github.com/systemd/systemd/blob/main/src/basic/time-util.c","https://github.com/systemd/systemd/blob/main/src/basic/time-util.h"]}
(folder/"phase3-r2-parser-tests.json").write_text(json.dumps(report,indent=2)+"\n",encoding="utf-8")
print(json.dumps({"parser":"PASS","helperSha256":report["helperSha256"],"valid":len(valid),"rejected":len(invalid)}))

import {createRequire} from "node:module"
import {readFileSync} from "node:fs"
import {dirname,resolve} from "node:path"
import {spawnSync} from "node:child_process"
const require=createRequire("/work/extensions/package.json"),path=require.resolve("typescript/package.json")
const result=spawnSync(process.execPath,[resolve(dirname(path),"bin/tsc"),"--noEmit","--pretty","false","-p",new URL("tsconfig.json",import.meta.url).pathname],{cwd:"/work",stdio:"inherit",env:{...process.env,GOMEMLIMIT:"640MiB"}})
console.log(JSON.stringify({scope:"authority factory and actual first-batch source project; not full parent",typescript:JSON.parse(readFileSync(path,"utf8")).version,exit:result.status,signal:result.signal}))
if(result.error)throw result.error
process.exitCode=result.status??1

import fs from "node:fs/promises"
import path from "node:path"
import { createRequire, builtinModules } from "node:module"

const source = process.env.FLOW_SOURCE
const deps = process.env.FLOW_DEPS
const evidence = process.env.FLOW_EVIDENCE
const tenant = process.env.FLOW_TENANT
const directorOverride = process.env.FLOW_DIRECTOR_OVERRIDE

if (!source || !deps || !evidence || !tenant) {
  throw new Error(
    "Explicit read-only source, dependencies, tenant and own evidence required",
  )
}

const require = createRequire(path.join(deps, "extensions/package.json"))
const { build } = require("esbuild")
const resolveModule = createRequire(
  path.join(deps, "packages/web/package.json"),
)
const modulePath = (file) =>
  JSON.stringify(path.join(source, "extensions/src", file))
const entry = `
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {StudioShowCoordinator} from ${modulePath("server/game/studio-show-coordinator.ts")};
import {createShowRoundHooks} from ${modulePath("server/game/round-policy.ts")};
import {computeShowScene} from ${modulePath("presentation/tadazz-show/presentation-scene.ts")};
import {planTransition} from ${modulePath("presentation/tadazz-show/show-director.ts")};
const gid='6369bf77-c3d4-40ee-8a67-0476434b562f';
const extraBytes=fs.readFileSync(path.join(process.env.FLOW_TENANT,'extensions/quizzes',gid+'.json'));
const baseBytes=fs.readFileSync(path.join(process.env.FLOW_TENANT,'quizz',gid+'.json'));
const extras=JSON.parse(extraBytes);const base=JSON.parse(baseBytes);
const starts=[],finishes=[],trace=[],boardAfter=[],autoBoards=[];
let lastScene=null,stage={mode:'idle',questionKey:null},finaleCalls=0,questions=0;
const coordinator=new StudioShowCoordinator({...extras,callbacks:{onStartQuestion(i){starts.push(i+1)},onFinish(t){finishes.push({hasAuthoredClosingStart:typeof t==='number'})},onBroadcastState(){}}});
const hooks=createShowRoundHooks({extensionSession:{extras,consumeManualLeaderboardRequest(){return false}},showCoordinator:coordinator,isCreatingWorldsShow:false,gameMode:base.gameMode,round:{currentQuestionIndex:0},roster:{},setLastDistribution(){},syncRosterScoresFromPlayers(){},broadcastHostPresence(){},broadcastExtensionState(){}});
function draw(envelope,status){
 const next=computeShowScene({role:'manager',isConnected:true,status,envelope,questionStates:{current:questions,total:base.questions.length}});
 const steps=planTransition(lastScene,next,stage);
 for(const step of steps){
  if(step.op==='showLeaderboard'||step.op==='updateLeaderboard'){boardAfter.push(questions);stage={mode:'leaderboard',questionKey:null}}
  if(step.op==='showFinale'){finaleCalls++;stage={mode:'finale',questionKey:null}}
  if(step.op==='showIntro'||step.op==='custom'||step.op==='showInterlude')stage={mode:'custom',questionKey:null};
 }
 lastScene=next;return {kind:next.kind,operations:steps.map(s=>s.op)};
}
try{
 hooks.onShowStart(()=>{throw new Error('unexpected native fallback start')});
 for(let guard=0;coordinator.currentPhase!=='finished'&&guard<100;guard++){
  const step=coordinator.getAuthoritativeStepEnvelope('manager');if(!step)throw new Error('active step absent');
  if(step.kind==='question'){
   questions++;if(coordinator.getQuestionOrdinal()!==questions)throw new Error('ordinal drift');
   if(hooks.shouldShowLeaderboard({currentQuestionIndex:questions-1,totalQuestions:base.questions.length}))autoBoards.push(questions);
   trace.push({step:step.stepIndex,kind:'question',question:questions});
   lastScene={kind:'results',key:'results:'+step.questionId,question:{key:step.questionId,question:'withheld',number:questions,totalQuestions:base.questions.length,options:[]},reveal:{}};
   stage={mode:'results',questionKey:step.questionId};
   hooks.onQuestionCompleted(questions-1,()=>{throw new Error('unexpected fallback advance')});
  }else{
   if(coordinator.canAcceptAnswers())throw new Error('scene accepts answers');
   const mapped=draw({gameId:'private-clone-proof',phase:'scene',epoch:step.epoch,seq:step.seq,startedAt:step.startedAt,extras:{currentScene:step.scene,activeTimelineStep:step,defaults:extras.defaults,activeSceneData:{leaderboard:{entries:[]}}}},null);
   trace.push({step:step.stepIndex,kind:step.kind,afterQuestion:questions,...mapped});
   if(!coordinator.advanceScene(step.sceneId,step.epoch,step.stepIndex))throw new Error('authoritative scene advance rejected');
  }
 }
 const terminal=draw({gameId:'private-clone-proof',phase:'finished',extras:{defaults:extras.defaults}},{name:'FINISHED',data:{top:[]}});
 trace.push({kind:'finished',...terminal});
 // Once finished, duplicate completion/advance messages must not create another finish.
 coordinator.onQuestionCompleted(22);coordinator.advanceScene();coordinator.start();
 const result={source:process.env.FLOW_SOURCE,quizId:gid,baseSha256:createHash('sha256').update(baseBytes).digest('hex'),extrasSha256:createHash('sha256').update(extraBytes).digest('hex'),sourceFiles:{},questions,steps:extras.timeline.length,questionStarts:starts,boardAfter,automaticBoards:autoBoards,finishCallbacks:finishes.length,nativeFinaleCalls:finaleCalls,trace,checks:[]};
 for(const f of ['server/game/studio-show-coordinator.ts','gameplay/timeline-runner.ts','server/game/round-policy.ts','presentation/tadazz-show/presentation-scene.ts','presentation/tadazz-show/show-director.ts'])result.sourceFiles[f]=createHash('sha256').update(fs.readFileSync(f.endsWith('show-director.ts')&&process.env.FLOW_DIRECTOR_OVERRIDE?process.env.FLOW_DIRECTOR_OVERRIDE:path.join(process.env.FLOW_SOURCE,'extensions/src',f))).digest('hex');
 const check=(name,passed)=>result.checks.push({name,passed});
 check('actual original game and native default',extras.quizId===gid&&base.id===gid&&extras.defaults.showTheme.id==='tadazz-classic'&&extras.defaults.showTheme.version==='1.0.0');
 check('all 23 questions start exactly once in order',JSON.stringify(starts)===JSON.stringify(Array.from({length:23},(_,i)=>i+1))&&questions===23);
 check('all 28 authored steps execute',trace.filter(x=>'step' in x).length===28);
 check('actual native leaderboard operations occur after 8,16,23',JSON.stringify(boardAfter)==='[8,16,23]');
 check('cardOnly suppresses every automatic duplicate board',extras.defaults.leaderboardPolicy==='cardOnly'&&autoBoards.length===0);
 check('coordinator finishes exactly once despite duplicate completion signals',finishes.length===1);
 check('native finale is requested once across authored closing and FINISHED',finaleCalls===1);
 const winner={name:'Player A',score:100};
 const closing={kind:'scene',key:'closing',scene:{kind:'closing'},activeSceneData:{leaderboard:{entries:[{displayName:'Player A',points:100}]}}};
 const finished={kind:'finale',key:'finale',winner};
 check('populated matching winner preserves authored finale',planTransition(closing,finished,{mode:'finale',questionKey:null}).length===0);
 check('first final entrance is retained',planTransition(null,finished,{mode:'leaderboard',questionKey:null}).some(s=>s.op==='showFinale'));
 check('changed winner name is retained',planTransition(closing,{...finished,winner:{name:'Player B',score:100}},{mode:'finale',questionKey:null}).some(s=>s.op==='showFinale'));
 check('same winner with changed score is retained',planTransition(closing,{...finished,winner:{name:'Player A',score:120}},{mode:'finale',questionKey:null}).some(s=>s.op==='showFinale'));
 check('unpainted authored closing still presents finale',planTransition(closing,finished,{mode:'custom',questionKey:null}).some(s=>s.op==='showFinale'));
 check('cinematic authored closing does not swallow final screen',planTransition({...closing,scene:{kind:'closing',mediaUrl:'/authored.mp4'}},finished,{mode:'finale',questionKey:null}).some(s=>s.op==='showFinale'));
 result.passed=result.checks.every(x=>x.passed);
 fs.writeFileSync(path.join(process.env.FLOW_EVIDENCE,'receipt.json'),JSON.stringify(result,null,2)+'\\n');
 console.log(JSON.stringify(result));if(!result.passed)process.exitCode=1;
}finally{coordinator.dispose()}
`
const plugins = [
  {
    name: "actual-read-only-workspace",
    setup(builder) {
      if (directorOverride) {
        builder.onLoad({ filter: /show-director\.ts$/ }, async (args) =>
          args.path ===
          path.join(
            source,
            "extensions/src/presentation/tadazz-show/show-director.ts",
          )
            ? {
                contents: await fs.readFile(directorOverride, "utf8"),
                loader: "ts",
                resolveDir: path.dirname(args.path),
              }
            : undefined,
        )
      }

      builder.onResolve({ filter: /^@razzia\// }, async (args) => {
        const [, scope, ...parts] = args.path.split("/")
        const base =
          scope === "extensions"
            ? path.join(source, "extensions/src")
            : path.join(source, "packages", scope, "src")
        const requested = path.join(base, ...parts)
        for (const suffix of ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]) {
          const candidate = requested + suffix

          try {
            if ((await fs.stat(candidate)).isFile()) {
              return { path: candidate }
            }
          } catch {}
        }
        throw new Error("Unresolved workspace import " + args.path)
      })
      builder.onResolve({ filter: /^[^./]/ }, (args) => {
        if (
          args.path.startsWith("node:") ||
          builtinModules.includes(args.path)
        ) {
          return { path: args.path, external: true }
        }

        if (args.path.startsWith("@razzia/")) {
          return
        }

        if (args.importer.startsWith(`${deps}/`)) {
          return
        }

        try {
          return { path: resolveModule.resolve(args.path) }
        } catch {
          return { path: require.resolve(args.path) }
        }
      })
    },
  },
]
await fs.mkdir(evidence, { recursive: true })
const outfile = path.join(evidence, "runtime.cjs")
await build({
  bundle: true,
  format: "cjs",
  platform: "node",
  target: "node18",
  jsx: "automatic",
  plugins,
  logLevel: "silent",
  loader: {
    ".css": "empty",
    ".woff2": "empty",
    ".png": "empty",
    ".jpg": "empty",
    ".svg": "empty",
  },
  stdin: { contents: entry, loader: "ts", resolveDir: source },
  outfile,
})
createRequire(import.meta.url)(outfile)

import { it, expect } from 'vitest'
import { ExtensionGameSession } from './session'
import { StudioShowCoordinator } from './studio-show-coordinator'
import { createDefaultQuizExtrasV2 } from '../../core/studio-timeline-schema'

it('authorizes a real tied option, broadcasts the decision to spectators and retains it on refresh', () => {
  const qid=crypto.randomUUID(), sid=crypto.randomUUID()
  const extras=createDefaultQuizExtrasV2('quiz',[qid],'a'.repeat(64))
  extras.scenes[sid]={id:sid,kind:'animation',preset:'tie-break',advance:'manual',durationMs:3000}
  extras.timeline=[{id:crypto.randomUUID(),kind:'animation',sceneId:sid}]
  const coordinator=new StudioShowCoordinator({timeline:extras.timeline,scenes:extras.scenes,questionIds:[qid],defaults:extras.defaults,callbacks:{onStartQuestion:()=>{},onFinish:()=>{},onBroadcastState:()=>{}}})
  const session=new ExtensionGameSession('game',extras)
  session.setShowCoordinator(coordinator)
  session.setDelegate({getLastCompletedQuestionSummary:()=>({sourceQuestionId:qid,questionText:'Tie',totalResponders:4,isTie:true,winners:[0,1],options:[{answerIndex:0,label:'A',count:2,percentage:50},{answerIndex:1,label:'B',count:2,percentage:50}]})})
  coordinator.start()
  const command={v:1,gameId:'game',action:'RESOLVE_STORY_TIE',payload:{answerIndex:1,epoch:session.currentEpoch},requestId:'resolve'}
  expect(()=>session.handleCommand(command,false)).toThrow()
  expect(()=>session.handleCommand({...command,payload:{...command.payload,answerIndex:4},requestId:'invalid'},true)).toThrow()
  expect(session.handleCommand(command,true).success).toBe(true)
  const data=()=>session.getStateSnapshot('player',[]).extras.activeSceneData as {fullShow:{tieResolvedIndex:number}}
  expect(data().fullShow.tieResolvedIndex).toBe(1)
  expect(data().fullShow.tieResolvedIndex).toBe(1)
  expect(session.handleCommand(command,true).deduplicated).toBe(true)
})

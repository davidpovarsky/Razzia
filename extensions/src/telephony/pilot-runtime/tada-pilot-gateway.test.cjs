'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

test('three persistent calls vote once on each question without an intervening timeout poll', async () => {
  let epoch = 1;
  let accepting = true;
  const votes = new Map();
  const submissions = [];
  const state = callId => ({gameId:'same-live-room',epoch,acceptingAnswers:accepting,answeredCurrentQuestion:votes.has(epoch+':'+callId),answersCount:5,isSurvey:true});
  const backend = http.createServer((req,res)=>{
    let raw='';req.on('data',data=>raw+=data);req.on('end',()=>{
      const body=JSON.parse(raw);let accepted=false;
      if(body.action==='answer'){
        accepted=accepting&&body.epoch===epoch&&!votes.has(epoch+':'+body.callId);
        submissions.push({epoch,promptEpoch:body.epoch,accepted});
        if(accepted)votes.set(epoch+':'+body.callId,body.answerIndex);
      }
      res.setHeader('content-type','application/json');res.end(JSON.stringify({ok:true,joined:true,rosterPlayerId:body.callId,accepted,isSurvey:true,state:state(body.callId)}));
    });
  });
  await new Promise(r=>backend.listen(0,'127.0.0.1',r));
  process.env.TADA_PILOT_SECRET='gateway-persistent-calls-regression-secret';
  process.env.TADA_RAZZIA_API_URL='http://127.0.0.1:'+backend.address().port;
  const {server}=require('./tada-pilot-gateway.cjs');
  assert.ok(server.keepAliveTimeout > 120_000, 'gateway outlives the proxy idle connection lifetime');
  assert.ok(server.headersTimeout > server.keepAliveTimeout);
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const call=async(index,params={})=>{
    const response=await fetch('http://127.0.0.1:'+server.address().port+'/yemot/'+process.env.TADA_PILOT_SECRET,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({ApiCallId:'persistent-caller-'+index,ApiPhone:'+1202555012'+index,ApiDID:'443306131984',...params})});
    assert.equal(response.status,200);return response.text();
  };
  const keys=['td1','td1','td1'];
  try{
    for(let i=0;i<3;i++)await call(i);
    for(epoch=1;epoch<=10;epoch++){
      for(let i=0;i<3;i++){
        const response=await call(i,{[keys[i]]:String((epoch+i)%5+1)});
        keys[i]=response.match(/=(td\d+),/)[1];
      }
      assert.equal([...votes.keys()].filter(k=>k.startsWith(epoch+':')).length,3,'all first presses accepted on question '+epoch);
      // Another press in this question remains a duplicate.
      const duplicate=await call(0,{[keys[0]]:'5'});keys[0]=duplicate.match(/=(td\d+),/)[1];
      assert.equal([...votes.keys()].filter(k=>k.startsWith(epoch+':')).length,3);
    }
    accepting=false;
    await call(0,{[keys[0]]:'1'});
    assert.equal(votes.size,30);
    assert.equal(submissions.filter(x=>x.accepted).length,30);
  }finally{await new Promise(r=>server.close(r));await new Promise(r=>backend.close(r));}
});

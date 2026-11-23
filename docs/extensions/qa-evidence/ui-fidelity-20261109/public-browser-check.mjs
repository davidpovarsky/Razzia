import {chromium,request,expect as baseExpect} from '@playwright/test';
import fs from 'node:fs';
const expect=baseExpect.configure({timeout:20000});
const origin='https://theme-lab-v2.132.145.25.168.sslip.io';
const samples=JSON.parse(fs.readFileSync('/evidence/samples.json','utf8')).samples;
const api=await request.newContext({baseURL:origin});
expect((await api.get('/api/health')).ok()).toBe(true);
expect([401,403]).toContain((await api.post('/api/auth/manager',{data:{password:'invalid-lab-password'}})).status());
const login=await api.post('/api/auth/manager',{data:{password:process.env.MANAGER_PASSWORD}});expect(login.ok()).toBe(true);
const {token}=await login.json();const headers={Authorization:`Bearer ${token}`};
const catalog=await (await api.get('/api/themes/catalog',{headers})).json();
expect(catalog.definitions.length).toBe(4);
const browser=await chromium.launch({headless:true});
const rows=[];
try{
 const hostContext=await browser.newContext({viewport:{width:1440,height:1000},locale:'en-US'});
 await hostContext.addInitScript(value=>localStorage.setItem('token',value),token);
 const host=await hostContext.newPage();
 await host.goto(origin+'/manager');
 await host.getByRole('button',{name:'Quizz',exact:true}).click();
 for(const sample of samples)await expect(host.getByText(sample.name,{exact:true})).toBeVisible();
 for(const sample of samples){
  const saved=await api.get('/api/extensions/quizzes/'+sample.quizId,{headers});expect(saved.ok()).toBe(true);
  const data=await saved.json();expect(data.extras.defaults.showTheme.id).toBe(sample.themeId);expect(data.extras.defaults.showTheme.version).toBe(sample.themeVersion);expect(data.extras.questionIds.length).toBe(3);
  const response=await api.post('/api/games',{headers,data:{quizzId:sample.quizId}});expect(response.ok()).toBe(true);
  const game=await response.json();await host.goto(origin+'/party/manager/'+game.gameId);
  await expect(host.getByTestId('tadazz-show')).toHaveAttribute('data-native-layout','true');
  await expect(host.getByTestId('product-logo').first()).toHaveAttribute('src','/tadazz-show/v4/tadazz-brand-logo.png');
  const playerContext=await browser.newContext({viewport:{width:1024,height:768},isMobile:true,hasTouch:true,locale:'en-US'});
  const player=await playerContext.newPage();await player.goto(origin+'/game?pin='+game.inviteCode);
  await player.getByPlaceholder('Username here').fill('Remote iPad QA');await player.getByRole('button',{name:'Submit',exact:true}).click();
  await expect(host.getByTestId('host-connected-counter')).toHaveText('1 / 1');
  await host.bringToFront();await host.getByRole('button',{name:'Start',exact:true}).click();
  await expect(host.getByTestId('tadazz-show')).toHaveAttribute('data-voting-open','true');
  const answer=player.getByRole('button',{name:sample.mode==='quiz'?/Mars/:/Mountains/});await expect(answer).toBeVisible();
  expect(await player.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  expect((await player.getByTestId('native-game-surface').boundingBox()).width).toBeGreaterThan(1000);
  expect(await host.getByTestId('host-toggle-audio-mute').evaluate(e=>getComputedStyle(e).fontFamily)).toContain('Rubik Variable');
  expect(await host.getByTestId('host-toggle-audio-mute').evaluate(e=>getComputedStyle(e).borderRadius)).toBe('8px');
  if(sample.mode==='quiz'){
   await host.screenshot({path:'/evidence/'+sample.themeId+'-host.png'});
   await player.screenshot({path:'/evidence/'+sample.themeId+'-ipad-landscape.png'});
   await player.setViewportSize({width:768,height:1024});expect(await player.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
   await player.screenshot({path:'/evidence/'+sample.themeId+'-ipad-portrait.png'});
  }
  const publicContext=await browser.newContext({viewport:{width:1280,height:720},locale:'en-US'});const display=await publicContext.newPage();
  await display.goto(origin+'/display/'+game.gameId);await expect(display.getByTestId('tadazz-show')).toHaveAttribute('data-show-theme',sample.themeId);
  await expect(display.getByTestId('manager-control-toolbar')).toHaveCount(0);
  if(sample.themeId==='razzia-original')await expect(display.getByTestId('native-game-surface')).toBeVisible();
  else await expect(display.locator('.stage-brand-logo')).toHaveAttribute('src','/tadazz-show/v4/tadazz-brand-logo.png');
  if(sample.mode==='quiz')await display.screenshot({path:'/evidence/'+sample.themeId+'-projector.png'});
  await player.bringToFront();await answer.click();await expect(player.getByText('Waiting for the players to answer',{exact:true})).toBeVisible();
  await host.bringToFront();await host.getByTestId('host-end-timer-btn').click();
  await expect(host.getByTestId('tadazz-show')).toHaveAttribute('data-show-scene','results');
  if(sample.mode==='quiz')await expect(player.getByText('Nice!',{exact:true})).toBeVisible();
  rows.push({theme:sample.themeId,version:sample.themeVersion,mode:sample.mode,quizId:sample.quizId,hostNative:true,iPadResponsive:true,fixedBrand:true,publicDisplay:true,scoringOrSurvey:true});
  fs.writeFileSync('/evidence/live-browser.json',JSON.stringify({origin,samples:rows},null,2));
  await playerContext.close();await publicContext.close();
 }
 console.log('Public HTTPS: all eight saved games passed host/iPad/display/vote/results checks');
}finally{await browser.close();await api.dispose()}

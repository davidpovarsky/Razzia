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
try{
 const ctx=await browser.newContext({locale:'en-US'});await ctx.addInitScript(v=>localStorage.setItem('token',v),token);const page=await ctx.newPage();await page.goto(origin+'/manager');await page.getByRole('button',{name:'Quizz',exact:true}).click();for(const sample of samples)await expect(page.getByText(sample.name,{exact:true})).toBeVisible();
 const native=samples.find(s=>s.themeId==='razzia-original');await page.goto(origin+'/manager/quizz/'+native.quizId);await page.getByTestId('studio-tab-settings').click();
 for(const id of ['tadazz-classic','razzia-original','tadazz-demo-cosmic','tadazz-demo-jade'])await expect(page.getByTestId('show-theme-'+id)).toBeVisible();await expect(page.getByTestId('tadazz-show')).toHaveCount(0);expect(await page.getByTestId('editor-save-btn').evaluate(e=>getComputedStyle(e).fontFamily)).toContain('Rubik Variable');await page.screenshot({path:'/evidence/final-editor-picker.png'});
 fs.writeFileSync('/evidence/post-replacement-browser.json',JSON.stringify({origin,eightSamplesListed:true,fourFamiliesSelectable:true,editorOutsideGameTheme:true,rubikPlatformControls:true},null,2));console.log('Final deployed image: persistent games and four theme choices verified in the public browser');
}finally{await browser.close();await api.dispose()}

import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const out=dirname(fileURLToPath(import.meta.url)),root=resolve(out,"../../../../.."),require=createRequire(resolve(root,"extensions/package.json"));
const {chromium,expect}=require("@playwright/test"), run=process.argv[2]||"after";
const paths=["packages/web/src/features/quizz/components/QuestionEditor/QuestionEditorConfig/CardAudioConfig.tsx","packages/web/src/features/quizz/components/studio/theme-audio-options.tsx"];
const sourceSha256=Object.fromEntries(await Promise.all(paths.map(async p=>[p,createHash("sha256").update(await readFile(resolve(root,p))).digest("hex")])));
const browser=await chromium.launch({channel:"msedge",headless:true});
const result={run,sourceSha256,boundary:"Actual CardAudioConfig/ThemeAudioOptions with actual editor providers and native controls; controlled Audio events prove ownership, not audible decoding.",cases:[],pageErrors:[]};
async function scenario(name,mode,fn){
 const page=await browser.newPage({viewport:{width:1280,height:900}});page.setDefaultTimeout(10000);
 page.on("pageerror",e=>result.pageErrors.push(String(e)));
 await page.route("**/api/**",route=>route.fulfill({json:{media:[]}}));
 const item={name,mode,status:"PASS",checks:[]};const check=label=>item.checks.push(label);
 try{await page.goto("http://127.0.0.1:3186/media-picker-audio-proof.html?mode="+mode,{waitUntil:"domcontentloaded",timeout:60000});await fn(page,check);await page.screenshot({path:resolve(out,run+"-"+mode+"-"+name+".png"),fullPage:true});}
 catch(e){item.status="FAIL";item.error=String(e);process.exitCode=1;await page.screenshot({path:resolve(out,run+"-"+mode+"-"+name+"-failure.png"),fullPage:true}).catch(()=>{});}
 finally{result.cases.push(item);await page.close();}
}
const state=async p=>p.evaluate(()=>{const a=window.__audioHarness.audios.at(-1);return{paused:a.paused,time:a.currentTime,endedDetached:a.onended===null,errorDetached:a.onerror===null};});
const stopped={paused:true,time:0,endedDetached:true,errorDetached:true};
await scenario("stale-owner","legacy",async(p,check)=>{
 const a=p.getByTestId("card-audio-preview-showQuestion"),b=p.getByTestId("card-audio-preview-answersMusic");
 await expect(a).toBeVisible();expect(await p.evaluate(()=>window.__audioHarness.audios.length)).toBe(0);check("No mount autoplay");
 await a.click();await expect(a.locator("svg.lucide-square")).toHaveCount(1);await p.evaluate(()=>{const h=window.__audioHarness;h.oldEnded=h.audios[0].onended;h.oldError=h.audios[0].onerror;});
 await b.click();await expect(b.locator("svg.lucide-square")).toHaveCount(1);
 await p.evaluate(async()=>{const h=window.__audioHarness;h.oldEnded?.();h.oldError?.();h.audios[0].rejectPlay(new Error("old rejected"));await Promise.resolve();});
 await expect(b.locator("svg.lucide-square")).toHaveCount(1);check("Old callbacks preserve new slot");
 await b.click();await expect(b.locator("svg.lucide-play")).toHaveCount(1);expect(await state(p)).toEqual(stopped);check("Same slot stop rewinds and detaches");
 await a.click();await p.evaluate(()=>window.__audioHarness.audios.at(-1).onerror());await expect(a.locator("svg.lucide-play")).toHaveCount(1);check("Current error releases preview");
 await b.click();await p.evaluate(()=>window.__audioHarness.unmount());await expect(p.getByTestId("card-audio-section")).toHaveCount(0);expect(await state(p)).toEqual(stopped);check("Unmount resets owned audio");
});
await scenario("card-source-change","legacy",async(p,check)=>{
 const a=p.getByTestId("card-audio-preview-showQuestion");await expect(a).toBeVisible();await a.click();await expect(a.locator("svg.lucide-square")).toHaveCount(1);
 await p.evaluate(()=>window.__audioHarness.switchCard());await expect(a.locator("svg.lucide-play")).toHaveCount(1);expect(await state(p)).toEqual(stopped);check("Card change stops audio and clears the old slot indicator");
 await a.click();await expect(a.locator("svg.lucide-square")).toHaveCount(1);await p.evaluate(()=>window.__audioHarness.changeSource());await expect(a.locator("svg.lucide-play")).toHaveCount(1);expect(await state(p)).toEqual(stopped);check("Same-card source change resets audio and slot state");
});
await scenario("source-owner","theme",async(p,check)=>{
 await p.locator('[data-testid^="theme-audio-"]').waitFor();
 const labels=await p.evaluate(()=>({preview:window.__audioHarness.i18n.t("extensions:themes.preview"),stop:window.__audioHarness.i18n.t("extensions:themes.stop")}));
 const play=p.getByRole("button",{name:labels.preview,exact:true}),stop=p.getByRole("button",{name:labels.stop,exact:true});
 expect(await p.evaluate(()=>window.__audioHarness.audios.length)).toBe(0);check("No theme mount autoplay");
 await play.click();await p.evaluate(()=>{const h=window.__audioHarness;h.audios[0].resolvePlay();h.oldEnded=h.audios[0].onended;h.oldError=h.audios[0].onerror;});await expect(stop).toBeVisible();
 await p.evaluate(()=>window.__audioHarness.changeSource());await expect(stop).toHaveCount(0);check("Source change clears visible playback");
 await play.click();await p.evaluate(()=>window.__audioHarness.audios[1].resolvePlay());await expect(stop).toBeVisible();
 await p.evaluate(()=>{const h=window.__audioHarness;h.oldEnded?.();h.oldError?.();});await expect(stop).toBeVisible();check("Stale prior-source callbacks cannot clear current theme preview");
 await stop.click();expect(await state(p)).toEqual(stopped);check("Explicit theme stop detaches and resets");
 await play.click();await p.evaluate(()=>window.__audioHarness.audios.at(-1).resolvePlay());await expect(stop).toBeVisible();await p.evaluate(()=>window.__audioHarness.audios.at(-1).onended());await expect(stop).toHaveCount(0);expect(await state(p)).toEqual(stopped);check("Current theme ended releases owner");
 await play.click();await p.evaluate(async()=>{window.__audioHarness.audios.at(-1).rejectPlay(new Error("denied"));await Promise.resolve();});await expect(p.getByRole("status")).toBeVisible();expect(await state(p)).toEqual(stopped);check("Current rejection releases owner and reports recoverable error");
 await play.click();await p.evaluate(()=>window.__audioHarness.unmount());await expect(p.locator('[data-testid^="theme-audio-"]')).toHaveCount(0);expect(await state(p)).toEqual(stopped);await p.evaluate(()=>window.__audioHarness.audios.at(-1).resolvePlay());expect(await state(p)).toEqual(stopped);check("Unmount plus late play resolution cannot reclaim owner");
});
result.status=result.cases.every(x=>x.status==="PASS")&&result.pageErrors.length===0?"PASS":"FAIL";
if(result.status!=="PASS")process.exitCode=1;
await writeFile(resolve(out,"configs-"+run+".json"),JSON.stringify(result,null,2)+"\n");console.log(JSON.stringify(result));await browser.close();

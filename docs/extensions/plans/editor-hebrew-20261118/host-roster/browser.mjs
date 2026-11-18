import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, writeFile } from "node:fs/promises";
const out=dirname(fileURLToPath(import.meta.url));
const root=resolve(out,"../../../../..");
const require=createRequire(resolve(root,"extensions/package.json"));
const {chromium,expect}=require("@playwright/test");
const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||"msedge",headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const result={sourceBase:"af1d879431d3461c7f937a6c5f580eee97b073e2",boundary:"Actual HostPlayersModal, real React/Radix/application CSS/i18n and CSV parser; synthetic roster and intercepted HTTP, not a real game/backend/privacy acceptance.",checks:[],screens:[],pageErrors:[],apiWrites:[]};
page.on("pageerror",e=>result.pageErrors.push(String(e)));
const check=(name,details={})=>result.checks.push({name,status:"PASS",...details});
const shot=async(name)=>{await page.screenshot({path:resolve(out,name+".png"),fullPage:true});result.screens.push(name+".png");};
await page.route("**/api/**",async route=>{
 const request=route.request(),url=new URL(request.url());
 if(url.pathname==="/api/auth/session"){
  const claims={sub:"qa-host-fixture",role:"manager",exp:Math.floor(Date.now()/1000)+3600};
  const token="fixture."+Buffer.from(JSON.stringify(claims)).toString("base64url")+".fixture";
  await route.fulfill({json:{token,clientId:claims.sub,role:claims.role,expiresAt:claims.exp}});return;
 }
 const presence=await page.evaluate(()=>window.__rosterProof.presence);
 if(request.method()!=="GET")result.apiWrites.push({method:request.method(),path:url.pathname,body:request.postDataJSON()});
 await route.fulfill({json:{presence}});
});
try{
 await page.goto("http://127.0.0.1:3186/host-roster-proof.html?lng=he",{waitUntil:"domcontentloaded",timeout:60000});
 await expect(page.getByTestId("host-players-modal")).toBeVisible();
 await expect(page.getByTestId("host-player-name-example-a")).toHaveText("משתתפת לדוגמה");
 await expect(page.getByTestId("host-player-phone-example-a")).toHaveText("+12025550101");
 const rtl=await page.getByTestId("host-players-modal").evaluate(el=>({dir:getComputedStyle(el).direction,phone:getComputedStyle(document.querySelector('[data-testid="host-modal-phone-input"]')).direction}));
 expect(rtl).toEqual({dir:"rtl",phone:"ltr"});
 check("Hebrew modal and unmasked full phone with RTL/LTR isolation",rtl);
 await shot("01-he-desktop");
 await page.getByTestId("host-modal-save-participant-btn").click();
 await expect(page.getByTestId("host-modal-form-error")).toHaveText(await page.evaluate(()=>window.__rosterProof.i18n.t("extensions:roster.errors.missingParticipantName")));
 check("Empty name validation translated");
 await page.getByTestId("host-modal-name-input").fill("דוגמה");
 await page.getByTestId("host-modal-phone-input").fill("123");
 await page.getByTestId("host-modal-save-participant-btn").click();
 await expect(page.getByTestId("host-modal-form-error")).toHaveText(await page.evaluate(()=>window.__rosterProof.i18n.t("extensions:roster.errors.invalidPhoneNumber")));
 check("Invalid phone validation translated");
 await shot("02-he-invalid-phone");
 for(const lng of ["en","de","es","fr","he","it","ja","tr","vi"]){
  await page.evaluate(lng=>window.__rosterProof.i18n.changeLanguage(lng),lng);
  await expect(page.getByTestId("host-modal-form-error")).toHaveText(await page.evaluate(()=>window.__rosterProof.i18n.t("extensions:roster.errors.invalidPhoneNumber")));
  const text=await page.getByTestId("host-modal-form-error").innerText();expect(text).not.toContain("errors:");
 }
 check("Existing form error responds to language changes in all nine locales");
 await page.evaluate(()=>window.__rosterProof.i18n.changeLanguage("he"));
 await page.getByTestId("host-modal-search-input").fill("אין התאמה");
 await expect(page.getByTestId("host-modal-empty")).toHaveText(await page.evaluate(()=>window.__rosterProof.i18n.t("extensions:roster.noSearchResults")));
 check("No-match search has its own localized empty state");
 await shot("03-he-search-empty");
 await page.getByTestId("host-modal-search-input").fill("");
 await page.getByTestId("host-modal-file-input").setInputFiles({name:"invalid.csv",mimeType:"text/csv",buffer:Buffer.from("name,phone\nדוגמה,123")});
 const preview=page.getByTestId("host-modal-import-preview");await expect(preview).toBeVisible();
 const translations=await page.evaluate(()=>{const t=window.__rosterProof.i18n.t;return [t("extensions:roster.colName"),t("extensions:roster.colPhone"),t("extensions:roster.colStatus"),t("extensions:roster.errors.invalidPhoneNumber"),t("extensions:roster.previewSummary",{valid:0,total:1,invalid:1})];});
 for(const text of translations)await expect(preview).toContainText(text);
 expect(await preview.innerText()).not.toMatch(/\bvalid\b|\btotal\b|errors:/);
 await expect(page.getByTestId("host-modal-import-approve-btn")).toHaveCount(0);
 check("Actual CSV row errors, headings and summary localized; invalid approval absent");
 await shot("04-he-invalid-import");
 await page.getByTestId("host-modal-import-cancel-btn").click();
 await page.getByTestId("host-modal-file-input").setInputFiles({name:"headers.csv",mimeType:"text/csv",buffer:Buffer.from("name,other\nדוגמה,123")});
 await expect(preview).toContainText(await page.evaluate(()=>window.__rosterProof.i18n.t("extensions:roster.errors.invalidImportHeaders")));
 check("Fatal missing-header error translated");
 await shot("05-he-fatal-import");
 await page.getByTestId("host-modal-import-cancel-btn").click();
 await page.getByTestId("host-modal-file-input").setInputFiles({name:"valid.csv",mimeType:"text/csv",buffer:Buffer.from("name,phone\nדוגמה,+12025550102")});
 await expect(preview).toContainText(await page.evaluate(()=>window.__rosterProof.i18n.t("extensions:roster.statusValid")));
 await expect(page.getByTestId("host-modal-import-approve-btn")).toBeVisible();
 expect(result.apiWrites).toHaveLength(0);
 check("Valid import preview localized and remains uncommitted until approval");
 await shot("06-he-valid-import");
 await page.getByTestId("host-modal-import-approve-btn").click();
 await expect(preview).toHaveCount(0);expect(result.apiWrites).toHaveLength(1);expect(result.apiWrites[0].method).toBe("PUT");
 check("Explicit approval issues exactly one intercepted roster update");
 for(const width of [390,320]){
  await page.setViewportSize({width,height:844});
  const bounds=await page.getByTestId("host-players-modal").evaluate(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,viewport:innerWidth,documentWidth:document.documentElement.scrollWidth,modalWidth:el.clientWidth,modalScroll:el.scrollWidth};});
  expect(bounds.left).toBeGreaterThanOrEqual(-1);expect(bounds.right).toBeLessThanOrEqual(width+1);expect(bounds.documentWidth).toBeLessThanOrEqual(width+1);expect(bounds.modalScroll).toBeLessThanOrEqual(bounds.modalWidth+1);
  check("Mobile modal bounds "+width,bounds);await shot("07-he-mobile-"+width); await page.getByTestId("host-player-name-example-a").scrollIntoViewIfNeeded(); await expect(page.getByTestId("host-player-name-example-a")).toBeInViewport(); const tableHeight=await page.locator(".tds-roster-table-scroll").evaluate(el=>el.clientHeight); expect(tableHeight).toBeGreaterThanOrEqual(150); check("Mobile roster remains scroll reachable "+width,{tableHeight}); await shot("08-he-mobile-table-"+width);
 }
 expect(result.pageErrors).toHaveLength(0);
 result.status="PASS";
}catch(error){result.status="FAIL";result.failure=String(error.stack||error);await shot("failure");process.exitCode=1;}
finally{await writeFile(resolve(out,"receipt.json"),JSON.stringify(result,null,2));await browser.close();console.log(JSON.stringify({status:result.status,checks:result.checks.length,pageErrors:result.pageErrors,failure:result.failure}));}

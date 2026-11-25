import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { I18nextProvider } from "react-i18next"
import { it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { previewNativeLabels } from "../../../../extensions/src/presentation/show-library-preview/i18n"
import { FULL_SHOW_SCENES, type FullShowInput } from "../../../../extensions/src/presentation/tadazz-v4/FullShowScenes"

import { StageSceneV4, StageBackdropV4 } from "../../../../extensions/src/presentation/tadazz-v4/components"

it("exports the actual Hebrew FullShowSceneView and isolated preview provider for visual inspection", () => {
 const root=fileURLToPath(new URL("../../../../",import.meta.url))
 const out=path.join(root,"docs/extensions/plans/editor-hebrew-20261118/visual-he-fullshow")
 fs.mkdirSync(out,{recursive:true})
 const native=previewNativeLabels("he")
 const answers=[
 {title:"ההרפתקנית Dana 12",imageUrl:"/tadazz-show/second-library/cards/pirate.svg"},
 {title:"העוזר דוד",imageUrl:"/tadazz-show/second-library/cards/shadchan.svg"},
 {title:"תקופת המסע",imageUrl:"/tadazz-show/second-library/cards/dog.svg"},
 {title:"המשבר הגדול",imageUrl:"/tadazz-show/second-library/cards/therapist.svg"},
 {title:"הסוף המפתיע",imageUrl:"/tadazz-show/second-library/cards/lamplighter.svg"},
 ]
 const data:FullShowInput={round:1,completed:2,dialNumber:"+972501234567",connectedTables:[1,2,3,5,8,12,14],representatives:[{table:1,name:"דנה לוי"},{table:2,name:"David ישראלי 12"},{table:3,name:"שרה כהן"}],winners:answers,contestants:answers.slice(0,2),voteCount:42,resolvedIndex:null,groupPage:0,labels:native.v4Labels}
 const scenes=Object.fromEntries(FULL_SHOW_SCENES.map(scene=>[scene,renderToStaticMarkup(React.createElement(I18nextProvider,{i18n:native.i18n},React.createElement("div",{className:"tzv4-stage stage-show","data-scene":scene},React.createElement(StageBackdropV4,{scene,data,assetBase:"/tadazz-show/v4"}),React.createElement(StageSceneV4,{scene,data,assetBase:"/tadazz-show/v4"}))))]))
 for(const [scene,html] of Object.entries(scenes)){
  expect(html,scene).not.toMatch(/AWAITING THE VOTE|PHONE VOTING|KEYPAD VOTING|LIVE CONNECTIONS|EQUAL VOTES|ROUND 0[12]|Choice [12]|fullShow\./u)
  expect(html).not.toContain("{{")
 }
 const css=["extensions/src/presentation/tadazz-v4/full-show.css","extensions/src/presentation/tadazz-v4/source-layout.css","extensions/src/presentation/tadazz-v4/tadazz-v4.css","extensions/src/presentation/tadazz-show/tadazz-motion-kit.css"].map(p=>fs.readFileSync(path.join(root,p),"utf8")).join("\n")
 const fonts=["hebrew","latin"].map(lang=>"@font-face{font-family:Rubik;font-style:normal;font-weight:300 900;font-display:block;src:url(data:font/woff2;base64,"+fs.readFileSync(path.join(root,"packages/web/node_modules/@fontsource-variable/rubik/files/rubik-"+lang+"-wght-normal.woff2")).toString("base64")+") format('woff2');}").join("\n")
 const html='<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><title>בדיקת מסכי המופע בעברית</title><style>'+fonts+css+'\nhtml,body{margin:0;width:100%;height:100%;overflow:hidden;font-family:Rubik,sans-serif;background:#08001d}.qa-canvas{position:absolute;top:0;left:0;width:1920px;height:1080px;transform-origin:top left}.scene-container{display:none;width:1920px;height:1080px;position:relative}.scene-container.active{display:block}</style></head><body><div class="qa-canvas">'+Object.entries(scenes).map(([scene,html])=>'<div class="scene-container" id="scene-'+scene+'">'+html+'</div>').join("\n")+'</div><script>window.showScene=function(scene){document.querySelectorAll(".scene-container").forEach(el=>el.classList.toggle("active",el.id==="scene-"+scene));};function fit(){document.querySelector(".qa-canvas").style.transform="scale("+Math.min(innerWidth/1920,innerHeight/1080)+")"};addEventListener("resize",fit);fit();</script></body></html>'
 fs.writeFileSync(path.join(out,"native-he-scenes.html"),html)
 fs.writeFileSync(path.join(out,"source-receipt.json"),JSON.stringify({method:"SSR actual StageSceneV4/FullShowSceneView under previewNativeLabels(he).i18n and original CSS; static visual fixture, not interactive acceptance",scenes:FULL_SHOW_SCENES,font:"original bundled Rubik Hebrew and Latin",direction:"rtl"},null,2))
})

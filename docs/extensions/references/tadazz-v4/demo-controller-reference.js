
(() => {
  const stage=document.querySelector('#stage');
  const screen=document.querySelector('#screen');
  const kit=new TadazzStageKit(stage);
  const controls=document.querySelector('#demo-controls');
  const tools=controls.querySelector('.separator');
  const btns=[];
  let current=0, touring=false, tourToken=0;
  const fit=()=>{const rect=screen.getBoundingClientRect();stage.style.setProperty('--scale',Math.min(rect.width/1920,rect.height/1080))};
  new ResizeObserver(fit).observe(screen);window.addEventListener('resize',fit);fit();
  const playIndex=async(i,fromTour=false)=>{
    if(!fromTour){touring=false;tourToken++;document.querySelector('#auto-tour').textContent='Play tour'}
    current=(i+TadazzStageKit.scenes.length)%TadazzStageKit.scenes.length;
    btns.forEach((b,j)=>b.classList.toggle('active',j===current));
    const s=TadazzStageKit.scenes[current];
    try{return await kit.play(s.id)}catch(err){console.error(err)}
  };
  TadazzStageKit.scenes.forEach((s,i)=>{
    const b=document.createElement('button');b.textContent=`${String(i+1).padStart(2,'0')} · ${s.label}`;b.title=s.group;
    b.addEventListener('click',()=>playIndex(i));controls.insertBefore(b,tools);btns.push(b);
  });
  document.querySelector('#prev').onclick=()=>playIndex(current-1);
  document.querySelector('#next').onclick=()=>playIndex(current+1);
  document.querySelector('#replay').onclick=()=>{touring=false;tourToken++;kit.replay()};
  document.querySelector('#fullscreen').onclick=()=>{if(document.fullscreenElement)document.exitFullscreen();else screen.requestFullscreen();fit();};
  document.querySelector('#show-percentages').onchange=e=>kit.setPercentagesVisible(e.target.checked);
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  document.querySelector('#auto-tour').onclick=async()=>{
    if(touring){touring=false;tourToken++;document.querySelector('#auto-tour').textContent='Play tour';return}
    touring=true;const token=++tourToken;document.querySelector('#auto-tour').textContent='Stop tour';
    for(let i=0;i<TadazzStageKit.scenes.length&&touring&&token===tourToken;i++){
      await playIndex(i,true);
      await sleep(i===1?250:900);
    }
    if(token===tourToken){touring=false;document.querySelector('#auto-tour').textContent='Play tour'}
  };
  window.addEventListener('keydown',e=>{
    if(['ArrowRight','ArrowLeft',' ','f','F'].includes(e.key))e.preventDefault();
    if(e.key==='ArrowRight')playIndex(current+1);
    if(e.key==='ArrowLeft')playIndex(current-1);
    if(e.key===' ')kit.replay();
    if(e.key.toLowerCase()==='f')document.querySelector('#fullscreen').click();
  });
  window.TadazzPreview={kit,playScene:(scene,data)=>kit.play(scene,data),get scenes(){return TadazzStageKit.scenes}};
  playIndex(0);
})();

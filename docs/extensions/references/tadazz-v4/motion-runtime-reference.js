
/*
 * TADAZZ STAGE MOTION KIT, v4 — large-card survey edition
 * Real HTML/CSS/Web Animations API components, not prerendered video or GIF.
 * Fixed 1920 x 1080 canvas. No network calls or runtime dependencies.
 *
 * new TadazzStageKit(element, {showPercentages:false, assetBase:'assets/'})
 * stage.play('picture-answers', {question,answers,number})
 * stage.play('survey-results', {question, answers, counts:[...], round:1})
 * stage.play('countdown', {question, answers, seconds:10, round:1})
 * stage.play('round-recap', {winners:[{title,imageUrl},...]})
 * stage.play('interlude', {title:'ROUND TWO'})
 * stage.pause(); stage.resume(); stage.replay(); stage.skipToEnd(); stage.destroy();
 * Listen to 'tadazz:animation-complete' on the stage element.
 */
(function (global) {
  'use strict';
  const COLORS=['#eaff59','#26c9ff','#ef79f8','#ffd071','#508dff'];
  const EASE='cubic-bezier(.16,.9,.23,1)';
  const EASE_DRAMATIC='cubic-bezier(.15,.82,.22,1.02)';
  const baseAnswers=[
    {title:'Pirate',imageUrl:'assets/cards/pirate.svg'},
    {title:'Shadchan',imageUrl:'assets/cards/shadchan.svg'},
    {title:'Faithful Dog',imageUrl:'assets/cards/dog.svg'},
    {title:'Therapist',imageUrl:'assets/cards/therapist.svg'},
    {title:'Lamplighter',imageUrl:'assets/cards/lamplighter.svg'}
  ];
  // Only the seven selected tabs appear in the showcase. Voting locked and
  // choice spotlight remain callable via the API but do not appear as tabs.
  const SCENES=[
    {id:'picture-answers', label:'Picture cards', group:'survey'},
    {id:'countdown', label:'Countdown on cards', group:'survey'},
    {id:'survey-results', label:'Reveal survey', group:'survey'},
    {id:'top-pick', label:'Most chosen', group:'survey'},
    {id:'round-recap', label:'Round story recap', group:'story'},
    {id:'interlude', label:'Round break', group:'transitions'},
    {id:'z-wipe', label:'Z transition', group:'transitions'}
  ];
  const LEGACY_SCENES=['question','voting-open','question-image','leaderboard','vote-locked','chosen'];
  function clamp(x,a=0,b=1){ return Math.min(b,Math.max(a,x)); }
  function elt(tag, className='', text){
    const n=document.createElement(tag);
    if(className)n.className=className;
    if(text!==undefined)n.textContent=String(text);
    return n;
  }
  function applyStyle(el,styles){Object.assign(el.style,styles);return el}
  function resolveAsset(src){return (global.TADAZZ_ASSETS && global.TADAZZ_ASSETS[src]) || src;}
  function img(src,classname=''){ const n=elt('img',classname); n.src=resolveAsset(src); n.alt=''; n.decoding='async'; return n; }
  function fraction(n,d){return d<=0?0:n/d;}
  function numbers(list){return list.map(n=>Math.max(0,Number(n)||0));}
  function safeArray(arr,fallback){return Array.isArray(arr)&&arr.length?arr:fallback;}
  function rand(seed){let n=seed>>>0;return ()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};}
  class TadazzStageKit {
    constructor(stage, options={}){
      if(!stage) throw Error('TadazzStageKit requires a #stage element');
      this.stage=stage;
      this.options=Object.assign({showPercentages:true, motionScale:1, assetBase:'assets/', allowAudio:false},options);
      this.activeAnimations=[];
      this.currentScene='';
      this.currentData={};
      this._token=0;
      this._tickerFrame=0;
      this._timerClock=null;
      this._timeouts=[];
      this._bg=elt('div','stage-bg');
      this._veil=elt('div','veil');
      this._ambient=elt('div','ambient');
      for(let j=0;j<4;j++)this._ambient.append(elt('div','ambient-beam'));
      const bulbs=elt('div','ambient-bulbs');
      for(let j=0;j<15;j++){
        const b=elt('i');b.style.animationDelay=`${(-j*.16).toFixed(2)}s`;bulbs.append(b);
      }
      this._ambient.append(bulbs,elt('div','ambient-floor'));
      this._sceneRoot=elt('div');this._sceneRoot.id='scene-root';
      this._fx=elt('div');this._fx.id='fx-root';
      this._flash=elt('div');this._flash.id='screen-flash';
      this.stage.replaceChildren(this._bg,this._veil,this._ambient,this._sceneRoot,this._fx,this._flash);
      this._defaultData={question:'Pick a secondary character.',answers:baseAnswers,number:4,round:1,totalQuestions:10,counts:[24,12,42,14,8],seconds:9,
        teams:[{name:'Team Sapphire',score:980,icon:'S'},{name:'Team Lightning',score:920,icon:'L'},
               {name:'Team Spotlight',score:860,icon:'P'},{name:'Team Aurora',score:790,icon:'A'}]};
      this._applyAssetBase();
    }
    _applyAssetBase(){
      const folder=this.options.assetBase || 'assets/';
      this._bg.style.backgroundImage=`url("${resolveAsset(folder+"question-bg.webp")}")`;
    }
    _cancel(){
      this._token++;
      this._timerClock=null;
      this._timeouts.forEach(clearTimeout);this._timeouts=[];
      if(this._tickerFrame)cancelAnimationFrame(this._tickerFrame);
      for(const a of this.activeAnimations){try{a.cancel()}catch(_) {}}
      this.activeAnimations=[];
      this._fx.replaceChildren();this._flash.style.opacity='0';
      this._sceneRoot.replaceChildren();
    }
    _queueCue(name, delayMs=0){
      const token=this._token;
      const fire=()=>{
        if(token!==this._token)return;
        this.stage.dispatchEvent(new CustomEvent('tadazz:cue',{detail:{name,scene:this.currentScene}}));
        if(typeof this.options.onCue==='function')this.options.onCue(name,this.currentScene);
      };
      if(!delayMs)fire();
      else this._timeouts.push(setTimeout(fire,delayMs/Math.max(.2,Number(this.options.motionScale)||1)));
    }
    _animate(el,frames, opts={}){
      if(!el || !el.animate)return null;
      const speed=Math.max(.2,Number(this.options.motionScale)||1);
      const duration=Math.max(1,Math.round((opts.duration||650)/speed));
      const delay=Math.max(0,Math.round((opts.delay||0)/speed));
      const a=el.animate(frames,{duration,delay,easing:opts.easing||EASE,fill:'both',iterations:opts.iterations||1});
      this.activeAnimations.push(a);
      // Avoid unhandled rejections when the game changes scenes mid-transition.
      a.finished.catch(()=>{});
      return a;
    }
    _animAll(){return Promise.allSettled(this.activeAnimations.map(a=>a.finished));}
    _item(tag,cls,txt,parent,style){let n=elt(tag,cls,txt);if(style)applyStyle(n,style);parent.append(n);return n;}
    _identity(mode='SURVEY',num='04',data={}){
      const brand=this._item('div','stage-identity','',this._sceneRoot);
      brand.append(img('assets/tadazz-brand-logo.png','stage-brand-logo'));
      const round=Math.max(1,Number(data.round)||1);
      const detail=data.showQuestionNumber===false ? '' : ` · QUESTION ${String(data.number??num??1).padStart(2,'0')} / ${data.totalQuestions||10}`;
      this._item('div','stage-round-pill',`ROUND ${String(round).padStart(2,'0')}${detail}`,this._sceneRoot);
    }
    _questionFrame(data){
      const f=this._item('div','q-frame','',this._sceneRoot);
      const eyebrow=this._item('div','eyebrow',data.eyebrow||'THE NEXT QUESTION',f);
      const q=this._item('div','q-text',data.question,f);
      if(String(data.question||'').length>65)q.style.fontSize='49px';
      else if(String(data.question||'').length>48)q.style.fontSize='56px';
      return {f,eyebrow,q};
    }
    _cards(data,{recap=false}={}){
      const list=this._item('div',recap?'answers recap-answers':'answers','',this._sceneRoot);
      const ans=safeArray(recap?data.winners:data.answers,baseAnswers).slice(0,5);
      const slots=[];
      for(let i=0;i<5;i++){
        const a=ans[i]||{title:`Choice ${i+1}`,imageUrl:baseAnswers[i].imageUrl};
        const slot=this._item('div','choice-slot','',list);
        const card=this._item('article','answer-card','',slot);
        const fig=this._item('figure','',undefined,card);
        const photo=img(a.imageUrl||a.image||baseAnswers[i].imageUrl,'answer-image');
        fig.append(photo);
        const pct=this._item('div','result-percentage','0%',card);
        const fav=this._item('div','winner-tag','AUDIENCE FAVOURITE',card);
        const caption=this._item('figcaption','answer-title',a.title||a.label||`Choice ${i+1}`,fig);
        if(String(a.title||a.label||'').length>16)caption.style.fontSize='25px';
        const track=this._item('div','result-track','',card);
        const fill=this._item('div','result-track-fill','',track);
        const number=this._item('div','answer-index',String(i+1).padStart(2,'0'),slot);
        slot.card=card;slot.percent=pct;slot.track=track;slot.fill=fill;slot.winnerTag=fav;slot.number=number;
        slots.push(slot);
      }
      return slots;
    }
    _questionBase(data, withCards=true){
      this._identity('SURVEY',data.number||4,data);
      const f=this._questionFrame(data);
      const cards=withCards?this._cards(data):[];
      return {f,cards};
    }
    _animateQuestion(f,delay=80){
      this._animate(f.f,[{opacity:0,transform:'translate3d(0,95px,0) scale(.96)'},{opacity:1,transform:'translate3d(0,0,0) scale(1)'}],{duration:970,delay});
      this._animate(f.eyebrow,[{opacity:0,transform:'translate3d(0,18px,0)'},{opacity:1,transform:'none'}],{duration:730,delay:delay+360});
      this._animate(f.q,[{opacity:0,transform:'translate3d(0,22px,0)'},{opacity:1,transform:'none'}],{duration:760,delay:delay+500});
    }
    _animateCards(cards,baseDelay=460){
      cards.forEach((c,i)=>{
        const off=i%2?1:-1;
        this._animate(c,[
          {opacity:0,transform:`translate3d(${off*48}px,168px,0) rotate(${off*5}deg) scale(.78)`},
          {opacity:1,transform:`translate3d(0,-9px,0) rotate(${off*-1.2}deg) scale(1.02)`,offset:.78},
          {opacity:1,transform:'translate3d(0,0,0) rotate(0deg) scale(1)'}
        ],{duration:1180,delay:baseDelay+i*105,easing:EASE_DRAMATIC});
      });
    }
    _smallFooter(text='CHOOSE ONE TO CONTINUE'){
      const f=this._item('div','stage-footer','',this._sceneRoot);
      f.append(elt('div','footer-orbit'),elt('span','footer-caption',text),elt('div','footer-orbit'));
      this._animate(f,[{opacity:0,transform:'translate3d(0,28px,0)'},{opacity:1,transform:'none'}],{duration:800,delay:1390});
      return f;
    }
    _impact(delay=0,style='big'){
      this._queueCue('impact',delay+65);
      const full=style==='big';
      const duration=full?1060:800;
      const ring=this._item('div','blast','',this._fx);
      this._animate(ring,[{opacity:0,transform:'scale(.2)'},{opacity:.85,transform:'scale(.57)',offset:.14},{opacity:.12,transform:'scale(2.8)',offset:.72},{opacity:0,transform:'scale(3.6)'}],{duration,delay,easing:'cubic-bezier(.14,.5,.45,1)'});
      const blade=this._item('div','light-saber','',this._fx);
      this._animate(blade,[{opacity:0,transform:'rotate(-24deg) scaleX(.1)'},{opacity:.95,transform:'rotate(-20deg) scaleX(1.4)',offset:.26},{opacity:0,transform:'rotate(-13deg) scaleX(1.95)'}],{duration:920,delay:delay+35});
      this._animate(this._flash,[{opacity:0},{opacity:.98,offset:.10},{opacity:.26,offset:.28},{opacity:0}],{duration:680,delay:delay+55,easing:'ease-out'});
      const r=rand(7319),count=full?55:22;
      for(let i=0;i<count;i++){
        const a=r()*Math.PI*2;
        const length=300+r()*650;
        const sx=Math.cos(a)*length,sy=Math.sin(a)*length*.72;
        const sp=elt('div','spark');
        const c=COLORS[i%COLORS.length];sp.style.background=c;sp.style.color=c;
        sp.style.width=`${(12+r()*57).toFixed(0)}px`;
        this._fx.append(sp);
        this._animate(sp,[
          {opacity:0,transform:`translate3d(-50%,-50%,0) rotate(${a}rad) scaleX(.15)`},
          {opacity:.92,transform:`translate3d(${sx*.30}px,${sy*.30}px,0) rotate(${a}rad) scaleX(1)`,offset:.13},
          {opacity:0,transform:`translate3d(${sx}px,${sy}px,0) rotate(${a}rad) scaleX(.4)`}
        ],{duration:700+r()*630,delay:delay+r()*150,easing:'cubic-bezier(.2,.48,.48,1)'});
      }
    }
    _playQuestion(data){
      const {f}=this._questionBase(data,false);
      this._animateQuestion(f,100);
      const top=this._item('div','rail top','',this._sceneRoot);
      this._animate(top,[{opacity:0,transform:'scaleX(.1)'},{opacity:.8,transform:'scaleX(1)'}],{duration:1300,delay:250});
      this._item('div','hud-focus','THE QUESTION IS ON THE SCREEN',this._sceneRoot);
      const hud=this._sceneRoot.querySelector('.hud-focus');
      this._animate(hud,[{opacity:0,transform:'translateY(30px)'},{opacity:1,transform:'none'}],{duration:850,delay:820});
    }
    _playPictureAnswers(data){
      const {f,cards}=this._questionBase(data,true);
      this._animateQuestion(f,70);
      this._animateCards(cards,370);
      // No generic footer: the question, oversized cards and their numbers fill the stage.
    }
    _playVoting(data,locked=false){
      const {f,cards}=this._questionBase(data,true);
      this._animateQuestion(f,40);
      this._animateCards(cards,230);
      const status=this._item('div',locked?'vote-status locked-status':'vote-status','',this._sceneRoot);
      status.append(elt('i','vote-dot'),elt('strong','',locked?'VOTES LOCKED':'VOTING OPEN'));
      if(!locked && Number.isFinite(data.timeLeftSec)){
        status.append(elt('span','',`• ${String(Math.floor(data.timeLeftSec/60)).padStart(2,'0')}:${String(data.timeLeftSec%60).padStart(2,'0')}`));
      }
      this._animate(status,[{opacity:0,transform:'translate(-50%,65px) scale(.72)'},{opacity:1,transform:'translate(-50%,0) scale(1)'}],{duration:980,delay:locked?950:1300});
      if(locked) {
        cards.forEach((c,i)=>{
          this._animate(c,[{opacity:1,transform:'translate3d(0,0,0) scale(1)'},{opacity:.75,transform:'translate3d(0,0,0) scale(.974)'},{opacity:.84,transform:'translate3d(0,0,0) scale(.98)'}],{duration:730,delay:960+i*42});
        });
        this._impact(1030,'small');
      }
    }
    _playCountdown(data){
      // Crucially: countdown is OVER the five options, not a replacement screen.
      const {f,cards}=this._questionBase(data,true);
      this._animateQuestion(f,0);
      this._animateCards(cards,75);
      const wrap=this._item('div','countdown-floater','',this._sceneRoot);
      const label=this._item('div','countdown-label','TIME LEFT',wrap);
      const ring=this._item('div','countdown-ring','',wrap);
      ring.innerHTML='<svg viewBox="0 0 170 170" aria-hidden="true"><circle class="timer-track" cx="85" cy="85" r="73"/><circle class="timer-progress" cx="85" cy="85" r="73"/></svg>';
      const val=this._item('div','countdown-value','09',wrap);
      const progress=ring.querySelector('.timer-progress');
      const circumference=2*Math.PI*73;
      progress.style.strokeDasharray=String(circumference);
      progress.style.strokeDashoffset='0';
      this._animate(wrap,[
        {opacity:0,transform:'translate3d(-790px,305px,0) scale(2.55)',offset:0},
        {opacity:1,transform:'translate3d(-790px,305px,0) scale(2.55)',offset:.14},
        {opacity:1,transform:'translate3d(-300px,125px,0) scale(1.48)',offset:.61},
        {opacity:1,transform:'translate3d(0,0,0) scale(1)',offset:1}
      ],{duration:1120,easing:'cubic-bezier(.15,.78,.24,1)'});
      this._animate(label,[{opacity:0},{opacity:1}],{duration:550,delay:720});
      const duration=Math.max(1,Number(data.seconds)||9)*1000;
      this._animate(val,[{opacity:1},{opacity:1}],{duration,easing:'linear'});
      const sweep=this._animate(progress,[{strokeDashoffset:0},{strokeDashoffset:circumference}],{duration,easing:'linear'});
      const token=this._token;
      // CSS/WAAPI values and numeric digits use the same clock, so pause/resume is stable.
      this._timerClock={duration,elapsed:0,started:performance.now(),paused:false,element:val};
      const tick=()=>{
        if(token!==this._token||!this._timerClock)return;
        const clock=this._timerClock;
        const curr=Math.min(clock.duration,clock.elapsed+(clock.paused?0:performance.now()-clock.started));
        const left=Math.max(0,Math.ceil((clock.duration-curr)/1000));
        val.textContent=String(left).padStart(2,'0');
        val.classList.toggle('timer-low',left<=3);
        if(curr<clock.duration)this._tickerFrame=requestAnimationFrame(tick);
        else this._queueCue('countdown-ended');
      };
      tick();
    }
    _playChosen(data){
      const chosen=Math.max(0,Math.min(4,Number(data.selectedIndex ?? 2)));
      const {f,cards}=this._questionBase(data,true);
      this._animateQuestion(f,40);
      this._animateCards(cards,230);
      const tag=this._item('div','vote-status','',this._sceneRoot);
      tag.append(elt('i','vote-dot'),elt('strong','', 'CHOICE SELECTED'));
      this._animate(tag,[{opacity:0,transform:'translate(-50%,70px) scale(.84)'},{opacity:1,transform:'translate(-50%,0) scale(1)'}],{duration:760,delay:1480});
      cards.forEach((c,i)=>{
        if(i===chosen){
          c.classList.add('is-selected');
          this._animate(c,[{transform:'translate3d(0,0,0) scale(1)'},{transform:'translate3d(0,-42px,0) scale(1.115)',offset:.65},{transform:'translate3d(0,-32px,0) scale(1.09)'}],{duration:890,delay:1380});
        } else {
          this._animate(c,[{opacity:1,transform:'translate3d(0,0,0) scale(1)'},{opacity:.38,transform:'translate3d(0,13px,0) scale(.94)'}],{duration:850,delay:1350});
        }
      });
      this._impact(1570,'small');
    }
    _playResults(data){
      // Matches the supplied original Motion Showcase: same five full-sized picture
      // cards remain on screen; numbers and progress reveal directly on each card.
      const {f,cards}=this._questionBase({...data,eyebrow:data.eyebrow||'AUDIENCE RESULTS'},true);
      this._animateQuestion(f,40);
      this._animateCards(cards,185);
      const counts=numbers(safeArray(data.counts,[24,12,42,14,8])).slice(0,5);
      while(counts.length<5)counts.push(0);
      const total=counts.reduce((a,b)=>a+b,0);
      const top=Math.max(...counts);
      const favourites=counts.filter(c=>c===top).length;
      const show=typeof data.showPercentages==='boolean'?data.showPercentages:this.options.showPercentages;
      const animatingNumbers=[];
      cards.forEach((slot,i)=>{
        const percentage=total?100*counts[i]/total:0;
        slot.percent.textContent='0%';
        slot.percent.style.visibility=show?'visible':'hidden';
        slot.fill.style.transform='scaleX(0)';
        slot.fill.style.transformOrigin='left center';
        const delay=1400+i*80;
        this._animate(slot.percent,[
          {opacity:0,transform:'translate3d(0,24px,0) scale(.8)'},
          {opacity:1,transform:'translate3d(0,0,0) scale(1)'}
        ],{duration:560,delay});
        this._animate(slot.track,[{opacity:0},{opacity:1}],{duration:480,delay:delay-100});
        const tween=this._animate(slot.fill,[{transform:'scaleX(0)'},{transform:`scaleX(${Math.max(0.003,percentage/100)})`}],{duration:1070,delay:delay+80,easing:'cubic-bezier(.2,.85,.18,1)'});
        if(show)animatingNumbers.push({el:slot.percent,target:Math.round(percentage),anim:tween});
      });
      // Read the compositor animation's currentTime for pause-safe number roll-up.
      if(animatingNumbers.length){
        const token=this._token;
        const ticker=()=>{
          if(token!==this._token)return;
          let running=false;
          for(const item of animatingNumbers){
            const timing=item.anim.effect.getComputedTiming();
            const progress=timing.progress ?? 0;
            item.el.textContent=`${Math.round(item.target*progress)}%`;
            if(item.anim.playState!=='finished')running=true;
          }
          if(running)this._tickerFrame=requestAnimationFrame(ticker);
        };
        ticker();
      }
      // A winner is a survey favourite, never a 'correct' vs 'wrong' answer.
      if(total>0){
        cards.forEach((slot,i)=>{
          if(counts[i]!==top)return;
          slot.winnerTag.textContent=favourites>1?'JOINT AUDIENCE FAVOURITE':'AUDIENCE FAVOURITE';
          slot.classList.add('is-favourite');
          this._animate(slot.winnerTag,[{opacity:0,transform:'translateY(-14px) scale(.9)'},{opacity:1,transform:'none'}],{duration:680,delay:2650});
          this._animate(slot,[
            {transform:'translate3d(0,0,0) scale(1)'},
            {transform:'translate3d(0,-17px,0) scale(1.027)',offset:.68},
            {transform:'translate3d(0,-9px,0) scale(1.016)'}
          ],{duration:730,delay:2560,easing:EASE_DRAMATIC});
        });
      }
      this._queueCue('survey-reveal',1450);
    }
    _playTopPick(data){
      this._identity('SURVEY',data.number||4,data);
      const ans=safeArray(data.answers,baseAnswers);
      const cnt=numbers(safeArray(data.counts,[13,24,31,20,12]));
      let max=0;for(let i=1;i<Math.min(cnt.length,ans.length);i++)if(cnt[i]>cnt[max])max=i;
      const item=ans[max];
      const top=this._item('div','spotlight-top','THE MOST CHOSEN ANSWER',this._sceneRoot);
      const plate=this._item('div','spotlight-plate','',this._sceneRoot);
      const photo=img(item.imageUrl||item.image||baseAnswers[max].imageUrl,'spotlight-portrait');this._sceneRoot.append(photo);
      const name=this._item('div','spotlight-name',item.title||item.label||'TOP PICK',this._sceneRoot);
      this._animate(top,[{opacity:0,transform:'translateY(-30px)'},{opacity:1,transform:'none'}],{duration:840,delay:400});
      this._animate(plate,[{opacity:0,transform:'scale(.5)'},{opacity:1,transform:'scale(1.05)'}],{duration:1400});
      this._animate(photo,[{opacity:0,transform:'translateY(160px) rotate(-8deg) scale(.58)'},{opacity:1,transform:'translateY(-24px) rotate(2deg) scale(1.06)',offset:.83},{opacity:1,transform:'translateY(0) rotate(0deg) scale(1)'}],{duration:1490,easing:EASE_DRAMATIC});
      this._animate(name,[{opacity:0,transform:'translateY(80px) scale(.87)'},{opacity:1,transform:'none'}],{duration:1040,delay:540});
      this._impact(690,'big');
    }
    _playQuestionImage(data){
      this._identity('PICTURE QUESTION',data.number||4,data);
      const wrap=this._item('div','photo-question','',this._sceneRoot);
      const target=data.questionImage||data.answers?.[0]?.imageUrl||baseAnswers[0].imageUrl;
      const big=img(target,'photo-question-img');wrap.append(big);
      const panel=this._item('div','photo-question-panel','',wrap);
      this._item('div','eyebrow','LOOK CLOSELY',panel);
      this._item('div','photo-question-head',data.questionImageText||'Who would you take on the adventure?',panel);
      const options=this._item('div','photo-options','',wrap);
      safeArray(data.questionOptions,['The navigator','The storyteller','The detective','The inventor']).slice(0,4).forEach((n,i)=>{
        n=`${String.fromCharCode(65+i)}  ·  ${typeof n==='string'?n:(n.title||n.label||'Option')}`;
        const v=this._item('div','photo-option',n,options);
        this._animate(v,[{opacity:0,transform:'translate3d(75px,35px,0)'},{opacity:1,transform:'none'}],{duration:850,delay:740+i*90});
      });
      this._animate(big,[{opacity:0,transform:'translate3d(-130px,85px,0) scale(.78) rotate(-5deg)'},{opacity:1,transform:'none'}],{duration:1370});
      this._animate(panel,[{opacity:0,transform:'translate3d(120px,0,0) scale(.94)'},{opacity:1,transform:'none'}],{duration:1200,delay:270});
    }
    _playLeaderboard(data){
      this._identity('TEAM MODE','LIVE',data);
      const hd=this._item('header','leader-head','',this._sceneRoot);
      this._item('div','scene-kicker','THE LIVE STANDINGS',hd);
      this._item('h2','','TEAM LEADERBOARD',hd);
      this._animate(hd,[{opacity:0,transform:'translateY(60px)'},{opacity:1,transform:'none'}],{duration:880});
      const board=this._item('div','leader-board','',this._sceneRoot);
      const ts=safeArray(data.teams,this._defaultData.teams).slice(0,4).map(x=>({...x})).sort((a,b)=>b.score-a.score);
      ts.forEach((team,i)=>{
        const row=this._item('div','team-row','',board);
        this._item('div','team-rank',`0${i+1}`,row);
        const badge=this._item('div','team-icon',team.icon||team.name?.[0]||'T',row);
        if(i===0)badge.style.background='linear-gradient(120deg,#fed963,#edff73)';
        if(i===0)badge.style.color='#2d104a';
        this._item('div','team-name',team.name||'Team',row);
        const sc=this._item('div','team-score','',row);
        sc.append(document.createTextNode(String(team.score??0)));
        this._item('small','','PTS',sc);
        this._animate(row,[{opacity:0,transform:'translate3d(-190px,45px,0) scale(.96)'},{opacity:1,transform:'none'}],{duration:1100,delay:270+i*180});
      });
    }
    _playRoundRecap(data){
      this._identity('ROUND RECAP',data.number||4,{...data,showQuestionNumber:false});
      const winners=safeArray(data.winners,baseAnswers);
      const slots=this._cards({...data,winners}, {recap:true});
      const shine=this._item('div','story-connection','',this._sceneRoot);
      // A single connected arc links all five winning choices from the round.
      this._animate(shine,[{opacity:0,transform:'scaleX(.06)'},{opacity:.82,transform:'scaleX(1)'}],{duration:1650,delay:970});
      slots.forEach((slot,i)=>{
        this._animate(slot,[
          {opacity:0,transform:`translate3d(${(i-2)*-45}px,145px,0) rotate(${(i-2)*-4}deg) scale(.72)`},
          {opacity:1,transform:'translate3d(0,-10px,0) rotate(0deg) scale(1.02)',offset:.85},
          {opacity:1,transform:'translate3d(0,0,0) scale(1)'}
        ],{duration:1230,delay:180+i*140,easing:EASE_DRAMATIC});
      });
      const caption=this._item('div','story-finale','LET THE STORY BEGIN…',this._sceneRoot);
      this._animate(caption,[
        {opacity:0,transform:'translate3d(0,70px,0) scale(.88)'},
        {opacity:1,transform:'translate3d(0,-8px,0) scale(1.03)',offset:.76},
        {opacity:1,transform:'translate3d(0,0,0) scale(1)'}
      ],{duration:1240,delay:1450,easing:EASE_DRAMATIC});
      this._queueCue('story-begin',1800);
    }
    _playInterlude(data){
      const panel=this._item('div','interlude-panel','',this._sceneRoot);
      const bg=this._item('div','interlude-ray','',panel);
      const mini=this._item('div','interlude-mini','UP NEXT',panel);
      const title=this._item('div','interlude-title',data.title||'ROUND TWO',panel);
      const rule=this._item('div','interlude-rule','',panel);
      this._animate(bg,[{opacity:0,transform:'translate(-50%,-50%) scale(.6)'},{opacity:1,transform:'translate(-50%,-50%) scale(1.25)'}],{duration:1500});
      this._animate(mini,[{opacity:0,transform:'translateY(40px)'},{opacity:1,transform:'none'}],{duration:950,delay:380});
      this._animate(title,[{opacity:0,transform:'translateY(110px) scale(.7)'},{opacity:1,transform:'translateY(-15px) scale(1.035)',offset:.8},{opacity:1,transform:'none'}],{duration:1310,delay:220,easing:EASE_DRAMATIC});
      this._animate(rule,[{opacity:0,transform:'scaleX(.03)'},{opacity:1,transform:'scaleX(1)'}],{duration:980,delay:660});
      this._impact(400,'small');
    }
    _playZWipe(data){
      const wipe=this._item('div','wipe','',this._sceneRoot);
      const wipe2=this._item('div','wipe second','',this._sceneRoot);
      this._animate(wipe,[{opacity:0,transform:'translateX(-2000px) skewX(-22deg)'},{opacity:1,transform:'translateX(700px) skewX(-22deg)',offset:.38},{opacity:.85,transform:'translateX(2450px) skewX(-22deg)'}],{duration:1490,easing:'cubic-bezier(.55,0,.22,1)'});
      this._animate(wipe2,[{opacity:0,transform:'translateX(2500px) skewX(21deg)'},{opacity:1,transform:'translateX(600px) skewX(21deg)',offset:.55},{opacity:0,transform:'translateX(-2000px) skewX(21deg)'}],{duration:1570,delay:160,easing:'cubic-bezier(.55,0,.22,1)'});
      this._impact(680,'small');
    }
    play(sceneName,data={}){
      if(!SCENES.some(s=>s.id===sceneName)&&!LEGACY_SCENES.includes(sceneName))throw Error(`Unknown Tadazz animation: ${sceneName}`);
      this._cancel();
      this.currentScene=sceneName;
      this.currentData=data;
      const payload=Object.assign({},this._defaultData,data||{});
      this.stage.classList.toggle('stage-show',sceneName==='interlude'||sceneName==='z-wipe'||sceneName==='top-pick'||sceneName==='round-recap');
      this._bg.style.backgroundImage=`url("${resolveAsset(this.options.assetBase+(this.stage.classList.contains('stage-show')?'show-stage':'question-bg')+".webp")}")`;
      this.stage.dataset.scene=sceneName;
      this._queueCue('scene:'+sceneName);
      const token=this._token;
      switch(sceneName){
        case 'question':this._playQuestion(payload);break;
        case 'picture-answers':this._playPictureAnswers(payload);break;
        case 'voting-open':this._playVoting(payload,false);break;
        case 'countdown':this._playCountdown(payload);break;
        case 'vote-locked':this._playVoting(payload,true);break;
        case 'chosen':this._playChosen(payload);break;
        case 'survey-results':this._playResults(payload);break;
        case 'top-pick':this._playTopPick(payload);break;
        case 'question-image':this._playQuestionImage(payload);break;
        case 'leaderboard':this._playLeaderboard(payload);break;
        case 'round-recap':this._playRoundRecap(payload);break;
        case 'interlude':this._playInterlude(payload);break;
        case 'z-wipe':this._playZWipe(payload);break;
      }
      return this._animAll().then(()=>{
        if(token===this._token)this.stage.dispatchEvent(new CustomEvent('tadazz:animation-complete',{detail:{scene:sceneName}}));
        return token===this._token;
      });
    }
    pause(){
      if(this._timerClock&&!this._timerClock.paused){
        const c=this._timerClock;c.elapsed+=performance.now()-c.started;c.paused=true;
      }
      this.activeAnimations.forEach(a=>a.pause());
    }
    resume(){
      if(this._timerClock&&this._timerClock.paused){
        this._timerClock.started=performance.now();this._timerClock.paused=false;
      }
      this.activeAnimations.forEach(a=>a.play());
    }
    replay(){return this.play(this.currentScene||'picture-answers',this.currentData)}
    skipToEnd(){
      if(this._timerClock){this._timerClock.elapsed=this._timerClock.duration;this._timerClock.started=performance.now();this._timerClock.element.textContent='00';}
      this.activeAnimations.forEach(a=>{try{a.finish()}catch(_){}});
    }
    setPercentagesVisible(value){this.options.showPercentages=!!value;if(this.currentScene==='survey-results')this.replay()}
    destroy(){this._cancel();this.stage.replaceChildren()}
  }
  TadazzStageKit.scenes=SCENES;
  TadazzStageKit.demoAnswers=baseAnswers;
  global.TadazzStageKit=TadazzStageKit;
})(window);

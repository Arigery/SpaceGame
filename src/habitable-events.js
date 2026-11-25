// Structured rows remain joined by event_id / route / outcome; prose is never parsed.
const HAB_EVENT_BY_ID=new Map(DATA.habitableEvents.events.map(e=>[e.event_id,e]));
const HAB_STORY_BY_ID=new Map(DATA.habitableStories.stories.map(s=>[s.event_id,s]));
function initializeHabitableBiomes(game){
 for(const system of game.stars)system.planets.forEach((p,i)=>{
  if(p.type!=='hab'||DATA.habitableStories.biomes.includes(p.biome))return;
  const existing=HAB_EVENT_BY_ID.get(p.habitableEvent?.storyId);
  // Older saves have no biome. Preserve a previously shown environment-specific event.
  if(existing&&existing.biome!=='공통')p.biome=existing.biome;
  else {
   const random=rng(seedHash(String(game.seed||'legacy')+':hab-biome-v1:'+system.id+':'+i));
   p.biome=DATA.habitableStories.biomes[Math.floor(random()*DATA.habitableStories.biomes.length)];
  }
 });
}
function habitatStoryHtml(text){return '<div class="hab-event-story">'+safeText(text)+'</div>'}
function advanceHabitableStory(system,ev){
 if(!system.planets.some(p=>p.habitableEvent===ev)||ev.status!=='pending')return false;
 if(ev.stage==='intro')ev.stage='route';
 else if(ev.stage==='routeStory')ev.stage='method';
 else return false;
 dirty=true;return true;
}
const HAB_EFFECT_ROWS=new Map();
for(const row of DATA.habitableEvents.effects){const key=[row.event_id,row.route,row.outcome].join(':');if(!HAB_EFFECT_ROWS.has(key))HAB_EFFECT_ROWS.set(key,[]);HAB_EFFECT_ROWS.get(key).push(row)}
function habEventResearchLevel(){return researchModifier('explorationLevel')}
function habEventProbabilities(method,level=habEventResearchLevel()){
 const tier=Math.min(DATA.habitableEvents.researchMaxLevel,Math.max(0,Math.floor(Number(level)||0)));
 return DATA.habitableEvents.probabilities.filter(r=>r.method===method).map(r=>({...r,probability:r.base_probability+r.research_shift_per_tier*tier}));
}
function prepareHabitableStory(system,ev){
 const p=system.planets[ev.planetIndex];if(!p||ev.status!=='pending')return;
 initializeHabitableBiomes(state);ev.researchLevelAtDiscovery??=habEventResearchLevel();
 if(!ev.storyId){
  const pool=DATA.habitableEvents.events.filter(e=>e.biome==='공통'||e.biome===p.biome);
  const candidates=pool;
  const random=rng(seedHash(String(state.seed)+':hab-story-v1:'+system.id+':'+ev.planetIndex));
  ev.storyId=candidates[Math.floor(random()*candidates.length)].event_id;
  ev.roll=random();ev.stage='intro';dirty=true;
 }
}
function habEventEffects(ev,route,outcome,multiplier){
 return (HAB_EFFECT_ROWS.get([ev.storyId,route,outcome].join(':'))||[]).map(row=>({kind:row.effect_kind,target:DATA.habitableEvents.resourceMap[row.target]||row.target,value:Math.round(row.value*multiplier*1e8)/1e8}));
}
function habTraitMultiplier(h,kind,target,extra=0){
 let bonus=extra+researchModifier({planet_growth_pct:'growth',planet_construction_pct:'construction',planet_resource_production_pct:'production'}[kind],kind==='planet_resource_production_pct'?target:'');for(const trait of h.explorationTraits||[])for(const e of trait.effects)if(e.kind===kind&&e.target===target)bonus+=e.value;
 return Math.max(0,1+bonus);
}
function habEffectText(e){
 const label=e.kind==='planet_construction_pct'?'건설 생산력':e.kind==='planet_growth_pct'?'인구 성장':resourceNames[e.target]+(e.kind==='planet_resource_production_pct'?' 생산량':'');
 const n=e.kind==='empire_resource_once'?e.value:Math.round(e.value*10000)/100;
 return label+' '+(n>=0?'+':'')+n+(e.kind==='empire_resource_once'?'':'%');
}
function chooseHabitableRoute(system,ev,route){
 if(!system.planets.some(p=>p.habitableEvent===ev)||ev.status!=='pending'||ev.stage!=='route'||!['A','B'].includes(route))return false;
 ev.route=route;ev.stage='routeStory';dirty=true;return true;
}
function resolveHabitableStory(system,ev,method){
 if(pendingScoutDanger(state)||!system.planets.some(p=>p.habitableEvent===ev)||ev.status!=='pending'||ev.stage!=='method'||!['safe','normal','risky'].includes(method))return false;
 const rows=habEventProbabilities(method,ev.researchLevelAtDiscovery);let sum=0;const result=rows.find(row=>(sum+=row.probability)>ev.roll)||rows[rows.length-1];
 const effects=habEventEffects(ev,ev.route,result.outcome,result.effect_multiplier);if(!effects.length)return false;
 const p=system.planets[ev.planetIndex],def=HAB_EVENT_BY_ID.get(ev.storyId);
 const permanent=effects.filter(e=>e.kind!=='empire_resource_once');
 for(const e of effects)if(e.kind==='empire_resource_once')state.res[e.target]=Math.round((state.res[e.target]+e.value)*1e8)/1e8;
 if(permanent.length){const h=habitat(p);h.explorationTraits??=[];h.explorationTraits.push({id:[ev.storyId,ev.route,method,result.outcome].join(':'),title:def.title+' · '+def['route_'+ev.route.toLowerCase()+'_label'],effects:permanent})}
 Object.assign(ev,{status:'resolved',stage:'result',method,researchLevel:ev.researchLevelAtDiscovery,probabilities:rows,outcome:result.outcome,multiplier:result.effect_multiplier,appliedEffects:effects,awaitingAcknowledgement:true,result:effects.map(habEffectText).join(' · ')});
 dirty=true;rec(def.title+' · '+{guaranteed:'안전 조사',great:'대성공',normal:'일반 성공',failure:'실패'}[result.outcome]+' · '+ev.result);return true;
}
function habitableTraitsHtml(p){
 const traits=p.habData?.explorationTraits||[];
 return '<div class="note"><p>행성 환경: '+safeText(p.biome||'미분류')+'</p><strong>탐험으로 획득한 영구 특성</strong>'+(!traits.length?'<p>없음</p>':traits.map(t=>'<p><b>'+safeText(t.title)+'</b><br>'+t.effects.map(e=>safeText(habEffectText(e))).join(' · ')+'</p>').join(''))+'</div>';
}
function renderHabitableTraits(p){
 let box=$('habExplorationTraits');if(!box){box=document.createElement('div');box.id='habExplorationTraits';$('habStats').after(box)}
 const wasOpen=box.firstElementChild?.open;
 box.innerHTML=tutorial?habitableTraitsHtml(p):
  `<details ${wasOpen?'open':''}><summary>${safeText(p.biome||'미분류')} · 행성 특성</summary>${habitableTraitsHtml(p)}</details>`;
}
function habEventArt(story){
 return '<div class="hab-event-art" aria-label="이벤트 일러스트 영역">'+(story.illustration?'<img src="'+safeText(story.illustration)+'" alt="">':'')+'</div>';
}
function openHabEventDialog(title,desc,body,story){
 openDialog(title,desc,habEventArt(story)+body,true);
 $('overlay').querySelector('.modal').classList.add('hab-event-modal');modalKind='exploration';
 const art=$('modalBody').querySelector('.hab-event-art img');if(art)art.onerror=()=>art.remove();
}
function habChoicePreviewArea(){return '<div id="habChoicePreview" class="hab-choice-preview" role="status" aria-live="polite">선택지에 마우스를 올리면 조사 정보를 확인할 수 있습니다.</div>'}
function bindHabChoicePreviews(selector,previews){
 const panel=$('habChoicePreview'),initial=panel.innerHTML;
 $('modalBody').querySelectorAll(selector).forEach(button=>{
  const show=()=>{panel.innerHTML=previews[button.dataset.habRoute||button.dataset.habMethod];panel.classList.add('active')};
  const hide=()=>{if(document.activeElement!==button){panel.innerHTML=initial;panel.classList.remove('active')}};
  button.onmouseenter=show;button.onmouseleave=hide;button.onfocus=show;
  button.onblur=()=>{panel.innerHTML=initial;panel.classList.remove('active')};
 });
}
function habRouteTopics(ev,route){
 const labels=habEventEffects(ev,route,'great',1).concat(habEventEffects(ev,route,'normal',1),habEventEffects(ev,route,'failure',1)).map(e=>
  e.kind==='planet_construction_pct'?'건설 생산력':e.kind==='planet_growth_pct'?'인구 성장':resourceNames[e.target]);
 return [...new Set(labels)].map(safeText).join(' · ');
}
function showHabitableStory(system,ev){
 prepareHabitableStory(system,ev);const def=HAB_EVENT_BY_ID.get(ev.storyId);if(!def)return;
 const story=HAB_STORY_BY_ID.get(ev.storyId),environment=system.planets[ev.planetIndex].biome;
 const names={guaranteed:'안전 보상',great:'대성공',normal:'일반 성공',failure:'실패'};
 if(ev.awaitingAcknowledgement){
  openHabEventDialog(def.title+' · '+names[ev.outcome],environment+' · 조사 결과',
   habitatStoryHtml(ev.result)+'<button class="hab-event-continue" id="habEventConfirm">확인</button>',story);
  $('habEventConfirm').onclick=()=>{ev.awaitingAcknowledgement=false;dirty=true;closeDialog()};return;
 }
 if(ev.stage==='intro'||ev.stage==='routeStory'){
  const direction=ev.stage==='routeStory';
  const text=direction?story['route_'+ev.route.toLowerCase()+'_story']:story.story_intro;
  openHabEventDialog(def.title,environment+' · '+(direction?def['route_'+ev.route.toLowerCase()+'_label']:'발견 보고'),
   habitatStoryHtml(text)+'<button class="hab-event-continue" id="habStoryContinue">'+(direction?'조사 방식 선택':'조사 방향 선택')+'</button>',story);
  $('habStoryContinue').onclick=()=>{if(advanceHabitableStory(system,ev))showHabitableStory(system,ev)};return;
 }
 if(ev.stage==='route'){
  const previews={};
  const body=['A','B'].map(route=>{
   previews[route]='<span class="hab-preview-label">관련 항목</span><strong>'+habRouteTopics(ev,route)+'</strong>';
   return '<button class="hab-event-choice" data-hab-route="'+route+'" aria-describedby="habChoicePreview"><span class="hab-choice-marker">'+route+'</span><span class="hab-choice-copy"><strong>'+safeText(def['route_'+route.toLowerCase()+'_label'])+'</strong><span>'+safeText(story['route_'+route.toLowerCase()+'_story'])+'</span></span><span class="hab-choice-arrow" aria-hidden="true">›</span></button>';
  }).join('');
  openHabEventDialog(def.title,environment+' · 조사 방향 선택',habitatStoryHtml(story.story_intro)+'<div class="hab-event-choices">'+body+'</div>'+habChoicePreviewArea(),story);
  bindHabChoicePreviews('[data-hab-route]',previews);
  $('modalBody').querySelectorAll('[data-hab-route]').forEach(b=>b.onclick=()=>{if(chooseHabitableRoute(system,ev,b.dataset.habRoute))showHabitableStory(system,ev)});return;
 }
 const previews={};
 const body=['safe','normal','risky'].map((method,index)=>{
  const rows=habEventProbabilities(method,ev.researchLevelAtDiscovery),label={safe:'안전 조사',normal:'일반 조사',risky:'위험 조사'}[method];
  previews[method]=rows.map(r=>'<div class="hab-preview-outcome"><strong>'+names[r.outcome]+' '+Math.round(r.probability*100)+'%</strong><span>'+habEventEffects(ev,ev.route,r.outcome,r.effect_multiplier).map(e=>safeText(habEffectText(e))).join(' · ')+'</span></div>').join('');
  const description={safe:'확실한 소량 보상 · 영구 특성 없음',normal:'성과와 위험을 균형 있게 고려',risky:'더 큰 성과에 도전 · 실패 위험 높음'}[method];
  return '<button class="hab-event-choice" data-hab-method="'+method+'" aria-describedby="habChoicePreview"><span class="hab-choice-marker">'+['Ⅰ','Ⅱ','Ⅲ'][index]+'</span><span class="hab-choice-copy"><strong>'+label+'</strong><span>'+description+'</span></span><span class="hab-choice-arrow" aria-hidden="true">›</span></button>';
 }).join('');
 openHabEventDialog(def.title+' · '+def['route_'+ev.route.toLowerCase()+'_label'],environment+' · 조사 방식 선택 · 탐험 연구 Lv.'+ev.researchLevelAtDiscovery,habitatStoryHtml(story['route_'+ev.route.toLowerCase()+'_story'])+'<div class="hab-event-choices">'+body+'</div>'+habChoicePreviewArea(),story);
 bindHabChoicePreviews('[data-hab-method]',previews);
 $('modalBody').querySelectorAll('[data-hab-method]').forEach(b=>b.onclick=()=>{if(resolveHabitableStory(system,ev,b.dataset.habMethod)){render();showHabitableStory(system,ev)}});
}

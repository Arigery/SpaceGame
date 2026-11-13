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
function habEventResearchLevel(){return Math.min(DATA.habitableEvents.researchMaxLevel,Math.max(0,Math.floor(Number(state.explorationResearchLevel)||0)))}
function habEventProbabilities(method,level=habEventResearchLevel()){
 const tier=Math.min(DATA.habitableEvents.researchMaxLevel,Math.max(0,Math.floor(Number(level)||0)));
 return DATA.habitableEvents.probabilities.filter(r=>r.method===method).map(r=>({...r,probability:r.base_probability+r.research_shift_per_tier*tier}));
}
function prepareHabitableStory(system,ev){
 const p=system.planets[ev.planetIndex];if(!p||ev.status!=='pending')return;
 initializeHabitableBiomes(state);
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
function habTraitMultiplier(h,kind,target){
 let bonus=0;for(const trait of h.explorationTraits||[])for(const e of trait.effects)if(e.kind===kind&&e.target===target)bonus+=e.value;
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
 if(!system.planets.some(p=>p.habitableEvent===ev)||ev.status!=='pending'||ev.stage!=='method'||!['safe','normal','risky'].includes(method))return false;
 const rows=habEventProbabilities(method);let sum=0;const result=rows.find(row=>(sum+=row.probability)>ev.roll)||rows[rows.length-1];
 const effects=habEventEffects(ev,ev.route,result.outcome,result.effect_multiplier);if(!effects.length)return false;
 const p=system.planets[ev.planetIndex],def=HAB_EVENT_BY_ID.get(ev.storyId);
 const permanent=effects.filter(e=>e.kind!=='empire_resource_once');
 for(const e of effects)if(e.kind==='empire_resource_once')state.res[e.target]=Math.round((state.res[e.target]+e.value)*1e8)/1e8;
 if(permanent.length){const h=habitat(p);h.explorationTraits??=[];h.explorationTraits.push({id:[ev.storyId,ev.route,method,result.outcome].join(':'),title:def.title+' · '+def['route_'+ev.route.toLowerCase()+'_label'],effects:permanent})}
 Object.assign(ev,{status:'resolved',stage:'result',method,researchLevel:habEventResearchLevel(),probabilities:rows,outcome:result.outcome,multiplier:result.effect_multiplier,appliedEffects:effects,awaitingAcknowledgement:true,result:effects.map(habEffectText).join(' · ')});
 dirty=true;rec(def.title+' · '+{guaranteed:'안전 조사',great:'대성공',normal:'일반 성공',failure:'실패'}[result.outcome]+' · '+ev.result);return true;
}
function habitableTraitsHtml(p){
 const traits=p.habData?.explorationTraits||[];
 return '<div class="note"><p>행성 환경: '+safeText(p.biome||'미분류')+'</p><strong>탐험으로 획득한 영구 특성</strong>'+(!traits.length?'<p>없음</p>':traits.map(t=>'<p><b>'+safeText(t.title)+'</b><br>'+t.effects.map(e=>safeText(habEffectText(e))).join(' · ')+'</p>').join(''))+'</div>';
}
function renderHabitableTraits(p){
 let box=$('habExplorationTraits');if(!box){box=document.createElement('div');box.id='habExplorationTraits';$('habStats').after(box)}box.innerHTML=habitableTraitsHtml(p);
}
function showHabitableStory(system,ev){
 prepareHabitableStory(system,ev);const def=HAB_EVENT_BY_ID.get(ev.storyId);if(!def)return;
 const story=HAB_STORY_BY_ID.get(ev.storyId),environment=system.planets[ev.planetIndex].biome;
 const names={guaranteed:'안전 보상',great:'대성공',normal:'일반 성공',failure:'실패'};
 if(ev.awaitingAcknowledgement){
  openDialog(def.title+' · '+names[ev.outcome],ev.result,'<button id="habEventConfirm">확인</button>');modalKind='exploration';
  $('habEventConfirm').onclick=()=>{ev.awaitingAcknowledgement=false;dirty=true;closeDialog()};return;
 }
 if(ev.stage==='intro'||ev.stage==='routeStory'){
  const direction=ev.stage==='routeStory';
  const text=direction?story['route_'+ev.route.toLowerCase()+'_story']:story.story_intro;
  openDialog(def.title,environment+' · '+(direction?def['route_'+ev.route.toLowerCase()+'_label']:'발견 보고'),
   habitatStoryHtml(text)+'<button id="habStoryContinue">'+(direction?'조사 방식 선택':'조사 방향 선택')+'</button>',true);modalKind='exploration';
  $('habStoryContinue').onclick=()=>{if(advanceHabitableStory(system,ev))showHabitableStory(system,ev)};return;
 }
 if(ev.stage==='route'){
  const body=['A','B'].map(route=>{
   const preview=['great','normal','failure'].map(outcome=>names[outcome]+': '+habEventEffects(ev,route,outcome,1).map(habEffectText).join(' · ')).join('<br>');
   return '<div class="note"><button data-hab-route="'+route+'">'+route+' · '+safeText(def['route_'+route.toLowerCase()+'_label'])+'</button><p>'+preview+'</p></div>';
  }).join('');
  openDialog(def.title,environment+' · 조사 방향 선택',habitatStoryHtml(story.story_intro)+body,true);modalKind='exploration';
  $('modalBody').querySelectorAll('[data-hab-route]').forEach(b=>b.onclick=()=>{if(chooseHabitableRoute(system,ev,b.dataset.habRoute))showHabitableStory(system,ev)});return;
 }
 const body=['safe','normal','risky'].map(method=>{
  const rows=habEventProbabilities(method),label={safe:'안전 조사',normal:'일반 조사',risky:'위험 조사'}[method];
  return '<div class="note"><button data-hab-method="'+method+'">'+label+'</button><p>'+rows.map(r=>names[r.outcome]+' '+Math.round(r.probability*100)+'% · '+habEventEffects(ev,ev.route,r.outcome,r.effect_multiplier).map(habEffectText).join(' · ')).join('<br>')+'</p><small>'+(method==='safe'?'일회성 보상 · 영구 특성 없음':'모든 결과는 해당 행성에 영구 적용 · 불이익 포함')+'</small></div>';
 }).join('');
 openDialog(def.title+' · '+def['route_'+ev.route.toLowerCase()+'_label'],'조사 방식 선택 · 탐험 연구 Lv.'+habEventResearchLevel(),habitatStoryHtml(story['route_'+ev.route.toLowerCase()+'_story'])+body,true);modalKind='exploration';
 $('modalBody').querySelectorAll('[data-hab-method]').forEach(b=>b.onclick=()=>{if(resolveHabitableStory(system,ev,b.dataset.habMethod)){render();showHabitableStory(system,ev)}});
}

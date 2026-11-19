// Independent seeded allocation never consumes the galaxy generation random stream.
function eventQuotas(count,rates){
 const entries=Object.entries(rates).map(([key,rate],order)=>({key,n:Math.floor(count*rate),fraction:count*rate%1,order}));
 let left=count-entries.reduce((n,e)=>n+e.n,0);
 for(const e of [...entries].sort((a,b)=>b.fraction-a.fraction||a.order-b.order)){if(left--<=0)break;e.n++}
 return Object.fromEntries(entries.map(e=>[e.key,e.n]));
}
function eventShuffle(items,random){const out=[...items];for(let i=out.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[out[i],out[j]]=[out[j],out[i]]}return out}
function explorationPlan(game){
 const random=rng(seedHash(String(game.seed||'legacy')+':exploration-v1'));
 const order=eventShuffle(game.stars.filter(s=>s.id!==0),random),quotas=eventQuotas(game.stars.length,DATA.exploration.rates);
 const plan=Object.fromEntries(game.stars.map(s=>[s.id,{type:'normal'}])),used=new Set();
 // System anomalies and planet habitat rolls use separate random streams.
 for(const type of ['anomaly','rare']){
  const eligible=s=>type==='rare'||s.planets.some(p=>['mineral','gas','barren'].includes(p.type));
  for(const s of order.filter(s=>!used.has(s.id)&&eligible(s)).slice(0,quotas[type])){
   used.add(s.id);const targets=s.planets.map((p,i)=>({p,i})).filter(({p})=>['mineral','gas','barren'].includes(p.type));
   plan[s.id]={type,planetIndex:type==='rare'?null:targets[Math.floor(random()*targets.length)].i};
  }
 }
 // Impossible allocations fall back to normal rather than attaching an invalid event.
 const anomalies=eventShuffle(order.filter(s=>plan[s.id].type==='anomaly'),random);
 for(const barren of [false,true]){
  const group=anomalies.filter(s=>(s.planets[plan[s.id].planetIndex].type==='barren')===barren);
  const tones=eventQuotas(group.length,barren?DATA.exploration.barrenOutcomeRates:DATA.exploration.outcomeRates);
  let offset=0;
  for(const [tone,count] of Object.entries(tones))for(const s of group.slice(offset,offset+=count)){
   const entry=plan[s.id],planet=s.planets[entry.planetIndex];
   const options=DATA.exploration.events.filter(e=>!e.retired&&e.planet===planet.type&&e.tone===tone);
   entry.eventId=options[Math.floor(random()*options.length)].id;
  }
 }
 return plan;
}
function habitableEventRoll(game,systemId,planetIndex){
 return rng(seedHash(String(game.seed||'legacy')+':habitable-event-v2:'+systemId+':'+planetIndex))()<DATA.exploration.habitableChance;
}
function initializeExploration(game,legacy=false){
 initializeHabitableBiomes(game);
 if(game.explorationVersion===DATA.exploration.version){initializeExplorationSignals(game);return}
 const previousVersion=game.explorationVersion;
 game.explorationVersion=DATA.exploration.version;game.explorationPlan=explorationPlan(game);
 for(const s of game.stars){
  const old=s.explorationEvent;
  // Replace an unanswered retired penalty; completed outcomes are historical records.
  if(old?.status==='pending'&&DATA.exploration.events.find(e=>e.id===old.eventId)?.retired){
   old.eventId='underground_minerals';
  }
  // Preserve already presented habitat events, including unanswered saved popups.
  if(old?.type==='habitable'){
   if(old.status!=='assigned'&&s.planets[old.planetIndex])s.planets[old.planetIndex].habitableEvent=old;
   delete s.explorationEvent;
  }
  // Untriggered v1 plans adopt the new split; completed effects are never replayed.
  if(s.explorationEvent?.status==='assigned')delete s.explorationEvent;
  const scanned=s.surveyed||s.planets.some(p=>p.scanned);
  if(s.id===0||!previousVersion&&legacy&&scanned)s.explorationEvent={type:'normal',status:'resolved',legacy:true};
  s.planets.forEach((p,i)=>{
   if(p.type!=='hab'||p.habitableEvent)return;
   const eligible=habitableEventRoll(game,s.id,i);
   p.habitableEvent={type:'habitable',planetIndex:i,eligible,status:s.id===0||s.surveyed||p.scanned||!eligible?'resolved':'assigned'};
  });
 }
 initializeExplorationSignals(game);
}
// Signals only point to an existing, unscanned event; no extra event roll or reward.
function initializeExplorationSignals(game){
 if(game.signalVersion===1)return;
 for(const system of game.stars){
  if(system.explorationSignal!==undefined)continue;
  const candidates=[];
  const anomaly=system.explorationEvent||game.explorationPlan?.[system.id];
  if(anomaly?.type==='anomaly'&&(!anomaly.status||anomaly.status==='assigned')){
   const p=system.planets[anomaly.planetIndex];
   if(p&&!p.scanned&&!system.surveyed)candidates.push({planetIndex:anomaly.planetIndex,kind:'anomaly'});
  }
  system.planets.forEach((p,i)=>{if(p.habitableEvent?.status==='assigned'&&!p.scanned&&!system.surveyed)candidates.push({planetIndex:i,kind:'habitable'})});
  const random=rng(seedHash(String(game.seed||'legacy')+':pre-signal-v1:'+system.id));
  system.explorationSignal=system.id!==0&&candidates.length&&random()<DATA.exploration.signalChance?{...candidates[Math.floor(random()*candidates.length)],resolved:false}:null;
 }
 game.signalVersion=1;
}
function explorationSignalTarget(system){
 const signal=system.explorationSignal,p=system.planets[signal?.planetIndex];
 if(!signal||signal.resolved||!p||p.scanned||system.surveyed)return null;
 const event=signal.kind==='habitable'?p.habitableEvent:(system.explorationEvent||state.explorationPlan?.[system.id]);
 if(!event||event.status&&event.status!=='assigned')return null;
 return p;
}
function explorationSignalVisible(system){
 return !tutorial&&!!explorationSignalTarget(system)&&visible(system.id)&&(systemExplored(system.id)||state.stars.some(s=>systemExplored(s.id)&&s.edges.includes(system.id)));
}
function explorationEntries(system){
 return [system.explorationEvent,...system.planets.map(p=>p.habitableEvent)].filter(Boolean);
}
function prepareExploration(system){
 if(tutorial)return;
 initializeExploration(state);
 system.explorationEvent??={...state.explorationPlan[system.id],status:'assigned'};
}
function triggerExploration(system,target,ship){
 if(tutorial)return;
 prepareExploration(system);
 if(system.explorationSignal&&!system.explorationSignal.resolved&&system.planets[system.explorationSignal.planetIndex]===target){system.explorationSignal.resolved=true;dirty=true;rec(system.name+' · 미확인 신호 조사 완료')}
 for(const ev of [system.explorationEvent,target.habitableEvent].filter(Boolean)){
  if(ev.status!=='assigned')continue;
  if(ev.type==='normal'||ev.type==='rare'){ev.status='resolved';continue}
  if(system.planets[ev.planetIndex]!==target)continue;
  ev.status='pending';ev.ship=ship;dirty=true;
  if(ev.type==='habitable')prepareHabitableStory(system,ev);
  const definition=ev.type==='habitable'?HAB_EVENT_BY_ID.get(ev.storyId):DATA.exploration.events.find(e=>e.id===ev.eventId);
  if(definition?.scoutDanger)queueScoutDanger(state,ship,{...definition.scoutDanger,eventSlot:ev.type==='habitable'?'planet':'system',planetIndex:ev.planetIndex});
  rec(system.name+' · '+(ev.type==='habitable'?'행성 탐험':definition.title)+' 발견');
 }
}

function planetEventProduction(p){const e=p.explorationEffects;return Math.max(0,1+researchModifier('production',DATA.planets[p.type]?.resource)+(e?.productionBonus||0)+((e?.temporary?.remaining||0)>0?e.temporary.amount:0))}
function facilityProduction(p){const d=DATA.planets[p.type];return d?.resource?(p.level||0)*d.productionPerLevel*planetEventProduction(p):0}
function facilityConstructionTurns(p){return DATA.planets[p.type].levels[p.level+1].constructionTurns+(p.explorationEffects?.constructionDelay||0)}
function settleExplorationTimers(){
 for(const s of state.stars)if(s.owned)for(const p of s.planets){const effect=p.explorationEffects?.temporary;if(p.level>0&&effect?.remaining>0)effect.remaining--}
}
function resolveExploration(system,choice,ev=system.explorationEvent){
 if(pendingScoutDanger(state)||!explorationEntries(system).includes(ev)||ev?.status!=='pending'||ev.type==='habitable')return false;
 const def=DATA.exploration.events.find(e=>e.id===ev.eventId),option=ev.type==='habitable'?{label:'확인',effects:[]}:def?.options[choice];if(!option)return false;
 const p=system.planets[ev.planetIndex];const results=[];
 for(const effect of option.effects){
  if(effect.kind==='resource'){state.res[effect.resource]+=effect.amount;results.push(resourceNames[effect.resource]+' +'+effect.amount)}
  else if(effect.kind==='production'){p.explorationEffects??={};p.explorationEffects.productionBonus=(p.explorationEffects.productionBonus||0)+effect.amount;results.push(option.label)}
  else if(effect.kind==='temporaryProduction'){p.explorationEffects??={};p.explorationEffects.temporary={amount:effect.amount,remaining:effect.turns};results.push(option.label)}
  else if(effect.kind==='construction'){
   if(p.construction){p.construction.remaining+=effect.turns;p.construction.total+=effect.turns}
   else {p.explorationEffects??={};p.explorationEffects.constructionDelay=(p.explorationEffects.constructionDelay||0)+effect.turns}results.push(option.label);
  }else if(effect.kind==='actionPoints'){const loss=Math.min(effect.amount,state.ap[ev.ship]||0);state.ap[ev.ship]=Math.max(0,(state.ap[ev.ship]||0)-loss);results.push('행동력 −'+loss)}
  else if(effect.kind==='clue'){
   const candidates=system.edges.filter(id=>!systemExplored(id)&&!state.stars[id].explorationClue);
   const id=candidates.length?candidates[seedHash(String(state.seed)+':clue:'+system.id)%candidates.length]:null;
   if(id!==null){const neighbor=state.stars[id];neighbor.explorationClue={habitable:neighbor.planets.some(p=>p.type==='hab')};results.push('미확인 인접 성계 #'+(id+1)+' · 거주 가능 행성 '+(neighbor.explorationClue.habitable?'존재':'없음'))}else results.push('인접 성계에 새로 얻을 단서가 없음');
  }
 }
 ev.status='resolved';ev.awaitingAcknowledgement=ev.type!=='habitable';ev.choice=choice;ev.result=results.join(' · ')||'스토리 준비 중 · 효과 없음';dirty=true;
 rec((def?.title||'행성 탐험')+' · '+ev.result);return true;
}
function pumpExploration(){
 if(!gameActive||tutorial||motionBusy||!state||!$('overlay').classList.contains('hide')||pendingDiscoveries.length)return;
 if(pendingScoutDanger(state)){showPendingEncounter();return}
 const entry=state.stars.flatMap(system=>explorationEntries(system).map(ev=>({system,ev}))).find(({ev})=>ev.status==='pending'||ev.awaitingAcknowledgement);if(!entry)return;
 const {system,ev}=entry;
 if(ev.type==='habitable'&&(ev.status==='pending'||ev.storyId)){showHabitableStory(system,ev);return}
 const def=DATA.exploration.events.find(e=>e.id===ev.eventId);
 if(ev.awaitingAcknowledgement){
  openDialog(def?.title||'행성 탐험',ev.result,'<button id="explorationConfirm">확인</button>');modalKind='exploration';
  $('explorationConfirm').onclick=()=>{ev.awaitingAcknowledgement=false;dirty=true;closeDialog()};return;
 }
 const options=ev.type==='habitable'?[{label:'확인'}]:def.options;
 openDialog(def?.title||'행성 탐험',(def?DATA.planets[def.planet].name+' · '+def.description:null)||'추후 스토리형 행성 탐험 이벤트가 추가될 예정입니다.',
  '<div class="stack">'+options.map((o,i)=>'<button data-exploration-choice="'+i+'">'+safeText(o.label)+'</button>').join('')+'</div>');
 modalKind='exploration';
 $('modalBody').querySelectorAll('[data-exploration-choice]').forEach(button=>button.onclick=()=>{if(resolveExploration(system,Number(button.dataset.explorationChoice),ev)){closeDialog();render()}});
}

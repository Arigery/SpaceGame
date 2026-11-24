// Independent seeded allocation never consumes the galaxy generation random stream.
function eventQuotas(count,rates){
 const entries=Object.entries(rates).map(([key,rate],order)=>({key,n:Math.floor(count*rate),fraction:count*rate%1,order}));
 let left=count-entries.reduce((n,e)=>n+e.n,0);
 for(const e of [...entries].sort((a,b)=>b.fraction-a.fraction||a.order-b.order)){if(left--<=0)break;e.n++}
 return Object.fromEntries(entries.map(e=>[e.key,e.n]));
}
function eventShuffle(items,random){const out=[...items];for(let i=out.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[out[i],out[j]]=[out[j],out[i]]}return out}
function explorationPlan(game,expand=true){
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
   const options=DATA.exploration.events.filter(e=>!e.retired&&e.planet===planet.type&&e.tone===tone&&
    (planet.type!=='barren'||e.options.every(option=>option.effects.every(effect=>effect.kind==='clue'||effect.kind==='resource'&&effect.amount>=0))));
   const fallback=DATA.exploration.anomalyExpansion?.events.filter(e=>e.planet==='barren'&&e.group==='positive')??[];
   const pool=options.length?options:fallback;
   entry.eventId=pool[Math.floor(random()*pool.length)].id;
  }
 }
 if(expand&&DATA.exploration.anomalyExpansion)expandAnomalyPlan(game,plan);
 return plan;
}
function anomalyDefinition(id){
 return DATA.exploration.events.find(event=>event.id===id)??DATA.exploration.anomalyExpansion?.events.find(event=>event.id===id);
}
function expandAnomalyPlan(game,plan){
 const spec=DATA.exploration.anomalyExpansion;
 const random=rng(seedHash(String(game.seed)+':anomaly-expansion-v1'));
 const slots=game.stars.filter(star=>plan[star.id].type==='anomaly');
 const amount=eventQuotas(slots.length,{new:spec.share,existing:1-spec.share}).new;
 const protectedIds=new Set([0,game.neighbor,...(game.startingSystems??[]),...(game.guaranteedColonies??[])]);
 let activeHostiles=0,destructions=0;
 const draw=weights=>{
  let roll=random();
  return Object.keys(weights).find(key=>(roll-=weights[key])<0);
 };
 for(const star of eventShuffle(slots,random).slice(0,amount)){
  const entry=plan[star.id],type=star.planets[entry.planetIndex].type;
  const candidates=spec.events.filter(event=>event.planet===type);
  const allowed=event=>event.group==='destruction'?spec.destructionEnabled&&!protectedIds.has(star.id)&&destructions<spec.destructionCap:
   event.group!=='hostile'||!protectedIds.has(star.id)&&activeHostiles<spec.hostileCap;
  const group=type==='barren'?'positive':draw(spec.weights);
  let options=candidates.filter(event=>event.group===group&&allowed(event));
  if(!options.length){
   const fallback=draw(spec.fallbackWeights);
   options=candidates.filter(event=>event.group===fallback);
  }
  if(!options.length)options=candidates.filter(event=>event.group==='positive');
  const event=options[Math.floor(random()*options.length)];
  entry.eventId=event.id;
  if(event.group==='hostile')activeHostiles++;
  if(event.group==='destruction')destructions++;
 }
}
function habitableEventRoll(game,systemId,planetIndex){
 return rng(seedHash(String(game.seed||'legacy')+':habitable-event-v2:'+systemId+':'+planetIndex))()<DATA.exploration.habitableChance;
}
function initializeExploration(game,legacy=false){
 initializeHabitableBiomes(game);
 if(game.explorationVersion===DATA.exploration.version){initializeExplorationSignals(game);return}
 const previousVersion=game.explorationVersion;
 game.explorationVersion=DATA.exploration.version;game.explorationPlan=explorationPlan(game,!legacy);
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
 if(!legacy&&DATA.exploration.chains)initializeSurveyChains(game);
 if(!legacy&&DATA.balance.regionalWonders)initializeRegionalWonders(game);
 if(!legacy&&DATA.exploration.relics)initializeAncientRelics(game);
}
// Signals only point to an existing, unscanned event; no extra event roll or reward.
function initializeExplorationSignals(game){
 if(game.signalVersion===2)return;
 const legacy=game.signalVersion===1;
 const {signalChance,signalChanceAfterResearch}=DATA.exploration;
 for(const system of game.stars){
  if(system.explorationSignal||system.id===0||system.surveyed)continue;
  const random=rng(seedHash(String(game.seed||'legacy')+':pre-signal-v1:'+system.id));
  const roll=random();
  if(roll>=signalChanceAfterResearch||legacy&&roll<signalChance)continue;
  const candidates=[];
  const anomaly=system.explorationEvent||game.explorationPlan?.[system.id];
  if(anomaly?.type==='anomaly'&&(!anomaly.status||anomaly.status==='assigned')){
   const p=system.planets[anomaly.planetIndex];
   if(p&&!p.scanned&&!system.surveyed)candidates.push({planetIndex:anomaly.planetIndex,kind:'anomaly'});
  }
  system.planets.forEach((p,i)=>{if(p.habitableEvent?.status==='assigned'&&!p.scanned&&!system.surveyed)candidates.push({planetIndex:i,kind:'habitable'})});
  if(candidates.length)system.explorationSignal={
   ...candidates[Math.floor(random()*candidates.length)],resolved:false,requiresResearch:roll>=signalChance
  };
 }
 game.signalVersion=2;
}
function signalDetected(signal){
 return !!signal&&!signal.resolved&&(!signal.requiresResearch||researchComplete('sci_2_2'));
}
function explorationSignalTarget(system){
 const signal=system.explorationSignal,p=system.planets[signal?.planetIndex];
 if(!signalDetected(signal)||!p||p.scanned||system.surveyed)return null;
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
 const signal=system.explorationSignal;
 if(signal&&!signal.resolved&&system.planets[signal.planetIndex]===target){
  if(signalDetected(signal))rec(system.name+' · 미확인 신호 조사 완료');
  signal.resolved=true;dirty=true;
 }
 let eventStarted=false;
 for(const ev of [system.explorationEvent,target.habitableEvent].filter(Boolean)){
  if(ev.status!=='assigned')continue;
  if(ev.type==='normal'||ev.type==='rare'){ev.status='resolved';continue}
  if(system.planets[ev.planetIndex]!==target)continue;
  ev.status='pending';ev.ship=ship;dirty=true;
  if(ev.type==='habitable')prepareHabitableStory(system,ev);
  const definition=ev.type==='habitable'?HAB_EVENT_BY_ID.get(ev.storyId):anomalyDefinition(ev.eventId);
  if(definition?.scoutDanger)queueScoutDanger(state,ship,{...definition.scoutDanger,eventSlot:ev.type==='habitable'?'planet':'system',planetIndex:ev.planetIndex});
  rec(system.name+' · '+(ev.type==='habitable'?'행성 탐험':definition.title)+' 발견');
  eventStarted=true;
  if(ev.type==='anomaly'&&definition.options.length===1)resolveExploration(system,0,ev);
 }
 return eventStarted;
}

let explorationNoticeTimer;
function notifyExploration(message,tone='positive',title=''){
 const notice=$('explorationNotice');
 notice.dataset.tone=tone;
 if(title)notice.innerHTML='<strong>'+safeText(title)+'</strong><span>'+safeText(message)+'</span>';
 else notice.textContent=message;
 clearTimeout(explorationNoticeTimer);
 explorationNoticeTimer=setTimeout(()=>{notice.textContent=''},3500);
}

function planetEventProduction(p,extra=0){const e=p.explorationEffects;return Math.max(0,1+extra+researchModifier('production',DATA.planets[p.type]?.resource)+(e?.productionBonus||0)+((e?.temporary?.remaining||0)>0?e.temporary.amount:0))}
function facilityProduction(p,wonder){const d=DATA.planets[p.type];return d?.resource?(p.level||0)*d.productionPerLevel*planetEventProduction(p,p.type==='mineral'?wonder?.mineralBonus:0):0}
function facilityConstructionTurns(p){return DATA.planets[p.type].levels[p.level+1].constructionTurns+(p.explorationEffects?.constructionDelay||0)}
function settleExplorationTimers(){
 for(const s of state.stars)if(s.owned)for(const p of s.planets){const effect=p.explorationEffects?.temporary;if(p.level>0&&effect?.remaining>0)effect.remaining--}
}
function anomalyClueTargets(system,distance=DATA.exploration.anomalyExpansion.clueDistance){
 const known=new Set([system.id]);
 let frontier=[system.id];
 for(let step=0;step<distance;step++){
  const next=new Set(frontier.flatMap(id=>state.stars[id].edges).filter(id=>!known.has(id)));
  frontier=[...next];for(const id of frontier)known.add(id);
 }
 return [...known].filter(id=>visible(id)&&!systemExplored(id)&&!state.stars[id].explorationClue).sort((a,b)=>a-b);
}
function revealAnomalyClue(id){
 const target=state.stars[id];
 writeExplorationClue(target);
 return '성계 구성 확인 · '+(systemKnown(id)?target.name:'미확인 성계 #'+(id+1));
}
function spawnAnomalyDefense(game,system,name){
 if(system.anomalyDefense)return false;
 const spec=DATA.exploration.anomalyExpansion;
 const design=DATA.combat.defaultDesigns.find(item=>item.id===spec.defenderDesign);
 const owner='anomaly-defense-'+system.id;
 const ship=makeMilitaryShip(game,{designId:design.id,hullId:design.hullId,name,assembly:assembleShipDesign(design)},system.id,owner);
 const fleet=registerFleet(game,name,system.id,owner);
 fleet.shipIds.push(ship.id);game.military.ships.push(ship);
 system.anomalyDefense={owner,name,active:true};
 return true;
}
function resolveExploration(system,choice,ev=system.explorationEvent,clueId=null){
 if(pendingScoutDanger(state)||!explorationEntries(system).includes(ev)||ev?.status!=='pending'||ev.type==='habitable')return false;
 const def=anomalyDefinition(ev.eventId),option=def?.options[choice];
 if(!option||def.group==='destruction'&&!DATA.exploration.anomalyExpansion.destructionEnabled)return false;
 const manualClue=option.effects.some(effect=>effect.kind==='clue');
 const clueTargets=manualClue?anomalyClueTargets(system):[];
 if(clueTargets.length&&!clueTargets.includes(clueId))return false;
 const p=system.planets[ev.planetIndex];const results=[],rewardIcons={};
 for(const effect of option.effects){
  if(effect.kind==='resource'){
   const before=state.res[effect.resource],after=Math.max(0,before+effect.amount),delta=after-before;
   state.res[effect.resource]=after;rewardIcons[results.length]=effect.resource;results.push(resourceNames[effect.resource]+' '+(delta>0?'+':'')+delta);
  }
  else if(effect.kind==='production'){p.explorationEffects??={};p.explorationEffects.productionBonus=(p.explorationEffects.productionBonus||0)+effect.amount;results.push(option.label)}
  else if(effect.kind==='temporaryProduction'){p.explorationEffects??={};p.explorationEffects.temporary={amount:effect.amount,remaining:effect.turns};results.push(option.label)}
  else if(effect.kind==='construction'){
   if(p.construction){p.construction.remaining+=effect.turns;p.construction.total+=effect.turns}
   else {p.explorationEffects??={};p.explorationEffects.constructionDelay=(p.explorationEffects.constructionDelay||0)+effect.turns}results.push(option.label);
  }else if(effect.kind==='actionPoints'){const loss=Math.min(effect.amount,state.ap[ev.ship]||0);state.ap[ev.ship]=Math.max(0,(state.ap[ev.ship]||0)-loss);results.push('행동력 −'+loss)}
  else if(effect.kind==='clue'){
   results.push(clueTargets.length?revealAnomalyClue(clueId):'새 성계 단서 없음');
  }else if(effect.kind==='automaticClue'){
   const candidates=anomalyClueTargets(system);
   if(candidates.length)results.push(revealAnomalyClue(candidates[seedHash(state.seed+':anomaly-clue:'+system.id)%candidates.length]));
   else{state.res.research+=effect.fallbackResearch;rewardIcons[results.length]='research';results.push('연구력 +'+effect.fallbackResearch)}
  }else if(effect.kind==='scoutDisabled'){
   (state.scoutDisabledTurn??={})[ev.ship]=state.turn+1;results.push('다음 턴 행동 불가');
  }else if(effect.kind==='hostileDefense'&&spawnAnomalyDefense(state,system,effect.name)){
   results.push(forceAnomalyScoutRetreat(state,ev.ship,system.id));
   if(activeShip===ev.ship)clearShipSelection();
  }else if(effect.kind==='scoutDestroyed'&&civilianShipRole(ev.ship)==='scout'&&Object.hasOwn(state.ships,ev.ship)){
   results.push(shipName(ev.ship)+' 파괴');
   for(const data of [state.ships,state.ap,state.shipPoints,state.shipHeadings,state.scoutDisabledTurn])if(data)delete data[ev.ship];
   if(activeShip===ev.ship)clearShipSelection();
  }
 }
 ev.status='resolved';ev.awaitingAcknowledgement=true;delete ev.clueChoice;ev.choice=choice;ev.result=results.join(' · ')||'효과 없음';
 ev.resultItems=results.map((text,index)=>({text,resource:rewardIcons[index]}));dirty=true;
 const message=(def?.title||'행성 탐험')+' · '+ev.result;
 rec(message);
 return true;
}
function showAnomalyDialog(system,def,content){
 const tone=['hostile','destruction'].includes(def?.group)?'hostile':def?.tone??'positive';
 const symbols={positive:'✧',negative:'!',hostile:'!',choice:'◇'};
 const context=system.name+(def?' · '+DATA.planets[def.planet].name+' 행성':'');
 openDialog(def?.title||'이상현상',context,
  '<article class="anomaly-brief" data-tone="'+tone+'"><div class="anomaly-emblem" aria-hidden="true"><span>'+symbols[tone]+
  '</span></div>'+(def?.description?'<p>'+safeText(def.description)+'</p>':'')+content+'</article>');
 $('overlay').querySelector('.modal').classList.add('anomaly-modal');
}
function showAnomalyResult(system,ev,def){
 const items=ev.resultItems?.length?ev.resultItems:[{text:ev.result||'효과 없음'}];
 const negative=def?.tone==='negative';
 showAnomalyDialog(system,def,'<ul class="anomaly-rewards">'+items.map(({text,resource})=>
  '<li><span aria-hidden="true">'+(resource?resourceIcon(resource):'◇')+'</span><strong>'+safeText(text)+'</strong></li>').join('')+
  '</ul><button class="anomaly-confirm" id="anomalyConfirm">'+(negative?'결과 확인':'보상 획득')+'</button>');
 modalKind='anomaly-result';
 lockEncounterUI(true);
 $('closeModal').hidden=true;
 const confirm=$('anomalyConfirm');
 confirm.onclick=()=>{
  if(!ev.awaitingAcknowledgement)return;
  delete ev.awaitingAcknowledgement;dirty=true;closeDialog();render();
 };
 confirm.focus();
}
function pumpExploration(updateOpenChoice=false){
 if(!gameActive||tutorial||motionBusy||!state||(!updateOpenChoice&&!$('overlay').classList.contains('hide'))||pendingDiscoveries.length)return;
 if(pendingScoutDanger(state)){showPendingEncounter();return}
 const entry=state.stars.flatMap(system=>explorationEntries(system).map(ev=>({system,ev}))).find(({ev})=>ev.status==='pending'||ev.awaitingAcknowledgement);
 if(!entry){
  const chain=state.surveyChains?.find(item=>item.owner==='player'&&item.pending&&!item.completed);
  if(chain)showSurveyChainChoice(chain);
  return;
 }
 const {system,ev}=entry;
 if(ev.type==='habitable'&&(ev.status==='pending'||ev.storyId)){showHabitableStory(system,ev);return}
 const def=anomalyDefinition(ev.eventId);
 if(ev.awaitingAcknowledgement){showAnomalyResult(system,ev,def);return}
 const options=def.options;
 const clueChoice=options.findIndex(option=>option.effects.some(effect=>effect.kind==='clue'));
 const clueTargets=clueChoice<0?[]:anomalyClueTargets(system);
 const fixed=options.length===1?0:clueChoice>=0&&!clueTargets.length?1-clueChoice:null;
 if(fixed!==null){if(resolveExploration(system,fixed,ev)){render();queueMicrotask(()=>pumpExploration())}return}
 const clues=ev.clueChoice===undefined?[]:clueTargets;
 const choices=options.map((option,index)=>{
  const icons=[...new Set(option.effects.filter(effect=>effect.kind==='resource').map(effect=>effect.resource))];
  return '<button class="anomaly-option" data-exploration-choice="'+index+'"><span aria-hidden="true">'+(icons.length?icons.map(id=>resourceIcon(id)).join(''):String.fromCharCode(65+index))+'</span><b>'+safeText(option.label)+'</b><span aria-hidden="true">›</span></button>';
 }).join('');
 const targets=clues.map(id=>'<button class="anomaly-option" data-anomaly-clue="'+id+'"><span aria-hidden="true">◇</span><b>'+safeText(systemKnown(id)?state.stars[id].name:'미확인 성계 #'+(id+1))+'</b><span aria-hidden="true">›</span></button>').join('');
 showAnomalyDialog(system,def,'<div class="anomaly-options">'+(targets||choices)+'</div>');
 modalKind='exploration';
 $('modalBody').querySelectorAll('[data-exploration-choice]').forEach(button=>button.onclick=()=>{
  const choice=Number(button.dataset.explorationChoice);
  if(choice===clueChoice){
   ev.clueChoice=choice;dirty=true;pumpExploration(true);return;
  }
  if(resolveExploration(system,choice,ev)){closeDialog();render()}
 });
 $('modalBody').querySelectorAll('[data-anomaly-clue]').forEach(button=>button.onclick=()=>{
  if(resolveExploration(system,ev.clueChoice,ev,Number(button.dataset.anomalyClue))){closeDialog();render()}
 });
}

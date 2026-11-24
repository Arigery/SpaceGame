function systemExplored(id){
 const s=state.stars[id];
 return !!(s.explored||s.owned||s.surveyed||s.planetsObserved||(s.nameRevealed&&!s.starScanned)||Object.entries(state.ships).some(([ship,pos])=>civilianShipRole(ship)==='scout'&&pos===id));
}
function canColonize(system){
 return systemOwner(system)===null&&!system.anomalyDefense?.active&&(tutorial?system.surveyed:systemExplored(system.id)&&system.planets.every(p=>targetSurveyed(system,p)));
}
function systemKnown(id){
 const s=state.stars[id];
 return !!(s.surveyed||s.owned||(!tutorial&&(s.nameRevealed||Object.entries(state.ships).some(([ship,pos])=>civilianShipRole(ship)==='scout'&&pos===id))));
}
function visible(id){let s=state.stars[id];return systemKnown(id)||!!s.discoveredByBlackhole||state.stars.some(t=>systemKnown(t.id)&&t.edges.includes(id))}
function rec(msg){dirty=true;state.records.unshift('턴 '+state.turn+' · '+msg);state.records=state.records.slice(0,18)}
// 자원 내역은 실제 턴 정산과 같은 계산식을 공유한다.
// 미결정 건물 유지비(null)는 합산하지 않는다. 군함은 조립 스냅샷 유지비를 청구한다.
function resourceDetails(){
 const details={},effects=shortageEffects(state);
 for(const k of HAB_RESOURCES)details[k]={production:{building:0,mining:0,wonder:0},consumption:{building:0,population:0,manufacturing:0,ship:0,shipyard:0,gateway:0}};
 for(const s of state.stars)if(s.owned){
  const wonder=ownedWonder(s);
  if(wonder?.energyPerSystem)details.energy.production.wonder+=wonder.energyPerSystem;
  if(wonder?.alloyWithMine&&s.planets.some(p=>p.type==='mineral'&&p.level>0))details.alloy.production.wonder+=wonder.alloyWithMine;
  for(const p of s.planets){
   const facility=DATA.planets[p.type];
   if(facility.resource)details[facility.resource].production.mining+=facilityProduction(p,wonder);
   if(facility.levels&&p.level>0)for(const [r,n] of Object.entries(facility.levels[p.level]?.upkeep||{}))if(Number.isFinite(n))details[r].consumption.building+=n;
   if(p.type==='hab'){
     const h=habitat(p),{production,inputs}=habProduction(h,effects,wonder),cons=habConsume(h),upkeep=habUpkeep(h,wonder);
     for(const k of HAB_RESOURCES){
       details[k].production.building+=production[k];
       details[k].consumption.manufacturing+=inputs[k]??0;
       details[k].consumption.population+=cons[k];
       details[k].consumption.building+=upkeep[k];
     }
   }
  }
 }
 for(const [category,cost] of Object.entries(militaryUpkeep(state,'player'))){
  for(const [resource,amount] of Object.entries(cost))if(details[resource])details[resource].consumption[category]=amount;
 }
 for(const star of state.stars)if(gatewayOperational(star,'player'))for(const [r,n] of Object.entries(GATEWAY_BALANCE.upkeep))details[r].consumption.gateway+=n;
 for(const [resource,{consumption}] of Object.entries(details)){
  for(const category of Object.keys(consumption))consumption[category]*=shortageConsumptionRate(effects,resource,category);
 }
 return details;
}
function resourceTotals(d){
 const production=Object.values(d.production).reduce((a,n)=>a+n,0);
 const consumption=Object.values(d.consumption).reduce((a,n)=>a+n,0);
 return {production,consumption,net:production-consumption};
}
function incomes(){const details=resourceDetails(),totals={};for(const k of HAB_RESOURCES)totals[k]=resourceTotals(details[k]).net;return totals}

function shipName(t){const role=civilianShipRole(t);return role==='scout'?'탐사선 '+(t.slice(8)||'1'):role==='colony'?'개척선'+(t==='colony'?'':' '+t.slice(6)):'선택 없음'}
function prospective(t){return state.ships[t]}
function reachable(from,ap,ship=null){
 return civilianRouteCosts(state,from,ap,dest=>visible(dest)&&(!isColonyShip(ship)||systemExplored(dest)));
}
function civilianRouteCosts(game,from,ap,canEnter){
 const result=new Map([[from,0]]),pending=new Set([from]);
 while(pending.size){
  let current;
  for(const id of pending){
   if(current===undefined||result.get(id)<result.get(current))current=id;
  }
  pending.delete(current);
  const star=game.stars[current];
  for(const dest of star.edges){
   if(!canEnter(dest))continue;
   const rate=regionalLaneCost(star,game.stars[dest],'player');
   const cost=Math.round((result.get(current)+rate)*10000)/10000;
   if(cost>ap||cost>=(result.get(dest)??Infinity))continue;
   result.set(dest,cost);
   pending.add(dest);
  }
 }
 result.delete(from);
 return result;
}
function clearShipSelection(){clearFleetSelection();activeShip=null;moveMode=false;scanMode=false;colonizeMode=false}
function blackholeReady(system){
 return system.blackholeTo!==null&&(system.surveyed||(!tutorial&&system.objects?.some(object=>object.kind==='hole'&&object.scanned)));
}
function blackholeJump(t){
 if(!civilianShipRole(t)||!Object.hasOwn(state.ships,t)||colonyBuildingGateway(state,t)||pendingScoutDanger(state)||state.ap[t]<1)return false;
 let from=state.ships[t],s=state.stars[from];
 if(!blackholeReady(s))return false;
 let target=state.stars[s.blackholeTo];
 if(isColonyShip(t)&&!systemExplored(target.id))return false;
 dirty=true;state.ships[t]=target.id;state.ap[t]--;selected=target.id;
 // 이동으로 도착 성계의 위치가 공개되지만 상세 정보는 탐사 이후에 공개된다.
 target.discoveredByBlackhole=true;if(civilianShipRole(t)==='scout')revealScoutArrival(state,target.id);else recordRegionalArrival(state,target.id);
 if(!tutorial){revealBlackholePair(s);presentScoutArrivalDanger(t,target.id,playBlackholeTransit(t,from,target.id))}
 rec(`${shipName(t)} 블랙홀 이동: ${s.name} → ${target.name}`);
 return true;
}
function moveShip(t,to){
  if(!civilianShipRole(t)||!Object.hasOwn(state.ships,t)||colonyBuildingGateway(state,t)||pendingScoutDanger(state))return false;
  const cost=reachable(state.ships[t],state.ap[t],t).get(to);
  if(cost===undefined)return false;
  const departure=state.ships[t];
  dirty=true;state.ships[t]=to;if(civilianShipRole(t)==='scout')revealScoutArrival(state,to);else recordRegionalArrival(state,to);
  state.ap[t]=Math.round((state.ap[t]-cost)*10000)/10000;
  selected=to;
  if(!tutorial)presentScoutArrivalDanger(t,to,playWarp(t,departure,to));
  rec(`${shipName(t)} → ${state.stars[to].name} (행동력 ${cost} 소모)`);
  return true;
}
function performAction(t){
 if(!civilianShipRole(t)||!Object.hasOwn(state.ships,t)||colonyBuildingGateway(state,t)||pendingScoutDanger(state)||state.ap[t]<1||civilianOperationsBlocked(state,state.ships[t]))return false;
 if(!tutorial&&!isColonyShip(t)){systemOpen(state.ships[t]);activeShip=t;render();return true}
 const pos=state.ships[t],s=state.stars[pos];
 if(isColonyShip(t)){
   if(!canColonize(s))return false;
   colonizeMode=false;scanMode=false;state.ap[t]--;s.owned=true;s.ownerId='player';for(const p of s.planets)if(p.type==='hab')habitat(p);
   if(state.wonders)updatePlayerWonderObservation();
   rec(s.name+' 개척 완료');
 }else{
   if(s.surveyed||!visible(pos))return false;
   state.ap[t]--;s.surveyed=true;
   rec(s.name+' 탐사 완료 · 인접 항로 공개');
   const discoveries=[];
   if(s.ancient)discoveries.push({title:s.ancient+' 발견',desc:s.name+'에서 '+s.ancient+'가 발견되었습니다.',body:'고대 문명의 흔적이 확인되었습니다. 현재 프로토타입에서는 추가 자원이나 연구력 보상이 없습니다.'});
   if(s.blackholeTo!==null)discoveries.push({title:'블랙홀 발견',desc:s.name+'에서 쌍을 이루는 블랙홀이 발견되었습니다.',body:'해당 항성계에 있는 함선은 「블랙홀 이동」으로 연결된 다른 항성계로 이동할 수 있습니다. 이동은 행동력 1을 소모합니다.'});
   if(discoveries.length)showDiscoveryQueue(discoveries);
 }
 moveMode=false;selected=pos;render();return true;
}
function nextTurn(aiOrders=[]){if(motionBusy||pendingScoutDanger(state)||state.military?.battle||state.military?.phase==='ai')return false;if(!tutorial&&!researchState().current&&DATA.research.technologies.some(t=>researchAvailable(t.id))){showResearch(true,aiOrders);return false}dirty=true;let messages=[],completed=[];
 // Charge the turn's displayed production/upkeep before activating completed work.
 const inc=incomes();
 for(const s of state.stars)if(s.owned)for(const p of s.planets){
  if(p.type==='hab'){
   const h=habitat(p),job=h.construction;
   if(job){job.progress=Math.min(job.required,job.progress+habPower(h));if(job.progress>=job.required)completed.push(()=>{finishHabConstruction(h,job);messages.push(p.label+' · '+job.label+' 완공')})}
   h.pop=Math.min(habCap(h),h.pop+habGrowth(h));
  }else if(p.construction){
   p.construction.remaining--;if(p.construction.remaining<=0)completed.push(()=>{p.level=p.construction.target;p.construction=null;messages.push(p.label+' 시설 Lv.'+p.level+' 완공')});
  }
 }
 const uncovered=new Set();
 for(const k of HAB_RESOURCES){
  const balance=Math.round(((Number(state.res[k])||0)+inc[k])*10000)/10000;
  if(balance<0)uncovered.add(k);
  state.res[k]=Math.max(0,balance);
 }
 advanceResourceShortages(state,uncovered);
 settleExplorationTimers();const finishedResearch=tutorial?null:settleResearch();if(finishedResearch)messages.push('연구 완료 · '+finishedResearch.name);
 for(const finish of completed)finish();
 messages.push(...settleShipyards(state),...settleGateways(state));
 initializeFleets(state).pendingTurnMessages=messages;
 if(settleFleetTurn(state,aiOrders)===null){showPendingEncounter();return false}
 finishStrategicTurn();
}
function finishStrategicTurn(){
 const messages=state.military.pendingTurnMessages;
 if(!messages||state.military.battle||pendingScoutDanger(state)||state.military.phase!=='player')return;
 delete state.military.pendingTurnMessages;
 state.turn++;
 if(state.wonders)updatePlayerWonderObservation();
 messages.push(...returnWarpFleets(state),...returnMissingScouts(state));
 messages.push(...deliverFleetReinforcements(state));
 const prosperityWinner=tutorial?null:refreshGatewayVictory(state,true);
 if(!tutorial)messages.push(...gatewayVictoryWarnings(state));
 if(prosperityWinner)messages.push((prosperityWinner==='player'?'테라 문명':prosperityWinner)+' · 번영 승리');
 state.ap=Object.fromEntries(Object.keys(state.ships).map(ship=>[ship,state.scoutDisabledTurn?.[ship]===state.turn?0:2]));
 for(const [ship,turn] of Object.entries(state.scoutDisabledTurn??{}))if(turn<state.turn)delete state.scoutDisabledTurn[ship];
 if(!messages.length)messages.push('대기');
 for(const message of messages)rec(message);
 clearShipSelection();restoreEncounterView();render();
 if(prosperityWinner)showVictoryOverview('prosperity');
}

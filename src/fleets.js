// Military ships are separate from civilian state.ships/AP so they cannot survey or colonize.
function initializeFleets(game){
 game.military??={version:1,ships:[],fleets:[],nextId:1,orderSerial:0,phase:'player',lastOrder:null};
 game.military.hostilities??=[];
 game.military.transits??=[];
 game.military.reinforcements??=[];
 validateFleetState(game);return game.military;
}
function validateFleetState(game){
 const m=game.military;
 if(m?.hostilities!==undefined&&(!Array.isArray(m.hostilities)||m.hostilities.some(p=>!Array.isArray(p)||p.length!==2||p[0]===p[1]||p.some(id=>typeof id!=='string'||!id))))throw Error('적대 관계 저장 오류');
 if(m?.version!==1||!Array.isArray(m.ships)||!Array.isArray(m.fleets)||!['player','ai'].includes(m.phase)||!Number.isInteger(m.nextId)||m.nextId<1||!Number.isInteger(m.orderSerial)||m.orderSerial<0)throw Error('함대 저장 상태가 올바르지 않습니다.');
 const ids=new Set(),assigned=new Set(),validId=id=>typeof id==='string'&&/^[a-zA-Z0-9_-]+$/.test(id);
 const deliveries=m.reinforcements??[];
 if(!Array.isArray(deliveries)||deliveries.some(order=>!order?.ship||!game.stars[order.ship.systemId]||!Number.isSafeInteger(order.arrivalTurn)||order.arrivalTurn<1||order.fleetId!==null&&typeof order.fleetId!=='string'))throw Error('증원 이동 저장 오류');
 for(const s of m.ships.concat(deliveries.map(order=>order.ship))){
  if(!validId(s.id)||civilianShipRole(s.id)||ids.has(s.id)||!s.owner||!COMBAT_HULLS.has(s.hullId)||!(s.status==='missing'?s.systemId===null:game.stars[s.systemId])||!Number.isFinite(s.ap)||s.ap<0||!Number.isFinite(s.hp)||s.hp<=0||!Number.isFinite(s.shield)||s.shield<0||!Array.isArray(s.assembly?.weapons)||!s.assembly.weapons.length)throw Error('군함 저장 상태가 올바르지 않습니다.');
  const a=s.assembly;
  if(a.hullId!==s.hullId||['armor','shield','speed','evasion','accuracy'].some(k=>!Number.isFinite(a[k])||a[k]<0)||a.armor<=0||s.hp>a.armor+1e-8||s.shield>a.shield+1e-8||a.weapons.some(w=>!DATA.combat.damageModifiers[w.damageType]||['damage','secondsPerShot','range'].some(k=>!Number.isFinite(w[k])||w[k]<=0)))throw Error('군함 능력치 저장 오류');
  ids.add(s.id);
 }
 for(const order of deliveries){
  const {ship,fleetId,sourceSystemId,waitingForFleet,arrivalTurn}=order;
  const fleet=m.fleets.find(f=>f.id===fleetId&&f.owner===ship.owner);
  if(ship.status||ship.repairJobId||fleetId!==null&&!fleet)throw Error('증원 대상 저장 오류');
  if(sourceSystemId!==undefined&&!game.stars[sourceSystemId])throw Error('증원 생산 성계 저장 오류');
  if(waitingForFleet!==undefined&&(waitingForFleet!==true||sourceSystemId===undefined||fleet?.status!=='missing'||arrivalTurn>game.turn))throw Error('증원 복귀 대기 저장 오류');
 }
 const fleetIds=new Set();
 for(const f of m.fleets){
  if(!validId(f.id)||fleetIds.has(f.id)||!f.owner||typeof f.name!=='string'||!f.name.trim()||f.name.length>60||!(f.status==='missing'?f.systemId===null:game.stars[f.systemId])||!Array.isArray(f.shipIds))throw Error('함대 정보가 올바르지 않습니다.');
  fleetIds.add(f.id);let points=0;
  for(const id of f.shipIds){const s=m.ships.find(s=>s.id===id);if(!s||assigned.has(id)||s.owner!==f.owner||s.systemId!==f.systemId||(s.status==='missing')!==(f.status==='missing'))throw Error('함선 소유·위치·중복 편성 오류');assigned.add(id);points+=DATA.combat.fleets.classCosts[s.hullId]}
  if(points>DATA.combat.fleets.maxCapacity)throw Error('함대 정원 초과');
 }
 validateRetreatState(game);
}
function fleetOwnerTurn(game,owner){return game.military.phase===(owner==='player'?'player':'ai')}
function requireFleetOwnerTurn(game,owner){if(game.military.battle||pendingScoutDanger(game))throw Error('교전 또는 탐사선 결정 진행 중입니다.');if(!fleetOwnerTurn(game,owner))throw Error('현재 진영의 명령 단계가 아닙니다.')}
function militaryMaxAP(game,ship){
 const research=ship.owner==='player'?game.research:game.military.researchByOwner?.[ship.owner];
 const definitions=[...(research?.completed||[]).map(id=>DATA.research.technologies.find(t=>t.id===id)),...(research?.legacyCompleted||[]).map(id=>DATA.research.legacyDefinitions?.[id])].filter(Boolean);
 const bonus=definitions.flatMap(t=>t.effects).filter(e=>e.kind==='strategicAP'&&['military','all',ship.hullId].includes(e.target)).reduce((n,e)=>n+e.value,0);
 return COMBAT_HULLS.get(ship.hullId).strategicAP+bonus;
}
function fleetPoints(game,fleet){return fleet.shipIds.reduce((n,id)=>n+DATA.combat.fleets.classCosts[game.military.ships.find(s=>s.id===id).hullId],0)}
function fleetAP(game,fleet){return fleet.status!=='missing'&&fleet.shipIds.length?Math.min(...fleet.shipIds.map(id=>game.military.ships.find(s=>s.id===id).ap)):0}
function availableFleetOrders(game,ids){
 const targets=new Map();if(!ids.length||!game?.military)return targets;
 for(const star of game.stars){try{targets.set(star.id,planFleetOrder(game,ids,star.id))}catch{}}
 return targets;
}
function localFleetSelection(game,ids,systemId){
 const localIds=new Set((game.military?.fleets??[]).filter(fleet=>
  fleet.owner==='player'&&fleet.systemId===systemId&&fleet.shipIds.length).map(fleet=>fleet.id));
 return ids.filter(id=>localIds.has(id));
}
function canRepositionFleets(game,ids,systemId){
 if(!ids.length||!game?.military||game.military.phase!=='player'||game.military.battle||pendingScoutDanger(game))return false;
 const ships=new Map(game.military.ships.map(ship=>[ship.id,ship]));
 return ids.every(id=>{
  const fleet=game.military.fleets.find(f=>f.id===id);
  return fleet?.owner==='player'&&fleet.systemId===systemId&&fleet.shipIds.length>0&&fleet.shipIds.every(id=>!ships.get(id).repairJobId);
 });
}
function newMilitaryId(m,prefix){let id;do{id=prefix+m.nextId++}while(m.ships.some(s=>s.id===id)||m.fleets.some(f=>f.id===id)||(m.reinforcements??[]).some(order=>order.ship.id===id));return id}
function registerFleet(game,name,systemId,owner){
 const m=game.military,f={id:newMilitaryId(m,'fleet_'),name:name.trim(),systemId,owner,shipIds:[]};
 m.fleets.push(f);return f;
}
function makeMilitaryShip(game,spec,systemId,owner='player'){
 const {designId,hullId,name}=spec,assembly=JSON.parse(JSON.stringify(spec.assembly));
 const ship={id:newMilitaryId(game.military,'mil_'),name,designId,hullId,systemId,owner,assembly,hp:assembly.armor,shield:assembly.shield};
 ship.ap=militaryMaxAP(game,ship);
 return ship;
}
function createStartingMilitaryFleet(game){
 const spec=militaryBuildSpec(game,'default_corvette'),fleet=createFleet(game,'제1 함대',0);
 for(let index=0;index<2;index++){
  const ship=makeMilitaryShip(game,spec,fleet.systemId);
  game.military.ships.push(ship);fleet.shipIds.push(ship.id);
 }
}
function createFleet(game,name,systemId,owner='player'){
 initializeFleets(game);requireFleetOwnerTurn(game,owner);
 if(typeof name!=='string'||!name.trim()||name.length>60||!game.stars[systemId])throw Error('함대 이름이나 성계가 올바르지 않습니다.');
 return registerFleet(game,name,systemId,owner);
}
function ownedFleet(game,id,owner){const f=game.military.fleets.find(f=>f.id===id);if(!f||f.owner!==owner)throw Error('자신의 함대만 편집할 수 있습니다.');if(f.status==='missing')throw Error('이탈 중인 함대에는 명령할 수 없습니다.');return f}
function renameFleet(game,id,name,owner='player'){
 requireFleetOwnerTurn(game,owner);const f=ownedFleet(game,id,owner);
 if(typeof name!=='string'||!name.trim()||name.length>60)throw Error('이름은 1~60자여야 합니다.');f.name=name.trim();
}
function assignFleetShip(game,fleetId,shipId,owner='player'){
 requireFleetOwnerTurn(game,owner);const f=ownedFleet(game,fleetId,owner),s=game.military.ships.find(s=>s.id===shipId);
 if(civilianShipRole(shipId))throw Error('민간 함선은 군함 편성에 넣을 수 없습니다.');
 if(!s||s.owner!==owner||s.systemId!==f.systemId)throw Error('같은 성계의 소유 함선만 편성할 수 있습니다.');
 if(game.military.fleets.some(f=>f.shipIds.includes(shipId)))throw Error('이미 편성된 함선입니다.');
 if(fleetPoints(game,f)+fleetReservedCapacity(game,f)+DATA.combat.fleets.classCosts[s.hullId]>DATA.combat.fleets.maxCapacity)throw Error('예약을 포함한 편제 규모 한도 '+DATA.combat.fleets.maxCapacity+'을 초과합니다.');
 f.shipIds.push(shipId);
}
function removeFleetShip(game,fleetId,shipId,owner='player'){
 requireFleetOwnerTurn(game,owner);const f=ownedFleet(game,fleetId,owner);
 if(!f.shipIds.includes(shipId))throw Error('해당 함대의 함선이 아닙니다.');
 dropShipyardRepair(game,game.military.ships.find(s=>s.id===shipId),f.systemId);
 f.shipIds=f.shipIds.filter(id=>id!==shipId);
}
function disbandFleet(game,id,owner='player'){
 requireFleetOwnerTurn(game,owner);const f=ownedFleet(game,id,owner);if(f.shipIds.length)throw Error('빈 함대만 해산할 수 있습니다.');
 detachFleetReinforcements(game,f);
 game.military.fleets=game.military.fleets.filter(f=>f.id!==id);
}
// Explicit TEST provisioning only; production/shipyard economics remain a later phase.
function deployTestMilitaryShip(game,designId,systemId){
 if(!DATA.combat.fleets.testDeploymentEnabled)throw Error('시험 배치가 비활성화되어 있습니다.');
 const m=initializeFleets(game);requireFleetOwnerTurn(game,'player');
 if(!game.stars[systemId]?.owned)throw Error('개척한 성계에만 시험 배치할 수 있습니다.');
 const d=game.shipDesigns?.find(d=>d.id===designId);if(!d)throw Error('설계가 없습니다.');
 const unit=createCombatUnit(newMilitaryId(m,'mil_'),d.hullId,'player',0,d);
 const s={id:unit.id,designId:d.id,name:d.name,hullId:d.hullId,owner:'player',systemId,assembly:unit.assembly,hp:unit.hp,shield:unit.shield,ap:0};
 s.ap=militaryMaxAP(game,s);m.ships.push(s);return s;
}
function militaryKnown(game,id,owner){
 const s=game.stars[id];if(!s)return false;
 if(owner!=='player')return s.ownerId===owner||game.military.knownSystems?.[owner]?.includes(id)||game.military.ships.some(u=>u.owner===owner&&u.systemId===id);
 return !!(s.owned||s.surveyed||s.nameRevealed||s.explored||s.planetsObserved||Object.entries(game.ships||{}).some(([k,pos])=>civilianShipRole(k)==='scout'&&pos===id));
}
const isAnomalyFaction=owner=>typeof owner==='string'&&owner.startsWith('anomaly-defense-');
function factionsHostile(game,a,b){return !!a&&!!b&&a!==b&&(isAnomalyFaction(a)||isAnomalyFaction(b)||(game.military?.hostilities??[]).some(pair=>pair.includes(a)&&pair.includes(b)))}
function setMilitaryHostility(game,a,b,hostile){
 if(!a||!b||a===b)throw Error('서로 다른 진영이 필요합니다.');
 const m=initializeFleets(game);requireFleetOwnerTurn(game,'player');
 m.hostilities=m.hostilities.filter(p=>!(p.includes(a)&&p.includes(b)));
 if(hostile)m.hostilities.push([a,b].sort());
}
function militaryHostile(game,id,owner){return game.military.ships.some(s=>s.systemId===id&&factionsHostile(game,s.owner,owner))}
function systemOwner(star){return star?.ownerId??(star?.owned?'player':null)}
function captureUndefendedSystem(game,id,owner){
 const star=game.stars[id],formerOwner=systemOwner(star);
 if(!formerOwner||!factionsHostile(game,owner,formerOwner)||militaryHostile(game,id,owner))return null;
 star.ownerId=owner;star.owned=owner==='player';
 if(star.owned||formerOwner==='player')star.nameRevealed=true;
 if(star.gateway){
  delete star.gateway.builder;
  delete star.gateway.builderShip;
  refreshGatewayVictory(game);
 }
 if(ownedWonder(star)?.observationDistance&&typeof state!=='undefined'&&game===state)updatePlayerWonderObservation();
 return {formerOwner,owner,canceledBuilds:transferShipyards(game,star)};
}
function captureMessage(game,order){
 const {owner,canceledBuilds}=order.capture;
 return game.stars[order.to].name+' · '+(owner==='player'?'아군':owner)+' 점령'+(canceledBuilds?' · 건조 '+canceledBuilds+'건 취소':'');
}
function fleetRoute(game,from,to,owner){
 if(!militaryKnown(game,to,owner))return null;
 const costs=new Map([[from,0]]),paths=new Map([[from,[from]]]),pending=new Set([from]);
 while(pending.size){
  const at=[...pending].sort((a,b)=>costs.get(a)-costs.get(b)||a-b)[0];pending.delete(at);
  if(at===to)return {cost:costs.get(at),path:paths.get(at)};
  if(at!==from&&militaryHostile(game,at,owner))continue;
  for(const next of game.stars[at].edges){
   if(!militaryKnown(game,next,owner))continue;
   const a=game.stars[at],b=game.stars[next];
   const rate=regionalLaneCost(a,b,owner);
   const cost=Math.round((costs.get(at)+rate)*10000)/10000;
   if(cost<(costs.get(next)??Infinity)){costs.set(next,cost);paths.set(next,[...paths.get(at),next]);pending.add(next)}
  }
 }
 return null;
}
function planFleetOrder(game,ids,to,owner='player',viaGateway=false){
 requireFleetOwnerTurn(game,owner);
 if(isAnomalyFaction(owner))throw Error('성계 방어 세력은 이동할 수 없습니다.');
 if(!ids.length||new Set(ids).size!==ids.length||!game.stars[to])throw Error('함대와 목적지를 선택하세요.');
 const fleets=ids.map(id=>ownedFleet(game,id,owner));if(fleets.some(f=>!f.shipIds.length))throw Error('빈 함대는 이동할 수 없습니다.');
 if(fleets.some(f=>f.shipIds.some(id=>game.military.ships.find(s=>s.id===id).repairJobId)))throw Error('수리 대기 중인 함선이 있습니다.');
 const budget=Math.min(...fleets.map(f=>fleetAP(game,f)));
 const routes=fleets.map(f=>{
  const route=viaGateway
   ?gatewayDestinations(game,f.systemId,owner).some(star=>star.id===to)?{cost:GATEWAY_BALANCE.travelCost,path:[f.systemId,to]}:null
   :fleetRoute(game,f.systemId,to,owner);
  return {fleetId:f.id,from:f.systemId,...route};
 });
 if(routes.some(r=>r.cost===undefined||r.cost>budget+1e-9))throw Error('모든 선택 함대가 도달할 수 있는 공개 항로가 필요합니다.');
 if(routes.every(r=>r.from===to)&&!militaryHostile(game,to,owner))throw Error('이미 목적지에 있습니다.');
 return {owner,to,budget,routes,...(viaGateway?{viaGateway:true}:{})};
}
function beginFleetOrder(game,ids,to,owner='player',viaGateway=false){
 validateFleetState(game);
 const plan=planFleetOrder(game,ids,to,owner,viaGateway),staged=JSON.parse(JSON.stringify(game.military));
 // All arrival and AP deductions are staged before any hostile contact is resolved.
 for(const r of plan.routes){const f=staged.fleets.find(f=>f.id===r.fleetId);f.systemId=to;for(const id of f.shipIds){const s=staged.ships.find(s=>s.id===id);s.systemId=to;s.ap=Math.round((s.ap-r.cost)*10000)/10000}}
 const chosenShips=new Set(ids.flatMap(id=>staged.fleets.find(f=>f.id===id).shipIds));
 // Neutral ships and unselected same-faction ships cannot be pulled into an attack.
 const participants=staged.ships.filter(s=>s.systemId===to&&(chosenShips.has(s.id)||factionsHostile(game,s.owner,owner)));let battle=null;
 if(participants.some(s=>s.owner!==owner)){
  const penalty=shortageEffects(game).shipCombat??0;
  const units=participants.map(s=>({id:s.id,name:s.name,hullId:s.hullId,faction:s.owner,side:s.owner===owner?'attacker':'defender',x:s.owner===owner?0:DATA.combat.rules.initialSeparation,hp:s.hp,shield:s.shield,assembly:shortageCombatAssembly(s,penalty),weaponCooldowns:s.assembly.weapons.map(()=>0),revealed:!COMBAT_HULLS.get(s.hullId).abilities.stealth,strategicAP:s.ap}));
  let seed=2166136261;for(const ch of String(game.seed))seed=Math.imul(seed^ch.charCodeAt(0),16777619)>>>0;
  const owners=[...new Set(participants.map(ship=>ship.owner))];
  const hostility=owners.flatMap((a,index)=>owners.slice(index+1).filter(b=>factionsHostile(game,a,b)).map(b=>[a,b]));
  battle=createCombat(units,(seed+game.turn*997+staged.orderSerial*7919)>>>0,hostility,true);
 }
 const order={serial:++staged.orderSerial,turn:game.turn,...plan,combat:null};
 if(battle){
  const shipFleets=new Map(staged.fleets.flatMap(f=>f.shipIds.map(id=>[id,f])));
  const groups=new Map();
  for(const ship of participants){
   const fleet=shipFleets.get(ship.id),id=fleet?.id??'reserve:'+ship.owner;
   if(!groups.has(id))groups.set(id,{id,fleetId:fleet?.id??null,owner:ship.owner,name:fleet?.name??'예비 함선',shipIds:[],status:'active'});
   groups.get(id).shipIds.push(ship.id);
  }
  staged.battle={order,combat:battle,groups:[...groups.values()],decision:staged.phase==='ai'&&participants.some(s=>s.owner==='player')?{kind:'initial'}:null};
 }else staged.lastOrder=order;
 game.military=staged;
 if(plan.routes.some(route=>route.from!==to))recordRegionalArrival(game,to,owner);
 if(!battle){const capture=captureUndefendedSystem(game,to,owner);if(capture)order.capture=capture}
 if(factionsHostile(game,owner,'player'))queueMilitaryScoutDanger(game,to);
 return battle||pendingScoutDanger(game)?{pending:true,...order}:order;
}
// Synchronous callers can still resolve a complete order without player interaction.
function executeFleetOrder(game,ids,to,owner='player'){
 const original=game.military,result=beginFleetOrder(game,ids,to,owner);
 if(!result.pending||pendingScoutDanger(game))return result;
 const engagement=game.military.battle;
 while(!engagement.combat.winner&&engagement.combat.tick<DATA.combat.fleets.maxCombatSteps)stepCombat(engagement.combat);
 if(!engagement.combat.winner){game.military=original;throw Error('전투 계산 제한을 초과했습니다. 명령을 적용하지 않았습니다.')}
 return finishFleetBattle(game);
}
function settleFleetTurn(game,aiOrders=[]){
 const m=initializeFleets(game);requireFleetOwnerTurn(game,'player');
 m.phase='ai';m.turnPlan={orders:JSON.parse(JSON.stringify(aiOrders)),cursor:0,results:[]};
 for(const s of m.ships)if(s.owner!=='player'&&s.status!=='missing')s.ap=militaryMaxAP(game,s);
 return resumeFleetTurn(game);
}
function resumeFleetTurn(game){
 if(game.military.battle||pendingScoutDanger(game))return null;
 let plan=game.military.turnPlan;
 if(!plan)return null;
 while(plan.cursor<plan.orders.length){
  const order=plan.orders[plan.cursor++];
  try{
   if(order.owner==='player')throw Error('AI 진영 오류');
   const result=beginFleetOrder(game,order.fleetIds,order.to,order.owner,order.viaGateway);
   plan=game.military.turnPlan;
   if(pendingScoutDanger(game)){
    if(!game.military.battle)plan.results.push(game.military.lastOrder);
    return null;
   }
   if(result.pending){
    if(game.military.battle.groups.some(group=>group.owner==='player'))return null;
    while(game.military.battle)advanceFleetBattle(game);
    plan=game.military.turnPlan;
    continue;
   }
   plan.results.push(result);
  }catch(e){plan.results.push({error:e.message})}
 }
 if(game.military.pendingTurnMessages){
  for(const result of plan.results)if(result.capture)game.military.pendingTurnMessages.push(captureMessage(game,result));
 }
 recoverMilitaryShields(game);
 game.military.phase='player';delete game.military.turnPlan;
 for(const s of game.military.ships)if(s.owner==='player'&&s.status!=='missing')s.ap=militaryMaxAP(game,s);
 return plan.results;
}
function recoverMilitaryShields(game){
 for(const s of game.military.ships){
  if(s.status==='missing'||s.lastShieldRecoveryTurn===game.turn)continue;
  s.lastShieldRecoveryTurn=game.turn;
  if(s.lastCombatTurn===game.turn)continue;
  s.shield=Math.min(s.assembly.shield,Math.round((s.shield+s.assembly.shield*DATA.combat.rules.shieldRecoveryPerTurn)*10000)/10000);
 }
}

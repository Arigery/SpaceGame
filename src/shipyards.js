function militaryResearchDone(game,id){return !id||(game.research?.completed||[]).includes(id)}
function militaryHullUnlocked(game,id){const h=COMBAT_HULLS.get(id);return !!h&&militaryResearchDone(game,h.requiredResearch)}
function militaryModuleUnlocked(game,id){const m=COMBAT_MODULES.get(id);return !!m&&militaryHullUnlocked(game,m.hullId)&&militaryResearchDone(game,m.requiredResearch)}
function designUnlockErrors(game,d){
 const errors=[];
 if(!militaryHullUnlocked(game,d.hullId))errors.push('함체 연구가 필요합니다.');
 if(Object.values(d.slots).flat().some(id=>id&&!militaryModuleUnlocked(game,id)))errors.push('장착 모듈 연구가 필요합니다.');
 return errors;
}
function initializeShipyards(game){
 initializeFleets(game);
 if(!game.shipyardVersion||game.shipyardVersion===1){
  const home=game.stars[0];
  for(const star of game.stars){
   const legacy=star.shipyard;
   if(!legacy&&(star!==home||!star.owned||star.shipyards?.length))continue;
   const anchor=star.planets?.findIndex(p=>p.type==='hab')??-1;
   const yard=createOrbitalShipyard(anchor<0?null:anchor,legacy?.remaining??0);
   for(const job of legacy?.queue??[]){
    if(job.kind==='build')yard.productionQueue.push(job);
    else if(job.kind==='repair'){
     const {shipId,amount,...spec}=job;
     yard.repairQueue.push({...spec,ships:[{shipId,amount}],cost:spec.cost??{}});
    }else throw Error('이전 조선소 대기열 저장 오류');
   }
   (star.shipyards??=[]).push(yard);delete star.shipyard;
  }
  game.shipyardVersion=2;
 }
 if(game.shipyardVersion===2){migrateFleetRepairs(game);game.shipyardVersion=3}
 if(game.shipyardVersion===3){migrateProductionDestinations(game);game.shipyardVersion=4}
 if(game.shipyardVersion!==4)throw Error('지원하지 않는 조선소 저장 버전입니다.');
 const jobIds=new Set(),repairs=new Set();
 const repairingFleets=new Set();
 const validateJob=job=>{
  if(!job.id||jobIds.has(job.id)||!Number.isInteger(job.remaining)||job.remaining<1||!Number.isInteger(job.total)||job.total<job.remaining||!job.paid)throw Error('조선소 대기열 저장 오류');
  jobIds.add(job.id);
 };
 for(const star of game.stars){
  const anchors=new Set();
  if(star.shipyards!==undefined&&!Array.isArray(star.shipyards))throw Error('조선소 저장 오류');
  for(const yard of orbitalShipyards(star)){
   const {planetIndex,remaining,total,productionQueue,repairQueue}=yard;
   if(anchors.has(planetIndex)||(planetIndex!==null&&(!Number.isInteger(planetIndex)||star.planets?.[planetIndex]?.type!=='hab'))||!Number.isInteger(remaining)||remaining<0||!Number.isInteger(total)||total<remaining||!Array.isArray(productionQueue)||!Array.isArray(repairQueue))throw Error('조선소 저장 오류');
   anchors.add(planetIndex);
   for(const job of productionQueue){
    validateJob(job);
    if(job.kind!=='build'||!COMBAT_HULLS.has(job.hullId)||!job.assembly?.weapons?.length||!validShipyardCost(job.assembly.buildCost))throw Error('생산 대기열 저장 오류');
    if(job.fleetId&&!reinforcementFleet(game,job.fleetId,job.owner??'player'))throw Error('증원 생산 대상 저장 오류');
   }
   for(const job of repairQueue){
    validateJob(job);
    const fleet=game.military.fleets.find(f=>f.id===job.fleetId&&f.owner==='player'&&f.systemId===star.id);
    if(job.kind!=='repair'||!fleet||repairingFleets.has(fleet.id)||!Array.isArray(job.ships)||!job.ships.length||!validShipyardCost(job.cost)||
      !Number.isFinite(job.restored)||job.restored<0||!Number.isFinite(job.armorPerTurn)||job.armorPerTurn<=0)throw Error('수리 대기열 저장 오류');
    repairingFleets.add(fleet.id);
    for(const {shipId,amount} of job.ships){
     if(!fleet.shipIds.includes(shipId)||!Number.isFinite(amount)||amount<0||repairs.has(shipId))throw Error('수리 대기열 저장 오류');
     repairs.add(shipId);
     const ship=game.military.ships.find(s=>s.id===shipId);
     if(!ship||ship.repairJobId!==job.id)throw Error('수리 함선 저장 오류');
    }
    if(job.remaining!==repairTurns(repairRemainingArmor(job),job.armorPerTurn))throw Error('수리 진행 상태 저장 오류');
   }
  }
 }
 for(const s of game.military.ships)if(s.repairJobId&&!repairs.has(s.id))throw Error('누락된 수리 작업');
 for(const fleet of game.military.fleets){
  if(fleetPoints(game,fleet)+fleetReservedCapacity(game,fleet)>DATA.combat.fleets.maxCapacity)throw Error('증원 예약을 포함한 편제 규모 초과');
 }
}
function migrateProductionDestinations(game){
 const usage=new Map(game.military.fleets.map(f=>[f.id,fleetPoints(game,f)]));
 for(const star of game.stars)for(const yard of orbitalShipyards(star))for(const job of yard.productionQueue){
  if(!job.fleetId)continue;
  const fleet=reinforcementFleet(game,job.fleetId,job.owner??'player');
  const used=usage.get(job.fleetId)+DATA.combat.fleets.classCosts[job.hullId];
  if(!fleet||used>DATA.combat.fleets.maxCapacity)job.fleetId=null;
  else usage.set(fleet.id,used);
 }
}
function createOrbitalShipyard(planetIndex,turns){
 return {planetIndex,remaining:turns,total:turns,productionQueue:[],repairQueue:[]};
}
function orbitalShipyards(star){return star?.shipyards??[]}
function validShipyardCost(cost){
 return !!cost&&typeof cost==='object'&&!Array.isArray(cost)&&Object.entries(cost).every(([id,value])=>Object.hasOwn(DATA.resources,id)&&Number.isFinite(value)&&value>=0);
}
function canPayMilitaryCost(game,cost){
 return Object.entries(cost).every(([r,n])=>Number.isFinite(n)&&n>=0&&(game.testEconomy||Number.isFinite(game.res[r])&&game.res[r]+1e-8>=n));
}
function recordMilitaryTestCost(game,owner,category,cost,sign=1){
 const ledger=game.testEconomy[owner]??={};
 const totals=ledger[category]??={};
 for(const [resource,amount] of Object.entries(cost))totals[resource]=Math.round(((totals[resource]??0)+sign*amount)*10000)/10000;
}
function payMilitaryCost(game,cost,category){
 if(!canPayMilitaryCost(game,cost))throw Error('필요 자원이 부족합니다.');
 if(game.testEconomy){recordMilitaryTestCost(game,'player',category,cost);return}
 for(const [r,n] of Object.entries(cost))game.res[r]=Math.round((game.res[r]-n)*10000)/10000;
}
function refundMilitaryCost(game,cost,category){
 if(game.testEconomy){recordMilitaryTestCost(game,'player',category,cost,-1);return}
 for(const [resource,amount] of Object.entries(cost))game.res[resource]=Math.round(((game.res[resource]??0)+amount)*10000)/10000;
}
function militaryUpkeep(game,owner){
 const costs={ship:{},shipyard:{}};
 const add=(category,resource,amount)=>{costs[category][resource]=(costs[category][resource]??0)+amount};
 for(const star of game.stars)if(systemOwner(star)===owner){
  for(const yard of orbitalShipyards(star))if(yard.remaining===0){
   for(const [resource,amount] of Object.entries(DATA.combat.shipyards.upkeep))add('shipyard',resource,amount);
  }
 }
 const military=game.military;
 const ships=(military?.ships??[]).concat((military?.reinforcements??[]).map(order=>order.ship));
 for(const ship of ships)if(ship.owner===owner){
  for(const [resource,amount] of Object.entries(ship.assembly.upkeep??{}))add('ship',resource,amount);
 }
 return costs;
}
function requireShipyard(game,id,planetIndex){
 requireFleetOwnerTurn(game,'player');const star=game.stars[id];
 if(!star?.owned)throw Error('소유 성계에서만 이용할 수 있습니다.');
 const yard=orbitalShipyards(star).find(y=>y.remaining===0&&(planetIndex===undefined||y.planetIndex===planetIndex));
 if(!yard)throw Error('완공된 조선소가 필요합니다.');
 return yard;
}
function shipyardConstructionBlock(game,id,planetIndex){
 const star=game.stars[id];
 if(!star?.owned||star.planets[planetIndex]?.type!=='hab')return '소유한 거주 가능 행성의 궤도에만 건설할 수 있습니다.';
 if(orbitalShipyards(star).some(y=>y.planetIndex===planetIndex))return '이 행성 궤도에 조선소가 있거나 건설 중입니다.';
 if(game.ships?.colony!==id)return '개척선이 이 성계에 있어야 합니다.';
 if(civilianOperationsBlocked(game,id))return '적대 군함이 있는 성계에서는 건설할 수 없습니다.';
 return '';
}
function buildShipyard(game,id,planetIndex){
 initializeShipyards(game);requireFleetOwnerTurn(game,'player');
 const star=game.stars[id];
 const reason=shipyardConstructionBlock(game,id,planetIndex);if(reason)throw Error(reason);
 const {cost,buildTurns}=DATA.combat.shipyards;
 payMilitaryCost(game,cost,'construction');
 const yard=createOrbitalShipyard(planetIndex,buildTurns);
 (star.shipyards??=[]).push(yard);return yard;
}
function militaryBuildSpec(game,designId){
 const d=game.shipDesigns.find(d=>d.id===designId);
 if(!d)throw Error('설계가 없습니다.');
 const errors=[...validateShipDesign(d),...designUnlockErrors(game,d)];if(errors.length)throw Error(errors.join(' '));
 return {kind:'build',hullId:d.hullId,designId:d.id,name:d.name,assembly:assembleShipDesign(d),total:COMBAT_HULLS.get(d.hullId).buildTurns};
}
function queueShipyardJob(game,queue,spec){
 const job={...spec,id:newMilitaryId(game.military,'job_'),remaining:spec.total,paid:true};
 queue.push(job);return job;
}
function enqueueMilitaryBuild(game,id,designId,planetIndex){
 const yard=requireShipyard(game,id,planetIndex),spec=militaryBuildSpec(game,designId);
 payMilitaryCost(game,spec.assembly.buildCost,'production');
 return queueShipyardJob(game,yard.productionQueue,{...spec,fleetId:null});
}
function cancelMilitaryBuild(game,id,planetIndex,jobId){
 const {productionQueue}=requireShipyard(game,id,planetIndex);
 const index=productionQueue.findIndex(job=>job.id===jobId);
 if(index<0)throw Error('이미 완료되었거나 존재하지 않는 생산입니다.');
 const [job]=productionQueue.splice(index,1);
 refundMilitaryCost(game,job.assembly.buildCost,'production');
 return job;
}
function transferShipyards(game,star){
 let canceledBuilds=0;
 for(const yard of orbitalShipyards(star)){
  canceledBuilds+=yard.productionQueue.length;
  yard.productionQueue.length=0;
  for(const repair of yard.repairQueue)unlockRepairRoster(game,repair);
  yard.repairQueue.length=0;
 }
 return canceledBuilds;
}
function repairTurns(armor,throughput){return Math.ceil(armor/throughput)}
function repairRemainingArmor(job){return Math.round(job.ships.reduce((n,entry)=>n+entry.amount,0)*1e8)/1e8}
function fleetRepairQuote(game,fleet){
 const ships=fleet.shipIds.map(id=>game.military.ships.find(s=>s.id===id)).filter(ship=>ship?.hp>0)
  .map(ship=>({shipId:ship.id,amount:Math.max(0,ship.assembly.armor-ship.hp)}));
 const {armorPerTurn,armorPerAlloy,energyPerTurn}=DATA.combat.shipyards.repair;
 const missing=repairRemainingArmor({ships}),turns=repairTurns(missing,armorPerTurn);
 const cost={alloy:Math.round(missing/armorPerAlloy*10000)/10000,energy:Math.round(turns*energyPerTurn*10000)/10000};
 return {ships,missing,cost,turns,armorPerTurn};
}
function fleetRepairSpec(fleet,quote,cost=quote.cost){
 return {kind:'repair',fleetId:fleet.id,name:fleet.name,ships:quote.ships,cost,total:quote.turns,restored:0,armorPerTurn:quote.armorPerTurn};
}
function lockRepairRoster(game,job){
 for(const {shipId} of job.ships)game.military.ships.find(s=>s.id===shipId).repairJobId=job.id;
}
function migrateFleetRepairs(game){
 for(const ship of game.military.ships)delete ship.repairJobId;
 const jobs=new Map();
 for(const star of game.stars)for(const yard of orbitalShipyards(star)){
  const previous=yard.repairQueue;yard.repairQueue=[];
  for(const old of previous){
   if(!old.paid||!validShipyardCost(old.cost))throw Error('이전 수리 작업 결제 정보가 올바르지 않습니다.');
   const fleet=game.military.fleets.find(f=>f.owner==='player'&&f.systemId===star.id&&
    (old.fleetId?old.fleetId===f.id:old.ships.some(({shipId})=>f.shipIds.includes(shipId))));
   const quote=fleet&&fleetRepairQuote(game,fleet);
   if(!quote?.missing){refundMilitaryCost(game,old.cost,'repair');continue}
   const existing=jobs.get(fleet.id);
   if(existing){for(const [id,amount] of Object.entries(old.cost))existing.cost[id]=Math.round(((existing.cost[id]??0)+amount)*10000)/10000;continue}
   const job={...fleetRepairSpec(fleet,quote,{...old.cost}),id:old.id,remaining:quote.turns,paid:true};
   jobs.set(fleet.id,job);yard.repairQueue.push(job);lockRepairRoster(game,job);
  }
 }
}
function dropShipyardRepair(game,ship,systemId){
 if(!ship.repairJobId)return;
 for(const yard of orbitalShipyards(game.stars[systemId])){
  const index=yard.repairQueue.findIndex(j=>j.id===ship.repairJobId);
  if(index<0)continue;
  const job=yard.repairQueue[index];
  job.ships=job.ships.filter(entry=>entry.shipId!==ship.id);
  job.remaining=repairTurns(repairRemainingArmor(job),job.armorPerTurn);
  if(!job.remaining){yard.repairQueue.splice(index,1);unlockRepairRoster(game,job)}
  break;
 }
 delete ship.repairJobId;
}
function unlockRepairRoster(game,job){
 for(const ship of game.military.ships)if(ship.repairJobId===job.id)delete ship.repairJobId;
}
function fleetRepairScheduled(star,fleetId){
 return orbitalShipyards(star).some(yard=>yard.repairQueue.some(job=>job.fleetId===fleetId));
}
function enqueueFleetRepair(game,fleetId,planetIndex){
 const fleet=ownedFleet(game,fleetId,'player'),yard=requireShipyard(game,fleet.systemId,planetIndex);
 if(fleetRepairScheduled(game.stars[fleet.systemId],fleet.id))throw Error('이미 이 함대의 수리가 예약되어 있습니다.');
 const quote=fleetRepairQuote(game,fleet);
 if(!quote.missing)throw Error('새로 예약할 장갑 수리가 없습니다.');
 payMilitaryCost(game,quote.cost,'repair');
 const job=queueShipyardJob(game,yard.repairQueue,fleetRepairSpec(fleet,quote));
 lockRepairRoster(game,job);return job;
}

function fleetReinforcementOrders(game,fleet){
 const production=game.stars.flatMap(star=>orbitalShipyards(star).flatMap(yard=>yard.productionQueue.filter(job=>job.fleetId===fleet.id&&(job.owner??'player')===fleet.owner).map(job=>({star,job}))));
 const incoming=(game.military.reinforcements??[]).filter(order=>order.fleetId===fleet.id&&order.ship.owner===fleet.owner);
 return {production,incoming};
}
function fleetReservedCapacity(game,fleet){
 const {production,incoming}=fleetReinforcementOrders(game,fleet),costs=DATA.combat.fleets.classCosts;
 return production.reduce((sum,{job})=>sum+costs[job.hullId],0)+incoming.reduce((sum,{ship})=>sum+costs[ship.hullId],0);
}
function reinforcementFleet(game,id,owner){return game.military.fleets.find(f=>f.id===id&&f.owner===owner)}
function fleetWarpDestination(game,fleet){return game.military.transits.find(t=>t.fleetId===fleet.id)?.destination}
function fleetReinforcementSystem(game,fleet){
 return fleet.systemId??fleetWarpDestination(game,fleet);
}
function fleetReinforcementQuote(game,fleetId,designId,count,systemId,planetIndex){
 const fleet=ownedFleet(game,fleetId,'player'),yard=requireShipyard(game,systemId,planetIndex);
 if(!retreatDistances(game,systemId).has(fleet.systemId))throw Error('함대까지 연결되는 항로가 필요합니다.');
 const spec=militaryBuildSpec(game,designId);
 if(!Number.isSafeInteger(count)||count<1)throw Error('증원 수량은 1척 이상의 정수여야 합니다.');
 const reserved=count*DATA.combat.fleets.classCosts[spec.hullId];
 if(fleetPoints(game,fleet)+fleetReservedCapacity(game,fleet)+reserved>DATA.combat.fleets.maxCapacity)throw Error('기존 예약을 포함한 함대 편제 규모를 초과합니다.');
 const cost=Object.fromEntries(Object.entries(spec.assembly.buildCost).map(([id,amount])=>[id,Math.round(amount*count*10000)/10000]));
 return {yard,spec,cost,turns:spec.total*count,reserved};
}
function enqueueFleetReinforcements(game,fleetId,designId,count,systemId,planetIndex){
 const {yard,spec,cost}=fleetReinforcementQuote(game,fleetId,designId,count,systemId,planetIndex);
 payMilitaryCost(game,cost,'production');
 return Array.from({length:count},()=>queueShipyardJob(game,yard.productionQueue,{...spec,fleetId}));
}
function deployIndependentFleet(game,ship){
 const fleet=registerFleet(game,ship.name.slice(0,57).trim()+' 함대',ship.systemId,ship.owner);
 game.military.ships.push(ship);fleet.shipIds.push(ship.id);
 return fleet;
}
function deployAtProducingSystem(game,order){
 order.ship.systemId=order.sourceSystemId??order.ship.systemId;
 deployIndependentFleet(game,order.ship);
}
function detachFleetReinforcements(game,fleet,deployImmediately=false){
 const {production,incoming}=fleetReinforcementOrders(game,fleet);
 for(const {job} of production)job.fleetId=null;
 for(const order of incoming){
  if(deployImmediately)deployAtProducingSystem(game,order);
  else order.fleetId=null;
 }
 if(deployImmediately&&incoming.length){
  const diverted=new Set(incoming);
  game.military.reinforcements=game.military.reinforcements.filter(order=>!diverted.has(order));
 }
}
function finishShipyardProduction(game,star,job){
 const assembly=JSON.parse(JSON.stringify(job.assembly));
 const ship={id:newMilitaryId(game.military,'mil_'),name:job.name,designId:job.designId,hullId:job.hullId,systemId:star.id,owner:job.owner??'player',assembly,hp:assembly.armor,shield:assembly.shield};
 ship.ap=militaryMaxAP(game,ship);
 const fleet=reinforcementFleet(game,job.fleetId,ship.owner);
 const distance=fleet?retreatDistances(game,star.id).get(fleetReinforcementSystem(game,fleet)):undefined;
 if(distance!==undefined){
  const travel=Math.ceil(distance/DATA.combat.shipyards.reinforcementLanesPerTurn);
  const arrivalTurn=game.turn+1+travel;
  (game.military.reinforcements??=[]).push({fleetId:fleet.id,arrivalTurn,sourceSystemId:star.id,ship});
  return ship.name+' 증원 출발 · '+fleet.name+' · '+arrivalTurn+'턴 도착 예정';
 }
 return star.name+' · '+ship.name+' 건조 완료 · '+deployIndependentFleet(game,ship).name;
}
function deliverFleetReinforcements(game){
 const military=game.military,messages=[],pending=[];
 if(military.phase!=='player'||military.battle||pendingScoutDanger(game))return messages;
 for(const order of military.reinforcements??[]){
  const {ship,arrivalTurn,fleetId}=order,fleet=reinforcementFleet(game,fleetId,ship.owner);
  if(arrivalTurn>game.turn){pending.push(order);continue}
  if(fleet?.status==='missing'){
   if(!order.waitingForFleet){
    order.sourceSystemId??=ship.systemId;
    ship.systemId=fleetWarpDestination(game,fleet);
    order.waitingForFleet=true;
   }
   pending.push(order);continue;
  }
  if(!fleet){deployAtProducingSystem(game,order);continue}
  ship.systemId=fleet.systemId;
  military.ships.push(ship);fleet.shipIds.push(ship.id);
  if(ship.owner==='player')messages.push(fleet.name+' · '+ship.name+' 증원 합류');
 }
 military.reinforcements=pending;
 return messages;
}
function advanceFleetRepair(game,star,job){
 let budget=job.armorPerTurn;
 for(const entry of job.ships){
  const ship=game.military.ships.find(s=>s.id===entry.shipId&&s.repairJobId===job.id&&s.hp>0&&s.systemId===star.id);
  if(!ship){entry.amount=0;continue}
  const restored=Math.min(budget,entry.amount,Math.max(0,ship.assembly.armor-ship.hp));
  ship.hp=Math.min(ship.assembly.armor,ship.hp+restored);
  entry.amount=ship.hp>=ship.assembly.armor?0:entry.amount-restored;
  job.restored+=restored;budget-=restored;
 }
 job.remaining=repairTurns(repairRemainingArmor(job),job.armorPerTurn);
 if(job.remaining)return false;
 const fleet=game.military.fleets.find(f=>f.id===job.fleetId&&f.systemId===star.id);
 for(const ship of game.military.ships){if(ship.hp>0&&fleet?.shipIds.includes(ship.id))ship.shield=ship.assembly.shield}
 unlockRepairRoster(game,job);
 return true;
}
function settleShipyards(game){
 const messages=[];
 for(const star of game.stars){
  const controller=systemOwner(star);
  if(!controller)continue;
  for(const yard of orbitalShipyards(star)){
   if(yard.remaining){if(--yard.remaining===0&&star.owned)messages.push(star.name+' 궤도 조선소 완공');continue}
   const build=yard.productionQueue[0];
   const owner=build?.owner??'player';
   if(build&&owner===controller&&--build.remaining===0){
    yard.productionQueue.shift();const message=finishShipyardProduction(game,star,build);
    if(owner==='player')messages.push(message);
   }
   const repair=yard.repairQueue[0];
   if(star.owned&&repair&&advanceFleetRepair(game,star,repair)){
    yard.repairQueue.shift();
    messages.push(star.name+' · '+repair.name+' 함대 수리 완료');
   }
  }
 }
 return messages;
}

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
 if(!game.shipyardVersion){
  if(game.stars[0]?.owned&&!game.stars[0].shipyard)game.stars[0].shipyard={remaining:0,queue:[]};
  game.shipyardVersion=1;
 }
 if(game.shipyardVersion!==1)throw Error('지원하지 않는 조선소 저장 버전입니다.');
 const jobIds=new Set(),repairs=new Set();
 for(const star of game.stars){const y=star.shipyard;if(!y)continue;
  if(!Number.isInteger(y.remaining)||y.remaining<0||!Array.isArray(y.queue))throw Error('조선소 저장 오류');
  for(const j of y.queue){
   if(!['build','repair'].includes(j.kind)||!j.id||jobIds.has(j.id)||!Number.isInteger(j.remaining)||j.remaining<1||!Number.isInteger(j.total)||j.total<j.remaining||!j.paid||j.kind==='build'&&(!COMBAT_HULLS.has(j.hullId)||!j.assembly?.weapons?.length))throw Error('생산 대기열 저장 오류');
   jobIds.add(j.id);
   if(j.kind==='repair'){
    if(!Number.isFinite(j.amount)||j.amount<=0||repairs.has(j.shipId))throw Error('수리 대기열 저장 오류');
    repairs.add(j.shipId);const s=game.military.ships.find(s=>s.id===j.shipId);
    if(s&&(s.repairJobId!==j.id||s.owner!=='player'||s.systemId!==star.id))throw Error('수리 함선 저장 오류');
   }
  }
 }
 for(const s of game.military.ships)if(s.repairJobId&&!repairs.has(s.id))throw Error('누락된 수리 작업');
}
function canPayMilitaryCost(game,cost){
 return Object.entries(cost).every(([r,n])=>Number.isFinite(n)&&n>=0&&Number.isFinite(game.res[r])&&game.res[r]+1e-8>=n);
}
function payMilitaryCost(game,cost){
 if(!canPayMilitaryCost(game,cost))throw Error('필요 자원이 부족합니다.');
 for(const [r,n] of Object.entries(cost))game.res[r]=Math.round((game.res[r]-n)*10000)/10000;
}
function requireShipyard(game,id,ready=true){
 requireFleetOwnerTurn(game,'player');const star=game.stars[id];
 if(!star?.owned)throw Error('소유 성계에서만 이용할 수 있습니다.');
 if(ready&&(!star.shipyard||star.shipyard.remaining))throw Error('완공된 조선소가 필요합니다.');
 return star;
}
function buildShipyard(game,id){
 initializeShipyards(game);const star=requireShipyard(game,id,false);
 if(star.shipyard)throw Error('이미 조선소가 있거나 건설 중입니다.');
 payMilitaryCost(game,DATA.combat.shipyards.cost);star.shipyard={remaining:DATA.combat.shipyards.buildTurns,queue:[]};
}
function enqueueMilitaryBuild(game,id,designId,fleetId=null){
 const star=requireShipyard(game,id),d=game.shipDesigns.find(d=>d.id===designId);
 if(!d)throw Error('설계가 없습니다.');
 const errors=[...validateShipDesign(d),...designUnlockErrors(game,d)];if(errors.length)throw Error(errors.join(' '));
 if(fleetId){const f=ownedFleet(game,fleetId,'player');if(f.systemId!==id)throw Error('같은 성계의 함대만 지정할 수 있습니다.');}
 const assembly=assembleShipDesign(d),turns=COMBAT_HULLS.get(d.hullId).buildTurns;
 payMilitaryCost(game,assembly.buildCost);
 const j={id:newMilitaryId(game.military,'job_'),kind:'build',hullId:d.hullId,designId:d.id,name:d.name,assembly,remaining:turns,total:turns,fleetId,paid:true};star.shipyard.queue.push(j);return j;
}
function repairQuote(ship){
 const missing=Math.max(0,ship.assembly.armor-ship.hp),fraction=missing/ship.assembly.armor,r=DATA.combat.shipyards;
 return {missing,cost:{alloy:Math.max(r.minimumRepairCost,Math.ceil((ship.assembly.buildCost.alloy||0)*fraction*r.repairCostFraction))},turns:Math.max(r.minimumRepairTurns,Math.ceil(COMBAT_HULLS.get(ship.hullId).buildTurns*fraction))};
}
function enqueueMilitaryRepair(game,id,shipId){
 const star=requireShipyard(game,id),s=game.military.ships.find(s=>s.id===shipId);
 if(!s||s.owner!=='player'||s.systemId!==id||s.repairJobId)throw Error('해당 성계의 수리 대기 중이 아닌 소유 함선만 수리할 수 있습니다.');
 const q=repairQuote(s);if(!q.missing)throw Error('수리할 장갑 손상이 없습니다.');
 payMilitaryCost(game,q.cost);const j={id:newMilitaryId(game.military,'job_'),kind:'repair',shipId,amount:q.missing,cost:q.cost,remaining:q.turns,total:q.turns,paid:true};
 s.repairJobId=j.id;star.shipyard.queue.push(j);return j;
}
function settleShipyards(game){
 const messages=[];
 for(const star of game.stars){
  const y=star.shipyard;if(!y||!star.owned)continue;
  if(y.remaining){y.remaining--;if(!y.remaining)messages.push(star.name+' 조선소 완공');continue}
  const job=y.queue[0];if(!job)continue;
  if(--job.remaining>0)continue;
  if(job.kind==='build'){
   const s={id:newMilitaryId(game.military,'mil_'),name:job.name,designId:job.designId,hullId:job.hullId,systemId:star.id,owner:'player',assembly:JSON.parse(JSON.stringify(job.assembly)),hp:job.assembly.armor,shield:job.assembly.shield,ap:0};
   s.ap=militaryMaxAP(game,s);game.military.ships.push(s);
   const f=game.military.fleets.find(f=>f.id===job.fleetId&&f.owner==='player'&&f.systemId===star.id);
   if(f&&fleetPoints(game,f)+DATA.combat.fleets.classCosts[s.hullId]<=DATA.combat.fleets.maxCapacity)f.shipIds.push(s.id);
   messages.push(star.name+' · '+s.name+' 건조 완료'+(f?.shipIds.includes(s.id)?' · '+f.name:' · 예비 함선'));
  }else{
   const s=game.military.ships.find(s=>s.id===job.shipId);
   if(s){if(s.owner==='player'&&s.systemId===star.id)s.hp=Math.min(s.assembly.armor,s.hp+job.amount);delete s.repairJobId}
   messages.push(star.name+' · 장갑 수리 작업 종료');
  }
  y.queue.shift();
 }
 return messages;
}

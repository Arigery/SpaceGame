function retreatDistances(game,origin){
 const distances=new Map([[origin,0]]),queue=[origin];
 for(const id of queue)for(const next of game.stars[id].edges){
  if(distances.has(next))continue;
  distances.set(next,distances.get(id)+1);queue.push(next);
 }
 return distances;
}
function validateRetreatState(game){
 const m=game.military,transitIds=new Set();
 if(!Array.isArray(m.transits??[]))throw Error('이탈 함대 저장 오류');
 for(const t of m.transits||[]){
  if(!game.stars[t.origin]||!game.stars[t.destination]||!Number.isInteger(t.returnTurn)||!Array.isArray(t.shipIds)||!t.shipIds.length)throw Error('이탈 함대 저장 오류');
  const fleet=m.fleets.find(f=>f.id===t.fleetId);
  if(t.fleetId!==null&&(!fleet||fleet.status!=='missing'||fleet.owner!==t.owner||fleet.shipIds.length!==t.shipIds.length||fleet.shipIds.some(id=>!t.shipIds.includes(id))))throw Error('이탈 편성 저장 오류');
  for(const id of t.shipIds){
   const ship=m.ships.find(s=>s.id===id);
   if(!ship||ship.status!=='missing'||ship.owner!==t.owner||transitIds.has(id))throw Error('이탈 군함 저장 오류');
   transitIds.add(id);
  }
 }
 if(m.ships.some(s=>s.status==='missing'&&!transitIds.has(s.id)))throw Error('누락된 이탈 함선');
 const pending=m.battle;
 if(pending){
  if(!game.stars[pending.order?.to]||pending.order.turn!==game.turn||!Array.isArray(pending.groups)||!Array.isArray(pending.combat?.units)||!Number.isInteger(pending.combat.tick)||pending.combat.tick<0||pending.combat.winner)throw Error('진행 중인 교전 저장 오류');
  const ids=new Set(pending.combat.units.map(u=>u.id));
  const groupShipIds=pending.groups.flatMap(g=>g.shipIds);
  if(ids.size!==pending.combat.units.length||ids.size!==groupShipIds.length||new Set(groupShipIds).size!==ids.size||groupShipIds.some(id=>!ids.has(id)))throw Error('교전 편성 저장 오류');
  if(pending.decision&&!['initial','destination'].includes(pending.decision.kind))throw Error('교전 결정 저장 오류');
 }
 if(m.turnPlan&&(m.phase!=='ai'||!Array.isArray(m.turnPlan.orders)||!Array.isArray(m.turnPlan.results)||!Number.isInteger(m.turnPlan.cursor)||m.turnPlan.cursor<0||m.turnPlan.cursor>m.turnPlan.orders.length))throw Error('진행 중인 AI 턴 저장 오류');
}
function retreatWarpTurns(distance){
 return DATA.combat.retreat.missingTurns.find(band=>band.maxDistance===null||distance<=band.maxDistance).turns;
}
function eligibleReturnYard(game,id,owner){
 const star=game.stars[id];
 const owned=owner==='player'?star?.owned:star?.ownerId===owner;
 return owned&&star.shipyard?.remaining===0&&!militaryHostile(game,id,owner);
}
function isRetreatSystemSafe(game,id,owner){
 const star=game.stars[id];
 if(!star)return false;
 if(!game.military)return true;
 const controller=star.ownerId??(star.owned?'player':null);
 return !factionsHostile(game,controller,owner)&&!militaryHostile(game,id,owner);
}
function retreatDestinations(game,origin,owner,mode){
 if(mode==='short')return game.stars[origin].edges.filter(id=>militaryKnown(game,id,owner)&&isRetreatSystemSafe(game,id,owner))
  .sort((a,b)=>a-b).map(id=>({id,distance:1,turns:0}));
 if(mode!=='warp')return [];
 return [...retreatDistances(game,origin)].filter(([id])=>eligibleReturnYard(game,id,owner))
  .map(([id,distance])=>({id,distance,turns:retreatWarpTurns(distance)})).sort((a,b)=>a.distance-b.distance||a.id-b.id);
}
function beginRetreatDecision(game,groupId=null){
 const engagement=game.military.battle;
 if(!engagement||engagement.decision?.kind==='destination'||!engagement.groups.some(g=>g.owner==='player'&&g.status==='active'&&(groupId===null||g.id===groupId)))throw Error('후퇴할 함대가 없습니다.');
 engagement.decision={kind:'destination',groupId,wasInitial:engagement.decision?.kind==='initial'};
}
function cancelRetreatDecision(game){
 const battle=game.military.battle;
 if(battle?.decision?.kind==='destination')battle.decision=battle.decision.wasInitial?{kind:'initial'}:null;
}
function continueFleetBattle(game){
 const battle=game.military.battle;
 if(battle?.decision?.kind==='initial')battle.decision=null;
}
function scheduleRetreat(game,owner,groupId,mode,destination){
 const battle=game.military.battle;
 const groups=battle?.groups.filter(g=>g.owner===owner&&g.status==='active'&&(groupId===null||g.id===groupId));
 if(!groups?.length)throw Error('후퇴할 함대가 없습니다.');
 const option=retreatDestinations(game,battle.order.to,owner,mode).find(option=>option.id===destination);
 if(!option)throw Error('후퇴할 수 있는 목적지를 선택하세요.');
 const rules=DATA.combat.retreat;
 const ticks=Math.ceil((mode==='short'?rules.shortSeconds:rules.warpSeconds)/DATA.combat.rules.stepSeconds);
 for(const group of groups){
  group.status='retreating';
  group.retreat={mode,destination,turns:option.turns,readyTick:battle.combat.tick+ticks};
  for(const unit of battle.combat.units)if(group.shipIds.includes(unit.id)&&combatUnitPresent(unit)){
   unit.status='retreating';unit.revealed=true;
  }
 }
}
function confirmRetreatDecision(game,mode,destination){
 const battle=game.military.battle;
 if(battle?.decision?.kind!=='destination')throw Error('후퇴할 함대를 먼저 선택하세요.');
 scheduleRetreat(game,'player',battle.decision.groupId,mode,destination);
 battle.decision=null;
}
function aiFleetRetreats(game,battle){
 const settings=DATA.combat.retreat.ai;
 const interval=Math.ceil(settings.reviewSeconds/DATA.combat.rules.stepSeconds);
 if(battle.combat.tick%interval!==0)return;
 const units=battle.combat.units.filter(combatUnitPresent);
 for(const group of battle.groups){
  if(group.owner==='player'||group.status!=='active')continue;
  const members=units.filter(u=>group.shipIds.includes(u.id));
  if(!members.length)continue;
  const hostiles=units.filter(u=>combatHostile(battle.combat,members[0],u)&&u.status!=='retreating');
  if(!hostiles.length)continue;
  const support=units.filter(u=>!group.shipIds.includes(u.id)&&sameCombatFaction(members[0],u)&&u.status!=='retreating').length;
  const expectedDps=hostiles.reduce((total,u)=>total+u.assembly.weapons.reduce((sum,w)=>{
   const target=nearestCombatUnit(u,members);
   const approach=Math.max(0,combatDistance(u,target)-w.range)/Math.max(1,u.assembly.speed*DATA.combat.rules.speedUnitsPerSecond);
   return sum+w.damage/w.secondsPerShot*combatHitChance(target)*Math.max(0,1-approach/settings.projectSeconds);
  },0),0);
  const durability=members.reduce((total,u)=>total+u.hp+u.shield,0);
  const loss=expectedDps*settings.projectSeconds/(durability*(1+support*settings.supportWeight/members.length));
  if(loss<settings.lossThreshold)continue;
  const armorFraction=members.reduce((sum,u)=>sum+u.hp,0)/members.reduce((sum,u)=>sum+u.assembly.armor,0);
  const short=retreatDestinations(game,battle.order.to,group.owner,'short').sort((a,b)=>{
   const supportAt=id=>game.military.ships.filter(s=>s.owner===group.owner&&s.systemId===id).length;
   return supportAt(b.id)-supportAt(a.id)||a.id-b.id;
  })[0];
  const warp=retreatDestinations(game,battle.order.to,group.owner,'warp')[0];
  if(short&&(!warp||armorFraction>=settings.minimumShortArmorFraction))scheduleRetreat(game,group.owner,group.id,'short',short.id);
  else if(warp)scheduleRetreat(game,group.owner,group.id,'warp',warp.id);
 }
}
function advanceFleetBattle(game){
 const engagement=game.military.battle;
 if(!engagement||engagement.decision||pendingScoutDanger(game))return null;
 aiFleetRetreats(game,engagement);
 const {combat}=engagement;
 stepCombat(combat);
 const units=new Map(combat.units.map(u=>[u.id,u]));
 for(const u of combat.units)if(u.hp<=0)u.status='destroyed';
 for(const group of engagement.groups){
  if(!group.shipIds.some(id=>units.get(id).hp>0)){group.status='destroyed';continue;}
  if(group.status!=='retreating'||combat.tick<group.retreat.readyTick)continue;
  group.status=group.retreat.mode==='short'?'retreated':'missing';
  for(const id of group.shipIds){const u=units.get(id);if(u.hp>0)u.status=group.status}
  applyRetreatDeparture(game,engagement,group,units);
 }
 updateCombatWinner(combat);
 if(!combat.winner&&combat.tick>=DATA.combat.fleets.maxCombatSteps){
  combat.winner='stalemate';
  for(const group of engagement.groups)if(group.status==='retreating')group.status='active';
 }
 return combat.winner?finishFleetBattle(game):null;
}
function applyRetreatDeparture(game,engagement,group,units){
 const {military}=game,{destination,turns}=group.retreat;
 const survivors=group.shipIds.filter(id=>units.get(id).hp>0);
 const missing=group.status==='missing';
 const systemId=missing?null:destination;
 for(const id of survivors){
  const ship=military.ships.find(s=>s.id===id),unit=units.get(id);
  ship.hp=unit.hp;ship.shield=unit.shield;ship.systemId=systemId;
  if(missing)ship.status='missing';
  if(ship.repairJobId){
   const yard=game.stars[engagement.order.to].shipyard;
   if(yard)yard.queue=yard.queue.filter(job=>job.id!==ship.repairJobId);
   delete ship.repairJobId;
  }
 }
 const fleet=military.fleets.find(f=>f.id===group.fleetId);
 if(fleet){fleet.systemId=systemId;fleet.shipIds=survivors;if(missing)fleet.status='missing'}
 if(missing)(military.transits??=[]).push({owner:group.owner,fleetId:group.fleetId,shipIds:survivors,origin:engagement.order.to,destination,returnTurn:game.turn+turns});
 // Remove casualties in this group so the saved fleet location and roster stay consistent.
 military.ships=military.ships.filter(ship=>!group.shipIds.includes(ship.id)||survivors.includes(ship.id));
}
function finishFleetBattle(game){
 const m=game.military,engagement=m.battle,{combat,groups,order}=engagement;
 const ships=new Map(m.ships.map(s=>[s.id,s]));
 const outcomes=combat.units.map(u=>{
  const ship=ships.get(u.id);
  if(ship){ship.hp=u.hp;ship.shield=u.shield;ship.lastCombatTurn=game.turn}
  return {id:u.id,name:u.name,owner:u.faction,hp:u.hp,shield:u.shield,ap:ship?.ap??u.strategicAP,status:u.hp<=0?'destroyed':u.status==='retreating'?'active':u.status??'active'};
 });
 m.ships=m.ships.filter(s=>s.hp>0);
 const livingIds=new Set(m.ships.map(s=>s.id));
 for(const fleet of m.fleets)fleet.shipIds=fleet.shipIds.filter(id=>livingIds.has(id));
 const result={...order,combat:{winner:combat.winner,ticks:combat.tick,seconds:combat.tick*DATA.combat.rules.stepSeconds,participants:outcomes.map(o=>o.id),outcomes,
  retreats:groups.filter(g=>['retreated','missing'].includes(g.status)).map(g=>({name:g.name,owner:g.owner,status:g.status,destination:g.retreat.destination}))}};
 delete m.battle;m.lastOrder=result;
 if(m.turnPlan)m.turnPlan.results.push(result);
 validateFleetState(game);
 return result;
}
function returnWarpFleets(game){
 const messages=[],remaining=[];
 for(const transit of game.military.transits||[]){
  if(transit.returnTurn>game.turn){remaining.push(transit);continue}
  const destination=eligibleReturnYard(game,transit.destination,transit.owner)?transit.destination:
   retreatDestinations(game,transit.origin,transit.owner,'warp')[0]?.id;
  if(destination===undefined){remaining.push(transit);continue}
  const fleet=game.military.fleets.find(f=>f.id===transit.fleetId);
  for(const id of transit.shipIds){const ship=game.military.ships.find(s=>s.id===id);ship.systemId=destination;delete ship.status}
  if(fleet){fleet.systemId=destination;delete fleet.status}
  if(transit.owner==='player')messages.push((fleet?.name??'예비 함선')+' · '+game.stars[destination].name+' 조선소 복귀');
 }
 game.military.transits=remaining;
 return messages;
}

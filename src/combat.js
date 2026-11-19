// Shared serializable interfaces; no DOM, strategic state or economy mutations.
/** @typedef {{id:string,hullId:string,side:string,faction?:string,x:number,y:number,direction:number,flankSide:number,targetId?:string,targetSinceTick?:number,hp:number,shield:number,assembly:Object,weaponCooldowns:number[],revealed:boolean,strategicAP:number}} CombatUnit */
/** @typedef {{version:number,tick:number,seed:number,units:CombatUnit[],hostilities:string[][],events:Array,winner:string|null}} CombatState */
const COMBAT_HULLS=new Map(DATA.combat.hulls.map(h=>[h.id,h]));
function createCombatUnit(id,hullId,side,x,design=DATA.combat.defaultDesigns.find(d=>d.hullId===hullId)){
 const h=COMBAT_HULLS.get(hullId);
 if(!h||!id||!side||!Number.isFinite(x)||design?.hullId!==hullId)throw Error('Invalid combat unit');
 const assembly=assembleShipDesign(design);
 return {id,hullId,side,x,hp:assembly.armor,shield:assembly.shield,assembly,
 weaponCooldowns:assembly.weapons.map(()=>0),revealed:!h.abilities.stealth,strategicAP:h.strategicAP};
}
function createCombat(units,seed=1,hostilities=[],formation=false){
 if(!units.length||new Set(units.map(u=>u.id)).size!==units.length||new Set(units.map(u=>u.side)).size!==2)throw Error('Combat requires two sides and unique units');
 const battle={version:4,tick:0,seed:(seed>>>0)||1,units:JSON.parse(JSON.stringify(units)),hostilities:JSON.parse(JSON.stringify(hostilities)),events:[],winner:null};
 prepareCombatFormation(battle.units,formation);
 if(!battle.units.some(a=>battle.units.some(b=>combatHostile(battle,a,b))))battle.winner='peace';
 return battle;
}
function combatHostile(b,a,c){const x=a.faction||a.side,y=c.faction||c.side;return x!==y&&(b.hostilities||[]).some(p=>p.includes(x)&&p.includes(y))}
function combatUnitPresent(u){return u.hp>0&&u.status!=='retreated'&&u.status!=='missing'}
function combatHitChance(target){const r=DATA.combat.rules;return Math.max(r.minimumHitChance,Math.min(r.maximumHitChance,r.baseHitChance-target.assembly.evasion))}
function combatRandom(b){b.seed=(Math.imul(1664525,b.seed)+1013904223)>>>0;return b.seed/4294967296}
function combatDistance(a,b){return Math.hypot(a.x-b.x,(a.y??0)-(b.y??0))}
const sameCombatFaction=(a,b)=>(a.faction||a.side)===(b.faction||b.side);
const combatIdOrder=(a,b)=>a.id<b.id?-1:a.id>b.id?1:0;
function nearestCombatUnit(actor,units){
 return units.reduce((best,unit)=>{
  if(!best)return unit;
  const difference=combatDistance(actor,unit)-combatDistance(actor,best);
  return difference<0||difference===0&&combatIdOrder(unit,best)<0?unit:best;
 },undefined);
}
function prepareCombatFormation(units,deploy){
 const config=DATA.combat.tactics;
 for(const side of new Set(units.map(u=>u.side))){
  const group=units.filter(u=>u.side===side);
  const center=group.reduce((sum,u)=>sum+u.x,0)/group.length;
  const enemyCenter=units.filter(u=>u.side!==side);
  const direction=Math.sign(enemyCenter.reduce((sum,u)=>sum+u.x,0)/enemyCenter.length-center)||(side===units[0].side?1:-1);
  for(const line of Object.keys(config.formationDepth)){
   const row=group.filter(u=>COMBAT_HULLS.get(u.hullId).line===line).sort(combatIdOrder);
   for(const [i,u] of row.entries()){
    u.direction=direction;u.flankSide=i%2===0?1:-1;
    u.y??=0;
    if(deploy){u.x+=direction*config.formationDepth[line];u.y+=(i-(row.length-1)/2)*config.formationSpacing}
   }
  }
 }
}
function canDetectCombatTarget(actor,target){
 const radius=COMBAT_HULLS.get(actor.hullId).abilities.intercept?DATA.combat.tactics.escortDetectionRange:DATA.combat.rules.stealthDetectionRange;
 return target.revealed||combatDistance(actor,target)<=radius;
}
function combatScreenAnchor(actor,allies){
 return nearestCombatUnit(actor,allies.filter(u=>u.hullId==='battleship'))||nearestCombatUnit(actor,allies.filter(u=>u.hullId==='heavy_cruiser'));
}
function combatTargetScore(actor,target,allies,anchor){
 const {rules,tactics}=DATA.combat,w=tactics.weights;
 const priority=tactics.priorities[actor.hullId];
 const distance=combatDistance(actor,target);
 const weapons=actor.assembly.weapons;
 const rangeCoverage=weapons.filter(weapon=>distance<=weapon.range).length/weapons.length;
 let score=(priority.length-1-priority.indexOf(target.hullId))*w.priority;
 score+=rangeCoverage*w.inRange-Math.min(1,distance/tactics.distanceScale)*w.distance;
 const incoming=target.targetId===actor.id&&target.assembly.weapons.some(weapon=>distance<=weapon.range*tactics.threatRangeFactor);
 if(incoming)score+=w.immediateThreat;
 const targetHull=COMBAT_HULLS.get(target.hullId);
 if(actor.hullId!=='corvette'&&targetHull.abilities.drawFire&&distance<=rules.tauntRadius)score+=w.frontlineTank;
 if(actor.hullId==='corvette'&&targetHull.abilities.intercept&&incoming&&distance<=rules.interceptRadius)score+=w.escortPressure;
 if(actor.hullId==='escort'&&target.hullId==='corvette'&&anchor&&combatDistance(anchor,target)<=rules.interceptRadius)score+=w.screenThreat;
 if(actor.hullId==='destroyer'&&target.hullId==='corvette'&&allies.some(u=>u.id===target.targetId&&combatDistance(u,target)<=rules.interceptRadius))score+=w.flankAssist;
 return score;
}
function combatTarget(b,actor,allies=b.units.filter(u=>u!==actor&&combatUnitPresent(u)&&sameCombatFaction(actor,u))){
 const config=DATA.combat.tactics;
 const anchor=actor.hullId==='escort'?combatScreenAnchor(actor,allies):undefined;
 let best,current;
 for(const unit of b.units){
  if(!combatUnitPresent(unit)||!combatHostile(b,actor,unit)||!canDetectCombatTarget(actor,unit))continue;
  const candidate={unit,score:combatTargetScore(actor,unit,allies,anchor)};
  if(unit.id===actor.targetId)current=candidate;
  if(!best||candidate.score>best.score||candidate.score===best.score&&combatIdOrder(unit,best.unit)<0)best=candidate;
 }
 const heldSeconds=(b.tick-(actor.targetSinceTick??b.tick))*DATA.combat.rules.stepSeconds;
 if(current&&(heldSeconds<config.targetHoldSeconds||best.score-current.score<=config.switchMargin))return current.unit;
 return best?.unit;
}
function combatPointToward(from,to,distance){
 const span=combatDistance(from,to);
 if(span<=1e-9)return {x:from.x,y:from.y??0};
 const fraction=Math.min(1,distance/span);
 return {x:from.x+(to.x-from.x)*fraction,y:(from.y??0)+((to.y??0)-(from.y??0))*fraction};
}
function combatDestination(actor,target,contact,allies,enemies){
 const {rules,tactics}=DATA.combat,direction=actor.direction;
 const weaponRange=Math.min(...actor.assembly.weapons.map(w=>w.range));
 if(actor.hullId==='escort'){
  const anchor=combatScreenAnchor(actor,allies);
  if(anchor){
   const approaching=target?.hullId==='corvette'&&combatDistance(anchor,target)<=rules.interceptRadius;
   if(approaching)return combatPointToward(anchor,target,tactics.screenOffset);
   return {x:anchor.x+direction*tactics.screenOffset,y:anchor.y};
  }
 }
 if(!contact)return actor;
 if(actor.hullId==='corvette'&&target&&combatDistance(actor,target)>weaponRange){
  const blockers=enemies.filter(u=>sameCombatFaction(u,target)&&COMBAT_HULLS.get(u.hullId).line==='front'&&(target.x-u.x)*direction>tactics.flankClearance);
  if(blockers.length){
   const pastFront=Math.max(...blockers.map(u=>u.x*direction))+tactics.flankClearance;
   const wing=actor.flankSide*tactics.flankOffset+(target.y??0);
   if(actor.x*direction<pastFront){
    if(Math.abs(actor.y-wing)>tactics.flankClearance)return {x:actor.x,y:wing};
    return {x:pastFront*direction,y:wing};
   }
  }
 }
 const range=target?weaponRange*tactics.preferredRange[actor.hullId]:Math.min(weaponRange,rules.stealthDetectionRange);
 const destination=combatPointToward(actor,contact,Math.max(0,combatDistance(actor,contact)-range));
 if(actor.hullId==='battleship'){
  const front=allies.filter(u=>u.hullId==='heavy_cruiser');
  if(front.length){
   const limit=Math.max(...front.map(u=>u.x*direction))-tactics.rearSpacing;
   destination.x=Math.min(destination.x*direction,limit)*direction;
  }
 }
 return destination;
}
// Shield overflow converts back to raw damage before the armor multiplier.
function applyCombatDamage(unit,raw,type){
 const m=DATA.combat.damageModifiers[type];
 if(!m||!Number.isFinite(raw)||raw<0)throw Error('Invalid weapon damage');
 const shieldDamage=Math.min(unit.shield,raw*m.shield);
 unit.shield=Math.max(0,unit.shield-shieldDamage);
 const armorDamage=Math.min(unit.hp,Math.max(0,raw-shieldDamage/m.shield)*m.armor);
 unit.hp=Math.max(0,unit.hp-armorDamage);
 return {shieldDamage,armorDamage};
}
// Fixed seconds-based step: simultaneous movement and eligibility, ordered damage resolution.
function stepCombat(b){
 if(b.winner)return b;
 const r=DATA.combat.rules,dt=r.stepSeconds,present=b.units.filter(combatUnitPresent);
 const orders=present.filter(u=>u.status!=='retreating').map(u=>{
  const allies=present.filter(v=>v!==u&&v.status!=='retreating'&&sameCombatFaction(u,v)),enemies=present.filter(v=>combatHostile(b,u,v));
  const target=combatTarget(b,u,allies);
  const contact=target||nearestCombatUnit(u,enemies);
  const destination=combatDestination(u,target,contact,allies,enemies);
  return {u,target,position:combatPointToward(u,destination,u.assembly.speed*r.speedUnitsPerSecond*dt)};
 });
 b.events=[];b.tick++;
 for(const {u,target,position} of orders){
  u.weaponCooldowns=u.weaponCooldowns.map(c=>b.tick===1?c:Math.max(-dt,c-dt));
  const targetId=target?.id??null;
  if(u.targetId!==targetId){u.targetId=targetId;u.targetSinceTick=b.tick-1}
  u.x=position.x;u.y=position.y;
 }
 const shots=[];
 for(const {u,target} of orders){
  if(!target)continue;
  for(const [i,w] of u.assembly.weapons.entries()){
   if(combatDistance(u,target)>w.range)continue;
   while(u.weaponCooldowns[i]<=1e-9){
    u.revealed=true;u.weaponCooldowns[i]+=w.secondsPerShot;
    const chance=combatHitChance(target);
    const hit=combatRandom(b)<chance;
    const raw=hit?w.damage*(u.hullId==='destroyer'&&COMBAT_HULLS.get(target.hullId).light?r.lightDamageMultiplier:1):0;
    shots.push({u,target,hit,raw,type:w.damageType,weaponIndex:i});
   }
  }
 }
 for(const {u,target,hit,raw,type,weaponIndex} of shots){
  const result=applyCombatDamage(target,raw,type);
  b.events.push({type:'shot',attackerId:u.id,targetId:target.id,weaponIndex,damageType:type,hit,damage:raw,...result});
 }
 updateCombatWinner(b);
 return b;
}
function updateCombatWinner(b){
 const present=b.units.filter(combatUnitPresent);
 if(present.some(u=>u.status==='retreating'||present.some(v=>combatHostile(b,u,v))))return;
 const sides=new Set(present.map(u=>u.side));
 b.winner=sides.size===1?[...sides][0]:sides.size?'peace':'draw';
}

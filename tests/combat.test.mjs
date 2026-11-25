import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {validateCombat} from '../tools/validate-combat.mjs';
const combat=JSON.parse(fs.readFileSync(new URL('../data/combat.json',import.meta.url)));
const ctx=vm.createContext({DATA:{combat}});
vm.runInContext(fs.readFileSync(new URL('../src/ship-designs.js',import.meta.url),'utf8'),ctx);
vm.runInContext(fs.readFileSync(new URL('../src/combat.js',import.meta.url),'utf8'),ctx);
vm.runInContext(fs.readFileSync(new URL('../src/shipyards.js',import.meta.url),'utf8'),ctx);
vm.runInContext("function createTestCombat(units,seed=1){return createCombat(units,seed,[[...new Set(units.map(u=>u.side))]])}",ctx);
const run=code=>vm.runInContext(code,ctx);
test('five ordered hulls, shared AP, valid stats and invalid data rejection',()=>{
 validateCombat(combat);
 const bad=structuredClone(combat);bad.hulls[0].strategicAP=3;
 assert.throws(()=>validateCombat(bad));
 bad.hulls[0].strategicAP=2;bad.rules.interceptRadius=NaN;
 assert.throws(()=>validateCombat(bad));
});
test('stealth bypasses tank to hunt artillery, screens intercept',()=>{
 assert.equal(run(`(()=>{const c=createCombatUnit('c','corvette','a',0),t=createCombatUnit('t','heavy_cruiser','b',4),s=createCombatUnit('s','battleship','b',12);const b=createTestCombat([c,t,s]);return combatTarget(b,c).id})()`),'s');
 assert.equal(run(`(()=>{const c=createCombatUnit('c','corvette','a',0),e=createCombatUnit('e','escort','b',4),s=createCombatUnit('s','battleship','b',12);e.targetId=c.id;return combatTarget(createTestCombat([c,e,s]),c).id})()`),'e');
 assert.equal(run(`(()=>{const c=createCombatUnit('c','corvette','a',0),s=createCombatUnit('s','battleship','b',500);return combatTarget(createTestCombat([c,s]),s)===undefined})()`),true);
});
test('tank draws fire away from closer light ship',()=>{
 assert.equal(run(`(()=>{const d=createCombatUnit('d','destroyer','a',0),e=createCombatUnit('e','escort','b',1),t=createCombatUnit('t','heavy_cruiser','b',5);return combatTarget(createTestCombat([d,e,t]),d).id})()`),'t');
});
test('destroyer rapid fire damages light ships; cooldown and stealth reveal apply',()=>{
 assert.equal(run(`(()=>{const b=createTestCombat([createCombatUnit('d','destroyer','a',0),createCombatUnit('c','corvette','b',1)],1);stepCombat(b);return b.events.find(e=>e.attackerId==='d').damage})()`),4.5);
 assert.equal(run(`(()=>{const b=createTestCombat([createCombatUnit('c','corvette','a',0),createCombatUnit('s','battleship','b',1),createCombatUnit('t','heavy_cruiser','a',2)],1);stepCombat(b);const revealed=b.units[0].revealed;stepCombat(b);return revealed&&!b.events.some(e=>e.attackerId==='s')})()`),true);
});
test('evasion changes actual hit outcome',()=>{
 assert.equal(run(`(()=>{const battle=h=>createTestCombat([createCombatUnit('s','battleship','a',0),createCombatUnit('t',h,'b',500)],1000);const a=battle('escort'),b=battle('heavy_cruiser');stepCombat(a);stepCombat(b);return !a.events[0].hit&&b.events[0].hit})()`),true);
});
test('combat completes and JSON roundtrip preserves deterministic outcome',()=>{
 assert.equal(run(`(()=>{let a=createTestCombat([createCombatUnit('c','corvette','a',0),createCombatUnit('s','battleship','b',20)],42);for(let i=0;i<3;i++)stepCombat(a);const b=JSON.parse(JSON.stringify(a));for(let i=0;i<10000&&!a.winner;i++){stepCombat(a);stepCombat(b)}return !!a.winner&&JSON.stringify(a)===JSON.stringify(b)})()`),true);
});
test('all reference designs match assembled benchmarks without double counting',()=>{
 for(const h of combat.hulls){
  ctx.design=combat.defaultDesigns.find(d=>d.hullId===h.id);
  const a=run('assembleShipDesign(design)');
  for(const key of ['armor','shield','speed','evasion'])assert.ok(Math.abs(a[key]-h.benchmark[key])<1e-8);
  assert.ok(Math.abs(a.weapons.reduce((sum,w)=>sum+w.damage,0)-h.benchmark.damage)<1e-8);
  assert.ok(a.weapons.every(w=>w.range===h.benchmark.range&&w.secondsPerShot===h.benchmark.secondsPerShot));
  assert.equal(a.strategicAP,2);
 }
});
test('power excess, wrong module and missing engine rejected, optional slots supported',()=>{
 const d=structuredClone(combat.defaultDesigns[0]);
 d.slots.weapon.fill('corvette_energy');d.slots.defense.fill('corvette_shield');ctx.design=d;
 assert.match(run('validateShipDesign(design).join()'),/전력 초과/);
 assert.throws(()=>run('assembleShipDesign(design)'));
 d.slots.defense=[null,'corvette_armor'];ctx.design=d;assert.equal(run('validateShipDesign(design).length'),0);
 d.slots.engine=[null];ctx.design=d;assert.ok(run('validateShipDesign(design).length')>0);
 d.slots.engine=['escort_engine'];ctx.design=d;assert.ok(run('validateShipDesign(design).length')>0);
});
test('module edits alter stats, power and exact build/upkeep totals',()=>{
 const d=structuredClone(combat.defaultDesigns[0]);ctx.design=d;
 const before=run('assembleShipDesign(design)');
 const modules=Object.values(d.slots).flat().map(id=>combat.modules.find(m=>m.id===id));
 assert.equal(before.buildCost.alloy,combat.hulls[0].buildCost.alloy+modules.reduce((n,m)=>n+(m.buildCost.alloy||0),0));
 assert.ok(Math.abs(before.upkeep.energy-combat.hulls[0].upkeep.energy-modules.reduce((n,m)=>n+m.upkeep.energy,0))<1e-8);
 d.slots.engine=['corvette_agile'];d.slots.defense[1]=null;ctx.design=d;
 const after=run('assembleShipDesign(design)');
 assert.ok(after.speed>before.speed&&after.evasion>before.evasion);
 assert.equal(after.powerDraw,before.powerDraw+1);assert.equal(after.armor,17.5);
});
test('shield and armor modifiers including overflow are applied once',()=>{
 ctx.target={hp:100,shield:13};
 run("applyCombatDamage(target,20,'energy')");
 assert.equal(ctx.target.shield,0);assert.equal(ctx.target.hp,92);
 ctx.target={hp:100,shield:8};run("applyCombatDamage(target,20,'kinetic')");
 assert.equal(ctx.target.shield,0);assert.equal(ctx.target.hp,87);
});
test('fractional-second weapon cadence survives fixed-step simulation',()=>{
 assert.equal(run(`(()=>{const b=createTestCombat([createCombatUnit('c','corvette','a',0),createCombatUnit('t','heavy_cruiser','b',100)],1);b.units[1].hp=100000;b.units[1].weaponCooldowns=b.units[1].weaponCooldowns.map(()=>1000);const ticks=[];for(let i=0;i<32;i++){stepCombat(b);if(b.events.some(e=>e.attackerId==='c'&&e.weaponIndex===0))ticks.push(b.tick)}return ticks.join(',')})()`),'1,7,13,19,25,31');
});
test('design saves roundtrip without mutating economy or existing combat snapshots',()=>{
 assert.equal(run(`(()=>{const g={res:{alloy:100},ships:{explorer:0}};initializeShipDesigns(g);const d=JSON.parse(JSON.stringify(g.shipDesigns[0]));d.id='custom_1';d.name='기동형';const unit=createCombatUnit('c','corvette','a',0,d);d.slots.engine=['corvette_agile'];saveShipDesign(g,d);const loaded=JSON.parse(JSON.stringify(g));initializeShipDesigns(loaded);return loaded.shipDesigns.length===6&&loaded.shipDesigns[5].slots.engine[0]==='corvette_agile'&&loaded.res.alloy===100&&loaded.ships.explorer===0&&unit.assembly.speed===1.5})()`),true);
});
test('seeded reference matchups terminate and obey damage invariants',()=>{
 const result=run(`(()=>{const results=[];for(let i=0;i<DATA.combat.hulls.length;i++)for(let j=i+1;j<DATA.combat.hulls.length;j++){let wins=0,seconds=0;for(let seed=1;seed<=10;seed++){const b=createTestCombat([createCombatUnit('a',DATA.combat.hulls[i].id,'a',0),createCombatUnit('b',DATA.combat.hulls[j].id,'b',DATA.combat.rules.initialSeparation)],seed);while(!b.winner&&b.tick<20000)stepCombat(b);if(!b.winner||b.units.some(u=>!Number.isFinite(u.hp)||u.hp<0||u.shield<0))throw Error('Invalid simulation');wins+=b.winner==='a';seconds+=b.tick*DATA.combat.rules.stepSeconds;}results.push({pair:DATA.combat.hulls[i].id+'/'+DATA.combat.hulls[j].id,wins,meanSeconds:seconds/10})}return results})()`);
 assert.equal(result.length,10);
 console.log('TEST matchups (10 seeds each):',JSON.stringify(result));
});
test('equal-capacity corvettes can counter an unescorted battleship',()=>{
 const result=run(`(()=>{let wins=0;for(let seed=1;seed<=30;seed++){const b=createTestCombat([...Array.from({length:10},(_,i)=>createCombatUnit('c'+i,'corvette','a',0)),createCombatUnit('b','battleship','b',900)],seed);while(!b.winner&&b.tick<20000)stepCombat(b);wins+=b.winner==='a'}return wins})()`);
 assert.ok(result>=24);
});
test('designer UI handlers save edited designs and block invalid power without a browser',()=>{
 const nodes=new Map();
 const node=id=>{if(!nodes.has(id))nodes.set(id,{});return nodes.get(id)};
 ctx.DATA.resources={alloy:'신소재',energy:'에너지',mineral:'광물'};ctx.$=node;ctx.safeText=s=>String(s).replaceAll('"','&quot;');ctx.state={res:{alloy:100},ships:{explorer:0}};
 ctx.openDialog=(title,desc,body)=>{ctx.lastDesignHTML=body};ctx.dirty=false;
 let fields=[];node('modalBody').querySelectorAll=()=>fields;
 for(const f of ['resource-ui','fleet-workspace','ship-designer-ui'])vm.runInContext(fs.readFileSync(new URL(`../src/${f}.js`,import.meta.url),'utf8'),ctx);
 run('showShipDesigner()');assert.match(ctx.lastDesignHTML,/전력/);
 assert.match(ctx.lastDesignHTML,/<dt>건조비<\/dt><dd>.*icons\/alloy\.svg/);
 assert.match(ctx.lastDesignHTML,/<dt>유지비\/턴<\/dt><dd>.*icons\/energy\.svg/);
 assert.match(ctx.lastDesignHTML,/<progress aria-label="설계 전력 사용량" value="11" max="13"/);
 assert.match(ctx.lastDesignHTML,/fleet-dialog-shell/);
 assert.match(ctx.lastDesignHTML,/data-campaign-fleet-tab="designs" aria-pressed="true"/);
 node('designName').oninput({target:{value:'기동 시험'}});node('designSave').onclick();
 assert.equal(ctx.state.shipDesigns[0].name,'기동 시험');assert.equal(ctx.dirty,true);
 node('designCopy').onclick();node('designSave').onclick();assert.equal(ctx.state.shipDesigns.length,6);
 fields=[{dataset:{kind:'weapon',slot:'1'},value:'corvette_energy'},{dataset:{kind:'defense',slot:'1'},value:'corvette_shield'}];
 run('showShipDesigner()');fields[0].onchange();fields[1].onchange();
 assert.match(ctx.lastDesignHTML,/전력 초과/);assert.match(ctx.lastDesignHTML,/design-power over-budget/);assert.match(ctx.lastDesignHTML,/id="designSave" disabled/);
 node('designSave').onclick();assert.equal(ctx.state.shipDesigns[0].slots.defense[1],'corvette_armor');
 assert.equal(ctx.state.res.alloy,100);
});
test('fixed hit formula and explicit hostility prevent neutral fire',()=>{
 assert.equal(run(`(()=>{const u=createCombatUnit('n','corvette','b',1);return combatHitChance(u)})()`),.5);
 assert.equal(run(`(()=>{const u=createCombatUnit('n','corvette','b',1);u.assembly.evasion=1;return combatHitChance(u)})()`),.15);
 assert.equal(run(`(()=>{const u=createCombatUnit('n','corvette','b',1);u.assembly.evasion=-1;return combatHitChance(u)})()`),.95);
 assert.equal(run(`(()=>{const b=createCombat([createCombatUnit('a','corvette','a',0),createCombatUnit('b','battleship','b',1)],1);stepCombat(b);return b.winner==='peace'&&b.events.length===0})()`),true);
});
test('mutually cloaked forces close distance and eventually resolve',()=>{
 assert.equal(run(`(()=>{const b=createTestCombat([createCombatUnit('a','corvette','a',0),createCombatUnit('b','corvette','b',900)],42);while(!b.winner&&b.tick<2000)stepCombat(b);return !!b.winner})()`),true);
});
test('1.2 second cadence carries fractional remainder across quarter-second ticks',()=>{
 const shots=run(`(()=>{const b=createTestCombat([createCombatUnit('d','destroyer','a',0),createCombatUnit('t','heavy_cruiser','b',1)],2);b.units[1].hp=100000;b.units[1].weaponCooldowns.fill(1000);let n=0;for(let i=0;i<49;i++){stepCombat(b);n+=b.events.filter(e=>e.attackerId==='d'&&e.weaponIndex===0).length}return n})()`);
 assert.equal(shots,11);
});
test('third faction cannot be targeted without an explicit hostile pair',()=>{
 assert.equal(run(`(()=>{const a=createCombatUnit('a','battleship','a',0),e=createCombatUnit('e','heavy_cruiser','b',100),n=createCombatUnit('n','corvette','b',1);a.faction='player';e.faction='enemy';n.faction='neutral';const b=createCombat([a,e,n],1,[['player','enemy']]);stepCombat(b);return b.events.every(shot=>shot.attackerId!=='n'&&shot.targetId!=='n')&&b.units[2].hp===n.hp&&b.units[2].shield===n.shield})()`),true);
});
test('all five classes follow their full priority order at equal distance and threat',()=>{
 const priorities={
  corvette:['battleship','heavy_cruiser','destroyer','escort','corvette'],
  escort:['corvette','escort','destroyer','heavy_cruiser','battleship'],
  destroyer:['destroyer','heavy_cruiser','corvette','escort','battleship'],
  heavy_cruiser:['heavy_cruiser','destroyer','escort','corvette','battleship'],
  battleship:['heavy_cruiser','battleship','destroyer','escort','corvette']
 };
 for(const [hull,order] of Object.entries(priorities)){
  ctx.hull=hull;
  const observed=run(`(()=>{
   const actor=createCombatUnit('a',hull,'a',0);
   const enemies=DATA.combat.hulls.map(h=>({...createCombatUnit(h.id,h.id,'b',100),revealed:true}));
   const b=createTestCombat([actor,...enemies]);
   const result=[];
   for(let i=0;i<enemies.length;i++){const target=combatTarget(b,b.units[0]);result.push(target.hullId);target.hp=0}
   return result.join(',');
  })()`);
  assert.equal(observed,order.join(','),hull);
 }
 const bad=structuredClone(combat);bad.tactics.priorities.escort[1]='corvette';
 assert.throws(()=>validateCombat(bad),/tactical priorities/);
});
test('range, incoming attacks and destroyer flank assistance can outweigh priority',()=>{
 assert.equal(run(`(()=>{
  const d=createCombatUnit('d','destroyer','a',0),ally=createCombatUnit('s','battleship','a',50);
  const rival=createCombatUnit('r','destroyer','b',100),flanker=createCombatUnit('c','corvette','b',100);
  const b=createTestCombat([d,ally,rival,flanker]);const [actor,friend,preferred,corvette]=b.units;
  const picks=()=>combatTarget(b,actor).id;
  const baseline=picks();corvette.targetId=friend.id;const assist=picks();
  corvette.targetId=null;preferred.x=300;const beforeThreat=picks();
  corvette.targetId=actor.id;const threat=picks();
  corvette.targetId=null;preferred.x=800;
  return [baseline,assist,beforeThreat,threat,picks()].join(',');
 })()`),'r,c,r,c,c');
});
test('target remains during hold and small score changes, but invalid target is replaced immediately',()=>{
 assert.equal(run(`(()=>{
  const b=createTestCombat([createCombatUnit('a','battleship','a',0),createCombatUnit('z','battleship','b',100),createCombatUnit('m','heavy_cruiser','b',500)]);
  const [actor,current,alternative]=b.units;actor.targetId=current.id;actor.targetSinceTick=0;
  const picks=()=>combatTarget(b,actor).id;
  const held=picks();b.tick=20;const narrow=picks();
  alternative.x=120;const stronger=picks();
  b.tick=0;current.hp=0;return [held,narrow,stronger,picks()].join(',');
 })()`),'z,z,m,m');
});
test('corvette actually moves around the enemy frontline before approaching the rear',()=>{
 assert.equal(run(`(()=>{
  const c=createCombatUnit('c','corvette','a',0),tank=createCombatUnit('h','heavy_cruiser','b',370),bb=createCombatUnit('b','battleship','b',580);
  const battle=createTestCombat([c,tank,bb]);const [flanker,front,rear]=battle.units;
  for(const unit of [front,rear]){unit.assembly.speed=0;unit.weaponCooldowns.fill(1000)}
  stepCombat(battle);const lateral=flanker.y!==0&&flanker.x===0&&flanker.targetId===rear.id;
  let reachedRear=false;
  for(let i=0;i<60;i++){stepCombat(battle);if(battle.events.some(e=>e.attackerId===flanker.id&&e.targetId===rear.id&&flanker.x>front.x)){reachedRear=true;break}}
  return lateral&&reachedRear;
 })()`),true);
});
test('escort takes an intercept position and fires, battleship stays behind a live cruiser',()=>{
 assert.equal(run(`(()=>{
  const e=createCombatUnit('e','escort','a',105),bb=createCombatUnit('b','battleship','a',0),hc=createCombatUnit('h','heavy_cruiser','a',105),c=createCombatUnit('c','corvette','b',40);
  c.y=190;
  const battle=createTestCombat([e,bb,hc,c]);const [escort,capital,front,flanker]=battle.units;
  for(const unit of [capital,front,flanker]){unit.assembly.speed=0;unit.weaponCooldowns.fill(1000)}
  stepCombat(battle);const intercepted=escort.y>0&&escort.targetId===flanker.id;
  let fired=false;for(let i=0;i<15;i++){stepCombat(battle);fired ||= battle.events.some(ev=>ev.attackerId===escort.id&&ev.targetId===flanker.id)}
  const reserve=createCombat([createCombatUnit('r','battleship','a',0),createCombatUnit('f','heavy_cruiser','a',0),createCombatUnit('t','heavy_cruiser','b',900)],1,[['a','b']],true);
  const [artillery,screen]=reserve.units;
  for(let i=0;i<12;i++)stepCombat(reserve);
  return intercepted&&fired&&artillery.x<screen.x;
 })()`),true);
});

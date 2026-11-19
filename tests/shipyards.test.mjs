import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
function setup(){
 const DATA=Object.fromEntries(['combat','balance','research','resources'].map(n=>[n,JSON.parse(fs.readFileSync(new URL('../data/'+n+'.json',import.meta.url)))]));
 const c=vm.createContext({DATA});
 for(const f of ['ship-designs','combat','fleets','retreat','scout-danger','shipyards','research'])vm.runInContext(fs.readFileSync(new URL('../src/'+f+'.js',import.meta.url),'utf8'),c);
 vm.runInContext(`var state={turn:1,seed:42,stars:[{id:0,owned:true,name:'테라',edges:[1],planets:[]},{id:1,owned:true,name:'개척지',edges:[0],planets:[]}],ships:{explorer:0},res:{energy:100,mineral:100,alloy:100,research:0},records:[]};var tutorial=false,dirty=false;initializeShipDesigns(state);initializeResearch(state);initializeShipyards(state);var g=state;`,c);
 return {c,run:s=>vm.runInContext(s,c)};
}
test('home yard ready; additional yard costs once and completes after three turns',()=>{
 const {run}=setup();assert.equal(run('g.stars[0].shipyard.remaining'),0);
 run('buildShipyard(g,1)');assert.equal(run('g.res.mineral'),20);
 assert.throws(()=>run('buildShipyard(g,1)'),/이미/);
 run('settleShipyards(g);settleShipyards(g)');assert.equal(run('g.stars[1].shipyard.remaining'),1);
 run('settleShipyards(g);initializeShipyards(g)');assert.equal(run('g.stars[1].shipyard.remaining'),0);assert.equal(run('g.res.mineral'),20);
});
test('queue pays once, finishes serially, snapshots designs and survives load',()=>{
 const {run}=setup();run("enqueueMilitaryBuild(g,0,'default_corvette');enqueueMilitaryBuild(g,0,'default_corvette')");
 assert.equal(run('g.res.alloy'),76);
 run("g.shipDesigns[0].slots.defense[1]=null;g=JSON.parse(JSON.stringify(g));initializeShipyards(g);settleShipyards(g)");
 assert.equal(run('g.military.ships.length'),1);assert.equal(run('g.military.ships[0].hp'),35);
 assert.equal(run('g.stars[0].shipyard.queue.length'),1);
 run('settleShipyards(g);settleShipyards(g)');assert.equal(run('g.military.ships.length'),2);assert.equal(run('g.res.alloy'),76);
});
test('no money or locked research does not charge or queue',()=>{
 const {run}=setup();
 assert.throws(()=>run("enqueueMilitaryBuild(g,0,'default_escort')"),/연구/);
 run('g.res.alloy=11');assert.throws(()=>run("enqueueMilitaryBuild(g,0,'default_corvette')"),/부족/);
 assert.equal(run('g.res.alloy'),11);assert.equal(run('g.stars[0].shipyard.queue.length'),0);
});
test('hull prerequisite chain and actual research completion unlock production',()=>{
 const {run}=setup();assert.equal(run("researchAvailable('mil_hull_destroyer')"),false);
 assert.equal(run("startResearch('mil_hull_destroyer')"),false);
 run("startResearch('mil_hull_escort');state.res.research=29;settleResearch()");
 assert.equal(run("militaryHullUnlocked(g,'escort')"),false);
 run('state.res.research=1;settleResearch()');assert.equal(run("militaryHullUnlocked(g,'escort')"),true);
 assert.equal(run("researchAvailable('mil_hull_destroyer')"),true);
 run("enqueueMilitaryBuild(g,0,'default_escort');settleShipyards(g)");assert.equal(run('g.military.ships.length'),0);
 run('settleShipyards(g)');assert.equal(run('g.military.ships[0].hullId'),'escort');
 run('g=JSON.parse(JSON.stringify(g));initializeResearch(g)');assert.equal(run("militaryHullUnlocked(g,'escort')"),true);
});
test('weapon tiers require their own research and power budget remains enforced',()=>{
 const {run}=setup();run("var d=g.shipDesigns[0];d.slots.weapon[0]='corvette_energy_t2'");
 assert.throws(()=>run("enqueueMilitaryBuild(g,0,d.id)"),/연구/);
 run("g.research.completed.push('mil_hull_escort','mil_energy_t2')");
 assert.equal(run('designUnlockErrors(g,d).length'),0);assert.equal(run("militaryModuleUnlocked(g,'corvette_kinetic_t2')"),false);
 run('enqueueMilitaryBuild(g,0,d.id)');assert.ok(run('g.stars[0].shipyard.queue[0].assembly.weapons[0].damage')>2);
 assert.equal(run("researchAvailable('mil_energy_t3')"),true);
 run("g.research.completed.push('mil_energy_t3');d.slots.weapon.fill('corvette_energy_t3')");
 assert.throws(()=>run('enqueueMilitaryBuild(g,0,d.id)'),/전력/);
});
test('fleet assignment on completion falls back to reserve when fleet moved',()=>{
 const {run}=setup();run("var f=createFleet(g,'첫 함대',0);enqueueMilitaryBuild(g,0,'default_corvette',f.id);settleShipyards(g)");
 assert.equal(run('f.shipIds.length'),1);
 run("enqueueMilitaryBuild(g,0,'default_corvette',f.id);f.systemId=1;g.military.ships[0].systemId=1;settleShipyards(g)");
 assert.equal(run('f.shipIds.length'),1);assert.equal(run('g.military.ships[1].systemId'),0);
});
test('armor repair pays, locks movement, preserves shield and restores only purchased damage',()=>{
 const {run}=setup();run("var f=createFleet(g,'수리 함대',0);enqueueMilitaryBuild(g,0,'default_corvette',f.id);settleShipyards(g);var s=g.military.ships[0];s.hp=15;s.shield=7;var quote=repairQuote(s);var stock=g.res.alloy;enqueueMilitaryRepair(g,0,s.id)");
 assert.equal(run('g.res.alloy===stock-quote.cost.alloy'),true);
 assert.throws(()=>run('planFleetOrder(g,[f.id],1)'),/수리/);
 assert.throws(()=>run('enqueueMilitaryRepair(g,0,s.id)'),/수리/);
 run('s.hp=10;settleShipyards(g)');assert.equal(run('s.hp'),30);assert.equal(run('s.shield'),7);assert.equal(run('!!s.repairJobId'),false);
});
test('actual economy charges reserves and repair ships, not unfinished ships',()=>{
 const {c,run}=setup();vm.runInContext(fs.readFileSync(new URL('../src/simulation.js',import.meta.url),'utf8'),c);
 run("var HAB_RESOURCES=Object.keys(DATA.resources);enqueueMilitaryBuild(g,0,'default_corvette')");
 assert.equal(run('resourceDetails().energy.consumption.ship'),0);
 run('settleShipyards(g)');assert.equal(run('incomes().energy'),-.5);assert.equal(run('incomes().alloy'),-.1);
 run('g.military.ships[0].hp=10;enqueueMilitaryRepair(g,0,g.military.ships[0].id)');assert.equal(run('incomes().energy'),-.5);
});
test('180-turn queue/income scenario preserves resource and completion invariants',()=>{
 const {run}=setup();
 run(`g.res.alloy=100;var built=0;for(let turn=0;turn<180;turn++){
 const upkeep=g.military.ships.reduce((n,s)=>n+s.assembly.upkeep.alloy,0);
 if(turn%10===0&&g.res.alloy>=12){enqueueMilitaryBuild(g,0,'default_corvette');built++}
 g.res.alloy=Math.round((g.res.alloy+5-upkeep)*10000)/10000;settleShipyards(g);g.turn++;
 }`);
 assert.equal(run('g.military.ships.length'),18);assert.equal(run('g.stars[0].shipyard.queue.length'),0);assert.ok(run('g.res.alloy')>0);
});
test('real next-turn settlement begins upkeep only after completion',()=>{
 const {c,run}=setup();
 vm.runInContext(fs.readFileSync(new URL('../src/simulation.js',import.meta.url),'utf8'),c);
 run(`var HAB_RESOURCES=Object.keys(DATA.resources),motionBusy=false,activeShip=null,moveMode=false,scanMode=false,colonizeMode=false;
 var render=()=>{},clearFleetSelection=()=>{},settleExplorationTimers=()=>{};
 researchState=()=>({current:'test'});settleResearch=()=>null;
 g.ap={explorer:2};for(const r of HAB_RESOURCES)g.res[r]??=0;
 enqueueMilitaryBuild(g,0,'default_corvette');nextTurn();`);
 assert.equal(run('g.res.energy'),100);assert.equal(run('g.res.alloy'),88);
 run('nextTurn()');assert.equal(run('g.res.energy'),99.5);assert.equal(run('g.res.alloy'),87.9);
});
test('shipyard UI wires construction and reports research locks',()=>{
 const {c,run}=setup(),nodes=new Map();
 c.$=id=>{if(!nodes.has(id))nodes.set(id,{});return nodes.get(id)};
 c.safeText=String;c.render=()=>{};c.showFleetManager=()=>{};c.openDialog=(title,desc,body)=>{c.html=body};
 let buttons=[];c.$('modalBody').querySelectorAll=selector=>selector==='[data-build-design]'?buttons:[];
 for(const f of ['fleet-workspace','shipyard-ui'])vm.runInContext(fs.readFileSync(new URL(`../src/${f}.js`,import.meta.url),'utf8'),c);
 run('showShipyards(1)');c.$('yardBuild').onclick();assert.equal(run('g.stars[1].shipyard.remaining'),3);
 buttons=[{dataset:{buildDesign:'default_corvette'}},{dataset:{buildDesign:'default_escort'}}];c.$('yardTarget').value='';
 run('showShipyards(0)');assert.match(c.html,/연구가 필요/);
 assert.match(c.html,/fleet-dialog-shell/);
 assert.match(c.html,/data-campaign-fleet-tab="yards" aria-pressed="true"/);
 buttons[0].onclick();assert.equal(run('g.stars[0].shipyard.queue.length'),1);
 buttons[1].onclick();assert.equal(run('g.stars[0].shipyard.queue.length'),1);assert.equal(run('g.res.alloy'),88);
});

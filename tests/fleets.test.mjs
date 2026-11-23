import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
function setup(){
 const DATA=Object.fromEntries(['combat','balance','research'].map(name=>[name,JSON.parse(fs.readFileSync(new URL('../data/'+name+'.json',import.meta.url)))]));
 const c=vm.createContext({DATA});
 for(const f of ['shortages','ship-designs','combat','fleets','retreat','scout-danger','shipyards','fleet-workspace','fleet-ui'])vm.runInContext(fs.readFileSync(new URL('../src/'+f+'.js',import.meta.url),'utf8'),c);
 vm.runInContext(`DATA.combat.fleets.testDeploymentEnabled=true;var g={seed:42,turn:1,ships:{explorer:0,colony:0},ap:{explorer:2,colony:2},records:[],res:{alloy:100},stars:Array.from({length:5},(_,id)=>({id,name:'성계'+id,owned:id<2,nameRevealed:true,edges:[[1],[0,2],[1,3],[2,4],[3]][id]}))};initializeShipDesigns(g);initializeFleets(g);
 function add(hull='corvette',where=0){return deployTestMilitaryShip(g,'default_'+hull,where)}
 function populated(name='함대',where=0,hull='corvette'){const f=createFleet(g,name,where);assignFleetShip(g,f.id,add(hull,where).id);return f}
 function enemy(where,hull='corvette'){const s=add(hull);s.owner='enemy';s.systemId=where;setMilitaryHostility(g,'player','enemy',true);return s}
 `,c);
 return {c,run:s=>vm.runInContext(s,c)};
}
test('exact flagship composition 16 ships / 50; 51 rejected without mutation',()=>{
 const {run}=setup();
 assert.equal(run(`(()=>{const f=createFleet(g,'기함',0);for(const [h,n] of [['battleship',1],['heavy_cruiser',3],['destroyer',3],['escort',4],['corvette',5]])for(let i=0;i<n;i++)assignFleetShip(g,f.id,add(h).id);return f.shipIds.length+':'+fleetPoints(g,f)})()`),'16:50');
 run("var extra=add();var before=JSON.stringify(g.military.fleets)");
 assert.throws(()=>run('assignFleetShip(g,g.military.fleets[0].id,extra.id)'),/50/);
 assert.equal(run('JSON.stringify(g.military.fleets)===before'),true);
});
test('50 corvettes allowed; ownership, duplicate membership, remote ship and nonempty disband rejected',()=>{
 const {run}=setup();run("var f=createFleet(g,'A',0),other=createFleet(g,'B',0);for(let i=0;i<50;i++)assignFleetShip(g,f.id,add().id)");
 assert.equal(run('fleetPoints(g,f)'),50);
 assert.throws(()=>run('assignFleetShip(g,other.id,f.shipIds[0])'),/이미/);
 run("var foreign=enemy(0),remote=add('corvette',1)");
 assert.throws(()=>run('assignFleetShip(g,other.id,foreign.id)'),/소유/);
 assert.throws(()=>run('assignFleetShip(g,other.id,remote.id)'),/성계/);
 assert.throws(()=>run('disbandFleet(g,f.id)'),/빈/);
 run("renameFleet(g,other.id,'새 이름');disbandFleet(g,other.id);var id=f.shipIds[0];var ap=g.military.ships.find(s=>s.id===id).ap;removeFleetShip(g,f.id,id)");
 assert.equal(run('f.shipIds.length'),49);assert.equal(run('g.military.ships.find(s=>s.id===id).ap===ap'),true);
});
test('joint range uses slowest member and slowest selected fleet, each pays actual cost',()=>{
 const {run}=setup();run("var a=populated('A',0),b=populated('B',1);var damaged=g.military.ships[0];damaged.ap=3;damaged.hp-=5;var weak=add();weak.ap=1.3;assignFleetShip(g,a.id,weak.id)");
 assert.equal(run('fleetAP(g,a)'),1.3);
 assert.equal(run('planFleetOrder(g,[a.id,b.id],2).budget'),1.3);
 assert.throws(()=>run('planFleetOrder(g,[a.id,b.id],3)'),/도달/);
 run('executeFleetOrder(g,[a.id,b.id],2)');
 assert.equal(run('g.military.ships.find(s=>s.id===damaged.id).ap'),1.7);
 assert.equal(run('g.military.ships.find(s=>s.id===weak.id).ap'),0);
 assert.equal(run('g.military.ships.find(s=>s.id===damaged.id).hp'),30);
 assert.equal(run('g.military.fleets.every(f=>f.systemId===2)'),true);
 assert.equal(run('g.ap.explorer'),2);
});
test('common target UI range excludes destinations beyond minimum AP',()=>{
 const {run}=setup();run("var a=populated('A',0),b=populated('B',0);g.military.ships[0].ap=.3;var state=g;selectedFleetIds=[a.id,b.id]");
 assert.equal(run('fleetMoveTargets().has(1)'),true);assert.equal(run('fleetMoveTargets().has(2)'),false);
});
test('invalid joint order is atomic; fog and hostile transit prevent illegal routes',()=>{
 const {run}=setup();run("var a=populated(),b=createFleet(g,'빈 함대',0);var before=JSON.stringify(g)");
 assert.throws(()=>run('executeFleetOrder(g,[a.id,b.id],1)'),/빈/);
 assert.equal(run('JSON.stringify(g)===before'),true);
 run('g.stars[2].nameRevealed=false');assert.equal(run("fleetRoute(g,0,2,'player')===null"),true);
 run('g.stars[2].nameRevealed=true;enemy(1)');assert.equal(run("fleetRoute(g,0,2,'player')===null"),true);
 assert.throws(()=>run('executeFleetOrder(g,[a.id,a.id],1)'),/선택/);
});
test('joint attack has one combat including all arrivals; AP and fleet identities retained',()=>{
 const {run}=setup();run("var a=populated('A',0,'battleship'),b=populated('B',0,'battleship');var e=enemy(1);e.hp=1;e.shield=0;var result=executeFleetOrder(g,[a.id,b.id],1)");
 assert.equal(run('result.combat.participants.length'),3);
 assert.equal(run('result.serial'),1);assert.equal(run('result.combat.winner'),'attacker');
 assert.equal(run('g.military.fleets.length'),2);
 assert.equal(run('g.military.ships.every(s=>s.systemId===1&&s.ap===1.7)'),true);
 assert.equal(run('g.military.fleets.every(f=>f.shipIds.length===1)'),true);
});
test('failed combat computation rolls back all arrivals and AP',()=>{
 const {run}=setup();run("var a=populated();enemy(1,'battleship');DATA.combat.fleets.maxCombatSteps=1;var before=JSON.stringify(g)");
 assert.throws(()=>run('executeFleetOrder(g,[a.id],1)'),/계산 제한/);
 assert.equal(run('JSON.stringify(g)===before'),true);
});
test('research raises military AP on refresh, AI executes before player AP refresh',()=>{
 const {run}=setup();run("var a=populated();DATA.research.technologies.push({id:'ap_test',effects:[{kind:'strategicAP',target:'military',value:1}]});g.research={completed:['ap_test']};g.military.ships[0].ap=.2;var e=enemy(3);g.military.phase='ai';var ef=createFleet(g,'적',3,'enemy');assignFleetShip(g,ef.id,e.id,'enemy');g.military.knownSystems={enemy:[2,3]};g.military.phase='player'");
 assert.throws(()=>run("executeFleetOrder(g,[ef.id],2,'enemy')"),/단계/);
 run("var results=settleFleetTurn(g,[{owner:'enemy',fleetIds:[ef.id],to:2}])");
 assert.equal(run('results[0].to'),2);assert.equal(run('g.military.ships.find(s=>s.id===e.id).ap'),1);
 assert.equal(run('g.military.ships[0].ap'),3);assert.equal(run('g.military.phase'),'player');
 assert.equal(run('g.ap.explorer'),2);
});
test('old save initializes safely; roundtrip retains independent damage/AP and fleets',()=>{
 const {run}=setup();run("var a=populated();g.military.ships[0].hp=20;g.military.ships[0].ap=.7;var before=JSON.stringify(g.military);var loaded=JSON.parse(JSON.stringify(g));initializeFleets(loaded)");
 assert.equal(run('JSON.stringify(loaded.military)===before'),true);
 run('loaded.military.fleets[0].owner="enemy"');assert.throws(()=>run('validateFleetState(loaded)'),/소유/);
});
test('existing nextTurn preserves settlement and civilian AP while refreshing military',()=>{
 const {c,run}=setup();
 vm.runInContext(fs.readFileSync(new URL('../src/simulation.js',import.meta.url),'utf8'),c);
 run(`var state=g,tutorial=false,motionBusy=false,dirty=false,activeShip=null,moveMode=false,scanMode=false,colonizeMode=false;
 var HAB_RESOURCES=['energy','mineral','food','consumer','alloy','research'];
 for(const s of g.stars)s.planets=[];for(const r of HAB_RESOURCES)g.res[r]=100;
 var researchState=()=>({current:'test'}),showResearch=()=>{},settleResearch=()=>null,settleExplorationTimers=()=>{},render=()=>{},rec=()=>{};
 incomes=()=>Object.fromEntries(HAB_RESOURCES.map(r=>[r,2]));
 var f=populated();g.military.ships[0].ap=.3;g.ap.explorer=.4;
 var originalSettle=settleFleetTurn,seen=false;
 settleFleetTurn=game=>{if(game.res.energy!==102||game.turn!==1||game.ap.explorer!==.4)throw Error('Turn ordering changed');seen=true;return originalSettle(game)};
 nextTurn();`);
 assert.equal(run('seen&&g.turn===2&&g.ap.explorer===2&&g.res.energy===102&&g.military.ships[0].ap===2'),true);
 run('motionBusy=true;var before=JSON.stringify(g);nextTurn()');assert.equal(run('JSON.stringify(g)===before'),true);
});
test('fleet manager handlers create, deploy and assign without browser execution',()=>{
 const {c,run}=setup(),nodes=new Map();
 const node=id=>{if(!nodes.has(id))nodes.set(id,{});return nodes.get(id)};
 c.$=node;c.safeText=s=>String(s);c.state=c.g;c.render=()=>{};c.openDialog=(title,desc,body)=>{c.html=body};c.dirty=false;
 node('modalBody').insertAdjacentHTML=()=>{};
 node('modalBody').querySelectorAll=selector=>selector==='[data-add]'?c.addButtons||[]:[];
 node('modalBody').querySelector=()=>({value:c.reserve});
 run('showFleetManager()');
 assert.match(c.html,/class="fleet-workspace"/);
 assert.match(c.html,/fleet-dialog-shell/);
 assert.match(c.html,/군단 및 독립 함대/);
 assert.match(c.html,/fleet-workspace-create[^]*새 함대 창설/);
 assert.match(c.html,/자세히 볼 함대를 선택하세요/);
 assert.doesNotMatch(c.html,/함급별 보유 현황|fleet-composition|data-fleet-select|이동 \/ 공격/);
 for(const id of ['corvette','escort','destroyer','heavy_cruiser','battleship']){
  assert.ok(fs.existsSync(new URL(`../assets/icons/hulls/${id}.svg`,import.meta.url)));
 }
 assert.doesNotMatch(c.html,/데이터|탐사선|특수선/);
 node('newFleetName').value='제1함대';node('newFleetSystem').value='0';node('createFleet').onclick();
 assert.equal(run('g.military.fleets[0].name'),'제1함대');
 node('testShipDesign').value='default_corvette';node('testShipSystem').value='0';node('testShipDeploy').onclick();
 c.addButtons=[{dataset:{add:run('g.military.fleets[0].id')}}];c.reserve=run('g.military.ships[0].id');
 run('showFleetManager()');c.addButtons[0].onclick();
 assert.equal(run('fleetPoints(g,g.military.fleets[0])'),1);assert.equal(run('g.res.alloy'),100);
 assert.match(c.html,/role="meter"[^>]*aria-valuemax="50" aria-valuenow="1"/);
 assert.match(c.html,/초계함<\/strong><b>1척/);
 run(`g.military.ships[0].hp=19;g.military.ships[0].shield=6;
  var other=populated('다른 함대',0,'battleship');showFleetManager()`);
 const [list,detail]=c.html.split('class="fleet-workspace-detail"');
 assert.match(list,/다른 함대/);
 assert.doesNotMatch(list,/이동 \/ 공격|data-fleet-select/);
 const card=detail.match(/<article class="fleet-hull-card">[\s\S]+?<\/article>/)?.[0];
 assert.match(card,/편성 해제/);
 assert.match(card,/보호막<\/small><b>6\.0 \/ 25\.0/);
 assert.match(card,/장갑<\/small><b>19\.0 \/ 35\.0/);
 assert.match(card,/aria-label="보호막"[^>]*aria-valuenow="24"/);
 assert.match(card,/aria-label="장갑"[^>]*aria-valuenow="54\.29"/);
 assert.match(detail,/편제 규모 1 \/ 50/);
 assert.match(list,/assets\/icons\/squadron-badge\.svg/);
 assert.doesNotMatch(detail,/battleship\.svg/);
});
test('nonhostile factions coexist; selected attackers exclude unselected ships',()=>{
 const {run}=setup();run("var a=populated();var e=enemy(1);setMilitaryHostility(g,'player','enemy',false);var hp=e.hp;executeFleetOrder(g,[a.id],1)");
 assert.equal(run('g.military.lastOrder.combat'),null);assert.equal(run('g.military.ships.find(s=>s.id===e.id).hp'),35);
});
test('all hostile defenders join without AP charge; neutral and unselected ships are untouched',()=>{
 const {run}=setup();run("var a=populated(),b=populated();var idle=add('battleship',1);var e1=enemy(1,'battleship'),e2=enemy(1,'battleship');e1.ap=.3;e2.ap=1.7;var n=add('escort',1);n.owner='neutral';var neutralBefore=JSON.stringify(n);var idleBefore=JSON.stringify(idle);var result=executeFleetOrder(g,[a.id,b.id],1)");
 assert.equal(run('result.combat.participants.length'),4);
 assert.equal(run('g.military.ships.find(s=>s.id===e1.id).ap'),.3);assert.equal(run('g.military.ships.find(s=>s.id===e2.id).ap'),1.7);
 assert.equal(run('JSON.stringify(g.military.ships.find(s=>s.id===n.id))===neutralBefore'),true);
 assert.equal(run('JSON.stringify(g.military.ships.find(s=>s.id===idle.id))===idleBefore'),true);
});
test('shield recovery needs a peaceful turn, is once per turn and never repairs armor or AP',()=>{
 const {run}=setup();run("populated();var s=g.military.ships[0];s.hp=20;s.shield=0;s.ap=.3;s.lastCombatTurn=1;recoverMilitaryShields(g)");
 assert.equal(run('s.shield'),0);
 run('g.turn=2;recoverMilitaryShields(g);recoverMilitaryShields(g)');assert.equal(run('s.shield'),6.25);
 assert.equal(run('s.hp'),20);assert.equal(run('s.ap'),.3);
 run('g=JSON.parse(JSON.stringify(g));initializeFleets(g);recoverMilitaryShields(g)');assert.equal(run('g.military.ships[0].shield'),6.25);
 run('for(let i=0;i<5;i++){g.turn++;recoverMilitaryShields(g)}');assert.equal(run('g.military.ships[0].shield'),25);
});
test('explicit hostility is symmetric, persists through saves, and can be revoked',()=>{
 const {run}=setup();run("setMilitaryHostility(g,'player','other',true);g=JSON.parse(JSON.stringify(g));initializeFleets(g)");
 assert.equal(run("factionsHostile(g,'other','player')"),true);
 assert.equal(run("factionsHostile(g,'other','neutral')"),false);
 run("setMilitaryHostility(g,'other','player',false)");assert.equal(run("factionsHostile(g,'player','other')"),false);
});
test('destination selection freezes the battle and an individual fleet can leave while the others fight',()=>{
 const {run}=setup();
 run(`var a=populated('후퇴',0,'battleship'),b=populated('잔류',0,'battleship');enemy(1,'battleship');
 DATA.combat.retreat.ai.lossThreshold=100;beginFleetOrder(g,[a.id,b.id],1);
 var engagement=g.military.battle;var units=engagement.combat.units;units.forEach(u=>{u.x=0;u.y=0;u.assembly.speed=0;u.weaponCooldowns.fill(1000)});
 units[2].weaponCooldowns[0]=0;engagement.combat.seed=1;
 beginRetreatDecision(g,a.id);var paused=JSON.stringify(engagement);advanceFleetBattle(g)`);
 assert.equal(run('JSON.stringify(engagement)===paused'),true);
 assert.throws(()=>run("confirmRetreatDecision(g,'short',4)"),/목적지/);
 assert.equal(run('engagement.decision.kind'),'destination');
 run("confirmRetreatDecision(g,'short',0);advanceFleetBattle(g)");
 assert.equal(run("engagement.combat.events.some(e=>e.targetId===units[0].id&&e.shieldDamage>0)"),true);
 run('for(let i=1;i<15;i++)advanceFleetBattle(g)');assert.equal(run('g.military.fleets[0].systemId'),1);
 run('advanceFleetBattle(g)');
 assert.equal(run('engagement.combat.tick'),16);assert.equal(run('g.military.fleets[0].systemId'),0);
 assert.equal(run('g.military.fleets[1].systemId'),1);assert.equal(run('g.military.ships[0].ap'),1.7);
 assert.equal(run('g.military.ships[0].shield<g.military.ships[0].assembly.shield'),true);
 assert.equal(run('g.military.battle===engagement&&engagement.groups[1].status===\'active\''),true);
 run('g=JSON.parse(JSON.stringify(g));initializeFleets(g)');assert.equal(run('g.military.battle.combat.tick'),16);
});
test('short retreat allows same-turn re-engagement without AP charges beyond ordinary movement',()=>{
 const {run}=setup();
 run(`var a=populated('기동',0,'battleship');enemy(1,'battleship');DATA.combat.retreat.ai.lossThreshold=100;
 for(let i=0;i<2;i++){
  beginFleetOrder(g,[a.id],1);beginRetreatDecision(g);confirmRetreatDecision(g,'short',0);
  while(g.military.battle)advanceFleetBattle(g);
 }`);
 assert.equal(run('g.military.ships[0].ap'),1.4);assert.equal(run('g.military.ships[1].ap'),2);
 assert.equal(run('g.military.orderSerial'),2);assert.equal(run('g.turn'),1);
});
test('fleet and scout retreat reject hostile territory even without stationed warships',()=>{
 const {run}=setup();
 run(`var fleet=populated('후퇴',0,'battleship');enemy(1);g.stars[2].ownerId='enemy';
  g.military.knownSystems={enemy:[0,1,2]};beginFleetOrder(g,[fleet.id],1);beginRetreatDecision(g);`);
 assert.equal(run(`retreatDestinations(g,1,'player','short').map(option=>option.id).join()`),'0');
 assert.equal(run(`retreatDestinations(g,1,'enemy','short').map(option=>option.id).join()`),'2');
 assert.throws(()=>run(`confirmRetreatDecision(g,'short',2)`),/목적지/);
 run(`g.ships.explorer=1;queueScoutDanger(g,'explorer',{kind:'military'})`);
 assert.equal(run(`scoutRetreatDestinations(g,pendingScoutDanger(g)).join()`),'0');
 assert.throws(()=>run(`resolveScoutDanger(g,'retreat',2)`),/인접/);
 run(`g.stars[2].ownerId='neutral'`);
 assert.equal(run(`scoutRetreatDestinations(g,pendingScoutDanger(g)).join()`),'0,2');
});
test('warp preparation lasts ten seconds, missing ships cannot act, and return uses an eligible replacement yard',()=>{
 const {run}=setup();
 run(`initializeShipyards(g);var a=populated('워프',0,'battleship');var e=enemy(1,'battleship');DATA.combat.retreat.ai.lossThreshold=100;
 beginFleetOrder(g,[a.id],1);beginRetreatDecision(g);confirmRetreatDecision(g,'warp',0);
 for(let i=0;i<39;i++)advanceFleetBattle(g)`);
 assert.equal(run("g.military.battle.groups[0].status"),'retreating');
 run('advanceFleetBattle(g)');
 assert.equal(run('g.military.lastOrder.combat.seconds'),10);
 assert.equal(run("g.military.fleets[0].status"),'missing');assert.equal(run('g.military.ships[0].systemId'),null);
 assert.throws(()=>run('planFleetOrder(g,[a.id],0)'),/이탈/);
 assert.throws(()=>run("renameFleet(g,a.id,'새 이름')"),/이탈/);
 run('var hp=g.military.ships[0].hp,shield=g.military.ships[0].shield,ap=g.military.ships[0].ap;g=JSON.parse(JSON.stringify(g));initializeShipyards(g);g.stars[0].owned=false;g.turn=3;returnWarpFleets(g)');
 assert.equal(run('g.military.ships[0].status'),'missing');
 run('g.stars[2].owned=true;g.stars[2].shipyards=[createOrbitalShipyard(null,0)];g.turn++;returnWarpFleets(g)');
 assert.equal(run('g.military.fleets[0].systemId'),2);
 assert.equal(run('g.military.ships[0].hp===hp&&g.military.ships[0].shield===shield&&g.military.ships[0].ap===ap&&g.military.transits.length===0'),true);
 assert.equal(run('[0,1,2,3,5,6,8,9,50].map(retreatWarpTurns).join()'),'2,2,2,3,3,4,4,5,5');
});
test('a ship destroyed during preparation is reported destroyed and never enters transit',()=>{
 const {run}=setup();
 run(`initializeShipyards(g);var a=populated();enemy(1,'battleship');g.military.ships[0].hp=1;g.military.ships[0].shield=0;
 beginFleetOrder(g,[a.id],1);beginRetreatDecision(g);confirmRetreatDecision(g,'warp',0);
 g.military.battle.combat.units.forEach(u=>{u.x=0;u.y=0});g.military.battle.combat.seed=1;advanceFleetBattle(g)`);
 assert.equal(run('g.military.lastOrder.combat.outcomes[0].status'),'destroyed');
 assert.equal(run('g.military.transits.length'),0);assert.equal(run('g.military.fleets.length'),0);
});
test('AI short retreats to a legal neighboring destination when projected losses are high',()=>{
 const {run}=setup();
 run(`var a=populated('공격',0,'battleship');var e=enemy(1);e.hp=1;e.shield=0;g.military.knownSystems={enemy:[1,2]};
 beginFleetOrder(g,[a.id],1);var engagement=g.military.battle;engagement.combat.units.forEach(u=>{u.x=0;u.y=0;u.weaponCooldowns.fill(1000)});advanceFleetBattle(g)`);
 assert.equal(run("engagement.groups[1].status"),'retreating');
 assert.equal(run("engagement.groups[1].retreat.destination"),2);
});
test('AI chooses emergency warp when heavily damaged and an owned yard is available',()=>{
 const {run}=setup();
 run(`var a=populated('공격',0,'battleship');var e=enemy(1);e.hp=1;e.shield=0;
 g.military.knownSystems={enemy:[1,2]};g.stars[2].ownerId='enemy';g.stars[2].shipyards=[createOrbitalShipyard(null,0)];
 beginFleetOrder(g,[a.id],1);var engagement=g.military.battle;engagement.combat.units.forEach(u=>{u.x=0;u.y=0;u.weaponCooldowns.fill(1000)});advanceFleetBattle(g)`);
 assert.equal(run("engagement.groups[1].retreat.mode"),'warp');
 assert.equal(run("engagement.groups[1].retreat.readyTick"),40);
 assert.equal(run("engagement.groups[1].retreat.destination"),2);
});
test('AI phase pauses and resumes pursuit without another economic settlement or lost order',()=>{
 const {c,run}=setup();
 vm.runInContext(fs.readFileSync(new URL('../src/simulation.js',import.meta.url),'utf8'),c);
 run(`var state=g,tutorial=false,motionBusy=false,dirty=false,activeShip=null,moveMode=false,scanMode=false,colonizeMode=false;
 var HAB_RESOURCES=['energy','mineral','food','consumer','alloy','research'],shown=0;
 for(const r of HAB_RESOURCES)g.res[r]=100;for(const star of g.stars)star.planets=[];
 var researchState=()=>({current:'test'}),showResearch=()=>{},settleResearch=()=>null,settleExplorationTimers=()=>{},render=()=>{},showFleetBattle=()=>shown++;
 incomes=()=>Object.fromEntries(HAB_RESOURCES.map(r=>[r,2]));
 var a=populated('방어',1,'battleship'),e=enemy(2,'battleship');g.military.phase='ai';var f=createFleet(g,'추격',2,'enemy');assignFleetShip(g,f.id,e.id,'enemy');
 g.military.phase='player';g.military.knownSystems={enemy:[0,1,2]};DATA.combat.retreat.ai.lossThreshold=100;
 nextTurn([{owner:'enemy',fleetIds:[f.id],to:1},{owner:'enemy',fleetIds:[f.id],to:0}]);`);
 assert.equal(run('shown===1&&g.turn===1&&g.res.energy===102&&g.military.turnPlan.cursor===1'),true);
 assert.equal(run('g.military.battle.decision.kind'),'initial');
 run("beginRetreatDecision(g);cancelRetreatDecision(g);advanceFleetBattle(g)");assert.equal(run('g.military.battle.combat.tick'),0);
 run("beginRetreatDecision(g);confirmRetreatDecision(g,'short',0);while(g.military.battle)advanceFleetBattle(g);resumeFleetTurn(g)");
 assert.equal(run('g.turn===1&&g.military.battle.order.to===0&&g.military.turnPlan.cursor===2&&g.military.battle.decision.kind===\'initial\''),true);
 assert.equal(run('pendingScoutDanger(g).shipId'),'explorer');
 run("g=state=JSON.parse(JSON.stringify(g));initializeFleets(g);validateScoutDangers(g);resolveScoutDanger(g,'stay');continueFleetBattle(g);while(g.military.battle)advanceFleetBattle(g);var results=resumeFleetTurn(g);finishStrategicTurn();finishStrategicTurn()");
 assert.equal(run('g.turn===2&&g.res.energy===102&&g.military.phase===\'player\'&&results.length===2'),true);
});
test('AI-phase defense keeps spent player AP during battle and restores it once at phase completion',()=>{
 const {run}=setup();
 run(`var d=populated('방어',1,'battleship'),e=enemy(2);e.hp=1;e.shield=0;
 g.military.phase='ai';var f=createFleet(g,'AI',2,'enemy');assignFleetShip(g,f.id,e.id,'enemy');
 g.military.phase='player';g.military.knownSystems={enemy:[1,2]};g.military.ships[0].ap=.4;
 settleFleetTurn(g,[{owner:'enemy',fleetIds:[f.id],to:1}]);continueFleetBattle(g);while(g.military.battle)advanceFleetBattle(g);`);
 assert.equal(run("g.military.lastOrder.combat.winner==='defender'&&g.military.ships[0].ap===.4&&g.military.phase==='ai'"),true);
 run('resumeFleetTurn(g)');assert.equal(run('g.military.ships[0].ap'),2);
 run('g.military.ships[0].ap=1;resumeFleetTurn(g)');assert.equal(run('g.military.ships[0].ap'),1);
});
test('battle panel group and destination buttons pause the timer and resume the same tick',()=>{
 const {c,run}=setup(),nodes=new Map();
 const node=id=>{if(!nodes.has(id))nodes.set(id,{focus(){}});return nodes.get(id)};
 c.$=node;c.safeText=String;c.openDialog=(title,desc,body)=>{c.html=body};
 let pending;
 c.setTimeout=fn=>{pending=fn;return 1};c.clearTimeout=()=>{pending=null};
 const all={dataset:{retreatGroup:''}},ship={dataset:{retreatGroup:'fleet_1'}},destination={dataset:{retreatMode:'short',destination:'0'}};
 node('modalBody').querySelectorAll=selector=>selector==='[data-retreat-group]'?[all,ship]:[destination];
 for(const f of ['battle-scene','battle-ui','battle-test'])vm.runInContext(fs.readFileSync(new URL('../src/'+f+'.js',import.meta.url),'utf8'),c);
 run(`var state=g,tutorial=false,dirty=false,modalKind=null;
 var a=populated('첫 함대',0,'battleship'),b=populated('둘째 함대',0,'battleship');enemy(1,'battleship');
 DATA.combat.retreat.ai.lossThreshold=100;beginFleetOrder(g,[a.id,b.id],1);
 const unit=g.military.battle.combat.units[0];unit.shield=unit.assembly.shield/2;unit.hp=unit.assembly.armor/4;showFleetBattle();`);
 assert.match(c.html,/전체 후퇴/);
 assert.match(node('battleRoster').innerHTML,/aria-label="보호막"[^>]*aria-valuenow="50"/);
 assert.match(node('battleRoster').innerHTML,/aria-label="장갑"[^>]*aria-valuenow="25"/);
 assert.equal(typeof pending,'function');
 ship.onclick();assert.equal(pending,null);assert.match(c.html,/일시정지/);
 assert.equal(run('state.military.battle.combat.tick'),0);
 destination.onclick();assert.equal(typeof pending,'function');
 assert.equal(run('state.military.battle.groups.map(g=>g.status).join()'),'retreating,active,active');
 pending();assert.equal(run('state.military.battle.combat.tick'),1);
 all.onclick();destination.onclick();
 assert.equal(run('state.military.battle.groups.map(g=>g.status).join()'),'retreating,retreating,active');
});
test('an opted-in fauna event offers stay or AP-free one-edge retreat before applying the event',()=>{
 const {c,run}=setup();
 vm.runInContext(fs.readFileSync(new URL('../src/exploration.js',import.meta.url),'utf8'),c);
 run(`var state=g,tutorial=false,dirty=false;var rec=()=>{};
 initializeExploration=()=>{};
 DATA.exploration={events:[{id:'fixture',title:'시험용',scoutDanger:{kind:'fauna',description:'시험용 조우'},options:[{label:'조사',effects:[{kind:'resource',resource:'alloy',amount:5}]}]}]};
 var resourceNames={alloy:'신소재'},system=g.stars[1],planet={type:'mineral',scanned:true};
 system.planets=[planet];system.explorationEvent={type:'anomaly',status:'assigned',eventId:'fixture',planetIndex:0};
 g.ships.explorer=1;g.ap.explorer=0;g.stars[2].nameRevealed=false;
 triggerExploration(system,planet,'explorer');var original=JSON.stringify(g);`);
 assert.equal(run('pendingScoutDanger(g).kind'),'fauna');
 assert.equal(run('g.res.alloy'),100);
 assert.equal(run('resolveExploration(system,0)'),false);
 assert.throws(()=>run("resolveScoutDanger(g,'retreat',4)"),/인접/);
 assert.equal(run('JSON.stringify(g)===original'),true);
 run("resolveScoutDanger(g,'retreat',2)");
 assert.equal(run('g.ships.explorer===2&&g.ap.explorer===0&&g.res.alloy===100&&planet.scanned&&g.stars[2].explored&&!g.stars[2].surveyed'),true);
 assert.equal(run('system.explorationEvent.status'),'resolved');
 run(`g=state=JSON.parse(original);validateScoutDangers(g);resolveScoutDanger(g,'stay');var kept=g.stars[1];resolveExploration(kept,0);`);
 assert.equal(run('g.ships.explorer===1&&g.ap.explorer===0&&g.res.alloy===105'),true);
 assert.equal(run('resolveExploration(kept,0)'),false);
});
test('civilian-only hostile arrival pauses the AI cursor and offers only safe neighboring systems',()=>{
 const {c,run}=setup();
 vm.runInContext(fs.readFileSync(new URL('../src/simulation.js',import.meta.url),'utf8'),c);
 run(`var state=g,tutorial=false,dirty=false,motionBusy=false,activeShip=null,moveMode=false,scanMode=false,colonizeMode=false;
 var HAB_RESOURCES=['alloy'],researchState=()=>({current:'fixture'}),settleResearch=()=>null,settleExplorationTimers=()=>{},render=()=>{},showScoutDanger=()=>{};
 for(const star of g.stars)star.planets=[];incomes=()=>({alloy:5});
 g.ships={explorer:1,explorer2:1,colony:1};g.ap={explorer:0,explorer2:1.4,colony:1};
 var attacker=enemy(2),guard=enemy(0);g.military.phase='ai';var f=createFleet(g,'적 함대',2,'enemy');assignFleetShip(g,f.id,attacker.id,'enemy');
 g.military.phase='player';g.military.knownSystems={enemy:[0,1,2]};
 nextTurn([{owner:'enemy',fleetIds:[f.id],to:1},{owner:'enemy',fleetIds:[f.id],to:2}]);`);
 assert.equal(run('g.turn===1&&g.res.alloy===105&&g.military.phase===\'ai\'&&!g.military.battle&&g.military.turnPlan.cursor===1'),true);
 assert.equal(run('g.scoutDangers.map(d=>d.shipId).join()'),'explorer,explorer2');
 assert.equal(run('scoutRetreatDestinations(g,pendingScoutDanger(g)).join()'),'2');
 assert.equal(run('resumeFleetTurn(g)'),null);
 run("resolveScoutDanger(g,'stay');resolveScoutDanger(g,'retreat',2)");
 assert.equal(run("g.ap.explorer2===1.4&&!canSurveyFromShip(g,'explorer',1)&&civilianOperationsBlocked(g,1)&&!performAction('colony')"),true);
 // Complete the pending AI action before checking normal civilian AP refresh.
 run("resumeFleetTurn(g)");assert.equal(run('pendingScoutDanger(g).shipId'),'explorer2');
 run("resolveScoutDanger(g,'stay');var orders=resumeFleetTurn(g);finishStrategicTurn();finishStrategicTurn()");
 assert.equal(run("orders.length===2&&g.turn===2&&g.res.alloy===105&&g.ships.colony===1&&g.ships.explorer2===2"),true);
 assert.equal(run("canSurveyFromShip(g,'explorer',1)&&!civilianOperationsBlocked(g,1)"),true);
});
test('scouts and colony ships never join combat or military fleet slots',()=>{
 const {run}=setup();
 run(`var attack=populated();enemy(1);g.ships.explorer=1;g.ships.colony=1;var saved=JSON.stringify(g.ships)`);
 assert.throws(()=>run("assignFleetShip(g,attack.id,'explorer')"),/민간/);
 assert.throws(()=>run("assignFleetShip(g,attack.id,'colony')"),/민간/);
 assert.equal(run("queueScoutDanger(g,'colony',{kind:'hazard'})"),false);
 run('var result=executeFleetOrder(g,[attack.id],1)');
 assert.equal(run('result.combat.participants.length===2&&JSON.stringify(g.ships)===saved'),true);
 run("g.military.ships[0].id='colony'");assert.throws(()=>run('validateFleetState(g)'),/군함/);
});
test('scout danger popup retreat button uses the same queued decision and does not auto-choose on missing routes',()=>{
 const {c,run}=setup(),nodes=new Map();
 vm.runInContext(fs.readFileSync(new URL('../src/simulation.js',import.meta.url),'utf8'),c);
 const node=id=>{if(!nodes.has(id))nodes.set(id,{focus(){}});return nodes.get(id)};
 c.$=node;c.safeText=String;c.openDialog=(title,desc,body)=>{c.html=body};
 const button={dataset:{scoutRetreat:'1'}};
 node('modalBody').querySelectorAll=()=>[button];
 run(`var state=g,modalKind=null,view='galaxy',selected=0,activeShip=null,moveMode=false,scanMode=false,colonizeMode=false;
 var shipName=id=>id,systemKnown=id=>g.stars[id].nameRevealed,rec=()=>{},render=()=>{},closeDialog=()=>{};
 queueScoutDanger(g,'explorer',{kind:'hazard',description:'시험용 위험'});showPendingEncounter()`);
 assert.match(c.html,/남기/);assert.match(c.html,/AP 0/);
 button.onclick();assert.equal(run('g.ships.explorer===1&&g.ap.explorer===2&&!pendingScoutDanger(g)'),true);
 run(`enemy(0);enemy(2);queueScoutDanger(g,'explorer',{kind:'hazard'});showPendingEncounter()`);
 assert.match(c.html,/후퇴 가능한 인접 성계가 없습니다/);
 assert.equal(run('pendingScoutDanger(g).shipId'),'explorer');
 node('scoutStay').onclick();assert.equal(run('g.ships.explorer===1&&!pendingScoutDanger(g)'),true);
});
test('a scout entering a hostile system gets the choice after the normal arrival animation',async()=>{
 const {c,run}=setup();
 vm.runInContext(fs.readFileSync(new URL('../src/simulation.js',import.meta.url),'utf8'),c);
 run(`var state=g,tutorial=false,dirty=false,selected=0,shown=0,finishAnimation;
 var playWarp=()=>new Promise(resolve=>{finishAnimation=resolve}),showScoutDanger=()=>shown++;
 enemy(1);moveShip('explorer',1)`);
 assert.equal(run('g.ap.explorer'),1.7);
 assert.equal(run('pendingScoutDanger(g).kind'),'military');
 assert.equal(run('shown'),0);
 run('finishAnimation()');
 await Promise.resolve();
 assert.equal(run('shown'),1);
});

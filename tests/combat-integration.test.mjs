import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {militaryShipModels,readData} from '../tools/build.mjs';

function setup(){
 const nodes=new Map(),storage=new Map(),branches=[{inert:false},{inert:false}];
 const element=()=>({classList:{toggle(){},add(){},remove(){}},style:{setProperty(){}},dataset:{},children:[],clientWidth:800,clientHeight:500,offsetWidth:800,offsetHeight:512,
  setAttribute(){},addEventListener(name,fn){(this.handlers??={})[name]=fn},focus(){},remove(){},append(...children){this.children.push(...children)},replaceChildren(){this.children=[]},
  querySelector:()=>node('modal'),querySelectorAll:()=>[]});
 const node=id=>{
  if(!nodes.has(id))nodes.set(id,{...element(),id});
  return nodes.get(id);
 };
 const slots=Array.from({length:5},(_,i)=>({dataset:{slot:String(i)}}));
 node('modalBody').querySelectorAll=()=>slots;
 const context=vm.createContext({DATA:readData(),document:{hidden:true,getElementById:node,querySelector:node,querySelectorAll:()=>branches,createElement:element,createElementNS:element,addEventListener(){}},window:{addEventListener(){}},
  localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)},
  confirm:()=>true,alert:message=>{throw Error(message)},queueMicrotask:fn=>fn(),setTimeout:()=>0,clearTimeout(){},location:{hash:''}});
 const load=name=>vm.runInContext(fs.readFileSync(new URL('../src/'+name+'.js',import.meta.url),'utf8'),context);
 const run=source=>vm.runInContext(source,context);
 for(const name of ['state','shortages','resource-ui','galaxy-symbols','gateways','galaxy','research','habitat','construction','exploration','chains','wonders','relics','science-victory','habitable-events','ship-designs','combat','fleets','retreat','scout-danger','battle-scene','battle-test','battle-test-ui','fleet-workspace','fleet-ui','shipyards','shipyard-ui','simulation','map-ui','presentation'])load(name);
 run(`var tutorial=false,researchPendingTurn=false,habIndex=0,realPumpExploration=pumpExploration;
 var modelCanvas=()=>null,militaryShipFrame=()=>null,militaryShipImage=()=>null,dismissModal=()=>{},showFleetBattle=()=>{},showResearch=()=>{};showNextDiscovery=()=>{};render=()=>{};pumpExploration=()=>{};
 state=normalizeSavedState(generate('campaign-integration'));`);
 load('saves-menu');
 return {run,load,context,node,slots,branches};
}

test('new campaign deploys one free standard corvette fleet and loading preserves the saved roster',()=>{
 const {run}=setup();
 run(`reset('starter-fleet');var start=state.military.fleets[0],startingShips=state.military.ships`);
 assert.equal(run(`state.turn===1&&state.military.fleets.length===1&&start.owner==='player'&&start.systemId===0&&fleetPoints(state,start)===2&&
  startingShips.length===2&&start.shipIds.every(id=>startingShips.some(ship=>ship.id===id&&ship.hullId==='corvette'&&ship.systemId===0&&ship.ap===2&&ship.hp===ship.assembly.armor&&ship.shield===ship.assembly.shield))`),true);
 assert.equal(run('state.res.alloy===100&&state.stars[0].shipyards[0].productionQueue.length===0&&incomes().alloy===-.2&&incomes().energy===2'),true);
 run(`militaryShipImage=id=>id==='corvette'?'data:image/png;base64,AA==':null;
  renderSystemMilitaryFleets($('planetList'),state,0,[],()=>{})`);
 assert.equal(run(`$('planetList').children.find(node=>node.dataset.systemFleet===start.id).innerHTML.match(/class="military-ship-model"/g).length`),2);
 run(`removeFleetShip(state,start.id,startingShips[1].id);state.military.ships.pop();
  state=normalizeSavedState(JSON.parse(JSON.stringify(state)))`);
 assert.equal(run('state.military.fleets.length===1&&state.military.fleets[0].shipIds.length===1&&state.military.ships.length===1'),true);
 assert.equal(run(`normalizeSavedState(generate('old-shipless-save')).military.ships.length`),0);
});

test('the system shows every fleet member and a right click moves the selected formation together',async()=>{
 const {run,node}=setup();
 node('combatTestSystemScene').getBoundingClientRect=()=>({left:0,top:0,width:1000,height:640});
 run(`startCombatTest();combatTestSession.draft.confirmed=true;beginCombatTestPlay();
  var session=combatTestSession,g=session.game,f=createFleet(g,'50척 함대',0),spec=militaryBuildSpec(g,'default_corvette');
  for(let i=0;i<50;i++){
   const ship=makeMilitaryShip(g,spec,0);g.military.ships.push(ship);f.shipIds.push(ship.id);
  }
  g.ships.colony=2;openCombatTestSystem(0);var trace=[];animateFleetMovement=()=>true;
  animateShip=async (node,frames,options)=>trace.push({fleet:node.dataset.systemFleet,frames,options,busy:motionBusy});`);
 const scene=node('combatTestSystemScene');
 const fleet=scene.children.find(child=>child.dataset.systemFleet===run('f.id'));
 assert.equal((fleet.innerHTML.match(/class="system-fleet-member"/g)||[]).length,50);
 fleet.onclick({shiftKey:false});
 assert.equal(run('session.selected.has(f.id)&&!session.fleetMove'),true);
 await node('combatTestSystemViewport').oncontextmenu({button:2,clientX:300,clientY:416,target:{closest:()=>null},preventDefault(){}});
 assert.equal(run(`trace.length===1&&trace[0].fleet===f.id&&trace[0].busy&&trace[0].frames.length===33&&trace[0].frames.at(-1).left==='30%'&&
  f.systemPose.x===30&&f.systemPose.y===65&&f.systemId===0&&fleetAP(g,f)===2&&!motionBusy&&!session.fleetMove`),true);
 const fleetAfter=scene.children.find(child=>child.dataset.systemFleet===run('f.id'));
 assert.equal(fleetAfter.style.left,'30%');
 run('openCombatTestSystem(0)');
 assert.equal(run('session.selected.has(f.id)'),true);
 run('openCombatTestSystem(1)');
 assert.equal(run('session.selected.size'),0);
 run(`g.military.ships.find(s=>s.id===f.shipIds[0]).repairJobId='queued_repair'`);
 assert.equal(run('canRepositionFleets(g,[f.id],0)'),false);
});

test('campaign keeps local fleet selection and moves on a blank viewport right click without arming movement',async()=>{
 const {run,node}=setup(),scene=node('planetList'),viewport=node('.stellar-viewport');
 scene.parentElement=viewport;
 scene.getBoundingClientRect=()=>({left:100,top:40,width:800,height:512});
 run(`reset('local-fleet-click');state.ships={};
  var fleet=state.military.fleets[0],neighbor=state.stars[0].edges[0];
  var remote=createFleet(state,'원격 함대',neighbor),ship=makeMilitaryShip(state,militaryBuildSpec(state,'default_corvette'),neighbor);
  state.military.ships.push(ship);remote.shipIds.push(ship.id);
  state.stars[neighbor].nameRevealed=true;selectedFleetIds=[fleet.id,remote.id];
  systemOpen(0);drawSystem();renderSystemShips();dirty=false;`);
 assert.equal(run('selectedFleetIds.length===1&&selectedFleetIds[0]===fleet.id&&!fleetMoveMode'),true);
 let prevented=0;
 const click={button:2,clientX:420,clientY:424,target:{closest:()=>null},preventDefault(){prevented++}};
 assert.equal(viewport.onclick,undefined);
 assert.equal(viewport.oncontextmenu({...click,button:0}),undefined);
 assert.equal(viewport.oncontextmenu({...click,target:{closest:()=>({})}}),undefined);
 assert.equal(prevented,0);
 assert.equal(run('!fleet.systemPose&&!dirty'),true);
 await viewport.oncontextmenu(click);
 assert.equal(prevented,1);
 assert.equal(run(`fleet.systemPose.x===40&&fleet.systemPose.y===75&&fleet.systemId===0&&
  state.military.ships.filter(ship=>fleet.shipIds.includes(ship.id)).every(ship=>ship.ap===2)&&dirty`),true);
 await viewport.oncontextmenu({...click,clientX:10});
 assert.equal(run('fleet.systemPose.x===8'),true);
 run('systemOpen(neighbor)');
 assert.equal(run('selectedFleetIds.length'),0);
});

test('system formation projects front and rear with heading and keeps every ship at a distinct position',()=>{
 const {run}=setup();
 assert.equal(run(`(()=>{
  const hulls=['heavy_cruiser','escort','corvette','corvette','destroyer','battleship'];
  const ships=hulls.map((hullId,id)=>({id,hullId}));
  const point=(heading,id)=>systemShipFormation(ships,heading).offsets.find(p=>p.ship.id===id);
  const all=systemShipFormation(Array.from({length:50},(_,id)=>({id,hullId:'corvette'})),45).offsets;
  return point(0,0).y<point(0,5).y&&point(90,0).x>point(90,5).x&&
   new Set(all.map(p=>p.x.toFixed(4)+':'+p.y.toFixed(4))).size===all.length;
 })()`),true);
});

test('fleet formations change with composition and a reverse order follows a curve without turning in place',()=>{
 const {run}=setup();
 assert.equal(run(`(()=>{
  const type=(...hulls)=>systemFormationType(hulls.map(hullId=>({hullId})));
  if(type('corvette')!=='single'||type('corvette','destroyer')!=='echelon'||
   type('corvette','corvette','corvette','corvette')!=='wedge'||
   type('corvette','escort','escort','destroyer')!=='screen'||
   type('corvette','battleship','destroyer','heavy_cruiser')!=='screen'||
   type('corvette','corvette','destroyer','heavy_cruiser')!=='line')return false;
  const cruise=fleetCruisePath({x:50,y:35,heading:0},{x:50,y:75},1000,640);
  const start=cruise(0),first=cruise(.1),middle=cruise(.5),end=cruise(1);
  return start.y===35&&start.heading===0&&first.y<start.y&&Math.abs(middle.x-50)>1&&
   end.x===50&&end.y===75&&Math.abs(end.heading)>90;
 })()`),true);
});

test('a local corps badge selects its fleets and ordered movement keeps a common heading and spacing',async()=>{
 const {run,node}=setup(),scene=node('combatTestSystemScene');
 scene.getBoundingClientRect=()=>({left:0,top:0,width:800,height:512});
 run(`startCombatTest();combatTestSession.draft.confirmed=true;beginCombatTestPlay();
  var session=combatTestSession,g=session.game;g.ships.colony=2;openCombatTestSystem(0);
  var group=g.military.fleets.filter(f=>f.owner==='player'&&f.systemId===0&&f.corpsId!=null);`);
 const badge=scene.children.find(child=>child.className==='system-corps-control');
 assert.ok(badge);
 badge.onclick({shiftKey:false});
 assert.equal(run('group.length>=2&&group.every(f=>session.selected.has(f.id))'),true);
 await node('combatTestSystemViewport').oncontextmenu({button:2,clientX:735,clientY:410,target:{closest:()=>null},preventDefault(){}});
 assert.equal(run(`group.every(f=>f.systemPose.heading===group[0].systemPose.heading&&f.systemPose.systemId===0&&fleetAP(g,f)===2)&&
  new Set(group.map(f=>f.systemPose.x+':'+f.systemPose.y)).size===group.length&&
  group.every(f=>f.systemPose.x<=92&&f.systemPose.y<=92)`),true);
});

test('campaign warp plays charge, exit and arrival after committing only one fleet order',async()=>{
 const {run,node}=setup();
 node('planetList').getBoundingClientRect=()=>({left:0,top:0,width:1000,height:640});
 run(`reset('fleet-warp');var f=state.military.fleets[0],destination=state.stars[0].edges[0];
  state.stars[destination].nameRevealed=true;selectedFleetIds=[f.id];
  var trace=[];animateFleetMovement=()=>true;
  animateShip=async (_node,_frames,options)=>trace.push({system:sysId,duration:options.duration,busy:motionBusy});`);
 await run('commandFleetMove(destination)');
 assert.equal(run('trace.map(step=>step.system).join()===`0,0,${destination},${destination}`&&trace.every(step=>step.busy)'),true);
 assert.equal(run(`state.military.orderSerial===1&&state.military.ships.every(s=>s.systemId===destination&&s.ap===1)&&
  state.military.fleets[0].systemPose.systemId===destination&&view==='system'&&!motionBusy`),true);
 assert.equal(run(`(()=>{const pose=state.military.fleets[0].systemPose,stateAfterLoad=normalizeSavedState(JSON.parse(JSON.stringify(state)));
  return JSON.stringify(systemFleetPose(stateAfterLoad,stateAfterLoad.military.fleets[0],destination))===JSON.stringify(pose)})()`),true);
});

test('all five supplied hulls decode, align engine aft and reuse rendered headings',()=>{
 assert.deepEqual(Object.keys(militaryShipModels),readData().combat.hulls.map(hull=>hull.id));
 const MILITARY_GLB=Object.fromEntries(Object.entries(militaryShipModels).map(([id,name])=>{
  const buffer=fs.readFileSync(new URL('../assets/ships/'+name,import.meta.url));
  assert.equal(buffer.toString('ascii',0,4),'glTF');assert.equal(buffer.readUInt32LE(4),2);assert.equal(buffer.readUInt32LE(8),buffer.length);
  return [id,buffer.toString('base64')];
 }));
 const drawn=[];
 const gl=new Proxy({getShaderParameter:()=>true,getProgramParameter:()=>true,drawArrays:(_mode,_start,count)=>drawn.push(count)},{get:(target,key)=>target[key]??(()=>null)});
 const context=vm.createContext({MILITARY_GLB,SHIP_GLB:'scout',COLONY_GLB:'colony',STATION_GLB:'station',CELESTIAL_GLB:{},atob,TextDecoder,
  document:{createElement:()=>({dataset:{},setAttribute(){},toDataURL:()=> 'data:image/png;base64,AA==',getContext:type=>type==='webgl'?gl:{drawImage(){},clearRect(){}}})}});
 vm.runInContext(fs.readFileSync(new URL('../src/models.js',import.meta.url),'utf8'),context);
 assert.equal(vm.runInContext(`Object.entries(MILITARY_GLB).every(([id,encoded])=>{
  const geometry=readShipGeometry(encoded,null,true);
  const exhaust=geometry.filter(face=>face.emissive>=.99).flatMap(face=>face.points);
  return geometry.length>0&&geometry.every(face=>face.points.every(point=>point.every(Number.isFinite)))&&
   exhaust.length>0&&exhaust.every(point=>projectShipPoint(point,MILITARY_MODEL_YAW[id])[1]<0)&&
   militaryShipFrame(id,90)===militaryShipFrame(id,93)&&militaryShipImage(id,90)?.startsWith('data:image/png');
 })&&militaryShipFrame('unknown',90)===null`,context),true);
 assert.equal(drawn.length,5);
 assert.ok(drawn.every(count=>count>10000));
});

test('deterministic developer scenario is isolated and pits two attacking fleets against stacked defenders',()=>{
 const {run}=setup();
 const result=run(`(()=>{
  const before=JSON.stringify(state),balance=JSON.stringify(DATA.combat),a=createCombatTestScenario(),b=createCombatTestScenario();
  if(JSON.stringify(a)!==JSON.stringify(b))throw Error('Scenario setup differs');
  const initial=a.military.battle;
  if(initial.groups.length!==4||initial.combat.units.length!==38)throw Error('Missing fleet groups');
  for(const game of [a,b]){continueFleetBattle(game);while(game.military.battle)advanceFleetBattle(game)}
  if(JSON.stringify(a.military.lastOrder)!==JSON.stringify(b.military.lastOrder))throw Error('Outcome differs');
  return before===JSON.stringify(state)&&balance===JSON.stringify(DATA.combat);
 })()`);
 assert.equal(result,true);
});

test('combat test map enters owned and newly captured developed systems with the shared stellar and yard controls',()=>{
 const {run,node}=setup();
 const owned={dataset:{testEnter:'1'}},occupied={dataset:{testEnter:'2'}},colonyDestination={dataset:{testGo:'1'}},colony={};
 node('combatTestMap').querySelectorAll=selector=>({'[data-test-enter]':[owned,occupied],'[data-test-go]':[colonyDestination],'[data-ship="colony"]':[colony]}[selector]??[]);
 run('startCombatTest();combatTestSession.draft.confirmed=true;beginCombatTestPlay()');
 assert.match(node('combatTestMap').innerHTML,/data-test-enter="1"/);
 assert.doesNotMatch(node('combatTestMap').innerHTML,/data-test-enter="2"/);
 owned.onclick();
 assert.equal(node('combatTestMapScroll').hidden,true);
 const scene=node('combatTestSystemScene');
 assert.equal(scene.children.filter(c=>c.className==='stellar-planet hab').length,1);
 assert.ok(scene.children.some(c=>c.className==='colony-station station-model'));
 const viewport=node('combatTestSystemViewport');
 viewport.getBoundingClientRect=()=>({left:0,top:0});
 viewport.handlers.wheel({clientX:400,clientY:250,deltaY:-120,preventDefault(){}});
 assert.ok(run('combatTestSession.camera.zoom')>1);
 scene.children.find(c=>c.className==='orbital-shipyard').onclick();
 assert.match(node('modalBody').innerHTML,/title="완공 함선은 이 성계에 독립 함대로 배치됩니다\.">함선 건조/);
 node('testSystemBack').onclick();colony.onclick();
 assert.doesNotMatch(node('combatTestMap').innerHTML,/data-test-go="1"/);
 node('combatTestMove').onclick();colonyDestination.onclick();
 assert.equal(run('combatTestSession.game.ap.colony'),1.7);
 run(`{const s=combatTestSession;selectCombatTestUnits(s,[s.game.military.fleets.find(f=>f.owner==='player').id],false)}`);
 node('combatTestMove').onclick();
 run('moveCombatTestFleets(2)');
 assert.match(node('combatTestMap').innerHTML,/data-test-enter="2"/);
 occupied.onclick();
 assert.match(node('combatTestSystem').innerHTML,/AI 전선 항성계/);
 assert.equal(run(`combatTestSession.game.stars.every(s=>s.planets.length===1&&s.planets[0].type==='hab'&&s.planets[0].habData.common[0].id==='center'&&s.shipyards[0].remaining===0)&&combatTestSession.game.stars[2].owned`),true);
});

test('combat test turn settles paid-work equivalents, parallel slots, delivery and operating costs without a balance limit',()=>{
 const {run,node}=setup();
 run(`var baseline=JSON.stringify(state);startCombatTest();combatTestSession.draft.confirmed=true;beginCombatTestPlay();
  var session=combatTestSession,g=session.game,home=g.stars[0].shipyards[0];
  g.stars[1].shipyards=[];g.ships.colony=1;var yard=buildShipyard(g,1,0);
  var f=g.military.fleets[0],s=g.military.ships[0];s.hp-=20;s.shield=0;
  enqueueFleetRepair(g,f.id,0);
  var canceled=enqueueMilitaryBuild(g,0,'default_battleship',0);cancelMilitaryBuild(g,0,0,canceled.id);
  var build=enqueueMilitaryBuild(g,0,'default_corvette',0);
  nextCombatTestTurn();`);
 assert.equal(run(`g.turn===2&&yard.remaining===4&&!home.repairQueue.length&&s.hp===s.assembly.armor&&s.shield===s.assembly.shield&&g.military.fleets.length===5`),true);
 assert.equal(run(`g.testEconomy.player.production.alloy===12&&g.testEconomy.player.repair.alloy===1&&g.testEconomy.player.repair.energy===2&&g.testEconomy.player.shipyard.energy===3`),true);
 run(`var target=g.military.fleets.find(f=>f.owner==='player'&&f.shipIds.length===1);beginFleetOrder(g,[target.id],1);
  enqueueFleetReinforcements(g,target.id,'default_corvette',1,0,0);nextCombatTestTurn();`);
 assert.equal(run('g.turn===3&&g.military.reinforcements[0].arrivalTurn===4&&g.military.reinforcements[0].fleetId===target.id'),true);
 run('nextCombatTestTurn();nextCombatTestTurn();nextCombatTestTurn();showCombatTestDetails("cost")');
 assert.equal(run(`g.turn===6&&yard.remaining===0&&g.military.fleets.find(f=>f.id===target.id).shipIds.length===2&&g.military.reinforcements.length===0`),true);
 assert.equal(run(`g.testEconomy.player.production.alloy===24&&g.testEconomy.player.shipyard.energy===15&&g.testEconomy.fixture_enemy.shipyard.energy===30&&militaryUpkeep(g,'player').shipyard.energy===6&&JSON.stringify(g.res)==='{}'&&JSON.stringify(state)===baseline`),true);
 assert.match(node('modalBody').innerHTML,/>자원 소모<\/h3>/);
 assert.match(node('modalBody').innerHTML,/함선 생산·증원/);
 assert.match(node('modalBody').innerHTML,/함대 수리/);
});

test('combat test postpones due reinforcement and never settles upkeep again during an AI battle',()=>{
 const {run}=setup();
 run(`startCombatTest();combatTestSession.draft.confirmed=true;combatTestSession.draft.posture='aggressive';beginCombatTestPlay();
  var session=combatTestSession,g=session.game,[front,home]=g.military.fleets.filter(f=>f.owner==='player');
  beginFleetOrder(g,[front.id],1);enqueueFleetReinforcements(g,home.id,'default_corvette',1,0,0);
  nextCombatTestTurn();var incoming=g.military.reinforcements[0],costs=JSON.stringify(g.testEconomy);nextCombatTestTurn();`);
 assert.equal(run(`session.turnPending&&g.turn===1&&g.military.battle.decision.kind==='initial'&&incoming.arrivalTurn===2&&
  !g.military.ships.some(s=>s.id===incoming.ship.id)&&completeCombatTestTurn(session)===undefined&&JSON.stringify(g.testEconomy)===costs`),true);
 run(`continueFleetBattle(g);while(g.military.battle)advanceFleetBattle(g);resumeFleetTurn(g);completeCombatTestTurn(session);completeCombatTestTurn(session)`);
 assert.equal(run(`g.turn===2&&!session.turnPending&&g.military.fleets.find(f=>f.id===home.id).shipIds.includes(incoming.ship.id)&&JSON.stringify(g.testEconomy)===costs`),true);
});

test('test fleet display reserves capacity immediately and converts the yellow segment on arrival',()=>{
 const {run,node}=setup();
 run(`startCombatTest();combatTestSession.draft.confirmed=true;beginCombatTestPlay();
  var session=combatTestSession,g=session.game,main=g.military.fleets.find(f=>f.owner==='player');
  session.detailFleetId=main.id;showCombatTestDetails()`);
 assert.match(node('modalBody').innerHTML,/편제 규모 30 \/ 50/);
 assert.doesNotMatch(node('modalBody').innerHTML,/class="fleet-capacity-reserved"/);
 node('reinforcementSource').value='0';node('reinforcementDesign').value='default_corvette';node('reinforcementCount').value='2';
 node('openFleetReinforcement').onclick();node('reserveReinforcements').onclick();node('reinforcementBack').onclick();
 assert.match(node('modalBody').innerHTML,/편제 규모 32 \/ 50/);
 assert.match(node('modalBody').innerHTML,/class="fleet-detail-title"[^]*<\/h3><b>편제 규모 32 \/ 50<\/b><\/div><div class="fleet-capacity-bar"/);
 assert.match(node('modalBody').innerHTML,/aria-valuetext="배치 30 · 증원 2 · 한도 50"/);
 assert.match(node('modalBody').innerHTML,/class="fleet-capacity-active" style="width:60%"/);
 assert.match(node('modalBody').innerHTML,/class="fleet-capacity-reserved" style="width:4%"/);
 assert.match(node('combatTestFleets').innerHTML,/fleet-size-chip has-reinforcements[^>]*>32 \/ 50/);
 run('nextCombatTestTurn();showCombatTestDetails()');
 assert.match(node('modalBody').innerHTML,/aria-valuetext="배치 31 · 증원 1 · 한도 50"/);
 run('nextCombatTestTurn();showCombatTestDetails()');
 assert.match(node('modalBody').innerHTML,/aria-valuetext="배치 32 · 증원 0 · 한도 50"/);
 assert.doesNotMatch(node('modalBody').innerHTML,/class="fleet-capacity-reserved"/);
});

test('four-system testing setup validates fleet costs, separates faction designs and starts at the endpoints',()=>{
 const {run}=setup();
 assert.equal(run(`(()=>{
  const draft=createCombatTestDraft(),book=draft.sides.player,fleet=book.corps[0].fleets[0];
  const totals=combatTestFleetSummary(book,fleet);
  if(totals.buildCost.alloy!==350||totals.turns!==26||Math.abs(totals.upkeep.alloy-3.8)>1e-8)throw Error('Cost mismatch');
  book.shipDesigns[0].name='내 설계';fleet.entries.push({designId:'default_battleship',count:3});
 let blocked=false;try{validateCombatTestDraft(draft)}catch(e){blocked=e.message.includes('편제 규모 한도 50')}
  if(!blocked)throw Error('Over capacity');fleet.entries.pop();
  const game=createCombatTestGame(draft);
  return game.stars.map(s=>s.ownerId).join() === 'player,player,fixture_enemy,fixture_enemy'&&
   game.stars.map(s=>s.edges.join(':')).join()==='1,0:2,1:3,2'&&
   game.military.fleets.every(f=>f.systemId===(f.owner==='player'?0:3))&&
   game.military.ships.some(s=>s.owner==='player'&&s.name==='내 설계')&&
   game.military.ships.every(s=>s.owner==='player'||s.name!=='내 설계');
 })()`),true);
});

test('defensive waits at its frontier and aggressive starts the normal AI battle at player frontier',()=>{
 const {run}=setup();
 assert.equal(run(`(()=>{
  const defensive=createCombatTestGame(createCombatTestDraft());settleFleetTurn(defensive,planCombatTestAI(defensive,'defensive'));
  if(defensive.military.fleets.filter(f=>f.owner===TEST_FACTION).some(f=>f.systemId!==2)||planCombatTestAI(defensive,'defensive').length)throw Error('AI does not wait');
  const aggressive=createCombatTestGame(createCombatTestDraft()),player=aggressive.military.fleets.filter(f=>f.owner==='player').map(f=>f.id);
  beginFleetOrder(aggressive,player,1);
  const pending=settleFleetTurn(aggressive,planCombatTestAI(aggressive,'aggressive'));
  if(pending!==null||aggressive.military.battle.order.to!==1||aggressive.military.battle.groups.length!==4)throw Error('Missing joint combat');
  const battle=aggressive.military.battle;beginRetreatDecision(aggressive,player[0]);
  if(advanceFleetBattle(aggressive)!==null||battle.combat.tick!==0)throw Error('Decision did not pause');
  confirmRetreatDecision(aggressive,'warp',0);
  for(let i=0;i<40&&aggressive.military.battle;i++)advanceFleetBattle(aggressive);
  if(battle.groups.find(g=>g.id===player[0]).status!=='missing'||battle.groups.find(g=>g.id===player[1]).status!=='active')return false;
  while(aggressive.military.battle)advanceFleetBattle(aggressive);
  resumeFleetTurn(aggressive);
  const session={game:aggressive,turnPending:true,selected:new Set()};
  completeCombatTestTurn(session);completeCombatTestTurn(session);
  return aggressive.turn===2&&!session.turnPending&&aggressive.military.transits.some(t=>t.owner==='player'&&t.destination===0&&t.returnTurn===3);
 })()`),true);
});

test('main menu testing flow requires confirmation, then opens the test map without swapping campaign state',()=>{
 const {run,node}=setup();
 run('var campaign=state');
 node('combatTestMain').onclick();
 assert.match(node('combatTestMap').innerHTML,/AI 조선소/);
 assert.equal(node('combatTestStart').disabled,true);
 node('combatTestStart').onclick();assert.equal(run('combatTestSession.game'),null);
 node('combatTestDetails').onclick();assert.match(node('modalBody').innerHTML,/양측 편성 확인/);
 node('modalBody').querySelector=()=>({value:''});node('confirmCombatTest').onclick();
 assert.equal(node('combatTestStart').disabled,false);
 node('combatTestStart').onclick();
 assert.equal(run('state===campaign&&combatTestSession.game.turn===1'),true);
 node('combatTestNext').onclick();
 assert.equal(run('combatTestSession.game.turn'),2);
 node('combatTestReset').onclick();
 assert.equal(run('state===campaign&&combatTestSession.game===null&&combatTestSession.draft.confirmed'),true);
});

test('test fleet overview switches detail and data distinguishes draft costs from live upkeep',()=>{
 const {run,node}=setup();
 node('combatTestMain').onclick();
 const corps={dataset:{testCorpsFocus:run('String(combatTestSession.draft.sides.player.corps[0].id)')}};
 const focus={dataset:{testFleetFocus:run('String(combatTestSession.draft.sides.player.corps[0].fleets[1].id)')}};
 const dataTab={dataset:{testTab:'cost'}};
 const body=node('modalBody');
 body.querySelectorAll=selector=>selector==='[data-test-corps-focus]'?[corps]:selector==='[data-test-fleet-focus]'?[focus]:selector==='[data-test-tab]'?[dataTab]:[];
 body.querySelector=()=>null;
 node('combatTestDetails').onclick();
 assert.match(body.innerHTML,/class="fleet-workspace"/);
 assert.match(body.innerHTML,/fleet-dialog-shell/);
 assert.match(body.innerHTML,/군단 및 독립 함대/);
 assert.match(body.innerHTML,/군단 또는 함대 선택/);
 assert.doesNotMatch(body.innerHTML,/data-test-fleet-focus|fleet-composition/);
 assert.match(body.innerHTML,/data-test-corps-focus[^>]*aria-expanded="false"/);
 assert.match(body.innerHTML,/assets\/icons\/corps-badge\.svg/);
 assert.match(body.innerHTML,/>데이터<\/button>/);
 corps.onclick();
 assert.match(body.innerHTML,/소속 함대 2개/);
 const [list,detail]=body.innerHTML.split('class="fleet-workspace-detail"');
 assert.match(list,/fleet-tree-children[\s\S]+data-test-fleet-focus[^>]*>[\s\S]+플레이어 주력 함대/);
 assert.doesNotMatch(detail,/data-test-fleet-focus/);
 corps.onclick();
 assert.match(body.innerHTML,/data-test-corps-focus[^>]*aria-expanded="false"/);
 assert.doesNotMatch(body.innerHTML,/data-test-fleet-focus/);
 corps.onclick();
 assert.doesNotMatch(body.innerHTML,/fleet-composition/);
 focus.onclick();
 assert.match(body.innerHTML,/data-test-corps-focus[^>]*aria-expanded="true"/);
 assert.match(body.innerHTML,/data-test-fleet-name[^>]*value="플레이어 경계 함대"/);
 assert.match(body.innerHTML,/구축함<\/strong><b>3척/);
 const hullCard=body.innerHTML.match(/<article class="fleet-hull-card">[^]*?구축함[^]*?<\/article>/)?.[0];
 assert.match(hullCard,/data-test-edit="decrement"/);
 assert.match(hullCard,/data-test-edit="increment"/);
 assert.match(hullCard,/보호막[\s\S]+장갑/);
 dataTab.onclick();
 assert.match(body.innerHTML,/fleet-dialog-shell/);
 assert.match(body.innerHTML,/편성 함선<\/small><b>19척/);
 const projected=body.innerHTML.match(/턴당 예상 유지비<\/small><b>(.*?)<\/b>/)?.[1];
 assert.match(projected,/icons\/alloy\.svg[^>]+alt="신소재">6\.1</);
 assert.match(body.innerHTML,/건조 턴/);
 run(`combatTestSession.draft.confirmed=true;beginCombatTestPlay();
  const {military}=combatTestSession.game;
  const lost=military.ships.shift(),fleet=military.fleets.find(f=>f.shipIds.includes(lost.id));
  fleet.shipIds=fleet.shipIds.filter(id=>id!==lost.id);showCombatTestDetails('cost')`);
 assert.match(body.innerHTML,/생존 함선<\/small><b>18척/);
 const upkeep=body.innerHTML.match(/턴당 현재 유지비<\/small><b>(.*?)<\/b>/)?.[1];
 const buildCost=body.innerHTML.match(/플레이어 주력 함대 합계<\/th><td>(.*?)<\/td><td>26<\/td>/)?.[1];
 assert.match(upkeep,/icons\/alloy\.svg[^>]+alt="신소재">5\.3</);
 assert.match(buildCost,/icons\/alloy\.svg[^>]+alt="신소재">350</);
 run(`{const fleet=combatTestSession.game.military.fleets.find(f=>f.owner==='player');
  const ship=military.ships.find(s=>s.id===fleet.shipIds[0]);ship.hp=11;ship.shield=3;
  combatTestSession.detailFleetId=fleet.id;showCombatTestDetails()}`);
 assert.match(body.innerHTML,/보호막<\/small><b>3\.0 \/ 300\.0/);
 assert.match(body.innerHTML,/장갑<\/small><b>11\.0 \/ 380\.0/);
 assert.doesNotMatch(body.innerHTML,/assets\/icons\/hulls\/destroyer\.svg/);
});

test('resource icons preserve zero and pending upkeep, with named alternatives and a text fallback',()=>{
 const {run}=setup();
 const html=run("resourceAmountsMarkup({energy:0,mineral:null,alloy:0.125,'<unknown>':3})");
 assert.match(html,/icons\/energy\.svg[^>]+alt="에너지">0</);
 assert.match(html,/icons\/mineral\.svg[^>]+alt="광물">미정</);
 assert.match(html,/icons\/alloy\.svg[^>]+alt="신소재">0\.125</);
 assert.match(html,/&lt;unknown&gt; 3/);
 assert.equal(run('resourceAmountsMarkup({})'),'없음');
});

test('test workspace creates an independent fleet and carries it into deployment after assigning ships',()=>{
 const {run,node}=setup();
 node('combatTestMain').onclick();
 const create={dataset:{testEdit:'add-fleet'}},add={dataset:{testEdit:'add-ship',corps:''}};
 const step={dataset:{testEdit:'increment',corps:'',entry:'0'}};
 const body=node('modalBody');
 body.querySelectorAll=selector=>selector==='[data-test-edit]'?[create,add,step]:[];
 body.querySelector=selector=>selector.startsWith('[data-test-design=')?{value:'default_corvette'}:null;
 node('combatTestDetails').onclick();
 create.onclick();
 add.dataset.fleet=run('combatTestSession.detailFleetId');
 assert.match(body.innerHTML,/data-test-fleet-name[^>]*value="새 함대"/);
 assert.match(body.innerHTML,/data-test-fleet-focus[^>]*>[^]*?<b>새 함대/);
 assert.throws(()=>run('validateCombatTestDraft(combatTestSession.draft)'),/새 함대/);
 add.onclick();
 assert.match(body.innerHTML,/초계함<\/strong><b>1척/);
 step.dataset.fleet=add.dataset.fleet;
 step.onclick();assert.match(body.innerHTML,/초계함<\/strong><b>2척/);
 step.dataset.testEdit='decrement';step.onclick();assert.match(body.innerHTML,/초계함<\/strong><b>1척/);
 node('confirmCombatTest').onclick();node('combatTestStart').onclick();
 assert.equal(run(`combatTestSession.game.military.fleets.some(f=>f.name==='새 함대'&&f.corpsId===null&&f.systemId===0&&f.shipIds.length===1)`),true);
});

test('test galaxy shows co-located corps, splits fleets across systems and omits missing ships',()=>{
 const {run,node}=setup();
 run(`combatTestSession={draft:createCombatTestDraft(),owner:'player',game:null,selected:new Set(),turnPending:false};renderCombatTest()`);
 assert.equal((node('combatTestMap').innerHTML.match(/class="system-emblem"/g)||[]).length,4);
 assert.equal((node('combatTestMap').innerHTML.match(/<line /g)||[]).length,3);
 assert.equal((node('combatTestMap').innerHTML.match(/test-formation corps/g)||[]).length,2);
 run(`combatTestSession.draft.confirmed=true;beginCombatTestPlay();
  var moving=combatTestSession.game.military.fleets.find(f=>f.owner==='player');beginFleetOrder(combatTestSession.game,[moving.id],1);renderCombatTest()`);
 assert.equal((node('combatTestMap').innerHTML.match(/test-formation fleet/g)||[]).length,2);
 assert.equal((node('combatTestMap').innerHTML.match(/test-formation corps/g)||[]).length,1);
 assert.equal(run(`testMapFormationMarkers([{id:'missing',owner:'player',count:2,systemId:null}]).length`),0);
});

test('normal click replaces selection and Shift toggles fleet and corps selection across map and sidebar',()=>{
 const {run,node}=setup();
 const marker={dataset:{testFormation:''}};
 const sidebarButton={dataset:{testSelect:''}};
 node('combatTestMap').querySelectorAll=selector=>selector==='[data-test-formation]'?[marker]:[];
 node('combatTestFleets').querySelectorAll=selector=>selector==='[data-test-select]'?[sidebarButton]:[];
 run(`combatTestSession={draft:createCombatTestDraft(),owner:'player',game:null,selected:new Set(),turnPending:false};
  combatTestSession.draft.sides.player.corps.push({id:40,name:'별도 편성',fleets:[{id:41,name:'예비 함대',entries:[{designId:'default_corvette',count:1}]}]});
  combatTestSession.draft.confirmed=true;beginCombatTestPlay()`);
 marker.dataset.testFormation=run(`combatTestSession.game.military.fleets.filter(f=>f.owner==='player').slice(0,2).map(f=>f.id).join(',')`);
 sidebarButton.dataset.testSelect=run(`combatTestSession.game.military.fleets.find(f=>f.corpsId===40).id`);
 marker.onkeydown({key:'Enter',preventDefault(){}});
 assert.equal(run('combatTestSession.selected.size'),2);
 assert.doesNotMatch(node('combatTestMap').innerHTML,/data-test-go="1"/);
 node('combatTestMove').onclick();
 assert.match(node('combatTestMap').innerHTML,/data-test-go="1"/);
 sidebarButton.onclick({ctrlKey:true});
 assert.equal(run('combatTestSession.selected.size'),3);
 assert.doesNotMatch(node('combatTestMap').innerHTML,/data-test-go="1"/);
 marker.onclick({shiftKey:true});
 assert.equal(run('combatTestSession.selected.size'),1);
 marker.onclick({shiftKey:false});
 assert.equal(run('combatTestSession.selected.size'),2);
 sidebarButton.onclick({shiftKey:false});
 assert.equal(run('combatTestSession.selected.size'),1);
 sidebarButton.onclick({shiftKey:true});
 assert.equal(run('combatTestSession.selected.size'),0);
});

test('canvas draws the fixed-tick movement/fire snapshot without changing combat state',()=>{
 const {run,context,node}=setup();
 const calls=[];
 node('battleCanvas').width=900;node('battleCanvas').height=300;
 node('battleCanvas').getContext=()=>new Proxy({}, {get:(target,key)=>(...params)=>calls.push([key,params,target.fillStyle])});
 context.matchMedia=()=>({matches:true});
 run(`var fixture=createCombatTestScenario();continueFleetBattle(fixture);
 var combat=fixture.military.battle.combat;
 while(!combat.events.length)advanceFleetBattle(fixture);
 militaryShipFrame=(hullId,heading)=>['corvette','escort'].includes(hullId)?{hullId,heading}:null;
 var before=JSON.stringify(combat);paintFleetBattleScene(combat,battleSceneSnapshot(combat));`);
 assert.ok(calls.some(([name])=>name==='translate'));
 assert.ok(calls.some(([name])=>name==='arc'));
 assert.ok(!calls.some(([name,,color])=>name==='fillRect'&&color==='#b48bf3'));
 run('zoomBattleCamera(battleCameras.get(combat),2);paintFleetBattleScene(combat,battleSceneSnapshot(combat))');
 assert.ok(calls.some(([name,,color])=>name==='fillRect'&&color==='#b48bf3'));
 assert.ok(calls.some(([name,,color])=>name==='fillRect'&&color==='#f0a263'));
 for(const hull of ['corvette','escort'])assert.ok(calls.some(([name,[frame]])=>name==='drawImage'&&frame.hullId===hull&&Number.isFinite(frame.heading)));
 assert.equal(run('JSON.stringify(combat)===before'),true);
});

test('wheel zoom anchors at the cursor, redraws paused battles and survives canvas replacement',()=>{
 const {run,context,node}=setup();
 const canvas=node('battleCanvas');
 const drawCalls=[];
 canvas.width=1200;canvas.height=600;
 canvas.getContext=()=>new Proxy({}, {get:(_target,key)=>(...params)=>drawCalls.push([key,params])});
 canvas.getBoundingClientRect=()=>({left:100,top:50,width:1200,height:600});
 canvas.addEventListener=function(type,handler){this[type]=handler};
 context.matchMedia=()=>({matches:true});
 run(`var cameraFixture=createCombatTestScenario(),zoomCombat=cameraFixture.military.battle.combat;
  var pristine=JSON.stringify(zoomCombat);paintFleetBattleScene(zoomCombat,null,true)`);
 const callsBefore=drawCalls.length;
 let prevented=false;
 canvas.wheel({deltaY:-100,deltaMode:0,clientX:1000,clientY:200,preventDefault(){prevented=true}});
 assert.equal(prevented,true);
 assert.ok(drawCalls.length>callsBefore);
 assert.ok(run(`(()=>{const c=battleCameras.get(zoomCombat);return c.zoom>1&&Math.abs(c.x+.25/c.zoom-.75)<1e-9&&Math.abs(c.y-.25/c.zoom-.25)<1e-9})()`));
 const replacement={...canvas};delete replacement.wheel;
 context.document.getElementById=id=>id==='battleCanvas'?replacement:node(id);
 run('paintFleetBattleScene(zoomCombat,null,true)');
 assert.equal(typeof replacement.wheel,'function');
 assert.ok(run('battleCameras.get(zoomCombat).zoom>1'));
 node('battleZoomReset').onclick();
 assert.ok(run('battleCameras.get(zoomCombat).zoom===1&&JSON.stringify(zoomCombat)===pristine'));
});

test('real five-slot handlers roundtrip a mid-battle save and migrate an older slot',()=>{
 const {run,slots}=setup();
 run(`var old=generate('legacy-slot');old.ap.explorer=.3;old.res.alloy=77;
 setSlots([{state:old,savedAt:'fixture',turn:old.turn},null,null,null,null]);
 var live=state;
 live.research.completed.push('mil_hull_escort','mil_energy_t2');
 var design=JSON.parse(JSON.stringify(live.shipDesigns[0]));design.id='test_custom';design.name='저장 시험';design.slots.weapon[0]='corvette_energy_t2';
 saveShipDesign(live,design);enqueueMilitaryBuild(live,0,design.id);settleShipyards(live);
 var fighter=live.military.ships[0];fighter.hp-=5;fighter.shield-=2;fighter.ap=1.7;
 var fleet=live.military.fleets[0];renameFleet(live,fleet.id,'저장 함대');
 enqueueMilitaryBuild(live,0,'default_corvette');settleShipyards(live);
 var wing=live.military.fleets[1];renameFleet(live,wing.id,'지원 함대');
 enqueueFleetReinforcements(live,fleet.id,'default_corvette',1,0);settleShipyards(live);
 enqueueMilitaryBuild(live,0,'default_escort');
 var to=live.neighbor;live.stars[to].nameRevealed=true;
 var enemy=createCombatUnit('fixture_hostile','heavy_cruiser','hostile',0);
 live.military.ships.push({id:enemy.id,name:'적',owner:'hostile',systemId:to,hullId:enemy.hullId,assembly:enemy.assembly,ap:2,hp:enemy.hp,shield:enemy.shield});
 setMilitaryHostility(live,'player','hostile',true);
 // One paid ship is already missing when the recorded battle begins.
 var missing={...fighter,id:'prior_warp',systemId:null,status:'missing',hp:12,shield:3,ap:.7};
 live.military.ships.push(missing);live.military.transits.push({owner:'player',fleetId:null,shipIds:[missing.id],origin:to,destination:0,returnTurn:3});
 beginFleetOrder(live,[fleet.id,wing.id],to);beginRetreatDecision(live,fleet.id);confirmRetreatDecision(live,'warp',0);advanceFleetBattle(live);beginRetreatDecision(live,wing.id);
 var expected=JSON.stringify({military:live.military,designs:live.shipDesigns,queue:live.stars[0].shipyards[0].productionQueue,resources:live.res});
 showSlots('save');`);
 slots[4].onclick();
 assert.equal(run('getSlots().length'),5);
 run("showSlots('load')");slots[0].onclick();
 assert.equal(run(`(()=>{const home=state.stars[0],yard=home.shipyards[0];
  return state.ap.explorer===.3&&state.res.alloy===77&&home.shipyards.length===1&&home.planets[yard.planetIndex].type==='hab'&&yard.remaining===0&&state.military.ships.length===0;
 })()`),true);
 run("showSlots('load')");slots[4].onclick();
 assert.equal(run('JSON.stringify({military:state.military,designs:state.shipDesigns,queue:state.stars[0].shipyards[0].productionQueue,resources:state.res})===expected'),true);
 assert.equal(run("militaryModuleUnlocked(state,'corvette_energy_t2')&&state.military.battle.groups[0].status==='retreating'"),true);
 run('cancelRetreatDecision(state);while(state.military.battle)advanceFleetBattle(state);state.turn=3;returnWarpFleets(state)');
 assert.equal(run("state.military.transits.length===0&&state.military.ships.find(s=>s.id==='prior_warp').hp===12"),true);
});

test('encounter unlock and screen restore preserve camera and surviving selections',()=>{
 const {run,branches}=setup();
 run(`view='system';sysId=0;selected=0;scale=1.7;panX=-80;panY=12;systemCamera={id:0,zoom:1.5,x:7,y:-11};activeShip='explorer';
 rememberEncounterView();lockEncounterUI(true);view='galaxy';scale=1;panX=0;systemCamera={id:null,zoom:1,x:0,y:0};activeShip=null;`);
 assert.ok(branches.every(el=>el.inert));
 run('restoreEncounterView();closeDialog()');
 assert.ok(branches.every(el=>!el.inert));
 assert.equal(run("view==='system'&&sysId===0&&scale===1.7&&panX===-80&&systemCamera.zoom===1.5&&systemCamera.x===7&&activeShip==='explorer'"),true);
});

test('player and AI deliveries at the turn boundary wait for the whole AI battle',()=>{
 const {run}=setup();
 run(`var draft=createCombatTestDraft(),game=createCombatTestGame(draft);game.records=[];state=game;
  var friendly=game.military.fleets.find(f=>f.owner==='player'),enemy=game.military.fleets.find(f=>f.owner===TEST_FACTION);
  beginFleetOrder(game,[friendly.id],1);
  var corvette=draft.sides.player.shipDesigns.find(d=>d.hullId==='corvette');
  var spec={kind:'build',name:corvette.name,hullId:corvette.hullId,designId:corvette.id,assembly:assembleShipDesign(corvette),total:1};
  queueShipyardJob(game,game.stars[0].shipyards[0].productionQueue,{...spec,fleetId:friendly.id});
  queueShipyardJob(game,game.stars[3].shipyards[0].productionQueue,{...spec,fleetId:enemy.id,owner:TEST_FACTION});
  settleShipyards(game);game.turn=2;game.military.pendingTurnMessages=[];
  var deliveries=game.military.reinforcements.map(order=>order.ship.id);
  var waiting=settleFleetTurn(game,[{owner:TEST_FACTION,fleetIds:[enemy.id],to:1}]);
  finishStrategicTurn();`);
 assert.equal(run('waiting===null&&game.turn===2&&game.military.battle.combat.units.every(unit=>!deliveries.includes(unit.id))'),true);
 assert.equal(run('deliverFleetReinforcements(game).length===0&&game.military.reinforcements.length===2'),true);
 run('continueFleetBattle(game);while(game.military.battle)advanceFleetBattle(game);resumeFleetTurn(game);finishStrategicTurn()');
 assert.equal(run('game.turn'),3);
 assert.equal(run('game.military.phase'),'player');
 assert.equal(run('game.military.reinforcements.length'),0);
 assert.equal(run(`deliveries.every(id=>{
  const ship=game.military.ships.find(s=>s.id===id);
  const fleet=game.military.fleets.find(f=>f.id===(ship?.owner==='player'?friendly.id:enemy.id));
  return !!ship&&ship.owner===fleet?.owner&&ship.systemId===fleet.systemId&&fleet.shipIds.includes(id);
 })`),true);
});

test('shortages maintain independent streaks, refresh each turn and survive save normalization',()=>{
 const {run}=setup();
 assert.equal(run(`(()=>{
  const shortage=new Set(['energy','mineral','food','consumer','alloy','research']);
  const all=()=>advanceResourceShortages(state,shortage);
  for(let i=1;i<=3;i++){
   all();
   if(Object.keys(state.shortages).length!==5||Object.values(state.shortages).some(s=>s.consecutive!==i||s.remaining!==0))return false;
  }
  if(shortageEffects(state).energyConsumption!==undefined)return false;
  for(let i=4;i<=6;i++){
   all();
   if(Object.values(state.shortages).some(s=>s.consecutive!==i||s.remaining!==3))return false;
  }
  state=normalizeSavedState(JSON.parse(JSON.stringify(state)));
  if(shortageEffects(state).shipCombat!==.25||state.shortages.energy.remaining!==3)return false;
  advanceResourceShortages(state,new Set(['food']));
  if(state.shortages.energy.consecutive!==0||state.shortages.energy.remaining!==2||state.shortages.food.remaining!==3)return false;
  advanceResourceShortages(state,new Set(['energy']));
  if(state.shortages.energy.consecutive!==1||state.shortages.energy.remaining!==1||state.shortages.food.remaining!==2)return false;
  advanceResourceShortages(state,new Set());
  if(state.shortages.energy||state.shortages.food.consecutive!==0||state.shortages.food.remaining!==1)return false;
  advanceResourceShortages(state,new Set());
  return Object.keys(state.shortages).length===0;
 })()`),true);
});

test('campaign gateways are seeded, preserve old planets, and occupy the colony ship through actual turn settlement',()=>{
 const {run,node}=setup();
 assert.deepEqual(JSON.parse(run(`JSON.stringify(Array.from({length:10},(_,index)=>{
  const a=generate('gateways-'+index),b=generate('gateways-'+index);
  const sites=a.stars.filter(s=>s.gatewaySite);
  return sites.length===8&&sites.every(s=>s.id!==0&&s.planets.length<=5&&s.planets.some(p=>p.type==='hab'))&&
   sites.map(s=>s.id).join()===b.stars.filter(s=>s.gatewaySite).map(s=>s.id).join();
 }))`)),Array(10).fill(true));
 assert.equal(run(`(()=>{
  const legacy=generate('legacy-gateways');
  const before=JSON.stringify(legacy.stars.map(s=>s.planets));
  delete legacy.gatewaySitesVersion;
  for(const s of legacy.stars)delete s.gatewaySite;
  initializeGatewaySites(legacy,true);
  legacy.research={completed:['exp_4_2']};
  initializeResearch(legacy);
  return legacy.stars.filter(s=>s.gatewaySite).length===8&&
   JSON.stringify(legacy.stars.map(s=>s.planets))===before&&gatewayResearchComplete(legacy,'player');
 })()`),true);
 run(`reset('gateway-job');var site=state.stars.find(s=>s.gatewaySite);site.owned=site.surveyed=true;
  state.ships.colony=site.id;var target=site.edges[0];state.stars[target].owned=true;
  site.blackholeTo=target;var rule=DATA.balance.gateways;`);
 run('showGateway(site.id)');
 assert.match(node('modalBody').innerHTML,/id="buildGateway" disabled/);
 assert.match(node('modalBody').innerHTML,/orbital-requirement unmet">관문 공학/);
 assert.match(node('modalBody').innerHTML,/orbital-requirement unmet">같은 행성 · 인구 6 · 공용 구역 Lv\.3/);
 assert.throws(()=>run('buildGateway(state,site.id)'),/관문 공학 연구 필요/);
 run(`initializeResearch(state).completed.push(rule.researchId);var settlement=habitat(site.planets.find(p=>p.type==='hab'))`);
 assert.throws(()=>run('buildGateway(state,site.id)'),/인구 6 · 공용 구역 Lv.3 필요/);
 run(`settlement.pop=6;settlement.commonLevel=3;buildGateway(state,site.id)`);
 assert.equal(run(`state.res.alloy===100-rule.constructionCost.alloy&&state.res.mineral===100-rule.constructionCost.mineral&&
  !moveShip('colony',target)&&!blackholeJump('colony')&&!performAction('colony')&&resourceDetails().energy.consumption.gateway===0`),true);
 assert.match(run('shipyardConstructionBlock(state,site.id,site.planets.findIndex(p=>p.type==="hab"))'),/관문 건설 중/);
 run(`var saved=JSON.parse(JSON.stringify(state));state=normalizeSavedState(saved);site=state.stars[site.id];`);
 assert.equal(run('site.gateway.remaining===rule.constructionTurns&&colonyBuildingGateway(state)'),true);
 run(`for(let i=0;i<rule.constructionTurns;i++){
  if(!researchState().current)startResearch(DATA.research.technologies.find(t=>researchAvailable(t.id)).id);
  nextTurn();
 }`);
 assert.equal(run(`gatewayOperational(site,'player')&&!colonyBuildingGateway(state)&&state.ships.colony===site.id&&
  resourceDetails().energy.consumption.gateway===rule.upkeep.energy`),true);
});

test('gateway jumps bypass territorial routes, cost one action point per ship, and support both sides',()=>{
 const {run}=setup();
 run(`reset('gateway-jump');var [origin,destination,enemy]=state.stars.filter(s=>s.gatewaySite);
  for(const s of [origin,destination,enemy])s.gateway={remaining:0,total:8};
  origin.owned=destination.owned=true;enemy.ownerId='ai';
  origin.edges=[];destination.edges=[];enemy.edges=[];
  state.ships.explorer=state.ships.colony=origin.id;$('quickMove').checked=true;`);
 assert.equal(run(`!canJumpCivilianGateway(state,'explorer',enemy.id)&&jumpCivilianGateway('explorer',destination.id)&&
  jumpCivilianGateway('colony',destination.id)&&state.ap.explorer===1&&state.ap.colony===1`),true);
 run(`var fleet=state.military.fleets[0], units=state.military.ships;
  fleet.systemId=origin.id;for(const ship of units)ship.systemId=origin.id;`);
 assert.throws(()=>run("beginFleetOrder(state,[fleet.id],enemy.id,'player',true)"),/도달할 수 있는/);
 assert.equal(run(`beginFleetOrder(state,[fleet.id],destination.id,'player',true).routes[0].cost===1&&
  state.military.ships.every(s=>s.systemId===destination.id&&s.ap===1)`),true);
 run(`fleet=state.military.fleets[0];fleet.owner='ai';destination.owned=false;destination.ownerId='ai';
  for(const ship of state.military.ships)ship.owner='ai';state.military.phase='ai';`);
 assert.equal(run(`beginFleetOrder(state,[fleet.id],enemy.id,'ai',true).routes[0].cost===1&&
  state.military.ships.every(s=>s.systemId===enemy.id&&s.ap===0)`),true);
});

test('gateway capture preserves infrastructure and updates victory only for operational ownership and consecutive turns',()=>{
 const {run}=setup();
 run(`reset('gateway-victory');var sites=state.stars.filter(s=>s.gatewaySite).slice(0,4);
  for(const s of sites){s.owned=true;s.gateway={remaining:0,total:8};s.edges=[]}
  var lost=sites[0];setMilitaryHostility(state,'player','ai',true);
  refreshGatewayVictory(state,true);var tech=DATA.balance.gateways.researchId;`);
 assert.equal(run("gatewayProgress(state,'player').turns"),0);
 assert.equal(run(`state.research.completed.push(tech);
  for(let i=0;i<3;i++){state.turn++;refreshGatewayVictory(state,true);refreshGatewayVictory(state,true)}
  gatewayProgress(state,'player').turns`),3);
 assert.equal(run(`captureUndefendedSystem(state,lost.id,'ai');
  gatewayProgress(state,'player').turns===0&&gatewayProgress(state,'player').count===3&&gatewayOperational(lost,'ai')`),true);
 assert.equal(run(`captureUndefendedSystem(state,lost.id,'player');
  for(let i=0;i<7;i++){state.turn++;refreshGatewayVictory(state,true)}
  gatewayProgress(state,'player').turns===7&&!state.prosperity.winner`),true);
 assert.equal(run(`state=normalizeSavedState(JSON.parse(JSON.stringify(state)));
  var victoryTab,showVictoryOverview=tab=>{victoryTab=tab};state.military.pendingTurnMessages=[];
  finishStrategicTurn();finishStrategicTurn();
  state.prosperity.winner.owner==='player'&&state.prosperity.winner.turn===state.turn&&victoryTab==='prosperity'`),true);
});

test('planet labels reveal the type only after surveying',()=>{
 const {run,node}=setup();
 run(`var fixture={id:5,name:'시험 성계',owned:false,surveyed:false,planets:[{type:'gas',label:'숨겨진 이름',level:0}]};
  drawStellarScene($('fixtureScene'),fixture)`);
 const planet=node('fixtureScene').children.find(child=>child.dataset.planetIndex==='0');
 assert.equal(planet.children[1].children[0].textContent,'미확인 행성');
 assert.equal(planet.children[1].children.length,1);
 assert.equal(planet.title,'미탐사');
 run(`fixture.planets[0].scanned=true;drawStellarScene($('fixtureScene'),fixture)`);
 const surveyed=node('fixtureScene').children.find(child=>child.dataset.planetIndex==='0');
 assert.equal(surveyed.children[1].children[0].textContent,'가스 행성');
});

test('signal research reveals only the additional seeded band and keeps saved signals and events',()=>{
 const {run}=setup();
 run(`reset('signal-upgrade');
  var planned=JSON.stringify(state.explorationPlan),base=state.stars.filter(s=>explorationSignalTarget(s)).map(s=>s.id);
  var extra=state.stars.filter(s=>s.explorationSignal?.requiresResearch);
  var originalSignals=JSON.stringify(state.stars.map(s=>s.explorationSignal));`);
 assert.equal(run(`base.length>0&&extra.length>0&&extra.every(s=>{
  const roll=rng(seedHash(state.seed+':pre-signal-v1:'+s.id))();
  return roll>=.25&&roll<.35&&!explorationSignalTarget(s);
 })`),true);
 run(`state.research.completed.push('sci_2_2');var upgraded=state.stars.filter(s=>explorationSignalTarget(s)).map(s=>s.id)`);
 assert.equal(run(`upgraded.length===base.length+extra.length&&base.every(id=>upgraded.includes(id))&&
  JSON.stringify(state.explorationPlan)===planned&&JSON.stringify(state.stars.map(s=>s.explorationSignal))===originalSignals`),true);
 run(`state.signalVersion=1;for(const s of extra)s.explorationSignal=null;
  state=normalizeSavedState(JSON.parse(JSON.stringify(state)))`);
 assert.equal(run(`state.signalVersion===2&&JSON.stringify(state.stars.filter(s=>explorationSignalTarget(s)).map(s=>s.id))===JSON.stringify(upgraded)`),true);
 assert.equal(run(`var s=state.stars[extra[0].id];s.planets[s.explorationSignal.planetIndex].scanned=true;explorationSignalTarget(s)`),null);
});

test('ordinary surveys use a notice while anomaly results wait for explicit acknowledgement',async()=>{
 const {run,node}=setup();
 node('overlay').classList.contains=()=>true;
 run(`reset('survey-feedback');gameActive=true;moveWithinSystem=async()=>{};pumpExploration=realPumpExploration;
  var surveyed=state.stars.find(s=>s.id!==0&&s.planets.some(p=>p.type==='mineral'));
  var target=surveyed.planets.find(p=>p.type==='mineral'),planetIndex=surveyed.planets.indexOf(target);
  state.ships.explorer=surveyed.id;surveyed.explorationEvent={type:'normal',status:'assigned'};`);
 await run(`surveyObject('explorer',surveyed,target,{x:50,y:50})`);
 assert.match(node('explorationNotice').textContent,/탐사 완료/);
 assert.equal(run('state.ap.explorer'),1);
 assert.equal(run('modalKind'),null);
 run(`target.scanned=false;surveyed.explorationEvent={type:'anomaly',status:'assigned',planetIndex,eventId:'dense_vein'}`);
 await run(`surveyObject('explorer',surveyed,target,{x:50,y:50})`);
 assert.match(node('modalTitle').textContent,/초고밀도 광맥/);
 assert.match(node('modalBody').innerHTML,/보상 획득/);
 assert.equal(run("modalKind==='anomaly-result'&&target.explorationEffects.productionBonus===.1&&!resolveExploration(surveyed,0)"),true);
 run(`dismissModal();state=normalizeSavedState(JSON.parse(JSON.stringify(state)));
  surveyed=state.stars[surveyed.id];target=surveyed.planets[planetIndex];pumpExploration()`);
 assert.equal(run("modalKind==='anomaly-result'&&surveyed.explorationEvent.awaitingAcknowledgement"),true);
 node('anomalyConfirm').onclick();
 assert.equal(run("modalKind===null&&!surveyed.explorationEvent.awaitingAcknowledgement&&target.explorationEffects.productionBonus===.1"),true);
 const body=node('modalBody'),option=node('anomalyChoiceFixture');
 option.dataset.explorationChoice='0';
 body.querySelectorAll=selector=>selector==='[data-exploration-choice]'?[option]:[];
 run(`target.scanned=false;state.ap.explorer=1;
  surveyed.explorationEvent={type:'anomaly',status:'assigned',planetIndex,eventId:DATA.exploration.events.find(e=>e.planet==='mineral'&&e.options.length===2).id}`);
 await run(`surveyObject('explorer',surveyed,target,{x:50,y:50})`);
 assert.equal(run('modalKind'),'exploration');
 assert.equal((node('modalBody').innerHTML.match(/data-exploration-choice=/g)||[]).length,2);
 option.onclick();
 assert.equal(run('modalKind'),'anomaly-result');
 assert.match(body.innerHTML,/anomaly-rewards/);
});

test('expanded anomalies preserve existing slots and enforce seeded limits over one hundred maps',()=>{
 const {run}=setup();
 const result=run(`(()=>{
  let hostileTotal=0,hostileMaps=0,destructions=0;
  for(let seed=0;seed<100;seed++){
   const game=generate('anomaly-phase2-'+seed),baseline=explorationPlan(game,false),plan=explorationPlan(game);
   const slots=Object.values(plan).filter(event=>event.type==='anomaly');
   const added=slots.filter(event=>event.eventId.startsWith('AN_'));
   const hostiles=added.filter(event=>anomalyDefinition(event.eventId).group==='hostile');
   const losses=added.filter(event=>anomalyDefinition(event.eventId).group==='destruction').length;
   if(slots.length!==60||added.length!==15||hostiles.length>2||losses>1||JSON.stringify(plan)!==JSON.stringify(explorationPlan(game)))return false;
   for(const star of game.stars){
    const event=plan[star.id],old=baseline[star.id];
    if(event.type!==old.type||event.planetIndex!==old.planetIndex)return false;
    if(event.type!=='anomaly')continue;
    const definition=anomalyDefinition(event.eventId);
    if(definition.planet!==star.planets[event.planetIndex].type||definition.planet==='barren'&&definition.tone==='negative')return false;
    if(['hostile','destruction'].includes(definition.group)&&(star.id===0||star.id===game.neighbor))return false;
   }
   hostileTotal+=hostiles.length;hostileMaps+=Number(hostiles.length>0);destructions+=losses;
  }
  return JSON.stringify({hostileTotal,hostileMaps,destructions});
 })()`);
 assert.ok(result);
 assert.ok(JSON.parse(result).hostileTotal>0);
 assert.ok(JSON.parse(result).destructions>0);
 console.log('Expanded anomalies, 100 seeds:',result);
});

test('fixed resource penalties clamp at zero and a scout is disabled for the next full turn only',()=>{
 const {run}=setup();
 run(`reset('anomaly-penalty');var site=state.stars.find(s=>s.id!==0&&s.planets.some(p=>p.type==='gas'));
  var planetIndex=site.planets.findIndex(p=>p.type==='gas');
  var event=id=>({type:'anomaly',status:'pending',planetIndex,eventId:id,ship:'explorer'});
  state.res.energy=3;state.ap.explorer=1;state.ships.explorer=site.id;
  site.explorationEvent=event('AN_N01');`);
 assert.equal(run('resolveExploration(site,0)&&state.res.energy===0&&!resolveExploration(site,0)'),true);
 run(`site.explorationEvent=event('AN_N03');resolveExploration(site,0)`);
 assert.equal(run('state.ap.explorer'),1);
 run(`state=normalizeSavedState(JSON.parse(JSON.stringify(state)));state.military.pendingTurnMessages=[];finishStrategicTurn()`);
 assert.equal(run('state.ap.explorer'),0);
 run(`state.military.pendingTurnMessages=[];finishStrategicTurn()`);
 assert.equal(run('state.ap.explorer'),2);
});

test('clue rewards expose only planet counts and use the specified fallback when no target exists',()=>{
 const {run}=setup();
 run(`reset('anomaly-clue');var site=state.stars.find(s=>s.id!==0&&s.planets.some(p=>p.type==='barren'));
  var index=site.planets.findIndex(p=>p.type==='barren');
  var pending=id=>({type:'anomaly',status:'pending',planetIndex:index,eventId:id,ship:'explorer'});
  revealScoutArrival(state,site.id);
  var to=anomalyClueTargets(site)[0];site.explorationEvent=pending('unusual_rocks');`);
 assert.equal(run('Number.isInteger(to)&&!resolveExploration(site,1)&&resolveExploration(site,1,site.explorationEvent,to)'),true);
 assert.equal(run(`Object.values(state.stars[to].explorationClue.counts).reduce((sum,n)=>sum+n,0)===state.stars[to].planets.length&&
  !systemExplored(to)&&!state.stars[to].surveyed`),true);
 run(`for(const star of state.stars)star.explored=true;
  site.explorationEvent=pending('AN_B01');var researchBefore=state.res.research;`);
 assert.equal(run('resolveExploration(site,0)&&state.res.research===researchBefore+10'),true);
});

test('anomaly defenders force safe retreat or saved missing status and pay one removal reward',async()=>{
 const {run}=setup();
 run(`reset('anomaly-defense');moveWithinSystem=async()=>{};
  var site=state.stars.find(s=>s.id!==0&&!s.edges.includes(0)&&s.planets.some(p=>p.type==='mineral'));
  var planetIndex=site.planets.findIndex(p=>p.type==='mineral'),target=site.planets[planetIndex];
  var neighbor=site.edges[0],edges=[...site.edges];
  site.explorationEvent={type:'anomaly',status:'assigned',planetIndex,eventId:'AN_N06'};
  state.ships.explorer=site.id;
  for(const id of edges)state.stars[id].ownerId='enemy';
  setMilitaryHostility(state,'player','enemy',true);`);
 await run(`surveyObject('explorer',site,target,{x:50,y:50})`);
 assert.equal(run(`target.scanned&&site.explorationEvent.status==='resolved'&&site.anomalyDefense.active&&
  !Object.hasOwn(state.ships,'explorer')&&state.missingScouts.explorer.origin===site.id`),true);
 run(`for(const p of site.planets)p.scanned=true;revealScoutArrival(state,site.id);
  state=normalizeSavedState(JSON.parse(JSON.stringify(state)));site=state.stars[site.id];`);
 assert.equal(run('!canColonize(site)&&factionsHostile(state,site.anomalyDefense.owner,"another-civilization")'),true);
 run(`var fleet=state.military.fleets.find(f=>f.owner==='player');
  fleet.systemId=neighbor;for(const ship of state.military.ships.filter(s=>s.owner==='player'))ship.systemId=neighbor;
  state.military.ships.find(s=>s.owner===site.anomalyDefense.owner).hp=1;
  var before=state.res.research,result=executeFleetOrder(state,[fleet.id],site.id);`);
 assert.equal(run(`result.anomalyCleared.research===10&&state.res.research===before+10&&canColonize(site)&&
  !site.anomalyDefense.active&&!spawnAnomalyDefense(state,site,'부활')`),true);
 run(`state.turn=state.missingScouts.explorer.returnTurn;state.military.pendingTurnMessages=[];finishStrategicTurn();`);
 assert.equal(run('state.ships.explorer===0&&state.ap.explorer===2&&!state.missingScouts.explorer'),true);
 run(`state.ships.explorer=site.id;state.ap.explorer=1;state.stars[neighbor].ownerId=null;
  var retreatText=forceAnomalyScoutRetreat(state,'explorer',site.id);`);
 assert.equal(run(`state.ships.explorer===neighbor&&state.ap.explorer===1&&retreatText.startsWith('후퇴')`),true);
});

test('scout destruction preserves the survey and the civilian queue saves, refunds, and replaces lost ships',async()=>{
 const {run,node}=setup();
 run(`reset('civilian-shipyard');moveWithinSystem=async()=>{};
  var origin=state.stars.find(s=>s.id!==0&&s.planets.some(p=>p.type==='gas'));
  var planetIndex=origin.planets.findIndex(p=>p.type==='gas'),planet=origin.planets[planetIndex];
  origin.explorationEvent={type:'anomaly',status:'assigned',planetIndex,eventId:'AN_N08'};
  state.ships.explorer=origin.id;activeShip='explorer';`);
 await run(`surveyObject('explorer',origin,planet,{x:50,y:50})`);
 assert.equal(run(`planet.scanned&&origin.explorationEvent.status==='resolved'&&!Object.hasOwn(state.ships,'explorer')&&
  !Object.hasOwn(state.ap,'explorer')&&activeShip===null&&state.ships.explorer2===0`),true);
 run('showShipyards(0)');
 assert.match(node('modalBody').innerHTML,/data-build-civilian="scout"/);
 assert.match(node('modalBody').innerHTML,/data-build-civilian="colony"/);
 run(`var funds=state.res.mineral,job=enqueueCivilianBuild(state,0,'scout');
  state=normalizeSavedState(JSON.parse(JSON.stringify(state)));cancelMilitaryBuild(state,0,undefined,job.id)`);
 assert.equal(run('state.res.mineral===funds'),true);
 run(`enqueueCivilianBuild(state,0,'scout');enqueueCivilianBuild(state,0,'colony');
  settleShipyards(state);`);
 assert.equal(run('!Object.hasOwn(state.ships,"explorer")'),true);
 run('settleShipyards(state)');
 assert.equal(run('state.ships.explorer===0&&state.ships.explorer2===0&&state.military.ships.length===2'),true);
 run(`for(let i=0;i<3;i++)settleShipyards(state);
  var unowned=state.stars.find(s=>!s.owned);revealScoutArrival(state,unowned.id);
  unowned.planets.forEach(p=>{p.scanned=true});state.ships.colony2=unowned.id;state.ap.colony2=2;`);
 assert.equal(run("performAction('colony2')&&unowned.owned&&state.ap.colony2===1&&state.ships.colony===0"),true);
});

test('five seeded survey chains satisfy distance, distinct target, and planet constraints',()=>{
 const {run}=setup();
 assert.equal(run(`(()=>{
  for(let seed=0;seed<100;seed++){
   const game=generate('chain-plan-'+seed);initializeExploration(game);
   const chains=game.surveyChains;
   if(chains.length!==5)return false;
   const visited=new Set();
   for(const chain of chains){
    const d=chainDefinition(chain.id),start=game.stars[chain.start];
    if(chain.start===0||start.planets[chain.startPlanet].type==='hab'||chain.middle.length!==(d.branchCount??1))return false;
    if(d.finalPlanet&&game.stars[chain.end].planets[chain.endPlanet].type!==d.finalPlanet)return false;
    for(const [system,planet] of [[chain.start,chain.startPlanet],[chain.end,chain.endPlanet]]){
     const slot=game.explorationPlan[system];
     if(planet!==null&&slot.type==='anomaly'&&slot.planetIndex===planet)return false;
    }
    for(const middle of chain.middle){
     const a=retreatDistances(game,chain.start).get(middle),b=retreatDistances(game,middle).get(chain.end);
     if(a<2||a>4||b<2||b>4)return false;
    }
    for(const system of [chain.start,...chain.middle,chain.end]){
     if(visited.has(system))return false;visited.add(system);
    }
   }
   const second=generate(game.seed);initializeExploration(second);
   if(JSON.stringify(chains)!==JSON.stringify(second.surveyChains))return false;
  }
  return !normalizeSavedState(generate('chain-legacy-save')).surveyChains;
 })()`),true);
});

test('survey chains enforce the first discoverer, expose one marker, and resume saved choices without double rewards',()=>{
 const {run,node}=setup();
 run(`reset('chain-rewards');var lookup=id=>state.surveyChains.find(chain=>chain.id===id);
  var claim=(chain,owner='player')=>claimSurveyChain(state,state.stars[chain.start],state.stars[chain.start].planets[chain.startPlanet],owner);
  var step=chain=>{const goal=surveyChainObjective(chain);state.ships.explorer=goal;state.ap.explorer=2;return investigateSurveyChain(chain,'explorer')&&state.ap.explorer===1};
  var rival=lookup('EC_02');claim(rival,'rival');`);
 assert.equal(run('claim(rival)===null&&!playerSurveyChainTargets(state).includes(rival)&&!step(rival)'),true);
 run(`var chain=lookup('EC_01');claim(chain);var middle=chain.route,end=chain.end`);
 assert.equal(run('surveyChainObjective(chain)===middle&&playerSurveyChainTargets(state).length===1'),true);
 assert.equal(run('step(chain)&&surveyChainObjective(chain)===end&&step(chain)&&chain.pending==="reward"'),true);
 run(`state=normalizeSavedState(JSON.parse(JSON.stringify(state)));chain=lookup('EC_01');showSurveyChainChoice(chain)`);
 assert.match(node('modalBody').innerHTML,/함대 기록 분석/);
 assert.equal(run(`var old=state.res.research;chooseSurveyChain(chain,0)&&state.res.research===old+80&&!chooseSurveyChain(chain,0)`),true);
 run(`state=normalizeSavedState(JSON.parse(JSON.stringify(state)));chain=lookup('EC_01')`);
 assert.equal(run('chain.completed&&!chooseSurveyChain(chain,0)&&state.res.research===old+80'),true);
 assert.equal(run(`(()=>{
  for(const id of ['EC_03','EC_04']){
   const c=lookup(id);claim(c);
   if(!step(c)||!step(c))return false;
   if(id==='EC_03'&&!chooseSurveyChain(c,1))return false;
   const p=state.stars[c.end].planets[c.endPlanet];
   if(!c.completed||(id==='EC_03'?p.explorationEffects.productionBonus:p.habData.explorationTraits[0].effects[0].value)!==.15)return false;
  }
  return true;
 })()`),true);
 run(`var routes=lookup('EC_05');claim(routes);var chosen=routes.middle[1];
  var initialized=chooseSurveyChain(routes,chosen);revealScoutArrival(state,routes.end);step(routes);step(routes);`);
 assert.equal(run('initialized&&routes.route===chosen&&(routes.completed||routes.pending==="clues")'),true);
 assert.equal(run(`(()=>{
  if(routes.completed)return true;
  const before=state.res.research,ids=[...routes.clueOptions].slice(0,routes.clueLimit);
  if(!chooseSurveyChain(routes,ids[0])||chooseSurveyChain(routes,ids[0]))return false;
  state=normalizeSavedState(JSON.parse(JSON.stringify(state)));routes=lookup('EC_05');
  for(const id of ids.slice(1))if(!chooseSurveyChain(routes,id))return false;
  return routes.completed&&state.res.research===before+50&&!chooseSurveyChain(routes,ids[0]);
 })()`),true);
});

test('four seeded wonder regions meet connected placement and legacy save constraints',()=>{
 const {run}=setup();
 assert.equal(run(`(()=>{
  for(let seed=0;seed<100;seed++){
   const game=generate('wonder-layout-'+seed);initializeExploration(game);
   const config=DATA.balance.regionalWonders,visited=new Set(),distances=retreatDistances(game,0);
   if(Object.keys(game.wonders).length!==4)return false;
   for(const [id,region] of Object.entries(game.wonders)){
    const spec=config.types[id],members=new Set(region.systems);
    if(members.size<2||members.size>4||[...members].some(x=>x===game.neighbor||distances.get(x)<3||visited.has(x)||game.stars[x].wonderId!==id))return false;
    for(const x of members)visited.add(x);
    const reached=new Set([region.systems[0]]),queue=[region.systems[0]];
    for(const current of queue)for(const next of game.stars[current].edges)if(members.has(next)&&!reached.has(next)){reached.add(next);queue.push(next)}
    if(reached.size!==members.size)return false;
    if(region.systems.filter(x=>game.stars[x].planets.some(p=>p.type===spec.planet)).length<(spec.minimumSystems??0))return false;
   }
   const copy=generate(game.seed);initializeExploration(copy);
   if(JSON.stringify(game.wonders)!==JSON.stringify(copy.wonders))return false;
  }
  return !normalizeSavedState(generate('no-wonders-legacy')).wonders;
 })()`),true);
});

test('wonder ownership affects the actual turn ledger without multiplying fixed output',()=>{
 const {run}=setup();
 assert.equal(run(`(()=>{
  reset('wonder-economy');const close=(a,b)=>Math.abs(a-b)<1e-8;
  const home=state.stars[0],planet=home.planets.find(p=>p.type==='hab'),hab=habitat(planet);
  const mine=home.planets.find(p=>p.type==='mineral');
  const before=resourceDetails();
  home.wonderId='WON_01';
  if(!close(resourceDetails().research.production.building,before.research.production.building*1.05))return false;
  home.wonderId='WON_02';mine.explorationEffects={productionBonus:.1};
  if(!close(resourceDetails().mineral.production.mining,11.5)||resourceDetails().alloy.production.wonder!==1)return false;
  home.planets.push({...mine,level:2});
  if(resourceDetails().alloy.production.wonder!==1)return false;
  for(const p of home.planets)if(p.type==='mineral')p.level=0;
  if(resourceDetails().alloy.production.wonder!==0)return false;
  hab.special[0]={id:'research',level:1,workers:1,subs:[false,false,false]};
  const baseline=resourceDetails(),habEnergy=habUpkeep(hab).energy;
  home.wonderId='WON_04';
  const adjusted=resourceDetails();
  if(adjusted.energy.production.wonder!==8||!close(adjusted.energy.consumption.building,baseline.energy.consumption.building-habEnergy*.1)||
   adjusted.energy.consumption.shipyard!==baseline.energy.consumption.shipyard||adjusted.energy.consumption.ship!==baseline.energy.consumption.ship)return false;
  const light=state.wonders.WON_04.systems.map(id=>state.stars[id]);
  delete home.wonderId;
  for(const star of light){star.owned=true;star.ownerId='player'}
  if(resourceDetails().energy.production.wonder!==light.length*8||light.length*8>32)return false;
  const lost=light[0];setMilitaryHostility(state,'player','rival',true);captureUndefendedSystem(state,lost.id,'rival');
  if(ownedWonder(lost)||ownedWonder(lost,'rival')?.energyPerSystem!==8||resourceDetails().energy.production.wonder!==(light.length-1)*8)return false;
  startResearch(DATA.research.technologies.find(t=>researchAvailable(t.id)).id);
  const energy=state.res.energy,expected=incomes().energy;
  nextTurn();
  return close(state.res.energy,energy+expected);
 })()`),true);
});

test('galaxy movement previews use real paths, costs and common fleet destinations',()=>{
 const {run}=setup();
 const result=JSON.parse(run(`(()=>{
  reset('map-route-preview');
  state.stars.slice(0,5).forEach((star,id)=>Object.assign(star,{
   owned:id<2,ownerId:id<2?'player':null,nameRevealed:id<4,surveyed:id<2,
   explored:id<4,wonderId:null,edges:[[1],[0,2],[1,3],[2,4],[3]][id]
  }));
  activeShip='explorer';moveMode=true;
  const scoutPlan=galaxyMovePlans().get(2),outOfRange=!galaxyMovePlans().has(3);
  const a=state.military.fleets[0],b=createFleet(state,'제2 함대',1);
  const ship=makeMilitaryShip(state,militaryBuildSpec(state,'default_corvette'),1);
  state.military.ships.push(ship);assignFleetShip(state,b.id,ship.id);
  activeShip=null;moveMode=false;fleetMoveMode=true;selectedFleetIds=[a.id,b.id];
  const orders=galaxyMovePlans(),fleetPlan=orders.get(2);
  return JSON.stringify({scout:scoutPlan.routes[0],outOfRange,edges:[...galaxyRouteEdges(fleetPlan).keys()],
   costs:fleetPlan.routes.map(route=>route.cost),label:galaxyRouteCostLabel(fleetPlan),sharedRange:!orders.has(3)});
 })()`));
 assert.deepEqual(result,{scout:{cost:1.3,path:[0,1,2]},outOfRange:true,edges:['0-1','1-2'],
  costs:[1.3,1],label:'행동력 1–1.3',sharedRange:true});
});

test('wonder visibility, discovery rewards and corridor routes respect saved ownership',()=>{
 const {run}=setup();
 assert.equal(run(`(()=>{
  reset('wonder-ownership');
  const corridor=state.wonders.WON_03.systems;
  const a=state.stars[corridor[0]],b=state.stars[a.edges.find(id=>corridor.includes(id))];
  a.owned=b.owned=true;
  if(civilianRouteCosts(state,a.id,2,()=>true).get(b.id)!==.25||fleetRoute(state,a.id,b.id,'player').cost!==.25)return false;
  b.owned=false;b.ownerId='rival';b.nameRevealed=true;
  if(regionalLaneCost(a,b,'player')!==1)return false;
  a.owned=false;a.ownerId='rival';
  if(regionalLaneCost(a,b,'rival')!==.25)return false;
  const single=regionalWonderMarkup(state,id=>id===a.id);
  if((single.match(/wonder-halo/g)||[]).length!==1||single.includes('wonder-link'))return false;
  const region=state.wonders.WON_01;
  const nebula=state.stars[region.systems[0]],frontier=nebula.edges.map(id=>state.stars[id]).filter(star=>!star.owned);
  if(frontier.length<2)return false;
  nebula.owned=true;
  const [charted,hidden]=frontier;
  observeWonderFrontier(state,id=>id===charted.id,()=>false);
  if(!charted.explorationClue?.counts||hidden.explorationClue||charted.explored||charted.surveyed)return false;
  nebula.owned=false;nebula.ownerId='rival';
  observeWonderFrontier(state,()=>true,()=>false);
  if(hidden.explorationClue||!charted.explorationClue?.counts)return false;
  const before=state.res.research;
  if(!discoverRegionalWonder(state,nebula.id,'player')||state.res.research!==before+10)return false;
  if(discoverRegionalWonder(state,nebula.id,'rival'))return false;
  state=normalizeSavedState(JSON.parse(JSON.stringify(state)));
  return state.wonders.WON_01.discoveredBy==='player'&&!!state.stars[charted.id].explorationClue?.counts&&
   !discoverRegionalWonder(state,nebula.id,'player')&&state.res.research===before+10;
 })()`),true);
});

test('ancient relics preserve existing sites and allocate six standard and two advanced surveys',()=>{
 const {run}=setup();
 assert.equal(run(`(()=>{
  for(let i=0;i<20;i++){
   const game=generate('relic-seed-'+i),locations=game.stars.filter(star=>star.ancient).map(star=>star.id);
   initializeExploration(game);
   const sites=game.relicSites.map(id=>game.stars[id]),records=sites.map(star=>star.relic);
   if(game.relicSites.join()!==locations.join()||new Set(records.map(relic=>relic.type)).size!==8||
      records.filter(relic=>relic.requiredResearch==='sci_2_2').length!==6||
      records.filter(relic=>relic.requiredResearch==='sci_3_2').length!==2)return false;
   const copy=generate(game.seed);initializeExploration(copy);
   if(JSON.stringify(records)!==JSON.stringify(copy.relicSites.map(id=>copy.stars[id].relic)))return false;
  }
  return !normalizeSavedState(generate('legacy-relics')).relicSites;
 })()`),true);
});

test('research gates field surveys, and later civilizations gain science progress without an empire effect',async()=>{
 const {run,node}=setup();
 run(`reset('relic-survey');gameActive=true;moveWithinSystem=async()=>{};
  var site=state.stars[state.relicSites.find(id=>state.stars[id].relic.requiredResearch==='sci_3_2')];
  var relic=surveyTargets(site).find(object=>object.kind==='relic');
  state.research.completed.push('sci_2_2');state.ships.explorer=site.id;
  var position={x:50,y:30},startResearchStock=state.res.research;`);
 assert.match(run('relicSurveyBlock(state,site)'),/행성 조사 기술 II 필요/);
 assert.equal(await run("surveyObject('explorer',site,relic,position)"),false);
 assert.equal(run('state.ap.explorer'),2);
 run(`state.military.researchByOwner={rival:{completed:['sci_2_2','sci_3_2']}};
  var rivalResult=surveyAncientRelic(state,site,'rival');state.research.completed.push('sci_3_2');`);
 assert.equal(run('rivalResult.first&&scienceSurveyCount(state,"rival")===1'),true);
 assert.equal(await run("surveyObject('explorer',site,relic,position)"),true);
 assert.match(node('explorationNotice').innerHTML,/조사 기록 확보/);
 assert.equal(run(`state.ap.explorer===1&&state.res.research===startResearchStock&&scienceSurveyCount(state,'player')===1&&
  relicModifier(state,rivalResult.definition.kind,rivalResult.definition.target)===0&&
  relicModifier(state,rivalResult.definition.kind,rivalResult.definition.target,'rival')===.08`),true);
 run(`state=normalizeSavedState(JSON.parse(JSON.stringify(state)));site=state.stars[site.id]`);
 assert.equal(run("surveyAncientRelic(state,site)===null&&scienceSurveyCount(state,'player')===1&&site.relic.firstOwner==='rival'"),true);
});

test('first relic effects persist through conquest and add to production and fractional ship work only once',()=>{
 const {run}=setup();
 assert.equal(run(`(()=>{
  reset('relic-effects');
  const close=(a,b)=>Math.abs(a-b)<1e-8;
  const type=id=>state.stars[state.relicSites.find(site=>state.stars[site].relic.type===id)];
  state.research.completed.push('sci_2_2','sci_3_2');
  const home=state.stars[0],mine=home.planets.find(p=>p.type==='mineral'),h=habitat(home.planets.find(p=>p.type==='hab'));
  const site=type('mineral');site.owned=true;setMilitaryHostility(state,'player','rival',true);
  if(!surveyAncientRelic(state,site).first||surveyAncientRelic(state,site)!==null)return 'first claim or duplicate result';
  captureUndefendedSystem(state,site.id,'rival');
  mine.explorationEffects={productionBonus:.1};
  if(!close(facilityProduction(mine,DATA.balance.regionalWonders.types.WON_02),12.3))return 'additive mine production';
  const growth=habGrowth(h);
  surveyAncientRelic(state,type('growth'));
  if(!close(habGrowth(h),growth*1.08))return 'population growth modifier';
  surveyAncientRelic(state,type('shipbuilding'));
  let job=enqueueCivilianBuild(state,0,'scout');job.remaining=job.total=14;
  settleShipyards(state);
  if(job.remaining!==13||!close(job.workCarry,.08)||shipyardProductionTurns(state,job)!==12)return 'fractional work or ETA';
  state=normalizeSavedState(JSON.parse(JSON.stringify(state)));
  job=state.stars[0].shipyards[0].productionQueue[0];
  if(!close(job.workCarry,.08)||relicModifier(state,'shipbuilding')!==.08||relicModifier(state,'production','mineral')!==.08)return 'reloaded effect or work carry';
  for(let i=0;i<11;i++)settleShipyards(state);
  return !Object.hasOwn(state.ships,'explorer3')&&settleShipyards(state).length===1&&state.ships.explorer3===0;
 })()`),true);
});

test('orbital science starts from a local colony ship, then continues without it across save/load',()=>{
 const {run,load,node,context}=setup();
 context.document.body=node('fixtureBody');
 context.innerWidth=1000;context.innerHeight=800;
 run(`var ResizeObserver=class{observe(){}};reset('science-project');
  var tech=SCIENCE_PROJECT.researchId;
  var index=state.stars[0].planets.findIndex(planet=>planet.type==='hab');`);
 load('command-ui');
 assert.throws(()=>run('startScienceProject(state,0,index,"explorer")'),/현지 개척선 필요/);
 assert.throws(()=>run('startScienceProject(state,0,index,"colony")'),/유적 조사 기록 부족/);
 run('showOrbitalScienceProject(state.stars[0],index,"colony")');
 assert.match(node('modalBody').innerHTML,/orbital-requirement unmet">유적 조사 5/);
 assert.match(node('modalBody').innerHTML,/orbital-requirement unmet">고대의 신호 해독/);
 assert.match(node('modalBody').innerHTML,/orbital-requirement unmet"><span class="resource-amount" title="광물"/);
 assert.match(node('modalBody').innerHTML,/orbital-requirement"><span class="resource-amount" title="에너지"/);
 run(`state.research.completed.push('sci_2_2','sci_3_2');
  for(const id of state.relicSites.slice(0,5))surveyAncientRelic(state,state.stars[id]);`);
 assert.equal(run('researchAvailable(tech)'),true);
 assert.throws(()=>run('startScienceProject(state,0,index,"colony")'),/고대의 신호 해독 필요/);
 run(`state.research.completed.push(tech)`);
 assert.throws(()=>run('startScienceProject(state,0,index,"colony")'),/자원 부족/);
 run(`Object.assign(state.res,{mineral:300,alloy:250,energy:160});showVictoryOverview('science');`);
 assert.match(node('modalBody').innerHTML,/5 \/ 5/);
 assert.match(node('modalBody').innerHTML,/건설 위치 보기/);
 assert.doesNotMatch(node('modalBody').innerHTML,/startScienceProject|scienceProjectSite/);
 node('planetList').parentElement=node('systemViewport');
 run(`closeDialog();addEngineEffects=()=>{};activeShip='colony';state.ap.colony=0;view='system';sysId=0;renderSystemShips();
  $('planetList').oncontextmenu({clientX:100,clientY:100,preventDefault(){},
   target:{closest:selector=>selector==='[data-planet-index]'?{dataset:{planetIndex:String(index)}}:null}});`);
 const menu=node('fixtureBody').children.at(-1);
 assert.match(menu.innerHTML,/orbital-menu-head.*궤도 시설/);
 assert.match(menu.children[0].innerHTML,/궤도 조선소.*가동 중/);
 assert.match(menu.children[1].innerHTML,/과학 프로젝트.*착공 가능/);
 menu.children[1].onclick();
 node('startOrbitalScienceProject').onclick();
 assert.equal(run(`state.res.mineral===120&&state.res.alloy===130&&state.res.energy===60&&scienceProjectFor(state,'player').progress===0`),true);
 assert.throws(()=>run('startScienceProject(state,0,index,"colony")'),/건설 중/);
 run(`var neighbor=state.stars[0].edges[0];state.stars[neighbor].surveyed=true;state.ap.colony=2;playWarp=()=>{};`);
 assert.equal(run('moveShip("colony",neighbor)&&state.ships.colony===neighbor'),true);
 run(`renderOrbitalScienceProjects($('testOrbit'),state.stars[0]);`);
 assert.match(node('testOrbit').children[0].innerHTML,/과학 프로젝트.*progress/);
 run(`state.military.pendingTurnMessages=[];finishStrategicTurn();settleScienceProjects(state);
  state=normalizeSavedState(JSON.parse(JSON.stringify(state)));var project=scienceProjectFor(state,'player');`);
 assert.equal(run('project.progress===1&&project.total===12&&project.startedTurn===1'),true);
 run(`for(let i=0;i<10;i++){state.military.pendingTurnMessages=[];finishStrategicTurn()}`);
 assert.equal(run('project.progress===11&&project.completedTurn===undefined'),true);
 run('state.military.pendingTurnMessages=[];finishStrategicTurn()');
 assert.equal(run('project.progress===12&&project.completedTurn===state.turn&&settleScienceProjects(state).completed.length===0'),true);
 assert.match(node('modalBody').innerHTML,/과학 승리/);
});

test('capture on the last science turn discards all work and permits a fresh start only',()=>{
 const {run}=setup();
 run(`reset('science-capture');
  state.research.completed.push('sci_2_2','sci_3_2',SCIENCE_PROJECT.researchId);
  for(const id of state.relicSites.slice(0,5))surveyAncientRelic(state,state.stars[id]);
  Object.assign(state.res,{mineral:500,alloy:500,energy:500});
  var site=state.stars.find(star=>star.id!==0&&star.planets.some(planet=>planet.type==='hab'));
  var index=site.planets.findIndex(planet=>planet.type==='hab');
  site.owned=true;setMilitaryHostility(state,'player','rival',true);state.ships.colony=site.id;
  var old=startScienceProject(state,site.id,index,'colony');old.progress=11;
  var capture=captureUndefendedSystem(state,site.id,'rival');
  state.military.pendingTurnMessages=[];finishStrategicTurn();`);
 assert.equal(run(`capture.canceledScience&&!scienceProjectFor(state,'player')&&!scienceProjectFor(state,'rival')&&
  state.res.mineral===320&&state.res.alloy===380&&state.res.energy===400`),true);
 run(`captureUndefendedSystem(state,site.id,'player');state=normalizeSavedState(JSON.parse(JSON.stringify(state)))`);
 assert.equal(run("!scienceProjectFor(state,'player')&&scienceProjectSurveyCount(state,'player')===5&&researchComplete(SCIENCE_PROJECT.researchId)"),true);
 assert.equal(run(`state.ships.colony=0;var fresh=startScienceProject(state,0,state.stars[0].planets.findIndex(planet=>planet.type==='hab'),'colony');
  fresh.progress===0&&fresh.total===12&&state.res.mineral===140`),true);
 run(`state.stars[0].planets[fresh.planetIndex].type='barren';state.turn++`);
 assert.equal(run("settleScienceProjects(state).canceled.length===1&&!scienceProjectFor(state,'player')"),true);
});

test('victory screen opens prosperity and shows real progress without exposing enemy gateway sites',()=>{
 const {run,load,node}=setup();
 run(`var ResizeObserver=class{observe(){}};reset('victory-screen');
  var sites=state.stars.filter(s=>s.gatewaySite);
  for(const s of sites.slice(0,4)){s.owned=true;s.gateway={remaining:0}}
  sites[4].ownerId='ai';sites[4].name='비공개 적 관문';
  sites[5].owned=true;sites[5].gateway={remaining:2,total:8,builder:'player'};
  state.research.completed.push(DATA.balance.gateways.researchId);
  state.prosperity={streaks:{player:3},winner:null};`);
 load('command-ui');
 run('showVictoryOverview()');
 const body=node('modalBody');
 assert.match(body.innerHTML,/data-victory="prosperity" aria-pressed="true"/);
 assert.match(body.innerHTML,/aria-label="가동 관문" value="4" max="4"/);
 assert.match(body.innerHTML,/aria-label="연속 유지" value="3" max="8"/);
 assert.match(body.innerHTML,/유지 중 · 5턴 남음/);
 assert.match(body.innerHTML,/건설 중 · 2턴/);
 assert.match(body.innerHTML,/<th scope="row">ai<\/th><td>1 \/ 8<\/td>/);
 assert.doesNotMatch(body.innerHTML,/비공개 적 관문/);
 run(`state.prosperity.winner={owner:'player',turn:50};showVictoryOverview()`);
 assert.match(body.innerHTML,/번영 승리 달성 · 50턴/);
 run("showVictoryOverview('science')");
 assert.match(body.innerHTML,/유물 조사 기록/);
 assert.doesNotMatch(body.innerHTML,/<progress/);
 run("showVictoryOverview('domination')");
 assert.match(body.innerHTML,/conic-gradient/);
 assert.match(body.innerHTML,/미개척/);
 run("showVictoryOverview('score','ai')");
 assert.match(body.innerHTML,/data-victory-civilization="ai" aria-pressed="true"/);
 assert.match(body.innerHTML,/점수 산식 미정/);
});

test('rival prosperity warning fires once when the countdown begins and survives saving',()=>{
 const {run}=setup();
 run(`reset('victory-warning');
  var rival='ai',sites=state.stars.filter(s=>s.gatewaySite).slice(0,4);
  for(const s of sites){s.ownerId=rival;s.gateway={remaining:0}}
  state.military.researchByOwner={ai:{completed:[GATEWAY_BALANCE.researchId]}};
  refreshGatewayVictory(state,true);`);
 assert.equal(run('gatewayVictoryWarnings(state).length'),1);
 assert.equal(run('gatewayVictoryWarnings(state).length'),0);
 assert.equal(run(`state=normalizeSavedState(JSON.parse(JSON.stringify(state)));
  gatewayVictoryWarnings(state).length===0&&state.prosperity.warnings.length===1`),true);
 assert.equal(run('state.turn++;refreshGatewayVictory(state,true);gatewayVictoryWarnings(state).length'),0);
});

test('gateway mobility comparison covers every site pair across ten fixed maps',()=>{
 const {run}=setup();
 const summary=JSON.parse(run(`JSON.stringify((()=>{
  const comparison={pairs:0,faster:0,beyondTurn:0,max:0};
  for(let seed=0;seed<10;seed++){
   reset('gateway-balance-'+seed);
   for(const star of state.stars)star.owned=true;
   const sites=state.stars.filter(star=>star.gatewaySite);
   for(const [index,from] of sites.entries())for(const to of sites.slice(index+1)){
    const {cost}=fleetRoute(state,from.id,to.id,'player');
    comparison.pairs++;
    if(cost>GATEWAY_BALANCE.travelCost)comparison.faster++;
    if(cost>2)comparison.beyondTurn++;
    comparison.max=Math.max(comparison.max,cost);
   }
  }
  return comparison;
 })())`));
 assert.equal(summary.pairs,280);
 assert.ok(summary.faster>0&&summary.beyondTurn>0);
 console.log('Gateway mobility comparison:',JSON.stringify(summary));
});

test('mines and gas collectors charge energy only at every level and show it in their details',()=>{
 const {run,node}=setup();
 run(`reset('facility-upkeep');sysId=0;
  var homePlanets=state.stars[0].planets, mine=homePlanets.find(p=>p.type==='mineral'), gas=homePlanets.find(p=>p.type==='gas');
  mine.level=gas.level=0;var idle=resourceDetails();`);
 for(const [facility,energyPerLevel] of [['mine',2],['gas',1]]){
  for(let level=1;level<=3;level++){
   const details=run(`mine.level=gas.level=0;${facility}.level=${level};resourceDetails()`);
   assert.equal(details.energy.consumption.building-idleBuilding('energy'),energyPerLevel*level);
   assert.equal(details.mineral.consumption.building,idleBuilding('mineral'));
  }
  run(`planetModal(homePlanets.indexOf(${facility}))`);
  assert.match(node('modalBody').innerHTML,new RegExp('유지비/턴: .*alt="에너지">'+energyPerLevel*3+'</span>'));
  assert.doesNotMatch(node('modalBody').innerHTML,/미정/);
 }
 function idleBuilding(resource){return run('idle.'+resource+'.consumption.building')}
});

test('shortage modifiers reuse facility output, population demand and the actual turn ledger once',()=>{
 const {run}=setup();
 assert.equal(run(`(()=>{
  const close=(actual,expected)=>Math.abs(actual-expected)<1e-9;
  reset('shortage-economy');
  const home=state.stars[0].planets.find(p=>p.type==='hab'),h=habitat(home);
  h.special[0]={id:'consumer',level:1,workers:1,subs:[false,false,false]};
  h.special[1]={id:'research',level:1,workers:1,subs:[false,false,false]};
  const base=resourceDetails(),growth=habGrowth(h),power=habPower(h);
  const ids=new Set(['energy','mineral','food','consumer','alloy']);
  advanceResourceShortages(state,ids);
  const stage1=resourceDetails();
  if(!close(stage1.research.production.building,base.research.production.building*.75)||
   !close(stage1.consumer.production.building,base.consumer.production.building*.95)||
   !close(stage1.mineral.consumption.manufacturing,base.mineral.consumption.manufacturing*.95)||
   !close(habGrowth(h),growth*.7)||!close(habPower(h),power)||
   stage1.energy.consumption.building!==base.energy.consumption.building||
   stage1.energy.production.mining!==base.energy.production.mining)return false;
  for(let i=0;i<3;i++)advanceResourceShortages(state,ids);
  const stage2=resourceDetails();
  if(!close(stage2.energy.consumption.ship,base.energy.consumption.ship*1.2)||
   !close(stage2.food.consumption.population,base.food.consumption.population*1.2)||
   !close(stage2.consumer.consumption.population,base.consumer.consumption.population*1.2)||
   !close(stage2.consumer.consumption.building,base.consumer.consumption.building*1.2)||
   !close(stage2.mineral.consumption.building,base.mineral.consumption.building*1.2)||
   !close(stage2.mineral.consumption.manufacturing,stage1.mineral.consumption.manufacturing))return false;
  reset('shortage-economy');
  state.res.energy=0;
  startResearch(DATA.research.technologies.find(t=>researchAvailable(t.id)).id);
  nextTurn();if(state.shortages.energy)return false;
  state.stars[0].planets.find(p=>p.type==='gas').level=0;
  state.res.energy=0;nextTurn();
  if(state.shortages.energy?.consecutive!==1)return false;
  state.res.energy=100;nextTurn();
  return !state.shortages.energy;
 })()`),true);
});

test('combat snapshots combine independent shortage effects without changing ship designs or durability',()=>{
 const {run}=setup();
 assert.equal(run(`(()=>{
  const game=createCombatTestScenario();
  const engagement=game.military.battle,order=engagement.order;
  // Re-create the same hostile encounter with the new strategic condition.
  delete game.military.battle;
  const ids=order.routes.map(route=>route.fleetId);
  for(const route of order.routes){
   const fleet=game.military.fleets.find(f=>f.id===route.fleetId);
   fleet.systemId=route.from;
   for(const ship of game.military.ships.filter(s=>fleet.shipIds.includes(s.id))){ship.systemId=route.from;ship.ap=2}
  }
  game.shortages={energy:{consecutive:4,remaining:3},alloy:{consecutive:1,remaining:0}};
  beginFleetOrder(game,ids,order.to,order.owner);
  const close=(a,b)=>Math.abs(a-b)<1e-9;
  return game.military.battle.combat.units.every(u=>{
   const ship=game.military.ships.find(s=>s.id===u.id),source=ship.assembly,rate=ship.owner==='player'?.75:1;
   return close(u.assembly.speed,source.speed*rate)&&close(u.assembly.evasion,source.evasion*rate)&&
    u.assembly.weapons.every((w,i)=>close(w.damage,source.weapons[i].damage*rate))&&
    u.assembly.armor===source.armor&&u.hp===ship.hp&&u.shield===ship.shield;
  });
 })()`),true);
});

test('manufacturing charges minerals for boosted specialization output and retains the zero stock floor',()=>{
 const {run}=setup();
 run(`var home=state.stars[0].planets.find(p=>p.type==='hab'),h=habitat(home);
  h.explorationTraits=[{effects:[{kind:'planet_resource_production_pct',target:'consumer',value:.2}]}];
  var centerOnly=habProduction(h);
  h.special[0]={id:'consumer',level:2,workers:2,subs:[true,false,false]};
  h.special[1]={id:'alloy',level:1,workers:1,subs:[false,false,false]};
  h.common[1]={id:'log_consumer',level:1,workers:1};`);
 assert.equal(run('centerOnly.production.consumer===6&&centerOnly.inputs.mineral===undefined'),true);
 assert.equal(run(`(()=>{
  const {production,inputs}=habProduction(h),details=resourceDetails();
  return Math.abs(production.consumer-21.6)<1e-9&&production.alloy===5&&
   Math.abs(inputs.mineral-10.3)<1e-9&&details.mineral.consumption.manufacturing===inputs.mineral&&
   details.mineral.production.mining===10;
 })()`),true);
 run(`startResearch(DATA.research.technologies.find(t=>researchAvailable(t.id)).id);
  state.res.mineral=0;var expectedAlloy=state.res.alloy+incomes().alloy;var previousTurn=state.turn;
  nextTurn();`);
 assert.equal(run('state.turn===previousTurn+1&&state.res.mineral===0&&Math.abs(state.res.alloy-expectedAlloy)<1e-9'),true);
 run('h.special[0].workers=0;h.special[1].workers=0');
 assert.equal(run('resourceDetails().mineral.consumption.manufacturing'),0);
});

test('research specialization charges consumer goods once per assigned worker outside population modifiers',()=>{
 const {run}=setup();
 run(`var home=state.stars[0].planets.find(p=>p.type==='hab'),h=habitat(home);
  var colony=state.stars.find(star=>!star.owned&&star.planets.some(p=>p.type==='hab'));
  colony.owned=true;h.pop=8;
  h.common[1]={id:'admin_consumer',level:1,workers:1};
  var rate=DATA.buildings.special.find(b=>b.id==='research').upkeepPerWorker.consumer;
  h.special[0]={id:'research',level:3,workers:0,subs:[false,false,false]};
  var baseline=resourceDetails().consumer;
  h.special[0].workers=3;`);
 assert.equal(run(`habPenalty()>0&&baseline.consumption.building===0&&
  resourceDetails().consumer.consumption.population===baseline.consumption.population&&
  buildingUpkeep(h.special[0],true).consumer===3*rate&&resourceDetails().consumer.consumption.building===3*rate`),true);
 run(`startResearch(DATA.research.technologies.find(t=>researchAvailable(t.id)).id);
  var expected=state.res.consumer+incomes().consumer;
  nextTurn();`);
 assert.equal(run('Math.abs(state.res.consumer-expected)<.0001'),true);
 run('h.special[0].workers=0');
 assert.equal(run('resourceDetails().consumer.consumption.building'),0);
});

test('180 real campaign turns settle research, production and ship upkeep once per turn',()=>{
 const {run}=setup();
 const summary=run(`(()=>{
  const home=state.stars[0].planets.find(p=>p.type==='hab'),h=habitat(home);
  if(!startHabConstruction(home,'special',0,'alloy'))throw Error('Cannot build specialization');
  let minAlloy=Infinity,queued=0,maxUpkeep=0;
  for(let i=0;i<180;i++){
   if(h.special[0])h.special[0].workers=1;
   if(!researchState().current){const technology=DATA.research.technologies.find(t=>researchAvailable(t.id));if(technology)startResearch(technology.id)}
   if(i%10===0&&state.res.alloy>=12){enqueueMilitaryBuild(state,0,'default_corvette');queued++}
   const before=state.turn,net=incomes().alloy,stock=state.res.alloy;
   maxUpkeep=Math.max(maxUpkeep,resourceDetails().alloy.consumption.ship);
   nextTurn();
   if(state.turn!==before+1||state.res.alloy!==Math.max(0,Math.round((stock+net)*10000)/10000))throw Error('Duplicate or skipped settlement');
   minAlloy=Math.min(minAlloy,state.res.alloy);
  }
  return {turn:state.turn,queued,built:state.military.ships.length,minAlloy,maxUpkeep,endAlloy:state.res.alloy};
 })()`);
 assert.equal(summary.turn,181);assert.equal(summary.queued,18);assert.equal(summary.built,18);
 assert.ok(summary.minAlloy>0&&summary.maxUpkeep>1.6);
 console.log('180-turn campaign economy fixture:',JSON.stringify(summary));
});

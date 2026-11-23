import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {readData} from '../tools/build.mjs';

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
  confirm:()=>true,alert:message=>{throw Error(message)},queueMicrotask:fn=>fn(),location:{hash:''}});
 const load=name=>vm.runInContext(fs.readFileSync(new URL('../src/'+name+'.js',import.meta.url),'utf8'),context);
 const run=source=>vm.runInContext(source,context);
 for(const name of ['state','resource-ui','galaxy-symbols','galaxy','research','habitat','construction','exploration','habitable-events','ship-designs','combat','fleets','retreat','scout-danger','battle-scene','battle-test','battle-test-ui','fleet-workspace','fleet-ui','shipyards','shipyard-ui','simulation','map-ui','presentation'])load(name);
 run(`var tutorial=false,researchPendingTurn=false,habIndex=0;
 var modelCanvas=()=>null,dismissModal=()=>{},showFleetBattle=()=>{},showResearch=()=>{};showNextDiscovery=()=>{};render=()=>{};pumpExploration=()=>{};
 state=normalizeSavedState(generate('campaign-integration'));`);
 load('saves-menu');
 return {run,context,node,slots,branches};
}

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
 assert.match(node('modalBody').innerHTML,/조선소 직접 건조/);
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
 assert.match(node('modalBody').innerHTML,/실제 자원 소모/);
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
 assert.match(body.innerHTML,/자세히 볼 군단이나 함대를 선택하세요/);
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
 var before=JSON.stringify(combat);paintFleetBattleScene(combat,battleSceneSnapshot(combat));`);
 assert.ok(calls.some(([name])=>name==='translate'));
 assert.ok(calls.some(([name])=>name==='arc'));
 assert.ok(calls.some(([name,,color])=>name==='fillRect'&&color==='#b48bf3'));
 assert.ok(calls.some(([name,,color])=>name==='fillRect'&&color==='#f0a263'));
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

test('manufacturing charges minerals for boosted specialization output and retains the existing shortage rules',()=>{
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

let combatPreview=null;
let combatTestSession=null;
const TEST_FACTION='fixture_enemy';
const TEST_SIDES=['player',TEST_FACTION];
const TEST_SYSTEM_NAMES=['테라 조선소','테라 전선','AI 전선','AI 조선소'];
const testSideName=owner=>owner==='player'?'플레이어':'적 AI';

function createCombatTestDraft(){
 const draft={posture:'defensive',confirmed:false,nextId:1,sides:{}};
 const formations=[
  [['heavy_cruiser',2],['battleship',1],['escort',4]],
  [['destroyer',3],['corvette',7],['escort',2]]
 ];
 for(const owner of TEST_SIDES){
  const book={};initializeShipDesigns(book);
  const corps={id:draft.nextId++,name:testSideName(owner)+' 제1군단',fleets:formations.map((entries,index)=>({
   id:draft.nextId++,name:testSideName(owner)+(index?' 경계 함대':' 주력 함대'),
   entries:entries.map(([hullId,count])=>({designId:'default_'+hullId,count}))
  }))};
  draft.sides[owner]={...book,corps:[corps],independentFleets:[]};
 }
 return draft;
}

function combatTestDraftFleets(book){
 return book.corps.flatMap(corps=>corps.fleets.map(fleet=>({fleet,corps})))
  .concat(book.independentFleets.map(fleet=>({fleet,corps:null})));
}

function combatTestFleetSummary(book,fleet){
 const result={points:0,count:0,turns:0,buildCost:{},upkeep:{}};
 for(const {designId,count} of fleet.entries){
  const design=book.shipDesigns.find(d=>d.id===designId);
  if(!design||!Number.isInteger(count)||count<1)throw Error('함선 설계와 수량을 확인하세요.');
  const assembly=assembleShipDesign(design);
  result.points+=DATA.combat.fleets.classCosts[design.hullId]*count;
  result.count+=count;
  result.turns+=COMBAT_HULLS.get(design.hullId).buildTurns*count;
  for(const field of ['buildCost','upkeep'])for(const [resource,amount] of Object.entries(assembly[field])){
   result[field][resource]=(result[field][resource]||0)+amount*count;
  }
 }
 if(result.points>DATA.combat.fleets.maxCapacity)throw Error('편제 규모 한도 '+DATA.combat.fleets.maxCapacity+'을 초과합니다.');
 return result;
}

function validateCombatTestDraft(draft){
 if(!['defensive','aggressive'].includes(draft.posture))throw Error('AI 태세를 선택하세요.');
 for(const owner of TEST_SIDES){
  const book=draft.sides[owner],fleets=combatTestDraftFleets(book);
  if(!fleets.length)throw Error(testSideName(owner)+' 함대를 하나 이상 편성하세요.');
  for(const {fleet} of fleets)if(!combatTestFleetSummary(book,fleet).count)throw Error(fleet.name+'에 함선을 넣거나 빈 함대를 삭제하세요.');
 }
}

function createCombatTestGame(draft){
 validateCombatTestDraft(draft);
 const stars=TEST_SYSTEM_NAMES.map((name,id)=>({
  id,name,x:id*180,y:0,owned:id<2,ownerId:id<2?'player':TEST_FACTION,nameRevealed:true,surveyed:true,blackholeTo:null,
  planets:[{type:'hab',label:name+' I',sizeClass:'medium',habData:newHabitat(id===0||id===3)}],
  edges:[id-1,id+1].filter(i=>i>=0&&i<4),
  shipyards:[createOrbitalShipyard(0,0)]
 }));
 const completed=[...new Set([...DATA.combat.hulls,...DATA.combat.modules].map(part=>part.requiredResearch).filter(Boolean))];
 const game={seed:'combat-line-test-v1',turn:1,ships:{colony:0},ap:{colony:2},stars,res:{},
  testEconomy:{},research:{completed},shipDesigns:JSON.parse(JSON.stringify(draft.sides.player.shipDesigns))};
 initializeShipDesigns(game);initializeShipyards(game);
 const military=game.military;
 military.knownSystems={[TEST_FACTION]:stars.map(s=>s.id)};
 for(const owner of TEST_SIDES){
  const book=draft.sides[owner],systemId=owner==='player'?0:3;
  for(const {fleet:spec,corps} of combatTestDraftFleets(book)){
   const fleet={id:newMilitaryId(military,'fleet_'),owner,systemId,name:spec.name,corpsId:corps?.id??null,corpsName:corps?.name??'독립 함대',shipIds:[]};
   for(const {designId,count} of spec.entries){
    const design=book.shipDesigns.find(d=>d.id===designId),assembly=assembleShipDesign(design);
    for(let index=0;index<count;index++){
     const id=newMilitaryId(military,'mil_');
     military.ships.push({id,designId,name:design.name,owner,systemId,hullId:design.hullId,assembly,hp:assembly.armor,shield:assembly.shield,ap:assembly.strategicAP});
     fleet.shipIds.push(id);
    }
   }
   military.fleets.push(fleet);
  }
 }
 setMilitaryHostility(game,'player',TEST_FACTION,true);
 return game;
}

function planCombatTestAI(game,posture){
 const fleets=game.military.fleets.filter(f=>f.owner===TEST_FACTION&&f.shipIds.length&&f.status!=='missing');
 // Check reachability with the AP the AI receives at the beginning of its phase.
 const planning={...game,military:{...game.military,phase:'ai',ships:game.military.ships.map(s=>s.owner===TEST_FACTION?{...s,ap:militaryMaxAP(game,s)}:s)}};
 const objectives=posture==='defensive'?[2]:[1,2,0];
 if(posture==='aggressive'&&fleets.some(f=>f.systemId<=1)){
  const threats=game.military.fleets.filter(f=>f.owner==='player'&&f.shipIds.length&&f.status!=='missing').map(f=>f.systemId);
  objectives.unshift(...[...new Set(threats)].filter(id=>id<=1));
 }
 const nextOrder=group=>{
  const fleetIds=group.map(f=>f.id);
  for(const to of [...new Set(objectives)]){
   if(group.every(f=>f.systemId===to)&&!militaryHostile(game,to,TEST_FACTION))return null;
   try{planFleetOrder(planning,fleetIds,to,TEST_FACTION);return {owner:TEST_FACTION,fleetIds,to}}catch{}
  }
  return null;
 };
 // Prefer one march for the whole side, then regroup from separate systems on later turns.
 const all=nextOrder(fleets);
 if(all)return [all];
 for(const origin of [...new Set(fleets.map(f=>f.systemId))].sort((a,b)=>a-b)){
  const regroup=nextOrder(fleets.filter(f=>f.systemId===origin));
  if(regroup)return [regroup];
 }
 return [];
}

// The integration test uses the same four-system setup and the normal movement orders.
function createCombatTestScenario(){
 const game=createCombatTestGame(createCombatTestDraft());
 settleFleetTurn(game,planCombatTestAI(game,'defensive'));
 beginFleetOrder(game,game.military.fleets.filter(f=>f.owner==='player').map(f=>f.id),2);
 game.military.battle.decision={kind:'initial'};
 return game;
}

function combatTestColonyTargets(game){
 return civilianRouteCosts(game,game.ships.colony,game.ap.colony,id=>game.stars[id].surveyed);
}

function startCombatTestTurn(session){
 const {game}=session;
 session.turnPending=true;
 for(const owner of TEST_SIDES)for(const [category,cost] of Object.entries(militaryUpkeep(game,owner))){
  recordMilitaryTestCost(game,owner,category,cost);
 }
 session.turnMessages=settleShipyards(game);
 return settleFleetTurn(game,planCombatTestAI(game,session.draft.posture));
}

function completeCombatTestTurn(session){
 const {game}=session;
 if(!session.turnPending||game.military.phase!=='player'||game.military.battle||pendingScoutDanger(game))return;
 session.turnPending=false;game.turn++;game.ap.colony=2;
 clearCombatTestSelection(session);
 const messages=session.turnMessages??[];delete session.turnMessages;
 return [...messages,...returnWarpFleets(game),...deliverFleetReinforcements(game)];
}

function startCombatTest(){
 combatTestSession={draft:createCombatTestDraft(),owner:'player',game:null,selected:new Set(),turnPending:false};
 closeDialog();showScreen('combat-test');renderCombatTest();
}
function exitCombatTest(){
 clearTimeout(fleetBattleTimer);stopBattleScene();combatPreview=null;combatTestSession=null;closeDialog();showScreen('main');
}
function installCombatTestEntry(){
 const button=$('combatTestMain');
 button.hidden=false;button.onclick=startCombatTest;
 $('combatTestStart').onclick=beginCombatTestPlay;
 $('combatTestNext').onclick=nextCombatTestTurn;
 $('combatTestDetails').onclick=()=>showCombatTestDetails();
 $('combatTestExit').onclick=exitCombatTest;
 $('combatTestReset').onclick=()=>{
  const session=combatTestSession;
  if(!session?.game||!confirm('현재 교전 결과를 초기화하고 편성으로 돌아갈까요?'))return;
  session.game=null;session.systemId=null;clearCombatTestSelection(session);session.turnPending=false;delete session.turnMessages;renderCombatTest();
 };
 $('combatTestPostureChoice').onchange=e=>{combatTestSession.draft.posture=e.target.value;renderCombatTest()};
}

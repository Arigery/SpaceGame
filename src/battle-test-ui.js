function testFleetRows(session,owner){
 if(!session.game){
  const book=session.draft.sides[owner];
  return combatTestDraftFleets(book).map(({fleet,corps})=>({
   id:fleet.id,name:fleet.name,corps:corps?.name??'독립 함대',corpsId:corps?.id??null,owner,systemId:owner==='player'?0:3,
   ...combatTestFleetSummary(book,fleet)
  }));
 }
 const {game}=session;
 return game.military.fleets.filter(f=>f.owner===owner).map(f=>({
  id:f.id,name:f.name,corps:f.corpsName,corpsId:f.corpsId,owner,systemId:f.systemId,count:f.shipIds.length,points:fleetPoints(game,f),ap:fleetAP(game,f),
  location:f.status==='missing'?warpStatusText(game,game.military.transits.find(t=>t.fleetId===f.id)):safeText(game.stars[f.systemId].name),
  active:f.status!=='missing'&&f.shipIds.length>0
 }));
}

function testMapFormationMarkers(fleets){
 const groups=new Map();
 for(const fleet of fleets){
  if(fleet.systemId===null||!fleet.count)continue;
  const key=[fleet.systemId,fleet.owner,fleet.corpsId??fleet.id].join(':');
  if(!groups.has(key))groups.set(key,[]);
  groups.get(key).push(fleet);
 }
 return [...groups.values()].map(group=>{
  const fleet=group[0],isCorps=group.length>1;
  return {owner:fleet.owner,systemId:fleet.systemId,type:isCorps?'corps':'fleet',name:isCorps?fleet.corps:fleet.name,ids:group.map(f=>f.id)};
 });
}

function bindTestMapControl(element,action){
 element.onclick=action;
 element.onkeydown=event=>{
  if(event.key==='Enter'||event.key===' '){event.preventDefault();action(event)}
 };
}

function selectCombatTestUnits(session,ids,extend){
 if(!session.game||session.turnPending||session.game.military.battle)return;
 const {selected}=session;
 const remove=extend&&ids.every(id=>selected.has(id));
 if(!extend)selected.clear();
 for(const id of ids)if(remove)selected.delete(id);else selected.add(id);
 renderCombatTest();
}

function renderCombatTestMap(session,feasible,fleets){
 const {game,selected}=session;
 const markers=testMapFormationMarkers(fleets);
 const bySystem=TEST_SYSTEM_NAMES.map((_,id)=>markers.filter(marker=>marker.systemId===id));
 const y=108+Math.max(1,...bySystem.map(group=>Math.ceil(group.length/4)))*30;
 const centers=TEST_SYSTEM_NAMES.map((_,id)=>({x:88+id*180,y,id}));
 const map=$('combatTestMap');
 const lanes=centers.slice(0,-1).map((center,i)=>galaxyLane(center,centers[i+1],i!==1)).join('');
 const symbols=centers.map(center=>{
  const {id,x}=center,name=TEST_SYSTEM_NAMES[id],available=feasible.has(id);
  const action=available?(militaryHostile(game,id,'player')?'공격':'이동'):'';
  const hit=available?`<circle class="starhit available test-system-hit" data-test-go="${id}" role="button" tabindex="0" aria-label="${safeText(name+' '+action)}" cx="${x}" cy="${y}" r="21" fill="transparent"><title>${action}</title></circle>`:'';
  const icons=bySystem[id].map((marker,index)=>{
   const row=Math.floor(index/4),rowSize=Math.min(4,bySystem[id].length-row*4);
   const interactive=game&&!session.turnPending&&marker.owner==='player';
   const checked=interactive&&marker.ids.every(fleetId=>selected.has(fleetId));
   const color=checked?'#ffe3a0':marker.owner==='player'?'#8fbdcb':'#eaa88b';
   const label=(marker.type==='corps'?'군단 ':'함대 ')+marker.name+(marker.type==='corps'?' · 함대 '+marker.ids.length+'개':'');
   const control=interactive?` data-test-formation="${marker.ids.join(',')}" role="button" tabindex="0" aria-pressed="${!!checked}" aria-label="${safeText(label)}"`:'';
   return `<g class="test-formation ${marker.type}${interactive?' selectable':''}"${control} transform="translate(${x+(index%4-(rowSize-1)/2)*33} ${y-44-row*30})" style="color:${color}"><title>${safeText(label)}</title><circle class="test-formation-ring" r="14" fill="#111d2d" stroke="currentColor" stroke-opacity=".65"/>${marker.type==='corps'?galaxyCorpsGlyph(color):galaxyFleetGlyph(color,color)}</g>`;
  }).join('');
  return (available?galaxyMoveHalo(center):'')+galaxySystemSymbol(center,name,{owned:true,hostile:id>=2,glow:'testSystemGlow',labelWidth:100})+hit+icons;
 }).join('');
 map.innerHTML=`<svg viewBox="0 0 716 ${y+105}" role="group" aria-label="4성계 은하 지도">${galaxyGlowDefs('testSystemGlow')}${lanes}${symbols}</svg>`;
 map.querySelectorAll('[data-test-go]').forEach(el=>bindTestMapControl(el,()=>moveCombatTestFleets(Number(el.dataset.testGo))));
 map.querySelectorAll('[data-test-formation]').forEach(el=>bindTestMapControl(el,event=>{
  selectCombatTestUnits(session,el.dataset.testFormation.split(','),event?.shiftKey);
  map.querySelector('[data-test-formation="'+el.dataset.testFormation+'"]')?.focus();
 }));
}

function renderCombatTest(message=''){
 const session=combatTestSession;
 if(!session)return;
 const {draft,game,selected}=session,started=!!game;
 const player=testFleetRows(session,'player'),enemy=testFleetRows(session,TEST_FACTION);
 for(const id of selected)if(!player.some(f=>f.id===id&&f.active))selected.delete(id);
 const feasible=new Set();
 if(started&&!session.turnPending)for(const star of game.stars){
  try{planFleetOrder(game,[...selected],star.id);feasible.add(star.id)}catch{}
 }
 $('combatTestStatus').textContent=message||(started?'턴 '+game.turn+' · '+(draft.posture==='defensive'?'수비형 AI':'공격형 AI'):
  draft.confirmed?'양측 편성 확인 완료':'상세 보기에서 양측의 편성을 확인하세요.');
 $('combatTestStart').hidden=started;$('combatTestStart').disabled=!draft.confirmed;
 $('combatTestNext').hidden=!started;$('combatTestNext').disabled=session.turnPending;
 $('combatTestReset').hidden=!started;
 $('combatTestPosture').hidden=started;
 $('combatTestPostureChoice').value=draft.posture;
 renderCombatTestMap(session,feasible,player.concat(enemy));
 const list=(rows,owner)=>rows.map(f=>'<article><b>'+safeText(f.name)+'</b><small>'+safeText(f.corps)+' · '+f.count+'척 · 규모 '+f.points+' / '+DATA.combat.fleets.maxCapacity+'</small>'+
  (started?'<small>'+f.location+(f.active?' · AP '+f.ap:'')+'</small>':'')+
  (started&&owner==='player'?'<button data-test-select="'+f.id+'" aria-pressed="'+selected.has(f.id)+'"'+(!f.active||session.turnPending?' disabled':'')+'>'+(selected.has(f.id)?'선택됨':'선택')+'</button>':'')+'</article>').join('');
 const ownList=$('combatTestFleets');
 ownList.innerHTML=(started?'<small class="muted">Shift + 클릭으로 선택 추가·해제</small>':'')+(list(player,'player')||'<p>편성된 함대가 없습니다.</p>');
 $('combatTestEnemyFleets').innerHTML=list(enemy,TEST_FACTION)||'<p>편성된 함대가 없습니다.</p>';
 ownList.querySelectorAll('[data-test-select]').forEach(el=>el.onclick=event=>{
  selectCombatTestUnits(session,[el.dataset.testSelect],event.shiftKey);
  ownList.querySelector('[data-test-select="'+el.dataset.testSelect+'"]')?.focus();
 });
}

function beginCombatTestPlay(){
 const session=combatTestSession;
 if(!session||session.game||!session.draft.confirmed)return;
 session.game=createCombatTestGame(session.draft);
 renderCombatTest('턴 1 · 소유 함대를 선택한 뒤 성계를 누르세요.');
}
function moveCombatTestFleets(to){
 const session=combatTestSession;
 if(!session?.game||session.turnPending||session.game.military.battle)return;
 try{
  const result=beginFleetOrder(session.game,[...session.selected],to);
  if(result.pending){combatPreview=session.game;showFleetBattle('',combatPreview);return}
  renderCombatTest(session.game.stars[to].name+' · 함대 이동 완료');
 }catch(e){renderCombatTest(e.message)}
}
function nextCombatTestTurn(){
 const session=combatTestSession;
 if(!session?.game||session.turnPending||session.game.military.battle)return;
 const {game}=session;
 session.turnPending=true;
 if(settleFleetTurn(game,planCombatTestAI(game,session.draft.posture))===null){combatPreview=game;showFleetBattle('',game);return}
 const returns=completeCombatTestTurn(session);
 renderCombatTest(returns?.join(' · '));
}
function exitCombatTestBattle(){
 combatPreview=null;closeDialog();renderCombatTest();
}

function combatTestTabs(tab){
 const owner=combatTestSession.owner;
 const tabs=[['fleets','함대 리스트'],['designs','함선 설계'],['cost','데이터']];
 return '<nav class="fleet-workspace-tabs" aria-label="전투 테스팅 함대 메뉴">'+
  tabs.map(([id,label])=>'<button data-test-tab="'+id+'" aria-pressed="'+(id===tab)+'">'+label+'</button>').join('')+
  '<select id="combatTestSide" aria-label="진영">'+TEST_SIDES.map(id=>'<option value="'+id+'"'+(owner===id?' selected':'')+'>'+testSideName(id)+'</option>').join('')+'</select></nav>';
}
function bindCombatTestTabs(tab){
 $('combatTestSide').onchange=e=>{combatTestSession.owner=e.target.value;combatTestSession.detailFleetId=null;combatTestSession.detailCorpsId=null;showCombatTestDetails(tab)};
 $('modalBody').querySelectorAll('[data-test-tab]').forEach(el=>el.onclick=()=>showCombatTestDetails(el.dataset.testTab));
}
const combatTestMoney=values=>Object.entries(values).map(([id,n])=>safeText(DATA.resources[id]||id)+' '+Number(n.toFixed(3))).join(' · ')||'—';

function combatTestDataMarkup(session,book){
 const plans=testFleetRows({...session,game:null},session.owner);
 const ships=session.game?.military.ships.filter(s=>s.owner===session.owner);
 const upkeep={};
 for(const costs of ships?ships.map(s=>s.assembly.upkeep):plans.map(f=>f.upkeep)){
  for(const [id,value] of Object.entries(costs))upkeep[id]=(upkeep[id]||0)+value;
 }
 const plannedCount=plans.reduce((n,f)=>n+f.count,0);
 const row=(name,cost,turns,maintenance,total=false)=>`<tr${total?' class="test-cost-total"':''}><th scope="row">${safeText(name)}</th><td>${combatTestMoney(cost)}</td><td>${turns}</td><td>${combatTestMoney(maintenance)}</td></tr>`;
 const designRows=book.shipDesigns.map(d=>{
  const a=assembleShipDesign(d);
  return row(d.name,a.buildCost,COMBAT_HULLS.get(d.hullId).buildTurns,a.upkeep);
 });
 const planRows=plans.map(f=>row(f.name+' 합계',f.buildCost,f.turns,f.upkeep,true));
 return `<div class="fleet-data-summary"><div><small>${ships?'생존':'편성'} 함선</small><b>${ships?.length??plannedCount}척</b></div><div><small>턴당 ${ships?'현재':'예상'} 유지비</small><b>${combatTestMoney(upkeep)}</b></div></div>
  <p class="muted">건조 턴은 단일 조선소에서 차례로 생산할 때의 값입니다. 함대 합계는 시작 전 편성을 기준으로 합니다.</p>
  <div class="test-cost-table"><table><thead><tr><th>설계·함대</th><th>건조 자원</th><th>건조 턴</th><th>턴당 유지비</th></tr></thead><tbody>${designRows.join('')}${planRows.join('')}</tbody></table></div>`;
}

function combatTestDraftFleetDetail(book,corps,fleet){
 const {id,name,entries}=fleet;
 const totals=combatTestFleetSummary(book,fleet);
 const edit=`data-fleet="${id}" data-corps="${corps?.id??''}"`;
 const designs=new Map(book.shipDesigns.map(d=>[d.id,d]));
 const options=book.shipDesigns.map(d=>`<option value="${safeText(d.id)}">${safeText(d.name)} · 규모 ${DATA.combat.fleets.classCosts[d.hullId]}</option>`).join('');
 const members=entries.map((entry,index)=>({design:designs.get(entry.designId),hullId:designs.get(entry.designId).hullId,count:entry.count,index}));
 const composition=fleetCompositionMarkup(members,({design,hullId,count,index})=>{
  const label=safeText(design.name),a=assembleShipDesign(design);
  const full=totals.points+DATA.combat.fleets.classCosts[hullId]>DATA.combat.fleets.maxCapacity;
  return `<div class="fleet-card-member"><div class="fleet-member-line"><strong>${label}</strong><div class="fleet-stepper">
   <button class="fleet-step" aria-label="${label} 한 척 제거" data-test-edit="decrement" data-entry="${index}" ${edit}>−</button><b>${count}</b>
   <button class="fleet-step" aria-label="${label} 한 척 추가" data-test-edit="increment" data-entry="${index}" ${edit}${full?' disabled':''}>+</button></div></div>${fleetDefenseMarkup(a.shield,a.armor,a)}</div>`;
 });
 const others=book.corps.filter(c=>c!==corps).map(c=>`<option value="${c.id}">${safeText(c.name)}</option>`);
 if(corps)others.push('<option value="">독립 함대</option>');
 const transfer=others.length?`<div class="fleet-inline-actions"><label>소속 <select data-test-transfer="${id}">${others.join('')}</select></label><button data-test-edit="transfer" ${edit}>소속 변경</button></div>`:'';
 const nameField=`<input aria-label="함대 이름" data-test-fleet-name="${id}" maxlength="60" value="${safeText(name)}">`;
 return fleetDetailHeader(name,(corps?.name??'독립 함대')+' · 편성 시 방어 수치',totals.points,nameField)+`<h4>함선 구성 · ${totals.count}척</h4>${composition}
  <div class="fleet-inline-actions"><label>편성할 설계 <select data-test-design="${id}">${options}</select></label><button data-test-edit="add-ship" ${edit}>+ 함선 추가</button></div>
  ${transfer}<button data-test-edit="remove-fleet" ${edit}>함대 삭제</button>`;
}

function combatTestFleetMarkup(session,book){
 const {game,owner}=session;
 const rows=testFleetRows(session,owner);
 const focused=rows.find(f=>String(f.id)===session.detailFleetId);
 const focusedCorps=book.corps.find(c=>String(c.id)===session.detailCorpsId);
 const expanded=session.expandedCorps??=new Set();
 const fleetRow=f=>`<div class="fleet-workspace-row${f===focused?' focused':''}"><button data-test-fleet-focus="${f.id}" aria-pressed="${f===focused}">${fleetFormationIcon('fleet')}<b>${safeText(f.name)}</b><span class="fleet-size-chip">${f.points} / ${DATA.combat.fleets.maxCapacity}</span><small>${f.count}척${game?' · '+f.location:''}</small></button></div>`;
 const groups=book.corps.map(c=>{
  const fleets=rows.filter(f=>f.corpsId===c.id),open=expanded.has(String(c.id));
  const active=c===focusedCorps||focused?.corpsId===c.id;
  return `<div class="fleet-corps-group"><div class="fleet-workspace-row fleet-corps-row${active?' focused':''}"><button data-test-corps-focus="${c.id}" aria-expanded="${open}" aria-controls="corps-fleets-${c.id}">${fleetFormationIcon('corps')}<b>${safeText(c.name)}</b><span class="fleet-tree-chevron" aria-hidden="true"></span><small>소속 함대 ${fleets.length}개</small></button></div>
   <div class="fleet-tree-children" id="corps-fleets-${c.id}"${open?'':' hidden'}>${open?(fleets.map(fleetRow).join('')||'<p class="muted">소속 함대가 없습니다.</p>'):''}</div></div>`;
 }).join('');
 const independent=rows.filter(f=>f.corpsId===null).map(fleetRow).join('');
 const list=groups+(groups&&independent?'<h4 class="fleet-tree-divider">독립 함대</h4>':'')+independent||'<p class="muted">편성된 함대가 없습니다.</p>';
 const create=game?'':'<button data-test-edit="add-fleet">새 함대 창설</button>';
 const actions=game?'':'<div class="test-config-actions"><button data-test-edit="add-corps">군단 추가</button><button id="confirmCombatTest" class="primary">양측 편성 확인</button></div>';
 let detail='<p class="muted">자세히 볼 군단이나 함대를 선택하세요.</p>';
 if(focused&&game){
  const fleet=game.military.fleets.find(f=>f.id===focused.id);
  const members=game.military.ships.filter(s=>fleet.shipIds.includes(s.id));
  const subtitle=fleet.status==='missing'?'긴급 워프 중':`${game.stars[fleet.systemId].name} · AP ${focused.ap}`;
  detail=fleetDetailHeader(fleet.name,subtitle,focused.points)+`<h4>함선 구성 · ${members.length}척</h4>`+fleetCompositionMarkup(members,fleetMemberStatusMarkup);
  if(fleet.status==='missing')detail+=`<p>${focused.location}</p>`;
 }else if(focused){
  const {fleet,corps}=combatTestDraftFleets(book).find(({fleet})=>fleet.id===focused.id);
  detail=combatTestDraftFleetDetail(book,corps,fleet);
 }else if(focusedCorps){
  const {id,name}=focusedCorps;
  const fleets=rows.filter(f=>f.corpsId===id);
  detail=`<header class="fleet-detail-heading"><h3>${fleetFormationIcon('corps')}${safeText(name)}</h3><small>소속 함대 ${fleets.length}개</small></header><p class="muted">왼쪽에서 소속 함대를 선택하세요.</p>`;
  if(!game)detail+=`<div class="fleet-inline-actions"><label>군단 이름 <input data-test-corps-name="${id}" maxlength="60" value="${safeText(name)}"></label>
   <button data-test-edit="add-fleet" data-corps="${id}">소속 함대 추가</button><button data-test-edit="remove-corps" data-corps="${id}"${fleets.length?' disabled':''}>빈 군단 삭제</button></div>`;
 }
 return fleetWorkspaceMarkup(list,detail,create)+actions;
}
function showCombatTestDetails(tab='fleets',message='',keepScroll=false){
 const session=combatTestSession,draft=session.draft,book=draft.sides[session.owner],started=!!session.game;
 const description=testSideName(session.owner)+' · '+(started?'플레이 진행 중':'모든 함체·모듈 사용 가능 · 최대 편제 규모 '+DATA.combat.fleets.maxCapacity);
 lockEncounterUI(true);
 if(tab==='designs'&&!started){
  showShipDesigner(null,{book,description,navigation:combatTestTabs(tab),bindNavigation:()=>bindCombatTestTabs(tab),onSaved:()=>{draft.confirmed=false;renderCombatTest()}});
  return;
 }
 let content;
 if(tab==='cost')content=combatTestDataMarkup(session,book);
 else if(tab==='designs')content=book.shipDesigns.map(d=>{
  const a=assembleShipDesign(d);
  return `<div class="fleet-member">${combatHullIcon(d.hullId)}<div><strong>${safeText(d.name)}</strong><small>장갑 ${a.armor.toFixed(1)} · 보호막 ${a.shield.toFixed(1)} · 무장 ${a.weapons.length}개</small></div></div>`;
 }).join('');
 else content=combatTestFleetMarkup(session,book);
 openFleetWorkspace('전투 테스팅 · 상세 보기',description,combatTestTabs(tab),(message?'<p role="alert">'+safeText(message)+'</p>':'')+content,keepScroll);
 bindCombatTestTabs(tab);
 $('modalBody').querySelectorAll('[data-test-fleet-focus]').forEach(el=>el.onclick=()=>{
  session.detailFleetId=el.dataset.testFleetFocus;session.detailCorpsId=null;showCombatTestDetails();
 });
 $('modalBody').querySelectorAll('[data-test-corps-focus]').forEach(el=>el.onclick=()=>{
  const id=el.dataset.testCorpsFocus;
  if(session.expandedCorps.delete(id)){
   if(session.detailCorpsId===id)session.detailCorpsId=null;
  }else{
   session.expandedCorps.add(id);session.detailCorpsId=id;session.detailFleetId=null;
  }
  showCombatTestDetails('fleets','',true);
  $('modalBody').querySelector(`[data-test-corps-focus="${id}"]`)?.focus({preventScroll:true});
 });
 if(tab==='fleets'&&!started)bindCombatTestEditor(book,draft);
}

function bindCombatTestEditor(book,draft){
 const body=$('modalBody');
 const saveNames=()=>{
  for(const corps of book.corps){
   const name=body.querySelector('[data-test-corps-name="'+corps.id+'"]')?.value.trim();if(name)corps.name=name;
  }
  for(const {fleet} of combatTestDraftFleets(book)){
   const value=body.querySelector('[data-test-fleet-name="'+fleet.id+'"]')?.value.trim();if(value)fleet.name=value;
  }
 };
 body.querySelectorAll('[data-test-corps-name],[data-test-fleet-name]').forEach(el=>el.onchange=()=>{saveNames();draft.confirmed=false;renderCombatTest()});
 $('confirmCombatTest').onclick=()=>{
  saveNames();
  try{validateCombatTestDraft(draft);draft.confirmed=true;closeDialog();renderCombatTest()}
  catch(e){showCombatTestDetails('fleets',e.message)}
 };
 body.querySelectorAll('[data-test-edit]').forEach(el=>el.onclick=()=>{
  saveNames();
  const {testEdit,corps:corpsId,fleet:fleetId,entry}=el.dataset;
  const session=combatTestSession;
  const corps=book.corps.find(c=>c.id===Number(corpsId));
  const fleets=corps?.fleets??book.independentFleets,fleet=fleets.find(f=>f.id===Number(fleetId));
  try{
   if(fleetId&&!fleet)throw Error('선택한 함대를 찾을 수 없습니다.');
   if(testEdit==='add-corps'){
    const created={id:draft.nextId++,name:'새 군단',fleets:[]};
    book.corps.push(created);session.detailCorpsId=String(created.id);session.expandedCorps.add(session.detailCorpsId);session.detailFleetId=null;
   }
   if(testEdit==='remove-corps'&&!corps.fleets.length){book.corps=book.corps.filter(c=>c!==corps);session.expandedCorps.delete(String(corps.id))}
   if(testEdit==='add-fleet'){
    const newFleet={id:draft.nextId++,name:'새 함대',entries:[]};
    fleets.push(newFleet);session.detailFleetId=String(newFleet.id);session.detailCorpsId=null;
   }
   if(testEdit==='remove-fleet'){
    fleets.splice(fleets.indexOf(fleet),1);session.detailFleetId=null;session.detailCorpsId=corps?String(corps.id):null;
   }
   if(testEdit==='transfer'){
    const id=body.querySelector('[data-test-transfer="'+fleet.id+'"]').value;
    const destination=id?book.corps.find(c=>c.id===Number(id))?.fleets:book.independentFleets;
    if(!destination||destination===fleets)throw Error('이동할 소속을 선택하세요.');
    fleets.splice(fleets.indexOf(fleet),1);destination.push(fleet);
    if(id)session.expandedCorps.add(id);
   }
   if(['add-ship','increment','decrement'].includes(testEdit)){
    const entries=fleet.entries.map(row=>({...row}));
    const id=testEdit==='add-ship'?body.querySelector('[data-test-design="'+fleet.id+'"]').value:entries[Number(entry)].designId;
    const row=entries.find(item=>item.designId===id);
    if(row)row.count+=testEdit==='decrement'?-1:1;else entries.push({designId:id,count:1});
    const modified=entries.filter(item=>item.count>0);
    combatTestFleetSummary(book,{...fleet,entries:modified});fleet.entries=modified;
   }
   draft.confirmed=false;renderCombatTest();showCombatTestDetails('fleets','',true);
  }catch(e){showCombatTestDetails('fleets',e.message,true)}
 });
}

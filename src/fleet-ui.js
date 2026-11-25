let selectedFleetIds=[],fleetMoveMode=false,fleetManagerFocus=null;
function clearFleetSelection(){selectedFleetIds=[];fleetMoveMode=false;fleetManagerFocus=null}
function fleetMoveTargets(ids=selectedFleetIds){
 return availableFleetOrders(state,ids);
}
function selectMapFleet(id,multi=false){
 if(motionBusy)return;
 activeShip=null;moveMode=false;scanMode=false;colonizeMode=false;fleetMoveMode=false;
 selectedFleetIds=updateFleetSelection(selectedFleetIds,[id],multi);render();
}
async function commandFleetMove(to,viaGateway=false){
 if(motionBusy)return;
 try{
  const result=beginFleetOrder(state,selectedFleetIds,to,'player',viaGateway);dirty=true;fleetMoveMode=false;
  if(animateFleetMovement()&&result.routes.some(route=>route.from!==to)){
   if(result.pending)rememberEncounterView();
   await playMilitaryFleetWarp(state,result,id=>{view='system';sysId=selected=id;render();return $('planetList')}).catch(error=>console.warn(error));
  }else if(view==='system')sysId=to;
  if(result.pending){showPendingEncounter();return}
  selected=to;
  rec(result.capture?captureMessage(state,result):(viaGateway?'함대 관문 이동':'함대 공동 이동')+' · '+state.stars[to].name+' · '+result.routes.length+'개 함대');render();
 }catch(e){openDialog('함대 명령',e.message,'')}
}
function renderFleetSelection(){
 if(!state.military)return;
 selectedFleetIds=selectedFleetIds.filter(id=>state.military.fleets.some(f=>f.id===id&&f.owner==='player'&&f.status!=='missing'));
 if(!selectedFleetIds.length)return;
 const fs=selectedFleetIds.map(id=>state.military.fleets.find(f=>f.id===id));
 $('shipPanel').classList.add('has-selection');
 $('selectedShipInfo').innerHTML=fleetSelectionMarkup(state,fs);
 const hint=$('shipPanel').querySelector(':scope > p');hint.textContent=fleetMoveMode?(view==='system'?'항로 선택 · Esc 취소':'목적지 클릭 · Esc 취소'):'';hint.style.display=fleetMoveMode?'block':'none';
 const localMove=view==='system'&&canRepositionFleets(state,selectedFleetIds,sysId);
 $('scanBtn').classList.add('hide');$('colonizeBtn').classList.add('hide');$('moveBtn').disabled=!localMove&&!fleetMoveTargets().size;
 $('moveBtn').setAttribute('aria-pressed',String(fleetMoveMode));
}
function campaignFleetDetail(game,fleet,ownedShips,assigned,openRosters){
 if(!fleet)return '<p class="muted">함대 선택</p>';
 const transit=game.military.transits.find(t=>t.fleetId===fleet.id);
 const members=ownedShips.filter(s=>fleet.shipIds.includes(s.id));
 const location=fleet.status==='missing'?'긴급 워프 중':game.stars[fleet.systemId].name+' · 행동력 '+fleetAP(game,fleet);
 const missing=fleet.status==='missing';
 const composition=fleetCompositionMarkup(members,ship=>fleetMemberStatusMarkup(ship,missing?'':`<button class="fleet-step" data-remove="${ship.id}" data-fleet="${fleet.id}" aria-label="${safeText(ship.name)} 편성 해제">−</button>`));
 const header=fleetDetailHeader(fleet.name,location,fleetCapacity(game,fleet))+fleetReservationMarkup(game,fleet)+`<h4>함선 구성 · ${members.length}척</h4>`+composition;
 if(fleet.status==='missing')return header+'<p>'+warpStatusText(game,transit)+'</p>';
 const reserve=ownedShips.filter(s=>s.systemId===fleet.systemId&&!assigned.has(s.id));
 const options=reserve.map(s=>`<option value="${s.id}">${safeText(s.name)} · 규모 ${DATA.combat.fleets.classCosts[s.hullId]} · 행동력 ${s.ap}</option>`).join('');
 return header+`<details data-roster="${fleet.id}"${openRosters.has(fleet.id)?' open':''}><summary>예비 함선 추가</summary>
  <div class="fleet-inline-actions"><label>예비 함선 <select data-reserve="${fleet.id}"${reserve.length?'':' disabled'}>${options||'<option>같은 성계에 예비 함선 없음</option>'}</select></label>
  <button data-add="${fleet.id}"${reserve.length?'':' disabled'}>＋ 편성</button></div></details>
  <div class="fleet-inline-actions"><label>함대 이름 <input data-fleet-name="${fleet.id}" maxlength="60" value="${safeText(fleet.name)}"></label><button data-rename="${fleet.id}">이름 변경</button>
  <button data-disband="${fleet.id}"${fleet.shipIds.length?' disabled':''} title="빈 함대만 해산 가능">해산</button></div>
  <div class="fleet-inline-actions fleet-orders"><button id="moveFocusedFleet"${fleetAP(game,fleet)>0?'':' disabled'}>이동 / 공격</button><button id="openFleetReinforcement">증원</button>${game.stars[fleet.systemId].owned?'<button id="openFleetShipyard">조선소 · 수리</button>':''}</div>`;
}

function fleetCreationMarkup(owned){
 const options=owned.map(s=>`<option value="${s.id}">${safeText(s.name)}</option>`).join('');
 return `<details class="fleet-create"><summary>새 함대 창설</summary>
  <div class="fleet-inline-actions"><label>함대 이름 <input id="newFleetName" maxlength="60" value="새 함대"></label>
  <label>창설 성계 <select id="newFleetSystem">${options}</select></label>
  <button id="createFleet"${owned.length?'':' disabled'}>창설</button></div></details>`;
}

function bindOwnedFleetDetail(game,fleet,{apply,onMove,onRepair,onReinforce}){
 const body=$('modalBody');
 const bind=(selector,handler)=>body.querySelectorAll(selector).forEach(el=>el.onclick=()=>apply(()=>handler(el.dataset)));
 bind('[data-rename]',({rename:id})=>renameFleet(game,id,body.querySelector('[data-fleet-name="'+id+'"]').value));
 bind('[data-disband]',({disband:id})=>disbandFleet(game,id));
 bind('[data-remove]',({fleet:id,remove})=>removeFleetShip(game,id,remove));
 bind('[data-add]',({add:id})=>assignFleetShip(game,id,body.querySelector('[data-reserve="'+id+'"]').value));
 if(!fleet||fleet.status==='missing')return;
 $('moveFocusedFleet').onclick=onMove;
 $('openFleetReinforcement').onclick=onReinforce;
 if(game.stars[fleet.systemId].owned)$('openFleetShipyard').onclick=onRepair;
}

function showFleetManager(message='',openRosters=new Set()){
 initializeShipDesigns(state);initializeFleets(state);
 const m=state.military,fs=m.fleets.filter(f=>f.owner==='player'),owned=state.stars.filter(s=>s.owned);
 const ownedShips=m.ships.filter(s=>s.owner==='player');
 const assigned=new Set(m.fleets.flatMap(f=>f.shipIds));
 const selected=fs.find(f=>f.id===fleetManagerFocus);
 fleetManagerFocus=selected?.id??null;
 const fleetRows=fs.map(f=>{
  const missing=f.status==='missing',focused=f.id===fleetManagerFocus;
  const location=missing?warpStatusText(state,m.transits.find(t=>t.fleetId===f.id)):safeText(state.stars[f.systemId].name)+' · 행동력 '+fleetAP(state,f);
  return `<div class="fleet-workspace-row${focused?' focused':''}"><button data-fleet-focus="${f.id}" aria-pressed="${focused}">${fleetFormationIcon('fleet')}<b>${safeText(f.name)}</b>${fleetCapacityChip(fleetCapacity(state,f))}<small>${f.shipIds.length}척 · ${location}</small></button></div>`;
 }).join('');
 const locationOptions=owned.map(s=>`<option value="${s.id}">${safeText(s.name)}</option>`).join('');
 const creation=fleetCreationMarkup(owned);
 const factions=[...new Set(m.ships.filter(s=>militaryKnown(state,s.systemId,'player')).map(s=>s.owner))].filter(owner=>owner!=='player');
 const relations='<details><summary>교전 관계</summary>'+factions.map(owner=>'<p>'+safeText(owner)+' · '+(factionsHostile(state,'player',owner)?'적대':'중립')+' <button data-hostility="'+safeText(owner)+'">'+(factionsHostile(state,'player',owner)?'적대 해제':'적대 설정')+'</button></p>').join('')+'</details>';
 const transitNotes=m.transits.filter(t=>t.owner==='player'&&t.fleetId===null).map(t=>'<p>예비 함선 '+t.shipIds.length+'척 · '+warpStatusText(state,t)+'</p>').join('');
 const detached=m.reinforcements.filter(o=>o.fleetId===null&&o.ship.owner==='player').map(o=>
  '<li>'+safeText(o.ship.name)+' · '+safeText(state.stars[o.sourceSystemId??o.ship.systemId].name)+' · '+o.arrivalTurn+'턴</li>').join('');
 const independentArrivals=detached?'<details><summary>독립 함대 배치 예정</summary><ul>'+detached+'</ul></details>':'';
 const testTools=DATA.combat.fleets.testDeploymentEnabled?`<details><summary>TEST 함선 배치</summary><select id="testShipDesign">${state.shipDesigns.map(d=>`<option value="${safeText(d.id)}">${safeText(d.name)}</option>`).join('')}</select><select id="testShipSystem">${locationOptions}</select><button id="testShipDeploy"${owned.length?'':' disabled'}>TEST 예비 함선 생성</button></details>`:'';
 const list=fleetRows||'<p class="muted">편성된 함대 없음</p>';
 const content=(message?'<p role="alert">'+safeText(message)+'</p>':'')+fleetWorkspaceMarkup(list,campaignFleetDetail(state,selected,ownedShips,assigned,openRosters),creation)+transitNotes+independentArrivals+relations+testTools;
 openFleetWorkspace('함대 관리','',campaignFleetTabs('fleets'),content);
 bindCampaignFleetTabs('fleets');
 const action=fn=>{
  const expanded=new Set([...$('modalBody').querySelectorAll('[data-roster][open]')].map(el=>el.dataset.roster));
  try{fn();dirty=true;showFleetManager('',expanded);render()}catch(e){showFleetManager(e.message,expanded)}
 };
 const bind=(selector,handler)=>$('modalBody').querySelectorAll(selector).forEach(el=>el.onclick=()=>handler(el));
 bind('[data-fleet-focus]',el=>{fleetManagerFocus=el.dataset.fleetFocus;showFleetManager()});
 bind('[data-hostility]',el=>action(()=>setMilitaryHostility(state,'player',el.dataset.hostility,!factionsHostile(state,'player',el.dataset.hostility))));
 $('createFleet').onclick=()=>action(()=>{fleetManagerFocus=createFleet(state,$('newFleetName').value,Number($('newFleetSystem').value)).id});
 const move=()=>{
  const ids=[selected.id];
  if(!fleetMoveTargets(ids).size){showFleetManager('선택한 함대가 이동할 수 있는 목적지가 없습니다.');return}
  selectedFleetIds=ids;activeShip=null;moveMode=false;scanMode=false;colonizeMode=false;
  fleetMoveMode=true;closeDialog();view='galaxy';render();
 };
 bindOwnedFleetDetail(state,selected,{apply:action,onMove:move,onRepair:()=>showShipyards(selected.systemId,'',selected.id),onReinforce:()=>showFleetReinforcement(selected.id)});
 if($('testShipDeploy'))$('testShipDeploy').onclick=()=>action(()=>deployTestMilitaryShip(state,$('testShipDesign').value,Number($('testShipSystem').value)));
}
function fleetMapSymbols(system){
 if(!state.military)return '';
 const fleets=state.military.fleets.filter(f=>f.owner==='player'&&f.systemId===system.id);
 return fleets.map((f,i)=>{
  const row=Math.floor(i/4),count=Math.min(4,fleets.length-row*4);
  const x=system.x+(i%4-(count-1)/2)*26,y=system.y+52+row*24;
  const selected=selectedFleetIds.includes(f.id);
  return `<g class="fleethit galaxy-fleet-badge" data-fleet="${f.id}" role="button" tabindex="0" aria-label="${safeText(f.name)}" aria-pressed="${selected}" transform="translate(${x} ${y})"><title>${safeText(f.name)} · ${fleetCapacityText(fleetCapacity(state,f))} · 행동력 ${fleetAP(state,f)}</title><path class="fleet-badge-frame" d="M0 -11 10 -6V6L0 11-10 6V-6Z"/>${galaxyFleetGlyph(selected?'#ffe3a0':'#9dd7e6',selected?'#ffe3a0':'#5898a8')}</g>`;
 }).join('');
}

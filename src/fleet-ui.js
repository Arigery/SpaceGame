let selectedFleetIds=[],fleetMoveMode=false,fleetManagerFocus=null;
function clearFleetSelection(){selectedFleetIds=[];fleetMoveMode=false;fleetManagerFocus=null}
function fleetMoveTargets(ids=selectedFleetIds){
 const targets=new Map();if(!ids.length||!state.military)return targets;
 for(const s of state.stars){try{targets.set(s.id,planFleetOrder(state,ids,s.id))}catch{}}
 return targets;
}
function selectMapFleet(id,multi=false){
 if(motionBusy)return;
 activeShip=null;moveMode=false;scanMode=false;colonizeMode=false;fleetMoveMode=false;
 selectedFleetIds=multi?(selectedFleetIds.includes(id)?selectedFleetIds.filter(f=>f!==id):[...selectedFleetIds,id]):[id];render();
}
function commandFleetMove(to){
 if(motionBusy)return;
 try{
  const result=beginFleetOrder(state,selectedFleetIds,to);dirty=true;fleetMoveMode=false;
  if(result.pending){showPendingEncounter();return}
  selected=to;
  rec('함대 공동 이동 · '+state.stars[to].name+' · '+result.routes.length+'개 함대');render();
 }catch(e){openDialog('함대 명령',e.message,'')}
}
function renderFleetSelection(){
 if(!state.military)return;
 selectedFleetIds=selectedFleetIds.filter(id=>state.military.fleets.some(f=>f.id===id&&f.owner==='player'&&f.status!=='missing'));
 if(!selectedFleetIds.length)return;
 const fs=selectedFleetIds.map(id=>state.military.fleets.find(f=>f.id===id));
 $('shipPanel').classList.add('has-selection');
 $('selectedShipInfo').innerHTML='<b>함대 '+fs.length+'개 선택</b><p>'+fs.map(f=>safeText(f.name)+' · '+fleetPoints(state,f)+'/50 · AP '+fleetAP(state,f)).join('<br>')+'</p><small>공동 이동 한도: '+Math.min(...fs.map(f=>fleetAP(state,f)))+'</small>';
 const hint=$('shipPanel').querySelector(':scope > p');hint.textContent=fleetMoveMode?'강조된 목적지 클릭 → 공동 이동/공격 · Esc 취소':'';hint.style.display=fleetMoveMode?'block':'none';
 $('scanBtn').classList.add('hide');$('colonizeBtn').classList.add('hide');$('moveBtn').disabled=!fleetMoveTargets().size;
 $('moveBtn').setAttribute('aria-pressed',String(fleetMoveMode));
}
function campaignFleetDetail(game,fleet,ownedShips,assigned,openRosters){
 if(!fleet)return '<p class="muted">자세히 볼 함대를 선택하세요.</p>';
 const transit=game.military.transits.find(t=>t.fleetId===fleet.id);
 const points=fleetPoints(game,fleet);
 const members=ownedShips.filter(s=>fleet.shipIds.includes(s.id));
 const location=fleet.status==='missing'?'긴급 워프 중':game.stars[fleet.systemId].name+' · AP '+fleetAP(game,fleet);
 const missing=fleet.status==='missing';
 const composition=fleetCompositionMarkup(members,ship=>fleetMemberStatusMarkup(ship,missing?'':`<button class="fleet-step" data-remove="${ship.id}" data-fleet="${fleet.id}" aria-label="${safeText(ship.name)} 편성 해제">−</button>`));
 const header=fleetDetailHeader(fleet.name,location,points)+`<h4>함선 구성 · ${members.length}척</h4>`+composition;
 if(fleet.status==='missing')return header+'<p>'+warpStatusText(game,transit)+'</p>';
 const reserve=ownedShips.filter(s=>s.systemId===fleet.systemId&&!assigned.has(s.id));
 const options=reserve.map(s=>`<option value="${s.id}">${safeText(s.name)} · 규모 ${DATA.combat.fleets.classCosts[s.hullId]} · AP ${s.ap}</option>`).join('');
 return header+`<details data-roster="${fleet.id}"${openRosters.has(fleet.id)?' open':''}><summary>예비 함선 추가</summary>
  <div class="fleet-inline-actions"><label>예비 함선 <select data-reserve="${fleet.id}"${reserve.length?'':' disabled'}>${options||'<option>같은 성계에 예비 함선 없음</option>'}</select></label>
  <button data-add="${fleet.id}"${reserve.length?'':' disabled'}>+ 편성 추가</button></div></details>
  <div class="fleet-inline-actions"><label>함대 이름 <input data-fleet-name="${fleet.id}" maxlength="60" value="${safeText(fleet.name)}"></label><button data-rename="${fleet.id}">이름 변경</button>
  <button data-disband="${fleet.id}"${fleet.shipIds.length?' disabled':''}>빈 함대 해산</button></div>
  <div class="fleet-inline-actions"><button id="moveFocusedFleet"${fleetAP(game,fleet)>0?'':' disabled'}>이동 / 공격</button></div>`;
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
  const location=missing?warpStatusText(state,m.transits.find(t=>t.fleetId===f.id)):safeText(state.stars[f.systemId].name)+' · AP '+fleetAP(state,f);
  return `<div class="fleet-workspace-row${focused?' focused':''}"><button data-fleet-focus="${f.id}" aria-pressed="${focused}">${fleetFormationIcon('fleet')}<b>${safeText(f.name)}</b><span class="fleet-size-chip">${fleetPoints(state,f)} / ${DATA.combat.fleets.maxCapacity}</span><small>${f.shipIds.length}척 · ${location}</small></button></div>`;
 }).join('');
 const locationOptions=owned.map(s=>`<option value="${s.id}">${safeText(s.name)}</option>`).join('');
 const creation=`<details class="fleet-create"><summary>새 함대 창설</summary>
  <div class="fleet-inline-actions"><label>함대 이름 <input id="newFleetName" maxlength="60" value="새 함대"></label>
  <label>창설 성계 <select id="newFleetSystem">${locationOptions}</select></label>
  <button id="createFleet"${owned.length?'':' disabled'}>창설</button></div></details>`;
 const factions=[...new Set(m.ships.filter(s=>militaryKnown(state,s.systemId,'player')).map(s=>s.owner))].filter(owner=>owner!=='player');
 const relations='<details><summary>교전 관계</summary>'+factions.map(owner=>'<p>'+safeText(owner)+' · '+(factionsHostile(state,'player',owner)?'적대':'중립')+' <button data-hostility="'+safeText(owner)+'">'+(factionsHostile(state,'player',owner)?'적대 해제':'적대 설정')+'</button></p>').join('')+'</details>';
 const transitNotes=m.transits.filter(t=>t.owner==='player'&&t.fleetId===null).map(t=>'<p>예비 함선 '+t.shipIds.length+'척 · '+warpStatusText(state,t)+'</p>').join('');
 const testTools=DATA.combat.fleets.testDeploymentEnabled?`<details><summary>TEST 함선 배치</summary><select id="testShipDesign">${state.shipDesigns.map(d=>`<option value="${safeText(d.id)}">${safeText(d.name)}</option>`).join('')}</select><select id="testShipSystem">${locationOptions}</select><button id="testShipDeploy"${owned.length?'':' disabled'}>TEST 예비 함선 생성</button></details>`:'';
 const list=fleetRows||'<p class="muted">편성된 함대가 없습니다.</p>';
 const content=(message?'<p role="alert">'+safeText(message)+'</p>':'')+fleetWorkspaceMarkup(list,campaignFleetDetail(state,selected,ownedShips,assigned,openRosters),creation)+transitNotes+relations+testTools;
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
 bind('[data-rename]',el=>action(()=>renameFleet(state,el.dataset.rename,$('modalBody').querySelector('[data-fleet-name="'+el.dataset.rename+'"]').value)));
 bind('[data-disband]',el=>action(()=>disbandFleet(state,el.dataset.disband)));
 bind('[data-remove]',el=>action(()=>removeFleetShip(state,el.dataset.fleet,el.dataset.remove)));
 bind('[data-add]',el=>action(()=>assignFleetShip(state,el.dataset.add,$('modalBody').querySelector('[data-reserve="'+el.dataset.add+'"]').value)));
 if(selected&&selected.status!=='missing')$('moveFocusedFleet').onclick=()=>{
  const ids=[selected.id];
  if(!fleetMoveTargets(ids).size){showFleetManager('선택한 함대가 이동할 수 있는 목적지가 없습니다.');return}
  selectedFleetIds=ids;activeShip=null;moveMode=false;scanMode=false;colonizeMode=false;
  fleetMoveMode=true;closeDialog();view='galaxy';render();
 };
 if($('testShipDeploy'))$('testShipDeploy').onclick=()=>action(()=>deployTestMilitaryShip(state,$('testShipDesign').value,Number($('testShipSystem').value)));
}
function fleetMapSymbols(system){
 if(!state.military)return '';
 return state.military.fleets.filter(f=>f.owner==='player'&&f.systemId===system.id).map((f,i)=>{
  const x=system.x-20+(i%4)*17,y=system.y+48+Math.floor(i/4)*18;
  return '<g class="fleethit" data-fleet="'+f.id+'" role="button" tabindex="0" aria-label="'+safeText(f.name)+'" transform="translate('+x+' '+y+')"><title>'+safeText(f.name)+' · '+fleetPoints(state,f)+'/50 · AP '+fleetAP(state,f)+'</title>'+galaxyFleetGlyph(selectedFleetIds.includes(f.id)?'#ffe3a0':'#8fbdcb')+'</g>';
 }).join('');
}

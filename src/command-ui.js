// Command deck: presentation and navigation only; gameplay rules stay in their modules.
function resourceIcon(id){
 return '<img class="resource-icon" src="assets/icons/'+id+'.svg" alt="" aria-hidden="true">';
}
function renderCommandUI(){
 $('civilizationName').textContent=state.civilizationName||(currentRace==='기본 종족'?'테라 문명':currentRace);
 document.querySelector('.layout').classList.toggle('galaxy-mode',view==='galaxy');
 document.querySelector('.layout').classList.toggle('system-mode',view==='system');
 $('galaxyNav').classList.toggle('active',view==='galaxy');
 $('galaxyNav').setAttribute('aria-current',view==='galaxy'?'page':'false');
 const panel=$('shipPanel');
 const hint=panel.querySelector('p');
 hint.textContent=colonizeMode?'중앙 항성을 클릭해 개척 · Esc 취소':scanMode?'빛나는 대상을 클릭해 탐사 · Esc 취소':moveMode?(view==='system'?'빛나는 항로를 클릭해 이동 · Esc 취소':'목적지 성계를 클릭해 이동 · Esc 취소'):'';
 hint.style.display=moveMode||scanMode||colonizeMode?'block':'none';
 panel.classList.toggle('has-selection',!!activeShip);
 $('scanBtn').classList.toggle('hide',!activeShip||activeShip==='colony');
 $('colonizeBtn').classList.toggle('hide',activeShip!=='colony');
 if(activeShip){
  const position=state.stars[state.ships[activeShip]];
  $('selectedShipInfo').innerHTML='<div class="ship-portrait"></div><div class="ship-readout"><b>'+safeText(shipName(activeShip))+'</b><small>'+safeText(position.name)+'</small><span>행동력 <strong>'+state.ap[activeShip]+' / 2</strong></span></div>';
  const model=modelCanvas(activeShip==='colony'?'colony':'ship',35);
  if(model)$('selectedShipInfo').querySelector('.ship-portrait').append(model);
 }
}
$('galaxyNav').onclick=()=>{if(motionBusy)return;closeDialog();view='galaxy';clearShipSelection();render()};
$('researchNav').onclick=()=>openDialog('연구','연구 시스템은 준비 중입니다.','');
$('fleetNav').onclick=()=>openDialog('전투 함선','현재 운용 중인 전투 함선이 없습니다.','');
$('notificationsBtn').onclick=()=>openDialog('알림','','<div class="empty-command-popup"></div>');
$('helpBtn').onclick=()=>openDialog('도움말','','<div class="empty-command-popup"></div>');
$('logBtn').onclick=()=>openDialog('진행 기록','턴 '+state.turn,
 '<ol class="command-log">'+state.records.map(record=>'<li>'+safeText(record)+'</li>').join('')+'</ol>',true);
function commandHabitablePlanets(){
 return state.stars.flatMap(s=>s.planets.map((p,index)=>({system:s,planet:p,index})))
  .filter(({system,planet})=>systemKnown(system.id)&&planet.type==='hab'&&targetSurveyed(system,planet));
}
$('planetsNav').onclick=()=>{
 const entries=commandHabitablePlanets();
 openDialog('거주 가능 행성','탐사를 완료한 거주 가능 행성',
 entries.length?'<div class="command-planet-list">'+entries.map(({system,planet,index})=>
 '<button class="slotRow" data-system="'+system.id+'" data-planet="'+index+'">'+resourceIcon('habitable')+
 '<span><strong>'+safeText(planet.label||system.name)+'</strong><small>'+safeText(system.name)+' · '+(system.owned?'개척 완료':'미개척')+'</small></span><span>→</span></button>').join('')+'</div>':'<p class="muted">확인된 거주 가능 행성이 없습니다.</p>',true);
 $('modalBody').querySelectorAll('[data-system]').forEach(button=>button.onclick=()=>{
  if(motionBusy)return;
  const id=Number(button.dataset.system),index=Number(button.dataset.planet);
  closeDialog();systemOpen(id);if(state.stars[id].owned)openHabitat(index);
 });
};

// Match the play area to the actual wrapping header, including narrow windows.
const commandHeaderObserver=new ResizeObserver(entries=>{
 const height=entries[0].target.getBoundingClientRect().height;
 if(height>0)document.documentElement.style.setProperty('--hud-height',height+'px');
});
commandHeaderObserver.observe(document.querySelector('.top'));

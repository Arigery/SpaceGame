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
// Planned victory routes: informational only, never evaluates game completion.
const VICTORY_OVERVIEW=[
 {id:'score',name:'점수',title:'점수 승리',summary:'제한 턴이 끝났을 때 가장 높은 종합 점수를 확보합니다.',conditions:['초기 제한: 180턴','영토·인구·연구·유물·외교 성과를 종합','다른 승리가 달성되지 않아도 종료되는 최종 경쟁'],note:'점수 가중치와 동점 처리 방식은 추후 결정합니다.'},
 {id:'science',name:'과학',title:'고대의 신호',summary:'고대 흔적을 조사하고 최종 과학 프로젝트를 완공합니다.',conditions:['고대 흔적 8곳에서 문명별로 유물 조각 획득','유물 조각 5개 이상 + 핵심 과학 기술 연구','소유 거주 가능 행성에서 최종 프로젝트 완공 · 시험 기간 10~12턴'],note:'프로젝트 시작 시 위치가 공개됩니다. 행성이 점령·파괴되면 중단됩니다. 기술·비용·최초 조사 추가 연구 보상량은 미정입니다.'},
 {id:'prosperity',name:'번영',title:'개척 연방',summary:'주요 관문에 거점을 세우고 하나의 개척 항로망으로 연결합니다.',conditions:['관문 성계 8개 중 4개에 연방 거점 건설','거점 조건: 소유 거주 행성 · 인구 6명 이상 · 공용 구역 Lv.3 이상','거점 건설 10턴 · 광물과 신소재 사용','거점 4개를 소유 항로망으로 연결해 8턴 유지'],note:'중간 성계가 점령·봉쇄되면 유지 카운터가 초기화됩니다. 거점 비용과 탈취·파괴 세부 규칙은 미정입니다.'},
 {id:'alliance',name:'연합',title:'은하 평의회',summary:'다른 문명의 지지를 확보해 외교적 승리를 달성합니다.',conditions:['교역·협정으로 외교 관계 형성','동맹과 은하 평의회를 통해 지지 확보'],note:'승리에 필요한 지지 조건·수치와 평의회 절차는 추후 기획합니다.'},
 {id:'domination',name:'패권',title:'정복',summary:'모든 경쟁 문명의 수도를 점령하거나 항복시킵니다.',conditions:['함선 생산과 군사력 확보','경쟁 문명의 수도 점령 또는 항복 유도'],note:'전투·점령·항복 시스템과 함께 상세 설계합니다. 수도 상실만으로 즉시 탈락시키지 않는 방향을 검토 중입니다.'}
];
function showVictoryOverview(category='score'){
 const entry=VICTORY_OVERVIEW.find(item=>item.id===category)||VICTORY_OVERVIEW[0];
 const buttons=VICTORY_OVERVIEW.map(item=>'<button data-victory="'+item.id+'" aria-pressed="'+(item.id===entry.id)+'">'+item.name+'</button>').join('');
 openDialog('승리','다섯 가지 승리의 길',
 '<div class="victory-categories" role="group" aria-label="승리 조건 분류">'+buttons+'</div>'+
 '<section class="victory-overview" aria-live="polite"><span class="victory-status">기획 단계 · 승리 판정 미구현</span><h3>'+entry.title+'</h3><p>'+entry.summary+'</p><ul>'+entry.conditions.map(text=>'<li>'+text+'</li>').join('')+'</ul><p class="victory-note">'+entry.note+'</p></section>',true);
 $('overlay').querySelector('.modal').classList.add('victory-modal');
 $('modalBody').querySelectorAll('[data-victory]').forEach(button=>button.onclick=()=>{
  showVictoryOverview(button.dataset.victory);
  $('modalBody').querySelector('[data-victory="'+button.dataset.victory+'"]').focus();
 });
}
$('victoryNav').onclick=()=>{if(!motionBusy)showVictoryOverview()};
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

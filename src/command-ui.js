// Command deck: presentation and navigation only; gameplay rules stay in their modules.
function renderCommandUI(){
 $('civilizationName').textContent=state.civilizationName||(currentRace==='기본 종족'?'테라 문명':currentRace);
 document.querySelector('.layout').classList.toggle('galaxy-mode',view==='galaxy');
 document.querySelector('.layout').classList.toggle('system-mode',view==='system');
 $('galaxyNav').classList.toggle('active',view==='galaxy');
 $('galaxyNav').setAttribute('aria-current',view==='galaxy'?'page':'false');
 const panel=$('shipPanel');
 const hint=panel.querySelector(':scope > p');
 hint.textContent=colonizeMode?'항성 선택 · Esc 취소':scanMode?'탐사 대상 선택 · Esc 취소':moveMode?(view==='system'?'항로 선택 · Esc 취소':'목적지 선택 · Esc 취소'):'';
 hint.style.display=moveMode||scanMode||colonizeMode?'block':'none';
 panel.classList.toggle('has-selection',!!activeShip);
 $('scanBtn').classList.toggle('hide',!activeShip||isColonyShip(activeShip));
 $('colonizeBtn').classList.toggle('hide',!isColonyShip(activeShip));
 if(activeShip){
  const position=state.stars[state.ships[activeShip]];
  $('selectedShipInfo').innerHTML='<div class="ship-portrait"></div><div class="ship-readout"><b>'+safeText(shipName(activeShip))+'</b><small>'+safeText(position.name)+(civilianOperationsBlocked(state,position.id)?' · 적대 함대 주둔':'')+'</small><span>행동력 <strong>'+state.ap[activeShip]+' / 2</strong></span></div>';
  const model=modelCanvas(isColonyShip(activeShip)?'colony':'ship',35);
  if(model)$('selectedShipInfo').querySelector('.ship-portrait').append(model);
 }
}
$('galaxyNav').onclick=()=>{if(motionBusy)return;closeDialog();view='galaxy';clearShipSelection();render()};
$('researchNav').onclick=()=>showResearch();
$('fleetNav').onclick=()=>{if(!motionBusy)showFleetManager()};
// Victory overview reads the current campaign state.
const VICTORY_OVERVIEW=[
 {id:'score',name:'점수',title:'점수 승리',summary:'제한 턴이 끝났을 때 가장 높은 종합 점수를 확보합니다.',conditions:['초기 제한: 180턴','영토·인구·연구·유물·외교 성과를 종합','다른 승리가 달성되지 않아도 종료되는 최종 경쟁'],note:'점수 가중치와 동점 처리 방식은 추후 결정합니다.'},
 {id:'science',name:'과학',title:'고대의 신호'},
 {id:'prosperity',name:'번영',title:'개척 연방'},
 {id:'alliance',name:'연합',title:'은하 평의회',summary:'다른 문명의 지지를 확보해 외교적 승리를 달성합니다.',conditions:['교역·협정으로 외교 관계 형성','동맹과 은하 평의회를 통해 지지 확보'],note:'승리에 필요한 지지 조건·수치와 평의회 절차는 추후 기획합니다.'},
 {id:'domination',name:'패권',title:'정복'}
];
function victoryCivilizations(game){
 return ['player',...[...new Set([
  ...game.stars.map(systemOwner),...Object.keys(game.military?.researchByOwner??{}),...(game.scienceProjects??[]).map(project=>project.owner),
  ...(game.military?.fleets??[]).map(fleet=>fleet.owner),...(game.military?.hostilities??[]).flat()
 ])].filter(owner=>owner&&owner!=='player'&&!isAnomalyFaction(owner)).sort()];
}
function victoryCivilizationName(game,owner){
 return owner==='player'?(game.civilizationName||$('civilizationName').textContent||'테라 문명'):owner;
}
function dominationVictoryMarkup(game){
 const owned=new Map();
 for(const star of game.stars){
  const owner=systemOwner(star);
  owned.set(owner,(owned.get(owner)??0)+1);
 }
 const total=game.stars.length,colors=['#efa991','#a9daee','#ad9be0','#83c7a6','#cfad7a'];
 const owners=[...victoryCivilizations(game),null];
 let offset=0;
 const slices=owners.map((owner,index)=>{
  const count=owned.get(owner)??0,percent=count/total*100,start=offset;
  offset+=percent;
  const color=owner===null?'#3c4b5c':owner==='player'?'#e8ca8e':colors[(index-1)%colors.length];
  return {count,start,end:offset,percent,color,name:owner===null?'미개척':victoryCivilizationName(game,owner)};
 });
 const gradient=slices.filter(slice=>slice.count).map(slice=>slice.color+' '+slice.start+'% '+slice.end+'%').join(',');
 const rows=slices.map(slice=>`<li><i style="background:${slice.color}" aria-hidden="true"></i><span>${safeText(slice.name)}</span><b>${slice.count} / ${total} · ${slice.percent.toLocaleString('ko-KR',{maximumFractionDigits:1})}%</b></li>`).join('');
 return `<span class="victory-status">성계 지배율</span><h3>정복</h3><div class="victory-territory">
  <div class="victory-donut" style="--territory:conic-gradient(${gradient})" aria-hidden="true"><b>${total}<small>전체 성계</small></b></div>
  <ul class="victory-territory-list">${rows}</ul></div>
  <details class="victory-note"><summary>판정 기준</summary><p>경쟁 문명의 수도 점령 또는 항복. 지배율 기준과 군사 연구 조건은 미정입니다.</p></details>`;
}
function victoryProgressTable(headers,rows){
 return '<div class="victory-table-wrap"><table class="victory-table"><thead><tr>'+headers.map(label=>'<th scope="col">'+label+'</th>').join('')+
 '</tr></thead><tbody>'+rows.map(([name,...values])=>'<tr><th scope="row">'+safeText(name)+'</th>'+values.map(value=>'<td>'+safeText(value)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
}
function scienceVictoryMarkup(game,entry){
 const goal=DATA.exploration.relics.scienceGoal;
 const victory=game.scienceProjects?.filter(project=>project.completedTurn!==undefined)??[];
 const project=scienceProjectFor(game,'player');
 const rows=victoryCivilizations(game).map(owner=>{
  const active=scienceProjectFor(game,owner);
  const status=active?.completedTurn!==undefined?'승리 · '+active.completedTurn+'턴':
   !victory.length&&active?active.planetName+' · '+(active.total-active.progress)+'턴 남음':'—';
  return [victoryCivilizationName(game,owner),scienceProjectSurveyCount(game,owner)+' / '+goal,status];
 });
 const siteLinks=game.stars.filter(star=>systemOwner(star)==='player'&&star.planets.some(planet=>planet.type==='hab')).map(star=>
  '<button class="victory-site" data-victory-site="'+star.id+'">'+safeText(star.name)+'</button>').join('');
 const blocked=scienceProjectBlock(game,'player');
 const build=project&&!victory.length?
  '<div class="victory-goal"><button data-victory-site="'+project.systemId+'">'+safeText(project.planetName)+' 궤도 →</button>'+scienceProjectProgressMarkup(project)+'</div>':
  victory.length?'':
  '<p>'+resourceAmountsMarkup(SCIENCE_PROJECT.cost)+' · '+SCIENCE_PROJECT.turns+'턴</p>'+
  '<details class="victory-note"><summary>건설 위치 보기</summary><p>개척선을 선택하고 거주 가능 행성을 우클릭하세요.</p>'+
  '<div class="victory-sites">'+(siteLinks||'<p>소유한 거주 가능 행성 없음</p>')+'</div></details>';
 const effects=(game.relicSites??[]).map(id=>game.stars[id]).filter(star=>star.relic.firstOwner==='player').map(star=>{
  const definition=relicDefinition(star);
  return '<li>'+safeText(definition.name)+' · '+safeText(relicEffectText(definition))+'</li>';
 }).join('');
 const status=victory.length?victory.map(result=>victoryCivilizationName(game,result.owner)).join(', ')+' · 과학 승리':blocked||'착공 가능';
 return '<span class="victory-status">'+safeText(status)+'</span><h3>'+entry.title+'</h3>'+build+
 victoryProgressTable(['문명','유물 조사 기록','최종 프로젝트'],rows)+
 '<details class="victory-note"><summary>내 유물 효과</summary>'+(effects?'<ul>'+effects+'</ul>':'<p>획득한 영구 효과 없음</p>')+'</details>'+
 '<details class="victory-note"><summary>판정 기준</summary><p>유적 '+goal+'곳 조사 · 고대의 신호 해독 · 소유 행성에서 완공.</p><p>착공 시 위치가 공개됩니다. 점령되면 공사가 취소되며 착공비는 반환하지 않습니다.</p></details>';
}
function scoreVictoryMarkup(game,entry,owner){
 const owners=victoryCivilizations(game);
 if(!owners.includes(owner))owner=owners[0];
 const factions=owners.map(id=>`<button class="victory-site" data-victory-civilization="${safeText(id)}" aria-pressed="${id===owner}"><span>${safeText(victoryCivilizationName(game,id))}</span><small>총점 미정</small><span aria-hidden="true">→</span></button>`).join('');
 const territory=game.stars.filter(star=>systemOwner(star)===owner);
 const population=owner==='player'?Math.floor(territory.reduce((total,star)=>total+star.planets.reduce((sum,planet)=>sum+(planet.habData?.pop??0),0),0)):'—';
 const research=owner==='player'?game.research:game.military?.researchByOwner?.[owner];
 return '<span class="victory-status">점수 산식 미정</span><h3>'+entry.title+'</h3>'+
 '<div class="victory-sites">'+factions+'</div><h4 class="victory-comparison-title">'+safeText(victoryCivilizationName(game,owner))+' · 현황</h4>'+
 victoryProgressTable(['항목','수치'],[['영토',territory.length],['인구',population],['완료 연구',research?.completed?.length??'—'],['유물','—'],['외교','—']])+
 '<details class="victory-note"><summary>판정 기준</summary><p>'+entry.summary+'</p><p>'+entry.conditions[0]+' · '+entry.note+'</p></details>';
}
function prosperityVictoryMarkup(game){
 const {researched,count,turns}=gatewayProgress(game,'player');
 const {victoryCount,victoryTurns}=GATEWAY_BALANCE;
 const winner=game.prosperity?.winner;
 const eligible=researched&&count>=victoryCount;
 const status=winner
  ?(winner.owner==='player'?'번영 승리 달성':safeText(winner.owner)+' · 번영 승리')+' · '+winner.turn+'턴'
  :!researched?'연구 필요':!eligible?'관문 '+(victoryCount-count)+'개 필요':'유지 중 · '+Math.max(0,victoryTurns-turns)+'턴 남음';
 const meter=(label,value,max,caption)=>`<li class="victory-goal"><div><b>${label}</b><small>${caption}</small></div><strong>${value} / ${max}</strong><progress aria-label="${label}" value="${Math.min(value,max)}" max="${max}"></progress></li>`;
 const sites=game.stars.filter(star=>star.gatewaySite&&systemOwner(star)==='player');
 const factionRows=victoryCivilizations(game).map(owner=>{
  const {count,turns}=gatewayProgress(game,owner);
  const claimed=game.stars.filter(star=>star.gatewaySite&&systemOwner(star)===owner).length;
  return [victoryCivilizationName(game,owner),claimed+' / '+GATEWAY_BALANCE.siteCount,String(count),Math.min(count,victoryCount)+' / '+victoryCount,Math.min(turns,victoryTurns)+' / '+victoryTurns];
 });
 const siteRows=sites.map(star=>{
  const job=star.gateway;
  const condition=job?(job.remaining===0?'가동 중':(job.builder?'건설 중':'공사 중단')+' · '+job.remaining+'턴'):'후보지';
  return `<button class="victory-site" data-victory-site="${star.id}"><span>${safeText(star.name)}</span><small>${condition}</small><span aria-hidden="true">→</span></button>`;
 }).join('');
 return `<span class="victory-status">${status}</span><h3>개척 연방</h3>
 <ol class="victory-goals">
  <li class="victory-goal"><div><b>관문 공학</b><small>개척·건설 IV단계</small></div><strong>${researched?'✓ 완료':'미완료'}</strong></li>
  ${meter('가동 관문',count,victoryCount,'같은 문명이 소유한 완공 관문')}
  ${meter('연속 유지',turns,victoryTurns,'연구 완료와 가동 관문 '+victoryCount+'개 이상 보유')}
 </ol>
 <h4 class="victory-comparison-title">문명별 진행</h4>
 ${victoryProgressTable(['문명','보유 후보지','완공 관문','가동 목표','연속 턴'],factionRows)}
 <details class="victory-note"><summary>내 관문 성계 · ${sites.length}곳</summary><div class="victory-sites">${siteRows||'<p>소유 관문 성계 없음</p>'}</div></details>
 <details class="victory-note"><summary>판정 기준</summary><ul>
  <li>턴 종료에 한 번 계산합니다. 가동 관문이 ${victoryCount}개 미만이 되면 연속 턴이 초기화됩니다.</li>
  <li>중간 성계 소유권·항로 연결·봉쇄는 판정에서 제외합니다.</li>
 </ul></details>`;
}
function showVictoryOverview(category='prosperity',owner='player'){
 const entry=VICTORY_OVERVIEW.find(item=>item.id===category)||VICTORY_OVERVIEW[0];
 const buttons=VICTORY_OVERVIEW.map(item=>'<button data-victory="'+item.id+'" aria-pressed="'+(item.id===entry.id)+'">'+item.name+'</button>').join('');
 const overview=entry.id==='prosperity'?prosperityVictoryMarkup(state):
  entry.id==='domination'?dominationVictoryMarkup(state):entry.id==='science'?scienceVictoryMarkup(state,entry):entry.id==='score'?scoreVictoryMarkup(state,entry,owner):
  '<span class="victory-status">기획 단계</span><h3>'+entry.title+'</h3><ul>'+entry.conditions.map(text=>'<li>'+text+'</li>').join('')+
  '</ul><details class="victory-note"><summary>세부 조건</summary><p>'+entry.summary+'</p><p>'+entry.note+'</p></details>';
 openDialog('승리','',
 '<div class="victory-categories" role="group" aria-label="승리 조건 분류">'+buttons+'</div>'+
 '<section class="victory-overview" aria-live="polite">'+overview+'</section>',true);
 $('overlay').querySelector('.modal').classList.add('victory-modal');
 $('modalBody').querySelectorAll('[data-victory]').forEach(button=>button.onclick=()=>{
  showVictoryOverview(button.dataset.victory);
  $('modalBody').querySelector('[data-victory="'+button.dataset.victory+'"]').focus();
 });
 $('modalBody').querySelectorAll('[data-victory-site]').forEach(button=>button.onclick=()=>{
  if(motionBusy)return;
  closeDialog();systemOpen(Number(button.dataset.victorySite));
 });
 $('modalBody').querySelectorAll('[data-victory-civilization]').forEach(button=>button.onclick=()=>{
  const id=button.dataset.victoryCivilization;
  showVictoryOverview('score',id);
  [...$('modalBody').querySelectorAll('[data-victory-civilization]')].find(item=>item.dataset.victoryCivilization===id)?.focus();
 });
}
$('gatewayBtn').onclick=()=>showGateway();
$('victoryNav').onclick=()=>{if(!motionBusy)showVictoryOverview()};
$('notificationsBtn').onclick=()=>openDialog('알림','',[
 ...(state.scienceProjects??[]).filter(project=>project.owner!=='player'&&project.completedTurn===undefined).map(project=>
  '<p><b>과학 승리 경고</b> · '+safeText(victoryCivilizationName(state,project.owner))+' · '+safeText(project.planetName)+' · '+project.startedTurn+'턴 착공</p>'),
 ...Object.entries(state.missingScouts??{}).map(([ship,transit])=>{
  const yard=missingScoutReturnYard(state,transit);
  const eta=yard===undefined?'복귀 조선소 대기':Math.max(0,transit.returnTurn-state.turn)+'턴 · '+state.stars[yard].name;
  return '<p><b>'+safeText(shipName(ship))+' 실종</b> · '+safeText(eta)+'</p>';
 }),
 ...(state.prosperity?.warnings??[]).slice(-8).reverse().map(alert=>`<p><b>번영 승리 경고</b> · ${safeText(victoryCivilizationName(state,alert.owner))} · ${alert.turn}턴</p>`),
 ...state.records.filter(s=>s.includes('연구 완료')).map(s=>'<p>'+safeText(s)+'</p>')
 ].join('')||'<p>새 알림 없음</p>');
$('helpBtn').onclick=()=>openDialog('도움말','','<div class="empty-command-popup"></div>');
$('logBtn').onclick=()=>openDialog('진행 기록','턴 '+state.turn,
 '<ol class="command-log">'+state.records.map(record=>'<li>'+safeText(record)+'</li>').join('')+'</ol>',true);
function commandHabitablePlanets(){
 return state.stars.flatMap(s=>s.planets.map((p,index)=>({system:s,planet:p,index})))
  .filter(({system,planet})=>systemKnown(system.id)&&planet.type==='hab'&&targetSurveyed(system,planet));
}
$('planetsNav').onclick=()=>{
 const entries=commandHabitablePlanets();
 openDialog('거주 가능 행성','',
 entries.length?'<div class="command-planet-list">'+entries.map(({system,planet,index})=>
 '<button class="slotRow" data-system="'+system.id+'" data-planet="'+index+'">'+resourceIcon('habitable')+
 '<span><strong>'+safeText(planet.label||system.name)+'</strong><small>'+safeText(system.name)+' · '+(system.owned?'개척 완료':'미개척')+'</small></span><span>→</span></button>').join('')+'</div>':'<p class="muted">확인된 행성 없음</p>',true);
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

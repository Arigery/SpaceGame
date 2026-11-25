let fleetBattleTimer=null;
function warpStatusText(game,transit){
 if(!transit)return '긴급 워프 중';
 const turns=transit.returnTurn-game.turn;
 const requested=eligibleReturnYard(game,transit.destination,transit.owner);
 const yard=requested?game.stars[transit.destination]:game.stars[retreatDestinations(game,transit.origin,transit.owner,'warp')[0]?.id];
 const location=yard?(requested?'복귀':'대체 복귀')+' 조선소 · '+yard.name:'복귀 가능한 조선소 대기';
 return safeText('긴급 워프 중 · '+(turns>0?turns+'턴 후 · ':'')+location);
}
function battleRetreatMarkup(game,battle){
 const decision=battle.decision;
 const target=battle.groups.find(group=>group.id===decision.groupId)?.name??'참전 함대 전체';
 const modes=[['short','단거리 후퇴',DATA.combat.retreat.shortSeconds],['warp','긴급 워프',DATA.combat.retreat.warpSeconds]];
 const choices=modes.map(([mode,label,seconds])=>{
  const destinations=retreatDestinations(game,battle.order.to,'player',mode);
  const rows=destinations.map(({id,turns})=>`<button class="battle-destination" data-retreat-mode="${mode}" data-destination="${id}"><strong>${safeText(game.stars[id].name)}</strong><span>${turns?turns+'턴 후 복귀':'행동력 0'}</span></button>`).join('');
  return `<section class="battle-retreat-mode"><div class="battle-retreat-mode-title"><h3>${label}</h3><span>준비 ${seconds}초</span></div><div class="battle-destinations">${rows||'<p class="muted">목적지 없음</p>'}</div></section>`;
 }).join('');
 return `<div class="battle-retreat-heading"><h3>${safeText(target)} · 후퇴 목적지</h3><button id="cancelRetreat">취소</button></div><div class="battle-retreat-grid">${choices}</div>`;
}
function showFleetBattle(error='',game=state){
 clearTimeout(fleetBattleTimer);
 stopBattleScene();
 const battle=game.military.battle;
 if(!battle)return;
 const preview=game!==state;
 const decision=battle.decision;
 const choosing=decision?.kind==='destination';
 const initialPause=decision?.kind==='initial';
 const heading=`<div class="battle-heading"><div>${initialPause?`<span class="battle-pause-context">${game.military.phase==='ai'?'AI 턴 교전':'전투 시험 준비'}</span> `:''}<b id="battleClock"></b></div>${initialPause?'<button id="continueBattle" class="primary">전투 재개</button>':''}</div>`;
 const content=choosing?battleRetreatMarkup(game,battle):
  '<div class="battle-workspace"><div class="battle-field"><canvas id="battleCanvas" width="1200" height="600" aria-label="함대 이동 및 사격"></canvas><button id="battleZoomReset" title="휠로 확대·축소 · 클릭으로 화면 맞춤">화면 맞춤</button></div><div id="battleRoster" class="battle-roster" aria-label="참전 함대"></div></div>';
 const footer=preview?'<button id="exitCombatTest">시험 종료</button>':!tutorial?'<button id="saveBattle">전투 저장</button>':'';
 openDialog((preview?'개발용 전투 · ':'함대 교전 · ')+game.stars[battle.order.to].name,'',
  `<div class="fleet-battle">${heading}<div class="battle-overview" aria-label="양측 전력">${[true,false].map(friendly=>
   `<section class="battle-side ${friendly?'friendly':'hostile'}"><div class="battle-side-heading"><h3>${friendly?'아군':'적군'}</h3>${friendly&&!choosing?'<button data-retreat-group="">전체 후퇴</button>':''}</div><div id="${friendly?'battleFriendly':'battleHostile'}"></div></section>`).join('')}</div>${content}${error?'<p class="battle-error" role="alert">'+safeText(error)+'</p>':''}${footer?'<div class="battle-footer">'+footer+'</div>':''}</div>`,true);
 const modal=$('overlay').querySelector?.('.modal');
 modal?.classList.add('fleet-battle-modal');
 modalKind='fleet-battle';
 $('closeModal').hidden=true;
 lockEncounterUI(true);
 const run=fn=>{try{fn();if(!preview)dirty=true;showFleetBattle('',game)}catch(e){showFleetBattle(e.message,game)}};
 updateFleetBattleUI(battle,true);
 if($('continueBattle'))$('continueBattle').onclick=()=>run(()=>continueFleetBattle(game));
 if($('cancelRetreat'))$('cancelRetreat').onclick=()=>run(()=>cancelRetreatDecision(game));
 if($('saveBattle'))$('saveBattle').onclick=()=>{clearTimeout(fleetBattleTimer);stopBattleScene();showSlots('save');modalKind='battle-save'};
 if(preview)$('exitCombatTest').onclick=exitCombatTest;
 $('modalBody').querySelectorAll('[data-retreat-group]').forEach(el=>el.onclick=()=>run(()=>beginRetreatDecision(game,el.dataset.retreatGroup||null)));
 $('modalBody').querySelectorAll('[data-retreat-mode]').forEach(el=>el.onclick=()=>run(()=>confirmRetreatDecision(game,el.dataset.retreatMode,Number(el.dataset.destination))));
 if(!choosing)paintFleetBattleScene(battle.combat,null,!!decision);
 const firstControl=$('continueBattle')||$('cancelRetreat')||$('modalBody').querySelector?.('[data-retreat-group]:not(:disabled)');
 firstControl?.focus({preventScroll:true});
 if(!decision)queueFleetBattleTick(game,battle);
}
function battleUnitReadout(units){
 let engaged=0,destroyed=0,departed=0,shield=0,armor=0,maxShield=0,maxArmor=0;
 for(const unit of units){
  maxShield+=unit.assembly.shield;maxArmor+=unit.assembly.armor;
  if(combatUnitPresent(unit)){engaged++;shield+=unit.shield;armor+=unit.hp}
  else if(unit.hp<=0)destroyed++;
  else departed++;
 }
 return `<div class="battle-counts"><span>교전 <b>${engaged}척</b></span><span>격파 <b>${destroyed}척</b></span><span>이탈 <b>${departed}척</b></span></div>`+
  fleetDefenseMarkup(shield,armor,{shield:maxShield,armor:maxArmor});
}
function updateFleetBattleUI(battle,initial=false){
 const dt=DATA.combat.rules.stepSeconds,{combat}=battle;
 const unitById=new Map(combat.units.map(u=>[u.id,u]));
 const labels={destroyed:'격파',retreated:'후퇴 완료',missing:'긴급 워프로 이탈',active:'교전 중'};
 $('battleClock').textContent=(combat.tick*dt).toFixed(2)+'초'+(battle.decision?' · 일시정지':'');
 const groupReadout=g=>{
  const status=g.status==='retreating'?'후퇴 준비 '+Math.max(0,(g.retreat.readyTick-combat.tick)*dt).toFixed(2)+'초':labels[g.status];
  return `<small class="battle-group-status ${g.status==='retreating'?'preparing':''}">${status}</small>`+battleUnitReadout(g.shipIds.map(id=>unitById.get(id)));
 };
 for(const friendly of [true,false]){
  const groupEntries=battle.groups.map((group,index)=>({group,index})).filter(({group})=>(group.owner==='player')===friendly);
  $(friendly?'battleFriendly':'battleHostile').innerHTML=battleUnitReadout(groupEntries.flatMap(({group})=>group.shipIds.map(id=>unitById.get(id))));
 }
 const roster=$('battleRoster');
 if(roster&&battle.decision?.kind!=='destination'){
  if(initial)roster.innerHTML=[true,false].map(friendly=>{
   const rows=battle.groups.map((g,i)=>{
    if((g.owner==='player')!==friendly)return '';
    return `<article><div class="battle-group-heading"><b>${safeText(g.name)}</b>${friendly?`<button data-retreat-group="${safeText(g.id)}" aria-label="${safeText(g.name)} 후퇴">후퇴</button>`:''}</div><div data-battle-fleet-readout="${i}">${groupReadout(g)}</div></article>`;
   }).join('');
   return `<section class="${friendly?'friendly':'hostile'}"><h3>${friendly?'아군 함대':'적군 함대'}</h3>${rows}</section>`;
  }).join('');
  else roster.querySelectorAll?.('[data-battle-fleet-readout]').forEach(node=>{
   node.innerHTML=groupReadout(battle.groups[Number(node.dataset.battleFleetReadout)]);
  });
 }
 const active=new Set(battle.groups.filter(g=>g.owner==='player'&&g.status==='active').map(g=>g.id));
 $('modalBody').querySelectorAll('[data-retreat-group]').forEach(el=>{el.disabled=el.dataset.retreatGroup?!active.has(el.dataset.retreatGroup):!active.size});
}
function queueFleetBattleTick(game,battle){
 fleetBattleTimer=setTimeout(()=>{
  if((game!==state&&game!==combatPreview)||game.military.battle!==battle||modalKind!=='fleet-battle'||battle.decision)return;
  const previous=battleSceneSnapshot(battle.combat);
  const result=advanceFleetBattle(game);if(game===state)dirty=true;
  if(result){completeFleetBattleUI(result,game);return}
  paintFleetBattleScene(battle.combat,previous);
  updateFleetBattleUI(battle);queueFleetBattleTick(game,battle);
 },1000*DATA.combat.rules.stepSeconds/DATA.combat.retreat.playbackSpeed);
}
function completeFleetBattleUI(result,game=state){
 stopBattleScene();
 const preview=game!==state;
 const testMap=preview&&combatTestSession?.game===game;
 if(testMap&&game.military.phase==='ai'){
  if(resumeFleetTurn(game)===null){showFleetBattle('',game);return}
  completeCombatTestTurn(combatTestSession);
 }
 if(!preview){
  rec('함대 교전 종료 · '+game.stars[result.to].name);
  if(result.anomalyCleared?.owner==='player')rec('적대 세력 제거 · 연구력 +'+result.anomalyCleared.research);
  if(game.military.phase==='ai'){
   if(resumeFleetTurn(game)===null){showPendingEncounter();return}
   finishStrategicTurn();
  }else{if(result.capture)rec(captureMessage(game,result));restoreEncounterView();render()}
 }
 const labels={destroyed:'격파',retreated:'후퇴',missing:'긴급 워프로 이탈',active:'잔류'};
 const outcomes=result.combat.outcomes.map(s=>'<article><p>'+safeText(s.name)+' · '+safeText(s.owner)+' · '+labels[s.status]+(s.status==='destroyed'?'':' · 행동력 '+s.ap)+'</p>'+
  (s.status==='destroyed'?'':fleetDefenseMarkup(s.shield,s.hp,{shield:s.maxShield,armor:s.maxArmor}))+'</article>').join('');
 const retreats=result.combat.retreats.map(g=>'<p>'+safeText(g.name)+' → '+safeText(game.stars[g.destination].name)+'</p>').join('');
 const resultLabel={attacker:'공격 측 승리',defender:'방어 측 승리',draw:'무승부',peace:'교전 종료',stalemate:'교착으로 전투 종료'}[result.combat.winner];
 const totalLoss=result.combat.outcomes.filter(s=>s.status==='destroyed').length;
 openDialog('함대 교전 결과',resultLabel+' · '+result.combat.seconds+'초 · 격파 '+totalLoss+'척',
  (result.capture?'<p>'+safeText(captureMessage(game,result))+'</p>':'')+
  (result.anomalyCleared?.owner==='player'?'<p>적대 세력 제거 · '+resourceAmountMarkup('research','+'+result.anomalyCleared.research)+'</p>':'')+
  retreats+'<details><summary>함선별 교전 결과</summary>'+outcomes+'</details>'+(preview?'<button id="returnCombatTest">시험 지도</button> <button id="exitCombatTest">시험 종료</button>':'<button id="closeBattleReport">돌아가기</button>'),true);
 if(preview){$('closeModal').hidden=true;$('returnCombatTest').onclick=testMap?exitCombatTestBattle:exitCombatTest;$('exitCombatTest').onclick=exitCombatTest}
 else{$('closeBattleReport').onclick=closeDialog;$('closeBattleReport').focus()}
}

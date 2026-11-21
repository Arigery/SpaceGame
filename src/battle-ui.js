let fleetBattleTimer=null;
function warpStatusText(game,transit){
 if(!transit)return '긴급 워프 중';
 const turns=transit.returnTurn-game.turn;
 const requested=eligibleReturnYard(game,transit.destination,transit.owner);
 const yard=requested?game.stars[transit.destination]:game.stars[retreatDestinations(game,transit.origin,transit.owner,'warp')[0]?.id];
 const location=yard?(requested?'복귀':'대체 복귀')+' 조선소 · '+yard.name:'복귀 가능한 조선소 대기';
 return safeText('긴급 워프 중 · '+(turns>0?turns+'턴 후 · ':'')+location);
}
function showFleetBattle(error='',game=state){
 clearTimeout(fleetBattleTimer);
 stopBattleScene();
 const battle=game.military.battle;
 if(!battle)return;
 const preview=game!==state;
 const decision=battle.decision;
 const groupName=id=>battle.groups.find(g=>g.id===id)?.name??'참전 함대 전체';
 let controls='';
 if(decision?.kind==='destination'){
  const choices=['short','warp'].map(mode=>{
   const destinations=retreatDestinations(game,battle.order.to,'player',mode);
   const seconds=mode==='short'?DATA.combat.retreat.shortSeconds:DATA.combat.retreat.warpSeconds;
   const label=mode==='short'?'단거리 후퇴':'긴급 워프';
   return '<fieldset><legend>'+label+' · 준비 '+seconds+'초</legend>'+(destinations.map(d=>'<button data-retreat-mode="'+mode+'" data-destination="'+d.id+'">'+safeText(game.stars[d.id].name)+(d.turns?' 조선소 · '+d.turns+'턴 후 복귀':' · AP 0')+'</button>').join('')||'<p>선택 가능한 목적지가 없습니다.</p>')+'</fieldset>';
  }).join('');
  controls='<p>'+safeText(groupName(decision.groupId))+' 후퇴 목적지 선택 · 일시정지</p>'+choices+'<button id="cancelRetreat">취소</button>';
 }else{
  controls=(decision?'<p>'+ (game.military.phase==='ai'?'AI 턴 교전':'전투 시험 준비')+' · 후퇴 명령을 내리거나 전투를 계속하세요.</p><button id="continueBattle">계속 싸우기</button>':'')+
   '<button data-retreat-group="">전체 후퇴</button>'+battle.groups.filter(g=>g.owner==='player').map(g=>'<button data-retreat-group="'+safeText(g.id)+'">'+safeText(g.name)+' 후퇴</button>').join('');
 }
 openDialog((preview?'개발용 전투 · ':'함대 교전 · ')+game.stars[battle.order.to].name,'',
  '<div class="ship-designer fleet-battle"><div class="battle-heading"><b id="battleClock"></b><span>아군 <i class="battle-dot friendly"></i> 적군 <i class="battle-dot hostile"></i></span><div class="battle-camera-tools"><small>휠로 확대·축소</small> <button id="battleZoomReset">화면 맞춤</button></div></div><canvas id="battleCanvas" width="1200" height="600" aria-label="함대 이동 및 사격"></canvas><div class="battle-orders">'+controls+'</div><div id="battleRoster" class="battle-roster"></div>'+(error?'<p role="alert">'+safeText(error)+'</p>':'')+(preview?'<button id="exitCombatTest">시험 종료</button>':!tutorial?'<button id="saveBattle">전투 저장</button>':'')+'</div>',true);
 $('overlay').querySelector?.('.modal')?.classList.add('fleet-battle-modal');
 modalKind='fleet-battle';
 $('closeModal').hidden=true;
 lockEncounterUI(true);
 const run=fn=>{try{fn();if(!preview)dirty=true;showFleetBattle('',game)}catch(e){showFleetBattle(e.message,game)}};
 if($('continueBattle'))$('continueBattle').onclick=()=>run(()=>continueFleetBattle(game));
 if($('cancelRetreat'))$('cancelRetreat').onclick=()=>run(()=>cancelRetreatDecision(game));
 if($('saveBattle'))$('saveBattle').onclick=()=>{clearTimeout(fleetBattleTimer);stopBattleScene();showSlots('save');modalKind='battle-save'};
 if(preview)$('exitCombatTest').onclick=exitCombatTest;
 $('modalBody').querySelectorAll('[data-retreat-group]').forEach(el=>el.onclick=()=>run(()=>beginRetreatDecision(game,el.dataset.retreatGroup||null)));
 $('modalBody').querySelectorAll('[data-retreat-mode]').forEach(el=>el.onclick=()=>run(()=>confirmRetreatDecision(game,el.dataset.retreatMode,Number(el.dataset.destination))));
 updateFleetBattleUI(battle);
 paintFleetBattleScene(battle.combat,null,!!decision);
 const firstControl=$('continueBattle')||$('cancelRetreat')||$('modalBody').querySelector?.('[data-retreat-group]:not(:disabled)');
 firstControl?.focus();
 if(!decision)queueFleetBattleTick(game,battle);
}
function updateFleetBattleUI(battle){
 const dt=DATA.combat.rules.stepSeconds,{combat}=battle;
 const unitById=new Map(combat.units.map(u=>[u.id,u]));
 const labels={destroyed:'격파',retreated:'후퇴 완료',missing:'긴급 워프로 이탈',active:'교전 중'};
 $('battleClock').textContent=(combat.tick*dt).toFixed(2)+'초'+(battle.decision?' · 일시정지':'');
 const row=g=>{
  const members=g.shipIds.map(id=>unitById.get(id)),alive=members.filter(u=>u.hp>0);
  const hp=alive.reduce((n,u)=>n+u.hp,0),shield=alive.reduce((n,u)=>n+u.shield,0);
  const maxHp=members.reduce((n,u)=>n+u.assembly.armor,0),maxShield=members.reduce((n,u)=>n+u.assembly.shield,0);
  const status=g.status==='retreating'?'후퇴 준비 '+Math.max(0,(g.retreat.readyTick-combat.tick)*dt).toFixed(2)+'초':labels[g.status];
  return '<article><b>'+safeText(g.name)+'</b><small>'+safeText(g.owner)+' · '+status+'</small><span>생존 '+alive.length+'척 · 격파 '+(members.length-alive.length)+'척</span>'+fleetDefenseMarkup(shield,hp,{shield:maxShield,armor:maxHp})+'</article>';
 };
 $('battleRoster').innerHTML=['player','enemy'].map(side=>'<section aria-label="'+(side==='player'?'아군':'적군')+'">'+battle.groups.filter(g=>(g.owner==='player')===(side==='player')).map(row).join('')+'</section>').join('');
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
  if(game.military.phase==='ai'){
   if(resumeFleetTurn(game)===null){showPendingEncounter();return}
   finishStrategicTurn();
  }else{if(result.capture)rec(captureMessage(game,result));restoreEncounterView();render()}
 }
 const labels={destroyed:'격파',retreated:'후퇴',missing:'긴급 워프로 이탈',active:'잔류'};
 const outcomes=result.combat.outcomes.map(s=>'<article><p>'+safeText(s.name)+' · '+safeText(s.owner)+' · '+labels[s.status]+(s.status==='destroyed'?'':' · AP '+s.ap)+'</p>'+
  (s.status==='destroyed'?'':fleetDefenseMarkup(s.shield,s.hp,{shield:s.maxShield,armor:s.maxArmor}))+'</article>').join('');
 const retreats=result.combat.retreats.map(g=>'<p>'+safeText(g.name)+' → '+safeText(game.stars[g.destination].name)+'</p>').join('');
 const resultLabel={attacker:'공격 측 승리',defender:'방어 측 승리',draw:'무승부',peace:'교전 종료',stalemate:'교착으로 전투 종료'}[result.combat.winner];
 const totalLoss=result.combat.outcomes.filter(s=>s.status==='destroyed').length;
 openDialog('함대 교전 결과',resultLabel+' · '+result.combat.seconds+'초 · 격파 '+totalLoss+'척',
  (result.capture?'<p>'+safeText(captureMessage(game,result))+'</p>':'')+retreats+'<details><summary>함선별 교전 결과</summary>'+outcomes+'</details>'+(preview?'<button id="returnCombatTest">시험 지도로 돌아가기</button> <button id="exitCombatTest">시험 종료</button>':'<button id="closeBattleReport">돌아가기</button>'),true);
 if(preview){$('closeModal').hidden=true;$('returnCombatTest').onclick=testMap?exitCombatTestBattle:exitCombatTest;$('exitCombatTest').onclick=exitCombatTest}
 else{$('closeBattleReport').onclick=closeDialog;$('closeBattleReport').focus()}
}

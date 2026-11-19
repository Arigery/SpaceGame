function showShipyards(systemId=null,message=''){
 initializeShipDesigns(state);initializeShipyards(state);
 const owned=state.stars.filter(s=>s.owned),star=owned.find(s=>s.id===systemId)||owned[0];
 if(!star){openFleetWorkspace('조선소','소유 성계가 없습니다.',campaignFleetTabs('yards'),'');bindCampaignFleetTabs('yards');return}
 const y=star.shipyard,ready=y&&y.remaining===0;
 const cost=v=>Object.entries(v).map(([r,n])=>safeText(DATA.resources[r])+' '+Number(n.toFixed(3))).join(' · ');
 const fleets=state.military.fleets.filter(f=>f.owner==='player'&&f.systemId===star.id);
 const designs=state.shipDesigns.map(d=>({d,errors:designUnlockErrors(state,d),a:assembleShipDesign(d)}));
 let elapsed=0;
 const queue=(y?.queue||[]).map(j=>{elapsed+=j.remaining;return '<li>'+safeText(j.kind==='build'?j.name:'장갑 수리')+' · 작업 '+j.remaining+'/'+j.total+'턴 · 대기 포함 '+elapsed+'턴 · 비용 지불 완료</li>'}).join('');
 openFleetWorkspace('성계 조선소','성계별 순차 대기열 · 예약 시 비용 1회 지불 · 완공 다음 정산부터 유지비 발생',
 campaignFleetTabs('yards'),'<label>성계 <select id="yardSystem">'+owned.map(s=>'<option value="'+s.id+'"'+(s===star?' selected':'')+'>'+safeText(s.name)+'</option>').join('')+'</select></label><p>'+safeText(message)+'</p>'+(!y?'<p>조선소 건설: '+cost(DATA.combat.shipyards.cost)+' · '+DATA.combat.shipyards.buildTurns+'턴</p><button id="yardBuild">조선소 건설</button>':y.remaining?'<p>조선소 건설 중 · 남은 '+y.remaining+'턴</p>':'<h3>생산 및 수리 대기열</h3><ol>'+(queue||'<li>대기 작업 없음</li>')+'</ol><label>완공 후 배치 <select id="yardTarget"><option value="">예비 함선</option>'+fleets.map(f=>'<option value="'+f.id+'">'+safeText(f.name)+' · '+fleetPoints(state,f)+'/50</option>').join('')+'</select></label><p>지정 함대가 이동·해산했거나 정원이 부족하면 예비 함선으로 배치합니다.</p>'+'<div class="yard-designs">'+designs.map(({d,errors,a})=>'<fieldset><legend>'+safeText(d.name)+'</legend><p>'+cost(a.buildCost)+' · '+COMBAT_HULLS.get(d.hullId).buildTurns+'턴</p><p>유지비/턴: '+cost(a.upkeep)+'</p><small>'+safeText(errors.join(' ')||(!canPayMilitaryCost(state,a.buildCost)?'자원 부족':'건조 가능'))+'</small><button data-build-design="'+safeText(d.id)+'"'+(errors.length||!canPayMilitaryCost(state,a.buildCost)?' disabled':'')+'>건조 예약</button></fieldset>').join('')+'</div><h3>장갑 수리</h3>'+state.military.ships.filter(s=>s.owner==='player'&&s.systemId===star.id).map(s=>{const q=repairQuote(s);return '<p>'+safeText(s.name)+' · 장갑 '+s.hp.toFixed(1)+'/'+s.assembly.armor.toFixed(1)+' · '+(s.repairJobId?'수리 대기/진행 중':q.missing?cost(q.cost)+' · '+q.turns+'턴':'손상 없음')+' <button data-repair="'+s.id+'"'+(!q.missing||s.repairJobId?' disabled':'')+'>수리 예약</button></p>'}).join('')) );
 bindCampaignFleetTabs('yards');
 const action=fn=>{try{fn();dirty=true;showShipyards(star.id);render()}catch(e){showShipyards(star.id,e.message)}};
 $('yardSystem').onchange=e=>showShipyards(Number(e.target.value));
 if(!y)$('yardBuild').onclick=()=>action(()=>buildShipyard(state,star.id));
 if(ready){$('modalBody').querySelectorAll('[data-build-design]').forEach(el=>el.onclick=()=>action(()=>enqueueMilitaryBuild(state,star.id,el.dataset.buildDesign,$('yardTarget').value||null)));
 $('modalBody').querySelectorAll('[data-repair]').forEach(el=>el.onclick=()=>action(()=>enqueueMilitaryRepair(state,star.id,el.dataset.repair)));}
}

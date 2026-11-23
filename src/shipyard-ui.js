function shipyardArmorText(armor){return armor.toLocaleString('ko-KR',{maximumFractionDigits:2})}

function shipyardQueueMarkup(game,queue){
 let eta=0;
 return queue.map((job,index)=>{
  const {remaining,total}=job;
  eta+=remaining;
  const production=job.kind==='build';
  const fleet=game.military.fleets.find(f=>f.id===job.fleetId);
  const status=index?'대기 '+index:'진행 중';
  if(!production){
   const missing=repairRemainingArmor(job),damage=missing+job.restored;
   return `<li><b>${safeText(fleet?.name??job.name)}</b> · ${status} · 수리 ${remaining}턴${index?` · 대기 포함 ${eta}턴`:''}
    <div>장갑 회복 ${shipyardArmorText(job.restored)} / ${shipyardArmorText(damage)} · 남은 손상 ${shipyardArmorText(missing)}</div>
    <progress aria-label="함대 장갑 수리 진행률" value="${job.restored}" max="${damage}"></progress>
    <div>지불 비용 ${resourceAmountsMarkup(job.cost)}</div></li>`;
  }
  return `<li><b>${safeText(job.name+' · '+(fleet?fleet.name+' 증원':'독립 함대'))}</b> · ${status} · 남은 ${remaining}턴 / 전체 ${total}턴
    ${index?'':`<progress aria-label="작업 진행률" value="${total-remaining}" max="${total}"></progress>`}
    <div>지불 비용 ${resourceAmountsMarkup(job.assembly.buildCost)} <button data-cancel-build="${safeText(job.id)}">건조 취소 · 전액 환불</button></div></li>`;
 }).join('')||'<li>대기 작업 없음</li>';
}

function showFleetReinforcement(fleetId,message='',options={}){
 const {game=state,navigation=campaignFleetTabs('fleets'),bindNavigation=()=>bindCampaignFleetTabs('fleets'),
  onBack=()=>showFleetManager(),onChanged=()=>{dirty=true;render()}}=options;
 const fleet=ownedFleet(game,fleetId,'player');
 const linked=retreatDistances(game,fleet.systemId);
 const sources=game.stars.flatMap(star=>star.owned&&linked.has(star.id)?orbitalShipyards(star).filter(yard=>yard.remaining===0).map(yard=>({star,yard})):[]);
 const sourceOptions=sources.map(({star,yard},index)=>{
  const name=star.planets[yard.planetIndex]?.label??'성계 궤도';
  return `<option value="${index}">${safeText(star.name+' · '+name)}</option>`;
 }).join('');
 const designOptions=game.shipDesigns.filter(d=>!designUnlockErrors(game,d).length).map(d=>`<option value="${safeText(d.id)}">${safeText(d.name)}</option>`).join('');
 const alert=message?`<p role="alert">${safeText(message)}</p>`:'';
 const form=sources.length&&designOptions?`<div class="fleet-inline-actions"><label>조선소 <select id="reinforcementSource">${sourceOptions}</select></label>
  <label>설계 <select id="reinforcementDesign">${designOptions}</select></label>
  <label>수량 <input id="reinforcementCount" type="number" min="1" max="${DATA.combat.fleets.maxCapacity}" step="1" value="1"></label>
  <button id="reserveReinforcements">증원 예약</button></div><p id="reinforcementQuote" role="status"></p>`:
  `<p>${sources.length?'건조 가능한 설계 없음':'이용 가능한 조선소 없음'}</p>`;
 const capacity=fleetCapacity(game,fleet);
 openFleetWorkspace(fleet.name+' · 증원','',navigation,
  '<button id="reinforcementBack">← 함대 상세</button>'+alert+`<p>편제 규모 <b>${fleetCapacityText(capacity)}</b></p>`+fleetCapacityBar(capacity)+fleetReservationMarkup(game,fleet)+form);
 bindNavigation();
 $('reinforcementBack').onclick=onBack;
 if(!sources.length||!designOptions)return;
 const source=$('reinforcementSource'),design=$('reinforcementDesign'),count=$('reinforcementCount'),button=$('reserveReinforcements'),preview=$('reinforcementQuote');
 const request=()=>{
  const {star,yard}=sources[Number(source.value)];
  return [fleet.id,design.value,Number(count.value),star.id,yard.planetIndex];
 };
 const update=()=>{
  try{
   const quote=fleetReinforcementQuote(game,...request());
   const delay=quote.yard.productionQueue.reduce((n,job)=>n+job.remaining,0);
   button.disabled=!canPayMilitaryCost(game,quote.cost);
   preview.innerHTML=`${resourceAmountsMarkup(quote.cost)} · 편제 +${quote.reserved} · 건조 ${delay+quote.turns}턴${button.disabled?' · 자원 부족':''}`;
  }catch(error){preview.textContent=error.message;button.disabled=true}
 };
 source.onchange=design.onchange=count.oninput=update;update();
 button.onclick=()=>{
  try{enqueueFleetReinforcements(game,...request());onChanged();showFleetReinforcement(fleet.id,'예약 완료',options)}
  catch(error){showFleetReinforcement(fleet.id,error.message,options)}
 };
}

function bindYardFleetRepair(game,star,yard,fleet,action,onFleetChanged){
 const repairDelay=yard.repairQueue.reduce((n,job)=>n+job.remaining,0);
 const scheduled=fleetRepairScheduled(star,fleet.id),repair=fleetRepairQuote(game,fleet);
 $('yardFleetRepairQuote').innerHTML=scheduled?'함대 수리 예약됨':repair.missing?`총 장갑 손상 ${shipyardArmorText(repair.missing)} · 예약 비용 ${resourceAmountsMarkup(repair.cost)} · 수리 ${repair.turns}턴${repairDelay?` · 대기 포함 ${repairDelay+repair.turns}턴`:''}`:'수리할 장갑 손상 없음';
 $('yardFleetRepair').disabled=scheduled||!repair.missing||!canPayMilitaryCost(game,repair.cost);
 $('yardServiceFleet').onchange=e=>onFleetChanged(e.target.value);
 $('yardFleetRepair').onclick=()=>action(()=>enqueueFleetRepair(game,fleet.id,yard.planetIndex));
}

function showShipyards(systemId=null,message='',fleetId=null,anchor,options={}){
 const {game=state,navigation=campaignFleetTabs('yards'),bindNavigation=()=>bindCampaignFleetTabs('yards'),
  onChanged=()=>{dirty=true;render()}}=options;
 initializeShipDesigns(game);initializeShipyards(game);
 const owned=game.stars.filter(s=>s.owned),star=owned.find(s=>s.id===systemId)||owned[0];
 if(!star){openFleetWorkspace('조선소','소유 성계가 없습니다.',navigation,'');bindNavigation();return}
 const yards=orbitalShipyards(star);
 const anchors=star.planets.flatMap((p,index)=>p.type==='hab'?[index]:[]);
 if(yards.some(y=>y.planetIndex===null))anchors.push(null);
 const preferred=yards.find(y=>y.remaining===0)??yards[0];
 if(!anchors.includes(anchor))anchor=preferred?preferred.planetIndex:anchors[0];
 const yard=yards.find(y=>y.planetIndex===anchor),ready=yard?.remaining===0;
 const fleets=game.military.fleets.filter(f=>f.owner==='player'&&f.systemId===star.id);
 const fleet=fleets.find(f=>f.id===fleetId)||fleets[0];
 const designs=game.shipDesigns.map(d=>({d,errors:designUnlockErrors(game,d),a:assembleShipDesign(d)}));
 const location=`<label>성계 <select id="yardSystem">${owned.map(s=>`<option value="${s.id}"${s===star?' selected':''}>${safeText(s.name)}</option>`).join('')}</select></label>`;
 const orbitalOptions=anchors.map(index=>{
  const item=yards.find(y=>y.planetIndex===index),name=index===null?'성계 궤도':star.planets[index].label??'거주 가능 행성 '+(index+1);
  const status=item?(item.remaining?'건설 중':'조선소'):'건설 가능 위치';
  return `<option value="${index??'legacy'}"${index===anchor?' selected':''}>${safeText(name)} · ${status}</option>`;
 }).join('');
 const orbit=anchors.length?`<label>궤도 <select id="yardOrbit">${orbitalOptions}</select></label>`:'';
 const {cost,buildTurns,upkeep}=DATA.combat.shipyards;
 let content;
 if(anchor===undefined)content='<p>이 성계에 건설할 거주 가능 행성이 없습니다.</p>';
 else if(!yard){
  const blocked=shipyardConstructionBlock(game,star.id,anchor)||(!canPayMilitaryCost(game,cost)?'필요 자원이 부족합니다.':'');
  content=`<p>조선소 건설: ${resourceAmountsMarkup(cost)} · ${buildTurns}턴</p><p>완공 후 턴당 유지비 ${resourceAmountsMarkup(upkeep)}</p>
   <button id="yardBuild"${blocked?' disabled':''}>개척선으로 착공</button>${blocked?`<p class="muted">${safeText(blocked)}</p>`:''}`;
 }else if(!ready)content=`<p>조선소 건설 중 · 남은 ${yard.remaining}턴</p><progress aria-label="조선소 건설 진행률" value="${yard.total-yard.remaining}" max="${yard.total}"></progress>`;
 else{
  const production=designs.map(({d,errors,a})=>{
   const affordable=canPayMilitaryCost(game,a.buildCost);
   return `<fieldset><legend>${safeText(d.name)}</legend><p>${resourceAmountsMarkup(a.buildCost)} · ${COMBAT_HULLS.get(d.hullId).buildTurns}턴</p>
    <p>유지비/턴: ${resourceAmountsMarkup(a.upkeep)}</p><small>${safeText(errors.join(' ')||(affordable?'건조 가능':'자원 부족'))}</small>
    <button data-build-design="${safeText(d.id)}"${errors.length||!affordable?' disabled':''}>건조 예약</button></fieldset>`;
  }).join('');
  const service=fleet?`<label>수리 대상 <select id="yardServiceFleet">${fleets.map(f=>`<option value="${f.id}"${f===fleet?' selected':''}>${safeText(f.name)}</option>`).join('')}</select></label>`:'';
  const fleetRepair=fleet?'<div class="fleet-inline-actions"><span id="yardFleetRepairQuote" role="status"></span><button id="yardFleetRepair">함대 수리 예약</button></div>':'';
  content=`<p>턴당 조선소 유지비 ${resourceAmountsMarkup(upkeep)}</p>${service}
   <div class="yard-work-slots"><section><h3>생산</h3><ol>${shipyardQueueMarkup(game,yard.productionQueue)}</ol></section>
   <section><h3>수리</h3><ol>${shipyardQueueMarkup(game,yard.repairQueue)}</ol>${fleetRepair}</section></div>
   <h3>조선소 직접 건조</h3><p>완공된 함선은 이 성계에서 독립 함대로 배치됩니다.</p><div class="yard-designs">${production}</div>`;
 }
 const alert=message?`<p role="alert">${safeText(message)}</p>`:'';
 openFleetWorkspace('궤도 조선소','생산 1척과 함대 수리 1건을 동시에 진행합니다.',navigation,location+' '+orbit+alert+content);
 bindNavigation();
 const redraw=(notice='',target=fleet?.id)=>showShipyards(star.id,notice,target,anchor,options);
 const action=fn=>{try{fn();onChanged();redraw()}catch(e){redraw(e.message)}};
 $('yardSystem').onchange=e=>showShipyards(Number(e.target.value),'',null,undefined,options);
 if(anchors.length)$('yardOrbit').onchange=e=>showShipyards(star.id,'',fleet?.id,e.target.value==='legacy'?null:Number(e.target.value),options);
 if(anchor!==undefined&&!yard)$('yardBuild').onclick=()=>action(()=>buildShipyard(game,star.id,anchor));
 if(ready){
  if(fleet)bindYardFleetRepair(game,star,yard,fleet,action,id=>redraw('',id));
  $('modalBody').querySelectorAll('[data-build-design]').forEach(el=>el.onclick=()=>action(()=>enqueueMilitaryBuild(game,star.id,el.dataset.buildDesign,anchor)));
  $('modalBody').querySelectorAll('[data-cancel-build]').forEach(el=>el.onclick=()=>action(()=>cancelMilitaryBuild(game,star.id,anchor,el.dataset.cancelBuild)));
 }
}

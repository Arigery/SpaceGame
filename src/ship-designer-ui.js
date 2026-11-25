function showShipDesigner(selectedId=null,options={}){
 const book=options.book??state;
 const testing=!!options.book;
 const unlocked=id=>testing||militaryModuleUnlocked(book,id);
 initializeShipDesigns(book);
 let draft=JSON.parse(JSON.stringify(book.shipDesigns.find(d=>d.id===selectedId)||book.shipDesigns[0]));
 let drawn=false;
 function draw(message=''){
  const h=COMBAT_HULLS.get(draft.hullId),errors=validateShipDesign(draft);
  const fields=Object.entries(h.slots).map(([kind,count])=>{
   const label={reactor:'반응로',engine:'엔진',weapon:'무장',defense:'방어'}[kind];
   const available=DATA.combat.modules.filter(module=>module.kind===kind&&module.hullId===h.id);
   const rows=Array.from({length:count},(_,index)=>{
    const choices=available.map(m=>`<option value="${m.id}"${draft.slots[kind][index]===m.id?' selected':''}${unlocked(m.id)?'':' disabled'}>${safeText(m.name)}${unlocked(m.id)?'':' [연구 잠김]'} · ${kind==='reactor'?'공급 '+(m.stats.powerOutput||0):'소모 '+m.powerDraw}</option>`).join('');
    const empty=['weapon','defense'].includes(kind)?'<option value="">비움</option>':'';
    return `<label><span>${index+1}</span><select aria-label="${label} ${index+1}" data-kind="${kind}" data-slot="${index}">${empty}${choices}</select></label>`;
   }).join('');
   return `<fieldset><legend>${label} <small>${count}칸</small></legend>${rows}</fieldset>`;
  }).join('');
  const modules=Object.values(draft.slots).flat().map(id=>COMBAT_MODULES.get(id)).filter(Boolean);
  const drawPower=modules.reduce((n,m)=>n+m.powerDraw,0),supply=modules.reduce((n,m)=>n+(m.stats.powerOutput||0),0);
  let summary=`<div class="design-power${drawPower>supply?' over-budget':''}"><span>전력</span><b>${drawPower} / ${supply}</b>
   <progress aria-label="설계 전력 사용량" value="${Math.min(drawPower,supply)}" max="${supply||1}"></progress></div>`;
  if(!errors.length){
   const a=assembleShipDesign(draft);
   const weapons=a.weapons.map(w=>`<li>${{energy:'에너지',kinetic:'운동탄'}[w.damageType]} · 발당 ${w.damage.toFixed(2)} · ${w.secondsPerShot}초 · 사거리 ${w.range}</li>`).join('');
   summary+=fleetDefenseMarkup(a.shield,a.armor,a)+`<dl class="design-stats">
    <div><dt>회피</dt><dd>${(a.evasion*100).toFixed(0)}%</dd></div><div><dt>속도</dt><dd>${a.speed.toFixed(2)}</dd></div><div><dt>행동력</dt><dd>${a.strategicAP}</dd></div>
    <div><dt>건조비</dt><dd>${resourceAmountsMarkup(a.buildCost)}</dd></div><div><dt>유지비/턴</dt><dd>${resourceAmountsMarkup(a.upkeep)}</dd></div></dl>
    ${weapons?`<details class="design-weapon-detail"><summary>무장 상세</summary><ul>${weapons}</ul></details>`:''}`;
  }
  const designs=book.shipDesigns.map(d=>`<option value="${safeText(d.id)}"${d.id===draft.id?' selected':''}>${safeText(d.name)}${!testing&&designUnlockErrors(book,d).length?' [생산 잠김]':''}</option>`).join('');
  const hullLocked=!testing&&!militaryHullUnlocked(book,h.id);
  const content=`<div class="design-toolbar fleet-inline-actions"><label>저장된 설계 <select id="designPick">${designs}</select></label>
   <button id="designCopy">복제</button><label>이름 <input id="designName" maxlength="60" value="${safeText(draft.name)}"></label></div>
   <div class="design-workbench">
    <section class="design-readout" aria-label="조립 능력치"><div class="design-hull-insignia">${combatHullIcon(h.id)}<b>${safeText(h.name)}</b>${hullLocked?'<small>연구 잠김</small>':''}</div>
     ${summary}${errors.map(e=>'<p class="fleet-work-error">'+safeText(e)+'</p>').join('')}
    </section><div class="ship-module-grid" aria-label="모듈 슬롯">${fields}</div>
   </div>
   <div class="design-actions"><span role="status">${safeText(message)}</span><button id="designReset" title="이 함체의 기본 모듈로 복원">기본값</button>
    <button class="primary" id="designSave"${errors.length?' disabled':''}>설계 저장</button></div>`;
  openFleetWorkspace(testing?'전투 테스팅 · 함선 설계':'전투 함선 설계',testing?options.description:'',testing?options.navigation:campaignFleetTabs('designs'),content,drawn);
  drawn=true;
  if(testing)options.bindNavigation();else bindCampaignFleetTabs('designs');
  $('designPick').onchange=e=>showShipDesigner(e.target.value,options);
  $('designName').oninput=e=>{draft.name=e.target.value;const errors=validateShipDesign(draft);$('designSave').disabled=!!errors.length};
  $('modalBody').querySelectorAll('[data-kind]').forEach(el=>el.onchange=()=>{
   const {kind,slot}=el.dataset;
   draft.slots[kind][Number(slot)]=el.value||null;draw();
   $('modalBody').querySelector?.(`[data-kind="${kind}"][data-slot="${slot}"]`)?.focus({preventScroll:true});
  });
  $('designSave').onclick=()=>{try{saveShipDesign(book,draft);if(testing)options.onSaved();else dirty=true;draw(testing?'시험 설계에 반영했습니다.':'저장했습니다. 게임 저장 시 함께 보존됩니다.')}catch(e){draw(e.message)}};
  $('designCopy').onclick=()=>{let n=1;while(book.shipDesigns.some(d=>d.id==='custom_'+n))n++;draft.id='custom_'+n;draft.name=draft.name.slice(0,55)+' 복제';draw('복제본 · 저장 전')};
  $('designReset').onclick=()=>{const standard=DATA.combat.defaultDesigns.find(d=>d.hullId===draft.hullId);draft.slots=JSON.parse(JSON.stringify(standard.slots));draw('기본 구성 · 저장 전')};
 }
 draw();
}

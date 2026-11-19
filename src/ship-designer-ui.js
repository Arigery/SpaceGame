function showShipDesigner(selectedId=null,options={}){
 const book=options.book??state;
 const testing=!!options.book;
 const unlocked=id=>testing||militaryModuleUnlocked(book,id);
 initializeShipDesigns(book);
 let draft=JSON.parse(JSON.stringify(book.shipDesigns.find(d=>d.id===selectedId)||book.shipDesigns[0]));
 const money=values=>Object.entries(values).map(([r,n])=>safeText(DATA.resources[r]||r)+' '+Number(n.toFixed(3))).join(' · ');
 let drawn=false;
 function draw(message=''){
  const h=COMBAT_HULLS.get(draft.hullId),errors=validateShipDesign(draft);
  const fields=Object.entries(h.slots).map(([kind,count])=>'<fieldset><legend>'+({reactor:'반응로',engine:'엔진',weapon:'무장',defense:'방어'}[kind])+' · '+count+'칸</legend>'+Array.from({length:count},(_,i)=>'<label style="display:block;margin:8px 0">슬롯 '+(i+1)+' <select data-kind="'+kind+'" data-slot="'+i+'">'+(['weapon','defense'].includes(kind)?'<option value="">비움</option>':'')+DATA.combat.modules.filter(m=>m.kind===kind&&m.hullId===h.id).map(m=>'<option value="'+m.id+'"'+(draft.slots[kind][i]===m.id?' selected':'')+(unlocked(m.id)?'':' disabled')+'>'+safeText(m.name)+(unlocked(m.id)?'':' [연구 잠김]')+' · 전력 '+m.powerDraw+'</option>').join('')+'</select></label>').join('')+'</fieldset>').join('');
  const modules=Object.values(draft.slots).flat().map(id=>COMBAT_MODULES.get(id)).filter(Boolean);
  let summary='<p>전력 '+modules.reduce((n,m)=>n+m.powerDraw,0)+' / '+modules.reduce((n,m)=>n+(m.stats.powerOutput||0),0)+'</p>';
  if(!errors.length){
   const a=assembleShipDesign(draft);
   summary+='<p>장갑 '+a.armor.toFixed(1)+' · 보호막 '+a.shield.toFixed(1)+' · 회피 '+(a.evasion*100).toFixed(0)+'% · 속도 '+a.speed.toFixed(2)+'</p><p>전략 행동력 '+a.strategicAP+'</p><ul>'+a.weapons.map(w=>'<li>'+({energy:'에너지',kinetic:'운동탄'}[w.damageType])+' · 발당 '+w.damage.toFixed(2)+' · '+w.secondsPerShot+'초 · 사거리 '+w.range+'</li>').join('')+'</ul><p>건조 비용: '+money(a.buildCost)+'</p><p>턴당 유지비: '+money(a.upkeep)+'</p>';
  }
  const content='<label>저장된 설계 <select id="designPick">'+book.shipDesigns.map(d=>'<option value="'+safeText(d.id)+'"'+(d.id===draft.id?' selected':'')+'>'+safeText(d.name)+(!testing&&designUnlockErrors(book,d).length?' [생산 잠김]':'')+'</option>').join('')+'</select></label> <button id="designCopy">복제</button><p><label>설계 이름 <input id="designName" maxlength="60" value="'+safeText(draft.name)+'"></label></p><p>함체: '+safeText(h.name)+' · 해금 순서 '+h.unlockOrder+' · '+((testing||militaryHullUnlocked(book,h.id))?'해금 완료':'연구 잠김')+'</p><div class="ship-module-grid">'+fields+'</div><section aria-live="polite">'+summary+errors.map(e=>'<p style="color:#ffb4a8">'+safeText(e)+'</p>').join('')+'<p>'+safeText(message)+'</p></section><button id="designSave"'+(errors.length?' disabled':'')+'>설계 저장</button> <button id="designReset">표준 설계로 되돌리기</button>';
  openFleetWorkspace(testing?'전투 테스팅 · 함선 설계':'전투 함선 설계',testing?options.description:'설계 저장은 자원을 사용하지 않습니다. 생산은 조선소에서 진행합니다.',testing?options.navigation:campaignFleetTabs('designs'),content,drawn);
  drawn=true;
  if(testing)options.bindNavigation();else bindCampaignFleetTabs('designs');
  $('designPick').onchange=e=>showShipDesigner(e.target.value,options);
  $('designName').oninput=e=>{draft.name=e.target.value;const errors=validateShipDesign(draft);$('designSave').disabled=!!errors.length};
  $('modalBody').querySelectorAll('[data-kind]').forEach(el=>el.onchange=()=>{draft.slots[el.dataset.kind][Number(el.dataset.slot)]=el.value||null;draw()});
  $('designSave').onclick=()=>{try{saveShipDesign(book,draft);if(testing)options.onSaved();else dirty=true;draw(testing?'시험 설계에 반영했습니다.':'저장했습니다. 게임 저장 시 함께 보존됩니다.')}catch(e){draw(e.message)}};
  $('designCopy').onclick=()=>{let n=1;while(book.shipDesigns.some(d=>d.id==='custom_'+n))n++;draft.id='custom_'+n;draft.name=draft.name.slice(0,55)+' 복제';draw('이름과 모듈을 편집한 뒤 저장하세요.')};
  $('designReset').onclick=()=>{const standard=DATA.combat.defaultDesigns.find(d=>d.hullId===draft.hullId);draft.slots=JSON.parse(JSON.stringify(standard.slots));draw('표준 구성으로 변경했습니다. 저장하면 적용됩니다.')};
 }
 draw();
}

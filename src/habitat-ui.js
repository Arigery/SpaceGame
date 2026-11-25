let habIndex=0;
function currentHab(){return state.stars[sysId].planets[habIndex]}
function openHabitat(index){const s=state.stars[sysId],p=s.planets[index];if(!s.owned||p.type!=='hab')return;habIndex=index;habitat(p);view='habitat';render()}
function fmtHab(n){return (Math.round(n*10)/10).toFixed(1)}
function habitatOverview(h,effects,wonder){
 const {production,inputs}=habProduction(h,effects,wonder),cons=habConsume(h),upkeep=habUpkeep(h,wonder);
 const resources=Object.fromEntries(HAB_RESOURCES.map(r=>{
  const population=cons[r]*shortageConsumptionRate(effects,r,'population');
  const maintenance=upkeep[r]*shortageConsumptionRate(effects,r,'building');
  const input=(inputs[r]??0)*shortageConsumptionRate(effects,r,'manufacturing');
  return [r,{population,maintenance,input,output:production[r],net:production[r]-population-maintenance-input}];
 }));
 const power=habPower(h),job=h.construction;
 const remaining=job?Math.max(0,job.required-job.progress):0;
 return {resources,power,growth:habGrowth(h,effects),cap:habCap(h),free:habFree(h),
  nextWork:job?Math.min(remaining,power):null,turns:job&&power>0?Math.ceil(remaining/power):null};
}
function constructionButton(h,job,attrs,label){
 const disabled=h.construction||!job||!canAfford(job.cost);
 return `<button ${attrs} ${disabled?'disabled':''} title="${safeText(jobText(h,job))}">${label}</button>`;
}
function habRender(){
 $('habitatView').classList.toggle('surface-mode',!tutorial);
 const p=currentHab(),h=habitat(p),effects=shortageEffects(state);
 const wonder=ownedWonder(state.stars[sysId]);
 const overview=habitatOverview(h,effects,wonder);
 $('habTitle').textContent=p.label+' · 거주 가능 행성';
 renderHabitableTraits(p);
 $('habStats').innerHTML=[['인구',Math.floor(h.pop)+' / '+overview.cap],['인구 성장','+'+fmtHab(overview.growth)+'/턴'],['미배치',overview.free+'명'],['건설 생산력',fmtHab(overview.power)+'/턴']].map(([name,value])=>`<div class="hab-stat"><small>${name}</small><b>${value}</b></div>`).join('');
 const job=h.construction;
 const work=job?`<progress aria-label="건설 진행률" value="${job.progress}" max="${job.required}"></progress>`:'';
 const remaining=job?`${fmtHab(job.progress)} / ${job.required} · ${overview.turns??'—'}턴`:'';
 $('habConstruction').innerHTML=job?(tutorial?
  `<strong>${safeText(job.label)} 건설 중</strong><div>생산력 ${remaining}</div>${work}`:
  `<button type="button" class="surface-job-jump" aria-label="${safeText(job.label)} 공사 위치"><strong>${safeText(job.label)}</strong>${work}<span>${remaining}</span></button>`):'건설 대기';
 if(job&&!tutorial)$('habConstruction').firstElementChild.onclick=()=>{
  const lot=habConstructionLot(job);
  $('habitatView').querySelector(`[data-surface-lot="${lot}"]`)?.focus();
 };
 $('habEconomy').innerHTML=HAB_RESOURCES.map(r=>{
  const {output:a,population,maintenance,input,net}=overview.resources[r];
  const penalty=r==='consumer'?habPenalty():0;
  const tag=penalty>0?`<span class="hab-penalty" title="거주 가능 행성 수에 따른 인구 소비 증가">소비 +${fmtHab(penalty*100)}%</span>`:'';
  const breakdown=[['생산',a],['인구 소비',-population],['유지비',-maintenance],['생산 투입',-input]]
   .filter(([,amount])=>amount!==0)
   .map(([label,amount])=>`<div>${label} ${resourceAmountMarkup(r,(amount>0?'+':'')+fmtHab(amount))}</div>`).join('');
  const detailId='habResourceDetail-'+r;
  return `<div class="hab-resource" tabindex="0" aria-describedby="${detailId}"><div class="hab-resline"><span class="resource-label">${resourceIcon(r)}${resourceNames[r]}</span><b class="${net<0?'negative':net>0?'positive':''}">${net>=0?'+':''}${fmtHab(net)}/턴</b>${tutorial?tag:''}</div><div class="hab-breakdown" id="${detailId}">${breakdown||'변동 없음'}${tutorial?'':tag}</div></div>`;
 }).join('');
 $('habCommonInfo').textContent='설치 '+h.common.filter(Boolean).length+'/'+h.common.length;
 $('habCommon').innerHTML=h.common.map((b,i)=>{
  const t=b?HAB_COMMON_BY_ID.get(b.id):null,center=b?.id==='center',max=center?h.commonLevel:1;
  const title=b?(center?DATA.buildings.center.name:t.name):'빈 공용 슬롯 '+(i+1);
  const desc=b?(center?`최대 인구 +${h.commonLevel-1} · 배치 인구당 생산력 +1 · 식량/소비재/연구력 각 +5/턴 (고정)`:(t.effects?t.effects[b.level-1]:t.desc)):'주거 · 의료 · 행정 · 물류';
  const upgrade=b&&!center?constructionQuote(h,'commonUpgrade',i):null;
  return `<article class="hab-card ${b?'':'empty'}"><div class="hab-card-head"><b>${title}</b><small>${b?'Lv.'+b.level:'+'}</small></div><div class="hab-art ${b?'':'empty'}" aria-hidden="true">▥</div><div class="hab-card-desc">${desc}</div>
   ${b?`<div class="hab-build-meta"${center?'':' title="인구 배치 시 적용"'}>유지비/턴 ${resourceAmountsMarkup(buildingUpkeep(b))}</div><div class="hab-worker"><span>배치 ${b.workers||0}/${max}</span><div class="hab-wBtns"><button aria-label="배치 인원 감소" title="배치 해제" data-hcw="${i}" data-delta="-1" ${!b.workers?'disabled':''}>−</button><button aria-label="배치 인원 증가" title="인구 배치" data-hcw="${i}" data-delta="1" ${habFree(h)<1||b.workers>=max?'disabled':''}>+</button></div></div>`:''}
   ${upgrade?`<div class="hab-build-meta">확장: ${jobText(h,upgrade,resourceAmountsMarkup)}<br>확장 후 유지비/턴: ${resourceAmountsMarkup(t.upgrades[upgrade.target].upkeep)}</div>`:''}
   <div class="hab-card-actions">${b?(center?'<button disabled>기본 건물</button>':`${t.effects?constructionButton(h,upgrade,`data-hup="${i}"`,upgrade?'확장':'최대 단계'):''}<button data-hremove="${i}" ${job?'disabled':''}>철거</button>`):`<button class="primary" data-hadd="${i}" ${job?'disabled':''}>건설</button>`}</div></article>`;
 }).join('');
 $('habSpecial').innerHTML=h.special.map((b,i)=>{
  const upgrade=b?constructionQuote(h,'specialUpgrade',i):null;
  return `<article class="hab-card ${b?'':'empty'}"><div class="hab-card-head"><b>${b?SPECIAL_BY_ID.get(b.id).name:'빈 특화 슬롯 '+(i+1)}</b><small>${b?'Lv.'+b.level:'+'}</small></div><div class="hab-art ${b?'':'empty'}" aria-hidden="true">▥</div>
   ${b?`<div class="hab-build-meta" title="인구 배치 시 적용">유지비/턴 ${resourceAmountsMarkup(buildingUpkeep(b,true))}</div><div class="hab-worker"><span>배치 ${b.workers}/${b.level}</span><div class="hab-wBtns"><button aria-label="배치 인원 감소" title="배치 해제" data-hsw="${i}" data-delta="-1" ${!b.workers?'disabled':''}>−</button><button aria-label="배치 인원 증가" title="인구 배치" data-hsw="${i}" data-delta="1" ${habFree(h)<1||b.workers>=b.level?'disabled':''}>+</button></div></div>
   <div class="hab-sub-grid">${b.subs.map((v,j)=>{
    const sub=constructionQuote(h,'subfacility',i,null,j),tier=DATA.buildings.subfacility.slots[j];
    return `<button class="hab-sub" data-hsub="${i}" data-subindex="${j}" ${job||(!v&&!canAfford(sub?.cost))?'disabled':''}><span class="hab-sub-art">${tier.tier}티어 부속</span><span>${v?'설치됨':'＋ 설치'} · 생산 +${Math.round(tier.productionBonus*100)}%</span><small>${researchComplete(tier.researchId)?'연구 완료':RESEARCH_BY_ID.get(tier.researchId).name+' 연구 필요'}</small>${!v?`<small>${sub?jobText(h,sub,resourceAmountsMarkup):'연구 후 설치 가능'}</small>`:''}</button>`;
   }).join('')}</div>
   ${upgrade?`<div class="hab-build-meta">확장: ${jobText(h,upgrade,resourceAmountsMarkup)}</div>`:''}<div class="hab-card-actions"><button data-hsremove="${i}" ${job?'disabled':''}>철거</button>${constructionButton(h,upgrade,`class="primary" data-hsexpand="${i}"`,upgrade?'확장':'최대 Lv.'+HAB_BALANCE.specialMaxLevel)}</div>`:
   `<div class="hab-card-actions"><button class="primary" data-hsadd="${i}" ${job?'disabled':''}>건설</button></div>`}</article>`;
 }).join('');
 const expand=constructionQuote(h,'expansion');
 $('habExpandQuote').innerHTML=expand?'Lv.'+expand.target+' · '+jobText(h,expand,resourceAmountsMarkup):'최대 Lv.'+HAB_BALANCE.commonMaxLevel;
 $('habExpandCommon').title='최대 인구 +1 · 중심지 배치 한도 +1 · 최대 Lv.'+HAB_BALANCE.commonMaxLevel;
 $('habExpandCommon').disabled=!!job||!expand||!canAfford(expand.cost);
}
function chooseBuilding(title,opts,callback,categorized=false){
 modalKind='building';$('modalTitle').textContent=title;$('modalDesc').textContent='';
 const modal=$('overlay').querySelector('.modal');modal.classList.remove('wide');modal.classList.add('building-picker');
 modal.classList.toggle('common-building-picker',categorized);
 const body=$('modalBody');body.replaceChildren();
 const list=document.createElement('div');list.className='building-options';
 const categories=['일반','행정','물류'];
 const categoryOf=o=>['행정','물류'].includes(o.family)?o.family:'일반';
 const draw=category=>{
  const h=habitat(currentHab()),power=habPower(h),underConstruction=!!h.construction;
  list.replaceChildren();list.scrollTop=0;
  for(const o of opts.filter(o=>!categorized||categoryOf(o)===category)){
   const btn=document.createElement('button');btn.type='button';btn.className='building-option';btn.dataset.buildingId=o.id;
   btn.disabled=underConstruction||!canAfford(o.cost);
   const eta=power>0?Math.ceil(o.productionRequired/power):'—';
   const costs=Object.entries(o.cost).map(([resource,amount])=>
    `<span class="${canAfford({[resource]:amount})?'':'building-cost-unmet'}">${resourceAmountMarkup(resource,amount)}</span>`).join('');
   const operating=[
    ['유지비/턴',o.upkeep],['인구 1명당/턴',o.upkeepPerWorker],['생산품 1당 투입',o.inputsPerOutput]
   ].filter(([,amounts])=>amounts&&Object.keys(amounts).length)
    .map(([label,amounts])=>`<span>${label} ${resourceAmountsMarkup(amounts)}</span>`).join('');
   btn.innerHTML=`<span class="building-option-art" aria-hidden="true">${surfaceModel(o.id,o.family)}</span>
    <span class="building-option-copy">
     <strong>${safeText(o.name)}</strong><small>${safeText(o.desc||o.effects?.[0]||'')}</small>
     <span class="building-operations">${operating}</span>
    </span>
    <span class="building-option-footer">
     <span class="building-price" aria-label="건설 비용">${costs}</span>
     <span class="building-time" title="필요 생산력 ${o.productionRequired}">생산력 ${o.productionRequired} · ${eta}턴</span>
     <span class="building-option-action">${underConstruction?'건설 중':btn.disabled?'자원 부족':'착공'}</span>
    </span>`;
   if(o.image){
    const art=btn.querySelector('.building-option-art');
    const img=document.createElement('img');img.alt='';
    img.onload=()=>art.replaceChildren(img);img.src=o.image;
   }
   btn.onclick=()=>{if(callback(o)===false)return;closeDialog();render()};list.append(btn);
  }
 };
 if(categorized){
  const filters=document.createElement('div');filters.className='building-filters';filters.setAttribute('role','group');filters.setAttribute('aria-label','공용 건물 분류');
  for(const category of categories){
   const tab=document.createElement('button');tab.type='button';tab.textContent=category;tab.dataset.category=category;tab.setAttribute('aria-pressed',String(category==='일반'));
   tab.onclick=()=>{for(const other of filters.children)other.setAttribute('aria-pressed',String(other===tab));draw(category)};filters.append(tab);
  }
  body.append(filters);
 }
 body.append(list);draw('일반');showGameDialog();
}
$('habCommon').addEventListener('click',e=>{
 const button=e.target.closest('button');if(!button||button.disabled)return;
 const d=button.dataset,p=currentHab(),h=habitat(p);
 if(d.hcw!==undefined){
  const item=h.common[+d.hcw],v=Number(d.delta);if(!item)return;
  const max=item.id==='center'?h.commonLevel:1;
  if(v>0&&(habFree(h)<1||item.workers>=max)||v<0&&item.workers<=0)return;item.workers+=v;
 }else{
  if(h.construction)return;
  if(d.hadd!==undefined){chooseBuilding('공용 건물 건설',HAB_COMMON,choice=>startHabConstruction(p,'common',+d.hadd,choice.id),true);return}
  if(d.hup!==undefined){if(!startHabConstruction(p,'commonUpgrade',+d.hup))return}
  else if(d.hremove!==undefined){if(+d.hremove===0)return;h.common[+d.hremove]=null}
  else return;
 }
 dirty=true;render();
});
$('habSpecial').addEventListener('click',e=>{
 const button=e.target.closest('button,[data-hsub]');if(!button||button.disabled)return;
 const d=button.dataset,p=currentHab(),h=habitat(p);
 if(d.hsw!==undefined){
  const item=h.special[+d.hsw],v=Number(d.delta);if(!item)return;
  if(v>0&&(habFree(h)<1||item.workers>=item.level)||v<0&&item.workers<=0)return;item.workers+=v;
 }else{
  if(h.construction)return;
  if(d.hsadd!==undefined){chooseBuilding('특화 건물 건설',DATA.buildings.special,choice=>startHabConstruction(p,'special',+d.hsadd,choice.id));return}
  if(d.hsub!==undefined){
   const b=h.special[+d.hsub],j=+d.subindex;if(!b)return;
   if(b.subs[j])b.subs[j]=false;else if(!startHabConstruction(p,'subfacility',+d.hsub,null,j))return;
  }else if(d.hsexpand!==undefined){if(!startHabConstruction(p,'specialUpgrade',+d.hsexpand))return}
  else if(d.hsremove!==undefined)h.special[+d.hsremove]=null;
  else return;
 }
 dirty=true;render();
});
$('habExpandCommon').onclick=()=>{if(startHabConstruction(currentHab(),'expansion'))render()};

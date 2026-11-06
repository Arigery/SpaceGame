let habIndex=0;
function currentHab(){return state.stars[sysId].planets[habIndex]}
function openHabitat(index){const s=state.stars[sysId],p=s.planets[index];if(!s.owned||p.type!=='hab')return;habIndex=index;habitat(p);view='habitat';render()}
function fmtHab(n){return (Math.round(n*10)/10).toFixed(1)}
function constructionButton(h,job,attrs,label){
 const disabled=h.construction||!job||!canAfford(job.cost);
 return `<button ${attrs} ${disabled?'disabled':''} title="${safeText(jobText(h,job))}">${label}</button>`;
}
function habRender(){
 const p=currentHab(),h=habitat(p),prod=habProduce(h),cons=habConsume(h),upkeep=habUpkeep(h);
 $('habTitle').textContent=p.label+' · 거주 가능 행성';
 $('habSubtitle').textContent=`시작 인구: 모행성 ${HAB_BALANCE.initialPopulation}명 / 신규 개척 ${HAB_BALANCE.colonyPopulation}명 · 공용 ${h.common.length}칸 · 특화 ${h.special.length}칸`;
 $('habStats').innerHTML=[['인구',Math.floor(h.pop)+' / '+habCap(h)],['인구 성장','+'+fmtHab(habGrowth(h))+'/턴'],['배치 가능',habFree(h)+'명'],['생산력',habPower(h)+'/턴']].map(([name,value])=>`<div class="hab-stat"><small>${name}</small><b>${value}</b></div>`).join('');
 const job=h.construction;
 $('habConstruction').innerHTML=job?`<strong>${safeText(job.label)} 건설 중</strong><div>생산력 ${fmtHab(job.progress)} / ${job.required} · 남은 턴 ${Math.ceil((job.required-job.progress)/habPower(h))}턴</div><progress value="${job.progress}" max="${job.required}"></progress><small>착공 비용 지불 완료 · 인구/배치에 따라 기간 변경 · 완공 이후 턴부터 효과 정산</small>`:'진행 중인 공사 없음 · 행성당 1개 공사 · 선택 시 자원 비용을 지불합니다.';
 $('habEconomy').innerHTML=HAB_RESOURCES.map(r=>{
  const a=prod[r],b=cons[r]+upkeep[r],net=a-b,tag=r==='consumer'?`<span class="hab-penalty">디버프 +${fmtHab(habPenalty()*100)}%</span>`:'';
  return `<div class="hab-resource"><div class="hab-resline"><span>${resourceNames[r]}</span><b class="${net<0?'negative':net>0?'positive':''}">${net>=0?'+':''}${fmtHab(net)}/턴</b>${tag}</div><div class="hab-breakdown">생산 +${fmtHab(a)} · 인구 -${fmtHab(cons[r])} · 유지비 -${fmtHab(upkeep[r])}</div></div>`;
 }).join('');
 $('habCommonInfo').textContent='설치 '+h.common.filter(Boolean).length+'/'+h.common.length;
 $('habCommon').innerHTML=h.common.map((b,i)=>{
  const t=b?HAB_COMMON_BY_ID.get(b.id):null,center=b?.id==='center',max=center?h.commonLevel:1;
  const title=b?(center?DATA.buildings.center.name:t.name):'빈 공용 슬롯 '+(i+1);
  const desc=b?(center?`최대 인구 +${h.commonLevel-1} · 배치 인구당 생산력 +1 · 식량/소비재/연구력 각 +5/턴 (고정)`:(t.effects?t.effects[b.level-1]:t.desc)):'주거 · 의료 · 행정 · 물류';
  const upgrade=b&&!center?constructionQuote(h,'commonUpgrade',i):null;
  return `<article class="hab-card ${b?'':'empty'}"><div class="hab-card-head"><b>${title}</b><small>${b?'Lv.'+b.level:'+'}</small></div><div class="hab-art ${b?'':'empty'}">건물 이미지</div><div class="hab-card-desc">${desc}</div>
   ${b?`<div class="hab-build-meta">가동 유지비/턴: ${upkeepText(buildingUpkeep(b))}${!center?' · 미배치 시 미청구':''}</div><div class="hab-worker"><span>배치 ${b.workers||0}/${max}</span><div class="hab-wBtns"><button data-hcw="${i}" data-delta="-1" ${!b.workers?'disabled':''}>−</button><button data-hcw="${i}" data-delta="1" ${habFree(h)<1||b.workers>=max?'disabled':''}>+</button></div></div>`:''}
   ${upgrade?`<div class="hab-build-meta">확장: ${jobText(h,upgrade)}<br>확장 후 유지비/턴: ${upkeepText(t.upgrades[upgrade.target].upkeep)}</div>`:''}
   <div class="hab-card-actions">${b?(center?'<button disabled>기본 건물</button>':`${t.effects?constructionButton(h,upgrade,`data-hup="${i}"`,upgrade?'업그레이드':'최대 단계'):''}<button data-hremove="${i}" ${job?'disabled':''}>철거</button>`):`<button class="primary" data-hadd="${i}" ${job?'disabled':''}>건설</button>`}</div></article>`;
 }).join('');
 $('habSpecial').innerHTML=h.special.map((b,i)=>{
  const upgrade=b?constructionQuote(h,'specialUpgrade',i):null;
  return `<article class="hab-card ${b?'':'empty'}"><div class="hab-card-head"><b>${b?SPECIAL_BY_ID.get(b.id).name:'빈 특화 슬롯 '+(i+1)}</b><small>${b?'Lv.'+b.level:'+'}</small></div><div class="hab-art ${b?'':'empty'}">특화 건물 이미지</div>
   ${b?`<div class="hab-build-meta">가동 유지비/턴: ${upkeepText(buildingUpkeep(b,true))} · 미배치 시 미청구</div><div class="hab-worker"><span>배치 ${b.workers}/${b.level}</span><div class="hab-wBtns"><button data-hsw="${i}" data-delta="-1" ${!b.workers?'disabled':''}>−</button><button data-hsw="${i}" data-delta="1" ${habFree(h)<1||b.workers>=b.level?'disabled':''}>+</button></div></div>
   <div class="hab-sub-grid">${b.subs.map((v,j)=>{
    const sub=constructionQuote(h,'subfacility',i,null,j),tier=DATA.buildings.subfacility.slots[j];
    return `<button class="hab-sub" data-hsub="${i}" data-subindex="${j}" ${job||(!v&&!canAfford(sub?.cost))?'disabled':''}><span class="hab-sub-art">${tier.tier}티어 부속</span><span>${v?'설치됨':'＋ 설치'} · 생산 +${Math.round(tier.productionBonus*100)}%</span><small>${tier.researchStage} 연구 해금 예정 · 현재 시험 개방</small>${!v?`<small>${jobText(h,sub)}</small>`:''}</button>`;
   }).join('')}</div>
   ${upgrade?`<div class="hab-build-meta">확장: ${jobText(h,upgrade)}</div>`:''}<div class="hab-card-actions"><button data-hsremove="${i}" ${job?'disabled':''}>철거</button>${constructionButton(h,upgrade,`class="primary" data-hsexpand="${i}"`,upgrade?'개별 확장':'최대 Lv.'+HAB_BALANCE.specialMaxLevel)}</div>`:
   `<div class="hab-card-desc">6종 자원 중 하나를 선택해 생산</div><div class="hab-card-actions"><button class="primary" data-hsadd="${i}" ${job?'disabled':''}>건설</button></div>`}</article>`;
 }).join('');
 const expand=constructionQuote(h,'expansion');
 $('habExpandCommon').textContent=expand?'공용 구역 Lv.'+expand.target+' 확장 · '+jobText(h,expand):'최대 확장 (Lv.'+HAB_BALANCE.commonMaxLevel+')';
 $('habExpandCommon').disabled=!!job||!expand||!canAfford(expand.cost);
}
function chooseBuilding(title,opts,callback,categorized=false){
 modalKind='building';$('modalTitle').textContent=title;$('modalDesc').textContent='설치할 건물을 선택하세요.';
 const modal=$('overlay').querySelector('.modal');modal.classList.remove('wide');modal.classList.add('building-picker');
 modal.classList.toggle('common-building-picker',categorized);
 const body=$('modalBody');body.replaceChildren();
 const list=document.createElement('div');list.className='building-options';
 const categories=['일반','행정','물류'];
 const categoryOf=o=>['행정','물류'].includes(o.family)?o.family:'일반';
 const draw=category=>{
  list.replaceChildren();list.scrollTop=0;
  for(const o of opts.filter(o=>!categorized||categoryOf(o)===category)){
   const btn=document.createElement('button');btn.type='button';btn.className='slotRow building-option';btn.dataset.buildingId=o.id;
   const art=document.createElement('span');art.className='building-option-art';art.setAttribute('aria-hidden','true');
   const placeholder=document.createElement('span');placeholder.className='building-image-placeholder';placeholder.textContent='건물 이미지';art.append(placeholder);
   if(o.image){
    const img=document.createElement('img');img.alt='';img.src=o.image;
    img.onload=()=>{placeholder.hidden=true};img.onerror=()=>{img.remove();placeholder.hidden=false};art.append(img);
   }
   const copy=document.createElement('span');copy.className='building-option-copy';
   const strong=document.createElement('strong'),small=document.createElement('small');strong.textContent=o.name;small.textContent=o.desc||o.effects?.[0]||'';copy.append(strong,small);
   const terms=document.createElement('small');terms.className='building-price';terms.textContent=costText(o.cost)+' · 생산력 '+o.productionRequired+' · 예상 '+Math.ceil(o.productionRequired/habPower(habitat(currentHab())))+'턴 · 가동 유지비: '+upkeepText(o.upkeep);copy.append(terms);
   btn.disabled=!!habitat(currentHab()).construction||!canAfford(o.cost);
   const action=document.createElement('span');action.className='building-option-action';action.textContent=btn.disabled?'자원 부족 또는 공사 중':'착공';
   btn.append(art,copy,action);btn.onclick=()=>{if(callback(o)===false)return;closeDialog();render()};list.append(btn);
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
 body.append(list);draw('일반');$('overlay').classList.remove('hide');
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

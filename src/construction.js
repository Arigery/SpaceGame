// Balance values live in JSON. A job snapshots its price/work so later balancing
// does not reprice a paid job or overwrite a saved construction timer.
function canAfford(cost){
 return !!cost&&Object.entries(cost).every(([r,n])=>Number.isFinite(n)&&n>=0&&Number.isFinite(state.res[r])&&state.res[r]>=n);
}
function payConstruction(cost){
 if(!canAfford(cost))return false;
 for(const [r,n] of Object.entries(cost))state.res[r]=Math.round((state.res[r]-n)*10000)/10000;
 dirty=true;return true;
}
function constructionQuote(h,kind,index,id,subIndex){
 let def,spec,label,target;
 if(kind==='common'){
  if(!Number.isInteger(index)||index<1||index>=h.common.length||h.common[index])return null;
  def=HAB_COMMON_BY_ID.get(id);spec=def;label=def?.name;target=1;
 }else if(kind==='special'){
  if(!Number.isInteger(index)||index<0||index>=h.special.length||h.special[index])return null;
  def=SPECIAL_BY_ID.get(id);spec=def;label=def?.name;target=1;
 }else if(kind==='commonUpgrade'){
  const b=h.common[index];if(!b||b.id==='center')return null;
  def=HAB_COMMON_BY_ID.get(b.id);target=b.level+1;spec=def?.upgrades?.[target];id=b.id;label=def?.name+' Lv.'+target;
 }else if(kind==='specialUpgrade'){
  const b=h.special[index];if(!b)return null;target=b.level+1;
  if(target>HAB_BALANCE.specialMaxLevel)return null;
  spec=DATA.buildings.specialUpgrades[target];id=b.id;label=SPECIAL_BY_ID.get(id)?.name+' Lv.'+target;
 }else if(kind==='subfacility'){
  const b=h.special[index];if(!b||!Number.isInteger(subIndex)||subIndex<0||subIndex>=b.subs.length||b.subs[subIndex])return null;
  spec=DATA.buildings.subfacility;id=b.id;label=resourceNames[id]+' '+spec.slots[subIndex].tier+'티어 부속 시설';
 }else if(kind==='expansion'){
  target=h.commonLevel+1;if(target>HAB_BALANCE.commonMaxLevel)return null;
  const d=DATA.buildings.commonExpansion;
  spec={cost:{mineral:d.mineralPerTargetLevel*target,alloy:d.alloyPerAddedLevel*(target-1)},productionRequired:d.productionPerTargetLevel*target};label='공용 구역 Lv.'+target;
 }
 if(!spec?.cost||!(spec.productionRequired>0))return null;
 return {kind,index,id,subIndex,target,label,cost:{...spec.cost},required:spec.productionRequired,progress:0};
}
function startHabConstruction(p,kind,index,id,subIndex){
 if(p?.type!=='hab'||!state.stars.some(s=>s.owned&&s.planets.includes(p)))return false;
 const h=habitat(p);if(h.construction)return false;
 const job=constructionQuote(h,kind,index,id,subIndex);
 if(!job||!payConstruction(job.cost))return false;
 h.construction=job;rec(p.label+' · '+job.label+' 착공');return true;
}
function finishHabConstruction(h,job){
 if(job.kind==='common')h.common[job.index]={id:job.id,level:1,workers:0};
 else if(job.kind==='special')h.special[job.index]={id:job.id,level:1,workers:0,subs:Array(HAB_BALANCE.subSlots).fill(false)};
 else if(job.kind==='commonUpgrade')h.common[job.index].level=job.target;
 else if(job.kind==='specialUpgrade')h.special[job.index].level=job.target;
 else if(job.kind==='subfacility')h.special[job.index].subs[job.subIndex]=true;
 else if(job.kind==='expansion'){h.commonLevel=job.target;h.common[0].level=job.target}
 h.construction=null;
}
function startFacilityConstruction(p){
 const def=DATA.planets[p?.type];
 if(!def?.levels||p.construction||p.level>=def.maxLevel||!state.stars.some(s=>s.owned&&s.planets.includes(p)))return false;
 const target=p.level+1,spec=def.levels[target];if(!spec||!payConstruction(spec.cost))return false;
 p.construction={target,remaining:spec.constructionTurns,total:spec.constructionTurns,cost:{...spec.cost}};
 rec(p.label+' · '+def.facility+' Lv.'+target+' 착공');return true;
}
function buildingUpkeep(b,special=false){
 const def=b.id==='center'?DATA.buildings.center:special?SPECIAL_BY_ID.get(b.id):HAB_COMMON_BY_ID.get(b.id);
 return (!special&&def?.upgrades?.[b.level]?.upkeep)||def?.upkeep||{};
}
function habUpkeep(h){
 const out=Object.fromEntries(HAB_RESOURCES.map(r=>[r,0]));
 for(const [items,special] of [[h.common,false],[h.special,true]])for(const b of items){
  if(!b||(b.id!=='center'&&!(b.workers>0)))continue;
  for(const [r,n] of Object.entries(buildingUpkeep(b,special)))if(Number.isFinite(n))out[r]+=n;
 }
 return out;
}
function costText(cost){return Object.entries(cost||{}).map(([r,n])=>resourceNames[r]+' '+n).join(' · ')||'없음'}
function upkeepText(upkeep){return Object.entries(upkeep||{}).map(([r,n])=>resourceNames[r]+' '+(n===null?'미정':n)).join(' · ')||'없음'}
function jobText(h,job){
 if(!job)return '최대 단계';
 const power=habPower(h),remaining=Math.max(0,job.required-(job.progress||0));
 return costText(job.cost)+' · 생산력 '+job.required+' · 예상 '+(power>0?Math.ceil(remaining/power):'—')+'턴';
}
function normalizeSavedState(saved){
 if(!saved||!Array.isArray(saved.stars)||!saved.stars.length||!saved.ships||!saved.res)throw Error('저장 데이터가 올바르지 않습니다.');
 for(const r of HAB_RESOURCES)saved.res[r]=Math.max(0,Number(saved.res[r])||0);
 for(const s of saved.stars){
  if(!Array.isArray(s.planets))throw Error('행성 데이터가 올바르지 않습니다.');
  for(const p of s.planets)if(p.type==='hab'){
   // Do not reset an existing colony's population or paid jobs when loading v13.
   if(!p.habData&&s.owned)p.habData=newHabitat(s.id===0);
   if(p.habData)p.habData.construction??=null;
  }
 }
 saved.balanceVersion=DATA.balance.construction.balanceVersion;
 return saved;
}

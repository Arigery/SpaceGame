// 거주 가능 행성의 인구, 공용 건물, 특화 건물 관리
const HAB_RESOURCES=Object.keys(DATA.resources);
const HAB_COMMON=DATA.buildings.common;
const HAB_COMMON_BY_ID=new Map(HAB_COMMON.map(b=>[b.id,b]));
function newHabitat(isHome=false){return {pop:isHome?HAB_BALANCE.initialPopulation:HAB_BALANCE.colonyPopulation,progress:0,baseCap:HAB_BALANCE.baseCapacity,commonLevel:1,common:[{id:'center',level:1,workers:0},...Array(HAB_BALANCE.commonSlots-1).fill(null)],special:Array(HAB_BALANCE.specialSlots).fill(null),construction:null}}
function habitat(p){if(!p.habData)p.habData=newHabitat(state?.stars?.[0]?.planets.includes(p));return p.habData}
function habCount(){return state.stars.reduce((count,s)=>count+(s.owned?s.planets.filter(p=>p.type==='hab').length:0),0)}
function habPenalty(){const expected=Math.max(2,state.stars.length*HAB_BALANCE.expectedHabRatio/HAB_BALANCE.expectedPlanetsPerStar);return Math.min(HAB_BALANCE.penaltyMax,HAB_BALANCE.penaltyRate*Math.max(0,habCount()-1)/(expected-1))}
function habCap(h){return h.baseCap+researchModifier('capacity')+h.commonLevel-1+h.common.reduce((a,b)=>a+(b&&b.id==='house'&&b.workers>0?HAB_COMMON_BY_ID.get('house').capacityByLevel[b.level]:0),0)}
function habGrowth(h,effects=shortageEffects(state)){return (HAB_BALANCE.baseGrowth+h.common.reduce((a,b)=>a+(b&&b.id==='medical'&&b.workers>0?HAB_COMMON_BY_ID.get('medical').growthByLevel[b.level]:0),0))*habTraitMultiplier(h,'planet_growth_pct','population_growth')*Math.max(0,1-(effects.populationGrowth??0))}
function habAssigned(h){return h.common.reduce((a,b)=>a+(b?.workers||0),0)+h.special.reduce((a,b)=>a+(b?.workers||0),0)}
function habFree(h){return Math.max(0,Math.floor(h.pop)-habAssigned(h))}
function habPower(h){return (Math.floor(h.pop)+(h.common[0]?.workers||0))*habTraitMultiplier(h,'planet_construction_pct','construction')}
function habProduction(h,effects=shortageEffects(state)){
 const production=Object.fromEntries(HAB_RESOURCES.map(r=>[r,0])),inputs={};
 const outputRate=resource=>Math.max(0,1-(effects.buildingProduction??0)-(resource==='research'?(effects.researchProduction??0):0));
 // 개척 시 자동 설치되는 행성 중심지의 고정 생산. 구역 레벨·배치 인구와 무관하다.
 if(h.common[0]?.id==='center'){
  for(const [resource,amount] of Object.entries(DATA.buildings.center.production)){
   production[resource]+=amount*habTraitMultiplier(h,'planet_resource_production_pct',resource)*outputRate(resource);
  }
 }
 for(const b of h.special){
  if(!b)continue;
  const def=SPECIAL_BY_ID.get(b.id);
  const logistics=h.common.filter(c=>c?.workers>0&&c.id==='log_'+b.id)
   .reduce((sum,c)=>sum+HAB_COMMON_BY_ID.get(c.id).productionBonus+researchModifier('logistics'),0);
  const subBonus=b.subs.reduce((sum,installed,i)=>sum+(installed?DATA.buildings.subfacility.slots[i].productionBonus:0),0);
  const amount=b.workers*def.productionPerWorker*(1+subBonus+logistics)*
   habTraitMultiplier(h,'planet_resource_production_pct',b.id,researchModifier('specialProduction',b.id))*outputRate(b.id);
  production[b.id]+=amount;
  if(def.inputsPerOutput)for(const [resource,rate] of Object.entries(def.inputsPerOutput)){
   inputs[resource]=(inputs[resource]??0)+amount*rate;
  }
 }
 return {production,inputs};
}
function habConsume(h){const out={energy:0,mineral:0,food:Math.floor(h.pop)*HAB_BALANCE.foodPerPopulation,consumer:Math.floor(h.pop)*HAB_BALANCE.consumerPerPopulation*(1+habPenalty()),alloy:0,research:0};
 for(const r of ['food','consumer']){if(h.common.some(c=>c?.workers>0&&c.id==='admin_'+r))out[r]*=HAB_COMMON_BY_ID.get('admin_'+r).consumptionMultiplier}
 return out;
}

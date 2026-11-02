// 거주 가능 행성의 인구, 공용 건물, 특화 건물 관리
const HAB_RESOURCES=Object.keys(DATA.resources);
const HAB_COMMON=DATA.buildings.common;
const HAB_COMMON_BY_ID=new Map(HAB_COMMON.map(b=>[b.id,b]));
function newHabitat(){return {pop:HAB_BALANCE.initialPopulation,progress:0,baseCap:HAB_BALANCE.baseCapacity,commonLevel:1,common:[{id:'center',level:1,workers:0},...Array(HAB_BALANCE.commonSlots-1).fill(null)],special:Array(HAB_BALANCE.specialSlots).fill(null)}}
function habitat(p){if(!p.habData)p.habData=newHabitat();return p.habData}
function habCount(){return state.stars.reduce((count,s)=>count+(s.owned?s.planets.filter(p=>p.type==='hab').length:0),0)}
function habPenalty(){const expected=Math.max(2,state.stars.length*HAB_BALANCE.expectedHabRatio/HAB_BALANCE.expectedPlanetsPerStar);return Math.min(HAB_BALANCE.penaltyMax,HAB_BALANCE.penaltyRate*Math.max(0,habCount()-1)/(expected-1))}
function habCap(h){return h.baseCap+h.commonLevel-1+h.common.reduce((a,b)=>a+(b&&b.id==='house'&&b.workers>0?HAB_COMMON_BY_ID.get('house').capacityByLevel[b.level]:0),0)}
function habGrowth(h){return HAB_BALANCE.baseGrowth+h.common.reduce((a,b)=>a+(b&&b.id==='medical'&&b.workers>0?HAB_COMMON_BY_ID.get('medical').growthByLevel[b.level]:0),0)}
function habAssigned(h){return h.common.reduce((a,b)=>a+(b?.workers||0),0)+h.special.reduce((a,b)=>a+(b?.workers||0),0)}
function habFree(h){return Math.max(0,Math.floor(h.pop)-habAssigned(h))}
function habPower(h){return Math.floor(h.pop)+(h.common[0]?.workers||0)}
function habProduce(h){const out=Object.fromEntries(HAB_RESOURCES.map(r=>[r,0]));
 // 개척 시 자동 설치되는 행성 중심지의 고정 생산. 구역 레벨·배치 인구와 무관하다.
 if(h.common[0]?.id==='center'){for(const [r,amount] of Object.entries(DATA.buildings.center.production))out[r]+=amount}
 for(const b of h.special)if(b){const logi=h.common.filter(c=>c?.workers>0&&c.id==='log_'+b.id).reduce((sum,c)=>sum+HAB_COMMON_BY_ID.get(c.id).productionBonus,0);const def=SPECIAL_BY_ID.get(b.id);out[b.id]+=b.workers*def.productionPerWorker*(1+def.subfacilityBonus*b.subs.filter(Boolean).length+logi)}
 return out;
}
function habConsume(h){const out={energy:0,mineral:0,food:Math.floor(h.pop)*HAB_BALANCE.foodPerPopulation,consumer:Math.floor(h.pop)*HAB_BALANCE.consumerPerPopulation*(1+habPenalty()),alloy:0,research:0};
 for(const r of ['food','consumer']){if(h.common.some(c=>c?.workers>0&&c.id==='admin_'+r))out[r]*=HAB_COMMON_BY_ID.get('admin_'+r).consumptionMultiplier}
 return out;
}
